import { EventEmitter } from 'events';
import * as Sentry from '@sentry/node';
import { config } from './config.ts';
import fs from 'fs/promises';
import path from 'path';
import { createComponentLogger, logError, logWarn } from '../utils/logger.ts';
import { safeErrorMessage } from '../pipeline-core/utils/error-helpers.ts';
import { GitWorkflowManager } from './git-workflow-manager.ts';
import { jobRepository } from './job-repository.ts';
import { CONCURRENCY, RETRY } from './constants.ts';
import { isRetryable, classifyError } from '../pipeline-core/errors/error-classifier.ts';
import { toISOString } from '../utils/time-helpers.ts';
import { JOB_STATUS, TERMINAL_STATUSES, isValidJobStatus } from '#api/types/job-status.ts';
import type { JobStatus } from '#api/types/job-status.ts';

const logger = createComponentLogger('SidequestServer');
let sentryInitialized = false;

/**
 * Git workflow metadata for a job
 */
export interface JobGitMetadata {
  branchName: string | null;
  originalBranch: string | null;
  commitSha: string | null;
  prUrl: string | null;
  changedFiles: string[];
}

/**
 * Job structure used in-memory by SidequestServer
 */
export interface Job {
  id: string;
  status: JobStatus;
  data: Record<string, unknown>;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  error: { message: string; stack?: string; code?: string; cancelled?: boolean } | null;
  result: unknown;
  retryCount: number;
  retryPending?: boolean;
  pausedAt?: Date;
  resumedAt?: Date;
  git: JobGitMetadata;
}

/**
 * Job statistics returned by getStats()
 */
export interface JobStats {
  total: number;
  queued: number;
  active: number;
  completed: number;
  failed: number;
}

/**
 * Constructor options for SidequestServer
 */
export interface SidequestServerOptions {
  maxConcurrent?: number;
  maxRetries?: number;
  logDir?: string;
  autoStart?: boolean;
  gitWorkflowEnabled?: boolean;
  gitBranchPrefix?: string;
  gitBaseBranch?: string;
  gitDryRun?: boolean;
  jobType?: string;
  sentryDsn?: string;
}

interface JobActionResult {
  success: boolean;
  message: string;
  job?: Job;
}

/**
 * SidequestServer - Manages job execution with Sentry logging and optional Git workflow
 */
export class SidequestServer extends EventEmitter {
  jobs: Map<string, Job>;
  jobHistory: Job[];
  maxConcurrent: number;
  activeJobs: number;
  queue: string[];
  logDir: string;
  isRunning: boolean;
  maxRetries: number;
  gitWorkflowEnabled: boolean;
  gitBranchPrefix: string;
  gitBaseBranch: string;
  gitDryRun: boolean;
  jobType: string;
  gitWorkflowManager: GitWorkflowManager | undefined;
  private _dbReady: Promise<void>;

  constructor(options: SidequestServerOptions = {}) {
    super();
    this.jobs = new Map();
    this.jobHistory = [];
    this.maxConcurrent = options.maxConcurrent ?? CONCURRENCY.DEFAULT_MAX_JOBS;
    this.activeJobs = 0;
    this.queue = [];
    this.logDir = options.logDir || './logs';

    // Auto-start control: if false, jobs won't process until start() is called
    this.isRunning = options.autoStart !== false;

    // Retry configuration
    this.maxRetries = options.maxRetries ?? RETRY.MAX_ABSOLUTE_ATTEMPTS;

    // Git workflow options
    this.gitWorkflowEnabled = options.gitWorkflowEnabled ?? false;
    this.gitBranchPrefix = options.gitBranchPrefix || 'automated';
    this.gitBaseBranch = options.gitBaseBranch || 'main';
    this.gitDryRun = options.gitDryRun ?? false;
    this.jobType = options.jobType || 'job';

    // Initialize GitWorkflowManager if git workflow is enabled
    if (this.gitWorkflowEnabled) {
      this.gitWorkflowManager = new GitWorkflowManager({
        baseBranch: this.gitBaseBranch,
        branchPrefix: this.gitBranchPrefix,
        dryRun: this.gitDryRun
      });
    }

    // Initialize SQLite database for job persistence.
    // Graceful degradation: .catch() converts DB init failure to a resolved promise
    // so start() always succeeds. Jobs still run in-memory but won't persist to disk.
    this._dbReady = jobRepository.initialize()
      .then(() => {
        logger.info('Job history database initialized');
      })
      .catch((err) => {
        logError(logger, err, 'Failed to initialize database - jobs will not persist');
        Sentry.captureException(err, {
          tags: { component: 'database', event: 'init_failed' }
        });
      });

    // Initialize Sentry once per process
    if (!sentryInitialized) {
      Sentry.init({
        dsn: options.sentryDsn ?? config.sentryDsn,
        environment: config.nodeEnv,
        tracesSampleRate: 1.0,
      });
      sentryInitialized = true;
    }
  }

  createJob(jobId: string, jobData: Record<string, unknown>): Job {
    const job: Job = {
      id: jobId,
      status: JOB_STATUS.QUEUED,
      data: jobData,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      error: null,
      result: null,
      retryCount: 0,
      git: {
        branchName: null,
        originalBranch: null,
        commitSha: null,
        prUrl: null,
        changedFiles: []
      }
    };

    this.jobs.set(jobId, job);
    this.queue.push(jobId);

    // Persist to SQLite immediately so job is visible in dashboard
    try {
      this._persistJob(job);
    } catch {
      // Non-critical: job exists in-memory and will be persisted on next state change
    }

    Sentry.addBreadcrumb({
      category: 'job',
      message: `Job ${jobId} created`,
      level: 'info',
      data: { jobId, jobData },
    });

    this.emit('job:created', job);
    this.processQueue();

    return job;
  }

  async processQueue(): Promise<void> {
    if (this.isRunning === false) {
      return;
    }

    while (this.queue.length > 0 && this.activeJobs < this.maxConcurrent) {
      const jobId = this.queue.shift();
      if (!jobId) continue;
      const job = this.jobs.get(jobId);

      if (!job) continue;

      this.activeJobs++;
      this.executeJob(jobId).catch(error => {
        logError(logger, error, 'Error executing job', { jobId });
      });
    }
  }

  async executeJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return;
    }

    return await Sentry.startSpan({
      op: 'job.execute',
      name: `Execute Job: ${jobId}`,
    }, async () => {
      let branchCreated = false;

      try {
        this._prepareJobForExecution(job);
        branchCreated = await this._setupGitBranchIfEnabled(job);

        const result = await this.runJobHandler(job);
        await this._finalizeJobSuccess(job, result, branchCreated);

      } catch (error) {
        await this._finalizeJobFailure(job, error, branchCreated);

      } finally {
        this.activeJobs--;
        this.processQueue();
      }
    });
  }

  private _persistJob(job: Job): void {
    if (!job?.id) {
      logger.error({ job }, 'Cannot persist job without ID');
      return;
    }

    if (!isValidJobStatus(job.status)) {
      logger.error({ jobId: job.id, status: job.status }, 'Invalid job status, skipping persistence');
      return;
    }

    try {
      jobRepository.saveJob({
        id: job.id,
        pipelineId: this.jobType,
        status: job.status,
        createdAt: toISOString(job.createdAt),
        startedAt: toISOString(job.startedAt),
        completedAt: toISOString(job.completedAt),
        data: job.data,
        result: job.result,
        error: job.error,
        git: job.git
      });
    } catch (dbErr) {
      logError(logger, dbErr, 'Failed to persist job to database', { jobId: job.id, status: job.status });
      Sentry.captureException(dbErr, {
        tags: { jobId: job.id, operation: 'persist' }
      });
      throw dbErr;
    }
  }

  private _prepareJobForExecution(job: Job): void {
    job.status = JOB_STATUS.RUNNING;
    job.startedAt = new Date();
    job.retryPending = false;
    this.emit('job:started', job);
    try {
      this._persistJob(job);
    } catch {
      // Non-critical: will be persisted on completion/failure
    }

    Sentry.addBreadcrumb({
      category: 'job',
      message: `Job ${job.id} started`,
      level: 'info',
    });
  }

  private async _setupGitBranchIfEnabled(job: Job): Promise<boolean> {
    if (!this.gitWorkflowEnabled || !this.gitWorkflowManager || !job.data.repositoryPath) {
      return false;
    }

    try {
      const branchInfo = await this.gitWorkflowManager.createJobBranch(
        job.data.repositoryPath as string,
        {
          jobId: job.id,
          jobType: this.jobType,
          description: (job.data.description || job.data.repository) as string | undefined
        }
      );

      if (branchInfo?.branchName) {
        job.git.branchName = branchInfo.branchName;
        job.git.originalBranch = branchInfo.originalBranch;
        return true;
      }
    } catch (gitError) {
      logWarn(logger, gitError as Error, 'Failed to create branch, continuing without git workflow', { jobId: job.id });
    }

    return false;
  }

  private async _finalizeJobSuccess(job: Job, result: unknown, branchCreated: boolean): Promise<void> {
    job.status = JOB_STATUS.COMPLETED;
    job.completedAt = new Date();
    job.result = result;

    if (branchCreated && this.gitWorkflowEnabled) {
      try {
        await this._handleGitWorkflowSuccess(job);
      } catch (gitError) {
        logError(logger, gitError, 'Git workflow failed, but job completed successfully', { jobId: job.id });
        Sentry.captureException(gitError, {
          tags: { component: 'git-workflow', jobId: job.id }
        });
      }
    }

    this.emit('job:completed', job);
    this.jobHistory.push({ ...job });
    try {
      this._persistJob(job);
    } catch (dbErr) {
      logError(logger, dbErr, 'Failed to persist completed job', { jobId: job.id });
      Sentry.captureException(dbErr, {
        tags: { jobId: job.id, operation: 'persist_completed' }
      });
    }
    await this.logJobCompletion(job);

    Sentry.addBreadcrumb({
      category: 'job',
      message: `Job ${job.id} completed`,
      level: 'info',
    });
  }

  private async _finalizeJobFailure(job: Job, error: unknown, branchCreated: boolean): Promise<void> {
    const canRetry = isRetryable(error as Error) && job.retryCount < this.maxRetries;

    if (canRetry) {
      job.retryCount++;

      const classification = classifyError(error as Error);
      const retryDelay = classification?.suggestedDelay ?? RETRY.DEFAULT_DELAY_MS;

      logger.info({
        jobId: job.id,
        retryCount: job.retryCount,
        maxRetries: this.maxRetries,
        errorCode: (error as { code?: string })?.code,
        retryDelay
      }, 'Scheduling job retry');

      job.status = JOB_STATUS.QUEUED;
      job.startedAt = null;
      job.error = null;
      job.retryPending = true;

      this.emit('retry:created', job, {
        attempt: job.retryCount,
        maxAttempts: this.maxRetries,
        reason: classification?.reason,
        delay: retryDelay
      });

      try {
        this._persistJob(job);
      } catch {
        // Non-critical
      }

      const jobId = job.id;
      setTimeout(() => {
        if (!this.jobs.has(jobId)) {
          logger.warn({ jobId }, 'Job deleted during retry delay, skipping retry');
          return;
        }

        const currentJob = this.jobs.get(jobId)!;

        if (!currentJob.retryPending) {
          logger.warn({ jobId }, 'Retry already processed or cancelled, skipping');
          return;
        }

        if (currentJob.status !== JOB_STATUS.QUEUED) {
          logger.warn({ jobId, status: currentJob.status }, 'Job status changed during retry delay, skipping retry');
          currentJob.retryPending = false;
          return;
        }

        currentJob.retryPending = false;
        this.queue.push(jobId);
        this.processQueue();
      }, retryDelay);

      return;
    }

    // No retry - mark as failed
    job.status = JOB_STATUS.FAILED;
    job.completedAt = new Date();
    job.error = { message: safeErrorMessage(error) };

    if (branchCreated && this.gitWorkflowEnabled && this.gitWorkflowManager && job.git.branchName && job.git.originalBranch && typeof job.data.repositoryPath === 'string') {
      try {
        await this.gitWorkflowManager.cleanupBranch(
          job.data.repositoryPath,
          job.git.branchName,
          job.git.originalBranch
        );
        logger.info({ jobId: job.id, branchName: job.git.branchName }, 'Cleaned up branch after job failure');
      } catch (cleanupError) {
        logWarn(logger, cleanupError as Error, 'Failed to cleanup branch', { jobId: job.id });
      }
    }

    this.emit('job:failed', job, error);
    this.jobHistory.push({ ...job });
    try {
      this._persistJob(job);
    } catch {
      // Guard: already in catch block
    }

    Sentry.captureException(error, {
      tags: { jobId: job.id, jobType: this.jobType },
      contexts: {
        job: { id: job.id, data: job.data as Record<string, unknown>, startedAt: job.startedAt?.toISOString() ?? null }
      }
    });

    await this.logJobFailure(job, error as Error);
    logError(logger, error, 'Job failed', { jobId: job.id, jobData: job.data });
  }

  private async _handleGitWorkflowSuccess(job: Job): Promise<void> {
    if (!this.gitWorkflowManager) {
      logger.warn({ jobId: job.id }, 'Git workflow manager not initialized, skipping git workflow');
      return;
    }
    if (!job.git.branchName || !job.git.originalBranch) {
      logger.warn({ jobId: job.id }, 'Missing branch info, skipping git workflow');
      return;
    }

    const repositoryPath = job.data.repositoryPath;
    if (typeof repositoryPath !== 'string') {
      logger.warn({ jobId: job.id }, 'Missing repository path, skipping git workflow');
      return;
    }

    const hasChanges = await this.gitWorkflowManager.hasChanges(repositoryPath);
    if (!hasChanges) {
      logger.info({ jobId: job.id }, 'No changes to commit, cleaning up branch');

      await this.gitWorkflowManager.cleanupBranch(
        repositoryPath,
        job.git.branchName,
        job.git.originalBranch
      );

      return;
    }

    job.git.changedFiles = await this.gitWorkflowManager.getChangedFiles(repositoryPath);

    logger.info({
      jobId: job.id,
      filesChanged: job.git.changedFiles.length
    }, 'Changes detected, committing');

    const commitMessage = await this._generateCommitMessage(job);
    const commitContext = {
      message: commitMessage.title,
      description: commitMessage.body,
      jobId: job.id
    };

    job.git.commitSha = await this.gitWorkflowManager.commitChanges(
      repositoryPath,
      commitContext
    );

    const pushed = await this.gitWorkflowManager.pushBranch(
      repositoryPath,
      job.git.branchName
    );

    if (!pushed) {
      logger.warn({ jobId: job.id }, 'Failed to push branch, skipping PR creation');
      return;
    }

    const prContext = await this._generatePRContext(job, commitMessage);
    job.git.prUrl = await this.gitWorkflowManager.createPullRequest(
      repositoryPath,
      prContext
    );

    if (job.git.prUrl) {
      logger.info({
        jobId: job.id,
        prUrl: job.git.prUrl
      }, 'Pull request created');

      Sentry.addBreadcrumb({
        category: 'git',
        message: `Created PR: ${job.git.prUrl}`,
        level: 'info',
      });
    }
  }

  /**
   * Generate commit message for job
   * Override this method to customize commit messages
   */
  async _generateCommitMessage(job: Job): Promise<{ title: string; body: string }> {
    return {
      title: `${this.jobType}: automated changes from job ${job.id}`,
      body: `Automated changes generated by ${this.jobType} job.\n\nFiles changed: ${job.git.changedFiles.length}`
    };
  }

  /**
   * Generate PR context for job
   * Override this method to customize PR details
   */
  async _generatePRContext(job: Job, commitMessage?: { title: string; body: string }): Promise<{ branchName: string; title: string; body: string; labels: string[] }> {
    const msg = commitMessage ?? await this._generateCommitMessage(job);

    return {
      branchName: job.git.branchName ?? '',
      title: msg.title,
      body: [
        '## Automated Changes',
        '',
        msg.body,
        '',
        '### Job Details',
        `- **Job ID**: ${job.id}`,
        `- **Job Type**: ${this.jobType}`,
        `- **Files Changed**: ${job.git.changedFiles.length}`,
        '',
        '### Changed Files',
        ...job.git.changedFiles.map(f => `- \`${f}\``),
        '',
        '---',
        '',
        'Generated with [Claude Code](https://claude.com/claude-code)'
      ].join('\n'),
      labels: ['automated', this.jobType]
    };
  }

  /**
   * Override this method to define job execution logic
   */
  async runJobHandler(_job: Job): Promise<unknown> {
    throw new Error('runJobHandler must be implemented by subclass');
  }

  async start(): Promise<void> {
    await this._dbReady;
    this.isRunning = true;
    this.processQueue();
  }

  stop(): void {
    this.isRunning = false;
  }

  set handleJob(handler: (job: Job) => Promise<unknown>) {
    this.runJobHandler = handler;
  }

  private async _writeJobLog(job: Job, suffix: string, extra?: Record<string, unknown>): Promise<void> {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
      const sanitizedId = path.basename(job.id);
      const logPath = path.join(this.logDir, `${sanitizedId}${suffix}`);
      await fs.writeFile(logPath, JSON.stringify(extra ? { ...job, ...extra } : job, null, 2));
    } catch (writeError) {
      logError(logger, writeError, `Failed to write ${suffix} log file`, { jobId: job.id });
    }
  }

  async logJobCompletion(job: Job): Promise<void> {
    await this._writeJobLog(job, '.json');
  }

  async logJobFailure(job: Job, error: Error): Promise<void> {
    await this._writeJobLog(job, '.error.json', {
      error: { message: error.message, stack: error.stack }
    });
  }

  getJob(jobId: string): Job | undefined {
    return this.jobs.get(jobId);
  }

  getAllJobs(): Job[] {
    return Array.from(this.jobs.values());
  }

  getStats(): JobStats {
    return {
      total: this.jobs.size,
      queued: this.queue.length,
      active: this.activeJobs,
      completed: this.jobHistory.filter(j => j.status === JOB_STATUS.COMPLETED).length,
      failed: this.jobHistory.filter(j => j.status === JOB_STATUS.FAILED).length,
    };
  }

  private _executeJobAction(jobId: string, config: {
    action: string;
    statusGuard: (status: JobStatus) => boolean;
    guardMessage: (status: JobStatus) => string;
    mutate: (job: Job) => void;
    postAction?: () => void;
    logLevel?: 'info' | 'warning';
  }): JobActionResult {
    const job = this.jobs.get(jobId);
    if (!job) {
      return { success: false, message: `Job ${jobId} not found` };
    }
    if (config.statusGuard(job.status)) {
      return { success: false, message: config.guardMessage(job.status), job };
    }

    const previousStatus = job.status;

    if (job.status === JOB_STATUS.QUEUED) {
      const idx = this.queue.indexOf(jobId);
      if (idx > -1) this.queue.splice(idx, 1);
    }

    config.mutate(job);

    try { this._persistJob(job); } catch { /* Non-critical */ }

    this.emit(`job:${config.action}`, job);

    Sentry.addBreadcrumb({
      category: 'job',
      message: `Job ${jobId} ${config.action}`,
      level: config.logLevel ?? 'info',
      data: { jobId, previousStatus }
    });

    logger.info({ jobId, previousStatus }, `Job ${config.action}`);
    config.postAction?.();

    return { success: true, message: `Job ${jobId} ${config.action} successfully`, job };
  }

  cancelJob(jobId: string): JobActionResult {
    return this._executeJobAction(jobId, {
      action: 'cancelled',
      statusGuard: (s) => TERMINAL_STATUSES.includes(s),
      guardMessage: (s) => `Cannot cancel job with status '${s}'`,
      mutate: (job) => {
        job.status = JOB_STATUS.CANCELLED;
        job.completedAt = new Date();
        job.error = { message: 'Job cancelled by user', cancelled: true };
      },
      logLevel: 'warning'
    });
  }

  pauseJob(jobId: string): JobActionResult {
    return this._executeJobAction(jobId, {
      action: 'paused',
      statusGuard: (s) => TERMINAL_STATUSES.includes(s) || s === JOB_STATUS.PAUSED,
      guardMessage: (s) => `Cannot pause job with status '${s}'`,
      mutate: (job) => {
        job.status = JOB_STATUS.PAUSED;
        job.pausedAt = new Date();
      }
    });
  }

  resumeJob(jobId: string): JobActionResult {
    return this._executeJobAction(jobId, {
      action: 'resumed',
      statusGuard: (s) => s !== JOB_STATUS.PAUSED,
      guardMessage: (s) => `Cannot resume job with status '${s}'. Only paused jobs can be resumed.`,
      mutate: (job) => {
        job.status = JOB_STATUS.QUEUED;
        job.resumedAt = new Date();
        delete job.pausedAt;
        this.queue.push(job.id);
      },
      postAction: () => this.processQueue()
    });
  }
}

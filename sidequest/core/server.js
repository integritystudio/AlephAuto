import { EventEmitter } from 'events';
import * as Sentry from '@sentry/node';
import { config } from './config.js';
import fs from 'fs/promises';
import path from 'path';
import { createComponentLogger } from '../utils/logger.js';
import { safeErrorMessage } from '../pipeline-core/utils/error-helpers.js';
import { GitWorkflowManager } from './git-workflow-manager.js';
import { jobRepository } from './job-repository.js';
import { CONCURRENCY, RETRY } from './constants.js';
import { isRetryable, classifyError } from '../pipeline-core/errors/error-classifier.js';
import { toISOString } from '../utils/time-helpers.js';
import { JOB_STATUS, TERMINAL_STATUSES, isValidJobStatus } from '../../api/types/job-status.js';

const logger = createComponentLogger('SidequestServer');

/**
 * SidequestServer - Manages job execution with Sentry logging and optional Git workflow
 */
export class SidequestServer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.jobs = new Map();
    this.jobHistory = [];
    this.maxConcurrent = options.maxConcurrent ?? CONCURRENCY.DEFAULT_MAX_JOBS;
    this.activeJobs = 0;
    this.queue = [];
    this.logDir = options.logDir || './logs';

    // Auto-start control: if false, jobs won't process until start() is called
    // Defaults to true for production, tests can set false
    this.isRunning = options.autoStart !== false;

    // Retry configuration (T1 fix: allow override for tests)
    this.maxRetries = options.maxRetries ?? RETRY.MAX_ABSOLUTE_ATTEMPTS;

    // Git workflow options
    this.gitWorkflowEnabled = options.gitWorkflowEnabled ?? false;
    this.gitBranchPrefix = options.gitBranchPrefix || 'automated';
    this.gitBaseBranch = options.gitBaseBranch || 'main';
    this.gitDryRun = options.gitDryRun ?? false;
    this.jobType = options.jobType || 'job'; // Used for branch naming

    // Initialize GitWorkflowManager if git workflow is enabled
    if (this.gitWorkflowEnabled) {
      this.gitWorkflowManager = new GitWorkflowManager({
        baseBranch: this.gitBaseBranch,
        branchPrefix: this.gitBranchPrefix,
        dryRun: this.gitDryRun
      });
    }

    // Initialize SQLite database for job persistence
    // Note: initialize() is async but we handle it with .then()/.catch() since
    // constructors cannot be async. The database will be ready before first job executes.
    jobRepository.initialize()
      .then(() => {
        logger.info('Job history database initialized');
      })
      .catch((err) => {
        logger.error({ err }, 'Failed to initialize database - jobs will not persist');
        Sentry.captureException(err, {
          tags: { component: 'database', event: 'init_failed' }
        });
      });

    // Initialize Sentry
    Sentry.init({
      dsn: options.sentryDsn || config.sentryDsn,
      environment: config.nodeEnv,
      tracesSampleRate: 1.0,
    });
  }

  /**
   * Create a new job
   */
  createJob(jobId, jobData) {
    const job = {
      id: jobId,
      status: JOB_STATUS.QUEUED,
      data: jobData,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      error: null,
      result: null,
      retryCount: 0,
      // Git workflow metadata
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
    this._persistJob(job);

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

  /**
   * Process the job queue
   */
  async processQueue() {
    // Don't process if not running (allows tests to set handlers before jobs execute)
    if (this.isRunning === false) {
      return;
    }

    while (this.queue.length > 0 && this.activeJobs < this.maxConcurrent) {
      const jobId = this.queue.shift();
      const job = this.jobs.get(jobId);

      if (!job) continue;

      this.activeJobs++;
      this.executeJob(jobId).catch(error => {
        logger.error({ err: error, jobId }, 'Error executing job');
      });
    }
  }

  /**
   * Execute a job
   */
  /**
   * Execute a job with full lifecycle management
   *
   * Lifecycle:
   * 1. Prepare job (set status, persist, create git branch if enabled)
   * 2. Run the job handler
   * 3. Finalize (handle success/failure, git workflow, persist, cleanup)
   */
  async executeJob(jobId) {
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
        // Phase 1: Prepare
        this._prepareJobForExecution(job);
        branchCreated = await this._setupGitBranchIfEnabled(job);

        // Phase 2: Execute
        const result = await this.runJobHandler(job);

        // Phase 3: Finalize success
        await this._finalizeJobSuccess(job, result, branchCreated);

      } catch (error) {
        // Phase 3: Finalize failure
        await this._finalizeJobFailure(job, error, branchCreated);

      } finally {
        this.activeJobs--;
        this.processQueue();
      }
    });
  }

  /**
   * Persist job state to database
   * @private
   */
  _persistJob(job) {
    // Validate required fields to prevent database constraint violations
    if (!job?.id) {
      logger.error({ job }, 'Cannot persist job without ID');
      return;
    }

    if (!isValidJobStatus(job.status)) {
      logger.error({ jobId: job.id, status: job.status }, 'Invalid job status, skipping persistence');
      return;
    }

    try {
      // Use shared timestamp normalization utility
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
      logger.error({ err: dbErr, jobId: job.id }, 'Failed to persist job to database');
      Sentry.captureException(dbErr, {
        tags: { jobId: job.id, operation: 'persist' }
      });
    }
  }

  /**
   * Prepare job for execution - set initial state
   * @private
   */
  _prepareJobForExecution(job) {
    job.status = JOB_STATUS.RUNNING;
    job.startedAt = new Date();
    job.retryPending = false;  // H5 fix: clear retry pending flag on execution
    this.emit('job:started', job);
    this._persistJob(job);

    Sentry.addBreadcrumb({
      category: 'job',
      message: `Job ${job.id} started`,
      level: 'info',
    });
  }

  /**
   * Setup git branch if workflow is enabled
   * @private
   * @returns {Promise<boolean>} True if branch was created
   */
  async _setupGitBranchIfEnabled(job) {
    if (!this.gitWorkflowEnabled || !job.data.repositoryPath) {
      return false;
    }

    try {
      const branchInfo = await this.gitWorkflowManager.createJobBranch(
        job.data.repositoryPath,
        {
          jobId: job.id,
          jobType: this.jobType,
          description: job.data.description || job.data.repository
        }
      );

      if (branchInfo?.branchName) {
        job.git.branchName = branchInfo.branchName;
        job.git.originalBranch = branchInfo.originalBranch;
        return true;
      }
    } catch (gitError) {
      logger.warn({ err: gitError, jobId: job.id }, 'Failed to create branch, continuing without git workflow');
    }

    return false;
  }

  /**
   * Finalize successful job execution
   * @private
   */
  async _finalizeJobSuccess(job, result, branchCreated) {
    job.status = JOB_STATUS.COMPLETED;
    job.completedAt = new Date();
    job.result = result;

    // Git workflow: Commit, push, and create PR
    if (branchCreated && this.gitWorkflowEnabled) {
      try {
        await this._handleGitWorkflowSuccess(job);
      } catch (gitError) {
        logger.error({ err: gitError, jobId: job.id }, 'Git workflow failed, but job completed successfully');
        Sentry.captureException(gitError, {
          tags: { component: 'git-workflow', jobId: job.id }
        });
      }
    }

    this.emit('job:completed', job);
    this.jobHistory.push({ ...job });
    this._persistJob(job);
    await this.logJobCompletion(job);

    Sentry.addBreadcrumb({
      category: 'job',
      message: `Job ${job.id} completed`,
      level: 'info',
    });
  }

  /**
   * Finalize failed job execution
   *
   * Checks if error is retryable and retry count is below max.
   * If so, re-queues the job and emits 'retry:created'.
   * Otherwise, marks job as failed.
   *
   * @private
   */
  async _finalizeJobFailure(job, error, branchCreated) {
    // Check if we should retry (use instance maxRetries for testability)
    const canRetry = isRetryable(error) && job.retryCount < this.maxRetries;

    if (canRetry) {
      // Increment retry count
      job.retryCount++;

      // Get retry delay from error classification (H2 fix: use optional chaining)
      const classification = classifyError(error);
      const retryDelay = classification?.suggestedDelay ?? 5000;

      logger.info({
        jobId: job.id,
        retryCount: job.retryCount,
        maxRetries: this.maxRetries,
        errorCode: error?.code,
        retryDelay
      }, 'Scheduling job retry');

      // Reset job state for retry
      job.status = JOB_STATUS.QUEUED;
      job.startedAt = null;
      job.error = null;
      job.retryPending = true;  // H5 fix: prevent duplicate retry timers

      // Emit retry event for activity feed
      this.emit('retry:created', job, {
        attempt: job.retryCount,
        maxAttempts: this.maxRetries,
        reason: classification.reason,
        delay: retryDelay
      });

      this._persistJob(job);

      // Re-queue with delay (C3 fix: check job still exists and is queued)
      const jobId = job.id;
      setTimeout(() => {
        // Verify job still exists (may have been deleted during delay)
        if (!this.jobs.has(jobId)) {
          logger.warn({ jobId }, 'Job deleted during retry delay, skipping retry');
          return;
        }

        const currentJob = this.jobs.get(jobId);

        // H5 fix: check retry pending flag to prevent duplicate timers
        if (!currentJob.retryPending) {
          logger.warn({ jobId }, 'Retry already processed or cancelled, skipping');
          return;
        }

        // Verify job is still in QUEUED state (may have been modified)
        if (currentJob.status !== JOB_STATUS.QUEUED) {
          logger.warn({ jobId, status: currentJob.status }, 'Job status changed during retry delay, skipping retry');
          currentJob.retryPending = false;
          return;
        }

        // Clear pending flag and queue for execution
        currentJob.retryPending = false;
        this.queue.push(jobId);
        this.processQueue();
      }, retryDelay);

      return;
    }

    // No retry - mark as failed
    job.status = JOB_STATUS.FAILED;
    job.completedAt = new Date();
    job.error = safeErrorMessage(error);

    // Git workflow: Cleanup branch on failure
    if (branchCreated && this.gitWorkflowEnabled) {
      try {
        await this.gitWorkflowManager.cleanupBranch(
          job.data.repositoryPath,
          job.git.branchName,
          job.git.originalBranch
        );
        logger.info({ jobId: job.id, branchName: job.git.branchName }, 'Cleaned up branch after job failure');
      } catch (cleanupError) {
        logger.warn({ err: cleanupError, jobId: job.id }, 'Failed to cleanup branch');
      }
    }

    this.emit('job:failed', job, error);
    this.jobHistory.push({ ...job });
    this._persistJob(job);

    Sentry.captureException(error, {
      tags: { jobId: job.id, jobType: this.jobType },
      contexts: {
        job: { id: job.id, data: job.data, startedAt: job.startedAt }
      }
    });

    await this.logJobFailure(job, error);
    logger.error({ err: error, jobId: job.id, jobData: job.data }, 'Job failed');
  }

  /**
   * Handle git workflow after successful job completion
   * @private
   */
  async _handleGitWorkflowSuccess(job) {
    const repositoryPath = job.data.repositoryPath;

    // Check if there are changes
    const hasChanges = await this.gitWorkflowManager.hasChanges(repositoryPath);

    if (!hasChanges) {
      logger.info({ jobId: job.id }, 'No changes to commit, cleaning up branch');

      // Cleanup branch if no changes
      await this.gitWorkflowManager.cleanupBranch(
        repositoryPath,
        job.git.branchName,
        job.git.originalBranch
      );

      return;
    }

    // Get changed files
    job.git.changedFiles = await this.gitWorkflowManager.getChangedFiles(repositoryPath);

    logger.info({
      jobId: job.id,
      filesChanged: job.git.changedFiles.length
    }, 'Changes detected, committing');

    // Commit changes
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

    // Push branch
    const pushed = await this.gitWorkflowManager.pushBranch(
      repositoryPath,
      job.git.branchName
    );

    if (!pushed) {
      logger.warn({ jobId: job.id }, 'Failed to push branch, skipping PR creation');
      return;
    }

    // Create PR
    const prContext = await this._generatePRContext(job);
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
   * @protected
   */
  async _generateCommitMessage(job) {
    return {
      title: `${this.jobType}: automated changes from job ${job.id}`,
      body: `Automated changes generated by ${this.jobType} job.\n\nFiles changed: ${job.git.changedFiles.length}`
    };
  }

  /**
   * Generate PR context for job
   * Override this method to customize PR details
   * @protected
   */
  async _generatePRContext(job) {
    const commitMessage = await this._generateCommitMessage(job);

    return {
      branchName: job.git.branchName,
      title: commitMessage.title,
      body: `## Automated Changes\n\n${commitMessage.body}\n\n### Job Details\n- **Job ID**: ${job.id}\n- **Job Type**: ${this.jobType}\n- **Files Changed**: ${job.git.changedFiles.length}\n\n### Changed Files\n${job.git.changedFiles.map(f => `- \`${f}\``).join('\n')}\n\n---\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)`,
      labels: ['automated', this.jobType]
    };
  }

  /**
   * Override this method to define job execution logic
   * @param {any} job - The job to execute
   * @returns {Promise<any>} - The result of the job execution
   */
  async runJobHandler(job) {
    throw new Error('runJobHandler must be implemented by subclass');
  }

  /**
   * Start processing jobs (no-op, jobs auto-process when created)
   * Provided for lifecycle compatibility with tests
   */
  start() {
    this.isRunning = true;
    this.processQueue();
  }

  /**
   * Stop processing new jobs
   * Provided for lifecycle compatibility with tests
   */
  stop() {
    this.isRunning = false;
  }

  /**
   * Allow tests to set a handler via handleJob property
   * @param {(job: any) => Promise<any>} handler - The job handler function
   */
  set handleJob(handler) {
    this.runJobHandler = handler;
  }

  /**
   * Log job completion to file
   */
  async logJobCompletion(job) {
    try {
      // Ensure log directory exists
      await fs.mkdir(this.logDir, { recursive: true });

      // Defense-in-depth: sanitize job ID to prevent path traversal
      // Even though job IDs are validated, this protects against future bugs
      const sanitizedId = path.basename(job.id);
      const logPath = path.join(this.logDir, `${sanitizedId}.json`);
      await fs.writeFile(logPath, JSON.stringify(job, null, 2));
    } catch (logError) {
      // If we can't write logs, at least log to console
      logger.error({ err: logError, jobId: job.id }, 'Failed to write completion log file');
    }
  }

  /**
   * Log job failure to file
   */
  async logJobFailure(job, error) {
    try {
      // Ensure log directory exists
      await fs.mkdir(this.logDir, { recursive: true });

      // Defense-in-depth: sanitize job ID to prevent path traversal
      const sanitizedId = path.basename(job.id);
      const logPath = path.join(this.logDir, `${sanitizedId}.error.json`);
      await fs.writeFile(logPath, JSON.stringify({
        ...job,
        error: {
          message: error.message,
          stack: error.stack,
        },
      }, null, 2));
    } catch (logError) {
      // If we can't write logs, at least log to console
      logger.error({ err: logError, jobId: job.id }, 'Failed to write error log file');
    }
  }

  /**
   * Get job status
   */
  getJob(jobId) {
    return this.jobs.get(jobId);
  }

  /**
   * Get all jobs
   */
  getAllJobs() {
    return Array.from(this.jobs.values());
  }

  /**
   * Get job statistics
   */
  getStats() {
    return {
      total: this.jobs.size,
      queued: this.queue.length,
      active: this.activeJobs,
      completed: this.jobHistory.filter(j => j.status === JOB_STATUS.COMPLETED).length,
      failed: this.jobHistory.filter(j => j.status === JOB_STATUS.FAILED).length,
    };
  }

  /**
   * Cancel a job
   * - If queued: removes from queue and marks as cancelled
   * - If running: marks as cancelled (job may complete current operation)
   * - If completed/failed: returns false (cannot cancel)
   *
   * @param {string} jobId - The ID of the job to cancel
   * @returns {{success: boolean, message: string, job?: object}} Result of cancellation attempt
   */
  cancelJob(jobId) {
    const job = this.jobs.get(jobId);

    if (!job) {
      return {
        success: false,
        message: `Job ${jobId} not found`
      };
    }

    // Cannot cancel terminal jobs
    if (TERMINAL_STATUSES.includes(job.status)) {
      return {
        success: false,
        message: `Cannot cancel job with status '${job.status}'`,
        job
      };
    }

    // If queued, remove from queue
    if (job.status === JOB_STATUS.QUEUED) {
      const queueIndex = this.queue.indexOf(jobId);
      if (queueIndex > -1) {
        this.queue.splice(queueIndex, 1);
      }
    }

    // Mark job as cancelled
    job.status = JOB_STATUS.CANCELLED;
    job.completedAt = new Date();
    job.error = { message: 'Job cancelled by user', cancelled: true };

    // Persist to database
    this._persistJob(job);

    // Emit cancellation event
    this.emit('job:cancelled', job);

    Sentry.addBreadcrumb({
      category: 'job',
      message: `Job ${jobId} cancelled`,
      level: 'warning',
      data: { jobId, previousStatus: job.status }
    });

    logger.info({ jobId, previousStatus: job.status }, 'Job cancelled');

    return {
      success: true,
      message: `Job ${jobId} cancelled successfully`,
      job
    };
  }

  /**
   * Pause a job
   *
   * Pauses a queued or running job:
   * - If queued: removes from queue, marks as paused
   * - If running: marks as paused (job will stop at next checkpoint)
   * - If already paused/completed/failed/cancelled: returns false
   *
   * @param {string} jobId - The ID of the job to pause
   * @returns {{success: boolean, message: string, job?: object}} Result of pause attempt
   */
  pauseJob(jobId) {
    const job = this.jobs.get(jobId);

    if (!job) {
      return {
        success: false,
        message: `Job ${jobId} not found`
      };
    }

    // Cannot pause terminal or already paused jobs
    if (TERMINAL_STATUSES.includes(job.status) || job.status === JOB_STATUS.PAUSED) {
      return {
        success: false,
        message: `Cannot pause job with status '${job.status}'`,
        job
      };
    }

    const previousStatus = job.status;

    // If queued, remove from queue
    if (job.status === JOB_STATUS.QUEUED) {
      const queueIndex = this.queue.indexOf(jobId);
      if (queueIndex > -1) {
        this.queue.splice(queueIndex, 1);
      }
    }

    // Mark job as paused
    job.status = JOB_STATUS.PAUSED;
    job.pausedAt = new Date();

    // Persist to database
    this._persistJob(job);

    // Emit pause event
    this.emit('job:paused', job);

    Sentry.addBreadcrumb({
      category: 'job',
      message: `Job ${jobId} paused`,
      level: 'info',
      data: { jobId, previousStatus }
    });

    logger.info({ jobId, previousStatus }, 'Job paused');

    return {
      success: true,
      message: `Job ${jobId} paused successfully`,
      job
    };
  }

  /**
   * Resume a paused job
   *
   * Resumes a paused job by re-queuing it:
   * - If paused: adds back to queue, marks as queued
   * - If not paused: returns false
   *
   * @param {string} jobId - The ID of the job to resume
   * @returns {{success: boolean, message: string, job?: object}} Result of resume attempt
   */
  resumeJob(jobId) {
    const job = this.jobs.get(jobId);

    if (!job) {
      return {
        success: false,
        message: `Job ${jobId} not found`
      };
    }

    // Can only resume paused jobs
    if (job.status !== JOB_STATUS.PAUSED) {
      return {
        success: false,
        message: `Cannot resume job with status '${job.status}'. Only paused jobs can be resumed.`,
        job
      };
    }

    // Mark job as queued and add back to queue
    job.status = JOB_STATUS.QUEUED;
    job.resumedAt = new Date();
    delete job.pausedAt;

    this.queue.push(jobId);

    // Persist to database
    this._persistJob(job);

    // Emit resume event
    this.emit('job:resumed', job);

    Sentry.addBreadcrumb({
      category: 'job',
      message: `Job ${jobId} resumed`,
      level: 'info',
      data: { jobId }
    });

    logger.info({ jobId }, 'Job resumed');

    // Trigger queue processing
    this.processQueue();

    return {
      success: true,
      message: `Job ${jobId} resumed successfully`,
      job
    };
  }
}

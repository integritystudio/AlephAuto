import { EventEmitter } from 'events';
import * as Sentry from '@sentry/node';
import { config } from './config.js';
import fs from 'fs/promises';
import path from 'path';
import { createComponentLogger } from '../utils/logger.js';
import { safeErrorMessage } from '../lib/utils/error-helpers.js';
import { BranchManager } from '../lib/git/branch-manager.js';

const logger = createComponentLogger('SidequestServer');

/**
 * SidequestServer - Manages job execution with Sentry logging and optional Git workflow
 */
export class SidequestServer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.jobs = new Map();
    this.jobHistory = [];
    this.maxConcurrent = options.maxConcurrent ?? 5;
    this.activeJobs = 0;
    this.queue = [];
    this.logDir = options.logDir || './logs';

    // Git workflow options
    this.gitWorkflowEnabled = options.gitWorkflowEnabled ?? false;
    this.gitBranchPrefix = options.gitBranchPrefix || 'automated';
    this.gitBaseBranch = options.gitBaseBranch || 'main';
    this.gitDryRun = options.gitDryRun ?? false;
    this.jobType = options.jobType || 'job'; // Used for branch naming

    // Initialize BranchManager if git workflow is enabled
    if (this.gitWorkflowEnabled) {
      this.branchManager = new BranchManager({
        baseBranch: this.gitBaseBranch,
        branchPrefix: this.gitBranchPrefix,
        dryRun: this.gitDryRun
      });
      logger.info({
        enabled: true,
        baseBranch: this.gitBaseBranch,
        branchPrefix: this.gitBranchPrefix,
        dryRun: this.gitDryRun
      }, 'Git workflow enabled');
    }

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
      status: 'queued',
      data: jobData,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      error: null,
      result: null,
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
  async executeJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    // Use Sentry v8 API
    return await Sentry.startSpan({
      op: 'job.execute',
      name: `Execute Job: ${jobId}`,
    }, async () => {
      let branchCreated = false;

      try {
        job.status = 'running';
        job.startedAt = new Date();
        this.emit('job:started', job);

        Sentry.addBreadcrumb({
          category: 'job',
          message: `Job ${jobId} started`,
          level: 'info',
        });

        // Git workflow: Create branch before job execution
        if (this.gitWorkflowEnabled && job.data.repositoryPath) {
          try {
            const branchInfo = await this.branchManager.createJobBranch(
              job.data.repositoryPath,
              {
                jobId: job.id,
                jobType: this.jobType,
                description: job.data.description || job.data.repository
              }
            );

            if (branchInfo.branchName) {
              job.git.branchName = branchInfo.branchName;
              job.git.originalBranch = branchInfo.originalBranch;
              branchCreated = true;

              logger.info({
                jobId: job.id,
                branchName: branchInfo.branchName,
                repositoryPath: job.data.repositoryPath
              }, 'Created job branch');

              Sentry.addBreadcrumb({
                category: 'git',
                message: `Created branch ${branchInfo.branchName}`,
                level: 'info',
              });
            }
          } catch (gitError) {
            logger.warn({ err: gitError, jobId }, 'Failed to create branch, continuing without git workflow');
            // Continue job execution even if branch creation fails
          }
        }

        // Execute the job's handler
        const result = await this.runJobHandler(job);

        job.status = 'completed';
        job.completedAt = new Date();
        job.result = result;

        // Git workflow: Commit, push, and create PR after successful job completion
        if (branchCreated && this.gitWorkflowEnabled) {
          try {
            await this._handleGitWorkflowSuccess(job);
          } catch (gitError) {
            logger.error({ err: gitError, jobId }, 'Git workflow failed, but job completed successfully');
            // Don't fail the job if git operations fail
            Sentry.captureException(gitError, {
              tags: {
                component: 'git-workflow',
                jobId: job.id
              }
            });
          }
        }

        this.emit('job:completed', job);
        this.jobHistory.push({ ...job });

        // Log to file
        await this.logJobCompletion(job);

        Sentry.addBreadcrumb({
          category: 'job',
          message: `Job ${jobId} completed`,
          level: 'info',
        });

      } catch (error) {
        job.status = 'failed';
        job.completedAt = new Date();
        job.error = safeErrorMessage(error);

        // Git workflow: Cleanup branch on failure
        if (branchCreated && this.gitWorkflowEnabled) {
          try {
            await this.branchManager.cleanupBranch(
              job.data.repositoryPath,
              job.git.branchName,
              job.git.originalBranch
            );
            logger.info({ jobId, branchName: job.git.branchName }, 'Cleaned up branch after job failure');
          } catch (cleanupError) {
            logger.warn({ err: cleanupError, jobId }, 'Failed to cleanup branch');
          }
        }

        this.emit('job:failed', job, error);
        this.jobHistory.push({ ...job });

        // Log error to Sentry
        Sentry.captureException(error, {
          tags: {
            jobId: job.id,
            jobType: this.jobType,
          },
          contexts: {
            job: {
              id: job.id,
              data: job.data,
              startedAt: job.startedAt,
            },
          },
        });

        // Log to file
        await this.logJobFailure(job, error);

        logger.error({ err: error, jobId, jobData: job.data }, 'Job failed');
      } finally {
        this.activeJobs--;
        this.processQueue();
      }
    });
  }

  /**
   * Handle git workflow after successful job completion
   * @private
   */
  async _handleGitWorkflowSuccess(job) {
    const repositoryPath = job.data.repositoryPath;

    // Check if there are changes
    const hasChanges = await this.branchManager.hasChanges(repositoryPath);

    if (!hasChanges) {
      logger.info({ jobId: job.id }, 'No changes to commit, cleaning up branch');

      // Cleanup branch if no changes
      await this.branchManager.cleanupBranch(
        repositoryPath,
        job.git.branchName,
        job.git.originalBranch
      );

      return;
    }

    // Get changed files
    job.git.changedFiles = await this.branchManager.getChangedFiles(repositoryPath);

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

    job.git.commitSha = await this.branchManager.commitChanges(
      repositoryPath,
      commitContext
    );

    // Push branch
    const pushed = await this.branchManager.pushBranch(
      repositoryPath,
      job.git.branchName
    );

    if (!pushed) {
      logger.warn({ jobId: job.id }, 'Failed to push branch, skipping PR creation');
      return;
    }

    // Create PR
    const prContext = await this._generatePRContext(job);
    job.git.prUrl = await this.branchManager.createPullRequest(
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
   * Log job completion to file
   */
  async logJobCompletion(job) {
    const logPath = path.join(this.logDir, `${job.id}.json`);
    await fs.writeFile(logPath, JSON.stringify(job, null, 2));
  }

  /**
   * Log job failure to file
   */
  async logJobFailure(job, error) {
    const logPath = path.join(this.logDir, `${job.id}.error.json`);
    await fs.writeFile(logPath, JSON.stringify({
      ...job,
      error: {
        message: error.message,
        stack: error.stack,
      },
    }, null, 2));
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
      completed: this.jobHistory.filter(j => j.status === 'completed').length,
      failed: this.jobHistory.filter(j => j.status === 'failed').length,
    };
  }
}

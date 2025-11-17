import { EventEmitter } from 'events';
import * as Sentry from '@sentry/node';
import { config } from './config.js';
import fs from 'fs/promises';
import path from 'path';
import { createComponentLogger } from './logger.js';

const logger = createComponentLogger('SidequestServer');

/**
 * SidequestServer - Manages job execution with Sentry logging
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
      try {
        job.status = 'running';
        job.startedAt = new Date();
        this.emit('job:started', job);

        Sentry.addBreadcrumb({
          category: 'job',
          message: `Job ${jobId} started`,
          level: 'info',
        });

        // Execute the job's handler
        const result = await this.runJobHandler(job);

        job.status = 'completed';
        job.completedAt = new Date();
        job.result = result;

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
        job.error = error.message;

        this.emit('job:failed', job);
        this.jobHistory.push({ ...job });

        // Log error to Sentry
        Sentry.captureException(error, {
          tags: {
            jobId: job.id,
            jobType: 'repomix',
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

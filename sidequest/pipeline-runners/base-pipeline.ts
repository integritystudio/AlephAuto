import type { Job, JobStats } from '../core/server.ts';
import { SidequestServer } from '../core/server.ts';
import { JOB_EVENTS, RETRY_EVENTS, TIMEOUTS } from '../core/constants.ts';
import { logError } from '../utils/logger.ts';
import * as Sentry from '@sentry/node';
import cron from 'node-cron';
import type { Logger } from 'pino';

export type { Job, JobStats };

/**
 * Base class for pipeline runners that wrap a SidequestServer worker.
 * Provides shared waitForCompletion(), scheduleCron(), and getStats().
 */
export abstract class BasePipeline<TWorker extends SidequestServer = SidequestServer> {
  protected worker: TWorker;

  /**
   * constructor.
   */
  constructor(worker: TWorker) {
    this.worker = worker;
  }

  /**
   * Wait for all queued and active jobs to drain using events.
   * Listens for job:completed, job:failed, and retry:created to avoid
   * polling race conditions and premature resolution during retries.
   * Precondition: all jobs must be enqueued before calling this method.
   *
   * @param timeoutMs Optional deadline timeout. Rejects if jobs haven't drained within this duration.
   */
  waitForCompletion(timeoutMs?: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let deadline: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (deadline) {
          clearTimeout(deadline);
        }
        this.worker.off(JOB_EVENTS.COMPLETED, checkAndResolve);
        this.worker.off(JOB_EVENTS.FAILED, checkAndResolve);
        this.worker.off(RETRY_EVENTS.CREATED, checkAndResolve);
      };

      const checkAndResolve = () => {
        const stats = this.worker.getStats();
        if (stats.active === 0 && stats.queued === 0 && stats.pendingRetries === 0) {
          cleanup();
          resolve();
        }
      };

      if (timeoutMs !== undefined) {
        deadline = setTimeout(() => {
          cleanup();
          reject(new Error(`waitForCompletion timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }

      // Register listeners before checking to avoid missing events between
      // the check and registration.
      this.worker.on(JOB_EVENTS.COMPLETED, checkAndResolve);
      this.worker.on(JOB_EVENTS.FAILED, checkAndResolve);
      this.worker.on(RETRY_EVENTS.CREATED, checkAndResolve);
      // Immediate check handles already-drained case.
      checkAndResolve();
    });
  }

  /**
   * Wait for a single job to reach a terminal status (completed or failed).
   * Rejects on failure, timeout, or if the job is not found.
   */
  waitForJobTerminalStatus(jobId: string, timeoutMs: number = TIMEOUTS.ONE_HOUR_MS): Promise<void> {
    return new Promise((resolve, reject) => {
      let timeoutHandle: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        this.worker.off(JOB_EVENTS.COMPLETED, onCompleted);
        this.worker.off(JOB_EVENTS.FAILED, onFailed);
      };

      const rejectWithFailure = (job: Job) => {
        const message = job.error?.message ?? `Job ${job.id} failed`;
        cleanup();
        reject(new Error(message));
      };

      const onCompleted = (job: Job) => {
        if (job.id !== jobId) return;
        cleanup();
        resolve();
      };

      const onFailed = (job: Job) => {
        if (job.id !== jobId) return;
        rejectWithFailure(job);
      };

      this.worker.on(JOB_EVENTS.COMPLETED, onCompleted);
      this.worker.on(JOB_EVENTS.FAILED, onFailed);

      timeoutHandle = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out waiting for job ${jobId} after ${timeoutMs}ms`));
      }, timeoutMs);

      const currentJob = this.worker.getJob(jobId);
      if (!currentJob) {
        cleanup();
        reject(new Error(`Job ${jobId} was not found after creation`));
        return;
      }
      if (currentJob.status === 'completed') {
        cleanup();
        resolve();
        return;
      }
      if (currentJob.status === 'failed') {
        rejectWithFailure(currentJob);
      }
    });
  }

  /**
   * Schedule a cron job with validation, logging, and error handling.
   */
  protected scheduleCron(
    logger: Logger,
    name: string,
    cronSchedule: string,
    runFn: () => Promise<unknown>
  ): cron.ScheduledTask {
    if (!cron.validate(cronSchedule)) {
      throw new Error(`Invalid cron schedule: ${cronSchedule}`);
    }

    logger.info({ cronSchedule }, `Scheduling ${name}`);

    const monitorSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const task = cron.schedule(cronSchedule, async () => {
      logger.info(`Cron triggered - starting ${name}`);
      await Sentry.withMonitor(monitorSlug, async () => {
        try {
          await runFn();
        } catch (error) {
          logError(logger, error, `Scheduled ${name} failed`);
          throw error;
        }
      }, { schedule: { type: 'crontab', value: cronSchedule } });
    });

    logger.info(`${name} scheduled`);
    return task;
  }

  /**
   * Register standard event listeners for CREATED, STARTED, COMPLETED, FAILED.
   *
   * @param logger Pipeline-specific logger instance.
   * @param handlers Optional per-event data extractors. Each returns extra fields to log.
   */
  protected setupDefaultEventListeners(
    logger: Logger,
    handlers?: {
      onCreated?: (job: Job) => Record<string, unknown>;
      onStarted?: (job: Job) => Record<string, unknown>;
      onCompleted?: (job: Job) => Record<string, unknown>;
      onFailed?: (job: Job) => Record<string, unknown>;
    }
  ): void {
    this.worker.on(JOB_EVENTS.CREATED, (job: Job) => {
      logger.info({ jobId: job.id, ...handlers?.onCreated?.(job) }, 'Job created');
    });

    this.worker.on(JOB_EVENTS.STARTED, (job: Job) => {
      logger.info({ jobId: job.id, ...handlers?.onStarted?.(job) }, 'Job started');
    });

    this.worker.on(JOB_EVENTS.COMPLETED, (job: Job) => {
      const duration = job.completedAt && job.startedAt
        ? job.completedAt.getTime() - job.startedAt.getTime()
        : undefined;
      logger.info({ jobId: job.id, duration, ...handlers?.onCompleted?.(job) }, 'Job completed');
    });

    this.worker.on(JOB_EVENTS.FAILED, (job: Job) => {
      logError(logger, job.error, 'Job failed', { jobId: job.id, ...handlers?.onFailed?.(job) });
    });
  }

  /**
   * getStats.
   */
  getStats(): JobStats {
    return this.worker.getStats();
  }
}

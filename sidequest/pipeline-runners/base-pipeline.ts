import type { Job, JobStats } from '../core/server.ts';
import { SidequestServer } from '../core/server.ts';
import { JOB_EVENTS, RETRY_EVENTS } from '../core/constants.ts';
import { logError } from '../utils/logger.ts';
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
   */
  waitForCompletion(): Promise<void> {
    return new Promise<void>((resolve) => {
      /**
       * cleanup.
       */
      const cleanup = () => {
        this.worker.off(JOB_EVENTS.COMPLETED, checkAndResolve);
        this.worker.off(JOB_EVENTS.FAILED, checkAndResolve);
        this.worker.off(RETRY_EVENTS.CREATED, checkAndResolve);
      };

      /**
       * checkAndResolve.
       */
      const checkAndResolve = () => {
        const stats = this.worker.getStats();
        if (stats.active === 0 && stats.queued === 0 && stats.pendingRetries === 0) {
          cleanup();
          resolve();
        }
      };

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

    const task = cron.schedule(cronSchedule, async () => {
      logger.info(`Cron triggered - starting ${name}`);
      try {
        await runFn();
      } catch (error) {
        logError(logger, error, `Scheduled ${name} failed`);
      }
    });

    logger.info(`${name} scheduled`);
    return task;
  }

  /**
   * getStats.
   */
  getStats(): JobStats {
    return this.worker.getStats();
  }
}

import type { Job, JobStats } from '../core/server.ts';
import { SidequestServer } from '../core/server.ts';
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

  constructor(worker: TWorker) {
    this.worker = worker;
  }

  /**
   * Wait for all queued and active jobs to drain using events.
   * Uses job:completed and job:failed events to avoid polling race conditions.
   */
  waitForCompletion(): Promise<void> {
    return new Promise<void>((resolve) => {
      const checkAndResolve = () => {
        const stats = this.worker.getStats();
        if (stats.active === 0 && stats.queued === 0) {
          this.worker.off('job:completed', checkAndResolve);
          this.worker.off('job:failed', checkAndResolve);
          resolve();
        }
      };

      // Immediate check handles already-drained case
      checkAndResolve();
      this.worker.on('job:completed', checkAndResolve);
      this.worker.on('job:failed', checkAndResolve);
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
        logError(logger, error as Error, `Scheduled ${name} failed`);
      }
    });

    logger.info(`${name} scheduled`);
    return task;
  }

  getStats(): JobStats {
    return this.worker.getStats();
  }
}

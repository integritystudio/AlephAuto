#!/usr/bin/env -S node --strip-types

/**
 * Duplicate Detection Pipeline
 *
 * Automated duplicate detection scanning system with cron scheduling.
 * Scans repositories on a configured schedule, detects duplicates, generates reports.
 *
 * Usage:
 *   node --strip-types duplicate-detection-pipeline.ts                    # Start cron server
 *   RUN_ON_STARTUP=true node --strip-types duplicate-detection-pipeline.ts # Run immediately
 */

import { DuplicateDetectionWorker } from '../workers/duplicate-detection-worker.ts';
import { createComponentLogger, logError } from '../utils/logger.ts';
import { config } from '../core/config.ts';
import { TIMEOUTS } from '../core/constants.ts';
import { BasePipeline } from './base-pipeline.ts';
import { isDirectExecution } from '../utils/execution-helpers.ts';

const logger = createComponentLogger('DuplicateDetectionPipeline');

// Re-export worker and types for external consumers.
export { DuplicateDetectionWorker };
export type {
  RetryInfo,
  RetryMetrics,
  WorkerScanMetrics,
  DuplicateDetectionWorkerOptions
} from '../pipeline-core/types/duplicate-detection-types.ts';

/**
 * Duplicate Detection Pipeline — extends BasePipeline for scheduleCron().
 *
 * Uses worker.runNightlyScan() which manages its own job scheduling.
 * waitForCompletion() ensures all enqueued jobs finish before exit.
 */
class DuplicateDetectionPipeline extends BasePipeline<DuplicateDetectionWorker> {
  /**
   * Schedule nightly duplicate scans via cron.
   */
  scheduleNightlyScans(cronSchedule: string) {
    return this.scheduleCron(logger, 'nightly duplicate scan', cronSchedule,
      () => this.worker.runNightlyScan());
  }

  /**
   * Run a single nightly scan and wait for all enqueued jobs to complete.
   */
  async runNightlyScan(): Promise<void> {
    await this.worker.runNightlyScan();
    await this.waitForCompletion(TIMEOUTS.ONE_HOUR_MS);
  }
}

async function main(): Promise<void> {
  const cronSchedule = process.env.DUPLICATE_SCAN_CRON_SCHEDULE || '0 2 * * *';
  const runOnStartup = config.runOnStartup;

  logger.info({ cronSchedule, runOnStartup }, 'Starting duplicate detection pipeline');

  try {
    const worker = new DuplicateDetectionWorker({
      maxConcurrentScans: 3
    });

    await worker.initialize();

    logger.info('Duplicate detection pipeline initialized');

    const stats = worker.configLoader.getStats();
    logger.info({
      totalRepositories: stats.totalRepositories,
      enabledRepositories: stats.enabledRepositories,
      repositoryGroups: stats.groups
    }, 'Loaded duplicate-detection configuration');

    const pipeline = new DuplicateDetectionPipeline(worker);

    if (!runOnStartup) {
      pipeline.scheduleNightlyScans(cronSchedule);

      // Notify PM2 that process is ready (fork mode)
      if (process.send) {
        process.send('ready');
        logger.info('Sent ready signal to PM2');
      }

      // Keep-alive: prevent process from exiting
      // The cron scheduler keeps the event loop active, but we add this as a safeguard
      setInterval(() => {
        logger.debug('Worker keep-alive heartbeat');
      }, TIMEOUTS.FIVE_MINUTES_MS);
    } else {
      logger.info('Running scan immediately (runOnStartup=true)');
      await pipeline.runNightlyScan();

      const metrics = worker.getScanMetrics();
      logger.info({
        totalScans: metrics.totalScans,
        duplicatesFound: metrics.totalDuplicatesFound,
        suggestionsGenerated: metrics.totalSuggestionsGenerated,
        highImpactDuplicates: metrics.highImpactDuplicates
      }, 'Startup scan completed');

      if (worker.enablePRCreation) {
        logger.info({
          prsCreated: metrics.prsCreated,
          prCreationErrors: metrics.prCreationErrors
        }, 'PR creation metrics');
      }

      process.exit(0);
    }

  } catch (error) {
    logError(logger, error, 'Pipeline initialization failed');
    process.exit(1);
  }
}

// PM2 loads this file via dynamic import(), so process.argv[1] points to
// PM2's ProcessContainerFork, not this script. Detect PM2 via pm_id env var.
if (isDirectExecution(import.meta.url) || process.env.pm_id !== undefined) {
  main().catch((error) => {
    logError(logger, error, 'Fatal error in duplicate detection pipeline');
    process.exit(1);
  });
}

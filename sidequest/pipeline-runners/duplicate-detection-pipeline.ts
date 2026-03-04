#!/usr/bin/env -S npx tsx

/**
 * Duplicate Detection Pipeline - TypeScript Version
 *
 * Automated duplicate detection scanning system with cron scheduling.
 * Scans repositories on a configured schedule, detects duplicates, generates reports.
 *
 * Usage:
 *   tsx duplicate-detection-pipeline.ts                    # Start cron server
 *   RUN_ON_STARTUP=true tsx duplicate-detection-pipeline.ts # Run immediately
 */

import { DuplicateDetectionWorker } from '../workers/duplicate-detection-worker.ts';
import { createComponentLogger } from '../utils/logger.ts';
import { config } from '../core/config.ts';
import { TIMEOUTS } from '../core/constants.ts';
// @ts-ignore - no declaration file for node-cron
import cron from 'node-cron';
import * as Sentry from '@sentry/node';
import { realpathSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import type { Logger } from 'pino';

const logger: Logger = createComponentLogger('DuplicateDetectionPipeline');

// Re-export worker and types for any external consumers.
// Types previously re-exported here (JobStatus, ScanType, JobData, ScanResult,
// DuplicateGroup, Suggestion, PRCreationResult, JobResult, Inter/IntraProjectScanJobResult)
// are now imported directly from '../pipeline-core/types/duplicate-detection-types.ts'.
export { DuplicateDetectionWorker };
export type {
  RetryInfo,
  RetryMetrics,
  WorkerScanMetrics,
  DuplicateDetectionWorkerOptions
} from '../pipeline-core/types/duplicate-detection-types.ts';

/**
 * Main execution
 */
async function main(): Promise<void> {
  const cronSchedule = process.env.DUPLICATE_SCAN_CRON_SCHEDULE || '0 2 * * *';
  const runOnStartup = config.runOnStartup;

  logger.info({ cronSchedule, runOnStartup }, 'Starting duplicate detection pipeline');

  try {
    // Initialize worker
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

    // Schedule cron job
    if (!runOnStartup) {
      logger.info({ cronSchedule }, 'Scheduling nightly duplicate scans');

      cron.schedule(cronSchedule, async () => {
        logger.info('Cron job triggered');
        try {
          await worker.runNightlyScan();
        } catch (error) {
          logger.error({ error }, 'Nightly scan failed');
          Sentry.captureException(error);
        }
      });

      logger.info('Duplicate detection scheduler is running');

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
      await worker.runNightlyScan();

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
    logger.error({ error, message: (error as Error).message }, 'Pipeline initialization failed');
    Sentry.captureException(error);
    process.exit(1);
  }
}

function isDirectExecution(): boolean {
  const currentModulePath = fileURLToPath(import.meta.url);
  const entryPath = process.argv[1];
  if (!entryPath) return false;
  try {
    return realpathSync(path.resolve(entryPath)) === realpathSync(currentModulePath);
  } catch {
    return false;
  }
}

if (isDirectExecution()) {
  main().catch((error) => {
    logger.error({ error }, 'Fatal error in duplicate detection pipeline');
    process.exit(1);
  });
}

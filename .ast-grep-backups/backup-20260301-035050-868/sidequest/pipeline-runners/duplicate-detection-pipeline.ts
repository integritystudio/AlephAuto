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

import type { Logger } from 'pino';

const logger: Logger = createComponentLogger('DuplicateDetectionPipeline');

// Re-export worker and types for any external consumers.
// Types previously re-exported here (JobStatus, ScanType, JobData, ScanResult,
// DuplicateGroup, Suggestion, PRCreationResult, JobResult, Inter/IntraProjectScanJobResult)
// are now imported directly from '../types/duplicate-detection-types.ts'.
export { DuplicateDetectionWorker };
export type {
  RetryInfo,
  RetryMetrics,
  WorkerScanMetrics,
  DuplicateDetectionWorkerOptions
} from '../types/duplicate-detection-types.ts';

/**
 * Main execution
 */
async function main(): Promise<void> {
  const cronSchedule = process.env.DUPLICATE_SCAN_CRON_SCHEDULE || '0 2 * * *';
  const runOnStartup = config.runOnStartup;

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     DUPLICATE DETECTION AUTOMATED PIPELINE              ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  try {
    // Initialize worker
    const worker = new DuplicateDetectionWorker({
      maxConcurrentScans: 3
    });

    await worker.initialize();

    console.log('✅ Duplicate detection pipeline initialized\n');

    const stats = worker.configLoader.getStats();
    console.log('📊 Configuration:');
    console.log(`   Total repositories: ${stats.totalRepositories}`);
    console.log(`   Enabled repositories: ${stats.enabledRepositories}`);
    console.log(`   Repository groups: ${stats.groups}\n`);

    // Schedule cron job
    if (!runOnStartup) {
      console.log(`⏰ Scheduling nightly scans: ${cronSchedule}\n`);

      cron.schedule(cronSchedule, async () => {
        logger.info('Cron job triggered');
        try {
          await worker.runNightlyScan();
        } catch (error) {
          logger.error({ error }, 'Nightly scan failed');
          Sentry.captureException(error);
        }
      });

      console.log('🚀 Pipeline is running. Press Ctrl+C to stop.\n');

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
      console.log('▶️  Running scan immediately (RUN_ON_STARTUP=true)\n');
      await worker.runNightlyScan();

      console.log('\n✅ Startup scan completed');
      const metrics = worker.getScanMetrics();
      console.log('\n📊 Scan Metrics:');
      console.log(`   Total scans: ${metrics.totalScans}`);
      console.log(`   Duplicates found: ${metrics.totalDuplicatesFound}`);
      console.log(`   Suggestions generated: ${metrics.totalSuggestionsGenerated}`);
      console.log(`   High-impact duplicates: ${metrics.highImpactDuplicates}`);

      if (worker.enablePRCreation) {
        console.log('\n🔀 PR Creation:');
        console.log(`   PRs created: ${metrics.prsCreated}`);
        console.log(`   PR creation errors: ${metrics.prCreationErrors}`);
      }

      console.log('');
      process.exit(0);
    }

  } catch (error) {
    console.error('\n❌ Error:', (error as Error).message);
    logger.error({ error }, 'Pipeline initialization failed');
    Sentry.captureException(error);
    process.exit(1);
  }
}

// Run the pipeline
// Check if running directly (not imported as module)
// Also check for PM2 execution (pm_id is set by PM2)
const isDirectExecution = import.meta.url === `file://${process.argv[1]}` || process.env.pm_id !== undefined;

if (isDirectExecution) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

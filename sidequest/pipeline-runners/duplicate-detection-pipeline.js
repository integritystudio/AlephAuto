#!/usr/bin/env node

/**
 * Duplicate Detection Pipeline
 *
 * Automated duplicate detection scanning system with cron scheduling.
 * Scans repositories on a configured schedule, detects duplicates, generates reports.
 *
 * Features:
 * - Cron-based scheduling
 * - Repository prioritization and frequency management
 * - Inter-project and intra-project scanning
 * - Redis-based job queue (optional)
 * - Retry logic with exponential backoff
 * - Sentry error tracking
 * - Progress tracking and metrics
 *
 * Usage:
 *   node duplicate-detection-pipeline.js                    # Start cron server
 *   RUN_ON_STARTUP=true node duplicate-detection-pipeline.js # Run immediately
 */

import { DuplicateDetectionWorker } from '../workers/duplicate-detection-worker.js';
import { createComponentLogger } from '../utils/logger.js';
import { config } from '../core/config.js';
import * as Sentry from '@sentry/node';
import cron from 'node-cron';

const logger = createComponentLogger('DuplicateDetectionPipeline');

/**
 * Main execution
 */
async function main() {
  const cronSchedule = config.duplicateScanCronSchedule || '0 2 * * *';
  const runOnStartup = config.runOnStartup;

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     DUPLICATE DETECTION AUTOMATED PIPELINE              ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  try {
    // Initialize worker
    const worker = new DuplicateDetectionWorker({
      maxConcurrentScans: config.maxConcurrentDuplicateScans || 3,
      enablePRCreation: config.enablePRCreation,
      baseBranch: config.gitBaseBranch,
      dryRun: config.prDryRun
    });

    // Event listeners for job lifecycle
    worker.on('job:created', (job) => {
      logger.info({
        jobId: job.id,
        type: job.data.type,
        scanType: job.data.scanType
      }, 'Job created');
    });

    worker.on('job:started', (job) => {
      logger.info({
        jobId: job.id,
        scanType: job.data.scanType,
        repositories: job.data.repositories?.length || 0
      }, 'Job started');
    });

    worker.on('job:completed', (job) => {
      const result = job.result || {};
      logger.info({
        jobId: job.id,
        scanType: result.scanType,
        duplicates: result.duplicates || result.crossRepoDuplicates || 0,
        suggestions: result.suggestions || 0,
        duration: result.duration,
        prResults: result.prResults
      }, 'Job completed');

      worker.scanMetrics.successfulScans++;
    });

    worker.on('job:failed', (job, error) => {
      logger.error({
        jobId: job.id,
        error: job.error || error?.message,
        scanType: job.data.scanType
      }, 'Job failed');

      worker.scanMetrics.failedScans++;

      Sentry.captureException(error || new Error(job.error), {
        tags: {
          component: 'duplicate-detection-pipeline',
          job_id: job.id,
          scan_type: job.data.scanType
        }
      });
    });

    // Event listeners for pipeline-specific events
    worker.on('initialized', (stats) => {
      logger.info({
        totalRepositories: stats.totalRepositories,
        enabledRepositories: stats.enabledRepositories,
        groups: stats.groups
      }, 'Worker initialized with configuration');
    });

    worker.on('pipeline:status', (status) => {
      logger.info({ pipelineStatus: status }, 'Pipeline status update');
    });

    worker.on('scan:completed', (scanInfo) => {
      logger.info({
        jobId: scanInfo.jobId,
        scanType: scanInfo.scanType,
        metrics: scanInfo.metrics
      }, 'Scan completed');
    });

    worker.on('pr:created', (prInfo) => {
      logger.info({
        repository: prInfo.repository,
        prsCreated: prInfo.prsCreated,
        prUrls: prInfo.prUrls
      }, 'Pull requests created');
    });

    worker.on('pr:failed', (prInfo) => {
      logger.error({
        repository: prInfo.repository,
        error: prInfo.error
      }, 'Failed to create pull requests');
    });

    worker.on('high-impact:detected', (info) => {
      logger.warn({
        count: info.count,
        threshold: info.threshold,
        topScore: info.topImpactScore
      }, 'High-impact duplicates detected');
    });

    worker.on('retry:scheduled', (retryInfo) => {
      logger.info({
        jobId: retryInfo.jobId,
        attempt: retryInfo.attempt,
        delay: retryInfo.delay
      }, 'Retry scheduled');
    });

    worker.on('retry:warning', (retryInfo) => {
      logger.warn({
        jobId: retryInfo.jobId,
        attempts: retryInfo.attempts,
        maxAttempts: retryInfo.maxAttempts
      }, 'Approaching retry limit');
    });

    worker.on('retry:circuit-breaker', (retryInfo) => {
      logger.error({
        jobId: retryInfo.jobId,
        attempts: retryInfo.attempts
      }, 'Circuit breaker triggered');
    });

    worker.on('metrics:updated', (metrics) => {
      logger.debug({ metrics }, 'Metrics updated');
    });

    // Initialize the worker
    await worker.initialize();

    console.log('✅ Duplicate detection pipeline initialized\n');

    const stats = worker.configLoader.getStats();
    console.log('📊 Configuration:');
    console.log(`   Total repositories: ${stats.totalRepositories}`);
    console.log(`   Enabled repositories: ${stats.enabledRepositories}`);
    console.log(`   Repository groups: ${stats.groups}\n`);

    // Schedule cron job or run immediately
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
      }, 300000); // 5 minutes

      // Graceful shutdown handlers
      process.on('SIGTERM', () => {
        logger.info('Received SIGTERM, shutting down gracefully');
        process.exit(0);
      });

      process.on('SIGINT', () => {
        logger.info('Received SIGINT, shutting down gracefully');
        process.exit(0);
      });

    } else {
      console.log('▶️  Running scan immediately (RUN_ON_STARTUP=true)\n');
      await worker.runNightlyScan();

      // Wait for all jobs to complete
      const waitForCompletion = () => {
        return new Promise((resolve) => {
          const checkInterval = setInterval(() => {
            const stats = worker.getStats();
            if (stats.active === 0 && stats.queued === 0) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 1000);
        });
      };

      await waitForCompletion();

      console.log('\n✅ Startup scan completed');
      const metrics = worker.getScanMetrics();
      console.log('\n📊 Scan Metrics:');
      console.log(`   Total scans: ${metrics.totalScans}`);
      console.log(`   Successful: ${metrics.successfulScans}`);
      console.log(`   Failed: ${metrics.failedScans}`);
      console.log(`   Duplicates found: ${metrics.totalDuplicatesFound}`);
      console.log(`   Suggestions generated: ${metrics.totalSuggestionsGenerated}`);
      console.log(`   High-impact duplicates: ${metrics.highImpactDuplicates}`);

      if (worker.enablePRCreation) {
        console.log('\n🔀 PR Creation:');
        console.log(`   PRs created: ${metrics.prsCreated}`);
        console.log(`   PR creation errors: ${metrics.prCreationErrors}`);
      }

      console.log('\n📈 Retry Metrics:');
      const retryMetrics = metrics.retryMetrics;
      console.log(`   Active retries: ${retryMetrics.activeRetries}`);
      console.log(`   Total retry attempts: ${retryMetrics.totalRetryAttempts}`);
      if (retryMetrics.retryDistribution.nearingLimit > 0) {
        console.log(`   ⚠️  Jobs nearing retry limit: ${retryMetrics.retryDistribution.nearingLimit}`);
      }

      console.log('');
      process.exit(0);
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    logger.error({ error }, 'Pipeline initialization failed');
    Sentry.captureException(error);
    process.exit(1);
  }
}

// Export worker class for testing and external use
export { DuplicateDetectionWorker };

// Run the pipeline
// Check if running directly (not imported as module)
// Also check for PM2 execution (pm_id is set by PM2)
const isDirectExecution = import.meta.url === `file://${process.argv[1]}` || process.env.pm_id !== undefined;

if (isDirectExecution) {
  await main();
}
#!/usr/bin/env node
// @ts-nocheck
import { GitignoreWorker } from '../workers/gitignore-worker.js';
import { createComponentLogger } from '../utils/logger.js';
import * as Sentry from '@sentry/node';
import cron from 'node-cron';
import path from 'path';
import os from 'os';

const logger = createComponentLogger('GitignorePipeline');

/**
 * Gitignore Update Pipeline
 *
 * Automated .gitignore file management across all git repositories.
 * Adds repomix-output.xml to .gitignore files to prevent tracking of generated files.
 *
 * Features:
 * - Scheduled updates via cron
 * - Batch processing with job queue
 * - Dry-run mode for testing
 * - Sentry error tracking
 * - Event-driven architecture
 *
 * Environment Variables:
 * - GITIGNORE_CRON_SCHEDULE: Cron schedule (default: "0 4 * * *" - Daily at 4 AM)
 * - GITIGNORE_BASE_DIR: Base directory to scan (default: ~/code)
 * - GITIGNORE_MAX_DEPTH: Maximum scan depth (default: 10)
 * - GITIGNORE_DRY_RUN: Dry run mode (default: false)
 * - RUN_ON_STARTUP: Run immediately on startup (default: false)
 */

const CRON_SCHEDULE = process.env.GITIGNORE_CRON_SCHEDULE || '0 4 * * *'; // Daily at 4 AM
const BASE_DIR = process.env.GITIGNORE_BASE_DIR || path.join(os.homedir(), 'code');
const MAX_DEPTH = parseInt(process.env.GITIGNORE_MAX_DEPTH || '10', 10);
const DRY_RUN = process.env.GITIGNORE_DRY_RUN === 'true';

// Support both env var and --run-now flag
const args = process.argv.slice(2);
const RUN_ON_STARTUP = process.env.RUN_ON_STARTUP === 'true' || args.includes('--run-now') || args.includes('--run');

async function main() {
  logger.info({
    cronSchedule: CRON_SCHEDULE,
    baseDir: BASE_DIR,
    maxDepth: MAX_DEPTH,
    dryRun: DRY_RUN,
    runOnStartup: RUN_ON_STARTUP
  }, 'Starting Gitignore Update Pipeline');

  // Create worker instance
  const worker = new GitignoreWorker({
    baseDir: BASE_DIR,
    maxDepth: MAX_DEPTH,
    maxConcurrent: 1, // Process one batch at a time
  });

  // Event listeners
  worker.on('job:created', (job) => {
    logger.info({
      jobId: job.id,
      type: job.data.type,
      dryRun: job.data.dryRun
    }, 'Job created');
  });

  worker.on('job:started', (job) => {
    logger.info({
      jobId: job.id,
      baseDir: job.data.baseDir,
      dryRun: job.data.dryRun
    }, 'Job started');
  });

  worker.on('job:completed', (job) => {
    const { totalRepositories, summary } = job.result || {};

    logger.info({
      jobId: job.id,
      totalRepositories,
      added: summary?.added || 0,
      skipped: summary?.skipped || 0,
      wouldAdd: summary?.would_add || 0,
      errors: summary?.error || 0
    }, 'Job completed');

    // Log summary for monitoring
    if (summary) {
      logger.info({
        summary: {
          total: totalRepositories,
          added: summary.added,
          skipped: summary.skipped,
          wouldAdd: summary.would_add,
          errors: summary.error,
        }
      }, 'Gitignore update summary');
    }
  });

  worker.on('job:failed', (job) => {
    logger.error({
      jobId: job.id,
      error: job.error,
      retries: job.retries
    }, 'Job failed');

    Sentry.captureException(new Error(job.error), {
      tags: {
        component: 'gitignore-pipeline',
        job_id: job.id,
      },
      extra: {
        baseDir: job.data.baseDir,
        dryRun: job.data.dryRun,
        retries: job.retries,
      },
    });
  });

  // Run immediately if requested
  if (RUN_ON_STARTUP) {
    logger.info('Running gitignore update immediately (RUN_ON_STARTUP=true)');
    try {
      const job = worker.createUpdateAllJob({
        baseDir: BASE_DIR,
        dryRun: DRY_RUN,
        maxDepth: MAX_DEPTH,
      });

      logger.info({
        jobId: job.id,
        dryRun: DRY_RUN
      }, 'Startup job created');
    } catch (error) {
      logger.error({ error }, 'Failed to create startup job');
      Sentry.captureException(error, {
        tags: { component: 'gitignore-pipeline', phase: 'startup' },
      });
    }
  }

  // Schedule cron job
  logger.info({ schedule: CRON_SCHEDULE }, 'Scheduling gitignore updates');

  cron.schedule(CRON_SCHEDULE, () => {
    logger.info('Cron triggered gitignore update');
    try {
      const job = worker.createUpdateAllJob({
        baseDir: BASE_DIR,
        dryRun: DRY_RUN,
        maxDepth: MAX_DEPTH,
      });

      logger.info({
        jobId: job.id,
        dryRun: DRY_RUN
      }, 'Scheduled job created');
    } catch (error) {
      logger.error({ error }, 'Failed to create scheduled job');
      Sentry.captureException(error, {
        tags: { component: 'gitignore-pipeline', phase: 'cron' },
      });
    }
  });

  logger.info('Gitignore Update Pipeline is running');

  // Keep process alive
  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down gracefully');
    process.exit(0);
  });
}

// Run the pipeline
main().catch((error) => {
  logger.error({ error }, 'Fatal error in gitignore pipeline');
  Sentry.captureException(error, {
    tags: { component: 'gitignore-pipeline', phase: 'startup' },
  });
  process.exit(1);
});

#!/usr/bin/env node
// @ts-nocheck

/**
 * Dashboard Populate Pipeline - AlephAuto Integration
 *
 * Runs the quality-metrics-dashboard populate pipeline on a schedule.
 * Derives rule-based and LLM-based metrics from Claude Code session telemetry,
 * then syncs aggregated results to Cloudflare KV.
 *
 * Usage:
 *   npm run dashboard:populate              # Run once with --seed (offline)
 *   npm run dashboard:populate:full         # Run once with real LLM judge (needs ANTHROPIC_API_KEY)
 *   npm run dashboard:populate:dry          # Dry run preview
 *   npm run dashboard:populate:schedule     # Start cron scheduler
 *
 * Environment Variables:
 *   DASHBOARD_CRON_SCHEDULE - Cron schedule (default: "0 6 * * *" - daily 6 AM)
 *   DASHBOARD_SEED - Use synthetic judge scores (default: true)
 *   RUN_ON_STARTUP - Run immediately on startup (default: false)
 */

import { DashboardPopulateWorker } from '../workers/dashboard-populate-worker.js';
import { createComponentLogger, logError } from '../utils/logger.ts';
import * as Sentry from '@sentry/node';
import cron from 'node-cron';

const logger = createComponentLogger('DashboardPopulatePipeline');

const CRON_SCHEDULE = process.env.DASHBOARD_CRON_SCHEDULE || '0 6,18 * * *'; // Twice daily: 6 AM, 6 PM

// Parse CLI args
const args = process.argv.slice(2);
const RUN_ON_STARTUP = process.env.RUN_ON_STARTUP === 'true'
  || args.includes('--run-now')
  || args.includes('--run');

const cliOptions = {
  seed: !args.includes('--no-seed'),
  dryRun: args.includes('--dry-run'),
  skipJudge: args.includes('--skip-judge'),
  skipSync: args.includes('--skip-sync'),
  limit: undefined,
};

const limitIdx = args.indexOf('--limit');
if (limitIdx !== -1 && args[limitIdx + 1]) {
  cliOptions.limit = parseInt(args[limitIdx + 1], 10);
}

// --no-seed is the explicit "use real LLM" flag; default is --seed (offline)
if (process.env.DASHBOARD_SEED === 'false') {
  cliOptions.seed = false;
}

async function main() {
  logger.info({
    cronSchedule: CRON_SCHEDULE,
    seed: cliOptions.seed,
    dryRun: cliOptions.dryRun,
    runOnStartup: RUN_ON_STARTUP,
  }, 'Starting Dashboard Populate Pipeline');

  const worker = new DashboardPopulateWorker({ maxConcurrent: 1 });

  // Event listeners
  worker.on('job:created', (job) => {
    logger.info({
      jobId: job.id,
      seed: job.data.seed,
      dryRun: job.data.dryRun,
    }, 'Job created');
  });

  worker.on('job:started', (job) => {
    logger.info({ jobId: job.id }, 'Job started');
  });

  worker.on('job:completed', (job) => {
    const { durationMs, steps } = job.result || {};
    logger.info({
      jobId: job.id,
      durationMs,
      steps: steps?.length ?? 0,
    }, 'Job completed');
  });

  worker.on('job:failed', (job) => {
    logError(logger, job.error, 'Job failed', { jobId: job.id, retries: job.retries });
    Sentry.captureException(new Error(job.error), {
      tags: { component: 'dashboard-populate-pipeline', job_id: job.id },
    });
  });

  // Run immediately if requested
  if (RUN_ON_STARTUP) {
    logger.info({ ...cliOptions }, 'Running populate immediately');
    try {
      worker.createPopulateJob(cliOptions);
    } catch (error) {
      logError(logger, error, 'Failed to create startup job');
      Sentry.captureException(error, {
        tags: { component: 'dashboard-populate-pipeline', phase: 'startup' },
      });
    }
  }

  // If --run-now without --cron, exit after job completes
  if (RUN_ON_STARTUP && !args.includes('--cron')) {
    // Wait for job completion then exit
    worker.on('job:completed', () => process.exit(0));
    worker.on('job:failed', () => process.exit(1));
    return;
  }

  // Schedule cron job
  logger.info({ schedule: CRON_SCHEDULE }, 'Scheduling dashboard populate');

  cron.schedule(CRON_SCHEDULE, () => {
    logger.info('Cron triggered dashboard populate');
    try {
      worker.createPopulateJob(cliOptions);
    } catch (error) {
      logError(logger, error, 'Failed to create scheduled job');
      Sentry.captureException(error, {
        tags: { component: 'dashboard-populate-pipeline', phase: 'cron' },
      });
    }
  });

  logger.info('Dashboard Populate Pipeline is running');

  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down gracefully');
    process.exit(0);
  });
}

main().catch((error) => {
  logError(logger, error, 'Fatal error in dashboard populate pipeline');
  Sentry.captureException(error, {
    tags: { component: 'dashboard-populate-pipeline', phase: 'startup' },
  });
  process.exit(1);
});

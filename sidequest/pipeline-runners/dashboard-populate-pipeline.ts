#!/usr/bin/env -S node --strip-types

/**
 * Dashboard Populate Pipeline - AlephAuto Integration
 *
 * Runs the quality-metrics-dashboard populate pipeline on a schedule.
 * Derives rule-based and LLM-based metrics from Claude Code session telemetry,
 * then syncs aggregated results to Cloudflare KV.
 */

import { DashboardPopulateWorker } from '../workers/dashboard-populate-worker.ts';
import { createComponentLogger, logError } from '../utils/logger.ts';
import * as Sentry from '@sentry/node';
import cron from 'node-cron';
import type { Job } from '../core/server.ts';
import { TIMEOUTS } from '../core/constants.ts';
import path from 'path';
import { fileURLToPath } from 'url';

const logger = createComponentLogger('DashboardPopulatePipeline');

const CRON_SCHEDULE = process.env.DASHBOARD_CRON_SCHEDULE || '0 6,18 * * *';

// Parse CLI args
const args = process.argv.slice(2);
const RUN_WITH_CRON = args.includes('--cron');
const RUN_ON_STARTUP = process.env.RUN_ON_STARTUP === 'true'
  || args.includes('--run-now')
  || args.includes('--run');

interface CliOptions {
  seed: boolean;
  dryRun: boolean;
  skipJudge: boolean;
  skipSync: boolean;
  limit: number | undefined;
}

const cliOptions: CliOptions = {
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

if (process.env.DASHBOARD_SEED === 'false') {
  cliOptions.seed = false;
}

function waitForJobTerminalStatus(worker: DashboardPopulateWorker, jobId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let timeoutHandle: NodeJS.Timeout | null = null;

    const cleanup = () => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      worker.off('job:completed', onCompleted);
      worker.off('job:failed', onFailed);
    };

    const rejectWithFailure = (job: Job) => {
      const message = job.error?.message ?? `Startup dashboard job ${job.id} failed`;
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

    worker.on('job:completed', onCompleted);
    worker.on('job:failed', onFailed);

    timeoutHandle = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for startup dashboard job ${jobId} after ${TIMEOUTS.ONE_HOUR_MS}ms`));
    }, TIMEOUTS.ONE_HOUR_MS);

    const currentJob = worker.getJob(jobId);
    if (!currentJob) {
      cleanup();
      reject(new Error(`Startup dashboard job ${jobId} was not found after creation`));
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
 * main.
 */
async function main(): Promise<void> {
  logger.info({
    cronSchedule: CRON_SCHEDULE,
    seed: cliOptions.seed,
    dryRun: cliOptions.dryRun,
    runOnStartup: RUN_ON_STARTUP,
  }, 'Starting Dashboard Populate Pipeline');

  const worker = new DashboardPopulateWorker({ maxConcurrent: 1 });

  worker.on('job:created', (job: Job) => {
    logger.info({
      jobId: job.id,
      seed: job.data.seed,
      dryRun: job.data.dryRun,
    }, 'Job created');
  });

  worker.on('job:started', (job: Job) => {
    logger.info({ jobId: job.id }, 'Job started');
  });

  worker.on('job:completed', (job: Job) => {
    const result = job.result as Record<string, unknown> | null;
    const durationMs = result?.durationMs;
    const steps = result?.steps as Array<unknown> | undefined;
    logger.info({
      jobId: job.id,
      durationMs,
      steps: steps?.length ?? 0,
    }, 'Job completed');
  });

  worker.on('job:failed', (job: Job) => {
    logError(logger, job.error, 'Job failed', { jobId: job.id, retryCount: job.retryCount });
    Sentry.captureException(new Error(job.error?.message ?? 'Unknown error'), {
      tags: { component: 'dashboard-populate-pipeline', job_id: job.id },
    });
  });

  let startupJob: Job | null = null;

  if (RUN_ON_STARTUP) {
    logger.info({ ...cliOptions }, 'Running populate immediately');
    try {
      startupJob = worker.createPopulateJob(cliOptions);
    } catch (error) {
      logError(logger, error, 'Failed to create startup job');
      Sentry.captureException(error, {
        tags: { component: 'dashboard-populate-pipeline', phase: 'startup' },
      });
      if (!RUN_WITH_CRON) {
        throw error;
      }
    }
  }

  if (RUN_ON_STARTUP && !RUN_WITH_CRON) {
    if (!startupJob) {
      throw new Error('Startup dashboard populate job was not created');
    }
    logger.info({ jobId: startupJob.id }, 'Waiting for startup dashboard job to finish');
    await waitForJobTerminalStatus(worker, startupJob.id);
    logger.info({ jobId: startupJob.id }, 'Startup dashboard job completed; exiting');
    return;
  }

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

function isDirectExecution(): boolean {
  const currentModulePath = fileURLToPath(import.meta.url);
  const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
  return entryPath === currentModulePath;
}

if (isDirectExecution()) {
  main().catch((error) => {
    logError(logger, error, 'Fatal error in dashboard populate pipeline');
    Sentry.captureException(error, {
      tags: { component: 'dashboard-populate-pipeline', phase: 'startup' },
    });
    process.exit(1);
  });
}

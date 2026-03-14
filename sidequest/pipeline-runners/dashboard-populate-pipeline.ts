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
import type { Job } from '../core/server.ts';
import { NUMBER_BASE, PROCESS } from '../core/constants.ts';
import { isDirectExecution } from '../utils/execution-helpers.ts';
import { BasePipeline } from './base-pipeline.ts';

const logger = createComponentLogger('DashboardPopulatePipeline');

const CRON_SCHEDULE = process.env.DASHBOARD_CRON_SCHEDULE || '0 6,18 * * *';

// Parse CLI args
const args = process.argv.slice(PROCESS.ARGV_START);
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
  cliOptions.limit = parseInt(args[limitIdx + 1], NUMBER_BASE.DECIMAL);
}

if (process.env.DASHBOARD_SEED === 'false') {
  cliOptions.seed = false;
}

class DashboardPopulatePipeline extends BasePipeline<DashboardPopulateWorker> {
  private options: CliOptions;

  constructor(options: CliOptions) {
    const worker = new DashboardPopulateWorker({ maxConcurrent: 1 });
    super(worker);
    this.options = options;

    this.setupDefaultEventListeners(logger, {
      onCreated: (job: Job) => ({
        seed: job.data.seed,
        dryRun: job.data.dryRun,
      }),
      onCompleted: (job: Job) => {
        const result = job.result as Record<string, unknown> | null;
        const steps = result?.steps as Array<unknown> | undefined;
        return { durationMs: result?.durationMs, steps: steps?.length ?? 0 };
      },
      onFailed: (job: Job) => {
        Sentry.captureException(new Error(job.error?.message ?? 'Unknown error'), {
          tags: { component: 'dashboard-populate-pipeline', job_id: job.id },
        });
        return { retryCount: job.retryCount };
      },
    });
  }

  async runOnce(): Promise<void> {
    logger.info({ ...this.options }, 'Running populate immediately');
    const job = this.worker.createPopulateJob(this.options);
    logger.info({ jobId: job.id }, 'Waiting for startup dashboard job to finish');
    await this.waitForJobTerminalStatus(job.id);
    logger.info({ jobId: job.id }, 'Startup dashboard job completed; exiting');
  }

  async start(): Promise<void> {
    if (RUN_ON_STARTUP && !RUN_WITH_CRON) {
      await this.runOnce();
      return;
    }

    if (RUN_ON_STARTUP) {
      try {
        this.worker.createPopulateJob(this.options);
      } catch (error) {
        logError(logger, error, 'Failed to create startup job');
        Sentry.captureException(error, {
          tags: { component: 'dashboard-populate-pipeline', phase: 'startup' },
        });
      }
    }

    this.scheduleCron(logger, 'dashboard populate', CRON_SCHEDULE, async () => {
      this.worker.createPopulateJob(this.options);
    });

    logger.info('Dashboard Populate Pipeline is running');
  }
}

async function main(): Promise<void> {
  logger.info({
    cronSchedule: CRON_SCHEDULE,
    seed: cliOptions.seed,
    dryRun: cliOptions.dryRun,
    runOnStartup: RUN_ON_STARTUP,
  }, 'Starting Dashboard Populate Pipeline');

  const pipeline = new DashboardPopulatePipeline(cliOptions);
  await pipeline.start();
}

if (isDirectExecution(import.meta.url)) {
  main().catch((error) => {
    logError(logger, error, 'Fatal error in dashboard populate pipeline');
    Sentry.captureException(error, {
      tags: { component: 'dashboard-populate-pipeline', phase: 'startup' },
    });
    process.exit(1);
  });
}

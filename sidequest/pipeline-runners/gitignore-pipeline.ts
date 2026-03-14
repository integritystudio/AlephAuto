#!/usr/bin/env -S node --strip-types
import { GitignoreWorker } from '../workers/gitignore-worker.ts';
import type { Job } from '../core/server.ts';
import { config } from '../core/config.ts';
import { NUMBER_BASE, PROCESS } from '../core/constants.ts';
import { createComponentLogger, logError } from '../utils/logger.ts';
import * as Sentry from '@sentry/node';
import path from 'path';
import os from 'os';
import { isDirectExecution } from '../utils/execution-helpers.ts';
import { BasePipeline } from './base-pipeline.ts';

const logger = createComponentLogger('GitignorePipeline');

interface JobData {
  type?: string;
  dryRun?: boolean;
  baseDir?: string;
  maxDepth?: number;
}

interface JobResult {
  totalRepositories?: number;
  summary?: {
    added?: number;
    skipped?: number;
    would_add?: number;
    error?: number;
  };
}

const CRON_SCHEDULE = process.env.GITIGNORE_CRON_SCHEDULE || '0 4 * * *'; // Daily at 4 AM
const BASE_DIR = process.env.GITIGNORE_BASE_DIR || path.join(os.homedir(), 'code');
const MAX_DEPTH = parseInt(process.env.GITIGNORE_MAX_DEPTH || '10', NUMBER_BASE.DECIMAL);
const DRY_RUN = process.env.GITIGNORE_DRY_RUN === 'true';

// Support both env var and --run-now flag
const args = process.argv.slice(PROCESS.ARGV_START);
const RUN_WITH_CRON = args.includes('--cron');
// || is correct here: CLI flags must also trigger when config.runOnStartup is false (boolean OR, not nullish coalescing)
const RUN_ON_STARTUP = config.runOnStartup || args.includes('--run-now') || args.includes('--run');

class GitignorePipeline extends BasePipeline<GitignoreWorker> {
  constructor() {
    const worker = new GitignoreWorker({
      baseDir: BASE_DIR,
      maxDepth: MAX_DEPTH,
      maxConcurrent: 1,
    });
    super(worker);

    this.setupDefaultEventListeners(logger, {
      onCreated: (job: Job) => {
        const data = job.data as unknown as JobData;
        return { type: data.type, dryRun: data.dryRun };
      },
      onStarted: (job: Job) => {
        const data = job.data as unknown as JobData;
        return { baseDir: data.baseDir, dryRun: data.dryRun };
      },
      onCompleted: (job: Job) => {
        const { totalRepositories, summary } = (job.result as JobResult | undefined) ?? {};
        if (summary) {
          logger.info({
            summary: {
              total: totalRepositories,
              added: summary.added,
              skipped: summary.skipped,
              wouldAdd: summary.would_add,
              errors: summary.error,
            },
          }, 'Gitignore update summary');
        }
        return {
          totalRepositories,
          added: summary?.added ?? 0,
          skipped: summary?.skipped ?? 0,
          wouldAdd: summary?.would_add ?? 0,
          errors: summary?.error ?? 0,
        };
      },
      onFailed: (job: Job) => {
        const data = job.data as unknown as JobData;
        Sentry.captureException(new Error(job.error?.message ?? 'Job failed'), {
          tags: { component: 'gitignore-pipeline', job_id: job.id },
          extra: { baseDir: data.baseDir, dryRun: data.dryRun, retryCount: job.retryCount },
        });
        return { retryCount: job.retryCount };
      },
    });
  }

  private createJob(): Job {
    return this.worker.createUpdateAllJob({
      baseDir: BASE_DIR,
      dryRun: DRY_RUN,
      maxDepth: MAX_DEPTH,
    });
  }

  async runOnce(): Promise<void> {
    logger.info('Running gitignore update immediately (RUN_ON_STARTUP=true)');
    const job = this.createJob();
    logger.info({ jobId: job.id, dryRun: DRY_RUN }, 'Startup job created');
    logger.info({ jobId: job.id }, 'Waiting for startup gitignore job to finish');
    await this.waitForJobTerminalStatus(job.id);
    logger.info({ jobId: job.id }, 'Startup gitignore job completed; exiting');
  }

  async start(): Promise<void> {
    if (RUN_ON_STARTUP && !RUN_WITH_CRON) {
      await this.runOnce();
      return;
    }

    if (RUN_ON_STARTUP) {
      try {
        const job = this.createJob();
        logger.info({ jobId: job.id, dryRun: DRY_RUN }, 'Startup job created');
      } catch (error) {
        logError(logger, error, 'Failed to create startup job');
        Sentry.captureException(error, {
          tags: { component: 'gitignore-pipeline', phase: 'startup' },
        });
      }
    }

    this.scheduleCron(logger, 'gitignore updates', CRON_SCHEDULE, async () => {
      const job = this.createJob();
      logger.info({ jobId: job.id, dryRun: DRY_RUN }, 'Scheduled job created');
    });

    logger.info('Gitignore Update Pipeline is running');
  }
}

async function main(): Promise<void> {
  logger.info({
    cronSchedule: CRON_SCHEDULE,
    baseDir: BASE_DIR,
    maxDepth: MAX_DEPTH,
    dryRun: DRY_RUN,
    runOnStartup: RUN_ON_STARTUP,
  }, 'Starting Gitignore Update Pipeline');

  const pipeline = new GitignorePipeline();
  await pipeline.start();
}

if (isDirectExecution(import.meta.url)) {
  main().catch((error: unknown) => {
    logError(logger, error, 'Fatal error in gitignore pipeline');
    Sentry.captureException(error, {
      tags: { component: 'gitignore-pipeline', phase: 'startup' },
    });
    process.exit(1);
  });
}

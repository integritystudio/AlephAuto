#!/usr/bin/env -S node --strip-types
import { RepoCleanupWorker } from '../workers/repo-cleanup-worker.ts';
import type { Job } from '../core/server.ts';
import { config } from '../core/config.ts';
import { PROCESS } from '../core/constants.ts';
import { createComponentLogger, logError } from '../utils/logger.ts';
import * as Sentry from '@sentry/node';
import path from 'path';
import os from 'os';
import { isDirectExecution } from '../utils/execution-helpers.ts';
import { BasePipeline } from './base-pipeline.ts';

const logger = createComponentLogger('RepoCleanupPipeline');

interface CleanupSummary {
  venvs?: number;
  tempFiles?: number;
  outputFiles?: number;
  buildArtifacts?: number;
  redundantDirs?: number;
}

interface JobData {
  type?: string;
  targetDir?: string;
  dryRun?: boolean;
}

interface JobResult {
  initialSize?: number;
  finalSize?: number;
  totalItems?: number;
  summary?: CleanupSummary;
}

const CRON_SCHEDULE = process.env.CLEANUP_CRON_SCHEDULE || '0 3 * * 0'; // Weekly Sunday 3 AM
const TARGET_DIR = process.env.CLEANUP_TARGET_DIR || path.join(os.homedir(), 'code');
const DRY_RUN = process.env.CLEANUP_DRY_RUN === 'true';

// Support both env var and --run-now flag
const args = process.argv.slice(PROCESS.ARGV_START);
const RUN_WITH_CRON = args.includes('--cron');
// || is correct here: CLI flags must also trigger when config.runOnStartup is false (boolean OR, not nullish coalescing)
const RUN_ON_STARTUP = config.runOnStartup || args.includes('--run-now') || args.includes('--run');

class RepoCleanupPipeline extends BasePipeline<RepoCleanupWorker> {
  constructor() {
    const worker = new RepoCleanupWorker({
      baseDir: TARGET_DIR,
      maxConcurrent: 1,
    });
    super(worker);

    this.setupDefaultEventListeners(logger, {
      onCreated: (job: Job) => {
        const data = job.data as unknown as JobData;
        return { type: data.type, targetDir: data.targetDir, dryRun: data.dryRun };
      },
      onStarted: (job: Job) => {
        const data = job.data as unknown as JobData;
        return { targetDir: data.targetDir, dryRun: data.dryRun };
      },
      onCompleted: (job: Job) => {
        const { initialSize, finalSize, totalItems, summary } = (job.result as JobResult | undefined) ?? {};
        const data = job.data as unknown as JobData;
        if (summary) {
          logger.info({
            summary: {
              totalItems,
              categories: {
                venvs: summary.venvs,
                tempFiles: summary.tempFiles,
                outputFiles: summary.outputFiles,
                buildArtifacts: summary.buildArtifacts,
                redundantDirs: summary.redundantDirs,
              },
            },
          }, 'Cleanup summary');
        }
        return {
          targetDir: data.targetDir, initialSize, finalSize, totalItems,
          venvs: summary?.venvs ?? 0, tempFiles: summary?.tempFiles ?? 0,
          buildArtifacts: summary?.buildArtifacts ?? 0, redundantDirs: summary?.redundantDirs ?? 0,
        };
      },
      onFailed: (job: Job) => {
        const data = job.data as unknown as JobData;
        Sentry.captureException(new Error(job.error?.message ?? 'Job failed'), {
          tags: { component: 'repo-cleanup-pipeline', job_id: job.id },
          extra: { targetDir: data.targetDir, dryRun: data.dryRun, retryCount: job.retryCount },
        });
        return { retryCount: job.retryCount };
      },
    });
  }

  private createJob(): Job {
    return this.worker.createCleanupJob(TARGET_DIR, { dryRun: DRY_RUN });
  }

  async runOnce(): Promise<void> {
    logger.info('Running cleanup immediately (RUN_ON_STARTUP=true)');
    const job = this.createJob();
    logger.info({ jobId: job.id, dryRun: DRY_RUN }, 'Startup job created');
    logger.info({ jobId: job.id }, 'Waiting for startup cleanup job to finish');
    await this.waitForJobTerminalStatus(job.id);
    logger.info({ jobId: job.id }, 'Startup cleanup job completed; exiting');
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
          tags: { component: 'repo-cleanup-pipeline', phase: 'startup' },
        });
      }
    }

    this.scheduleCron(logger, 'repository cleanup', CRON_SCHEDULE, async () => {
      const job = this.createJob();
      logger.info({ jobId: job.id, dryRun: DRY_RUN }, 'Scheduled job created');
    });

    logger.info('Repository Cleanup Pipeline is running');
  }
}

async function main(): Promise<void> {
  logger.info({
    cronSchedule: CRON_SCHEDULE,
    targetDir: TARGET_DIR,
    dryRun: DRY_RUN,
    runOnStartup: RUN_ON_STARTUP,
  }, 'Starting Repository Cleanup Pipeline');

  const pipeline = new RepoCleanupPipeline();
  await pipeline.start();
}

if (isDirectExecution(import.meta.url)) {
  main().catch((error: unknown) => {
    logError(logger, error, 'Fatal error in cleanup pipeline');
    Sentry.captureException(error, {
      tags: { component: 'repo-cleanup-pipeline', phase: 'startup' },
    });
    process.exit(1);
  });
}

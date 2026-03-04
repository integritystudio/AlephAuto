#!/usr/bin/env -S node --strip-types
import { GitignoreWorker } from '../workers/gitignore-worker.ts';
import type { Job } from '../core/server.ts';
import { config } from '../core/config.ts';
import { JOB_EVENTS, NUMBER_BASE, TIMEOUTS } from '../core/constants.ts';
import { createComponentLogger, logError } from '../utils/logger.ts';
import * as Sentry from '@sentry/node';
import cron from 'node-cron';
import { realpathSync } from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

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
 * - RUN_ON_STARTUP: Controlled via config.runOnStartup (opt-in) or --run-now/--run CLI flags
 */

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
const args = process.argv.slice(2);
const RUN_WITH_CRON = args.includes('--cron');
// || is correct here: CLI flags must also trigger when config.runOnStartup is false (boolean OR, not nullish coalescing)
const RUN_ON_STARTUP = config.runOnStartup || args.includes('--run-now') || args.includes('--run');

function waitForJobTerminalStatus(worker: GitignoreWorker, jobId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let timeoutHandle: NodeJS.Timeout | null = null;

    const cleanup = () => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      worker.off(JOB_EVENTS.COMPLETED, onCompleted);
      worker.off(JOB_EVENTS.FAILED, onFailed);
    };

    const rejectWithFailure = (job: Job) => {
      const message = job.error?.message ?? `Startup gitignore job ${job.id} failed`;
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

    worker.on(JOB_EVENTS.COMPLETED, onCompleted);
    worker.on(JOB_EVENTS.FAILED, onFailed);

    timeoutHandle = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for startup gitignore job ${jobId} after ${TIMEOUTS.ONE_HOUR_MS}ms`));
    }, TIMEOUTS.ONE_HOUR_MS);

    const currentJob = worker.getJob(jobId);
    if (!currentJob) {
      cleanup();
      reject(new Error(`Startup gitignore job ${jobId} was not found after creation`));
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
  worker.on(JOB_EVENTS.CREATED, (job: Job) => {
    logger.info({
      jobId: job.id,
      type: (job.data as unknown as JobData).type,
      dryRun: (job.data as unknown as JobData).dryRun
    }, 'Job created');
  });

  worker.on(JOB_EVENTS.STARTED, (job: Job) => {
    logger.info({
      jobId: job.id,
      baseDir: (job.data as unknown as JobData).baseDir,
      dryRun: (job.data as unknown as JobData).dryRun
    }, 'Job started');
  });

  worker.on(JOB_EVENTS.COMPLETED, (job: Job) => {
    const { totalRepositories, summary } = (job.result as JobResult | undefined) ?? {};

    logger.info({
      jobId: job.id,
      totalRepositories,
      added: summary?.added ?? 0,
      skipped: summary?.skipped ?? 0,
      wouldAdd: summary?.would_add ?? 0,
      errors: summary?.error ?? 0
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

  worker.on(JOB_EVENTS.FAILED, (job: Job) => {
    logError(logger, job.error, 'Job failed', { jobId: job.id, retryCount: job.retryCount });

    Sentry.captureException(new Error(job.error?.message ?? 'Job failed'), {
      tags: {
        component: 'gitignore-pipeline',
        job_id: job.id,
      },
      extra: {
        baseDir: (job.data as unknown as JobData).baseDir,
        dryRun: (job.data as unknown as JobData).dryRun,
        retryCount: job.retryCount,
      },
    });
  });

  // Run immediately if requested
  let startupJob: Job | null = null;

  if (RUN_ON_STARTUP) {
    logger.info('Running gitignore update immediately (RUN_ON_STARTUP=true)');
    try {
      startupJob = (worker as unknown as { createUpdateAllJob(opts: { baseDir: string; dryRun: boolean; maxDepth: number }): Job }).createUpdateAllJob({
        baseDir: BASE_DIR,
        dryRun: DRY_RUN,
        maxDepth: MAX_DEPTH,
      });

      logger.info({
        jobId: startupJob.id,
        dryRun: DRY_RUN
      }, 'Startup job created');
    } catch (error) {
      logError(logger, error, 'Failed to create startup job');
      Sentry.captureException(error, {
        tags: { component: 'gitignore-pipeline', phase: 'startup' },
      });
      if (!RUN_WITH_CRON) {
        throw error;
      }
    }
  }

  if (RUN_ON_STARTUP && !RUN_WITH_CRON) {
    if (!startupJob) {
      throw new Error('Startup gitignore job was not created');
    }
    logger.info({ jobId: startupJob.id }, 'Waiting for startup gitignore job to finish');
    await waitForJobTerminalStatus(worker, startupJob.id);
    logger.info({ jobId: startupJob.id }, 'Startup gitignore job completed; exiting');
    return;
  }

  // Schedule cron job
  logger.info({ schedule: CRON_SCHEDULE }, 'Scheduling gitignore updates');

  cron.schedule(CRON_SCHEDULE, () => {
    logger.info('Cron triggered gitignore update');
    try {
      const job = (worker as unknown as { createUpdateAllJob(opts: { baseDir: string; dryRun: boolean; maxDepth: number }): Job }).createUpdateAllJob({
        baseDir: BASE_DIR,
        dryRun: DRY_RUN,
        maxDepth: MAX_DEPTH,
      });

      logger.info({
        jobId: job.id,
        dryRun: DRY_RUN
      }, 'Scheduled job created');
    } catch (error) {
      logError(logger, error, 'Failed to create scheduled job');
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
  main().catch((error: unknown) => {
    logError(logger, error, 'Fatal error in gitignore pipeline');
    Sentry.captureException(error, {
      tags: { component: 'gitignore-pipeline', phase: 'startup' },
    });
    process.exit(1);
  });
}

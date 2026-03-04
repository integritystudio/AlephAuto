#!/usr/bin/env -S node --strip-types
import { RepoCleanupWorker } from '../workers/repo-cleanup-worker.ts';
import type { Job } from '../core/server.ts';
import { config } from '../core/config.ts';
import { TIMEOUTS } from '../core/constants.ts';
import { createComponentLogger, logError } from '../utils/logger.ts';
import * as Sentry from '@sentry/node';
import cron from 'node-cron';
import path from 'path';
import os from 'os';

const logger = createComponentLogger('RepoCleanupPipeline');

/**
 * Repository Cleanup Pipeline
 *
 * Automated repository cleanup across directories.
 * Removes common bloat files: Python venvs, .DS_Store, build artifacts, temp files.
 *
 * Features:
 * - Scheduled cleanup via cron
 * - Dry-run mode for testing
 * - Job queue integration
 * - Sentry error tracking
 * - Event-driven architecture
 *
 * Environment Variables:
 * - CLEANUP_CRON_SCHEDULE: Cron schedule (default: "0 3 * * 0" - Weekly Sunday 3 AM)
 * - CLEANUP_TARGET_DIR: Directory to clean (default: ~/code)
 * - CLEANUP_DRY_RUN: Dry run mode (default: false)
 * - RUN_ON_STARTUP: Controlled via config.runOnStartup (opt-in) or --run-now/--run CLI flags
 *
 * Usage:
 *   npm run cleanup           # Start cron server
 *   npm run cleanup:once      # Run once and exit
 *   npm run cleanup:dryrun    # Dry run preview
 */

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
const args = process.argv.slice(2);
const RUN_WITH_CRON = args.includes('--cron');
// || is correct here: CLI flags must also trigger when config.runOnStartup is false (boolean OR, not nullish coalescing)
const RUN_ON_STARTUP = config.runOnStartup || args.includes('--run-now') || args.includes('--run');

function waitForJobTerminalStatus(worker: RepoCleanupWorker, jobId: string): Promise<void> {
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
      const message = job.error?.message ?? `Startup cleanup job ${job.id} failed`;
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
      reject(new Error(`Timed out waiting for startup cleanup job ${jobId} after ${TIMEOUTS.ONE_HOUR_MS}ms`));
    }, TIMEOUTS.ONE_HOUR_MS);

    const currentJob = worker.getJob(jobId);
    if (!currentJob) {
      cleanup();
      reject(new Error(`Startup cleanup job ${jobId} was not found after creation`));
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
    targetDir: TARGET_DIR,
    dryRun: DRY_RUN,
    runOnStartup: RUN_ON_STARTUP,
  }, 'Starting Repository Cleanup Pipeline');

  // Create worker instance
  const worker = new RepoCleanupWorker({
    baseDir: TARGET_DIR,
    maxConcurrent: 1, // Process one cleanup at a time
  });

  // Event listeners
  worker.on('job:created', (job: Job) => {
    logger.info({
      jobId: job.id,
      type: (job.data as unknown as JobData).type,
      targetDir: (job.data as unknown as JobData).targetDir,
      dryRun: (job.data as unknown as JobData).dryRun,
    }, 'Job created');
  });

  worker.on('job:started', (job: Job) => {
    logger.info({
      jobId: job.id,
      targetDir: (job.data as unknown as JobData).targetDir,
      dryRun: (job.data as unknown as JobData).dryRun,
    }, 'Job started');
  });

  worker.on('job:completed', (job: Job) => {
    const { initialSize, finalSize, totalItems, summary } = (job.result as JobResult | undefined) ?? {};

    logger.info({
      jobId: job.id,
      targetDir: (job.data as unknown as JobData).targetDir,
      initialSize,
      finalSize,
      totalItems,
      venvs: summary?.venvs ?? 0,
      tempFiles: summary?.tempFiles ?? 0,
      buildArtifacts: summary?.buildArtifacts ?? 0,
      redundantDirs: summary?.redundantDirs ?? 0,
    }, 'Job completed');

    // Log detailed summary
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
  });

  worker.on('job:failed', (job: Job) => {
    logError(logger, job.error, 'Job failed', { jobId: job.id, retryCount: job.retryCount });

    Sentry.captureException(new Error(job.error?.message ?? 'Job failed'), {
      tags: {
        component: 'repo-cleanup-pipeline',
        job_id: job.id,
      },
      extra: {
        targetDir: (job.data as unknown as JobData).targetDir,
        dryRun: (job.data as unknown as JobData).dryRun,
        retryCount: job.retryCount,
      },
    });
  });

  // Run immediately if requested
  let startupJob: Job | null = null;

  if (RUN_ON_STARTUP) {
    logger.info('Running cleanup immediately (RUN_ON_STARTUP=true)');
    try {
      startupJob = (worker as unknown as { createCleanupJob(dir: string, opts: { dryRun: boolean }): Job }).createCleanupJob(TARGET_DIR, {
        dryRun: DRY_RUN,
      });

      logger.info({
        jobId: startupJob.id,
        dryRun: DRY_RUN,
      }, 'Startup job created');
    } catch (error) {
      logError(logger, error, 'Failed to create startup job');
      Sentry.captureException(error, {
        tags: { component: 'repo-cleanup-pipeline', phase: 'startup' },
      });
      if (!RUN_WITH_CRON) {
        throw error;
      }
    }
  }

  if (RUN_ON_STARTUP && !RUN_WITH_CRON) {
    if (!startupJob) {
      throw new Error('Startup cleanup job was not created');
    }
    logger.info({ jobId: startupJob.id }, 'Waiting for startup cleanup job to finish');
    await waitForJobTerminalStatus(worker, startupJob.id);
    logger.info({ jobId: startupJob.id }, 'Startup cleanup job completed; exiting');
    return;
  }

  // Schedule cron job
  logger.info({ schedule: CRON_SCHEDULE }, 'Scheduling repository cleanup');

  cron.schedule(CRON_SCHEDULE, () => {
    logger.info('Cron triggered cleanup');
    try {
      const job = (worker as unknown as { createCleanupJob(dir: string, opts: { dryRun: boolean }): Job }).createCleanupJob(TARGET_DIR, {
        dryRun: DRY_RUN,
      });

      logger.info({
        jobId: job.id,
        dryRun: DRY_RUN,
      }, 'Scheduled job created');
    } catch (error) {
      logError(logger, error, 'Failed to create scheduled job');
      Sentry.captureException(error, {
        tags: { component: 'repo-cleanup-pipeline', phase: 'cron' },
      });
    }
  });

  logger.info('Repository Cleanup Pipeline is running');

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
main().catch((error: unknown) => {
  logError(logger, error, 'Fatal error in cleanup pipeline');
  Sentry.captureException(error, {
    tags: { component: 'repo-cleanup-pipeline', phase: 'startup' },
  });
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Test Refactor Pipeline
 *
 * Scans repositories for test suites and generates modular utility files.
 * Part of the AlephAuto framework.
 *
 * Usage:
 *   node pipelines/test-refactor-pipeline.js                    # Scan all repos
 *   node pipelines/test-refactor-pipeline.js /path/to/project   # Single project
 *   DRY_RUN=true node pipelines/test-refactor-pipeline.js       # Analysis only
 */

import { TestRefactorWorker } from '../workers/test-refactor-worker.ts';
import { DirectoryScanner } from '../utils/directory-scanner.ts';
import { createComponentLogger } from '../utils/logger.ts';
import { config } from '../core/config.ts';
import { TIMEOUTS } from '../core/constants.ts';
// @ts-ignore — no declaration file for node-cron
import cron from 'node-cron';
import path from 'path';

const logger = createComponentLogger('TestRefactorPipeline');

// Configuration
const CODE_BASE_DIR = process.env.CODE_BASE_DIR || config.codeBaseDir || process.env.HOME + '/code';
const CRON_SCHEDULE = process.env.TEST_REFACTOR_CRON || '0 4 * * 0'; // Sunday 4 AM
const RUN_ON_STARTUP = process.env.RUN_ON_STARTUP !== 'false';
const DRY_RUN = process.env.DRY_RUN === 'true';
const ENABLE_GIT_WORKFLOW = process.env.ENABLE_GIT_WORKFLOW === 'true';

interface DirectoryInfo {
  path: string;
  name: string;
}

interface PipelineMetrics {
  totalProjects: number;
  successfulRefactors: number;
  failedRefactors: number;
  filesGenerated: number;
  patternsDetected: number;
  stringsExtracted: number;
  recommendationsGenerated: number;
}

interface PipelineStats {
  total: number;
  queued: number;
  active: number;
  completed: number;
  failed: number;
}

interface PipelineResult {
  metrics: PipelineMetrics;
  stats: PipelineStats;
}

/**
 * Run the test refactoring pipeline
 */
async function runPipeline(targetPath: string | null = null): Promise<PipelineResult> {
  logger.info({
    codeBaseDir: CODE_BASE_DIR,
    targetPath,
    dryRun: DRY_RUN
  }, 'Starting test refactor pipeline');

  const worker = new TestRefactorWorker({
    dryRun: DRY_RUN,
    gitWorkflowEnabled: ENABLE_GIT_WORKFLOW,
    maxConcurrent: parseInt(process.env.MAX_CONCURRENT || '3', 10)
  });

  // Set up event handlers
  worker.on('job:created', ((job: any) => {
    logger.debug({ jobId: job.id, project: job.data.repository }, 'Job created');
  }) as (...args: any[]) => void);

  worker.on('job:started', ((job: any) => {
    logger.info({ jobId: job.id, project: job.data.repository }, 'Job started');
  }) as (...args: any[]) => void);

  worker.on('job:completed', ((job: any) => {
    const result = job.result;
    logger.info({
      jobId: job.id,
      project: job.data.repository,
      filesGenerated: result.generatedFiles?.length || 0,
      recommendations: result.recommendations?.length || 0
    }, 'Job completed');
  }) as (...args: any[]) => void);

  worker.on('job:failed', ((job: any, error: Error) => {
    logger.error({
      jobId: job.id,
      project: job.data.repository,
      error: error.message
    }, 'Job failed');
  }) as (...args: any[]) => void);

  try {
    if (targetPath) {
      // Single project mode
      const resolvedPath = path.resolve(targetPath);
      worker.queueProject(resolvedPath);
    } else {
      // Scan all repositories
      const scanner = new DirectoryScanner({
        baseDir: CODE_BASE_DIR,
        maxDepth: 2,
        excludeDirs: [
          'node_modules',
          '.git',
          'dist',
          'build',
          'coverage',
          '__pycache__',
          '.venv',
          'venv'
        ]
      });

      const directories = await scanner.scanDirectories();

      // Filter to directories that have test files
      for (const dir of directories) {
        const hasTests = await hasTestDirectory(dir.fullPath);
        if (hasTests) {
          worker.queueProject(dir.fullPath);
        }
      }

      logger.info({
        totalDirectories: directories.length,
        queuedJobs: worker.queue.length
      }, 'Scan complete, jobs queued');
    }

    // Wait for all jobs to complete
    await waitForCompletion(worker);

    const metrics = worker.getMetrics();
    const stats = worker.getStats();

    logger.info({
      ...metrics,
      ...stats
    }, 'Pipeline completed');

    return { metrics, stats };

  } catch (error) {
    logger.error({ err: error }, 'Pipeline failed');
    throw error;
  }
}

/**
 * Check if directory has test files
 */
async function hasTestDirectory(dirPath: string): Promise<boolean> {
  const { glob } = await import('glob');

  const testFiles = await glob('**/*.{test,spec}.{ts,tsx,js,jsx}', {
    cwd: dirPath,
    ignore: ['**/node_modules/**'],
    nodir: true
  });

  return testFiles.length > 0;
}

/**
 * Wait for all jobs to complete
 */
function waitForCompletion(worker: TestRefactorWorker): Promise<void> {
  return new Promise((resolve) => {
    const checkCompletion = () => {
      const stats = worker.getStats();
      if (stats.queued === 0 && stats.active === 0) {
        resolve();
      } else {
        setTimeout(checkCompletion, TIMEOUTS.POLL_INTERVAL_MS);
      }
    };
    checkCompletion();
  });
}

// Main execution
async function main(): Promise<void> {
  const targetPath = process.argv[2];

  if (targetPath) {
    // Single project mode
    await runPipeline(targetPath);
  } else if (RUN_ON_STARTUP) {
    // Run immediately
    await runPipeline();
  }

  // Schedule cron job
  if (!targetPath) {
    logger.info({ schedule: CRON_SCHEDULE }, 'Scheduling cron job');

    cron.schedule(CRON_SCHEDULE, async () => {
      logger.info('Running scheduled test refactor pipeline');
      await runPipeline();
    });

    // Keep process alive
    process.on('SIGINT', () => {
      logger.info('Shutting down');
      process.exit(0);
    });
  }
}

main().catch(error => {
  logger.error({ err: error }, 'Fatal error');
  process.exit(1);
});

export { runPipeline };

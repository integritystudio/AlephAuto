#!/usr/bin/env -S node --strip-types
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
import type { Job as BaseJob } from '../core/server.ts';
import { DirectoryScanner } from '../utils/directory-scanner.ts';
import { createComponentLogger } from '../utils/logger.ts';
import { config } from '../core/config.ts';
import { CONCURRENCY, TIMEOUTS } from '../core/constants.ts';
import { isDirectExecution } from '../utils/execution-helpers.ts';
import { BasePipeline } from './base-pipeline.ts';
import path from 'path';

const logger = createComponentLogger('TestRefactorPipeline');

// Configuration
const CODE_BASE_DIR = config.codeBaseDir;
const CRON_SCHEDULE = process.env.TEST_REFACTOR_CRON || '0 4 * * 0'; // Sunday 4 AM
const RUN_ON_STARTUP = process.env.RUN_ON_STARTUP !== 'false'; // opt-out default; intentionally differs from config.runOnStartup (opt-in)
const DRY_RUN = process.env.DRY_RUN === 'true';
const ENABLE_GIT_WORKFLOW = config.enableGitWorkflow;

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

class TestRefactorPipeline extends BasePipeline<TestRefactorWorker> {
  constructor() {
    const worker = new TestRefactorWorker({
      dryRun: DRY_RUN,
      gitWorkflowEnabled: ENABLE_GIT_WORKFLOW,
      maxConcurrent: config.maxConcurrent ?? CONCURRENCY.DEFAULT_PIPELINE_CONCURRENCY,
    });
    super(worker);

    this.setupDefaultEventListeners(logger, {
      onCreated: (job: BaseJob) => ({ project: job.data['repository'] }),
      onCompleted: (job: BaseJob) => {
        const result = job.result as { generatedFiles?: unknown[]; recommendations?: unknown[] } | null;
        return {
          project: job.data['repository'],
          filesGenerated: result?.generatedFiles?.length ?? 0,
          recommendations: result?.recommendations?.length ?? 0,
        };
      },
      onFailed: (job: BaseJob) => ({ project: job.data['repository'] }),
    });
  }

  async run(targetPath: string | null = null): Promise<PipelineResult> {
    logger.info({
      codeBaseDir: CODE_BASE_DIR,
      targetPath,
      dryRun: DRY_RUN,
    }, 'Starting test refactor pipeline');

    try {
      if (targetPath) {
        const resolvedPath = path.resolve(targetPath);
        this.worker.queueProject(resolvedPath);
      } else {
        const scanner = new DirectoryScanner({
          baseDir: CODE_BASE_DIR,
          maxDepth: 2,
          excludeDirs: [
            'node_modules', '.git', 'dist', 'build',
            'coverage', '__pycache__', '.venv', 'venv',
          ],
        });

        const directories = await scanner.scanDirectories();

        for (const dir of directories) {
          if (await hasTestDirectory(dir.fullPath)) {
            this.worker.queueProject(dir.fullPath);
          }
        }

        logger.info({
          totalDirectories: directories.length,
          queuedJobs: this.worker.queue.length,
        }, 'Scan complete, jobs queued');
      }

      await this.waitForCompletion(TIMEOUTS.ONE_HOUR_MS);

      const metrics = this.worker.getMetrics();
      const stats = this.getStats();

      logger.info({ ...metrics, ...stats }, 'Pipeline completed');

      return { metrics, stats };
    } catch (error) {
      logger.error({ err: error }, 'Pipeline failed');
      throw error;
    }
  }

  startCron(): void {
    this.scheduleCron(logger, 'test refactor', CRON_SCHEDULE, async () => {
      logger.info('Running scheduled test refactor pipeline');
      await this.run();
    });
  }
}

async function hasTestDirectory(dirPath: string): Promise<boolean> {
  const { glob } = await import('glob');
  const testFiles = await glob('**/*.{test,spec}.{ts,tsx,js,jsx}', {
    cwd: dirPath,
    ignore: ['**/node_modules/**'],
    nodir: true,
  });
  return testFiles.length > 0;
}

/**
 * Run the test refactoring pipeline.
 * Backward-compatible named export.
 */
async function runPipeline(targetPath: string | null = null): Promise<PipelineResult> {
  const pipeline = new TestRefactorPipeline();
  return pipeline.run(targetPath);
}

async function main(): Promise<void> {
  const targetPath = process.argv[2];

  if (targetPath) {
    await runPipeline(targetPath);
  } else if (RUN_ON_STARTUP) {
    await runPipeline();
  }

  if (!targetPath) {
    const pipeline = new TestRefactorPipeline();
    pipeline.startCron();
  }
}

if (isDirectExecution(import.meta.url)) {
  main().catch(error => {
    logger.error({ err: error }, 'Fatal error');
    process.exit(1);
  });
}

export { runPipeline };

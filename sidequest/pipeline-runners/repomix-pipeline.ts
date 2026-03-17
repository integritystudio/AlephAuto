#!/usr/bin/env -S node --strip-types
/**
 * Repomix Pipeline
 *
 * Scans code directories and runs repomix on each, generating packed outputs.
 * Part of the AlephAuto framework.
 *
 * Usage:
 *   node pipeline-runners/repomix-pipeline.ts   # Cron mode
 *   RUN_ON_STARTUP=true node pipeline-runners/repomix-pipeline.ts
 */

import { RepomixWorker } from '../workers/repomix-worker.ts';
import { DirectoryScanner } from '../utils/directory-scanner.ts';
import { createComponentLogger, logError, logStart } from '../utils/logger.ts';
import { config } from '../core/config.ts';
import { FORMATTING, LIMITS, TIMEOUTS } from '../core/constants.ts';
import { TIME_MS } from '../core/units.ts';
import { isDirectExecution } from '../utils/execution-helpers.ts';
import { BasePipeline } from './base-pipeline.ts';
import type { Job, JobStats } from '../core/server.ts';
import path from 'path';
import fs from 'fs/promises';

const logger = createComponentLogger('RepomixPipeline');

interface ScanDirectory {
  fullPath: string;
  relativePath: string;
}

interface TypedDirectoryScanner {
  baseDir: string;
  scanDirectories(): Promise<ScanDirectory[]>;
  generateAndSaveScanResults(dirs: ScanDirectory[]): Promise<{
    reportPath: string;
    treePath: string;
    summaryPath: string;
    summary: { maxDepth: number; stats: { topDirectoryNames: Array<{ name: string }> } };
  }>;
}

class RepomixPipeline extends BasePipeline<RepomixWorker> {
  private scanner: TypedDirectoryScanner;

  constructor() {
    const worker = new RepomixWorker({
      maxConcurrent: config.maxConcurrent,
      outputBaseDir: config.outputBaseDir,
      codeBaseDir: config.codeBaseDir,
      logDir: config.logDir,
    });
    super(worker);

    this.scanner = new DirectoryScanner({
      baseDir: config.codeBaseDir,
      outputDir: config.scanReportsDir,
      excludeDirs: config.excludeDirs,
    }) as unknown as TypedDirectoryScanner;

    this.setupDefaultEventListeners(logger, {
      onStarted: (job: Job) => ({ relativePath: job.data['relativePath'] }),
      onCompleted: (job: Job) => ({ relativePath: job.data['relativePath'] }),
      onFailed: (job: Job) => ({ relativePath: job.data['relativePath'] }),
    });
  }

  async runAll(): Promise<void> {
    logStart(logger, 'repomix run', { baseDir: this.scanner.baseDir });

    const startTime = Date.now();

    try {
      const directories = await this.scanner.scanDirectories();
      logger.info({ directoryCount: directories.length }, 'Directories found');

      logger.info('Saving scan results');
      const scanResults = await this.scanner.generateAndSaveScanResults(directories);
      const { summary } = scanResults;
      logger.info({
        reportPath: scanResults.reportPath,
        treePath: scanResults.treePath,
        summaryPath: scanResults.summaryPath,
        maxDepth: summary.maxDepth,
        topDirectories: summary.stats.topDirectoryNames.slice(0, LIMITS.SHORT_PREVIEW_COUNT).map(d => d.name),
      }, 'Scan results saved');

      let jobCount = 0;
      for (const dir of directories) {
        this.worker.createRepomixJob(dir.fullPath, dir.relativePath);
        jobCount++;
      }
      logger.info({ jobCount }, 'Jobs created');

      await this.waitForCompletion(TIMEOUTS.SCAN_COMPLETION_WAIT_MS);

      const duration = Date.now() - startTime;
      const workerStats = this.worker.getStats();

      logger.info({
        durationSeconds: Math.round(duration / TIME_MS.SECOND),
        totalJobs: workerStats.total,
        completed: workerStats.completed,
        failed: workerStats.failed,
      }, 'Repomix run complete');

      await this.saveRunSummary(workerStats, duration);
    } catch (error) {
      logError(logger, error, 'Error during repomix run');
      throw error;
    }
  }

  private async saveRunSummary(stats: JobStats, duration: number): Promise<void> {
    const summary = {
      timestamp: new Date().toISOString(),
      duration,
      stats,
    };

    const summaryPath = path.join(this.worker.logDir, `run-summary-${Date.now()}.json`);
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, FORMATTING.JSON_INDENT));
  }

  async start(): Promise<void> {
    logger.info({
      codeDirectory: this.scanner.baseDir,
      outputDirectory: this.worker.outputBaseDir,
      logDirectory: this.worker.logDir,
    }, 'Repomix Pipeline starting');

    this.scheduleCron(logger, 'repomix', config.repomixSchedule, () => this.runAll());

    if (config.runOnStartup) {
      logger.info('Running immediately (RUN_ON_STARTUP=true)');
      await this.runAll();
    }

    logger.info('Server running. Press Ctrl+C to exit');
  }
}

async function main(): Promise<void> {
  const pipeline = new RepomixPipeline();
  await pipeline.start();
}

if (isDirectExecution(import.meta.url)) {
  main().catch((error) => {
    logError(logger, error, 'Fatal error');
    process.exit(1);
  });
}

export { RepomixPipeline };

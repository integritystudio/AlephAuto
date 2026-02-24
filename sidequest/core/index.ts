import cron from 'node-cron';
import { RepomixWorker } from '../workers/repomix-worker.ts';
import { DirectoryScanner } from '../utils/directory-scanner.ts';
import { config } from './config.ts';
import { TIMEOUTS, TIME } from './constants.ts';
import path from 'path';
import fs from 'fs/promises';
import { createComponentLogger, logError, logStart } from '../utils/logger.ts';
import type { Job, JobStats } from './server.ts';

const logger = createComponentLogger('RepomixCronApp');

// Cast config to access dynamic properties
const cfg = config as Record<string, unknown>;

/** Typed shapes for JS classes (pending Phase 7-10 migration) */
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
    summary: {
      maxDepth: number;
      stats: { topDirectoryNames: Array<{ name: string }> };
    };
  }>;
}

interface TypedRepomixWorker {
  logDir: string;
  outputBaseDir: string;
  createRepomixJob(fullPath: string, relativePath: string): void;
  getStats(): JobStats;
  on(event: string, listener: (job: Job) => void): this;
}

/**
 * Main application entry point
 */
class RepomixCronApp {
  private worker: TypedRepomixWorker;
  private scanner: TypedDirectoryScanner;

  constructor() {
    this.worker = new RepomixWorker({
      maxConcurrent: cfg.maxConcurrent as number,
      outputBaseDir: cfg.outputBaseDir as string,
      codeBaseDir: cfg.codeBaseDir as string,
      logDir: cfg.logDir as string,
      sentryDsn: cfg.sentryDsn as string,
    }) as unknown as TypedRepomixWorker;

    this.scanner = new DirectoryScanner({
      baseDir: cfg.codeBaseDir as string,
      outputDir: cfg.scanReportsDir as string,
      excludeDirs: cfg.excludeDirs as string[],
    }) as unknown as TypedDirectoryScanner;

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.worker.on('job:created', (job: Job) => {
      logger.info({ jobId: job.id }, 'Job created');
    });

    this.worker.on('job:started', (job: Job) => {
      logger.info({ jobId: job.id, relativePath: job.data.relativePath }, 'Job started');
    });

    this.worker.on('job:completed', (job: Job) => {
      const duration = new Date(job.completedAt!).getTime() - new Date(job.startedAt!).getTime();
      logger.info({
        jobId: job.id,
        relativePath: job.data.relativePath,
        duration
      }, 'Job completed');
    });

    this.worker.on('job:failed', (job: Job) => {
      logger.error({
        jobId: job.id,
        relativePath: job.data.relativePath,
        error: job.error
      }, 'Job failed');
    });
  }

  async runRepomixOnAllDirectories(): Promise<void> {
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
        topDirectories: summary.stats.topDirectoryNames.slice(0, 3).map(d => d.name)
      }, 'Scan results saved');

      let jobCount = 0;
      for (const dir of directories) {
        this.worker.createRepomixJob(dir.fullPath, dir.relativePath);
        jobCount++;
      }

      logger.info({ jobCount }, 'Jobs created');

      await this.waitForCompletion();

      const duration = Date.now() - startTime;
      const workerStats = this.worker.getStats();

      logger.info({
        durationSeconds: Math.round(duration / TIME.SECOND),
        totalJobs: workerStats.total,
        completed: workerStats.completed,
        failed: workerStats.failed
      }, 'Repomix run complete');

      await this.saveRunSummary(workerStats, duration);

    } catch (error) {
      logError(logger, error, 'Error during repomix run');
      throw error;
    }
  }

  private async waitForCompletion(): Promise<void> {
    const maxWaitMs = 30 * 60 * TIME.SECOND;
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error(`waitForCompletion timed out after ${maxWaitMs}ms`));
      }, maxWaitMs);

      const checkInterval = setInterval(() => {
        const stats = this.worker.getStats();
        if (stats.active === 0 && stats.queued === 0) {
          clearInterval(checkInterval);
          clearTimeout(timer);
          resolve();
        }
      }, TIMEOUTS.POLL_INTERVAL_MS);
    });
  }

  private async saveRunSummary(stats: JobStats, duration: number): Promise<void> {
    const summary = {
      timestamp: new Date().toISOString(),
      duration,
      stats,
    };

    const summaryPath = path.join(this.worker.logDir, `run-summary-${Date.now()}.json`);
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
  }

  private setupCronJob(schedule: string = '0 2 * * *'): void {
    logger.info({ schedule }, 'Setting up cron job');

    cron.schedule(schedule, async () => {
      logger.info({ triggerTime: new Date().toISOString() }, 'Cron job triggered');
      try {
        await this.runRepomixOnAllDirectories();
      } catch (error) {
        logError(logger, error, 'Cron job failed');
      }
    });

    logger.info('Cron job scheduled successfully');
  }

  async start(): Promise<void> {
    logger.info({
      codeDirectory: this.scanner.baseDir,
      outputDirectory: this.worker.outputBaseDir,
      logDirectory: this.worker.logDir
    }, 'Repomix Cron Sidequest Server starting');

    this.setupCronJob(cfg.repomixSchedule as string);

    if (cfg.runOnStartup) {
      logger.info('Running immediately (RUN_ON_STARTUP=true)');
      await this.runRepomixOnAllDirectories();
    }

    logger.info('Server running. Press Ctrl+C to exit');
  }
}

// Auto-executing entry point: importing this module starts the application.
// This file lives in core/ for historical reasons but functions as a pipeline runner.
const app = new RepomixCronApp();
app.start().catch((error) => {
  logError(logger, error, 'Fatal error');
  process.exit(1);
});

import cron from 'node-cron';
import { RepomixWorker } from '../workers/repomix-worker.ts';
import { DirectoryScanner } from '../utils/directory-scanner.ts';
import { config } from './config.ts';
import { FORMATTING, JOB_EVENTS, LIMITS, TIMEOUTS } from './constants.ts';
import { TIME_MS } from './units.ts';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { createComponentLogger, logError, logStart } from '../utils/logger.ts';
import type { Job, JobStats } from './server.ts';

const logger = createComponentLogger('RepomixCronApp');

/** Typed shapes for JS classes (pending Phase 7-10 migration) */
interface ScanDirectory {
  fullPath: string;
  relativePath: string;
}

interface TypedDirectoryScanner {
  baseDir: string;
  scanDirectories(): Promise<ScanDirectory[]>;
  /**
   * generateAndSaveScanResults.
   */
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

export function isWorkerIdle(stats: JobStats): boolean {
  return stats.active === 0 && stats.queued === 0 && stats.pendingRetries === 0;
}

/**
 * Main application entry point
 */
export class RepomixCronApp {
  private worker: TypedRepomixWorker;
  private scanner: TypedDirectoryScanner;

  /**
   * constructor.
   */
  constructor() {
    this.worker = new RepomixWorker({
      maxConcurrent: config.maxConcurrent,
      outputBaseDir: config.outputBaseDir,
      codeBaseDir: config.codeBaseDir,
      logDir: config.logDir,
      sentryDsn: config.sentryDsn,
    }) as unknown as TypedRepomixWorker;

    this.scanner = new DirectoryScanner({
      baseDir: config.codeBaseDir,
      outputDir: config.scanReportsDir,
      excludeDirs: config.excludeDirs,
    }) as unknown as TypedDirectoryScanner;

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.worker.on(JOB_EVENTS.CREATED, (job: Job) => {
      logger.info({ jobId: job.id }, 'Job created');
    });

    this.worker.on(JOB_EVENTS.STARTED, (job: Job) => {
      logger.info({ jobId: job.id, relativePath: job.data.relativePath }, 'Job started');
    });

    this.worker.on(JOB_EVENTS.COMPLETED, (job: Job) => {
      const startedAtMs = job.startedAt?.getTime();
      const completedAtMs = job.completedAt?.getTime();
      const duration = (typeof startedAtMs === 'number' && typeof completedAtMs === 'number')
        ? completedAtMs - startedAtMs
        : null;
      logger.info({
        jobId: job.id,
        relativePath: job.data.relativePath,
        duration
      }, 'Job completed');
    });

    this.worker.on(JOB_EVENTS.FAILED, (job: Job) => {
      logger.error({
        jobId: job.id,
        relativePath: job.data.relativePath,
        error: job.error
      }, 'Job failed');
    });
  }

  /**
   * runRepomixOnAllDirectories.
   */
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
        topDirectories: summary.stats.topDirectoryNames.slice(0, LIMITS.SHORT_PREVIEW_COUNT).map(d => d.name)
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
        durationSeconds: Math.round(duration / TIME_MS.SECOND),
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
    const maxWaitMs = TIMEOUTS.SCAN_COMPLETION_WAIT_MS;
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error(`waitForCompletion timed out after ${maxWaitMs}ms`));
      }, maxWaitMs);

      const checkInterval = setInterval(() => {
        const stats = this.worker.getStats();
        if (isWorkerIdle(stats)) {
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
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, FORMATTING.JSON_INDENT));
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

  /**
   * start.
   */
  async start(): Promise<void> {
    logger.info({
      codeDirectory: this.scanner.baseDir,
      outputDirectory: this.worker.outputBaseDir,
      logDirectory: this.worker.logDir
    }, 'Repomix Cron Sidequest Server starting');

    this.setupCronJob(config.repomixSchedule);

    if (config.runOnStartup) {
      logger.info('Running immediately (RUN_ON_STARTUP=true)');
      await this.runRepomixOnAllDirectories();
    }

    logger.info('Server running. Press Ctrl+C to exit');
  }
}

function isDirectExecution(): boolean {
  const currentModulePath = fileURLToPath(import.meta.url);
  const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
  return entryPath === currentModulePath;
}

// Entrypoint mode: run only when invoked directly, not when imported by tests/tools.
if (isDirectExecution()) {
  const app = new RepomixCronApp();
  app.start().catch((error) => {
    logError(logger, error, 'Fatal error');
    process.exit(1);
  });
}

import cron from 'node-cron';
import { RepomixWorker } from './repomix-worker.js';
import { DirectoryScanner } from './directory-scanner.js';
import { config } from './config.js';
import path from 'path';
import fs from 'fs/promises';
import { createComponentLogger } from '../utils/logger.js';

const logger = createComponentLogger('RepomixCronApp');

/**
 * Main application entry point
 */
class RepomixCronApp {
  constructor() {
    this.worker = new RepomixWorker({
      maxConcurrent: config.maxConcurrent,
      outputBaseDir: config.outputBaseDir,
      codeBaseDir: config.codeBaseDir,
      logDir: config.logDir,
      sentryDsn: config.sentryDsn,
    });

    this.scanner = new DirectoryScanner({
      baseDir: config.codeBaseDir,
      outputDir: config.scanReportsDir,
      excludeDirs: config.excludeDirs,
    });

    this.setupEventListeners();
  }

  /**
   * Setup event listeners for job events
   */
  setupEventListeners() {
    this.worker.on('job:created', (job) => {
      logger.info({ jobId: job.id }, 'Job created');
    });

    this.worker.on('job:started', (job) => {
      logger.info({ jobId: job.id, relativePath: job.data.relativePath }, 'Job started');
    });

    this.worker.on('job:completed', (job) => {
      const duration = job.completedAt - job.startedAt;
      logger.info({
        jobId: job.id,
        relativePath: job.data.relativePath,
        duration
      }, 'Job completed');
    });

    this.worker.on('job:failed', (job) => {
      logger.error({
        jobId: job.id,
        relativePath: job.data.relativePath,
        error: job.error
      }, 'Job failed');
    });
  }

  /**
   * Run repomix on all directories
   */
  async runRepomixOnAllDirectories() {
    logger.info({ baseDir: this.scanner.baseDir }, 'Starting repomix run');

    const startTime = Date.now();

    try {
      // Scan all directories
      const directories = await this.scanner.scanDirectories();
      logger.info({ directoryCount: directories.length }, 'Directories found');

      // Save scan results
      logger.info('Saving scan results');
      const scanResults = await this.scanner.generateAndSaveScanResults(directories);
      logger.info({
        reportPath: scanResults.reportPath,
        treePath: scanResults.treePath,
        summaryPath: scanResults.summaryPath,
        maxDepth: scanResults.summary.maxDepth,
        topDirectories: scanResults.summary.stats.topDirectoryNames.slice(0, 3).map(d => d.name)
      }, 'Scan results saved');

      // Create jobs for each directory
      let jobCount = 0;
      for (const dir of directories) {
        this.worker.createRepomixJob(dir.fullPath, dir.relativePath);
        jobCount++;
      }

      logger.info({ jobCount }, 'Jobs created');

      // Wait for all jobs to complete
      await this.waitForCompletion();

      const duration = Date.now() - startTime;
      const stats = this.worker.getStats();

      logger.info({
        durationSeconds: Math.round(duration / 1000),
        totalJobs: stats.total,
        completed: stats.completed,
        failed: stats.failed
      }, 'Repomix run complete');

      // Save run summary
      await this.saveRunSummary(stats, duration);

    } catch (error) {
      logger.error({ err: error }, 'Error during repomix run');
      throw error;
    }
  }

  /**
   * Wait for all jobs to complete
   */
  async waitForCompletion() {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const stats = this.worker.getStats();
        if (stats.active === 0 && stats.queued === 0) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 1000);
    });
  }

  /**
   * Save run summary to logs
   */
  async saveRunSummary(stats, duration) {
    const summary = {
      timestamp: new Date().toISOString(),
      duration,
      stats,
    };

    const summaryPath = path.join('../logs', `run-summary-${Date.now()}.json`);
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
  }

  /**
   * Setup cron job
   */
  setupCronJob(schedule = '0 2 * * *') {
    // Default: Run at 2 AM every day
    logger.info({ schedule }, 'Setting up cron job');

    cron.schedule(schedule, async () => {
      logger.info({ triggerTime: new Date().toISOString() }, 'Cron job triggered');
      try {
        await this.runRepomixOnAllDirectories();
      } catch (error) {
        logger.error({ err: error }, 'Cron job failed');
      }
    });

    logger.info('Cron job scheduled successfully');
  }

  /**
   * Start the application
   */
  async start() {
    logger.info({
      codeDirectory: this.scanner.baseDir,
      outputDirectory: this.worker.outputBaseDir,
      logDirectory: this.worker.logDir
    }, 'Repomix Cron Sidequest Server starting');

    // Setup cron job
    // Schedule: '0 2 * * *' = 2 AM daily
    // For testing: '*/5 * * * *' = every 5 minutes
    this.setupCronJob(config.repomixSchedule);

    // Run immediately on startup if requested
    if (config.runOnStartup) {
      logger.info('Running immediately (RUN_ON_STARTUP=true)');
      await this.runRepomixOnAllDirectories();
    }

    logger.info('Server running. Press Ctrl+C to exit');
  }
}

// Start the application
const app = new RepomixCronApp();
app.start().catch((error) => {
  logger.error({ err: error }, 'Fatal error');
  process.exit(1);
});

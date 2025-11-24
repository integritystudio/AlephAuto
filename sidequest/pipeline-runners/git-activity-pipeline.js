#!/usr/bin/env node
import cron from 'node-cron';
import { GitActivityWorker } from '../sidequest/workers/git-activity-worker.js';
import { config } from '../sidequest/core/config.js';
import { createComponentLogger } from '../sidequest/utils/logger.js';

const logger = createComponentLogger('GitActivityPipeline');

/**
 * Git Activity Report Pipeline
 * Automatically generates git activity reports on a schedule
 */
class GitActivityPipeline {
  constructor(options = {}) {
    this.worker = new GitActivityWorker({
      maxConcurrent: config.maxConcurrent || 2,
      logDir: config.logDir,
      sentryDsn: config.sentryDsn,
      codeBaseDir: config.codeBaseDir,
      ...options
    });

    this.reportType = options.reportType || 'weekly';
    this.setupEventListeners();
  }

  /**
   * Setup event listeners for job events
   */
  setupEventListeners() {
    this.worker.on('job:created', (job) => {
      logger.info({ jobId: job.id, reportType: job.data.reportType }, 'Job created');
    });

    this.worker.on('job:started', (job) => {
      logger.info({
        jobId: job.id,
        reportType: job.data.reportType,
        days: job.data.days
      }, 'Job started');
    });

    this.worker.on('job:completed', (job) => {
      const duration = job.completedAt - job.startedAt;
      logger.info({
        jobId: job.id,
        duration,
        reportType: job.result.reportType,
        totalCommits: job.result.stats.totalCommits,
        totalRepositories: job.result.stats.totalRepositories,
        filesGenerated: job.result.outputFiles.length
      }, 'Job completed');

      // Log output file locations
      job.result.outputFiles.forEach(file => {
        if (file.exists) {
          logger.info({
            path: file.path,
            size: file.size
          }, 'Output file generated');
        }
      });
    });

    this.worker.on('job:failed', (job) => {
      logger.error({
        jobId: job.id,
        error: job.error
      }, 'Job failed');
    });
  }

  /**
   * Run a single report
   */
  async runReport(options = {}) {
    logger.info({ options }, 'Starting git activity report');

    const startTime = Date.now();

    try {
      // Create job based on options
      let job;

      if (options.sinceDate && options.untilDate) {
        job = this.worker.createCustomReportJob(options.sinceDate, options.untilDate);
      } else if (options.reportType === 'monthly' || options.days === 30) {
        job = this.worker.createMonthlyReportJob();
      } else if (options.reportType === 'weekly' || options.days === 7) {
        job = this.worker.createWeeklyReportJob();
      } else {
        job = this.worker.createReportJob(options);
      }

      logger.info({ jobId: job.id }, 'Report job created');

      // Wait for completion
      await this.waitForCompletion();

      const duration = Date.now() - startTime;
      const stats = this.worker.getStats();

      logger.info({
        duration,
        stats
      }, 'Git activity report pipeline completed');

      return stats;
    } catch (error) {
      logger.error({ error }, 'Git activity report pipeline failed');
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
   * Schedule weekly reports
   */
  scheduleWeeklyReports(cronSchedule = '0 20 * * 0') {
    logger.info({ cronSchedule }, 'Scheduling weekly git activity reports');

    if (!cron.validate(cronSchedule)) {
      throw new Error(`Invalid cron schedule: ${cronSchedule}`);
    }

    const task = cron.schedule(cronSchedule, async () => {
      logger.info('Cron triggered - starting weekly report');
      try {
        await this.runReport({ reportType: 'weekly' });
      } catch (error) {
        logger.error({ error }, 'Scheduled weekly report failed');
      }
    });

    logger.info('Weekly git activity reports scheduled');
    return task;
  }

  /**
   * Schedule monthly reports
   */
  scheduleMonthlyReports(cronSchedule = '0 0 1 * *') {
    logger.info({ cronSchedule }, 'Scheduling monthly git activity reports');

    if (!cron.validate(cronSchedule)) {
      throw new Error(`Invalid cron schedule: ${cronSchedule}`);
    }

    const task = cron.schedule(cronSchedule, async () => {
      logger.info('Cron triggered - starting monthly report');
      try {
        await this.runReport({ reportType: 'monthly' });
      } catch (error) {
        logger.error({ error }, 'Scheduled monthly report failed');
      }
    });

    logger.info('Monthly git activity reports scheduled');
    return task;
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const pipeline = new GitActivityPipeline();

  const runOnStartup = process.env.RUN_ON_STARTUP === 'true';
  const gitCronSchedule = process.env.GIT_CRON_SCHEDULE || '0 20 * * 0'; // Sunday 8 PM

  if (runOnStartup) {
    logger.info('Running git activity report immediately');

    // Parse command line arguments
    const args = process.argv.slice(2);
    const options = {};

    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--weekly') {
        options.reportType = 'weekly';
      } else if (args[i] === '--monthly') {
        options.reportType = 'monthly';
      } else if (args[i] === '--since' && args[i + 1]) {
        options.sinceDate = args[i + 1];
        i++;
      } else if (args[i] === '--until' && args[i + 1]) {
        options.untilDate = args[i + 1];
        i++;
      } else if (args[i] === '--days' && args[i + 1]) {
        options.days = parseInt(args[i + 1], 10);
        i++;
      }
    }

    // Default to weekly if no options specified
    if (!options.reportType && !options.sinceDate && !options.days) {
      options.reportType = 'weekly';
    }

    pipeline.runReport(options)
      .then(() => {
        logger.info('Report completed successfully');
        process.exit(0);
      })
      .catch((error) => {
        logger.error({ error }, 'Report failed');
        process.exit(1);
      });
  } else {
    logger.info({ cronSchedule: gitCronSchedule }, 'Starting git activity pipeline in scheduled mode');
    pipeline.scheduleWeeklyReports(gitCronSchedule);
    logger.info('Git activity pipeline running. Press Ctrl+C to stop.');
  }
}

export { GitActivityPipeline };

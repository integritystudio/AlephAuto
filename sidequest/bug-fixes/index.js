// @ts-nocheck
import cron from 'node-cron';
import { BugfixAuditWorker } from './bugfix-audit-worker.js';
import { config } from '../core/config.js';
import path from 'path';
import fs from 'fs/promises';
import { createComponentLogger, logError, logStart } from '../utils/logger.js';

const logger = createComponentLogger('BugfixAuditApp');

/**
 * BugfixAuditApp - Automated bug detection and fixing application
 *
 * Orchestrates the bugfix workflow:
 * 1. Scans ~/dev/active for .md files
 * 2. Analyzes with bugfix-planner, bug-detective, audit, quality-controller
 * 3. Implements fixes with refractor
 * 4. Creates git branches, commits at each stage, creates PRs
 *
 * Scheduled to run at 1 AM daily
 */
class BugfixAuditApp {
  constructor() {
    this.worker = new BugfixAuditWorker({
      maxConcurrent: 3, // Process 3 projects in parallel
      activeDocsDir: path.join(process.env.HOME, 'dev', 'active'),
      outputBaseDir: path.join(process.env.HOME, 'code', 'jobs', 'sidequest', 'bug-fixes', 'output'),
      logDir: config.logDir,
      sentryDsn: config.sentryDsn,
    });

    this.setupEventListeners();
  }

  /**
   * Setup event listeners for job events
   */
  setupEventListeners() {
    this.worker.on('job:created', (job) => {
      logger.info({
        jobId: job.id,
        projectName: job.data.projectName,
        markdownFile: job.data.markdownFile
      }, 'Job created');
    });

    this.worker.on('job:started', (job) => {
      logger.info({
        jobId: job.id,
        projectName: job.data.projectName
      }, 'Job started');
    });

    this.worker.on('job:completed', (job) => {
      const duration = job.completedAt - job.startedAt;
      logger.info({
        jobId: job.id,
        projectName: job.data.projectName,
        pullRequestUrl: job.result?.pullRequestUrl,
        duration
      }, 'Job completed');
    });

    this.worker.on('job:failed', (job) => {
      logger.error({
        jobId: job.id,
        projectName: job.data.projectName,
        error: job.error
      }, 'Job failed');
    });
  }

  /**
   * Run bug fix audit on all active projects
   */
  async runBugfixAudit() {
    logStart(logger, 'automated bugfix audit', { timestamp: new Date().toISOString() });

    const startTime = Date.now();

    try {
      // Create jobs for all markdown files
      const jobs = await this.worker.createJobsForAllMarkdownFiles();

      if (jobs.length === 0) {
        logger.info('No eligible projects found for bug fix audit');
        return;
      }

      logger.info({ jobCount: jobs.length }, 'Jobs created, waiting for completion');

      // Wait for all jobs to complete
      await this.waitForCompletion();

      const duration = Date.now() - startTime;
      const stats = this.worker.getStats();

      logger.info({
        durationSeconds: Math.round(duration / 1000),
        totalJobs: stats.total,
        completed: stats.completed,
        failed: stats.failed
      }, 'Bugfix audit complete');

      // Save run summary
      await this.saveRunSummary(stats, duration, jobs);

    } catch (error) {
      logError(logger, error, 'Error during bugfix audit');
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
  async saveRunSummary(stats, duration, jobs) {
    const summary = {
      timestamp: new Date().toISOString(),
      duration,
      stats,
      jobs: jobs.map(job => ({
        id: job.id,
        projectName: job.data.projectName,
        markdownFile: job.data.markdownFile,
        repoPath: job.data.repoPath,
        branchName: job.data.branchName,
        status: job.status,
        pullRequestUrl: job.result?.pullRequestUrl
      }))
    };

    const logsDir = path.join(process.env.HOME, 'code', 'jobs', 'sidequest', 'bug-fixes', 'logs');
    await fs.mkdir(logsDir, { recursive: true });

    const summaryPath = path.join(logsDir, `run-summary-${Date.now()}.json`);
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));

    logger.info({ summaryPath }, 'Run summary saved');
  }

  /**
   * Setup cron job to run at 1 AM
   */
  setupCronJob(schedule = '0 1 * * *') {
    logger.info({ schedule }, 'Setting up cron job');

    cron.schedule(schedule, async () => {
      logger.info({ triggerTime: new Date().toISOString() }, 'Cron job triggered');
      try {
        await this.runBugfixAudit();
      } catch (error) {
        logError(logger, error, 'Cron job failed');
      }
    });

    logger.info('Cron job scheduled successfully');
  }

  /**
   * Setup one-time job for tonight at 1 AM
   */
  setupOneTimeJob() {
    const now = new Date();
    const tonight1AM = new Date();
    tonight1AM.setHours(1, 0, 0, 0);

    // If 1 AM has passed today, schedule for tomorrow
    if (now.getHours() >= 1) {
      tonight1AM.setDate(tonight1AM.getDate() + 1);
    }

    const delay = tonight1AM.getTime() - now.getTime();
    const hoursUntil = Math.floor(delay / (1000 * 60 * 60));
    const minutesUntil = Math.floor((delay % (1000 * 60 * 60)) / (1000 * 60));

    logger.info({
      scheduledTime: tonight1AM.toISOString(),
      hoursUntil,
      minutesUntil
    }, 'One-time job scheduled for tonight at 1 AM');

    setTimeout(async () => {
      logger.info({ triggerTime: new Date().toISOString() }, 'One-time job triggered');
      try {
        await this.runBugfixAudit();
      } catch (error) {
        logError(logger, error, 'One-time job failed');
      }
    }, delay);
  }

  /**
   * Start the application
   */
  async start(options = {}) {
    logger.info({
      activeDocsDir: this.worker.activeDocsDir,
      outputBaseDir: this.worker.outputBaseDir
    }, 'BugfixAuditApp starting');

    if (options.oneTime) {
      // Run once tonight at 1 AM
      this.setupOneTimeJob();
      logger.info('One-time execution scheduled. Server will keep running.');
    } else if (options.recurring) {
      // Setup recurring cron job (1 AM daily)
      this.setupCronJob(options.schedule || '0 1 * * *');
      logger.info('Recurring cron job scheduled');
    }

    // Run immediately if requested
    if (options.runNow) {
      logger.info('Running immediately (runNow option)');
      await this.runBugfixAudit();
    }

    if (!options.runNow) {
      logger.info('Server running. Press Ctrl+C to exit');
    }
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  oneTime: args.includes('--once') || args.includes('--one-time'),
  recurring: args.includes('--recurring') || args.includes('--cron'),
  runNow: args.includes('--now') || args.includes('--immediate'),
  schedule: null
};

// Extract custom schedule if provided
const scheduleIndex = args.indexOf('--schedule');
if (scheduleIndex !== -1 && args[scheduleIndex + 1]) {
  options.schedule = args[scheduleIndex + 1];
}

// Default to one-time execution tonight at 1 AM
if (!options.oneTime && !options.recurring && !options.runNow) {
  options.oneTime = true;
}

// Start the application
const app = new BugfixAuditApp();
app.start(options).catch((error) => {
  logError(logger, error, 'Fatal error');
  process.exit(1);
});

// Keep process alive
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

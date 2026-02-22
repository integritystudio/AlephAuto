#!/usr/bin/env node
import cron from 'node-cron';
import { GitActivityWorker } from '../workers/git-activity-worker.js';
import { config } from '../core/config.ts';
import { TIMEOUTS } from '../core/constants.ts';
import { createComponentLogger, logError, logStart } from '../utils/logger.ts';

const logger = createComponentLogger('GitActivityPipeline');

// Cast config to access dynamic properties
const cfg = config as Record<string, unknown>;

interface ReportOptions {
  reportType?: string;
  sinceDate?: string;
  untilDate?: string;
  days?: number;
}

interface OutputFile {
  path: string;
  size: number;
  exists: boolean;
}

interface JobData {
  reportType?: string;
  days?: number;
}

interface JobResult {
  reportType: string;
  stats: {
    totalCommits: number;
    totalRepositories: number;
  };
  outputFiles: OutputFile[];
}

interface Job {
  id: string;
  data: JobData;
  result: JobResult;
  completedAt: string;
  startedAt: string;
  error?: Error;
}

interface WorkerStats {
  active: number;
  queued: number;
  total: number;
  completed: number;
  failed: number;
}

/**
 * Git Activity Report Pipeline
 * Automatically generates git activity reports on a schedule
 */
class GitActivityPipeline {
  private worker: GitActivityWorker;
  private reportType: string;

  constructor(options: Record<string, unknown> = {}) {
    this.worker = new GitActivityWorker({
      maxConcurrent: (cfg.maxConcurrent as number) || 2,
      logDir: cfg.logDir as string | undefined,
      sentryDsn: cfg.sentryDsn as string | undefined,
      codeBaseDir: cfg.codeBaseDir as string | undefined,
      ...options
    });

    this.reportType = (options.reportType as string) || 'weekly';
    this.setupEventListeners();
  }

  /**
   * Setup event listeners for job events
   */
  private setupEventListeners(): void {
    this.worker.on('job:created', (job: Job) => {
      logger.info({ jobId: job.id, reportType: job.data.reportType }, 'Job created');
    });

    this.worker.on('job:started', (job: Job) => {
      logger.info({
        jobId: job.id,
        reportType: job.data.reportType,
        days: job.data.days
      }, 'Job started');
    });

    this.worker.on('job:completed', (job: Job) => {
      const duration = new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime();
      logger.info({
        jobId: job.id,
        duration,
        reportType: job.result.reportType,
        totalCommits: job.result.stats.totalCommits,
        totalRepositories: job.result.stats.totalRepositories,
        filesGenerated: job.result.outputFiles.length
      }, 'Job completed');

      // Log output file locations
      job.result.outputFiles.forEach((file: OutputFile) => {
        if (file.exists) {
          logger.info({
            path: file.path,
            size: file.size
          }, 'Output file generated');
        }
      });
    });

    this.worker.on('job:failed', (job: Job) => {
      logError(logger, job.error as Error, 'Job failed', { jobId: job.id });
    });
  }

  /**
   * Run a single report
   */
  async runReport(options: ReportOptions = {}): Promise<WorkerStats> {
    logStart(logger, 'git activity report', { options });

    const startTime = Date.now();

    try {
      // Create job based on options
      const typedWorker = this.worker as unknown as {
        createCustomReportJob(since: string, until: string): Job;
        createMonthlyReportJob(): Job;
        createWeeklyReportJob(): Job;
        createReportJob(opts: ReportOptions): Job;
        getStats(): WorkerStats;
      };

      let job: Job;

      if (options.sinceDate && options.untilDate) {
        job = typedWorker.createCustomReportJob(options.sinceDate, options.untilDate);
      } else if (options.reportType === 'monthly' || options.days === 30) {
        job = typedWorker.createMonthlyReportJob();
      } else if (options.reportType === 'weekly' || options.days === 7) {
        job = typedWorker.createWeeklyReportJob();
      } else {
        job = typedWorker.createReportJob(options);
      }

      logger.info({ jobId: job.id }, 'Report job created');

      // Wait for completion
      await this.waitForCompletion();

      const duration = Date.now() - startTime;
      const stats = typedWorker.getStats();

      logger.info({
        duration,
        stats
      }, 'Git activity report pipeline completed');

      return stats;
    } catch (error) {
      logError(logger, error as Error, 'Git activity report pipeline failed');
      throw error;
    }
  }

  /**
   * Wait for all jobs to complete
   */
  async waitForCompletion(): Promise<void> {
    return new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        const stats = (this.worker as unknown as { getStats(): WorkerStats }).getStats();
        if (stats.active === 0 && stats.queued === 0) {
          clearInterval(checkInterval);
          resolve();
        }
      }, TIMEOUTS.POLL_INTERVAL_MS);
    });
  }

  /**
   * Schedule weekly reports
   */
  scheduleWeeklyReports(cronSchedule: string = '0 20 * * 0'): cron.ScheduledTask {
    logger.info({ cronSchedule }, 'Scheduling weekly git activity reports');

    if (!cron.validate(cronSchedule)) {
      throw new Error(`Invalid cron schedule: ${cronSchedule}`);
    }

    const task = cron.schedule(cronSchedule, async () => {
      logger.info('Cron triggered - starting weekly report');
      try {
        await this.runReport({ reportType: 'weekly' });
      } catch (error) {
        logError(logger, error as Error, 'Scheduled weekly report failed');
      }
    });

    logger.info('Weekly git activity reports scheduled');
    return task;
  }

  /**
   * Schedule monthly reports
   */
  scheduleMonthlyReports(cronSchedule: string = '0 0 1 * *'): cron.ScheduledTask {
    logger.info({ cronSchedule }, 'Scheduling monthly git activity reports');

    if (!cron.validate(cronSchedule)) {
      throw new Error(`Invalid cron schedule: ${cronSchedule}`);
    }

    const task = cron.schedule(cronSchedule, async () => {
      logger.info('Cron triggered - starting monthly report');
      try {
        await this.runReport({ reportType: 'monthly' });
      } catch (error) {
        logError(logger, error as Error, 'Scheduled monthly report failed');
      }
    });

    logger.info('Monthly git activity reports scheduled');
    return task;
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const pipeline = new GitActivityPipeline();

  const gitCronSchedule = process.env.GIT_CRON_SCHEDULE || '0 20 * * 0'; // Sunday 8 PM

  // Parse command line arguments
  const args = process.argv.slice(2);
  const options: ReportOptions = {};
  let runNow = process.env.RUN_ON_STARTUP === 'true';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--run-now' || args[i] === '--run') {
      runNow = true;
    } else if (args[i] === '--weekly') {
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

  if (runNow) {
    logger.info('Running git activity report immediately');

    // Default to weekly if no options specified
    if (!options.reportType && !options.sinceDate && !options.days) {
      options.reportType = 'weekly';
    }

    pipeline.runReport(options)
      .then(() => {
        logger.info('Report completed successfully');
        process.exit(0);
      })
      .catch((error: unknown) => {
        logError(logger, error as Error, 'Report failed');
        process.exit(1);
      });
  } else {
    logStart(logger, 'git activity pipeline in scheduled mode', { cronSchedule: gitCronSchedule });
    pipeline.scheduleWeeklyReports(gitCronSchedule);
    logger.info('Git activity pipeline running. Press Ctrl+C to stop.');
  }
}

export { GitActivityPipeline };

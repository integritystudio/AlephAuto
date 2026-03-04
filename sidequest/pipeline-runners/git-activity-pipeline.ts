#!/usr/bin/env -S node --strip-types
import { GitActivityWorker } from '../workers/git-activity-worker.ts';
import { config } from '../core/config.ts';
import { GIT_ACTIVITY } from '../core/constants.ts';
import { createComponentLogger, logError, logStart } from '../utils/logger.ts';
import { BasePipeline, type Job, type JobStats } from './base-pipeline.ts';

const logger = createComponentLogger('GitActivityPipeline');


export interface ReportOptions {
  reportType?: string;
  sinceDate?: string;
  untilDate?: string;
  days?: number;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const VALID_DEFAULT_REPORT_TYPES = new Set([
  GIT_ACTIVITY.WEEKLY_REPORT_TYPE,
  GIT_ACTIVITY.MONTHLY_REPORT_TYPE,
]);

interface ParsedCliArgs {
  options: ReportOptions;
  runNow: boolean;
  errors: string[];
}

interface JobSelection {
  strategy: 'custom' | 'monthly' | 'weekly' | 'generic';
  options: ReportOptions;
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

/**
 * Git Activity Report Pipeline
 * Automatically generates git activity reports on a schedule
 */
class GitActivityPipeline extends BasePipeline<GitActivityWorker> {
  private reportType: string;

  /**
   * constructor.
   */
  constructor(options: Record<string, unknown> = {}) {
    super(new GitActivityWorker({
      maxConcurrent: config.maxConcurrent ?? 2,
      logDir: config.logDir,
      sentryDsn: config.sentryDsn,
      codeBaseDir: config.codeBaseDir,
      ...options
    }));

    const configuredReportType = options.reportType as string | undefined;
    this.reportType = configuredReportType && VALID_DEFAULT_REPORT_TYPES.has(configuredReportType)
      ? configuredReportType
      : GIT_ACTIVITY.DEFAULT_REPORT_TYPE;
    this.setupEventListeners();
  }

  /**
   * Setup event listeners for job events
   */
  private setupEventListeners(): void {
    this.worker.on('job:created', (job: Job) => {
      const data = job.data as unknown as JobData;
      logger.info({ jobId: job.id, reportType: data.reportType }, 'Job created');
    });

    this.worker.on('job:started', (job: Job) => {
      const data = job.data as unknown as JobData;
      logger.info({
        jobId: job.id,
        reportType: data.reportType,
        days: data.days
      }, 'Job started');
    });

    this.worker.on('job:completed', (job: Job) => {
      const result = job.result as unknown as JobResult;
      const duration = job.completedAt && job.startedAt
        ? job.completedAt.getTime() - job.startedAt.getTime()
        : undefined;
      logger.info({
        jobId: job.id,
        duration,
        reportType: result.reportType,
        totalCommits: result.stats.totalCommits,
        totalRepositories: result.stats.totalRepositories,
        filesGenerated: result.outputFiles.length
      }, 'Job completed');

      // Log output file locations
      result.outputFiles.forEach((file: OutputFile) => {
        if (file.exists) {
          logger.info({
            path: file.path,
            size: file.size
          }, 'Output file generated');
        }
      });
    });

    this.worker.on('job:failed', (job: Job) => {
      logError(logger, job.error, 'Job failed', { jobId: job.id });
    });
  }

  /**
   * Run a single report
   */
  async runReport(options: ReportOptions = {}): Promise<JobStats> {
    logStart(logger, 'git activity report', { options });

    const startTime = Date.now();

    try {
      // Create job based on options
      let job: Job;

      const selection = selectGitActivityJob(options, this.reportType);
      if (selection.strategy === 'custom') {
        job = this.worker.createCustomReportJob(selection.options.sinceDate!, selection.options.untilDate!);
      } else if (selection.strategy === 'monthly') {
        job = this.worker.createMonthlyReportJob();
      } else if (selection.strategy === 'weekly') {
        job = this.worker.createWeeklyReportJob();
      } else {
        job = this.worker.createReportJob(selection.options);
      }

      logger.info({ jobId: job.id }, 'Report job created');

      // Wait for completion
      await this.waitForCompletion();

      const duration = Date.now() - startTime;
      const stats = this.getStats();

      logger.info({
        duration,
        stats
      }, 'Git activity report pipeline completed');

      return stats;
    } catch (error) {
      logError(logger, error, 'Git activity report pipeline failed');
      throw error;
    }
  }

  /**
   * Schedule weekly reports
   */
  scheduleWeeklyReports(cronSchedule: string = GIT_ACTIVITY.DEFAULT_WEEKLY_CRON) {
    return this.scheduleCron(
      logger,
      'weekly git activity report',
      cronSchedule,
      () => this.runReport({ reportType: GIT_ACTIVITY.WEEKLY_REPORT_TYPE })
    );
  }

  /**
   * Schedule monthly reports
   */
  scheduleMonthlyReports(cronSchedule: string = GIT_ACTIVITY.DEFAULT_MONTHLY_CRON) {
    return this.scheduleCron(
      logger,
      'monthly git activity report',
      cronSchedule,
      () => this.runReport({ reportType: GIT_ACTIVITY.MONTHLY_REPORT_TYPE })
    );
  }
}

export function selectGitActivityJob(
  options: ReportOptions,
  defaultReportType: string = GIT_ACTIVITY.DEFAULT_REPORT_TYPE
): JobSelection {
  const normalizedOptions: ReportOptions = {
    ...options,
    reportType: options.reportType ?? defaultReportType,
  };

  if (normalizedOptions.sinceDate) {
    return normalizedOptions.untilDate
      ? { strategy: 'custom', options: normalizedOptions }
      : { strategy: 'generic', options: normalizedOptions };
  }

  if (
    normalizedOptions.reportType === GIT_ACTIVITY.MONTHLY_REPORT_TYPE
    || normalizedOptions.days === GIT_ACTIVITY.MONTHLY_WINDOW_DAYS
  ) {
    return { strategy: 'monthly', options: normalizedOptions };
  }

  if (
    normalizedOptions.reportType === GIT_ACTIVITY.WEEKLY_REPORT_TYPE
    || normalizedOptions.days === GIT_ACTIVITY.WEEKLY_WINDOW_DAYS
  ) {
    return { strategy: 'weekly', options: normalizedOptions };
  }

  return { strategy: 'generic', options: normalizedOptions };
}

export function parseGitActivityCliArgs(args: string[], runOnStartup: boolean): ParsedCliArgs {
  const options: ReportOptions = {};
  const errors: string[] = [];
  let runNow = runOnStartup;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--run-now' || args[i] === '--run') {
      runNow = true;
    } else if (args[i] === '--weekly') {
      options.reportType = GIT_ACTIVITY.WEEKLY_REPORT_TYPE;
    } else if (args[i] === '--monthly') {
      options.reportType = GIT_ACTIVITY.MONTHLY_REPORT_TYPE;
    } else if ((args[i] === '--start-date' || args[i] === '--since') && args[i + 1]) {
      options.sinceDate = args[i + 1];
      i++;
    } else if (args[i] === '--start-date' || args[i] === '--since') {
      errors.push(`${args[i]} requires a YYYY-MM-DD value`);
    } else if ((args[i] === '--end-date' || args[i] === '--until') && args[i + 1]) {
      options.untilDate = args[i + 1];
      i++;
    } else if (args[i] === '--end-date' || args[i] === '--until') {
      errors.push(`${args[i]} requires a YYYY-MM-DD value`);
    } else if (args[i] === '--days' && args[i + 1]) {
      const parsedDays = parseInt(args[i + 1], 10);
      if (Number.isNaN(parsedDays) || parsedDays <= 0) {
        errors.push(`--days must be a positive integer (received: ${args[i + 1]})`);
      } else {
        options.days = parsedDays;
      }
      i++;
    } else if (args[i] === '--days') {
      errors.push('--days requires a positive integer value');
    }
  }

  if (options.untilDate && !options.sinceDate) {
    errors.push('--end-date requires --start-date');
  }
  if (options.sinceDate && !ISO_DATE_PATTERN.test(options.sinceDate)) {
    errors.push(`--start-date must match YYYY-MM-DD (received: ${options.sinceDate})`);
  }
  if (options.untilDate && !ISO_DATE_PATTERN.test(options.untilDate)) {
    errors.push(`--end-date must match YYYY-MM-DD (received: ${options.untilDate})`);
  }

  return { options, runNow, errors };
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const pipeline = new GitActivityPipeline();

  const weeklyCronSchedule = process.env.GIT_CRON_SCHEDULE || GIT_ACTIVITY.DEFAULT_WEEKLY_CRON; // Sunday 8 PM
  const monthlyCronSchedule = process.env.GIT_MONTHLY_CRON_SCHEDULE || GIT_ACTIVITY.DEFAULT_MONTHLY_CRON; // 1st of month 8 AM

  const args = process.argv.slice(2);
  const { options, runNow, errors } = parseGitActivityCliArgs(args, config.runOnStartup);
  if (errors.length > 0) {
    logger.error({ args, errors }, 'Invalid CLI options');
    process.exit(1);
  }

  if (runNow) {
    logger.info('Running git activity report immediately');

    // Default to weekly if no options specified
    if (!options.reportType && !options.sinceDate && !options.days) {
      options.reportType = GIT_ACTIVITY.DEFAULT_REPORT_TYPE;
    }

    pipeline.runReport(options)
      .then(() => {
        logger.info('Report completed successfully');
        process.exit(0);
      })
      .catch((error: unknown) => {
        logError(logger, error, 'Report failed');
        process.exit(1);
      });
  } else {
    logStart(logger, 'git activity pipeline in scheduled mode', {
      weeklyCronSchedule,
      monthlyCronSchedule,
    });
    pipeline.scheduleWeeklyReports(weeklyCronSchedule);
    pipeline.scheduleMonthlyReports(monthlyCronSchedule);
    logger.info('Git activity pipeline running. Press Ctrl+C to stop.');
  }
}

export { GitActivityPipeline };

#!/usr/bin/env -S node --strip-types
import { GitActivityWorker } from '../workers/git-activity-worker.ts';
import { config } from '../core/config.ts';
import { GIT_ACTIVITY, NUMBER_BASE } from '../core/constants.ts';
import { createComponentLogger, logError, logStart } from '../utils/logger.ts';
import { BasePipeline, type Job, type JobStats } from './base-pipeline.ts';
import { isDirectExecution } from '../utils/execution-helpers.ts';

const logger = createComponentLogger('GitActivityPipeline');


export interface ReportOptions {
  reportType?: string;
  sinceDate?: string;
  untilDate?: string;
  days?: number;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
type DefaultReportType =
  | typeof GIT_ACTIVITY.WEEKLY_REPORT_TYPE
  | typeof GIT_ACTIVITY.MONTHLY_REPORT_TYPE;

const VALID_DEFAULT_REPORT_TYPES = new Set<DefaultReportType>([
  GIT_ACTIVITY.WEEKLY_REPORT_TYPE,
  GIT_ACTIVITY.MONTHLY_REPORT_TYPE,
]);

function isDefaultReportType(reportType: string | undefined): reportType is DefaultReportType {
  return reportType !== undefined && VALID_DEFAULT_REPORT_TYPES.has(reportType as DefaultReportType);
}

interface ParsedCliArgs {
  options: ReportOptions;
  runNow: boolean;
  errors: string[];
}

const JOB_SELECTION_STRATEGY = {
  CUSTOM: 'custom',
  MONTHLY: 'monthly',
  WEEKLY: 'weekly',
  GENERIC: 'generic',
} as const;

type JobSelectionStrategy =
  (typeof JOB_SELECTION_STRATEGY)[keyof typeof JOB_SELECTION_STRATEGY];

interface JobSelection {
  strategy: JobSelectionStrategy;
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
    this.reportType = isDefaultReportType(configuredReportType)
      ? configuredReportType
      : GIT_ACTIVITY.DEFAULT_REPORT_TYPE;
    this.setupDefaultEventListeners(logger, {
      onCreated: (job) => ({ reportType: (job.data as unknown as JobData).reportType }),
      onStarted: (job) => {
        const data = job.data as unknown as JobData;
        return { reportType: data.reportType, days: data.days };
      },
      onCompleted: (job) => {
        const result = job.result as unknown as JobResult;
        // Log output file locations
        result.outputFiles.forEach((file: OutputFile) => {
          if (file.exists) {
            logger.info({ path: file.path, size: file.size }, 'Output file generated');
          }
        });
        return {
          reportType: result.reportType,
          totalCommits: result.stats.totalCommits,
          totalRepositories: result.stats.totalRepositories,
          filesGenerated: result.outputFiles.length,
        };
      },
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
      if (selection.strategy === JOB_SELECTION_STRATEGY.CUSTOM) {
        job = this.worker.createCustomReportJob(selection.options.sinceDate!, selection.options.untilDate!);
      } else if (selection.strategy === JOB_SELECTION_STRATEGY.MONTHLY) {
        job = this.worker.createMonthlyReportJob();
      } else if (selection.strategy === JOB_SELECTION_STRATEGY.WEEKLY) {
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
      ? { strategy: JOB_SELECTION_STRATEGY.CUSTOM, options: normalizedOptions }
      : { strategy: JOB_SELECTION_STRATEGY.GENERIC, options: normalizedOptions };
  }

  if (
    normalizedOptions.reportType === GIT_ACTIVITY.MONTHLY_REPORT_TYPE
    || normalizedOptions.days === GIT_ACTIVITY.MONTHLY_WINDOW_DAYS
  ) {
    return { strategy: JOB_SELECTION_STRATEGY.MONTHLY, options: normalizedOptions };
  }

  if (
    normalizedOptions.reportType === GIT_ACTIVITY.WEEKLY_REPORT_TYPE
    || normalizedOptions.days === GIT_ACTIVITY.WEEKLY_WINDOW_DAYS
  ) {
    return { strategy: JOB_SELECTION_STRATEGY.WEEKLY, options: normalizedOptions };
  }

  return { strategy: JOB_SELECTION_STRATEGY.GENERIC, options: normalizedOptions };
}

export function parseGitActivityCliArgs(args: string[], runOnStartup: boolean): ParsedCliArgs {
  const options: ReportOptions = {};
  const errors: string[] = [];
  let runNow = runOnStartup;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--run-now' || arg === '--run') {
      runNow = true;
    } else if (arg === '--weekly') {
      options.reportType = GIT_ACTIVITY.WEEKLY_REPORT_TYPE;
    } else if (arg === '--monthly') {
      options.reportType = GIT_ACTIVITY.MONTHLY_REPORT_TYPE;
    } else if (arg === '--start-date' || arg === '--since') {
      if (!args[i + 1] || args[i + 1].startsWith('--')) {
        errors.push(`${arg} requires a YYYY-MM-DD value`);
        continue;
      }
      options.sinceDate = args[i + 1];
      i++;
    } else if (arg === '--end-date' || arg === '--until') {
      if (!args[i + 1] || args[i + 1].startsWith('--')) {
        errors.push(`${arg} requires a YYYY-MM-DD value`);
        continue;
      }
      options.untilDate = args[i + 1];
      i++;
    } else if (arg === '--days') {
      if (!args[i + 1] || args[i + 1].startsWith('--')) {
        errors.push('--days requires a positive integer value');
        continue;
      }
      const parsedDays = parseInt(args[i + 1], NUMBER_BASE.DECIMAL);
      if (Number.isNaN(parsedDays) || parsedDays <= 0) {
        errors.push(`--days must be a positive integer (received: ${args[i + 1]})`);
      } else {
        options.days = parsedDays;
      }
      i++;
    } else if (arg.startsWith('--')) {
      errors.push(`Unknown flag: ${arg}`);
    } else {
      errors.push(`Unexpected positional argument: ${arg}`);
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
if (isDirectExecution(import.meta.url)) {
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

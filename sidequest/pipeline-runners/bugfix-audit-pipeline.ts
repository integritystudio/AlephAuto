#!/usr/bin/env -S node --strip-types
import { BugfixAuditWorker } from '../workers/bugfix-audit-worker.ts';
import { config } from '../core/config.ts';
import { createComponentLogger, logError, logStart } from '../utils/logger.ts';
import { BasePipeline, type Job, type JobStats } from './base-pipeline.ts';
import fs from 'fs/promises';
import path from 'path';

const logger = createComponentLogger('BugfixAuditPipeline');


interface BugfixAuditOptions {
  maxConcurrent?: number;
  activeDocsDir?: string;
  outputBaseDir?: string;
  gitBaseBranch?: string;
  gitBranchPrefix?: string;
  gitDryRun?: boolean;
  [key: string]: unknown;
}

interface JobData {
  projectName: string;
  markdownFile: string;
  repoPath: string;
}

interface JobResult {
  pullRequestUrl?: string;
}

interface RunResult {
  status: string;
  jobsCreated?: number;
  duration?: number;
  active?: number;
  queued?: number;
  total?: number;
  completed?: number;
  failed?: number;
}

/**
 * Bugfix Audit Pipeline
 * Scans ~/dev/active for markdown files and orchestrates automated bug detection and fixing.
 */
class BugfixAuditPipeline extends BasePipeline<BugfixAuditWorker> {
  constructor(options: BugfixAuditOptions = {}) {
    super(new BugfixAuditWorker({
      ...options,
      maxConcurrent: options.maxConcurrent ?? 3,
      logDir: config.logDir,
      sentryDsn: config.sentryDsn,
      activeDocsDir: options.activeDocsDir ?? path.join(config.homeDir, 'dev', 'active'),
      outputBaseDir: options.outputBaseDir ?? path.join(config.homeDir, 'code', 'jobs', 'sidequest', 'bug-fixes', 'output'),
      gitBaseBranch: options.gitBaseBranch ?? config.gitBaseBranch,
      gitBranchPrefix: options.gitBranchPrefix ?? 'bugfix',
      gitDryRun: options.gitDryRun ?? config.gitDryRun,
    }));

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.worker.on('job:created', (job: Job) => {
      const data = job.data as unknown as JobData;
      logger.info({
        jobId: job.id,
        projectName: data.projectName,
        markdownFile: data.markdownFile,
      }, 'Bugfix audit job created');
    });

    this.worker.on('job:started', (job: Job) => {
      const data = job.data as unknown as JobData;
      logger.info({
        jobId: job.id,
        projectName: data.projectName,
      }, 'Bugfix audit job started');
    });

    this.worker.on('job:completed', (job: Job) => {
      const data = job.data as unknown as JobData;
      const result = job.result as unknown as JobResult | undefined;
      const duration = job.completedAt && job.startedAt
        ? job.completedAt.getTime() - job.startedAt.getTime()
        : undefined;
      logger.info({
        jobId: job.id,
        projectName: data.projectName,
        pullRequestUrl: result?.pullRequestUrl,
        duration,
      }, 'Bugfix audit job completed');
    });

    this.worker.on('job:failed', (job: Job) => {
      const data = job.data as unknown as JobData;
      logError(logger, job.error, 'Bugfix audit job failed', {
        jobId: job.id,
        projectName: data.projectName,
      });
    });
  }

  /**
   * Run bugfix audit on all active projects
   */
  async runBugfixAudit(): Promise<RunResult> {
    logStart(logger, 'bugfix audit pipeline', { timestamp: new Date().toISOString() });

    const startTime = Date.now();

    const jobs = await this.worker.createJobsForAllMarkdownFiles();

    if (jobs.length === 0) {
      logger.info('No eligible projects found for bug fix audit');
      return { status: 'completed', jobsCreated: 0 };
    }

    logger.info({ jobCount: jobs.length }, 'Jobs created, waiting for completion');

    await this.waitForCompletion();

    const duration = Date.now() - startTime;
    const stats = this.getStats();

    logger.info({
      durationSeconds: Math.round(duration / 1000),
      totalJobs: stats.total,
      completed: stats.completed,
      failed: stats.failed,
    }, 'Bugfix audit complete');

    // Save run summary
    await this.saveRunSummary(stats, duration, jobs);

    return { status: 'completed', duration, ...stats };
  }

  private async saveRunSummary(stats: JobStats, duration: number, jobs: Job[]): Promise<void> {
    const summary = {
      timestamp: new Date().toISOString(),
      duration,
      stats,
      jobs: jobs.map((job) => {
        const data = job.data as unknown as JobData;
        const result = job.result as unknown as JobResult | undefined;
        return {
          id: job.id,
          projectName: data.projectName,
          markdownFile: data.markdownFile,
          repoPath: data.repoPath,
          status: job.status,
          pullRequestUrl: result?.pullRequestUrl,
        };
      }),
    };

    const logsDir = path.join(config.homeDir, 'code', 'jobs', 'sidequest', 'bug-fixes', 'logs');
    await fs.mkdir(logsDir, { recursive: true });

    const summaryPath = path.join(logsDir, `run-summary-${Date.now()}.json`);
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));

    logger.info({ summaryPath }, 'Run summary saved');
  }

  /**
   * Schedule recurring bugfix audits
   */
  scheduleAudits(cronSchedule: string = '0 1 * * *') {
    return this.scheduleCron(logger, 'bugfix audit', cronSchedule, () => this.runBugfixAudit());
  }

  /**
   * Schedule a one-time run for tonight at 1 AM
   */
  scheduleTonight(): void {
    const now = new Date();
    const tonight1AM = new Date();
    tonight1AM.setHours(1, 0, 0, 0);

    if (now.getHours() >= 1) {
      tonight1AM.setDate(tonight1AM.getDate() + 1);
    }

    const delay = tonight1AM.getTime() - now.getTime();

    logger.info({
      scheduledTime: tonight1AM.toISOString(),
      delayMs: delay,
    }, 'One-time job scheduled for tonight at 1 AM');

    setTimeout(async () => {
      logger.info('One-time job triggered');
      try {
        await this.runBugfixAudit();
      } catch (error) {
        logError(logger, error, 'One-time bugfix audit failed');
      }
    }, delay);
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  const runNow = args.includes('--run-now') || args.includes('--now');
  const once = args.includes('--once') || args.includes('--one-time');
  const recurring = args.includes('--recurring') || args.includes('--cron');

  let schedule: string | null = null;
  const scheduleIndex = args.indexOf('--schedule');
  if (scheduleIndex !== -1 && args[scheduleIndex + 1]) {
    schedule = args[scheduleIndex + 1];
  }

  const pipeline = new BugfixAuditPipeline();

  if (runNow) {
    logger.info('Running bugfix audit immediately');
    pipeline.runBugfixAudit()
      .then((result) => {
        logger.info({ result }, 'Bugfix audit completed');
        process.exit(0);
      })
      .catch((error: unknown) => {
        logError(logger, error, 'Bugfix audit failed');
        process.exit(1);
      });
  } else if (recurring) {
    const cronSchedule = schedule ?? '0 1 * * *';
    logStart(logger, 'bugfix audit pipeline in scheduled mode', { cronSchedule });
    pipeline.scheduleAudits(cronSchedule);
    logger.info('Bugfix audit pipeline running. Press Ctrl+C to stop.');
  } else if (once) {
    pipeline.scheduleTonight();
    logger.info('One-time execution scheduled. Process will keep running.');
  } else {
    // Default: one-time tonight
    pipeline.scheduleTonight();
    logger.info('No flags specified — defaulting to one-time tonight at 1 AM.');
  }
}

export { BugfixAuditPipeline };

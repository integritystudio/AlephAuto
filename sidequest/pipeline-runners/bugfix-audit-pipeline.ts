#!/usr/bin/env -S node --strip-types
import { BugfixAuditWorker } from '../workers/bugfix-audit-worker.ts';
import { config } from '../core/config.ts';
import { TIMEOUTS } from '../core/constants.ts';
import { createComponentLogger, logError, logStart } from '../utils/logger.ts';
import cron from 'node-cron';
import fs from 'fs/promises';
import path from 'path';

const logger = createComponentLogger('BugfixAuditPipeline');

// Cast config to access dynamic properties
const cfg = config as Record<string, unknown>;

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

interface Job {
  id: string;
  data: JobData;
  result?: JobResult;
  status: string;
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
class BugfixAuditPipeline {
  private worker: BugfixAuditWorker;

  constructor(options: BugfixAuditOptions = {}) {
    this.worker = new BugfixAuditWorker({
      maxConcurrent: options.maxConcurrent ?? 3,
      logDir: cfg.logDir as string | undefined,
      sentryDsn: cfg.sentryDsn as string | undefined,
      activeDocsDir: options.activeDocsDir ?? path.join(cfg.homeDir as string, 'dev', 'active'),
      outputBaseDir: options.outputBaseDir ?? path.join(cfg.homeDir as string, 'code', 'jobs', 'sidequest', 'bug-fixes', 'output'),
      gitBaseBranch: options.gitBaseBranch ?? (cfg.gitBaseBranch as string | undefined),
      gitBranchPrefix: options.gitBranchPrefix ?? 'bugfix',
      gitDryRun: options.gitDryRun ?? (cfg.gitDryRun as boolean | undefined),
      ...options,
    });

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.worker.on('job:created', (job: Job) => {
      logger.info({
        jobId: job.id,
        projectName: job.data.projectName,
        markdownFile: job.data.markdownFile,
      }, 'Bugfix audit job created');
    });

    this.worker.on('job:started', (job: Job) => {
      logger.info({
        jobId: job.id,
        projectName: job.data.projectName,
      }, 'Bugfix audit job started');
    });

    this.worker.on('job:completed', (job: Job) => {
      const duration = new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime();
      logger.info({
        jobId: job.id,
        projectName: job.data.projectName,
        pullRequestUrl: job.result?.pullRequestUrl,
        duration,
      }, 'Bugfix audit job completed');
    });

    this.worker.on('job:failed', (job: Job) => {
      logError(logger, job.error as Error, 'Bugfix audit job failed', {
        jobId: job.id,
        projectName: job.data.projectName,
      });
    });
  }

  /**
   * Run bugfix audit on all active projects
   */
  async runBugfixAudit(): Promise<RunResult> {
    logStart(logger, 'bugfix audit pipeline', { timestamp: new Date().toISOString() });

    const startTime = Date.now();

    const jobs: Job[] = await (this.worker as unknown as { createJobsForAllMarkdownFiles(): Promise<Job[]> }).createJobsForAllMarkdownFiles();

    if (jobs.length === 0) {
      logger.info('No eligible projects found for bug fix audit');
      return { status: 'completed', jobsCreated: 0 };
    }

    logger.info({ jobCount: jobs.length }, 'Jobs created, waiting for completion');

    await this.waitForCompletion();

    const duration = Date.now() - startTime;
    const stats = (this.worker as unknown as { getStats(): WorkerStats }).getStats();

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

  async saveRunSummary(stats: WorkerStats, duration: number, jobs: Job[]): Promise<void> {
    const summary = {
      timestamp: new Date().toISOString(),
      duration,
      stats,
      jobs: jobs.map((job) => ({
        id: job.id,
        projectName: job.data.projectName,
        markdownFile: job.data.markdownFile,
        repoPath: job.data.repoPath,
        status: job.status,
        pullRequestUrl: job.result?.pullRequestUrl,
      })),
    };

    const logsDir = path.join(cfg.homeDir as string, 'code', 'jobs', 'sidequest', 'bug-fixes', 'logs');
    await fs.mkdir(logsDir, { recursive: true });

    const summaryPath = path.join(logsDir, `run-summary-${Date.now()}.json`);
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));

    logger.info({ summaryPath }, 'Run summary saved');
  }

  /**
   * Schedule recurring bugfix audits
   */
  scheduleAudits(cronSchedule: string = '0 1 * * *'): cron.ScheduledTask {
    if (!cron.validate(cronSchedule)) {
      throw new Error(`Invalid cron schedule: ${cronSchedule}`);
    }

    logger.info({ cronSchedule }, 'Scheduling bugfix audit runs');

    const task = cron.schedule(cronSchedule, async () => {
      logger.info('Cron triggered - starting bugfix audit');
      try {
        await this.runBugfixAudit();
      } catch (error) {
        logError(logger, error as Error, 'Scheduled bugfix audit failed');
      }
    });

    logger.info('Bugfix audit scheduled');
    return task;
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
        logError(logger, error as Error, 'One-time bugfix audit failed');
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
        logError(logger, error as Error, 'Bugfix audit failed');
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

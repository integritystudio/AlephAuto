#!/usr/bin/env -S node --strip-types
import cron from 'node-cron';
import { PluginManagerWorker } from '../utils/plugin-manager.ts';
import { config } from '../core/config.ts';
import { TIMEOUTS } from '../core/constants.ts';
import { createComponentLogger, logError, logStart } from '../utils/logger.ts';

const logger = createComponentLogger('PluginPipeline');

// Cast config to access dynamic properties
const cfg = config as Record<string, unknown>;

interface AuditOptions {
  detailed?: boolean;
}

interface AuditRecommendation {
  priority: string;
  type: string;
  message: string;
  action: string;
  details?: Array<{
    category: string;
    plugins: string[];
    suggestion: string;
  }>;
}

interface AuditResult {
  totalPlugins: number;
  duplicateCategories?: Array<{ category: string; count: number }>;
  recommendations?: AuditRecommendation[];
}

interface WorkerStats {
  active: number;
  queued: number;
  total: number;
  completed: number;
  failed: number;
}

interface Job {
  id: string;
  data: { detailed?: boolean };
  result: AuditResult;
  completedAt: number;
  startedAt: number;
  error?: Error;
}

/**
 * Plugin Management Pipeline
 * Automatically audits Claude Code plugins on a schedule
 */
class PluginManagementPipeline {
  private worker: PluginManagerWorker;

  constructor(options: Record<string, unknown> = {}) {
    this.worker = new PluginManagerWorker({
      maxConcurrent: 1,
      logDir: cfg.logDir as string | undefined,
      sentryDsn: cfg.sentryDsn as string | undefined,
      ...options
    });

    this.setupEventListeners();
  }

  /**
   * Setup event listeners for job events
   */
  private setupEventListeners(): void {
    this.worker.on('job:created', (job: Job) => {
      logger.info({ jobId: job.id }, 'Plugin audit job created');
    });

    this.worker.on('job:started', (job: Job) => {
      logger.info({
        jobId: job.id,
        detailed: job.data.detailed
      }, 'Plugin audit started');
    });

    this.worker.on('job:completed', (job: Job) => {
      const duration = job.completedAt - job.startedAt;
      logger.info({
        jobId: job.id,
        duration,
        totalPlugins: job.result.totalPlugins,
        duplicateCategories: job.result.duplicateCategories?.length ?? 0,
        recommendations: job.result.recommendations?.length ?? 0
      }, 'Plugin audit completed');

      // Display recommendations
      this.displayRecommendations(job.result);
    });

    this.worker.on('job:failed', (job: Job) => {
      logError(logger, job.error as Error, 'Plugin audit failed', { jobId: job.id });
    });
  }

  /**
   * Display audit recommendations
   */
  private displayRecommendations(result: AuditResult): void {
    if (!result.recommendations || result.recommendations.length === 0) {
      return;
    }

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║          Plugin Audit Recommendations                          ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    result.recommendations.forEach((rec) => {
      const priorityIcon: Record<string, string> = {
        high: '🔴',
        medium: '🟡',
        info: '✅'
      };
      const icon = priorityIcon[rec.priority] || '📌';

      console.log(`${icon} [${rec.priority.toUpperCase()}] ${rec.type}`);
      console.log(`   ${rec.message}`);
      console.log(`   Action: ${rec.action}`);

      if (rec.details) {
        console.log('   Details:');
        rec.details.forEach((detail) => {
          console.log(`     • ${detail.category}: ${detail.plugins.join(', ')}`);
          console.log(`       → ${detail.suggestion}`);
        });
      }
      console.log('');
    });
  }

  /**
   * Run a single audit
   */
  async runAudit(options: AuditOptions = {}): Promise<WorkerStats> {
    logStart(logger, 'plugin audit', { options });

    const startTime = Date.now();

    try {
      // Create audit job
      const job = (this.worker as unknown as { addJob(data: { detailed: boolean }): Job }).addJob({
        detailed: options.detailed || false
      });

      logger.info({ jobId: job.id }, 'Audit job created');

      // Wait for completion
      await this.waitForCompletion();

      const duration = Date.now() - startTime;
      const stats = (this.worker as unknown as { getStats(): WorkerStats }).getStats();

      logger.info({
        duration,
        stats
      }, 'Plugin audit pipeline completed');

      return stats;
    } catch (error) {
      logError(logger, error as Error, 'Plugin audit pipeline failed');
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
   * Schedule automatic plugin audits
   */
  scheduleAudits(cronSchedule: string = '0 9 * * 1'): cron.ScheduledTask {
    logger.info({ cronSchedule }, 'Scheduling plugin audits');

    if (!cron.validate(cronSchedule)) {
      throw new Error(`Invalid cron schedule: ${cronSchedule}`);
    }

    const task = cron.schedule(cronSchedule, async () => {
      logger.info('Cron triggered - starting plugin audit');
      try {
        await this.runAudit({ detailed: false });
      } catch (error) {
        logError(logger, error as Error, 'Scheduled plugin audit failed');
      }
    });

    logger.info('Plugin audits scheduled');
    return task;
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const pipeline = new PluginManagementPipeline();

  const runOnStartup = process.env.RUN_ON_STARTUP === 'true';
  const detailed = process.env.DETAILED === 'true';
  const pluginCronSchedule = process.env.PLUGIN_CRON_SCHEDULE || '0 9 * * 1'; // Monday 9 AM

  if (runOnStartup) {
    logger.info({ detailed }, 'Running plugin audit immediately');

    pipeline.runAudit({ detailed })
      .then(() => {
        logger.info('Plugin audit completed successfully');
        process.exit(0);
      })
      .catch((error: unknown) => {
        logError(logger, error as Error, 'Plugin audit failed');
        process.exit(1);
      });
  } else {
    logStart(logger, 'plugin audit scheduler', { cronSchedule: pluginCronSchedule });
    pipeline.scheduleAudits(pluginCronSchedule);

    // Keep process alive
    logger.info('Plugin audit scheduler running. Press Ctrl+C to exit.');
  }

  // Graceful shutdown
  process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down...');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down...');
    process.exit(0);
  });
}

export { PluginManagementPipeline };

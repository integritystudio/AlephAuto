#!/usr/bin/env -S node --strip-types
import { PluginManagerWorker } from '../utils/plugin-manager.ts';
import { config } from '../core/config.ts';
import { createComponentLogger, logError, logStart } from '../utils/logger.ts';
import { BasePipeline, type Job, type JobStats } from './base-pipeline.ts';

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

/**
 * Plugin Management Pipeline
 * Automatically audits Claude Code plugins on a schedule
 */
class PluginManagementPipeline extends BasePipeline<PluginManagerWorker> {
  constructor(options: Record<string, unknown> = {}) {
    super(new PluginManagerWorker({
      maxConcurrent: 1,
      logDir: cfg.logDir as string | undefined,
      sentryDsn: cfg.sentryDsn as string | undefined,
      ...options
    }));

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
        detailed: (job.data as Record<string, unknown>).detailed
      }, 'Plugin audit started');
    });

    this.worker.on('job:completed', (job: Job) => {
      const result = job.result as unknown as AuditResult;
      const duration = job.completedAt && job.startedAt
        ? job.completedAt.getTime() - job.startedAt.getTime()
        : undefined;
      logger.info({
        jobId: job.id,
        duration,
        totalPlugins: result.totalPlugins,
        duplicateCategories: result.duplicateCategories?.length ?? 0,
        recommendations: result.recommendations?.length ?? 0
      }, 'Plugin audit completed');

      // Display recommendations
      this.displayRecommendations(result);
    });

    this.worker.on('job:failed', (job: Job) => {
      logError(logger, job.error, 'Plugin audit failed', { jobId: job.id });
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
  async runAudit(options: AuditOptions = {}): Promise<JobStats> {
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
      const stats = this.getStats();

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
   * Schedule automatic plugin audits
   */
  scheduleAudits(cronSchedule: string = '0 9 * * 1') {
    return this.scheduleCron(logger, 'plugin audit', cronSchedule, () => this.runAudit({ detailed: false }));
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

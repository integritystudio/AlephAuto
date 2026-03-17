#!/usr/bin/env -S node --strip-types
import { PluginManagerWorker } from '../utils/plugin-manager.ts';
import { config } from '../core/config.ts';
import { createComponentLogger, logError, logStart } from '../utils/logger.ts';
import { BasePipeline, type JobStats } from './base-pipeline.ts';
import { isDirectExecution } from '../utils/execution-helpers.ts';

const logger = createComponentLogger('PluginPipeline');


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
  /**
   * constructor.
   */
  constructor(options: Record<string, unknown> = {}) {
    super(new PluginManagerWorker({
      maxConcurrent: 1,
      logDir: config.logDir,
      ...options
    }));

    this.setupDefaultEventListeners(logger, {
      onStarted: (job) => ({ detailed: (job.data as Record<string, unknown>).detailed }),
      onCompleted: (job) => {
        const result = job.result as unknown as AuditResult;
        this.displayRecommendations(result);
        return {
          totalPlugins: result.totalPlugins,
          duplicateCategories: result.duplicateCategories?.length ?? 0,
          recommendations: result.recommendations?.length ?? 0,
        };
      },
    });
  }

  /**
   * Display audit recommendations
   */
  private displayRecommendations(result: AuditResult): void {
    if (!result.recommendations || result.recommendations.length === 0) {
      return;
    }

    logger.info('\n╔════════════════════════════════════════════════════════════════╗');
    logger.info('║          Plugin Audit Recommendations                          ║');
    logger.info('╚════════════════════════════════════════════════════════════════╝\n');

    result.recommendations.forEach((rec) => {
      const priorityIcon: Record<string, string> = {
        high: '🔴',
        medium: '🟡',
        info: '✅'
      };
      const icon = priorityIcon[rec.priority] || '📌';

      logger.info(`${icon} [${rec.priority.toUpperCase()}] ${rec.type}`);
      logger.info(`   ${rec.message}`);
      logger.info(`   Action: ${rec.action}`);

      if (rec.details) {
        logger.info('   Details:');
        rec.details.forEach((detail) => {
          logger.info(`     • ${detail.category}: ${detail.plugins.join(', ')}`);
          logger.info(`       → ${detail.suggestion}`);
        });
      }
      logger.info('');
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
      const job = this.worker.addJob({
        detailed: options.detailed ?? false
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
      logError(logger, error, 'Plugin audit pipeline failed');
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
if (isDirectExecution(import.meta.url)) {
  const pipeline = new PluginManagementPipeline();

  const runOnStartup = config.runOnStartup;
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
        logError(logger, error, 'Plugin audit failed');
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

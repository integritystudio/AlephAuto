#!/usr/bin/env node
// @ts-nocheck
import cron from 'node-cron';
import { PluginManagerWorker } from '../utils/plugin-manager.js';
import { config } from '../core/config.js';
import { createComponentLogger } from '../utils/logger.js';

const logger = createComponentLogger('PluginPipeline');

/**
 * Plugin Management Pipeline
 * Automatically audits Claude Code plugins on a schedule
 */
class PluginManagementPipeline {
  constructor(options = {}) {
    this.worker = new PluginManagerWorker({
      maxConcurrent: 1,
      logDir: config.logDir,
      sentryDsn: config.sentryDsn,
      ...options
    });

    this.setupEventListeners();
  }

  /**
   * Setup event listeners for job events
   */
  setupEventListeners() {
    this.worker.on('job:created', (job) => {
      logger.info({ jobId: job.id }, 'Plugin audit job created');
    });

    this.worker.on('job:started', (job) => {
      logger.info({
        jobId: job.id,
        detailed: job.data.detailed
      }, 'Plugin audit started');
    });

    this.worker.on('job:completed', (job) => {
      const duration = job.completedAt - job.startedAt;
      logger.info({
        jobId: job.id,
        duration,
        totalPlugins: job.result.totalPlugins,
        duplicateCategories: job.result.duplicateCategories?.length || 0,
        recommendations: job.result.recommendations?.length || 0
      }, 'Plugin audit completed');

      // Display recommendations
      this.displayRecommendations(job.result);
    });

    this.worker.on('job:failed', (job) => {
      logger.error({
        jobId: job.id,
        error: job.error
      }, 'Plugin audit failed');
    });
  }

  /**
   * Display audit recommendations
   * @param {Object} result - Audit results
   */
  displayRecommendations(result) {
    if (!result.recommendations || result.recommendations.length === 0) {
      return;
    }

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║          Plugin Audit Recommendations                          ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    result.recommendations.forEach((rec) => {
      const priorityIcon = {
        high: '🔴',
        medium: '🟡',
        info: '✅'
      }[rec.priority] || '📌';

      console.log(`${priorityIcon} [${rec.priority.toUpperCase()}] ${rec.type}`);
      console.log(`   ${rec.message}`);
      console.log(`   Action: ${rec.action}`);

      if (rec.details) {
        console.log('   Details:');
        rec.details.forEach(detail => {
          console.log(`     • ${detail.category}: ${detail.plugins.join(', ')}`);
          console.log(`       → ${detail.suggestion}`);
        });
      }
      console.log('');
    });
  }

  /**
   * Run a single audit
   * @param {Object} options - Audit options
   */
  async runAudit(options = {}) {
    logger.info({ options }, 'Starting plugin audit');

    const startTime = Date.now();

    try {
      // Create audit job
      const job = this.worker.addJob({
        detailed: options.detailed || false
      });

      logger.info({ jobId: job.id }, 'Audit job created');

      // Wait for completion
      await this.waitForCompletion();

      const duration = Date.now() - startTime;
      const stats = this.worker.getStats();

      logger.info({
        duration,
        stats
      }, 'Plugin audit pipeline completed');

      return stats;
    } catch (error) {
      logger.error({ error }, 'Plugin audit pipeline failed');
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
   * Schedule automatic plugin audits
   * @param {string} cronSchedule - Cron schedule string
   * @returns {Object} Cron task
   */
  scheduleAudits(cronSchedule = '0 9 * * 1') {
    logger.info({ cronSchedule }, 'Scheduling plugin audits');

    if (!cron.validate(cronSchedule)) {
      throw new Error(`Invalid cron schedule: ${cronSchedule}`);
    }

    const task = cron.schedule(cronSchedule, async () => {
      logger.info('Cron triggered - starting plugin audit');
      try {
        await this.runAudit({ detailed: false });
      } catch (error) {
        logger.error({ error }, 'Scheduled plugin audit failed');
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
    logger.info('Running plugin audit immediately', { detailed });

    pipeline.runAudit({ detailed })
      .then(() => {
        logger.info('Plugin audit completed successfully');
        process.exit(0);
      })
      .catch((error) => {
        logger.error({ error }, 'Plugin audit failed');
        process.exit(1);
      });
  } else {
    logger.info('Starting plugin audit scheduler', { cronSchedule: pluginCronSchedule });
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

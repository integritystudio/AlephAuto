#!/usr/bin/env node
// @ts-nocheck

/**
 * Claude Health Check Pipeline - AlephAuto Integration
 *
 * Automated monitoring and health checking for Claude Code environment.
 * Runs comprehensive checks including:
 * - Environment setup and direnv configuration
 * - Directory structure verification
 * - Configuration validation
 * - Hook permissions and registration
 * - Plugin analysis and duplicate detection
 * - Performance monitoring
 *
 * Usage:
 *   npm run claude:health           # Run immediate health check
 *   npm run claude:health:detailed  # Run detailed health check
 *   npm run claude:health:schedule  # Start cron scheduler (daily 8 AM)
 *   RUN_ON_STARTUP=true npm run claude:health  # Run on startup
 *
 * Environment Variables:
 *   CLAUDE_HEALTH_CRON_SCHEDULE - Cron schedule (default: "0 8 * * *" - daily 8 AM)
 *   RUN_ON_STARTUP - Run immediately on startup (default: false)
 *   DETAILED - Include detailed component listing (default: false)
 *   SKIP_VALIDATION - Skip configuration validation (default: false)
 *   SKIP_PERFORMANCE - Skip performance log analysis (default: false)
 *   SKIP_PLUGINS - Skip plugin analysis (default: false)
 */

import { ClaudeHealthWorker } from '../workers/claude-health-worker.js';
import { createComponentLogger, logError, logStart } from '../utils/logger.ts';
import { config } from '../core/config.ts';
import cron from 'node-cron';

const logger = createComponentLogger('ClaudeHealthPipeline');

/**
 * Claude Health Check Pipeline
 */
class ClaudeHealthPipeline {
  constructor(options = {}) {
    this.worker = new ClaudeHealthWorker({
      maxConcurrent: 1,
      logDir: config.logDir,
      sentryDsn: config.sentryDsn,
      ...options
    });

    this.options = {
      detailed: process.env.DETAILED === 'true',
      skipValidation: process.env.SKIP_VALIDATION === 'true',
      skipPerformance: process.env.SKIP_PERFORMANCE === 'true',
      skipPlugins: process.env.SKIP_PLUGINS === 'true'
    };

    this.setupEventListeners();
  }

  /**
   * Setup event listeners for job events
   */
  setupEventListeners() {
    this.worker.on('job:created', (job) => {
      logger.info({ jobId: job.id }, 'Health check job created');
    });

    this.worker.on('job:started', (job) => {
      logger.info({ jobId: job.id }, 'Health check job started');
    });

    this.worker.on('job:completed', (job) => {
      const result = job.result;

      logger.info({
        jobId: job.id,
        healthScore: result.summary.healthScore,
        status: result.summary.status,
        criticalIssues: result.summary.criticalIssues,
        warnings: result.summary.warnings,
        duration: result.duration
      }, 'Health check job completed');

      // Display results
      this.displayResults(result);
    });

    this.worker.on('job:failed', (job) => {
      logError(logger, job.error, 'Health check job failed', { jobId: job.id });
    });
  }

  /**
   * Display health check results
   * @param {Object} result - Health check results
   */
  displayResults(result) {
    printSummary(result);

    if (result.recommendations.length > 0) {
      printRecommendations(result.recommendations);
    }

    if (this.options.detailed) {
      printDetailedChecks(result.checks);
    }
  }

  /**
   * Run a single health check
   * @param {Object} options - Check options
   */
  async runHealthCheck(options = {}) {
    logStart(logger, 'health check', { options });

    const startTime = Date.now();

    try {
      // Create health check job
      const job = this.worker.addJob({
        detailed: this.options.detailed,
        validateConfig: !this.options.skipValidation,
        checkPerformance: !this.options.skipPerformance,
        analyzePlugins: !this.options.skipPlugins,
        ...options
      });

      logger.info({ jobId: job.id }, 'Health check job created');

      // Wait for completion
      await this.waitForCompletion();

      const duration = Date.now() - startTime;
      const stats = this.worker.getStats();

      logger.info({
        duration,
        stats
      }, 'Health check pipeline completed');

      return stats;
    } catch (error) {
      logError(logger, error, 'Health check pipeline failed');
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
      }, 100);
    });
  }

  /**
   * Schedule automatic health checks
   * @param {string} cronSchedule - Cron schedule string
   * @returns {Object} Cron task
   */
  scheduleHealthChecks(cronSchedule) {
    logger.info({ cronSchedule }, 'Scheduling health checks');

    const task = cron.schedule(cronSchedule, () => {
      logger.info('Cron triggered health check');
      this.runHealthCheck().catch(error => {
        logError(logger, error, 'Scheduled health check failed');
      });
    });

    return task;
  }

  /**
   * Get worker statistics
   */
  getStats() {
    return this.worker.getStats();
  }
}

// Print functions
function printSummary(result) {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║          Claude Code Health Check Summary                     ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log(`Health Score: ${getScoreColor(result.summary.healthScore)}${result.summary.healthScore}/100\x1b[0m`);
  console.log(`Status:       ${result.summary.message}\n`);

  // Component inventory
  if (result.checks.components) {
    console.log('Component Inventory:');
    console.log(`  Skills:        ${result.checks.components.skills}`);
    console.log(`  Agents:        ${result.checks.components.agents}`);
    console.log(`  Commands:      ${result.checks.components.commands}`);
    console.log(`  Hooks:         ${result.checks.hooks?.executableHooks || 0}/${result.checks.hooks?.totalHooks || 0} executable`);
    console.log(`  Registered:    ${result.checks.hooks?.registeredHooks || 0} hook types`);
    if (result.checks.plugins) {
      console.log(`  Plugins:       ${result.checks.plugins.totalPlugins}`);
    }
    console.log(`  Active Tasks:  ${result.checks.components.activeTasks}`);
    console.log(`  Archived:      ${result.checks.components.archivedTasks}`);
    console.log('');
  }

  // Environment
  if (result.checks.environment) {
    const env = result.checks.environment;
    console.log('Environment:');
    console.log(`  Node.js:       ${env.nodeVersion || 'not found'}`);
    console.log(`  npm:           ${env.npmVersion || 'not found'}`);
    console.log(`  direnv:        ${env.direnv ? '✓ installed' : '✗ not installed'}`);
    if (env.direnv && !env.direnvAllowed) {
      console.log(`  \x1b[33m⚠  Environment variables not loaded\x1b[0m`);
    }
    console.log('');
  }

  // Summary statistics
  console.log('Summary:');
  console.log(`  Critical Issues: ${result.summary.criticalIssues}`);
  console.log(`  Warnings:        ${result.summary.warnings}`);
  console.log(`  Duration:        ${result.duration}ms\n`);
}

function printRecommendations(recommendations) {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║          Recommendations                                       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  for (const rec of recommendations) {
    const icon = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '✅';
    const priority = rec.priority.toUpperCase();

    console.log(`${icon} [${priority}] ${rec.type}`);
    console.log(`   ${rec.message}`);
    console.log(`   Action: ${rec.action}`);

    if (rec.details) {
      console.log('   Details:');
      for (const detail of rec.details) {
        if (detail.category && detail.plugins) {
          console.log(`     • ${detail.category}: ${detail.plugins.join(', ')}`);
          if (detail.suggestion) {
            console.log(`       → ${detail.suggestion}`);
          }
        }
      }
    }
    console.log('');
  }
}

function printDetailedChecks(checks) {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║          Detailed Check Results                                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Configuration
  if (checks.configuration) {
    console.log('Configuration Files:');
    console.log(`  settings.json:     ${checks.configuration.settingsJson.valid ? '✓' : '✗'} valid`);
    console.log(`  skill-rules.json:  ${checks.configuration.skillRulesJson.valid ? '✓' : '✗'} valid`);
    console.log(`  package.json:      ${checks.configuration.packageJson.valid ? '✓' : '✗'} valid`);
    console.log(`  .envrc:            ${checks.configuration.envrc.exists ? '✓' : '✗'} exists`);
    console.log('');
  }

  // Hooks
  if (checks.hooks && checks.hooks.hooks) {
    console.log('Hook Details:');
    for (const hook of checks.hooks.hooks) {
      const status = hook.executable ? '✓' : '✗';
      console.log(`  ${status} ${hook.name}`);
    }
    console.log('');
  }

  // Plugins
  if (checks.plugins && checks.plugins.duplicateCategories && checks.plugins.duplicateCategories.length > 0) {
    console.log('Duplicate Plugin Categories:');
    for (const cat of checks.plugins.duplicateCategories) {
      console.log(`  ${cat.category} (${cat.count} plugins):`);
      for (const plugin of cat.plugins) {
        console.log(`    • ${plugin}`);
      }
    }
    console.log('');
  }

  // Performance
  if (checks.performance && checks.performance.logExists) {
    console.log('Performance:');
    console.log(`  Log size:       ${formatBytes(checks.performance.logSize)}`);
    console.log(`  Total entries:  ${checks.performance.totalEntries}`);
    console.log(`  Slow hooks:     ${checks.performance.slowHooks}`);
    console.log(`  Failures:       ${checks.performance.failures}`);

    if (checks.performance.slowHookDetails && checks.performance.slowHookDetails.length > 0) {
      console.log('\n  Slowest hooks:');
      for (const hook of checks.performance.slowHookDetails) {
        console.log(`    • ${hook.hook}: ${hook.duration}ms`);
      }
    }
    console.log('');
  }
}

function getScoreColor(score) {
  if (score >= 90) return '\x1b[32m'; // Green
  if (score >= 70) return '\x1b[33m'; // Yellow
  return '\x1b[31m'; // Red
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Initialize pipeline
const pipeline = new ClaudeHealthPipeline();

// Configuration
const CRON_SCHEDULE = process.env.CLAUDE_HEALTH_CRON_SCHEDULE || '0 8 * * *';
const RUN_ON_STARTUP = process.env.RUN_ON_STARTUP === 'true';
const CRON_ENABLED = process.argv.includes('--cron');

logger.info('Claude Health Pipeline initialized', {
  cronEnabled: CRON_ENABLED,
  cronSchedule: CRON_SCHEDULE,
  runOnStartup: RUN_ON_STARTUP
});

// Main execution
(async () => {
  try {
    // Run immediately if requested
    if (RUN_ON_STARTUP) {
      logger.info('Running health check on startup');
      await pipeline.runHealthCheck();

      if (!CRON_ENABLED) {
        const stats = pipeline.getStats();
        const hasFailures = stats.failed > 0;
        process.exit(hasFailures ? 1 : 0);
      }
    }

    // Setup cron if enabled
    if (CRON_ENABLED) {
      logger.info('Setting up cron schedule', { schedule: CRON_SCHEDULE });
      pipeline.scheduleHealthChecks(CRON_SCHEDULE);

      console.log(`\n✓ Claude Health Check scheduled: ${CRON_SCHEDULE}`);
      console.log('  Press Ctrl+C to stop\n');

      // Keep process alive
      process.stdin.resume();
    } else if (!RUN_ON_STARTUP) {
      // Run once immediately if not cron mode and not startup
      await pipeline.runHealthCheck();
      const stats = pipeline.getStats();
      const hasFailures = stats.failed > 0;
      process.exit(hasFailures ? 1 : 0);
    }
  } catch (error) {
    logError(logger, error, 'Pipeline execution failed');
    process.exit(1);
  }
})();

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

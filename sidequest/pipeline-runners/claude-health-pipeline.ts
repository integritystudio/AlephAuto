#!/usr/bin/env -S node --strip-types

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

import { ClaudeHealthWorker } from '../workers/claude-health-worker.ts';
import { createComponentLogger, logError, logStart } from '../utils/logger.ts';
import { config } from '../core/config.ts';
import { BYTES_PER_KB, JOB_EVENTS, MAX_SCORE } from '../core/constants.ts';
import { HEALTH_SCORE_THRESHOLDS } from '../core/score-thresholds.ts';
import { BasePipeline, type Job, type JobStats } from './base-pipeline.ts';
import { isDirectExecution } from '../utils/execution-helpers.ts';

const logger = createComponentLogger('ClaudeHealthPipeline');


interface HealthCheckOptions {
  detailed?: boolean;
  validateConfig?: boolean;
  checkPerformance?: boolean;
  analyzePlugins?: boolean;
  [key: string]: unknown;
}

interface PipelineOptions {
  detailed: boolean;
  skipValidation: boolean;
  skipPerformance: boolean;
  skipPlugins: boolean;
}

interface Recommendation {
  priority: string;
  type: string;
  message: string;
  action: string;
  details?: Array<{
    category?: string;
    plugins?: string[];
    suggestion?: string;
  }>;
}

interface HealthCheckResult {
  summary: {
    healthScore: number;
    status: string;
    message: string;
    criticalIssues: number;
    warnings: number;
  };
  checks: {
    components?: {
      skills: number;
      agents: number;
      commands: number;
      activeTasks: number;
      archivedTasks: number;
    };
    hooks?: {
      executableHooks: number;
      totalHooks: number;
      registeredHooks: number;
      hooks?: Array<{ name: string; executable: boolean }>;
    };
    plugins?: {
      totalPlugins: number;
      duplicateCategories?: Array<{
        category: string;
        count: number;
        plugins: string[];
      }>;
    };
    environment?: {
      nodeVersion?: string;
      npmVersion?: string;
      direnv?: boolean;
      direnvAllowed?: boolean;
    };
    configuration?: {
      settingsJson: { valid: boolean };
      skillRulesJson: { valid: boolean };
      packageJson: { valid: boolean };
      envrc: { exists: boolean };
    };
    performance?: {
      logExists: boolean;
      logSize: number;
      totalEntries: number;
      slowHooks: number;
      failures: number;
      slowHookDetails?: Array<{ hook: string; duration: number }>;
    };
  };
  recommendations: Recommendation[];
  duration: number;
}

/**
 * Claude Health Check Pipeline
 */
class ClaudeHealthPipeline extends BasePipeline<ClaudeHealthWorker> {
  private options: PipelineOptions;

  /**
   * constructor.
   */
  constructor(options: Record<string, unknown> = {}) {
    super(new ClaudeHealthWorker({
      maxConcurrent: 1,
      logDir: config.logDir,
      sentryDsn: config.sentryDsn,
      ...options
    }));

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
  private setupEventListeners(): void {
    this.worker.on(JOB_EVENTS.CREATED, (job: Job) => {
      logger.info({ jobId: job.id }, 'Health check job created');
    });

    this.worker.on(JOB_EVENTS.STARTED, (job: Job) => {
      logger.info({ jobId: job.id }, 'Health check job started');
    });

    this.worker.on(JOB_EVENTS.COMPLETED, (job: Job) => {
      const result = job.result as unknown as HealthCheckResult;

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

    this.worker.on(JOB_EVENTS.FAILED, (job: Job) => {
      logError(logger, job.error, 'Health check job failed', { jobId: job.id });
    });
  }

  /**
   * Display health check results
   */
  private displayResults(result: HealthCheckResult): void {
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
   */
  async runHealthCheck(options: HealthCheckOptions = {}): Promise<JobStats> {
    logStart(logger, 'health check', { options });

    const startTime = Date.now();

    try {
      // Create health check job
      const job = this.worker.addJob({
        detailed: options.detailed ?? this.options.detailed,
        validateConfig: options.validateConfig ?? !this.options.skipValidation,
        checkPerformance: options.checkPerformance ?? !this.options.skipPerformance,
        analyzePlugins: options.analyzePlugins ?? !this.options.skipPlugins,
      });

      logger.info({ jobId: job.id }, 'Health check job created');

      // Wait for completion
      await this.waitForCompletion();

      const duration = Date.now() - startTime;
      const stats = this.getStats();

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
   * Schedule automatic health checks
   */
  scheduleHealthChecks(cronSchedule: string) {
    return this.scheduleCron(logger, 'health check', cronSchedule, () => this.runHealthCheck());
  }
}

// Print functions
/**
 * printSummary.
 */
function printSummary(result: HealthCheckResult): void {
  logger.info('\n╔════════════════════════════════════════════════════════════════╗');
  logger.info('║          Claude Code Health Check Summary                     ║');
  logger.info('╚════════════════════════════════════════════════════════════════╝\n');

  logger.info(
    `Health Score: ${getScoreColor(result.summary.healthScore)}${result.summary.healthScore}/${MAX_SCORE}\x1b[0m`
  );
  logger.info(`Status:       ${result.summary.message}\n`);

  // Component inventory
  if (result.checks.components) {
    logger.info('Component Inventory:');
    logger.info(`  Skills:        ${result.checks.components.skills}`);
    logger.info(`  Agents:        ${result.checks.components.agents}`);
    logger.info(`  Commands:      ${result.checks.components.commands}`);
    logger.info(`  Hooks:         ${result.checks.hooks?.executableHooks ?? 0}/${result.checks.hooks?.totalHooks ?? 0} executable`);
    logger.info(`  Registered:    ${result.checks.hooks?.registeredHooks ?? 0} hook types`);
    if (result.checks.plugins) {
      logger.info(`  Plugins:       ${result.checks.plugins.totalPlugins}`);
    }
    logger.info(`  Active Tasks:  ${result.checks.components.activeTasks}`);
    logger.info(`  Archived:      ${result.checks.components.archivedTasks}`);
    logger.info('');
  }

  // Environment
  if (result.checks.environment) {
    const env = result.checks.environment;
    logger.info('Environment:');
    logger.info(`  Node.js:       ${env.nodeVersion ?? 'not found'}`);
    logger.info(`  npm:           ${env.npmVersion ?? 'not found'}`);
    logger.info(`  direnv:        ${env.direnv ? '✓ installed' : '✗ not installed'}`);
    if (env.direnv && !env.direnvAllowed) {
      logger.info(`  \x1b[33m⚠  Environment variables not loaded\x1b[0m`);
    }
    logger.info('');
  }

  // Summary statistics
  logger.info('Summary:');
  logger.info(`  Critical Issues: ${result.summary.criticalIssues}`);
  logger.info(`  Warnings:        ${result.summary.warnings}`);
  logger.info(`  Duration:        ${result.duration}ms\n`);
}

/**
 * printRecommendations.
 */
function printRecommendations(recommendations: Recommendation[]): void {
  logger.info('╔════════════════════════════════════════════════════════════════╗');
  logger.info('║          Recommendations                                       ║');
  logger.info('╚════════════════════════════════════════════════════════════════╝\n');

  for (const rec of recommendations) {
    const icon = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '✅';
    const priority = rec.priority.toUpperCase();

    logger.info(`${icon} [${priority}] ${rec.type}`);
    logger.info(`   ${rec.message}`);
    logger.info(`   Action: ${rec.action}`);

    if (rec.details) {
      logger.info('   Details:');
      for (const detail of rec.details) {
        if (detail.category && detail.plugins) {
          logger.info(`     • ${detail.category}: ${detail.plugins.join(', ')}`);
          if (detail.suggestion) {
            logger.info(`       → ${detail.suggestion}`);
          }
        }
      }
    }
    logger.info('');
  }
}

/**
 * printDetailedChecks.
 */
function printDetailedChecks(checks: HealthCheckResult['checks']): void {
  logger.info('╔════════════════════════════════════════════════════════════════╗');
  logger.info('║          Detailed Check Results                                ║');
  logger.info('╚════════════════════════════════════════════════════════════════╝\n');

  // Configuration
  if (checks.configuration) {
    logger.info('Configuration Files:');
    logger.info(`  settings.json:     ${checks.configuration.settingsJson.valid ? '✓' : '✗'} valid`);
    logger.info(`  skill-rules.json:  ${checks.configuration.skillRulesJson.valid ? '✓' : '✗'} valid`);
    logger.info(`  package.json:      ${checks.configuration.packageJson.valid ? '✓' : '✗'} valid`);
    logger.info(`  .envrc:            ${checks.configuration.envrc.exists ? '✓' : '✗'} exists`);
    logger.info('');
  }

  // Hooks
  if (checks.hooks?.hooks) {
    logger.info('Hook Details:');
    for (const hook of checks.hooks.hooks) {
      const status = hook.executable ? '✓' : '✗';
      logger.info(`  ${status} ${hook.name}`);
    }
    logger.info('');
  }

  // Plugins
  if (checks.plugins?.duplicateCategories && checks.plugins.duplicateCategories.length > 0) {
    logger.info('Duplicate Plugin Categories:');
    for (const cat of checks.plugins.duplicateCategories) {
      logger.info(`  ${cat.category} (${cat.count} plugins):`);
      for (const plugin of cat.plugins) {
        logger.info(`    • ${plugin}`);
      }
    }
    logger.info('');
  }

  // Performance
  if (checks.performance?.logExists) {
    logger.info('Performance:');
    logger.info(`  Log size:       ${formatBytes(checks.performance.logSize)}`);
    logger.info(`  Total entries:  ${checks.performance.totalEntries}`);
    logger.info(`  Slow hooks:     ${checks.performance.slowHooks}`);
    logger.info(`  Failures:       ${checks.performance.failures}`);

    if (checks.performance.slowHookDetails && checks.performance.slowHookDetails.length > 0) {
      logger.info('\n  Slowest hooks:');
      for (const hook of checks.performance.slowHookDetails) {
        logger.info(`    • ${hook.hook}: ${hook.duration}ms`);
      }
    }
    logger.info('');
  }
}

/**
 * getScoreColor.
 */
function getScoreColor(score: number): string {
  if (score >= HEALTH_SCORE_THRESHOLDS.HEALTHY_MIN_SCORE) return '\x1b[32m'; // Green
  if (score >= HEALTH_SCORE_THRESHOLDS.WARNING_MIN_SCORE) return '\x1b[33m'; // Yellow
  return '\x1b[31m'; // Red
}

/**
 * formatBytes.
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = BYTES_PER_KB;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

async function runCli(): Promise<void> {
  const pipeline = new ClaudeHealthPipeline();

  const cronSchedule = process.env.CLAUDE_HEALTH_CRON_SCHEDULE || '0 8 * * *';
  const runOnStartup = config.runOnStartup;
  const cronEnabled = process.argv.includes('--cron');

  logger.info({
    cronEnabled,
    cronSchedule,
    runOnStartup
  }, 'Claude Health Pipeline initialized');

  try {
    if (runOnStartup) {
      logger.info('Running health check on startup');
      await pipeline.runHealthCheck();

      if (!cronEnabled) {
        const stats = pipeline.getStats();
        const hasFailures = stats.failed > 0;
        process.exit(hasFailures ? 1 : 0);
      }
    }

    if (cronEnabled) {
      logger.info({ schedule: cronSchedule }, 'Setting up cron schedule');
      pipeline.scheduleHealthChecks(cronSchedule);

      logger.info({ cronSchedule }, 'Claude Health Check scheduled');
      logger.info('Press Ctrl+C to stop');
      process.stdin.resume();
    } else if (!runOnStartup) {
      await pipeline.runHealthCheck();
      const stats = pipeline.getStats();
      const hasFailures = stats.failed > 0;
      process.exit(hasFailures ? 1 : 0);
    }
  } catch (error) {
    logError(logger, error, 'Pipeline execution failed');
    process.exit(1);
  }

  process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down gracefully');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully');
    process.exit(0);
  });
}

if (isDirectExecution(import.meta.url)) {
  runCli().catch((error) => {
    logError(logger, error, 'Pipeline execution failed');
    process.exit(1);
  });
}

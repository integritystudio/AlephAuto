#!/usr/bin/env node

/**
 * Duplicate Detection Pipeline
 *
 * Automated duplicate detection scanning system with cron scheduling.
 * Scans repositories on a configured schedule, detects duplicates, generates reports.
 *
 * Features:
 * - Cron-based scheduling
 * - Repository prioritization and frequency management
 * - Inter-project and intra-project scanning
 * - Redis-based job queue (optional)
 * - Retry logic with exponential backoff
 * - Sentry error tracking
 * - Progress tracking and metrics
 *
 * Usage:
 *   node duplicate-detection-pipeline.js                    # Start cron server
 *   RUN_ON_STARTUP=true node duplicate-detection-pipeline.js # Run immediately
 */

import { SidequestServer } from './sidequest/server.js';
import { RepositoryConfigLoader } from './lib/config/repository-config-loader.js';
import { InterProjectScanner } from './lib/inter-project-scanner.js';
import { ScanOrchestrator } from './lib/scan-orchestrator.js';
import { ReportCoordinator } from './lib/reports/report-coordinator.js';
import { createComponentLogger } from './sidequest/logger.js';
import { config } from './sidequest/config.js';
import cron from 'node-cron';
import path from 'path';
import * as Sentry from '@sentry/node';

const logger = createComponentLogger('DuplicateDetectionPipeline');

/**
 * Duplicate Detection Worker
 *
 * Extends SidequestServer to handle duplicate detection scanning jobs
 */
class DuplicateDetectionWorker extends SidequestServer {
  constructor(options = {}) {
    super({
      maxConcurrent: options.maxConcurrentScans || 3,
      logDir: path.join(process.cwd(), 'logs', 'duplicate-detection'),
      ...options
    });

    this.configLoader = new RepositoryConfigLoader(options.configPath);
    this.interProjectScanner = new InterProjectScanner({
      outputDir: path.join(process.cwd(), 'output', 'automated-scans')
    });
    this.orchestrator = new ScanOrchestrator({
      pythonPath: path.join(process.cwd(), 'venv', 'bin', 'python3')
    });
    this.reportCoordinator = new ReportCoordinator(
      path.join(process.cwd(), 'output', 'reports')
    );

    this.scanMetrics = {
      totalScans: 0,
      successfulScans: 0,
      failedScans: 0,
      totalDuplicatesFound: 0,
      totalSuggestionsGenerated: 0,
      highImpactDuplicates: 0
    };

    this.retryQueue = new Map(); // jobId -> { attempts, lastAttempt, maxAttempts, delay }
  }

  /**
   * Initialize the worker
   */
  async initialize() {
    try {
      // Load configuration
      await this.configLoader.load();

      // Validate configuration
      this.configLoader.validate();

      const stats = this.configLoader.getStats();
      logger.info({
        ...stats
      }, 'Duplicate detection pipeline initialized');

      this.emit('initialized', stats);
    } catch (error) {
      logger.error({ error }, 'Failed to initialize duplicate detection pipeline');
      Sentry.captureException(error);
      throw error;
    }
  }

  /**
   * Run job handler (required by SidequestServer)
   */
  async runJobHandler(job) {
    const { scanType, repositories, groupName } = job.data;

    logger.info({
      jobId: job.id,
      scanType,
      repositories: repositories?.length || 0,
      groupName
    }, 'Starting duplicate detection scan job');

    try {
      if (scanType === 'inter-project') {
        return await this._runInterProjectScan(job, repositories);
      } else if (scanType === 'intra-project') {
        return await this._runIntraProjectScan(job, repositories[0]);
      } else {
        throw new Error(`Unknown scan type: ${scanType}`);
      }
    } catch (error) {
      // Handle retry logic
      const shouldRetry = await this._handleRetry(job, error);

      if (shouldRetry) {
        logger.info({ jobId: job.id }, 'Job will be retried');
        throw error; // Re-throw to mark job as failed, will be retried by retry handler
      } else {
        logger.error({ jobId: job.id, error }, 'Job failed after all retry attempts');
        throw error;
      }
    }
  }

  /**
   * Handle retry logic with exponential backoff
   */
  async _handleRetry(job, error) {
    const scanConfig = this.configLoader.getScanConfig();
    const maxRetries = scanConfig.retryAttempts || 0;
    const baseDelay = scanConfig.retryDelay || 60000;

    if (!this.retryQueue.has(job.id)) {
      // First failure - initialize retry tracking
      this.retryQueue.set(job.id, {
        attempts: 0,
        lastAttempt: Date.now(),
        maxAttempts: maxRetries,
        delay: baseDelay
      });
    }

    const retryInfo = this.retryQueue.get(job.id);
    retryInfo.attempts++;

    if (retryInfo.attempts >= retryInfo.maxAttempts) {
      // Max retries reached
      this.retryQueue.delete(job.id);
      return false;
    }

    // Calculate exponential backoff delay
    const delay = retryInfo.delay * Math.pow(2, retryInfo.attempts - 1);

    logger.info({
      jobId: job.id,
      attempt: retryInfo.attempts,
      maxAttempts: retryInfo.maxAttempts,
      delayMs: delay,
      error: error.message
    }, 'Scheduling retry with exponential backoff');

    // Schedule retry
    setTimeout(() => {
      logger.info({ jobId: job.id }, 'Retrying failed job');
      this.createJob(job.id + `-retry${retryInfo.attempts}`, job.data);
    }, delay);

    return true;
  }

  /**
   * Run inter-project scan
   */
  async _runInterProjectScan(job, repositoryConfigs) {
    const repoPaths = repositoryConfigs.map(r => r.path);

    logger.info({
      jobId: job.id,
      repositories: repoPaths.length
    }, 'Running inter-project scan');

    const result = await this.interProjectScanner.scanRepositories(repoPaths);

    // Generate reports
    await this.reportCoordinator.generateAllReports(result, {
      title: `Automated Inter-Project Scan: ${repoPaths.length} Repositories`,
      includeDetails: true,
      includeSourceCode: true,
      includeCodeBlocks: true
    });

    // Update scan metrics
    this._updateMetrics(result);

    // Update repository configurations
    await this._updateRepositoryConfigs(repositoryConfigs, result);

    // Check for high-impact duplicates
    await this._checkForHighImpactDuplicates(result);

    return {
      scanType: 'inter-project',
      repositories: repoPaths.length,
      crossRepoDuplicates: result.metrics.total_cross_repository_groups || 0,
      suggestions: result.metrics.total_suggestions || 0,
      duration: result.scan_metadata?.duration_seconds || 0
    };
  }

  /**
   * Run intra-project scan
   */
  async _runIntraProjectScan(job, repositoryConfig) {
    const repoPath = repositoryConfig.path;

    logger.info({
      jobId: job.id,
      repository: repoPath
    }, 'Running intra-project scan');

    const result = await this.orchestrator.scanRepository(repoPath);

    // Generate reports
    await this.reportCoordinator.generateAllReports(result, {
      title: `Automated Scan: ${repositoryConfig.name}`,
      includeDetails: true,
      includeSourceCode: true,
      includeCodeBlocks: true
    });

    // Update scan metrics
    this._updateMetrics(result);

    // Update repository configuration
    await this._updateRepositoryConfigs([repositoryConfig], result);

    // Check for high-impact duplicates
    await this._checkForHighImpactDuplicates(result);

    return {
      scanType: 'intra-project',
      repository: repositoryConfig.name,
      duplicates: result.metrics.total_duplicate_groups || 0,
      suggestions: result.metrics.total_suggestions || 0,
      duration: result.scan_metadata?.duration_seconds || 0
    };
  }

  /**
   * Update scan metrics
   */
  _updateMetrics(scanResult) {
    this.scanMetrics.totalScans++;

    if (scanResult.scan_type === 'inter-project') {
      this.scanMetrics.totalDuplicatesFound += scanResult.metrics.total_cross_repository_groups || 0;
      this.scanMetrics.totalSuggestionsGenerated += scanResult.metrics.total_suggestions || 0;

      // Count high-impact duplicates
      const highImpactDuplicates = (scanResult.cross_repository_duplicates || [])
        .filter(dup => dup.impact_score >= 75);
      this.scanMetrics.highImpactDuplicates += highImpactDuplicates.length;
    } else {
      this.scanMetrics.totalDuplicatesFound += scanResult.metrics.total_duplicate_groups || 0;
      this.scanMetrics.totalSuggestionsGenerated += scanResult.metrics.total_suggestions || 0;

      // Count high-impact duplicates
      const highImpactDuplicates = (scanResult.duplicate_groups || [])
        .filter(dup => dup.impact_score >= 75);
      this.scanMetrics.highImpactDuplicates += highImpactDuplicates.length;
    }
  }

  /**
   * Update repository configurations with scan results
   */
  async _updateRepositoryConfigs(repositoryConfigs, scanResult) {
    const status = scanResult.scan_metadata ? 'success' : 'failure';
    const duration = scanResult.scan_metadata?.duration_seconds || 0;
    const duplicatesFound = scanResult.scan_type === 'inter-project'
      ? scanResult.metrics.total_cross_repository_groups || 0
      : scanResult.metrics.total_duplicate_groups || 0;

    for (const repoConfig of repositoryConfigs) {
      try {
        // Update last scanned timestamp
        await this.configLoader.updateLastScanned(repoConfig.name);

        // Add scan history entry
        await this.configLoader.addScanHistory(repoConfig.name, {
          status,
          duration,
          duplicatesFound
        });
      } catch (error) {
        logger.warn({
          error,
          repository: repoConfig.name
        }, 'Failed to update repository config');
      }
    }
  }

  /**
   * Check for high-impact duplicates and send notifications
   */
  async _checkForHighImpactDuplicates(scanResult) {
    const notificationSettings = this.configLoader.getNotificationSettings();

    if (!notificationSettings.enabled || !notificationSettings.onHighImpactDuplicates) {
      return;
    }

    const threshold = notificationSettings.highImpactThreshold || 75;
    const duplicates = scanResult.scan_type === 'inter-project'
      ? scanResult.cross_repository_duplicates || []
      : scanResult.duplicate_groups || [];

    const highImpactDuplicates = duplicates.filter(dup => dup.impact_score >= threshold);

    if (highImpactDuplicates.length > 0) {
      logger.warn({
        count: highImpactDuplicates.length,
        threshold,
        topImpactScore: Math.max(...highImpactDuplicates.map(d => d.impact_score))
      }, 'High-impact duplicates detected');

      // Send Sentry notification
      Sentry.captureMessage(`High-impact duplicates detected: ${highImpactDuplicates.length} duplicates with impact score >= ${threshold}`, {
        level: 'warning',
        tags: {
          component: 'duplicate-detection',
          scanType: scanResult.scan_type
        },
        contexts: {
          duplicates: {
            count: highImpactDuplicates.length,
            threshold,
            topImpactScore: Math.max(...highImpactDuplicates.map(d => d.impact_score))
          }
        }
      });
    }
  }

  /**
   * Schedule a scan job
   */
  scheduleScan(scanType, repositories, groupName = null) {
    const jobId = `scan-${scanType}-${Date.now()}`;
    const jobData = {
      scanType,
      repositories,
      groupName,
      type: 'duplicate-detection'
    };

    return this.createJob(jobId, jobData);
  }

  /**
   * Run nightly scan (called by cron)
   */
  async runNightlyScan() {
    logger.info('Starting nightly duplicate detection scan');

    const scanConfig = this.configLoader.getScanConfig();

    if (!scanConfig.enabled) {
      logger.info('Automated scanning is disabled');
      return;
    }

    // Get repositories to scan tonight
    const repositoriesToScan = this.configLoader.getRepositoriesToScanTonight();

    logger.info({
      repositoryCount: repositoriesToScan.length
    }, 'Repositories selected for scanning');

    if (repositoriesToScan.length === 0) {
      logger.info('No repositories to scan tonight');
      return;
    }

    // Scan individual repositories (intra-project)
    for (const repo of repositoriesToScan) {
      this.scheduleScan('intra-project', [repo]);
    }

    // Scan repository groups (inter-project)
    const groups = this.configLoader.getEnabledGroups();
    for (const group of groups) {
      const groupRepos = this.configLoader.getGroupRepositories(group.name);
      if (groupRepos.length >= 2) {
        this.scheduleScan('inter-project', groupRepos, group.name);
      }
    }

    logger.info({
      individualScans: repositoriesToScan.length,
      groupScans: groups.length
    }, 'Nightly scan scheduled');
  }

  /**
   * Get scan metrics
   */
  getScanMetrics() {
    return {
      ...this.scanMetrics,
      queueStats: this.getStats()
    };
  }
}

/**
 * Main execution
 */
async function main() {
  const cronSchedule = config.duplicateScanCronSchedule || process.env.DUPLICATE_SCAN_CRON_SCHEDULE || '0 2 * * *';
  const runOnStartup = process.env.RUN_ON_STARTUP === 'true';

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     DUPLICATE DETECTION AUTOMATED PIPELINE              ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  try {
    // Initialize worker
    const worker = new DuplicateDetectionWorker({
      maxConcurrentScans: config.maxConcurrentDuplicateScans || 3
    });

    await worker.initialize();

    console.log('✅ Duplicate detection pipeline initialized\n');

    const stats = worker.configLoader.getStats();
    console.log('📊 Configuration:');
    console.log(`   Total repositories: ${stats.totalRepositories}`);
    console.log(`   Enabled repositories: ${stats.enabledRepositories}`);
    console.log(`   Repository groups: ${stats.groups}\n`);

    // Schedule cron job
    if (!runOnStartup) {
      console.log(`⏰ Scheduling nightly scans: ${cronSchedule}\n`);

      cron.schedule(cronSchedule, async () => {
        logger.info('Cron job triggered');
        try {
          await worker.runNightlyScan();
        } catch (error) {
          logger.error({ error }, 'Nightly scan failed');
          Sentry.captureException(error);
        }
      });

      console.log('🚀 Pipeline is running. Press Ctrl+C to stop.\n');
    } else {
      console.log('▶️  Running scan immediately (RUN_ON_STARTUP=true)\n');
      await worker.runNightlyScan();

      console.log('\n✅ Startup scan completed');
      const metrics = worker.getScanMetrics();
      console.log('\n📊 Scan Metrics:');
      console.log(`   Total scans: ${metrics.totalScans}`);
      console.log(`   Duplicates found: ${metrics.totalDuplicatesFound}`);
      console.log(`   Suggestions generated: ${metrics.totalSuggestionsGenerated}`);
      console.log(`   High-impact duplicates: ${metrics.highImpactDuplicates}\n`);

      process.exit(0);
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    logger.error({ error }, 'Pipeline initialization failed');
    Sentry.captureException(error);
    process.exit(1);
  }
}

// Run the pipeline
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { DuplicateDetectionWorker };

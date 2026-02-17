/**
 * Duplicate Detection Worker
 *
 * Extends SidequestServer to handle duplicate detection scanning jobs
 * within the AlephAuto framework.
 *
 * Features:
 * - Inter-project and intra-project scanning
 * - Intelligent retry logic with circuit breaker
 * - Auto-PR creation for consolidation suggestions
 * - Repository configuration management
 * - High-impact duplicate notifications
 * - Comprehensive metrics tracking
 */

import { SidequestServer } from '../core/server.js';
import { RepositoryConfigLoader } from '../pipeline-core/config/repository-config-loader.js';
import { InterProjectScanner } from '../pipeline-core/inter-project-scanner.js';
import { ScanOrchestrator } from '../pipeline-core/scan-orchestrator.ts';
import { ReportCoordinator } from '../pipeline-core/reports/report-coordinator.js';
import { PRCreator } from '../pipeline-core/git/pr-creator.js';
import { createComponentLogger, logError, logWarn, logStart, logRetry } from '../utils/logger.js';
import { isRetryable, getErrorInfo } from '../pipeline-core/errors/error-classifier.js';
import path from 'path';
import * as Sentry from '@sentry/node';
import { RETRY } from '../core/constants.js';
import { config } from '../core/config.js';

const logger = createComponentLogger('DuplicateDetectionWorker');

/**
 * DuplicateDetectionWorker
 *
 * Handles duplicate detection scanning jobs with retry logic,
 * PR creation, and comprehensive reporting.
 */
export class DuplicateDetectionWorker extends SidequestServer {
  constructor(options = {}) {
    super({
      ...options,
      jobType: 'duplicate-detection',
      maxConcurrent: options.maxConcurrentScans || 3,
      logDir: path.join(process.cwd(), 'logs', 'duplicate-detection'),
    });

    this.configLoader = new RepositoryConfigLoader(options.configPath);
    this.interProjectScanner = new InterProjectScanner({
      outputDir: path.join(process.cwd(), 'output', 'automated-scans')
    });
    // Let ScanOrchestrator auto-detect Python path based on environment
    // (venv for local dev, system Python for CI/production)
    this.orchestrator = new ScanOrchestrator({});
    this.reportCoordinator = new ReportCoordinator(
      path.join(process.cwd(), 'output', 'reports')
    );
    this.prCreator = new PRCreator({
      baseBranch: options.baseBranch || 'main',
      branchPrefix: options.branchPrefix || 'consolidate',
      dryRun: options.dryRun ?? config.prDryRun,
      maxSuggestionsPerPR: options.maxSuggestionsPerPR || 5
    });

    this.scanMetrics = {
      totalScans: 0,
      successfulScans: 0,
      failedScans: 0,
      totalDuplicatesFound: 0,
      totalSuggestionsGenerated: 0,
      highImpactDuplicates: 0,
      prsCreated: 0,
      prCreationErrors: 0
    };

    this.enablePRCreation = options.enablePRCreation ?? config.enablePRCreation;

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
      }, 'Duplicate detection worker initialized');

      this.emit('initialized', stats);
      this.emit('pipeline:status', {
        status: 'initialized',
        stats
      });
    } catch (error) {
      logError(logger, error, 'Failed to initialize duplicate detection worker');
      Sentry.captureException(error);
      throw error;
    }
  }

  /**
   * Run job handler (required by SidequestServer)
   */
  async runJobHandler(job) {
    const { scanType, repositories, groupName } = job.data;

    logStart(logger, 'duplicate detection scan job', {
      jobId: job.id,
      scanType,
      repositories: repositories?.length || 0,
      groupName
    });

    this.emit('pipeline:status', {
      status: 'scanning',
      jobId: job.id,
      scanType,
      repositories: repositories?.length || 0
    });

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
        logError(logger, error, 'Job failed after all retry attempts', { jobId: job.id });
        this.emit('pipeline:status', {
          status: 'failed',
          jobId: job.id,
          error: error.message
        });
        throw error;
      }
    }
  }

  /**
   * Extract original job ID by stripping all retry suffixes
   * @param {string} jobId - Job ID (may contain retry suffixes)
   * @returns {string} Original job ID without retry suffixes
   * @private
   */
  _getOriginalJobId(jobId) {
    // Strip all -retryN suffixes to get the original job ID
    // Example: "scan-intra-project-123-retry1-retry1-retry1" -> "scan-intra-project-123"
    return jobId.replace(/-retry\d+/g, '');
  }

  /**
   * Handle retry logic with exponential backoff
   */
  async _handleRetry(job, error) {
    const scanConfig = this.configLoader.getScanConfig();
    const maxRetries = scanConfig.retryAttempts || 0;
    const baseDelay = scanConfig.retryDelay || RETRY.RATE_LIMIT_DELAY_MS;

    // Get original job ID to track retries correctly
    const originalJobId = this._getOriginalJobId(job.id);

    // Classify error to determine if retry is appropriate
    const errorInfo = getErrorInfo(error);

    if (!errorInfo.retryable) {
      logger.warn({
        jobId: job.id,
        originalJobId,
        errorCode: errorInfo.code,
        errorMessage: errorInfo.message,
        classification: errorInfo.category,
        reason: errorInfo.reason
      }, 'Error is non-retryable - skipping retry');
      this.retryQueue.delete(originalJobId);
      return false;
    }

    if (!this.retryQueue.has(originalJobId)) {
      // First failure - initialize retry tracking
      this.retryQueue.set(originalJobId, {
        attempts: 0,
        lastAttempt: Date.now(),
        maxAttempts: maxRetries,
        delay: baseDelay
      });
    }

    const retryInfo = this.retryQueue.get(originalJobId);
    retryInfo.attempts++;

    // Circuit breaker: Check against absolute maximum
    if (retryInfo.attempts >= RETRY.MAX_ABSOLUTE_ATTEMPTS) {
      logger.error({
        jobId: job.id,
        originalJobId,
        attempts: retryInfo.attempts,
        maxAbsolute: RETRY.MAX_ABSOLUTE_ATTEMPTS
      }, 'Circuit breaker triggered: Maximum absolute retry attempts reached');

      // Send Sentry alert for circuit breaker
      Sentry.captureMessage('Circuit breaker triggered: Excessive retry attempts', {
        level: 'error',
        tags: {
          component: 'retry-logic',
          jobId: originalJobId,
          errorType: error.code || error.name
        },
        extra: {
          jobId: job.id,
          originalJobId,
          attempts: retryInfo.attempts,
          maxAbsolute: RETRY.MAX_ABSOLUTE_ATTEMPTS,
          errorMessage: error.message,
          errorCode: errorInfo.code,
          errorClassification: errorInfo.category
        }
      });

      this.retryQueue.delete(originalJobId);
      this.emit('retry:circuit-breaker', {
        jobId: originalJobId,
        attempts: retryInfo.attempts
      });
      return false;
    }

    // Check against configured maximum
    if (retryInfo.attempts >= retryInfo.maxAttempts) {
      logger.warn({
        jobId: job.id,
        originalJobId,
        attempts: retryInfo.attempts,
        maxConfigured: retryInfo.maxAttempts
      }, 'Maximum configured retry attempts reached');

      // Send Sentry alert for max retries reached
      Sentry.captureMessage('Maximum configured retry attempts reached', {
        level: 'warning',
        tags: {
          component: 'retry-logic',
          jobId: originalJobId,
          errorType: error.code || error.name
        },
        extra: {
          jobId: job.id,
          originalJobId,
          attempts: retryInfo.attempts,
          maxConfigured: retryInfo.maxAttempts,
          errorMessage: error.message,
          errorCode: errorInfo.code,
          errorClassification: errorInfo.category
        }
      });

      this.retryQueue.delete(originalJobId);
      this.emit('retry:max-attempts', {
        jobId: originalJobId,
        attempts: retryInfo.attempts
      });
      return false;
    }

    // Alert when approaching circuit breaker (3+ attempts)
    if (retryInfo.attempts >= 3) {
      Sentry.captureMessage('Warning: Approaching retry limit', {
        level: 'warning',
        tags: {
          component: 'retry-logic',
          jobId: originalJobId,
          errorType: error.code || error.name
        },
        extra: {
          jobId: job.id,
          originalJobId,
          attempts: retryInfo.attempts,
          maxAttempts: retryInfo.maxAttempts,
          maxAbsolute: RETRY.MAX_ABSOLUTE_ATTEMPTS,
          errorMessage: error.message,
          errorCode: errorInfo.code,
          errorClassification: errorInfo.category
        }
      });

      this.emit('retry:warning', {
        jobId: originalJobId,
        attempts: retryInfo.attempts,
        maxAttempts: retryInfo.maxAttempts
      });
    }

    // Calculate exponential backoff delay
    // Use suggested delay from error classifier as base
    const baseRetryDelay = errorInfo.suggestedDelay || retryInfo.delay;
    const delay = baseRetryDelay * Math.pow(2, retryInfo.attempts - 1);

    logger.info({
      jobId: job.id,
      originalJobId,
      attempt: retryInfo.attempts,
      maxAttempts: retryInfo.maxAttempts,
      maxAbsolute: RETRY.MAX_ABSOLUTE_ATTEMPTS,
      delayMs: delay,
      error: error.message,
      errorClassification: errorInfo.category,
      errorReason: errorInfo.reason,
      suggestedDelay: errorInfo.suggestedDelay
    }, 'Scheduling retry with exponential backoff');

    this.emit('retry:scheduled', {
      jobId: originalJobId,
      attempt: retryInfo.attempts,
      delay
    });

    // Schedule retry
    setTimeout(() => {
      logRetry(logger, 'failed job', retryInfo.attempts, retryInfo.maxAttempts, { jobId: job.id, originalJobId });
      // Use original job ID + retry count for new job ID
      this.createJob(`${originalJobId}-retry${retryInfo.attempts}`, job.data);
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
    const reportPaths = await this.reportCoordinator.generateAllReports(result, {
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

    this.emit('scan:completed', {
      jobId: job.id,
      scanType: 'inter-project',
      metrics: result.metrics
    });

    return {
      scanType: 'inter-project',
      repositories: repoPaths.length,
      crossRepoDuplicates: result.metrics.total_cross_repository_groups || 0,
      suggestions: result.metrics.total_suggestions || 0,
      duration: result.scan_metadata?.duration_seconds || 0,
      reportPaths
    };
  }

  /**
   * Run intra-project scan
   */
  async _runIntraProjectScan(job, repositoryConfig) {
    // Validate repository config
    if (!repositoryConfig) {
      const error = new Error('Repository configuration is undefined');
      logger.error({ jobId: job.id }, 'No repository configuration provided for intra-project scan');
      Sentry.captureException(error, {
        tags: {
          error_type: 'validation_error',
          component: 'DuplicateDetectionWorker',
          scan_type: 'intra-project'
        },
        extra: { jobId: job.id }
      });
      throw error;
    }

    if (!repositoryConfig.path) {
      const error = new Error(`Repository configuration missing 'path' property. Config: ${JSON.stringify(repositoryConfig)}`);
      logger.error({
        jobId: job.id,
        repositoryConfig
      }, 'Repository configuration missing path property');
      Sentry.captureException(error, {
        tags: {
          error_type: 'validation_error',
          component: 'DuplicateDetectionWorker',
          scan_type: 'intra-project'
        },
        extra: {
          jobId: job.id,
          repositoryConfig
        }
      });
      throw error;
    }

    const repoPath = repositoryConfig.path;

    logger.info({
      jobId: job.id,
      repository: repoPath
    }, 'Running intra-project scan');

    const result = await this.orchestrator.scanRepository(repoPath);

    // Generate reports
    const reportPaths = await this.reportCoordinator.generateAllReports(result, {
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

    // Create PRs if enabled
    let prResults = null;
    if (this.enablePRCreation && result.suggestions && result.suggestions.length > 0) {
      try {
        logger.info({
          jobId: job.id,
          repository: repositoryConfig.name,
          suggestions: result.suggestions.length
        }, 'Creating PRs for consolidation suggestions');

        prResults = await this.prCreator.createPRsForSuggestions(result, repoPath);

        this.scanMetrics.prsCreated += prResults.prsCreated;

        if (prResults.errors.length > 0) {
          this.scanMetrics.prCreationErrors += prResults.errors.length;
          logger.warn({
            errors: prResults.errors
          }, 'Some PRs failed to create');
        }

        logger.info({
          prsCreated: prResults.prsCreated,
          prUrls: prResults.prUrls,
          errors: prResults.errors.length
        }, 'PR creation completed');

        this.emit('pr:created', {
          jobId: job.id,
          repository: repositoryConfig.name,
          prsCreated: prResults.prsCreated,
          prUrls: prResults.prUrls
        });

      } catch (error) {
        logError(logger, error, 'Failed to create PRs for suggestions');
        this.scanMetrics.prCreationErrors++;
        Sentry.captureException(error, {
          tags: {
            component: 'pr-creation',
            repository: repositoryConfig.name
          }
        });

        this.emit('pr:failed', {
          jobId: job.id,
          repository: repositoryConfig.name,
          error: error.message
        });
      }
    }

    this.emit('scan:completed', {
      jobId: job.id,
      scanType: 'intra-project',
      repository: repositoryConfig.name,
      metrics: result.metrics,
      prResults
    });

    return {
      scanType: 'intra-project',
      repository: repositoryConfig.name,
      duplicates: result.metrics.total_duplicate_groups || 0,
      suggestions: result.metrics.total_suggestions || 0,
      duration: result.scan_metadata?.duration_seconds || 0,
      reportPaths,
      prResults: prResults ? {
        prsCreated: prResults.prsCreated,
        prUrls: prResults.prUrls,
        errors: prResults.errors.length
      } : null
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

    this.emit('metrics:updated', this.scanMetrics);
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
        // Skip config updates for temporary test repositories
        if (repoConfig.name.startsWith('alephauto-test-')) {
          logger.debug({ repository: repoConfig.name }, 'Skipping config update for test repository');
          continue;
        }

        // Update last scanned timestamp
        await this.configLoader.updateLastScanned(repoConfig.name);

        // Add scan history entry
        await this.configLoader.addScanHistory(repoConfig.name, {
          status,
          duration,
          duplicatesFound
        });
      } catch (error) {
        logWarn(logger, error, 'Failed to update repository config', { repository: repoConfig.name });
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

      this.emit('high-impact:detected', {
        count: highImpactDuplicates.length,
        threshold,
        topImpactScore: Math.max(...highImpactDuplicates.map(d => d.impact_score))
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
   * Run nightly scan (called by cron or startup)
   */
  async runNightlyScan() {
    logStart(logger, 'nightly duplicate detection scan');

    const scanConfig = this.configLoader.getScanConfig();

    if (!scanConfig.enabled) {
      logger.info('Automated scanning is disabled');
      this.emit('pipeline:status', {
        status: 'disabled'
      });
      return;
    }

    // Get repositories to scan tonight
    const repositoriesToScan = this.configLoader.getRepositoriesToScanTonight();

    logger.info({
      repositoryCount: repositoriesToScan.length
    }, 'Repositories selected for scanning');

    if (repositoriesToScan.length === 0) {
      logger.info('No repositories to scan tonight');
      this.emit('pipeline:status', {
        status: 'idle',
        message: 'No repositories scheduled for scanning'
      });
      return;
    }

    this.emit('pipeline:status', {
      status: 'scheduling',
      individualScans: repositoriesToScan.length
    });

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

    this.emit('pipeline:status', {
      status: 'scheduled',
      individualScans: repositoriesToScan.length,
      groupScans: groups.length
    });
  }

  /**
   * Get retry metrics
   */
  getRetryMetrics() {
    const retryStats = {
      activeRetries: this.retryQueue.size,
      totalRetryAttempts: 0,
      jobsBeingRetried: [],
      retryDistribution: {
        attempt1: 0,
        attempt2: 0,
        attempt3Plus: 0,
        nearingLimit: 0  // 3+ attempts
      }
    };

    for (const [jobId, retryInfo] of this.retryQueue.entries()) {
      retryStats.totalRetryAttempts += retryInfo.attempts;
      retryStats.jobsBeingRetried.push({
        jobId,
        attempts: retryInfo.attempts,
        maxAttempts: retryInfo.maxAttempts,
        lastAttempt: new Date(retryInfo.lastAttempt).toISOString()
      });

      // Distribution
      if (retryInfo.attempts === 1) {
        retryStats.retryDistribution.attempt1++;
      } else if (retryInfo.attempts === 2) {
        retryStats.retryDistribution.attempt2++;
      } else {
        retryStats.retryDistribution.attempt3Plus++;
      }

      if (retryInfo.attempts >= 3) {
        retryStats.retryDistribution.nearingLimit++;
      }
    }

    return retryStats;
  }

  /**
   * Get scan metrics
   */
  getScanMetrics() {
    return {
      ...this.scanMetrics,
      queueStats: this.getStats(),
      retryMetrics: this.getRetryMetrics()
    };
  }
}
#!/usr/bin/env -S npx tsx

/**
 * Duplicate Detection Pipeline - TypeScript Version
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
 *   tsx duplicate-detection-pipeline.ts                    # Start cron server
 *   RUN_ON_STARTUP=true tsx duplicate-detection-pipeline.ts # Run immediately
 */

import { SidequestServer } from '../core/server.js';
import { RepositoryConfigLoader } from '../pipeline-core/config/repository-config-loader.js';
import { InterProjectScanner } from '../pipeline-core/inter-project-scanner.js';
import { ScanOrchestrator } from '../pipeline-core/scan-orchestrator.ts';
import { ReportCoordinator } from '../pipeline-core/reports/report-coordinator.js';
import { PRCreator } from '../pipeline-core/git/pr-creator.js';
import { createComponentLogger, logStart, logRetry } from '../utils/logger.js';
import { config } from '../core/config.js';
import { TIMEOUTS, RETRY } from '../core/constants.js';
import { isRetryable, getErrorInfo } from '../pipeline-core/errors/error-classifier.js';
// @ts-ignore - no declaration file for node-cron
import * as cron from 'node-cron';
import * as path from 'path';
import * as Sentry from '@sentry/node';

// Type imports
import type { Logger } from 'pino';

/**
 * Job status enum
 */
export enum JobStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

/**
 * Scan type enum
 */
export enum ScanType {
  INTER_PROJECT = 'inter-project',
  INTRA_PROJECT = 'intra-project'
}

/**
 * Interface for job data
 */
export interface JobData {
  scanType: ScanType | string;
  repositories?: RepositoryConfig[];
  groupName?: string | null;
  type?: string;
}

/**
 * Interface for a job
 */
export interface Job {
  id: string;
  status: JobStatus;
  data: JobData;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  error: Error | null;
  result: any;
}

/**
 * Interface for repository configuration
 */
export interface RepositoryConfig {
  name: string;
  path: string;
  enabled?: boolean;
  frequency?: string;
  lastScanned?: string | null;
  priority?: number;
  groups?: string[];
  scanHistory?: ScanHistoryEntry[];
}

/**
 * Interface for scan history entry
 */
export interface ScanHistoryEntry {
  date: string;
  status: 'success' | 'failure';
  duration: number;
  duplicatesFound: number;
}

/**
 * Interface for retry information
 */
export interface RetryInfo {
  attempts: number;
  lastAttempt: number;
  maxAttempts: number;
  delay: number;
}

/**
 * Interface for scan metrics
 */
export interface ScanMetrics {
  totalScans: number;
  successfulScans: number;
  failedScans: number;
  totalDuplicatesFound: number;
  totalSuggestionsGenerated: number;
  highImpactDuplicates: number;
  prsCreated: number;
  prCreationErrors: number;
}

/**
 * Interface for retry metrics
 */
export interface RetryMetrics {
  activeRetries: number;
  totalRetryAttempts: number;
  jobsBeingRetried: Array<{
    jobId: string;
    attempts: number;
    maxAttempts: number;
    lastAttempt: string;
  }>;
  retryDistribution: {
    attempt1: number;
    attempt2: number;
    attempt3Plus: number;
    nearingLimit: number;
  };
}

/**
 * Interface for scan result
 */
export interface ScanResult {
  scan_type: 'single-project' | 'inter-project' | 'intra-project';
  scan_metadata?: {
    duration_seconds: number;
    [key: string]: any;
  };
  metrics: {
    total_duplicate_groups?: number;
    total_cross_repository_groups?: number;
    total_suggestions?: number;
    [key: string]: any;
  };
  duplicate_groups?: DuplicateGroup[];
  cross_repository_duplicates?: DuplicateGroup[];
  suggestions?: Suggestion[];
  [key: string]: any;
}

/**
 * Interface for duplicate group
 */
export interface DuplicateGroup {
  id: string;
  impact_score: number;
  files: Array<{
    path: string;
    repository?: string;
  }>;
  [key: string]: any;
}

/**
 * Interface for suggestion
 */
export interface Suggestion {
  id: string;
  type: string;
  impact: number;
  files: string[];
  [key: string]: any;
}

/**
 * Interface for PR creation result
 */
export interface PRCreationResult {
  prsCreated: number;
  prUrls: string[];
  errors: Array<{
    message: string;
    [key: string]: any;
  }>;
}

/**
 * Interface for worker options
 */
export interface DuplicateDetectionWorkerOptions {
  maxConcurrentScans?: number;
  logDir?: string;
  sentryDsn?: string;
  configPath?: string;
  baseBranch?: string;
  branchPrefix?: string;
  dryRun?: boolean;
  maxSuggestionsPerPR?: number;
  enablePRCreation?: boolean;
}

/**
 * Interface for inter-project scan result
 */
export interface InterProjectScanJobResult {
  scanType: 'inter-project';
  repositories: number;
  crossRepoDuplicates: number;
  suggestions: number;
  duration: number;
}

/**
 * Interface for intra-project scan result
 */
export interface IntraProjectScanJobResult {
  scanType: 'intra-project';
  repository: string;
  duplicates: number;
  suggestions: number;
  duration: number;
  prResults: {
    prsCreated: number;
    prUrls: string[];
    errors: number;
  } | null;
}

/**
 * Type for job result
 */
export type JobResult = InterProjectScanJobResult | IntraProjectScanJobResult;

const logger: Logger = createComponentLogger('DuplicateDetectionPipeline');

// Circuit breaker: Absolute maximum retry attempts to prevent infinite loops
const MAX_ABSOLUTE_RETRIES: number = 5;

/**
 * Duplicate Detection Worker
 *
 * Extends SidequestServer to handle duplicate detection scanning jobs
 */
class DuplicateDetectionWorker extends SidequestServer {
  private configLoader: RepositoryConfigLoader;
  private interProjectScanner: InterProjectScanner;
  private orchestrator: ScanOrchestrator;
  private reportCoordinator: ReportCoordinator;
  private prCreator: PRCreator;
  private scanMetrics: ScanMetrics;
  private enablePRCreation: boolean;
  private retryQueue: Map<string, RetryInfo>;

  constructor(options: DuplicateDetectionWorkerOptions = {}) {
    super({
      maxConcurrent: options.maxConcurrentScans || 3,
      logDir: options.logDir || path.join(process.cwd(), 'logs', 'duplicate-detection'),
      sentryDsn: options.sentryDsn
    });

    this.configLoader = new RepositoryConfigLoader(options.configPath as any);
    this.interProjectScanner = new InterProjectScanner({
      outputDir: path.join(process.cwd(), 'output', 'automated-scans')
    });
    // Let ScanOrchestrator auto-detect Python path based on environment
    // (venv for local dev, system Python for CI/production)
    this.orchestrator = new ScanOrchestrator({});
    this.reportCoordinator = new ReportCoordinator(
      path.join(process.cwd(), 'output', 'reports') as any
    );
    this.prCreator = new PRCreator({
      baseBranch: options.baseBranch || 'main',
      branchPrefix: options.branchPrefix || 'consolidate',
      dryRun: options.dryRun ?? (process.env.PR_DRY_RUN === 'true'),
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

    this.enablePRCreation = options.enablePRCreation ?? (process.env.ENABLE_PR_CREATION === 'true');

    this.retryQueue = new Map<string, RetryInfo>();
  }

  /**
   * Initialize the worker
   */
  async initialize(): Promise<void> {
    try {
      // Load configuration
      await this.configLoader.load();

      // Validate configuration
      this.configLoader.validate();

      const stats = this.configLoader.getStats();
      logger.info({
        ...stats
      }, 'Duplicate detection pipeline initialized');

      // @ts-ignore - emit is inherited from EventEmitter through SidequestServer
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
  async runJobHandler(job: Job): Promise<JobResult> {
    const { scanType, repositories, groupName } = job.data;

    logger.info({
      jobId: job.id,
      scanType,
      repositories: repositories?.length || 0,
      groupName
    }, 'Starting duplicate detection scan job');

    try {
      if (scanType === ScanType.INTER_PROJECT || scanType === 'inter-project') {
        return await this._runInterProjectScan(job, repositories!);
      } else if (scanType === ScanType.INTRA_PROJECT || scanType === 'intra-project') {
        return await this._runIntraProjectScan(job, repositories![0]);
      } else {
        throw new Error(`Unknown scan type: ${scanType}`);
      }
    } catch (error) {
      // Handle retry logic
      const shouldRetry = await this._handleRetry(job, error as Error);

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
   * Extract original job ID by stripping all retry suffixes
   * @param jobId - Job ID (may contain retry suffixes)
   * @returns Original job ID without retry suffixes
   * @private
   */
  private _getOriginalJobId(jobId: string): string {
    // Strip all -retryN suffixes to get the original job ID
    // Example: "scan-intra-project-123-retry1-retry1-retry1" -> "scan-intra-project-123"
    return jobId.replace(/-retry\d+/g, '');
  }

  /**
   * Handle retry logic with exponential backoff
   */
  private async _handleRetry(job: Job, error: Error): Promise<boolean> {
    const scanConfig = this.configLoader.getScanConfig();
    const maxRetries = scanConfig.retryAttempts || 0;
    const baseDelay = scanConfig.retryDelay || RETRY.RATE_LIMIT_DELAY_MS;

    // Get original job ID to track retries correctly
    const originalJobId = this._getOriginalJobId(job.id);

    // Classify error to determine if retry is appropriate
    const errorInfo = getErrorInfo(error) as any;

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

    const retryInfo = this.retryQueue.get(originalJobId)!;
    retryInfo.attempts++;

    // Circuit breaker: Check against absolute maximum
    if (retryInfo.attempts >= MAX_ABSOLUTE_RETRIES) {
      logger.error({
        jobId: job.id,
        originalJobId,
        attempts: retryInfo.attempts,
        maxAbsolute: MAX_ABSOLUTE_RETRIES
      }, 'Circuit breaker triggered: Maximum absolute retry attempts reached');

      // Send Sentry alert for circuit breaker
      Sentry.captureMessage('Circuit breaker triggered: Excessive retry attempts', {
        level: 'error',
        tags: {
          component: 'retry-logic',
          jobId: originalJobId,
          errorType: (error as any).code || error.name
        },
        extra: {
          jobId: job.id,
          originalJobId,
          attempts: retryInfo.attempts,
          maxAbsolute: MAX_ABSOLUTE_RETRIES,
          errorMessage: error.message,
          errorCode: errorInfo.code,
          errorClassification: errorInfo.category
        }
      });

      this.retryQueue.delete(originalJobId);
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
          errorType: (error as any).code || error.name
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
      return false;
    }

    // Alert when approaching circuit breaker (3+ attempts)
    if (retryInfo.attempts >= 3) {
      Sentry.captureMessage('Warning: Approaching retry limit', {
        level: 'warning',
        tags: {
          component: 'retry-logic',
          jobId: originalJobId,
          errorType: (error as any).code || error.name
        },
        extra: {
          jobId: job.id,
          originalJobId,
          attempts: retryInfo.attempts,
          maxAttempts: retryInfo.maxAttempts,
          maxAbsolute: MAX_ABSOLUTE_RETRIES,
          errorMessage: error.message,
          errorCode: errorInfo.code,
          errorClassification: errorInfo.category
        }
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
      maxAbsolute: MAX_ABSOLUTE_RETRIES,
      delayMs: delay,
      error: error.message,
      errorClassification: errorInfo.category,
      errorReason: errorInfo.reason,
      suggestedDelay: errorInfo.suggestedDelay
    }, 'Scheduling retry with exponential backoff');

    // Schedule retry
    setTimeout(() => {
      logRetry(logger, 'failed job', retryInfo.attempts, retryInfo.maxAttempts, { jobId: job.id, originalJobId });
      // Use original job ID + retry count for new job ID
      // @ts-ignore - createJob is inherited from SidequestServer
      this.createJob(`${originalJobId}-retry${retryInfo.attempts}`, job.data);
    }, delay);

    return true;
  }

  /**
   * Run inter-project scan
   */
  private async _runInterProjectScan(job: Job, repositoryConfigs: RepositoryConfig[]): Promise<InterProjectScanJobResult> {
    const repoPaths = repositoryConfigs.map(r => r.path);

    logger.info({
      jobId: job.id,
      repositories: repoPaths.length
    }, 'Running inter-project scan');

    const result = await this.interProjectScanner.scanRepositories(repoPaths) as unknown as ScanResult;

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
  private async _runIntraProjectScan(job: Job, repositoryConfig: RepositoryConfig): Promise<IntraProjectScanJobResult> {
    // Validate repository config
    if (!repositoryConfig) {
      const error = new Error('Repository configuration is undefined');
      logger.error({ jobId: job.id }, 'No repository configuration provided for intra-project scan');
      Sentry.captureException(error, {
        tags: {
          error_type: 'validation_error',
          component: 'DuplicateDetectionPipeline',
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
          component: 'DuplicateDetectionPipeline',
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

    const result = await this.orchestrator.scanRepository(repoPath) as unknown as ScanResult;

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

    // Create PRs if enabled
    let prResults: PRCreationResult | null = null;
    if (this.enablePRCreation && result.suggestions && result.suggestions.length > 0) {
      try {
        logger.info({
          jobId: job.id,
          repository: repositoryConfig.name,
          suggestions: result.suggestions.length
        }, 'Creating PRs for consolidation suggestions');

        prResults = await this.prCreator.createPRsForSuggestions(result, repoPath) as PRCreationResult;

        this.scanMetrics.prsCreated += prResults!.prsCreated;

        if (prResults!.errors.length > 0) {
          this.scanMetrics.prCreationErrors += prResults!.errors.length;
          logger.warn({
            errors: prResults!.errors
          }, 'Some PRs failed to create');
        }

        logger.info({
          prsCreated: prResults!.prsCreated,
          prUrls: prResults!.prUrls,
          errors: prResults!.errors.length
        }, 'PR creation completed');

      } catch (error) {
        logger.error({ error }, 'Failed to create PRs for suggestions');
        this.scanMetrics.prCreationErrors++;
        Sentry.captureException(error, {
          tags: {
            component: 'pr-creation',
            repository: repositoryConfig.name
          }
        });
      }
    }

    return {
      scanType: 'intra-project',
      repository: repositoryConfig.name,
      duplicates: result.metrics.total_duplicate_groups || 0,
      suggestions: result.metrics.total_suggestions || 0,
      duration: result.scan_metadata?.duration_seconds || 0,
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
  private _updateMetrics(scanResult: ScanResult): void {
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
  private async _updateRepositoryConfigs(repositoryConfigs: RepositoryConfig[], scanResult: ScanResult): Promise<void> {
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
  private async _checkForHighImpactDuplicates(scanResult: ScanResult): Promise<void> {
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
  public scheduleScan(scanType: ScanType | string, repositories: RepositoryConfig[], groupName: string | null = null): Job {
    const jobId = `scan-${scanType}-${Date.now()}`;
    const jobData: JobData = {
      scanType,
      repositories,
      groupName,
      type: 'duplicate-detection'
    };

    // @ts-ignore - createJob is inherited from SidequestServer
    return this.createJob(jobId, jobData);
  }

  /**
   * Run nightly scan (called by cron)
   */
  public async runNightlyScan(): Promise<void> {
    logStart(logger, 'nightly duplicate detection scan');

    const scanConfig = this.configLoader.getScanConfig();

    if (!scanConfig.enabled) {
      logger.info('Automated scanning is disabled');
      return;
    }

    // Get repositories to scan tonight
    const repositoriesToScan: RepositoryConfig[] = this.configLoader.getRepositoriesToScanTonight();

    logger.info({
      repositoryCount: repositoriesToScan.length
    }, 'Repositories selected for scanning');

    if (repositoriesToScan.length === 0) {
      logger.info('No repositories to scan tonight');
      return;
    }

    // Scan individual repositories (intra-project)
    for (const repo of repositoriesToScan) {
      this.scheduleScan(ScanType.INTRA_PROJECT, [repo]);
    }

    // Scan repository groups (inter-project)
    const groups = this.configLoader.getEnabledGroups();
    for (const group of groups) {
      const groupRepos: RepositoryConfig[] = this.configLoader.getGroupRepositories(group.name);
      if (groupRepos.length >= 2) {
        this.scheduleScan(ScanType.INTER_PROJECT, groupRepos, group.name);
      }
    }

    logger.info({
      individualScans: repositoriesToScan.length,
      groupScans: groups.length
    }, 'Nightly scan scheduled');
  }

  /**
   * Get retry metrics
   */
  public getRetryMetrics(): RetryMetrics {
    const retryStats: RetryMetrics = {
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

    Array.from(this.retryQueue.entries()).forEach(([jobId, retryInfo]) => {
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
    });

    return retryStats;
  }

  /**
   * Get scan metrics
   */
  public getScanMetrics(): ScanMetrics & { queueStats: any; retryMetrics: RetryMetrics } {
    return {
      ...this.scanMetrics,
      // @ts-ignore - getStats is inherited from SidequestServer
      queueStats: this.getStats(),
      retryMetrics: this.getRetryMetrics()
    };
  }
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  const cronSchedule = (config as any).duplicateScanCronSchedule || process.env.DUPLICATE_SCAN_CRON_SCHEDULE || '0 2 * * *';
  const runOnStartup = process.env.RUN_ON_STARTUP === 'true';

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     DUPLICATE DETECTION AUTOMATED PIPELINE              ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  try {
    // Initialize worker
    const worker = new DuplicateDetectionWorker({
      maxConcurrentScans: (config as any).maxConcurrentDuplicateScans || 3
    });

    await worker.initialize();

    console.log('✅ Duplicate detection pipeline initialized\n');

    // @ts-ignore - configLoader is private but needed for initialization log
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

      // Notify PM2 that process is ready (fork mode)
      if (process.send) {
        process.send('ready');
        logger.info('Sent ready signal to PM2');
      }

      // Keep-alive: prevent process from exiting
      // The cron scheduler keeps the event loop active, but we add this as a safeguard
      setInterval(() => {
        logger.debug('Worker keep-alive heartbeat');
      }, TIMEOUTS.FIVE_MINUTES_MS);
    } else {
      console.log('▶️  Running scan immediately (RUN_ON_STARTUP=true)\n');
      await worker.runNightlyScan();

      console.log('\n✅ Startup scan completed');
      const metrics = worker.getScanMetrics();
      console.log('\n📊 Scan Metrics:');
      console.log(`   Total scans: ${metrics.totalScans}`);
      console.log(`   Duplicates found: ${metrics.totalDuplicatesFound}`);
      console.log(`   Suggestions generated: ${metrics.totalSuggestionsGenerated}`);
      console.log(`   High-impact duplicates: ${metrics.highImpactDuplicates}`);

      // @ts-ignore - enablePRCreation is private but needed for metrics display
      if (worker.enablePRCreation) {
        console.log('\n🔀 PR Creation:');
        console.log(`   PRs created: ${metrics.prsCreated}`);
        console.log(`   PR creation errors: ${metrics.prCreationErrors}`);
      }

      console.log('');
      process.exit(0);
    }

  } catch (error) {
    console.error('\n❌ Error:', (error as Error).message);
    logger.error({ error }, 'Pipeline initialization failed');
    Sentry.captureException(error);
    process.exit(1);
  }
}

// Run the pipeline
// Check if running directly (not imported as module)
// Also check for PM2 execution (pm_id is set by PM2)
// @ts-ignore - import.meta not available in ES2022 target
const isDirectExecution = typeof import.meta !== 'undefined' && import.meta.url === `file://${process.argv[1]}` || process.env.pm_id !== undefined;

if (isDirectExecution) {
  // @ts-ignore - top-level await needs ES2022 module
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

// Re-export the main class for external usage
export { DuplicateDetectionWorker };
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

import { SidequestServer, type Job } from '../core/server.ts';
import { RepositoryConfigLoader, type RepositoryConfig } from '../pipeline-core/config/repository-config-loader.ts';
import { InterProjectScanner } from '../pipeline-core/inter-project-scanner.ts';
import { ScanOrchestrator } from '../pipeline-core/scan-orchestrator.ts';
import { ReportCoordinator } from '../pipeline-core/reports/report-coordinator.ts';
import { PRCreator, type PRCreationResults } from '../pipeline-core/git/pr-creator.ts';
import { createComponentLogger, logError, logWarn, logStart } from '../utils/logger.ts';
import path from 'path';
import * as Sentry from '@sentry/node';
import type { RetryMetrics, WorkerScanMetrics as ScanMetrics, DuplicateDetectionWorkerOptions } from '../pipeline-core/types/duplicate-detection-types.ts';
import { config } from '../core/config.ts';
import { CONCURRENCY, LIMITS, MARKDOWN_REPORT, RETRY, WORKER_EVENTS } from '../core/constants.ts';

const logger = createComponentLogger('DuplicateDetectionWorker');

// Type definitions


interface ScanJobData {
  scanType: 'inter-project' | 'intra-project';
  repositories: RepositoryConfig[];
  groupName: string | null;
  type?: string;
}


interface DuplicateEntry {
  impact_score: number;
  [key: string]: unknown;
}

interface ScanResultMetrics {
  total_cross_repository_groups?: number;
  total_suggestions?: number;
  total_duplicate_groups?: number;
  [key: string]: unknown;
}

interface ScanMetadata {
  duration_seconds?: number;
  [key: string]: unknown;
}

interface ScanResult {
  scan_type?: string;
  metrics: ScanResultMetrics;
  scan_metadata?: ScanMetadata;
  cross_repository_duplicates?: DuplicateEntry[];
  duplicate_groups?: DuplicateEntry[];
  suggestions?: unknown[];
  [key: string]: unknown;
}

interface InterProjectScanResult {
  scanType: string;
  repositories: number;
  crossRepoDuplicates: number;
  suggestions: number;
  duration: number;
  reportPaths: unknown;
}

interface IntraProjectScanResult {
  scanType: string;
  repository: string;
  duplicates: number;
  suggestions: number;
  duration: number;
  reportPaths: unknown;
  prResults: {
    prsCreated: number;
    prUrls: string[];
    errors: number;
  } | null;
}



/**
 * DuplicateDetectionWorker
 *
 * Handles duplicate detection scanning jobs with retry logic,
 * PR creation, and comprehensive reporting.
 */
export class DuplicateDetectionWorker extends SidequestServer {
  readonly configLoader: RepositoryConfigLoader;
  readonly enablePRCreation: boolean;
  private interProjectScanner: InterProjectScanner;
  private orchestrator: ScanOrchestrator;
  private reportCoordinator: ReportCoordinator;
  private prCreator: PRCreator;
  private scanMetrics: ScanMetrics;
  private lastScanJobTimestamp: number;
  private scanJobSequence: number;

  /**
   * constructor.
   */
  constructor(options: DuplicateDetectionWorkerOptions = {}) {
    super({
      ...options,
      jobType: 'duplicate-detection',
      maxConcurrent: options.maxConcurrentScans ?? CONCURRENCY.DEFAULT_PIPELINE_CONCURRENCY,
      logDir: path.join(process.cwd(), 'logs', 'duplicate-detection'),
    });

    this.configLoader = new RepositoryConfigLoader(options.configPath);
    this.interProjectScanner = new InterProjectScanner({
      orchestrator: {
        autoGenerateReports: false
      },
      outputDir: path.join(process.cwd(), 'output', 'automated-scans')
    });
    // Let ScanOrchestrator auto-detect Python path based on environment
    // (venv for local dev, system Python for CI/production)
    this.orchestrator = new ScanOrchestrator({
      autoGenerateReports: false
    });
    this.reportCoordinator = new ReportCoordinator(
      path.join(process.cwd(), 'output', 'reports')
    );
    this.prCreator = new PRCreator({
      baseBranch: options.baseBranch ?? 'main',
      branchPrefix: options.branchPrefix ?? 'consolidate',
      dryRun: options.dryRun ?? config.prDryRun,
      maxSuggestionsPerPR: options.maxSuggestionsPerPR ?? LIMITS.DEFAULT_MAX_SUGGESTIONS_PER_PR
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
    this.lastScanJobTimestamp = 0;
    this.scanJobSequence = 0;
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
      const scanConfig = this.configLoader.getScanConfig();
      if (typeof scanConfig.retryAttempts === 'number' && scanConfig.retryAttempts >= 0) {
        // SidequestServer owns retry behavior; sync max retries from scan config.
        this.maxRetries = scanConfig.retryAttempts;
      }
      if (typeof scanConfig.retryDelay === 'number' && scanConfig.retryDelay > 0) {
        this.retryDelayMs = scanConfig.retryDelay;
      }
      logger.info({
        ...stats,
        maxRetries: this.maxRetries
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
  async runJobHandler(job: Job): Promise<InterProjectScanResult | IntraProjectScanResult> {
    const { scanType, repositories, groupName } = job.data as unknown as ScanJobData;

    logStart(logger, 'duplicate detection scan job', {
      jobId: job.id,
      scanType,
      repositories: repositories?.length ?? 0,
      groupName
    });

    this.emit('pipeline:status', {
      status: 'scanning',
      jobId: job.id,
      scanType,
      repositories: repositories?.length ?? 0
    });

    try {
      let result: InterProjectScanResult | IntraProjectScanResult;
      if (scanType === 'inter-project') {
        result = await this._runInterProjectScan(job, repositories);
      } else if (scanType === 'intra-project') {
        result = await this._runIntraProjectScan(job, repositories[0]);
      } else {
        throw new Error(`Unknown scan type: ${scanType}`);
      }

      this.scanMetrics.totalScans++;
      this.scanMetrics.successfulScans++;
      this.emit(WORKER_EVENTS.METRICS_UPDATED, this.scanMetrics);
      return result;
    } catch (error) {
      this.scanMetrics.totalScans++;
      this.scanMetrics.failedScans++;
      this.emit(WORKER_EVENTS.METRICS_UPDATED, this.scanMetrics);

      // Retry authority lives in SidequestServer; rethrow and let the base queue handle retries.
      logError(logger, error, 'Duplicate detection job failed', { jobId: job.id });
      this.emit('pipeline:status', {
        status: 'failed',
        jobId: job.id,
        error: (error as Error).message
      });
      throw error;
    }
  }

  /**
   * Run inter-project scan
   */
  public async _runInterProjectScan(job: Job, repositoryConfigs: RepositoryConfig[]): Promise<InterProjectScanResult> {
    const repoPaths = repositoryConfigs.map(r => r.path);

    logger.info({
      jobId: job.id,
      repositories: repoPaths.length
    }, 'Running inter-project scan');

    const result = await this.interProjectScanner.scanRepositories(repoPaths, {
      generateReports: false
    }) as unknown as ScanResult;

    // Generate reports
    const reportPaths = await this.reportCoordinator.generateAllReports(result as never, {
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
      crossRepoDuplicates: result.metrics.total_cross_repository_groups ?? 0,
      suggestions: result.metrics.total_suggestions ?? 0,
      duration: result.scan_metadata?.duration_seconds ?? 0,
      reportPaths
    };
  }

  /**
   * Run intra-project scan
   */
  public async _runIntraProjectScan(job: Job, repositoryConfig: RepositoryConfig): Promise<IntraProjectScanResult> {
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

    const result = await this.orchestrator.scanRepository(repoPath, {
      generateReports: false
    }) as unknown as ScanResult;

    // Generate reports
    const reportPaths = await this.reportCoordinator.generateAllReports(result as never, {
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
    let prResults: PRCreationResults | null = null;
    if (this.enablePRCreation && result.suggestions && result.suggestions.length > 0) {
      try {
        logger.info({
          jobId: job.id,
          repository: repositoryConfig.name,
          suggestions: result.suggestions.length
        }, 'Creating PRs for consolidation suggestions');

        prResults = await this.prCreator.createPRsForSuggestions(result as never, repoPath);

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
          error: (error as Error).message
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
      duplicates: result.metrics.total_duplicate_groups ?? 0,
      suggestions: result.metrics.total_suggestions ?? 0,
      duration: result.scan_metadata?.duration_seconds ?? 0,
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
  public _updateMetrics(scanResult: ScanResult): void {
    if (scanResult.scan_type === 'inter-project') {
      this.scanMetrics.totalDuplicatesFound += scanResult.metrics.total_cross_repository_groups ?? 0;
      this.scanMetrics.totalSuggestionsGenerated += scanResult.metrics.total_suggestions ?? 0;

      // Count high-impact duplicates
      const highImpactDuplicates = (scanResult.cross_repository_duplicates ?? [])
        .filter(dup => dup.impact_score >= MARKDOWN_REPORT.HIGH_SCORE_MIN);
      this.scanMetrics.highImpactDuplicates += highImpactDuplicates.length;
    } else {
      this.scanMetrics.totalDuplicatesFound += scanResult.metrics.total_duplicate_groups ?? 0;
      this.scanMetrics.totalSuggestionsGenerated += scanResult.metrics.total_suggestions ?? 0;

      // Count high-impact duplicates
      const highImpactDuplicates = (scanResult.duplicate_groups ?? [])
        .filter(dup => dup.impact_score >= MARKDOWN_REPORT.HIGH_SCORE_MIN);
      this.scanMetrics.highImpactDuplicates += highImpactDuplicates.length;
    }
  }

  /**
   * Update repository configurations with scan results
   */
  public async _updateRepositoryConfigs(repositoryConfigs: RepositoryConfig[], scanResult: ScanResult): Promise<void> {
    const status = scanResult.scan_metadata ? 'success' : 'failure';
    const duration = scanResult.scan_metadata?.duration_seconds ?? 0;
    const duplicatesFound = scanResult.scan_type === 'inter-project'
      ? scanResult.metrics.total_cross_repository_groups ?? 0
      : scanResult.metrics.total_duplicate_groups ?? 0;

    for (const repoConfig of repositoryConfigs) {
      try {
        // Skip config updates for temporary test repositories
        if (repoConfig.name.startsWith('alephauto-test-')) {
          logger.debug({ repository: repoConfig.name }, 'Skipping config update for test repository');
          continue;
        }

        await this.configLoader.recordScanResult(repoConfig.name, {
          status,
          duration,
          duplicatesFound
        });
      } catch (error) {
        logWarn(logger, error as Error | null, 'Failed to update repository config', { repository: repoConfig.name });
      }
    }
  }

  /**
   * Check for high-impact duplicates and send notifications
   */
  public async _checkForHighImpactDuplicates(scanResult: ScanResult): Promise<void> {
    const notificationSettings = this.configLoader.getNotificationSettings();

    if (!notificationSettings.enabled || !notificationSettings.onHighImpactDuplicates) {
      return;
    }

    const threshold = notificationSettings.highImpactThreshold ?? MARKDOWN_REPORT.HIGH_SCORE_MIN;
    const duplicates: DuplicateEntry[] = scanResult.scan_type === 'inter-project'
      ? scanResult.cross_repository_duplicates ?? []
      : scanResult.duplicate_groups ?? [];

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
          scanType: scanResult.scan_type ?? 'unknown'
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
  scheduleScan(scanType: string, repositories: RepositoryConfig[], groupName: string | null = null): Job {
    const jobId = this.createScanJobId(scanType);
    const jobData = {
      scanType,
      repositories,
      groupName,
      type: 'duplicate-detection'
    };

    return this.createJob(jobId, jobData);
  }

  private createScanJobId(scanType: string): string {
    const timestamp = Date.now();
    if (timestamp === this.lastScanJobTimestamp) {
      this.scanJobSequence += 1;
    } else {
      this.lastScanJobTimestamp = timestamp;
      this.scanJobSequence = 0;
    }

    return this.scanJobSequence === 0
      ? `scan-${scanType}-${timestamp}`
      : `scan-${scanType}-${timestamp}-${this.scanJobSequence}`;
  }

  /**
   * Run nightly scan (called by cron or startup)
   */
  async runNightlyScan(): Promise<void> {
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
    let scheduledGroupScans = 0;
    for (const group of groups) {
      const groupRepos = this.configLoader.getGroupRepositories(group.name);
      if (groupRepos.length >= 2) {
        this.scheduleScan('inter-project', groupRepos, group.name);
        scheduledGroupScans++;
      }
    }

    logger.info({
      individualScans: repositoriesToScan.length,
      groupScans: scheduledGroupScans
    }, 'Nightly scan scheduled');

    this.emit('pipeline:status', {
      status: 'scheduled',
      individualScans: repositoriesToScan.length,
      groupScans: scheduledGroupScans
    });
  }

  /**
   * Get retry metrics
   */
  getRetryMetrics(): RetryMetrics {
    const retryStats: RetryMetrics = {
      activeRetries: 0,
      totalRetryAttempts: 0,
      jobsBeingRetried: [],
      retryDistribution: {
        attempt1: 0,
        attempt2: 0,
        attempt3Plus: 0,
        nearingLimit: 0  // 3+ attempts
      }
    };

    for (const [jobId, job] of this.jobs.entries()) {
      const attempts = job.retryCount ?? 0;
      if (attempts <= 0) continue;

      retryStats.totalRetryAttempts += attempts;
      if (job.retryPending) {
        retryStats.activeRetries++;
        retryStats.jobsBeingRetried.push({
          jobId,
          attempts,
          maxAttempts: this.maxRetries,
          lastAttempt: job.startedAt?.toISOString() ?? job.createdAt.toISOString()
        });
      }

      if (attempts === 1) {
        retryStats.retryDistribution.attempt1++;
      } else if (attempts === 2) {
        retryStats.retryDistribution.attempt2++;
      } else {
        retryStats.retryDistribution.attempt3Plus++;
      }
      if (attempts >= RETRY.NEARING_LIMIT_ATTEMPT_THRESHOLD) {
        retryStats.retryDistribution.nearingLimit++;
      }
    }

    return retryStats;
  }

  /**
   * Get scan metrics
   */
  getScanMetrics(): ScanMetrics & { queueStats: unknown; retryMetrics: RetryMetrics } {
    return {
      ...this.scanMetrics,
      queueStats: this.getStats(),
      retryMetrics: this.getRetryMetrics()
    };
  }
}

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
import { MigrationTransformer } from '../pipeline-core/git/migration-transformer.ts';
import { createComponentLogger, logError, logWarn, logStart } from '../utils/logger.ts';
import path from 'path';
import fs from 'fs/promises';
import * as Sentry from '@sentry/node';
import type { RetryMetrics, WorkerScanMetrics as ScanMetrics, DuplicateDetectionWorkerOptions } from '../pipeline-core/types/duplicate-detection-types.ts';
import type { MigrationStep } from '../pipeline-core/types/migration-types.ts';
import { config } from '../core/config.ts';
import { CONCURRENCY, MARKDOWN_REPORT, RETRY, WORKER_EVENTS } from '../core/constants.ts';

const logger = createComponentLogger('DuplicateDetectionWorker');
const STRATEGY_RATIONALE_PREVIEW_CHARS = 80;

// Type definitions

interface Suggestion {
  suggestion_id: string;
  automated_refactor_possible: boolean;
  impact_score: number;
  target_location?: string;
  target_name?: string;
  proposed_implementation?: string;
  strategy?: string;
  strategy_rationale: string;
  complexity?: string;
  migration_risk?: string;
  usage_example?: string;
  migration_steps: MigrationStep[];
}

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
  suggestions?: Suggestion[];
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
  suggestionsApplied?: number;
  automatedSuggestions?: Suggestion[];
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
  private migrationTransformer: MigrationTransformer;
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
      gitWorkflowEnabled: options.enablePRCreation ?? config.enablePRCreation,
      gitBranchPrefix: options.branchPrefix ?? 'consolidate',
      gitBaseBranch: options.baseBranch ?? config.gitBaseBranch,
      gitDryRun: options.dryRun ?? config.gitDryRun,
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
    this.migrationTransformer = new MigrationTransformer({
      dryRun: this.gitDryRun
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

    this.enablePRCreation = this.gitWorkflowEnabled;
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

    // Apply automatable suggestions to disk; centralized git workflow will commit/push/PR
    let suggestionsApplied = 0;
    let automatedSuggestions: Suggestion[] = [];
    if (this.gitWorkflowEnabled && result.suggestions && result.suggestions.length > 0) {
      const automatable = result.suggestions.filter(
        s => s.automated_refactor_possible && s.impact_score >= MARKDOWN_REPORT.MEDIUM_SCORE_MIN
      );

      if (automatable.length > 0) {
        logger.info({
          jobId: job.id,
          repository: repositoryConfig.name,
          automatable: automatable.length
        }, 'Applying consolidation suggestions to working directory');

        const filesWritten = await this._applySuggestions(automatable, repoPath);
        suggestionsApplied = automatable.length;
        automatedSuggestions = automatable;
        logger.info({ filesWritten: filesWritten.length, suggestionsApplied }, 'Applied consolidation suggestions; centralized workflow will commit and push');
        this.scanMetrics.prsCreated++;  // Will be created by centralized workflow
      }
    }

    this.emit('scan:completed', {
      jobId: job.id,
      scanType: 'intra-project',
      repository: repositoryConfig.name,
      metrics: result.metrics
    });

    return {
      scanType: 'intra-project',
      repository: repositoryConfig.name,
      duplicates: result.metrics.total_duplicate_groups ?? 0,
      suggestions: result.metrics.total_suggestions ?? 0,
      duration: result.scan_metadata?.duration_seconds ?? 0,
      reportPaths,
      suggestionsApplied,
      automatedSuggestions
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
    const jobData: Record<string, unknown> = {
      scanType,
      repositories,
      groupName,
      type: 'duplicate-detection'
    };

    // Centralized git workflow requires a single repositoryPath on job.data.
    // Only intra-project scans operate on a single repo, so only set it then.
    if (scanType === 'intra-project' && repositories[0]?.path) {
      jobData.repositoryPath = repositories[0].path;
    }

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
   * Apply automatable suggestions to the working directory (no git ops).
   * Called before the centralized git workflow commits and pushes changes.
   */
  private async _applySuggestions(suggestions: Suggestion[], repositoryPath: string): Promise<string[]> {
    const filesModified: string[] = [];

    for (const suggestion of suggestions) {
      try {
        if (suggestion.target_location && suggestion.proposed_implementation) {
          const resolvedRepo = path.resolve(repositoryPath);
          const targetPath = path.resolve(repositoryPath, suggestion.target_location);
          if (!targetPath.startsWith(resolvedRepo + path.sep) && targetPath !== resolvedRepo) {
            logger.warn({ suggestionId: suggestion.suggestion_id, target_location: suggestion.target_location }, 'Rejecting out-of-bounds target_location');
          } else {
            await fs.mkdir(path.dirname(targetPath), { recursive: true });
            await fs.writeFile(targetPath, suggestion.proposed_implementation, 'utf-8');
            filesModified.push(suggestion.target_location);
            logger.info({ file: suggestion.target_location, suggestionId: suggestion.suggestion_id }, 'Created consolidated file');
          }
        }

        if (suggestion.migration_steps && suggestion.migration_steps.length > 0) {
          try {
            const migrationResult = await this.migrationTransformer.applyMigrationSteps(suggestion, repositoryPath);

            for (const file of migrationResult.filesModified) {
              if (!filesModified.includes(file)) {
                filesModified.push(file);
              }
            }

            if (migrationResult.errors.length > 0) {
              logger.warn({ errors: migrationResult.errors }, 'Some migration transformations failed');
            }
          } catch (migrationError) {
            logError(logger, migrationError, 'Failed to apply migration steps', { suggestionId: suggestion.suggestion_id });
            Sentry.captureException(migrationError, {
              tags: { component: 'duplicate-detection', operation: 'apply-migration-steps' },
              extra: { suggestionId: suggestion.suggestion_id, repositoryPath }
            });
          }
        }
      } catch (error) {
        logError(logger, error, 'Failed to apply suggestion', { suggestionId: suggestion.suggestion_id });
      }
    }

    return filesModified;
  }

  /**
   * Override: consolidation-specific commit message
   */
  public override async _generateCommitMessage(_job: Job): Promise<{ title: string; body: string }> {
    const result = _job.result as IntraProjectScanResult | undefined;
    const count = result?.suggestionsApplied ?? 0;
    const suggestions = result?.automatedSuggestions ?? [];

    return {
      title: `refactor: consolidate ${count} duplicate code pattern${count !== 1 ? 's' : ''}`,
      body: [
        `Consolidates ${count} identified duplicate code pattern${count !== 1 ? 's' : ''}.`,
        '',
        ...suggestions.map((s, i) => {
          const rationale = s.strategy_rationale;
          const preview = rationale.length > STRATEGY_RATIONALE_PREVIEW_CHARS
            ? rationale.substring(0, STRATEGY_RATIONALE_PREVIEW_CHARS) + '...'
            : rationale;
          return `${i + 1}. ${s.target_name ?? s.suggestion_id}: ${preview}`;
        }),
        '',
        'Co-Authored-By: Claude <noreply@anthropic.com>'
      ].join('\n')
    };
  }

  /**
   * Override: consolidation-specific PR context with impact scores and migration notes
   */
  public override async _generatePRContext(
    job: Job,
    commitMessage?: { title: string; body: string }
  ): Promise<{ branchName: string; title: string; body: string; labels: string[] }> {
    const msg = commitMessage ?? await this._generateCommitMessage(job);
    const result = job.result as IntraProjectScanResult | undefined;
    const suggestions = result?.automatedSuggestions ?? [];
    const filesModified = job.git.changedFiles ?? [];
    const count = suggestions.length;

    const consolidationsSection = suggestions.map((s, i) => [
      `### ${i + 1}. ${s.target_name ?? s.suggestion_id}`,
      '',
      `**Strategy:** ${s.strategy ?? 'N/A'}`,
      `**Impact Score:** ${s.impact_score}/100`,
      `**Complexity:** ${s.complexity ?? 'N/A'}`,
      `**Risk:** ${s.migration_risk ?? 'N/A'}`,
      '',
      `**Rationale:** ${s.strategy_rationale}`,
      '',
      `**Target Location:** \`${s.target_location ?? 'N/A'}\``,
      '',
      s.migration_steps.length > 0 ? '**Migration Steps:**' : '',
      ...s.migration_steps.map(step => `${step.step_number}. ${step.description}`),
      ''
    ].join('\n')).join('\n');

    const usageSection = suggestions
      .filter(s => s.usage_example)
      .map(s => [
        `### ${s.target_name ?? s.suggestion_id} Usage`,
        '',
        '```javascript',
        s.usage_example,
        '```',
        ''
      ].join('\n'))
      .join('\n');

    const body = [
      '## Summary',
      '',
      `This PR consolidates ${count} identified duplicate code pattern${count !== 1 ? 's' : ''} to improve code maintainability and reduce duplication.`,
      '',
      '## Consolidations',
      '',
      consolidationsSection,
      '## Files Modified',
      '',
      ...filesModified.map(f => `- \`${f}\``),
      '',
      '## Testing',
      '',
      '- [ ] Unit tests pass',
      '- [ ] Integration tests pass',
      '- [ ] Manual testing completed',
      '- [ ] Code review completed',
      '',
      '## Migration Notes',
      '',
      'This PR creates consolidated utility files. Migration of existing code to use these utilities should be done in follow-up PRs.',
      '',
      usageSection,
      '---',
      '',
      'Generated with [Claude Code](https://claude.com/claude-code)'
    ].join('\n');

    return {
      branchName: job.git.branchName ?? '',
      title: msg.title,
      body,
      labels: ['automated', 'refactoring', 'duplicate-detection']
    };
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

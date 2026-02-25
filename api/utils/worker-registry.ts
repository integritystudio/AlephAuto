/**
 * Worker Registry
 *
 * Centralized registry for mapping pipeline IDs to worker instances.
 * Lazy initialization ensures workers are only created when needed.
 */

import type { SidequestServer } from '#sidequest/core/server.ts';
import { DuplicateDetectionWorker } from '#sidequest/workers/duplicate-detection-worker.ts';
import { SchemaEnhancementWorker } from '#sidequest/workers/schema-enhancement-worker.ts';
import { GitActivityWorker } from '#sidequest/workers/git-activity-worker.ts';
import { GitignoreWorker } from '#sidequest/workers/gitignore-worker.ts';
import { RepomixWorker } from '#sidequest/workers/repomix-worker.ts';
import { ClaudeHealthWorker } from '#sidequest/workers/claude-health-worker.ts';
import { RepoCleanupWorker } from '#sidequest/workers/repo-cleanup-worker.ts';
import { BugfixAuditWorker } from '#sidequest/workers/bugfix-audit-worker.ts';
import { DashboardPopulateWorker } from '#sidequest/workers/dashboard-populate-worker.ts';
import { PluginManagerWorker } from '#sidequest/utils/plugin-manager.ts';
import { config } from '#sidequest/core/config.ts';
import { createComponentLogger, logError } from '#sidequest/utils/logger.ts';
import { jobRepository } from '#sidequest/core/job-repository.ts';
import { CONCURRENCY, TIMEOUTS, TIME, WORKER_COOLDOWN } from '#sidequest/core/constants.ts';
import type { ActivityFeedManager } from '../activity-feed.ts';

/**
 * Worker initialization timeout
 * Prevents indefinite hangs if a worker's constructor or initialize() method blocks
 */
const WORKER_INIT_TIMEOUT_MS = TIMEOUTS.WORKER_INIT_MS;

const logger = createComponentLogger('WorkerRegistry');

interface InitFailureInfo {
  count: number;
  lastAttempt: number;
  cooldownAttempts?: number;
}

/**
 * Track initialization failures for circuit breaker pattern
 */
const initFailures = new Map<string, InitFailureInfo>();

type WorkerConstructor = new (options: Record<string, unknown>) => SidequestServer;

interface PipelineConfig {
  WorkerClass: WorkerConstructor | null;
  getOptions: () => Record<string, unknown>;
  disabled?: boolean;
  disabledReason?: string;
}

/**
 * Pipeline configuration - single source of truth for all pipeline definitions
 */
const PIPELINE_CONFIGS: Record<string, PipelineConfig> = {
  'duplicate-detection': {
    WorkerClass: DuplicateDetectionWorker as unknown as WorkerConstructor,
    getOptions: () => ({
      maxConcurrentScans: 3,
      logDir: config.logDir,
      sentryDsn: config.sentryDsn
    })
  },
  'schema-enhancement': {
    WorkerClass: SchemaEnhancementWorker as unknown as WorkerConstructor,
    getOptions: () => ({
      maxConcurrent: config.maxConcurrent || 2,
      logDir: config.logDir,
      sentryDsn: config.sentryDsn,
      gitWorkflowEnabled: config.enableGitWorkflow,
      gitBranchPrefix: 'docs',
      gitBaseBranch: config.gitBaseBranch,
      gitDryRun: config.gitDryRun
    })
  },
  'git-activity': {
    WorkerClass: GitActivityWorker as unknown as WorkerConstructor,
    getOptions: () => ({
      maxConcurrent: config.maxConcurrent || 3,
      logDir: config.logDir,
      sentryDsn: config.sentryDsn
    })
  },
  'gitignore-manager': {
    WorkerClass: GitignoreWorker as unknown as WorkerConstructor,
    getOptions: () => ({
      maxConcurrent: config.maxConcurrent || 3,
      logDir: config.logDir,
      sentryDsn: config.sentryDsn
    })
  },
  'repomix': {
    WorkerClass: RepomixWorker as unknown as WorkerConstructor,
    getOptions: () => ({
      maxConcurrent: config.maxConcurrent || 3,
      logDir: config.logDir,
      sentryDsn: config.sentryDsn
    })
  },
  'claude-health': {
    WorkerClass: ClaudeHealthWorker as unknown as WorkerConstructor,
    getOptions: () => ({
      maxConcurrent: config.maxConcurrent || 3,
      logDir: config.logDir,
      sentryDsn: config.sentryDsn
    })
  },
  'repo-cleanup': {
    WorkerClass: RepoCleanupWorker as unknown as WorkerConstructor,
    getOptions: () => ({
      maxConcurrent: config.maxConcurrent || 3,
      logDir: config.logDir,
      sentryDsn: config.sentryDsn
    })
  },
  'bugfix-audit': {
    WorkerClass: BugfixAuditWorker as unknown as WorkerConstructor,
    getOptions: () => ({
      maxConcurrent: config.maxConcurrent || 3,
      logDir: config.logDir,
      sentryDsn: config.sentryDsn,
      gitBaseBranch: config.gitBaseBranch,
      gitDryRun: config.gitDryRun,
    })
  },
  'dashboard-populate': {
    WorkerClass: DashboardPopulateWorker as unknown as WorkerConstructor,
    getOptions: () => ({
      maxConcurrent: 1,
      logDir: config.logDir,
      sentryDsn: config.sentryDsn
    })
  },
  'plugin-manager': {
    WorkerClass: PluginManagerWorker as unknown as WorkerConstructor,
    getOptions: () => ({
      maxConcurrent: 1,
      logDir: config.logDir,
      sentryDsn: config.sentryDsn
    })
  },
  'test-refactor': {
    WorkerClass: null,
    getOptions: () => ({}),
    disabled: true,
    disabledReason: 'TypeScript compilation required'
  }
};

interface WorkerStats {
  total: number;
  queued: number;
  active: number;
  completed: number;
  failed: number;
  byPipeline: Record<string, Record<string, number>>;
}

/**
 * Worker registry - lazy initialization pattern
 * Workers are created on first access to avoid unnecessary resource consumption
 */
class WorkerRegistry {
  _workers: Map<string, SidequestServer>;
  _initializing: Map<string, Promise<SidequestServer>>;
  _activityFeed: ActivityFeedManager | null;
  _activeInits: number;
  _maxConcurrentInits: number;
  _initQueue: Array<(value?: unknown) => void>;

  constructor() {
    this._workers = new Map();
    this._initializing = new Map();
    this._activityFeed = null;
    this._activeInits = 0;
    this._maxConcurrentInits = CONCURRENCY.MAX_WORKER_INITS;
    this._initQueue = [];
  }

  /**
   * Set the activity feed manager to connect workers for real-time updates
   */
  setActivityFeed(activityFeed: ActivityFeedManager): void {
    this._activityFeed = activityFeed;

    // Connect any existing workers
    for (const worker of this._workers.values()) {
      activityFeed.listenToWorker(worker);
    }

    logger.info({ workerCount: this._workers.size }, 'Activity feed connected to worker registry');
  }

  /**
   * Get worker instance for a pipeline ID
   */
  async getWorker(pipelineId: string): Promise<SidequestServer> {
    // Fast path: already initialized
    if (this._workers.has(pipelineId)) {
      return this._workers.get(pipelineId)!;
    }

    // Circuit breaker: check for repeated failures with exponential backoff
    const failureInfo = initFailures.get(pipelineId);
    if (failureInfo && failureInfo.count >= 3) {
      // Exponential backoff: 1min, 2min, 4min, 8min (capped at 10min)
      const cooldownAttempts = failureInfo.cooldownAttempts || 0;
      const cooldownMs = Math.min(WORKER_COOLDOWN.BASE_MS * Math.pow(2, cooldownAttempts), WORKER_COOLDOWN.MAX_MS);
      const timeSinceLastAttempt = Date.now() - failureInfo.lastAttempt;

      if (timeSinceLastAttempt < cooldownMs) {
        throw new Error(`${pipelineId} worker initialization is in cooldown after ${failureInfo.count} failures. Retry in ${Math.ceil((cooldownMs - timeSinceLastAttempt) / TIME.SECOND)}s`);
      }

      // Half-open state: allow ONE attempt, don't fully reset
      logger.info({
        pipelineId,
        previousFailures: failureInfo.count,
        cooldownAttempts: cooldownAttempts + 1
      }, 'Circuit breaker entering half-open state');

      initFailures.set(pipelineId, {
        count: 2, // Set to 2 so next failure triggers cooldown again
        lastAttempt: Date.now(),
        cooldownAttempts: cooldownAttempts + 1
      });
    }

    // Fast-fail for disabled pipelines before creating initPromise
    const pipelineConfig = PIPELINE_CONFIGS[pipelineId];
    if (pipelineConfig?.disabled) {
      throw new Error(`${pipelineId} pipeline is temporarily disabled (${pipelineConfig.disabledReason})`);
    }

    // Concurrent initialization protection: await existing initialization
    if (this._initializing.has(pipelineId)) {
      return await this._initializing.get(pipelineId)!;
    }

    // CRITICAL: Create and store promise SYNCHRONOUSLY before any await points
    let resolveInit!: (value: SidequestServer) => void;
    let rejectInit!: (reason: Error) => void;
    const initPromise = new Promise<SidequestServer>((resolve, reject) => {
      resolveInit = resolve;
      rejectInit = reject;
    });
    // Suppress unhandled rejection warning on initPromise. The rejection still
    // propagates to: (a) the primary caller via re-throw in the catch block
    // below, and (b) any concurrent waiters via `await _initializing.get()`.
    // Without this, Node.js emits an unhandledRejection when no concurrent
    // waiter exists at the time the promise is rejected.
    initPromise.catch(() => {});
    this._initializing.set(pipelineId, initPromise);

    try {
      // Concurrency limiting: wait if too many initializations in progress
      if (this._activeInits >= this._maxConcurrentInits) {
        logger.info({ pipelineId, activeInits: this._activeInits }, 'Queuing worker initialization (concurrency limit reached)');
        await new Promise(resolve => this._initQueue.push(resolve));
      }

      this._activeInits++;

      const worker = await this._performWorkerInitialization(pipelineId);
      resolveInit(worker);
      return worker;
    } catch (error) {
      rejectInit(error as Error);
      throw error;
    } finally {
      // Always cleanup _initializing, whether success or failure
      this._initializing.delete(pipelineId);

      // Release concurrency slot and process queue
      this._activeInits--;
      if (this._initQueue.length > 0) {
        const next = this._initQueue.shift()!;
        next();
      }
    }
  }

  /**
   * Perform the actual worker initialization with cleanup handling
   */
  private async _performWorkerInitialization(pipelineId: string): Promise<SidequestServer> {
    let worker: SidequestServer | null = null;
    try {
      worker = await this._initializeWorker(pipelineId);

      // Defense in depth: check if another worker exists
      const existingWorker = this._workers.get(pipelineId);
      if (existingWorker) {
        logger.warn({ pipelineId }, 'Duplicate worker detected (unexpected) - shutting down duplicate');
        if (typeof (worker as any).shutdown === 'function') {
          await (worker as any).shutdown().catch((shutdownError: Error) => {
            logger.error({ error: shutdownError.message, pipelineId }, 'Failed to shutdown duplicate worker');
          });
        }
        return existingWorker;
      }

      // Connect to activity feed BEFORE storing in _workers
      if (this._activityFeed) {
        this._activityFeed.listenToWorker(worker);
        logger.info({ pipelineId }, 'Worker connected to activity feed');
      }

      // Store worker
      this._workers.set(pipelineId, worker);

      // Clear failure count on success
      initFailures.delete(pipelineId);

      return worker;
    } catch (error) {
      // If we created a worker but failed after, clean it up
      if (worker && typeof (worker as any).shutdown === 'function') {
        await (worker as any).shutdown().catch((shutdownError: Error) => {
          logger.error({ error: shutdownError.message, pipelineId }, 'Failed to cleanup worker after init failure');
        });
      }

      // Track initialization failures for circuit breaker
      const existing = initFailures.get(pipelineId) || { count: 0, lastAttempt: 0 };
      initFailures.set(pipelineId, {
        count: existing.count + 1,
        lastAttempt: Date.now()
      });
      logger.error({ pipelineId, failureCount: existing.count + 1, error: (error as Error).message }, 'Worker initialization failed');
      throw error;
    }
  }

  /**
   * Initialize worker for a specific pipeline with timeout protection
   */
  private async _initializeWorker(pipelineId: string): Promise<SidequestServer> {
    logger.info({ pipelineId, timeoutMs: WORKER_INIT_TIMEOUT_MS }, 'Initializing worker');

    const pipelineConfig = PIPELINE_CONFIGS[pipelineId];

    if (!pipelineConfig) {
      throw new Error(`Unknown pipeline ID: ${pipelineId}`);
    }

    if (pipelineConfig.disabled) {
      throw new Error(`${pipelineId} pipeline is temporarily disabled (${pipelineConfig.disabledReason})`);
    }

    // Wrap initialization in timeout to prevent indefinite hangs
    const initPromise = this._doWorkerInit(pipelineId, pipelineConfig);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Worker initialization timed out after ${WORKER_INIT_TIMEOUT_MS}ms`));
      }, WORKER_INIT_TIMEOUT_MS);
    });

    try {
      return await Promise.race([initPromise, timeoutPromise]);
    } catch (error) {
      logger.error({
        error: (error as Error).message,
        pipelineId,
        timeoutMs: WORKER_INIT_TIMEOUT_MS
      }, 'Worker initialization failed or timed out');
      throw error;
    }
  }

  /**
   * Perform actual worker initialization
   */
  private async _doWorkerInit(pipelineId: string, pipelineConfig: PipelineConfig): Promise<SidequestServer> {
    let worker: SidequestServer;
    try {
      const options = pipelineConfig.getOptions();

      // Validate options is a valid object
      if (!options || typeof options !== 'object') {
        throw new Error(`getOptions() must return an object, got ${typeof options}`);
      }

      worker = new pipelineConfig.WorkerClass!(options);
    } catch (error) {
      logError(logger, error, 'Failed to create worker', { pipelineId });
      throw new Error(`Failed to initialize ${pipelineId} worker: ${(error as Error).message}`);
    }

    // Initialize worker if it has an initialize method
    if (typeof (worker as any).initialize === 'function') {
      try {
        await (worker as any).initialize();
      } catch (initError) {
        logError(logger, initError, 'Worker initialize() method failed', { pipelineId });
        throw new Error(`Failed to initialize ${pipelineId} worker: ${(initError as Error).message}`);
      }
    }

    logger.info({ pipelineId }, 'Worker initialized successfully');
    return worker;
  }

  /**
   * Check if a pipeline ID is supported
   */
  isSupported(pipelineId: string): boolean {
    return pipelineId in PIPELINE_CONFIGS;
  }

  /**
   * Get all supported pipeline IDs
   */
  getSupportedPipelines(): string[] {
    return Object.keys(PIPELINE_CONFIGS);
  }

  /**
   * Get aggregated stats from all initialized workers
   */
  getAllStats(): WorkerStats {
    const stats: WorkerStats = {
      total: 0,
      queued: 0,
      active: 0,
      completed: 0,
      failed: 0,
      byPipeline: {}
    };

    for (const [pipelineId, worker] of this._workers.entries()) {
      if (typeof worker.getStats === 'function') {
        const workerStats = worker.getStats() as unknown as Record<string, number>;
        stats.total += workerStats.total || 0;
        stats.queued += workerStats.queued || 0;
        stats.active += workerStats.active || 0;
        stats.completed += workerStats.completed || 0;
        stats.failed += workerStats.failed || 0;
        stats.byPipeline[pipelineId] = workerStats;
      }
    }

    return stats;
  }

  /**
   * Get stats for a specific pipeline worker (if initialized)
   */
  getWorkerStats(pipelineId: string): Record<string, number> | null {
    const worker = this._workers.get(pipelineId);
    if (worker && typeof worker.getStats === 'function') {
      return worker.getStats() as unknown as Record<string, number>;
    }
    return null;
  }

  /**
   * Get scan metrics for a specific pipeline worker (if supported)
   */
  getScanMetrics(pipelineId: string): Record<string, unknown> | null {
    const worker = this._workers.get(pipelineId);
    if (worker && typeof (worker as any).getScanMetrics === 'function') {
      return (worker as any).getScanMetrics();
    }
    return null;
  }

  /**
   * Shutdown all workers gracefully
   */
  async shutdown(): Promise<void> {
    logger.info({
      workerCount: this._workers.size,
      initializingCount: this._initializing.size
    }, 'Shutting down workers');

    // Wait for any in-flight initializations to complete before shutdown
    if (this._initializing.size > 0) {
      logger.info({ count: this._initializing.size }, 'Waiting for in-flight worker initializations');
      await Promise.allSettled(Array.from(this._initializing.values()));
    }

    const shutdownPromises: Promise<void>[] = [];

    for (const [pipelineId, worker] of this._workers.entries()) {
      if (typeof (worker as any).shutdown === 'function') {
        shutdownPromises.push(
          (worker as any).shutdown().catch((error: Error) => {
            logError(logger, error, 'Worker shutdown failed', { pipelineId });
          })
        );
      }
    }

    await Promise.all(shutdownPromises);

    this._workers.clear();
    this._initializing.clear();

    // Close database to stop the save interval timer
    jobRepository.close();

    logger.info('All workers shut down');
  }
}

// Export singleton instance
export const workerRegistry = new WorkerRegistry();

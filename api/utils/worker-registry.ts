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
import { CONCURRENCY, RETRY, TIMEOUTS, WORKER_COOLDOWN } from '#sidequest/core/constants.ts';
import { TIME_MS } from '#sidequest/core/units.ts';
import type { ActivityFeedManager } from '../activity-feed.ts';

/**
 * Worker initialization timeout
 * Prevents indefinite hangs if a worker's constructor or initialize() method blocks
 */
const WORKER_INIT_TIMEOUT_MS = TIMEOUTS.WORKER_INIT_MS;
const WORKER_INIT_FAILURE_THRESHOLD = 3;

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
      maxConcurrentScans: CONCURRENCY.MAX_WORKER_INITS,
      logDir: config.logDir,
      sentryDsn: config.sentryDsn
    })
  },
  'schema-enhancement': {
    WorkerClass: SchemaEnhancementWorker as unknown as WorkerConstructor,
    getOptions: () => ({
      maxConcurrent: config.maxConcurrent ?? CONCURRENCY.DEFAULT_IO_BOUND,
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
      maxConcurrent: config.maxConcurrent ?? CONCURRENCY.MAX_WORKER_INITS,
      logDir: config.logDir,
      sentryDsn: config.sentryDsn
    })
  },
  'gitignore-manager': {
    WorkerClass: GitignoreWorker as unknown as WorkerConstructor,
    getOptions: () => ({
      maxConcurrent: config.maxConcurrent ?? CONCURRENCY.MAX_WORKER_INITS,
      logDir: config.logDir,
      sentryDsn: config.sentryDsn
    })
  },
  'repomix': {
    WorkerClass: RepomixWorker as unknown as WorkerConstructor,
    getOptions: () => ({
      maxConcurrent: config.maxConcurrent ?? CONCURRENCY.MAX_WORKER_INITS,
      logDir: config.logDir,
      sentryDsn: config.sentryDsn
    }),
    disabled: true,
    disabledReason: 'Paused pending refactor — see BACKLOG.md'
  },
  'claude-health': {
    WorkerClass: ClaudeHealthWorker as unknown as WorkerConstructor,
    getOptions: () => ({
      maxConcurrent: config.maxConcurrent ?? CONCURRENCY.MAX_WORKER_INITS,
      logDir: config.logDir,
      sentryDsn: config.sentryDsn
    })
  },
  'repo-cleanup': {
    WorkerClass: RepoCleanupWorker as unknown as WorkerConstructor,
    getOptions: () => ({
      maxConcurrent: config.maxConcurrent ?? CONCURRENCY.MAX_WORKER_INITS,
      logDir: config.logDir,
      sentryDsn: config.sentryDsn
    })
  },
  'bugfix-audit': {
    WorkerClass: BugfixAuditWorker as unknown as WorkerConstructor,
    getOptions: () => ({
      maxConcurrent: config.maxConcurrent ?? CONCURRENCY.MAX_WORKER_INITS,
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

type WorkerWithShutdown = SidequestServer & { shutdown?: () => Promise<void> };
type WorkerWithInit = SidequestServer & { initialize?: () => Promise<void> };
type WorkerWithScanMetrics = SidequestServer & { getScanMetrics?: () => Record<string, unknown> };
type WorkerStatsRecord = Record<string, number>;

interface WorkerInitContext {
  pipelineId: string;
  workers: Map<string, SidequestServer>;
  activityFeed: ActivityFeedManager | null;
}

/**
 * enforceInitCircuitBreaker.
 */
function enforceInitCircuitBreaker(pipelineId: string): void {
  const failureInfo = initFailures.get(pipelineId);
  if (!failureInfo || failureInfo.count < WORKER_INIT_FAILURE_THRESHOLD) {
    return;
  }

  const cooldownAttempts = failureInfo.cooldownAttempts || 0;
  const cooldownMs = Math.min(WORKER_COOLDOWN.BASE_MS * Math.pow(RETRY.BACKOFF_MULTIPLIER, cooldownAttempts), WORKER_COOLDOWN.MAX_MS);
  const timeSinceLastAttempt = Date.now() - failureInfo.lastAttempt;

  if (timeSinceLastAttempt < cooldownMs) {
    throw new Error(
      `${pipelineId} worker initialization is in cooldown after ${failureInfo.count} failures. Retry in ${Math.ceil((cooldownMs - timeSinceLastAttempt) / TIME_MS.SECOND)}s`
    );
  }

  logger.info({
    pipelineId,
    previousFailures: failureInfo.count,
    cooldownAttempts: cooldownAttempts + 1
  }, 'Circuit breaker entering half-open state');

  initFailures.set(pipelineId, {
    count: WORKER_INIT_FAILURE_THRESHOLD - 1,
    lastAttempt: Date.now(),
    cooldownAttempts: cooldownAttempts + 1
  });
}

/**
 * getPipelineConfigOrThrow.
 */
function getPipelineConfigOrThrow(pipelineId: string): PipelineConfig {
  const pipelineConfig = PIPELINE_CONFIGS[pipelineId];
  if (!pipelineConfig) {
    throw new Error(`Unknown pipeline ID: ${pipelineId}`);
  }
  return pipelineConfig;
}

/**
 * ensurePipelineEnabled.
 */
function ensurePipelineEnabled(pipelineId: string, pipelineConfig: PipelineConfig): void {
  if (pipelineConfig.disabled) {
    throw new Error(`${pipelineId} pipeline is temporarily disabled (${pipelineConfig.disabledReason})`);
  }
}

async function shutdownWorkerSafely(
  worker: SidequestServer | null | undefined,
  pipelineId: string,
  errorMessage: string
): Promise<void> {
  const workerWithShutdown = worker as WorkerWithShutdown | null | undefined;
  if (!workerWithShutdown || typeof workerWithShutdown.shutdown !== 'function') {
    return;
  }

  await workerWithShutdown.shutdown().catch((shutdownError: Error) => {
    logger.error({ error: shutdownError.message, pipelineId }, errorMessage);
  });
}

/**
 * doWorkerInit.
 */
async function doWorkerInit(pipelineId: string, pipelineConfig: PipelineConfig): Promise<SidequestServer> {
  let worker: SidequestServer;
  try {
    const options = pipelineConfig.getOptions();
    if (!options || typeof options !== 'object') {
      throw new Error(`getOptions() must return an object, got ${typeof options}`);
    }

    worker = new pipelineConfig.WorkerClass!(options);
  } catch (error) {
    logError(logger, error, 'Failed to create worker', { pipelineId });
    throw new Error(`Failed to initialize ${pipelineId} worker: ${(error as Error).message}`);
  }

  const workerWithInit = worker as WorkerWithInit;
  if (typeof workerWithInit.initialize === 'function') {
    try {
      await workerWithInit.initialize();
    } catch (initError) {
      logError(logger, initError, 'Worker initialize() method failed', { pipelineId });
      throw new Error(`Failed to initialize ${pipelineId} worker: ${(initError as Error).message}`);
    }
  }

  logger.info({ pipelineId }, 'Worker initialized successfully');
  return worker;
}

/**
 * initializeWorkerWithTimeout.
 */
async function initializeWorkerWithTimeout(pipelineId: string): Promise<SidequestServer> {
  logger.info({ pipelineId, timeoutMs: WORKER_INIT_TIMEOUT_MS }, 'Initializing worker');

  const pipelineConfig = getPipelineConfigOrThrow(pipelineId);
  ensurePipelineEnabled(pipelineId, pipelineConfig);

  const initPromise = doWorkerInit(pipelineId, pipelineConfig);
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
 * recordInitFailure.
 */
function recordInitFailure(pipelineId: string, error: unknown): void {
  const normalizedError = error instanceof Error ? error : new Error(String(error));
  const existing = initFailures.get(pipelineId) || { count: 0, lastAttempt: 0 };

  initFailures.set(pipelineId, {
    count: existing.count + 1,
    lastAttempt: Date.now()
  });

  logger.error({
    pipelineId,
    failureCount: existing.count + 1,
    error: normalizedError.message
  }, 'Worker initialization failed');
}

async function performWorkerInitialization({
  pipelineId,
  workers,
  activityFeed
}: WorkerInitContext): Promise<SidequestServer> {
  let worker: SidequestServer | null = null;
  try {
    worker = await initializeWorkerWithTimeout(pipelineId);

    const existingWorker = workers.get(pipelineId);
    if (existingWorker) {
      logger.warn({ pipelineId }, 'Duplicate worker detected (unexpected) - shutting down duplicate');
      await shutdownWorkerSafely(worker, pipelineId, 'Failed to shutdown duplicate worker');
      return existingWorker;
    }

    if (activityFeed) {
      activityFeed.listenToWorker(worker);
      logger.info({ pipelineId }, 'Worker connected to activity feed');
    }

    workers.set(pipelineId, worker);
    initFailures.delete(pipelineId);
    return worker;
  } catch (error) {
    await shutdownWorkerSafely(worker, pipelineId, 'Failed to cleanup worker after init failure');
    recordInitFailure(pipelineId, error);
    throw error;
  }
}

/**
 * getWorkerStatsIfAvailable.
 */
function getWorkerStatsIfAvailable(worker: SidequestServer | undefined): WorkerStatsRecord | null {
  if (!worker || typeof worker.getStats !== 'function') {
    return null;
  }

  return worker.getStats() as unknown as WorkerStatsRecord;
}

/**
 * aggregateWorkerStats.
 */
function aggregateWorkerStats(workers: Map<string, SidequestServer>): WorkerStats {
  const stats: WorkerStats = {
    total: 0,
    queued: 0,
    active: 0,
    completed: 0,
    failed: 0,
    byPipeline: {}
  };

  for (const [pipelineId, worker] of workers.entries()) {
    const workerStats = getWorkerStatsIfAvailable(worker);
    if (!workerStats) {
      continue;
    }

    stats.total += workerStats.total ?? 0;
    stats.queued += workerStats.queued ?? 0;
    stats.active += workerStats.active ?? 0;
    stats.completed += workerStats.completed ?? 0;
    stats.failed += workerStats.failed ?? 0;
    stats.byPipeline[pipelineId] = workerStats;
  }

  return stats;
}

/**
 * getScanMetricsIfAvailable.
 */
function getScanMetricsIfAvailable(worker: SidequestServer | undefined): Record<string, unknown> | null {
  const workerWithMetrics = worker as WorkerWithScanMetrics | undefined;
  if (workerWithMetrics && typeof workerWithMetrics.getScanMetrics === 'function') {
    return workerWithMetrics.getScanMetrics();
  }
  return null;
}

async function shutdownRegistryWorkers(
  workers: Map<string, SidequestServer>,
  initializing: Map<string, Promise<SidequestServer>>
): Promise<void> {
  if (initializing.size > 0) {
    logger.info({ count: initializing.size }, 'Waiting for in-flight worker initializations');
    await Promise.allSettled(Array.from(initializing.values()));
  }

  const shutdownPromises: Promise<void>[] = [];
  for (const [pipelineId, worker] of workers.entries()) {
    const workerWithShutdown = worker as WorkerWithShutdown;
    if (typeof workerWithShutdown.shutdown !== 'function') {
      continue;
    }

    shutdownPromises.push(
      workerWithShutdown.shutdown().catch((error: Error) => {
        logError(logger, error, 'Worker shutdown failed', { pipelineId });
      })
    );
  }

  await Promise.all(shutdownPromises);
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

  /**
   * Constructor.
   */
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

    enforceInitCircuitBreaker(pipelineId);

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
    return performWorkerInitialization({
      pipelineId,
      workers: this._workers,
      activityFeed: this._activityFeed
    });
  }

  /**
   * Register a pre-existing worker instance (e.g. workers created outside the registry).
   * If a worker is already registered for the given pipelineId, this is a no-op.
   */
  registerWorker(pipelineId: string, worker: SidequestServer): void {
    if (this._workers.has(pipelineId)) {
      return;
    }
    this._workers.set(pipelineId, worker);
    if (this._activityFeed) {
      this._activityFeed.listenToWorker(worker);
    }
    logger.info({ pipelineId }, 'Pre-existing worker registered');
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
    return aggregateWorkerStats(this._workers);
  }

  /**
   * Get stats for a specific pipeline worker (if initialized)
   */
  getWorkerStats(pipelineId: string): Record<string, number> | null {
    return getWorkerStatsIfAvailable(this._workers.get(pipelineId));
  }

  /**
   * Get scan metrics for a specific pipeline worker (if supported)
   */
  getScanMetrics(pipelineId: string): Record<string, unknown> | null {
    return getScanMetricsIfAvailable(this._workers.get(pipelineId));
  }

  /**
   * Get total system capacity (sum of maxConcurrent across all enabled pipelines)
   */
  getTotalCapacity(): number {
    return Object.values(PIPELINE_CONFIGS)
      .filter(cfg => !cfg.disabled)
      .reduce((sum, cfg) => {
        const opts = cfg.getOptions() as Record<string, unknown>;
        const max = (opts.maxConcurrentScans ?? opts.maxConcurrent ?? CONCURRENCY.DEFAULT_MAX_JOBS) as number;
        return sum + max;
      }, 0);
  }

  /**
   * Shutdown all workers gracefully
   */
  async shutdown(): Promise<void> {
    logger.info({
      workerCount: this._workers.size,
      initializingCount: this._initializing.size
    }, 'Shutting down workers');

    await shutdownRegistryWorkers(this._workers, this._initializing);

    this._workers.clear();
    this._initializing.clear();

    // Close database to stop the save interval timer
    jobRepository.close();

    logger.info('All workers shut down');
  }
}

// Export singleton instance
export const workerRegistry = new WorkerRegistry();

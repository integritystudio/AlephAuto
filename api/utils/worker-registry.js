/**
 * Worker Registry
 *
 * Centralized registry for mapping pipeline IDs to worker instances.
 * Lazy initialization ensures workers are only created when needed.
 *
 * @module api/utils/worker-registry
 */

import { DuplicateDetectionWorker } from '../../sidequest/workers/duplicate-detection-worker.js';
import { SchemaEnhancementWorker } from '../../sidequest/workers/schema-enhancement-worker.js';
import { GitActivityWorker } from '../../sidequest/workers/git-activity-worker.js';
import { GitignoreWorker } from '../../sidequest/workers/gitignore-worker.js';
import { RepomixWorker } from '../../sidequest/workers/repomix-worker.js';
import { ClaudeHealthWorker } from '../../sidequest/workers/claude-health-worker.js';
import { RepoCleanupWorker } from '../../sidequest/workers/repo-cleanup-worker.js';
import { config } from '../../sidequest/core/config.js';
import { createComponentLogger, logError } from '../../sidequest/utils/logger.js';
import { jobRepository } from '../../sidequest/core/job-repository.js';
import { CONCURRENCY, TIMEOUTS, TIME, WORKER_COOLDOWN } from '../../sidequest/core/constants.js';

/**
 * Worker initialization timeout
 * Prevents indefinite hangs if a worker's constructor or initialize() method blocks
 */
const WORKER_INIT_TIMEOUT_MS = TIMEOUTS.WORKER_INIT_MS;

const logger = createComponentLogger('WorkerRegistry');

/**
 * Track initialization failures for circuit breaker pattern
 * @type {Map<string, {count: number, lastAttempt: number, cooldownAttempts?: number}>}
 */
const initFailures = new Map();

/**
 * @typedef {new (options: object) => import('../../sidequest/core/server.js').SidequestServer} WorkerConstructor
 */

/**
 * Pipeline configuration - single source of truth for all pipeline definitions
 *
 * @type {Record<string, {WorkerClass: WorkerConstructor | null, getOptions: () => Object, disabled?: boolean, disabledReason?: string}>}
 */
const PIPELINE_CONFIGS = {
  'duplicate-detection': {
    WorkerClass: DuplicateDetectionWorker,
    getOptions: () => ({
      maxConcurrentScans: 3,
      logDir: config.logDir,
      sentryDsn: config.sentryDsn
    })
  },
  'schema-enhancement': {
    WorkerClass: SchemaEnhancementWorker,
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
    WorkerClass: GitActivityWorker,
    getOptions: () => ({
      maxConcurrent: config.maxConcurrent || 3,
      logDir: config.logDir,
      sentryDsn: config.sentryDsn
    })
  },
  'gitignore-manager': {
    WorkerClass: GitignoreWorker,
    getOptions: () => ({
      maxConcurrent: config.maxConcurrent || 3,
      logDir: config.logDir,
      sentryDsn: config.sentryDsn
    })
  },
  'repomix': {
    WorkerClass: RepomixWorker,
    getOptions: () => ({
      maxConcurrent: config.maxConcurrent || 3,
      logDir: config.logDir,
      sentryDsn: config.sentryDsn
    })
  },
  'claude-health': {
    WorkerClass: ClaudeHealthWorker,
    getOptions: () => ({
      maxConcurrent: config.maxConcurrent || 3,
      logDir: config.logDir,
      sentryDsn: config.sentryDsn
    })
  },
  'repo-cleanup': {
    WorkerClass: RepoCleanupWorker,
    getOptions: () => ({
      maxConcurrent: config.maxConcurrent || 3,
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

/**
 * Worker registry - lazy initialization pattern
 * Workers are created on first access to avoid unnecessary resource consumption
 */
class WorkerRegistry {
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
   *
   * @param {import('../activity-feed.js').ActivityFeedManager} activityFeed - Activity feed manager
   */
  setActivityFeed(activityFeed) {
    this._activityFeed = activityFeed;

    // Connect any existing workers
    for (const worker of this._workers.values()) {
      activityFeed.listenToWorker(worker);
    }

    logger.info({ workerCount: this._workers.size }, 'Activity feed connected to worker registry');
  }

  /**
   * Get worker instance for a pipeline ID
   *
   * Uses async lock pattern to prevent duplicate initialization when
   * multiple concurrent calls request the same worker. Includes:
   * - Concurrency limiting to prevent thundering herd
   * - Circuit breaker for repeated initialization failures
   *
   * RACE CONDITION FIX: The promise is stored in _initializing SYNCHRONOUSLY
   * before any await points. This ensures concurrent callers always see the
   * pending initialization and await the same promise, preventing duplicate
   * worker instances.
   *
   * @param {string} pipelineId - Pipeline identifier
   * @returns {Promise<import('../../sidequest/core/server.js').SidequestServer>} Worker instance
   * @throws {Error} If pipeline ID is unknown or initialization fails
   */
  async getWorker(pipelineId) {
    // Fast path: already initialized
    if (this._workers.has(pipelineId)) {
      return this._workers.get(pipelineId);
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
      // If it fails again, we'll have a longer cooldown next time
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

    // Concurrent initialization protection: await existing initialization
    if (this._initializing.has(pipelineId)) {
      // All concurrent callers await the same promise
      return await this._initializing.get(pipelineId);
    }

    // CRITICAL: Create and store promise SYNCHRONOUSLY before any await points
    // This prevents race conditions where concurrent callers could both pass
    // the _initializing.has() check before either stores their promise
    /** @type {(value: import('../../sidequest/core/server.js').SidequestServer) => void} */
    let resolveInit;
    /** @type {(reason: Error) => void} */
    let rejectInit;
    const initPromise = new Promise((resolve, reject) => {
      resolveInit = resolve;
      rejectInit = reject;
    });
    this._initializing.set(pipelineId, initPromise);

    // Now safe to await - concurrent callers will see _initializing has this
    // pipelineId and await the same promise
    try {
      // Concurrency limiting: wait if too many initializations in progress
      if (this._activeInits >= this._maxConcurrentInits) {
        logger.info({ pipelineId, activeInits: this._activeInits }, 'Queuing worker initialization (concurrency limit reached)');
        await new Promise(resolve => this._initQueue.push(resolve));
      }

      this._activeInits++;

      const worker = await this._performWorkerInitialization(pipelineId);
      // @ts-ignore - resolveInit is assigned in Promise constructor above
      resolveInit(worker);
      return worker;
    } catch (error) {
      // @ts-ignore - rejectInit is assigned in Promise constructor above
      rejectInit(error);
      throw error;
    } finally {
      // Always cleanup _initializing, whether success or failure
      this._initializing.delete(pipelineId);

      // Release concurrency slot and process queue
      this._activeInits--;
      if (this._initQueue.length > 0) {
        const next = this._initQueue.shift();
        next();
      }
    }
  }

  /**
   * Perform the actual worker initialization with cleanup handling
   *
   * @private
   * @param {string} pipelineId - Pipeline identifier
   * @returns {Promise<import('../../sidequest/core/server.js').SidequestServer>} Worker instance
   */
  async _performWorkerInitialization(pipelineId) {
    let worker = null;
    try {
      worker = await this._initializeWorker(pipelineId);

      // Defense in depth: check if another worker exists
      // With the synchronous promise storage, this should never trigger,
      // but we keep it as a safety net
      const existingWorker = this._workers.get(pipelineId);
      if (existingWorker) {
        logger.warn({ pipelineId }, 'Duplicate worker detected (unexpected) - shutting down duplicate');
        // @ts-ignore - shutdown() exists on worker instances but not in base type
        if (worker.shutdown && typeof worker.shutdown === 'function') {
          // @ts-ignore
          await worker.shutdown().catch(shutdownError => {
            logger.error({ error: shutdownError.message, pipelineId }, 'Failed to shutdown duplicate worker');
          });
        }
        return existingWorker;
      }

      // Connect to activity feed BEFORE storing in _workers
      // This ensures no events are missed
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
      // If we created a worker but failed after (e.g., activity feed connection),
      // clean it up to prevent resource leaks
      // @ts-ignore - shutdown() exists on worker instances but not in base type
      if (worker && worker.shutdown && typeof worker.shutdown === 'function') {
        // @ts-ignore
        await worker.shutdown().catch(shutdownError => {
          logger.error({ error: shutdownError.message, pipelineId }, 'Failed to cleanup worker after init failure');
        });
      }

      // Track initialization failures for circuit breaker
      const existing = initFailures.get(pipelineId) || { count: 0, lastAttempt: 0 };
      initFailures.set(pipelineId, {
        count: existing.count + 1,
        lastAttempt: Date.now()
      });
      logger.error({ pipelineId, failureCount: existing.count + 1, error: error.message }, 'Worker initialization failed');
      throw error;
    }
  }

  /**
   * Initialize worker for a specific pipeline with timeout protection
   *
   * @private
   * @param {string} pipelineId - Pipeline identifier
   * @returns {Promise<import('../../sidequest/core/server.js').SidequestServer>} Worker instance
   * @throws {Error} If initialization times out or fails
   */
  async _initializeWorker(pipelineId) {
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
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Worker initialization timed out after ${WORKER_INIT_TIMEOUT_MS}ms`));
      }, WORKER_INIT_TIMEOUT_MS);
    });

    try {
      return await Promise.race([initPromise, timeoutPromise]);
    } catch (error) {
      logger.error({
        error: error.message,
        pipelineId,
        timeoutMs: WORKER_INIT_TIMEOUT_MS
      }, 'Worker initialization failed or timed out');
      throw error;
    }
  }

  /**
   * Perform actual worker initialization (called by _initializeWorker with timeout wrapper)
   *
   * @private
   * @param {string} pipelineId - Pipeline identifier
   * @param {Object} pipelineConfig - Pipeline configuration
   * @returns {Promise<import('../../sidequest/core/server.js').SidequestServer>} Worker instance
   */
  async _doWorkerInit(pipelineId, pipelineConfig) {
    let worker;
    try {
      const options = pipelineConfig.getOptions();

      // Validate options is a valid object
      if (!options || typeof options !== 'object') {
        throw new Error(`getOptions() must return an object, got ${typeof options}`);
      }

      worker = new pipelineConfig.WorkerClass(options);
    } catch (error) {
      logError(logger, error, 'Failed to create worker', { pipelineId });
      throw new Error(`Failed to initialize ${pipelineId} worker: ${error.message}`);
    }

    // Initialize worker if it has an initialize method
    // @ts-ignore - initialize() exists on DuplicateDetectionWorker but not all workers
    if (worker.initialize && typeof worker.initialize === 'function') {
      try {
        // @ts-ignore
        await worker.initialize();
      } catch (initError) {
        logError(logger, initError, 'Worker initialize() method failed', { pipelineId });
        throw new Error(`Failed to initialize ${pipelineId} worker: ${initError.message}`);
      }
    }

    logger.info({ pipelineId }, 'Worker initialized successfully');

    // Note: Activity feed connection is handled in getWorker() to ensure
    // it happens atomically with storing the worker in _workers map
    return worker;
  }

  /**
   * Check if a pipeline ID is supported
   *
   * @param {string} pipelineId - Pipeline identifier
   * @returns {boolean} True if pipeline is supported
   */
  isSupported(pipelineId) {
    return pipelineId in PIPELINE_CONFIGS;
  }

  /**
   * Get all supported pipeline IDs
   *
   * @returns {string[]} Array of supported pipeline IDs
   */
  getSupportedPipelines() {
    return Object.keys(PIPELINE_CONFIGS);
  }

  /**
   * Get aggregated stats from all initialized workers
   *
   * @returns {Object} Aggregated stats object
   */
  getAllStats() {
    const stats = {
      total: 0,
      queued: 0,
      active: 0,
      completed: 0,
      failed: 0,
      byPipeline: {}
    };

    for (const [pipelineId, worker] of this._workers.entries()) {
      if (worker.getStats && typeof worker.getStats === 'function') {
        const workerStats = worker.getStats();
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
   *
   * @param {string} pipelineId - Pipeline identifier
   * @returns {Object|null} Worker stats or null if not initialized
   */
  getWorkerStats(pipelineId) {
    const worker = this._workers.get(pipelineId);
    if (worker && worker.getStats && typeof worker.getStats === 'function') {
      return worker.getStats();
    }
    return null;
  }

  /**
   * Get scan metrics for a specific pipeline worker (if supported)
   *
   * @param {string} pipelineId - Pipeline identifier
   * @returns {Object|null} Scan metrics or null if not available
   */
  getScanMetrics(pipelineId) {
    const worker = this._workers.get(pipelineId);
    if (worker && worker.getScanMetrics && typeof worker.getScanMetrics === 'function') {
      return worker.getScanMetrics();
    }
    return null;
  }

  /**
   * Shutdown all workers gracefully
   *
   * @returns {Promise<void>}
   */
  async shutdown() {
    logger.info({
      workerCount: this._workers.size,
      initializingCount: this._initializing.size
    }, 'Shutting down workers');

    // Wait for any in-flight initializations to complete before shutdown
    // This prevents resource leaks from workers that complete after shutdown starts
    if (this._initializing.size > 0) {
      logger.info({ count: this._initializing.size }, 'Waiting for in-flight worker initializations');
      await Promise.allSettled(Array.from(this._initializing.values()));
    }

    const shutdownPromises = [];

    for (const [pipelineId, worker] of this._workers.entries()) {
      if (worker.shutdown && typeof worker.shutdown === 'function') {
        shutdownPromises.push(
          worker.shutdown().catch(error => {
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

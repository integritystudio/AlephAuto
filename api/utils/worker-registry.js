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
import { createComponentLogger } from '../../sidequest/utils/logger.js';
import { jobRepository } from '../../sidequest/core/job-repository.js';

const logger = createComponentLogger('WorkerRegistry');

/**
 * Pipeline configuration - single source of truth for all pipeline definitions
 *
 * @type {Record<string, {WorkerClass: Function, getOptions: () => Object, disabled?: boolean, disabledReason?: string}>}
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
   * multiple concurrent calls request the same worker.
   *
   * @param {string} pipelineId - Pipeline identifier
   * @returns {Promise<import('../../sidequest/core/server.js').SidequestServer>} Worker instance
   * @throws {Error} If pipeline ID is unknown
   */
  async getWorker(pipelineId) {
    // Fast path: already initialized
    if (this._workers.has(pipelineId)) {
      return this._workers.get(pipelineId);
    }

    // Concurrent initialization protection: await existing initialization
    if (this._initializing.has(pipelineId)) {
      // All concurrent callers await the same promise
      return await this._initializing.get(pipelineId);
    }

    // Create initialization promise with proper cleanup via finally
    const initPromise = (async () => {
      try {
        const worker = await this._initializeWorker(pipelineId);
        // Store worker before cleanup to prevent race between
        // _initializing.delete and _workers.set
        this._workers.set(pipelineId, worker);
        return worker;
      } finally {
        // Always cleanup _initializing, whether success or failure
        this._initializing.delete(pipelineId);
      }
    })();

    // Store promise for concurrent callers before awaiting
    this._initializing.set(pipelineId, initPromise);

    return await initPromise;
  }

  /**
   * Initialize worker for a specific pipeline
   *
   * @private
   * @param {string} pipelineId - Pipeline identifier
   * @returns {Promise<import('../../sidequest/core/server.js').SidequestServer>} Worker instance
   */
  async _initializeWorker(pipelineId) {
    logger.info({ pipelineId }, 'Initializing worker');

    const pipelineConfig = PIPELINE_CONFIGS[pipelineId];

    if (!pipelineConfig) {
      throw new Error(`Unknown pipeline ID: ${pipelineId}`);
    }

    if (pipelineConfig.disabled) {
      throw new Error(`${pipelineId} pipeline is temporarily disabled (${pipelineConfig.disabledReason})`);
    }

    let worker;
    try {
      const options = pipelineConfig.getOptions();
      worker = new pipelineConfig.WorkerClass(options);
    } catch (error) {
      logger.error({ error, pipelineId }, 'Failed to create worker');
      throw new Error(`Failed to initialize ${pipelineId} worker: ${error.message}`);
    }

    // Initialize worker if it has an initialize method
    // @ts-ignore - initialize() exists on DuplicateDetectionWorker but not all workers
    if (worker.initialize && typeof worker.initialize === 'function') {
      // @ts-ignore
      await worker.initialize();
    }

    // Connect worker to activity feed for real-time WebSocket updates
    if (this._activityFeed) {
      this._activityFeed.listenToWorker(worker);
      logger.info({ pipelineId }, 'Worker connected to activity feed for WebSocket broadcasts');
    }

    logger.info({ pipelineId }, 'Worker initialized successfully');

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
    logger.info({ workerCount: this._workers.size }, 'Shutting down workers');

    const shutdownPromises = [];

    for (const [pipelineId, worker] of this._workers.entries()) {
      if (worker.shutdown && typeof worker.shutdown === 'function') {
        shutdownPromises.push(
          worker.shutdown().catch(error => {
            logger.error({ error, pipelineId }, 'Worker shutdown failed');
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

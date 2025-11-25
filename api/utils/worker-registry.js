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
import { TestRefactorWorker } from '../../sidequest/workers/test-refactor-worker.js';
import { config } from '../../sidequest/core/config.js';
import { createComponentLogger } from '../../sidequest/utils/logger.js';

const logger = createComponentLogger('WorkerRegistry');

/**
 * Worker registry - lazy initialization pattern
 * Workers are created on first access to avoid unnecessary resource consumption
 */
class WorkerRegistry {
  constructor() {
    this._workers = new Map();
    this._initializing = new Map();
  }

  /**
   * Get worker instance for a pipeline ID
   *
   * @param {string} pipelineId - Pipeline identifier
   * @returns {Promise<import('../../sidequest/core/server.js').SidequestServer>} Worker instance
   * @throws {Error} If pipeline ID is unknown
   */
  async getWorker(pipelineId) {
    // Check if already initialized
    if (this._workers.has(pipelineId)) {
      return this._workers.get(pipelineId);
    }

    // Check if currently initializing (prevent duplicate initialization)
    if (this._initializing.has(pipelineId)) {
      return this._initializing.get(pipelineId);
    }

    // Start initialization
    const initPromise = this._initializeWorker(pipelineId);
    this._initializing.set(pipelineId, initPromise);

    try {
      const worker = await initPromise;
      this._workers.set(pipelineId, worker);
      this._initializing.delete(pipelineId);
      return worker;
    } catch (error) {
      this._initializing.delete(pipelineId);
      throw error;
    }
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

    let worker;

    switch (pipelineId) {
      case 'duplicate-detection':
        try {
          worker = new DuplicateDetectionWorker({
            maxConcurrentScans: 3,
            logDir: config.logDir,
            sentryDsn: config.sentryDsn
          });
        } catch (error) {
          logger.error({ error, pipelineId }, 'Failed to create DuplicateDetectionWorker');
          throw new Error(`Failed to initialize duplicate-detection worker: ${error.message}`);
        }
        break;

      case 'schema-enhancement':
        worker = new SchemaEnhancementWorker({
          maxConcurrent: config.maxConcurrent || 2,
          logDir: config.logDir,
          sentryDsn: config.sentryDsn,
          gitWorkflowEnabled: config.enableGitWorkflow,
          gitBranchPrefix: 'docs',
          gitBaseBranch: config.gitBaseBranch,
          gitDryRun: config.gitDryRun
        });
        break;

      case 'git-activity':
        worker = new GitActivityWorker({
          maxConcurrent: config.maxConcurrent || 3,
          logDir: config.logDir,
          sentryDsn: config.sentryDsn
        });
        break;

      case 'gitignore-manager':
        worker = new GitignoreWorker({
          maxConcurrent: config.maxConcurrent || 3,
          logDir: config.logDir,
          sentryDsn: config.sentryDsn
        });
        break;

      case 'repomix':
        worker = new RepomixWorker({
          maxConcurrent: config.maxConcurrent || 3,
          logDir: config.logDir,
          sentryDsn: config.sentryDsn
        });
        break;

      case 'claude-health':
        worker = new ClaudeHealthWorker({
          maxConcurrent: config.maxConcurrent || 3,
          logDir: config.logDir,
          sentryDsn: config.sentryDsn
        });
        break;

      case 'repo-cleanup':
        worker = new RepoCleanupWorker({
          maxConcurrent: config.maxConcurrent || 3,
          logDir: config.logDir,
          sentryDsn: config.sentryDsn
        });
        break;

      case 'test-refactor':
        worker = new TestRefactorWorker({
          maxConcurrent: config.maxConcurrent || 3,
          logDir: config.logDir,
          sentryDsn: config.sentryDsn
        });
        break;

      default:
        throw new Error(`Unknown pipeline ID: ${pipelineId}`);
    }

    // Initialize worker if it has an initialize method
    // @ts-ignore - initialize() exists on DuplicateDetectionWorker but not all workers
    if (worker.initialize && typeof worker.initialize === 'function') {
      // @ts-ignore
      await worker.initialize();
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
    const supportedPipelines = [
      'duplicate-detection',
      'schema-enhancement',
      'git-activity',
      'gitignore-manager',
      'repomix',
      'claude-health',
      'repo-cleanup',
      'test-refactor'
    ];

    return supportedPipelines.includes(pipelineId);
  }

  /**
   * Get all supported pipeline IDs
   *
   * @returns {string[]} Array of supported pipeline IDs
   */
  getSupportedPipelines() {
    return [
      'duplicate-detection',
      'schema-enhancement',
      'git-activity',
      'gitignore-manager',
      'repomix',
      'claude-health',
      'repo-cleanup',
      'test-refactor'
    ];
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

    logger.info('All workers shut down');
  }
}

// Export singleton instance
export const workerRegistry = new WorkerRegistry();

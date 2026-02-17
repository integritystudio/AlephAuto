/**
 * Job Repository
 *
 * Provides a clean abstraction layer over database operations for jobs.
 * Implements the repository pattern to decouple business logic from data access.
 *
 * @module sidequest/core/job-repository
 */

import {
  initDatabase,
  saveJob as dbSaveJob,
  getJobById as dbGetJobById,
  getJobCount as dbGetJobCount,
  getJobs as dbGetJobs,
  getAllJobs as dbGetAllJobs,
  getJobCounts as dbGetJobCounts,
  getLastJob as dbGetLastJob,
  getAllPipelineStats as dbGetAllPipelineStats,
  bulkImportJobs as dbBulkImportJobs,
  closeDatabase as dbCloseDatabase,
} from './database.js';
import { createComponentLogger, logError } from '../utils/logger.ts';

const logger = createComponentLogger('JobRepository');

/**
 * Job Repository - abstracts database access for job operations
 */
class JobRepository {
  /**
   * Create a new JobRepository instance
   * @param {Object} [options={}] - Configuration options
   * @param {boolean} [options.autoInitialize=false] - Auto-initialize on construction
   */
  constructor(options = {}) {
    this._initialized = false;
    this._options = options;

    // Auto-initialize if requested (useful for testing)
    if (options.autoInitialize) {
      this.initialize().catch(err => {
        logError(logger, err, 'Failed to auto-initialize JobRepository');
      });
    }
  }

  /**
   * Initialize the repository (and underlying database)
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this._initialized) return;

    await initDatabase();
    this._initialized = true;
    logger.debug('JobRepository initialized');
  }

  /**
   * Save a job to the repository
   *
   * @param {Object} job - Job object to save
   * @param {string} job.id - Unique job ID
   * @param {string} job.pipelineId - Pipeline identifier
   * @param {string} job.status - Job status
   * @param {string} [job.createdAt] - Creation timestamp
   * @param {string} [job.startedAt] - Start timestamp
   * @param {string} [job.completedAt] - Completion timestamp
   * @param {Object} [job.data] - Job input data
   * @param {Object} [job.result] - Job result data
   * @param {Object} [job.error] - Error information
   * @param {Object} [job.git] - Git workflow information
   */
  saveJob(job) {
    dbSaveJob(job);
  }

  /**
   * Get a single job by ID
   *
   * @param {string} id - Job ID
   * @returns {Object|null} Job object or null if not found
   */
  getJob(id) {
    return dbGetJobById(id);
  }

  /**
   * Get jobs for a pipeline with filtering
   *
   * @param {string} pipelineId - Pipeline identifier
   * @param {Object} [filters={}] - Query filters
   * @param {string} [filters.status] - Filter by status
   * @param {number} [filters.limit=10] - Max results
   * @param {number} [filters.offset=0] - Pagination offset
   * @param {string} [filters.tab] - Tab context
   * @param {boolean} [filters.includeTotal=false] - Include total count
   * @returns {Array|Object} Jobs array or {jobs, total} if includeTotal
   */
  getJobs(pipelineId, filters = {}) {
    return dbGetJobs(pipelineId, filters);
  }

  /**
   * Get all jobs across all pipelines
   *
   * @param {Object} [filters={}] - Query filters
   * @param {string} [filters.status] - Filter by status
   * @param {number} [filters.limit=100] - Max results
   * @param {number} [filters.offset=0] - Pagination offset
   * @returns {Array} Array of job objects
   */
  getAllJobs(filters = {}) {
    return dbGetAllJobs(filters);
  }

  /**
   * Get total job count with optional status filter
   *
   * @param {Object} [filters={}] - Query filters
   * @param {string} [filters.status] - Filter by status
   * @returns {number} Total count
   */
  getJobCount(filters = {}) {
    return dbGetJobCount(filters);
  }

  /**
   * Get job counts for a pipeline
   *
   * @param {string} pipelineId - Pipeline identifier
   * @returns {Object} Counts object with completed, failed, running, queued
   */
  getJobCounts(pipelineId) {
    return dbGetJobCounts(pipelineId);
  }

  /**
   * Get the most recent job for a pipeline
   *
   * @param {string} pipelineId - Pipeline identifier
   * @returns {Object|null} Most recent job or null
   */
  getLastJob(pipelineId) {
    return dbGetLastJob(pipelineId);
  }

  /**
   * Get stats for all pipelines
   *
   * @returns {Array} Array of pipeline stats objects
   */
  getAllPipelineStats() {
    return dbGetAllPipelineStats();
  }

  /**
   * Bulk import jobs (for migrations)
   *
   * @param {Array} jobs - Array of job objects to import
   * @returns {Object} Result with imported, skipped, errors counts
   */
  bulkImport(jobs) {
    return dbBulkImportJobs(jobs);
  }

  /**
   * Close the repository (and underlying database)
   *
   * Note: closeDatabase() already calls persistDatabase() before closing,
   * ensuring all pending data is written to disk.
   */
  close() {
    if (!this._initialized) {
      logger.debug('JobRepository already closed or not initialized');
      return;
    }

    dbCloseDatabase();
    this._initialized = false;
    logger.debug('JobRepository closed');
  }

  /**
   * Reset the repository state (primarily for testing)
   * Closes the database and clears internal state
   */
  reset() {
    if (this._initialized) {
      this.close();
    }
    this._initialized = false;
    logger.debug('JobRepository reset');
  }
}

/**
 * Factory function to create a new JobRepository instance
 *
 * @param {Object} [options={}] - Configuration options
 * @param {boolean} [options.autoInitialize=false] - Auto-initialize on construction
 * @returns {JobRepository} New JobRepository instance
 *
 * @example
 * // Create a custom instance for testing
 * const testRepo = createJobRepository({ autoInitialize: true });
 *
 * @example
 * // Create instance with custom configuration
 * const customRepo = createJobRepository();
 * await customRepo.initialize();
 */
export function createJobRepository(options = {}) {
  return new JobRepository(options);
}

// Export singleton instance for convenience and backward compatibility
export const jobRepository = createJobRepository();

// Export class for advanced use cases
export { JobRepository };

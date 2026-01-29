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
  getJobs as dbGetJobs,
  getAllJobs as dbGetAllJobs,
  getJobCounts as dbGetJobCounts,
  getLastJob as dbGetLastJob,
  getAllPipelineStats as dbGetAllPipelineStats,
  bulkImportJobs as dbBulkImportJobs,
  closeDatabase as dbCloseDatabase,
} from './database.js';
import { createComponentLogger } from '../utils/logger.js';

const logger = createComponentLogger('JobRepository');

/**
 * Job Repository - abstracts database access for job operations
 */
class JobRepository {
  constructor() {
    this._initialized = false;
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
    const jobs = dbGetAllJobs({ limit: 1 });
    return jobs.find(j => j.id === id) || null;
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
   */
  close() {
    dbCloseDatabase();
    this._initialized = false;
    logger.debug('JobRepository closed');
  }
}

// Export singleton instance for convenience
export const jobRepository = new JobRepository();

// Export class for testing or custom instances
export { JobRepository };

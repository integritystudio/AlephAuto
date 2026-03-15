/**
 * Job Repository
 *
 * Provides a clean abstraction layer over database operations for jobs.
 * Implements the repository pattern to decouple business logic from data access.
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
  bulkCancelJobsByPipeline as dbBulkCancelJobsByPipeline,
  closeDatabase as dbCloseDatabase,
} from './database.ts';
import type {
  ParsedJob,
  ParsedJobError,
  SaveJobInput,
  JobQueryOptions,
  AllJobsQueryOptions,
  JobCounts,
  PipelineStats,
  BulkImportResult,
  BulkImportJob,
} from './database.ts';
import type { JobStatus } from '#api/types/job-status.ts';
import { createComponentLogger, logError } from '../utils/logger.ts';

const logger = createComponentLogger('JobRepository');

interface JobRepositoryOptions {
  autoInitialize?: boolean;
}

/**
 * Abstraction over job-related persistence operations.
 */
class JobRepository {
  private _initialized: boolean;
  private _options: JobRepositoryOptions;

  /**
   * Creates a repository instance.
   *
   * @param options Repository options.
   */
  constructor(options: JobRepositoryOptions = {}) {
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
   * Initializes the underlying database connection once.
   */
  async initialize(): Promise<void> {
    if (this._initialized) return;

    await initDatabase();
    this._initialized = true;
    logger.debug('JobRepository initialized');
  }

  /**
   * Persists a single job record.
   *
   * @param job Job payload to insert.
   */
  async saveJob(job: SaveJobInput): Promise<void> {
    await dbSaveJob(job);
  }

  /**
   * Retrieves a job by unique identifier.
   *
   * @param id Job id.
   * @returns The matching job or `null` when not found.
   */
  async getJob(id: string): Promise<ParsedJob | null> {
    return dbGetJobById(id);
  }

  /**
   * Retrieves jobs for a pipeline, optionally with pagination and filters.
   *
   * @param pipelineId Pipeline identifier.
   * @param filters Query options.
   * @returns Either a job list or paginated shape with `jobs` and `total`.
   */
  async getJobs(pipelineId: string, filters: JobQueryOptions = {}): Promise<ParsedJob[] | { jobs: ParsedJob[]; total: number }> {
    return dbGetJobs(pipelineId, filters);
  }

  /**
   * Retrieves jobs across all pipelines.
   *
   * @param filters Global query options.
   * @returns Matching jobs.
   */
  async getAllJobs(filters: AllJobsQueryOptions = {}): Promise<ParsedJob[]> {
    return dbGetAllJobs(filters);
  }

  /**
   * Counts jobs matching the provided status filter.
   *
   * @param filters Optional status constraint.
   * @returns Number of matching jobs.
   */
  async getJobCount(filters: { status?: string } = {}): Promise<number> {
    return dbGetJobCount(filters);
  }

  /**
   * Retrieves aggregated status counts for a pipeline.
   *
   * @param pipelineId Pipeline identifier.
   * @returns Job counts by status or `null` when unavailable.
   */
  async getJobCounts(pipelineId: string): Promise<JobCounts | null> {
    return dbGetJobCounts(pipelineId);
  }

  /**
   * Retrieves the latest job for a pipeline.
   *
   * @param pipelineId Pipeline identifier.
   * @returns Latest job or `null` when none exists.
   */
  async getLastJob(pipelineId: string): Promise<ParsedJob | null> {
    return dbGetLastJob(pipelineId);
  }

  /**
   * Retrieves computed statistics for all pipelines.
   *
   * @returns Pipeline statistics records.
   */
  async getAllPipelineStats(): Promise<PipelineStats[]> {
    return dbGetAllPipelineStats();
  }

  /**
   * Imports multiple jobs in one operation.
   *
   * @param jobs Job entries to import.
   * @returns Import summary with success and error counts.
   */
  async bulkImport(jobs: BulkImportJob[]): Promise<BulkImportResult> {
    return dbBulkImportJobs(jobs);
  }

  /**
   * Bulk-cancels non-terminal jobs for a specific pipeline.
   *
   * @param pipelineId Pipeline identifier.
   * @param statuses Status values to cancel (defaults to queued).
   * @returns Number of cancelled jobs.
   */
  async cancelPipelineJobs(pipelineId: string, statuses: JobStatus[] = ['queued']): Promise<number> {
    return dbBulkCancelJobsByPipeline(pipelineId, statuses);
  }

  /**
   * Closes the database connection when initialized.
   */
  async close(): Promise<void> {
    if (!this._initialized) {
      logger.debug('JobRepository already closed or not initialized');
      return;
    }

    await dbCloseDatabase();
    this._initialized = false;
    logger.debug('JobRepository closed');
  }

  /**
   * Resets repository lifecycle state and closes resources if needed.
   */
  async reset(): Promise<void> {
    if (this._initialized) {
      await this.close(); // also sets _initialized = false
    }
    logger.debug('JobRepository reset');
  }
}

/**
 * Creates a new job repository instance.
 *
 * @param options Repository options.
 * @returns A repository instance.
 */
export function createJobRepository(options: JobRepositoryOptions = {}): JobRepository {
  return new JobRepository(options);
}

// Export singleton instance for convenience and backward compatibility
export const jobRepository = createJobRepository();

// Export class for advanced use cases
export { JobRepository };

// Re-export types for consumers
export type { ParsedJob, ParsedJobError, SaveJobInput, JobQueryOptions, AllJobsQueryOptions, JobCounts, PipelineStats, BulkImportResult };

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
import { createComponentLogger, logError } from '../utils/logger.ts';

const logger = createComponentLogger('JobRepository');

interface JobRepositoryOptions {
  autoInitialize?: boolean;
}

/**
 * Job Repository - abstracts database access for job operations
 */
class JobRepository {
  private _initialized: boolean;
  private _options: JobRepositoryOptions;

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

  async initialize(): Promise<void> {
    if (this._initialized) return;

    await initDatabase();
    this._initialized = true;
    logger.debug('JobRepository initialized');
  }

  saveJob(job: SaveJobInput): void {
    dbSaveJob(job);
  }

  getJob(id: string): ParsedJob | null {
    return dbGetJobById(id);
  }

  getJobs(pipelineId: string, filters: JobQueryOptions = {}): ParsedJob[] | { jobs: ParsedJob[]; total: number } {
    return dbGetJobs(pipelineId, filters);
  }

  getAllJobs(filters: AllJobsQueryOptions = {}): ParsedJob[] {
    return dbGetAllJobs(filters);
  }

  getJobCount(filters: { status?: string } = {}): number {
    return dbGetJobCount(filters);
  }

  getJobCounts(pipelineId: string): JobCounts | null {
    return dbGetJobCounts(pipelineId);
  }

  getLastJob(pipelineId: string): ParsedJob | null {
    return dbGetLastJob(pipelineId);
  }

  getAllPipelineStats(): PipelineStats[] {
    return dbGetAllPipelineStats();
  }

  bulkImport(jobs: BulkImportJob[]): BulkImportResult {
    return dbBulkImportJobs(jobs);
  }

  close(): void {
    if (!this._initialized) {
      logger.debug('JobRepository already closed or not initialized');
      return;
    }

    dbCloseDatabase();
    this._initialized = false;
    logger.debug('JobRepository closed');
  }

  reset(): void {
    if (this._initialized) {
      this.close();
    }
    this._initialized = false;
    logger.debug('JobRepository reset');
  }
}

/**
 * Factory function to create a new JobRepository instance
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

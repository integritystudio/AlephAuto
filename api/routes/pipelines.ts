/**
 * Pipeline Routes (TypeScript with Zod validation)
 *
 * API endpoints for fetching pipeline details and job history.
 * All endpoints include type validation and Sentry error tracking.
 *
 * @module api/routes/pipelines
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import { validateQuery, validateRequest } from '../middleware/validation.ts';
import {
  JobQueryParamsSchema,
  ManualTriggerRequestSchema,
  type JobQueryParams,
  type JobsListResponse,
  type JobDetails,
  type ManualTriggerRequest,
  type ManualTriggerResponse,
  createErrorResponse
} from '../types/pipeline-requests.ts';
import { createComponentLogger } from '../../sidequest/utils/logger.ts';
import * as Sentry from '@sentry/node';
import { jobRepository } from '../../sidequest/core/job-repository.js';
import { workerRegistry } from '../utils/worker-registry.js';

const router = express.Router();
const logger = createComponentLogger('PipelineRoutes');

/**
 * GET /api/sidequest/pipeline-runners/:pipelineId/jobs
 * Fetch job history for a specific pipeline
 *
 * Query Parameters:
 * - status (optional): Filter by job status (queued, running, completed, failed)
 * - limit (optional): Max jobs to return (default: 10, max: 100)
 * - offset (optional): Pagination offset (default: 0)
 * - tab (optional): UI tab context (recent, failed, all)
 *
 * Response: JobsListResponse with jobs array
 */
router.get(
  '/:pipelineId/jobs',
  validateQuery(JobQueryParamsSchema), // Automatic Zod validation
  async (
    req: Request<{ pipelineId: string }>,
    res: Response<JobsListResponse>,
    next: NextFunction
  ) => {
    const { pipelineId } = req.params;
    // Use validatedQuery from validation middleware
    const { status, limit, offset, tab } = (req as any).validatedQuery as JobQueryParams;

    try {
      logger.info({
        pipelineId,
        status,
        limit,
        offset,
        tab
      }, 'Fetching pipeline jobs');

      // Fetch jobs from data source (now returns {jobs, total})
      const result = await fetchJobsForPipeline(pipelineId, {
        status,
        limit,
        offset,
        tab
      });

      const response: JobsListResponse = {
        pipelineId,
        jobs: result.jobs,
        total: result.total, // FIXED: Use database total, not page size
        hasMore: result.jobs.length === limit,
        timestamp: new Date().toISOString()
      };

      logger.info({
        pipelineId,
        jobCount: result.jobs.length,
        totalCount: result.total,
        hasMore: response.hasMore
      }, 'Successfully fetched pipeline jobs');

      res.json(response);
    } catch (error) {
      logger.error({
        error,
        pipelineId,
        queryParams: { status, limit, offset, tab }
      }, 'Failed to fetch pipeline jobs');

      Sentry.captureException(error, {
        tags: {
          component: 'PipelineAPI',
          endpoint: '/api/sidequest/pipeline-runners/:id/jobs',
          pipelineId
        },
        extra: {
          queryParams: { status, limit, offset, tab }
        }
      });

      next(error);
    }
  }
);

/**
 * POST /api/sidequest/pipeline-runners/:pipelineId/trigger
 * Manually trigger a pipeline job
 *
 * Request Body:
 * - parameters (optional): Job-specific parameters
 *
 * Response: ManualTriggerResponse with new job ID
 */
router.post(
  '/:pipelineId/trigger',
  validateRequest(ManualTriggerRequestSchema), // Automatic Zod validation
  async (
    req: Request<{ pipelineId: string }, {}, ManualTriggerRequest>,
    res: Response<ManualTriggerResponse>,
    next: NextFunction
  ) => {
    const { pipelineId } = req.params;
    const { parameters = {} } = req.body;

    try {
      logger.info({
        pipelineId,
        parameters
      }, 'Manually triggering pipeline job');

      // Trigger the job
      const jobId = await triggerPipelineJob(pipelineId, parameters);

      const response: ManualTriggerResponse = {
        jobId,
        pipelineId,
        status: 'queued',
        timestamp: new Date().toISOString()
      };

      logger.info({
        pipelineId,
        jobId
      }, 'Successfully triggered pipeline job');

      res.status(201).json(response);
    } catch (error) {
      logger.error({
        error,
        pipelineId,
        parameters
      }, 'Failed to trigger pipeline job');

      Sentry.captureException(error, {
        tags: {
          component: 'PipelineAPI',
          endpoint: '/api/sidequest/pipeline-runners/:id/trigger',
          pipelineId
        },
        extra: {
          parameters
        }
      });

      next(error);
    }
  }
);

/**
 * Helper: Fetch jobs for a pipeline with total count
 *
 * @param pipelineId - Pipeline identifier
 * @param options - Query options (status, limit, offset, tab)
 * @returns Object with jobs array and total count
 */
async function fetchJobsForPipeline(
  pipelineId: string,
  options: JobQueryParams
): Promise<{ jobs: JobDetails[]; total: number }> {
  const { status, limit, offset, tab } = options;

  // Query SQLite database with total count (FIXED: Now includes actual DB count)
  const dbResult = jobRepository.getJobs(pipelineId, {
    status,
    limit: limit ?? 10,
    offset: offset ?? 0,
    tab,
    includeTotal: true // Request total count from database
  });

  // Extract jobs and total from database result
  const dbJobs = (dbResult as any).jobs || [];
  const totalCount = (dbResult as any).total || 0;

  // Map database schema to API response schema
  // Include all fields needed by the dashboard modal
  const jobs: JobDetails[] = dbJobs.map((dbJob: any) => {
    const job: JobDetails = {
      id: dbJob.id,
      pipelineId: dbJob.pipelineId,
      status: dbJob.status,
      startTime: dbJob.startedAt || dbJob.createdAt,
      createdAt: dbJob.createdAt, // Needed for timeline display
    };

    // Add optional fields only if they exist
    if (dbJob.data) {
      job.parameters = dbJob.data;
    }

    // Add endTime and duration if job is completed
    if (dbJob.completedAt) {
      job.endTime = dbJob.completedAt;

      // Calculate duration in milliseconds
      const start = new Date(dbJob.startedAt || dbJob.createdAt).getTime();
      const end = new Date(dbJob.completedAt).getTime();
      job.duration = end - start;
    }

    // Add result data
    if (dbJob.result) {
      job.result = { ...dbJob.result };
    }

    // Add error at top level (modal checks job.error, not job.result.error)
    if (dbJob.error) {
      job.error = dbJob.error;
    }

    // Add git info if available (needed for git workflow display in modal)
    if (dbJob.git) {
      job.git = dbJob.git;
    }

    return job;
  });

  logger.debug({
    pipelineId,
    returned: jobs.length,
    total: totalCount,
    status,
    tab
  }, 'Job query results from database');

  return { jobs, total: totalCount };
}

/**
 * Helper: Trigger a manual job for a pipeline
 *
 * @param pipelineId - Pipeline identifier
 * @param parameters - Job parameters
 * @returns New job ID
 * @throws {Error} If pipeline is unknown or worker creation fails
 */
async function triggerPipelineJob(
  pipelineId: string,
  parameters: Record<string, unknown>
): Promise<string> {
  // Validate pipeline is supported
  if (!workerRegistry.isSupported(pipelineId)) {
    throw new Error(
      `Unknown pipeline: ${pipelineId}. ` +
      `Supported pipelines: ${workerRegistry.getSupportedPipelines().join(', ')}`
    );
  }

  logger.info({
    pipelineId,
    parameters
  }, 'Triggering pipeline job');

  // Get or create worker instance
  const worker = await workerRegistry.getWorker(pipelineId);

  // Generate job ID with pipeline prefix
  const timestamp = Date.now();
  const jobId = `${pipelineId}-manual-${timestamp}`;

  // Create job with worker
  const job = worker.createJob(jobId, {
    ...parameters,
    triggeredBy: 'api',
    triggeredAt: new Date().toISOString()
  });

  logger.info({
    pipelineId,
    jobId,
    status: job.status
  }, 'Pipeline job created successfully');

  return job.id;
}

export default router;

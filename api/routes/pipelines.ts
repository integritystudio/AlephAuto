/**
 * Pipeline Routes (TypeScript with Zod validation)
 *
 * API endpoints for fetching pipeline details and job history.
 * All endpoints include type validation and Sentry error tracking.
 *
 * @module api/routes/pipelines
 */

import express, { Request, Response, NextFunction } from 'express';
import { validateQuery, validateRequest } from '../middleware/validation.js';
import {
  JobQueryParamsSchema,
  ManualTriggerRequestSchema,
  type JobQueryParams,
  type JobsListResponse,
  type JobDetails,
  type ManualTriggerRequest,
  type ManualTriggerResponse,
  createErrorResponse
} from '../types/pipeline-requests.js';
import { createComponentLogger } from '../../sidequest/utils/logger.js';
import * as Sentry from '@sentry/node';
import { getJobs } from '../../sidequest/core/database.js';

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
    req: Request<{ pipelineId: string }, {}, {}, JobQueryParams>,
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

      // Fetch jobs from data source
      const jobs = await fetchJobsForPipeline(pipelineId, {
        status,
        limit,
        offset,
        tab
      });

      const response: JobsListResponse = {
        pipelineId,
        jobs,
        total: jobs.length,
        hasMore: jobs.length === limit,
        timestamp: new Date().toISOString()
      };

      logger.info({
        pipelineId,
        jobCount: jobs.length,
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
 * Helper: Fetch jobs for a pipeline
 *
 * @param pipelineId - Pipeline identifier
 * @param options - Query options (status, limit, offset, tab)
 * @returns Array of job details
 */
async function fetchJobsForPipeline(
  pipelineId: string,
  options: JobQueryParams
): Promise<JobDetails[]> {
  const { status, limit, offset, tab } = options;

  // Fetch jobs from SQLite database
  const dbJobs = getJobs(pipelineId, {
    status,
    limit: limit ?? 10,
    offset: offset ?? 0,
    tab
  });

  // Map database schema to API response schema
  const jobs: JobDetails[] = dbJobs.map(dbJob => {
    const job: JobDetails = {
      id: dbJob.id,
      pipelineId: dbJob.pipelineId,
      status: dbJob.status,
      startTime: dbJob.startedAt || dbJob.createdAt,
      parameters: dbJob.data || {},
    };

    // Add endTime and duration if job is completed
    if (dbJob.completedAt) {
      job.endTime = dbJob.completedAt;

      // Calculate duration in milliseconds
      const start = new Date(dbJob.startedAt || dbJob.createdAt).getTime();
      const end = new Date(dbJob.completedAt).getTime();
      job.duration = end - start;
    }

    // Add result if available
    if (dbJob.result) {
      job.result = dbJob.result;
    }

    // Add error if job failed
    if (dbJob.error) {
      job.result = {
        ...job.result,
        error: dbJob.error
      };
    }

    return job;
  });

  logger.debug({
    pipelineId,
    returned: jobs.length,
    status,
    tab
  }, 'Job query results from database');

  return jobs;
}

/**
 * Helper: Trigger a manual job for a pipeline
 *
 * @param pipelineId - Pipeline identifier
 * @param parameters - Job parameters
 * @returns New job ID
 */
async function triggerPipelineJob(
  pipelineId: string,
  parameters: Record<string, unknown>
): Promise<string> {
  // TODO: Implement actual job triggering with worker
  // For now, generate a mock job ID

  const jobId = `job-${Date.now()}`;

  logger.debug({
    pipelineId,
    jobId,
    parameters
  }, 'Generated new job ID');

  // In production, this would:
  // 1. Validate pipeline exists
  // 2. Create job in queue/database
  // 3. Notify worker to start processing
  // 4. Emit WebSocket event for real-time updates

  return jobId;
}

export default router;

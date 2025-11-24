/**
 * Pipeline Routes (TypeScript with Zod validation)
 *
 * API endpoints for fetching pipeline details and job history.
 * All endpoints include type validation and Sentry error tracking.
 *
 * @module api/routes/pipelines
 */
import express from 'express';
import { validateQuery, validateRequest } from '../middleware/validation.js';
import { JobQueryParamsSchema, ManualTriggerRequestSchema } from '../types/pipeline-requests.js';
import { createComponentLogger } from '../../sidequest/utils/logger.js';
import { worker } from './scans.js';
import * as Sentry from '@sentry/node';
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
router.get('/:pipelineId/jobs', validateQuery(JobQueryParamsSchema), // Automatic Zod validation
async (req, res, next) => {
    const { pipelineId } = req.params;
    // Use validatedQuery from validation middleware
    const { status, limit, offset, tab } = req.validatedQuery;
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
        const response = {
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
    }
    catch (error) {
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
});
/**
 * POST /api/sidequest/pipeline-runners/:pipelineId/trigger
 * Manually trigger a pipeline job
 *
 * Request Body:
 * - parameters (optional): Job-specific parameters
 *
 * Response: ManualTriggerResponse with new job ID
 */
router.post('/:pipelineId/trigger', validateRequest(ManualTriggerRequestSchema), // Automatic Zod validation
async (req, res, next) => {
    const { pipelineId } = req.params;
    const { parameters = {} } = req.body;
    try {
        logger.info({
            pipelineId,
            parameters
        }, 'Manually triggering pipeline job');
        // Trigger the job
        const jobId = await triggerPipelineJob(pipelineId, parameters);
        const response = {
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
    }
    catch (error) {
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
});
/**
 * Helper: Fetch jobs for a pipeline
 *
 * @param pipelineId - Pipeline identifier
 * @param options - Query options (status, limit, offset, tab)
 * @returns Array of job details
 */
async function fetchJobsForPipeline(pipelineId, options) {
    const { status, limit, offset, tab } = options;

    // Get real jobs from worker
    const currentJobs = worker.getAllJobs();
    const historyJobs = worker.jobHistory || [];

    // Combine current and historical jobs, avoiding duplicates
    const allJobsMap = new Map();

    // Add history jobs first (older)
    for (const job of historyJobs) {
        allJobsMap.set(job.id, formatJob(job, pipelineId));
    }

    // Add/update with current jobs (newer state)
    for (const job of currentJobs) {
        allJobsMap.set(job.id, formatJob(job, pipelineId));
    }

    // Convert to array and sort by creation time (newest first)
    let allJobs = Array.from(allJobsMap.values())
        .sort((a, b) => new Date(b.startTime || b.createdAt) - new Date(a.startTime || a.createdAt));

    // Filter by status if provided
    let filteredJobs = status
        ? allJobs.filter(job => job.status === status)
        : allJobs;

    // Filter by tab context
    if (tab === 'failed') {
        filteredJobs = filteredJobs.filter(job => job.status === 'failed');
    }
    else if (tab === 'recent') {
        filteredJobs = filteredJobs.slice(0, 10);
    }

    // Apply pagination
    const paginatedJobs = filteredJobs.slice(offset, offset + limit);

    logger.debug({
        pipelineId,
        total: allJobs.length,
        filtered: filteredJobs.length,
        returned: paginatedJobs.length
    }, 'Job query results');

    return paginatedJobs;
}

/**
 * Format a job object for API response
 */
function formatJob(job, pipelineId) {
    const duration = job.completedAt && job.startedAt
        ? new Date(job.completedAt) - new Date(job.startedAt)
        : null;

    return {
        id: job.id,
        pipelineId,
        status: job.status,
        startTime: job.startedAt ? new Date(job.startedAt).toISOString() : null,
        endTime: job.completedAt ? new Date(job.completedAt).toISOString() : null,
        createdAt: job.createdAt ? new Date(job.createdAt).toISOString() : null,
        duration,
        parameters: job.data || {},
        result: job.result || null,
        error: job.error || null,
        git: job.git || null
    };
}
/**
 * Helper: Trigger a manual job for a pipeline
 *
 * @param pipelineId - Pipeline identifier
 * @param parameters - Job parameters
 * @returns New job ID
 */
async function triggerPipelineJob(pipelineId, parameters) {
    if (pipelineId !== 'duplicate-detection') {
        throw new Error(`Unknown pipeline: ${pipelineId}`);
    }

    // Create job via worker
    const jobId = `manual-${Date.now()}`;

    // Schedule scan with the worker
    if (parameters.repositoryPath) {
        const path = await import('path');
        worker.scheduleScan('intra-project', [{
            name: path.basename(parameters.repositoryPath),
            path: parameters.repositoryPath
        }]);
    } else if (parameters.repositoryPaths && Array.isArray(parameters.repositoryPaths)) {
        const path = await import('path');
        const repositories = parameters.repositoryPaths.map(repoPath => ({
            name: path.basename(repoPath),
            path: repoPath
        }));
        worker.scheduleScan('inter-project', repositories);
    } else {
        throw new Error('Either repositoryPath or repositoryPaths is required');
    }

    logger.info({
        pipelineId,
        jobId,
        parameters
    }, 'Triggered pipeline job');

    return jobId;
}
export default router;

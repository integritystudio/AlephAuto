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
import { JobQueryParamsSchema, ManualTriggerRequestSchema, PipelineDocsParamsSchema, PipelineHtmlParamsSchema } from '../types/pipeline-requests.js';
import { createComponentLogger } from '../../sidequest/utils/logger.js';
import { worker } from './scans.js';
import * as Sentry from '@sentry/node';
import { getJobs, getJobCounts } from '../../sidequest/core/database.js';
import { getPipelineName } from '../../sidequest/utils/pipeline-names.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
const router = express.Router();
const logger = createComponentLogger('PipelineRoutes');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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
        // Fetch jobs from data source (now returns {jobs, total})
        const result = await fetchJobsForPipeline(pipelineId, {
            status,
            limit,
            offset,
            tab
        });
        const response = {
            pipelineId,
            jobs: result.jobs,
            total: result.total,  // FIXED E6: Use database total, not page size
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

    try {
        // Query SQLite database with total count (FIXED E6: Now includes actual DB count)
        const dbResult = getJobs(pipelineId, {
            status,
            limit,
            offset,
            tab,
            includeTotal: true  // Request total count from database
        });

        // Extract jobs and total from database result
        const dbJobs = dbResult.jobs || [];
        const totalCount = dbResult.total || 0;

        // Also get current in-memory jobs (not yet persisted)
        const currentJobs = worker.getAllJobs();

        // Combine: in-memory jobs take precedence (newer state)
        const allJobsMap = new Map();

        // Add database jobs first
        for (const job of dbJobs) {
            allJobsMap.set(job.id, formatJobFromDb(job));
        }

        // Add/update with current in-memory jobs
        for (const job of currentJobs) {
            allJobsMap.set(job.id, formatJob(job, pipelineId));
        }

        // Convert to array and sort by creation time (newest first)
        let allJobs = Array.from(allJobsMap.values())
            .sort((a, b) => new Date(b.startTime || b.createdAt).getTime() - new Date(a.startTime || a.createdAt).getTime());

        // Filter by status if provided (for in-memory jobs)
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

        // Apply pagination (limit already applied in DB query, but need for combined results)
        const paginatedJobs = filteredJobs.slice(0, limit);

        logger.debug({
            pipelineId,
            dbJobs: dbJobs.length,
            memoryJobs: currentJobs.length,
            totalCount,
            returned: paginatedJobs.length
        }, 'Job query results');

        // Return both jobs and total count
        return { jobs: paginatedJobs, total: totalCount };
    } catch (err) {
        logger.error({ error: err.message, pipelineId }, 'Failed to fetch jobs from database, falling back to memory');

        // Fallback to in-memory only
        const currentJobs = worker.getAllJobs();
        const historyJobs = worker.jobHistory || [];

        const allJobs = [...historyJobs, ...currentJobs]
            .map(job => formatJob(job, pipelineId))
            .sort((a, b) => new Date(b.startTime || b.createdAt).getTime() - new Date(a.startTime || a.createdAt).getTime());

        const paginatedJobs = allJobs.slice(offset, offset + limit);

        // Return with total count (use all jobs length as estimate)
        return { jobs: paginatedJobs, total: allJobs.length };
    }
}

/**
 * Format a job from database for API response
 * Only includes fields defined in JobDetailsSchema to pass strict validation
 */
function formatJobFromDb(job) {
    const duration = job.completedAt && job.startedAt
        ? new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()
        : null;

    const formatted = {
        id: job.id,
        pipelineId: job.pipelineId,
        status: job.status,
        startTime: job.startedAt || job.createdAt
    };

    // Add optional fields only if they exist
    if (job.completedAt) {
        formatted.endTime = job.completedAt;
    }

    if (duration !== null) {
        formatted.duration = duration;
    }

    if (job.data) {
        formatted.parameters = job.data;
    }

    // Build result object from job.result and job.error
    if (job.result || job.error) {
        formatted.result = {};

        // Merge result data
        if (job.result) {
            Object.assign(formatted.result, job.result);
        }

        // Add error message if job failed
        if (job.error) {
            if (typeof job.error === 'object' && job.error.message) {
                formatted.result.error = job.error.message;
            } else if (typeof job.error === 'string') {
                formatted.result.error = job.error;
            }
        }
    }

    return formatted;
}

/**
 * Format a job object for API response
 */
function formatJob(job, pipelineId) {
    const duration = job.completedAt && job.startedAt
        ? new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()
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

/**
 * GET /api/pipelines/:pipelineId/docs
 * Fetch documentation for a specific pipeline
 *
 * Response: PipelineDocsResponse with markdown content
 */
router.get('/:pipelineId/docs', async (req, res, next) => {
    const { pipelineId } = req.params;

    try {
        // Validate pipelineId
        const validatedParams = PipelineDocsParamsSchema.parse({ pipelineId });

        logger.info({ pipelineId }, 'Fetching pipeline documentation');

        // Get pipeline name
        const pipelineName = getPipelineName(pipelineId);

        // Read documentation file
        const docPath = path.join(__dirname, '../../docs/architecture/pipeline-data-flow.md');

        let markdown;
        try {
            markdown = await fs.readFile(docPath, 'utf-8');
        } catch (err) {
            logger.warn({ pipelineId, docPath, error: err.message }, 'Documentation file not found');

            // Return fallback documentation
            markdown = `# ${pipelineName}\n\nDocumentation not yet available for this pipeline.\n\nPipeline ID: ${pipelineId}`;
        }

        const response = {
            pipelineId,
            name: pipelineName,
            markdown,
            timestamp: new Date().toISOString()
        };

        logger.info({ pipelineId, markdownLength: markdown.length }, 'Successfully fetched pipeline documentation');

        res.json(response);
    } catch (error) {
        logger.error({ error, pipelineId }, 'Failed to fetch pipeline documentation');

        Sentry.captureException(error, {
            tags: {
                component: 'PipelineAPI',
                endpoint: '/api/pipelines/:id/docs',
                pipelineId
            }
        });

        // Handle validation errors
        if (error.name === 'ZodError') {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Invalid pipeline ID',
                timestamp: new Date().toISOString()
            });
        }

        next(error);
    }
});

/**
 * GET /api/pipelines/:pipelineId/html
 * Serve HTML report for a specific pipeline job
 *
 * This endpoint resolves the HTML report path for a pipeline job and serves it.
 * It looks for the most recent HTML report matching the pipelineId pattern.
 *
 * Response: HTML file content or 404 if not found
 */
router.get('/:pipelineId/html', async (req, res, next) => {
    const { pipelineId } = req.params;

    try {
        // Validate pipelineId
        const validatedParams = PipelineHtmlParamsSchema.parse({ pipelineId });

        logger.info({ pipelineId }, 'Fetching HTML report for pipeline');

        // Construct HTML report path
        // Pattern: output/reports/{pipelineId}.html or output/reports/{pipelineId}-{date}.html
        const reportsDir = path.join(__dirname, '../../output/reports');

        // Try exact match first
        let htmlPath = path.join(reportsDir, `${pipelineId}.html`);

        try {
            await fs.access(htmlPath);
            logger.info({ pipelineId, htmlPath }, 'Found exact HTML report match');
        } catch (err) {
            // Try to find most recent report matching pattern
            try {
                const files = await fs.readdir(reportsDir);

                // Filter files matching the pipelineId pattern
                const matchingFiles = files.filter(f =>
                    f.startsWith(pipelineId) && f.endsWith('.html')
                ).sort().reverse(); // Most recent first (alphabetical sort works for ISO dates)

                if (matchingFiles.length > 0) {
                    htmlPath = path.join(reportsDir, matchingFiles[0]);
                    logger.info({ pipelineId, htmlPath, matchingFiles: matchingFiles.length }, 'Found matching HTML report');
                } else {
                    logger.warn({ pipelineId, reportsDir }, 'No HTML reports found for pipeline');
                    return res.status(404).json({
                        error: 'Not Found',
                        message: `No HTML report found for pipeline: ${pipelineId}`,
                        timestamp: new Date().toISOString()
                    });
                }
            } catch (readErr) {
                logger.error({ error: readErr, reportsDir }, 'Failed to read reports directory');
                throw readErr;
            }
        }

        // Serve the HTML file
        res.sendFile(htmlPath, (err) => {
            if (err) {
                logger.error({ error: err, htmlPath }, 'Failed to send HTML file');

                Sentry.captureException(err, {
                    tags: {
                        component: 'PipelineAPI',
                        endpoint: '/api/pipelines/:id/html',
                        pipelineId
                    }
                });

                if (!res.headersSent) {
                    res.status(500).json({
                        error: 'Internal Server Error',
                        message: 'Failed to serve HTML report',
                        timestamp: new Date().toISOString()
                    });
                }
            } else {
                logger.info({ pipelineId, htmlPath }, 'Successfully served HTML report');
            }
        });

    } catch (error) {
        logger.error({ error, pipelineId }, 'Failed to fetch HTML report');

        Sentry.captureException(error, {
            tags: {
                component: 'PipelineAPI',
                endpoint: '/api/pipelines/:id/html',
                pipelineId
            }
        });

        // Handle validation errors
        if (error.name === 'ZodError') {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Invalid pipeline ID',
                timestamp: new Date().toISOString()
            });
        }

        next(error);
    }
});

export default router;

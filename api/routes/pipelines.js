/**
 * Pipeline Routes (TypeScript with Zod validation)
 *
 * API endpoints for fetching pipeline details and job history.
 * All endpoints include type validation and Sentry error tracking.
 *
 * @module api/routes/pipelines
 */
import express from 'express';
import { validateQuery, validateRequest } from '../middleware/validation.ts';
import { JobQueryParamsSchema, ManualTriggerRequestSchema, PipelineDocsParamsSchema, PipelineHtmlParamsSchema } from '../types/pipeline-requests.ts';
import { createComponentLogger, logError } from '../../sidequest/utils/logger.js';
import { worker } from './scans.js';
import { workerRegistry } from '../utils/worker-registry.js';
import * as Sentry from '@sentry/node';
import { getJobs, getJobCounts } from '../../sidequest/core/database.js';
import { getPipelineName } from '../../sidequest/utils/pipeline-names.js';
import { JOB_STATUS } from '../types/job-status.ts';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
const router = express.Router();
const logger = createComponentLogger('PipelineRoutes');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory storage for paused pipelines (survives across requests, not restarts)
// In production, this could be persisted to database or Redis
const pausedPipelines = new Set();
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
        logError(logger, error, 'Failed to fetch pipeline jobs', {
            pipelineId,
            queryParams: { status, limit, offset, tab }
        });
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
        logError(logger, error, 'Failed to trigger pipeline job', {
            pipelineId,
            parameters
        });
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
 * POST /api/sidequest/pipeline-runners/:pipelineId/pause
 * Pause job processing for a specific pipeline
 *
 * When paused, no new jobs will be processed (queued jobs remain in queue).
 * Running jobs will complete but no new jobs will start.
 *
 * Response: PauseResponse with pipeline status
 */
router.post('/:pipelineId/pause', async (req, res, next) => {
    const { pipelineId } = req.params;

    try {
        logger.info({ pipelineId }, 'Pausing pipeline');

        // Validate pipeline exists
        if (!workerRegistry.isSupported(pipelineId)) {
            const supported = workerRegistry.getSupportedPipelines().join(', ');
            return res.status(404).json({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: `Unknown pipeline: ${pipelineId}. Supported pipelines: ${supported}`
                },
                timestamp: new Date().toISOString()
            });
        }

        // Check if already paused
        if (pausedPipelines.has(pipelineId)) {
            return res.status(200).json({
                pipelineId,
                status: 'paused',
                message: 'Pipeline was already paused',
                timestamp: new Date().toISOString()
            });
        }

        // Add to paused set
        pausedPipelines.add(pipelineId);

        // Try to pause the worker if it supports it
        try {
            const pipelineWorker = await workerRegistry.getWorker(pipelineId);
            if (typeof pipelineWorker.pause === 'function') {
                await pipelineWorker.pause();
                logger.info({ pipelineId }, 'Worker pause method called');
            } else if (typeof pipelineWorker.setPaused === 'function') {
                pipelineWorker.setPaused(true);
                logger.info({ pipelineId }, 'Worker setPaused(true) called');
            } else {
                logger.info({ pipelineId }, 'Worker does not have pause method, using registry-level pause');
            }
        } catch (workerErr) {
            logger.warn({ pipelineId, error: workerErr.message }, 'Could not access worker for pause, using registry-level pause');
        }

        const response = {
            pipelineId,
            status: 'paused',
            message: 'Pipeline paused successfully. New jobs will not be processed.',
            timestamp: new Date().toISOString()
        };

        logger.info({ pipelineId }, 'Successfully paused pipeline');
        res.json(response);

    } catch (error) {
        logError(logger, error, 'Failed to pause pipeline', { pipelineId });

        Sentry.captureException(error, {
            tags: {
                component: 'PipelineAPI',
                endpoint: '/api/sidequest/pipeline-runners/:id/pause',
                pipelineId
            }
        });

        next(error);
    }
});

/**
 * POST /api/sidequest/pipeline-runners/:pipelineId/resume
 * Resume job processing for a paused pipeline
 *
 * Queued jobs will begin processing again.
 *
 * Response: ResumeResponse with pipeline status
 */
router.post('/:pipelineId/resume', async (req, res, next) => {
    const { pipelineId } = req.params;

    try {
        logger.info({ pipelineId }, 'Resuming pipeline');

        // Validate pipeline exists
        if (!workerRegistry.isSupported(pipelineId)) {
            const supported = workerRegistry.getSupportedPipelines().join(', ');
            return res.status(404).json({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: `Unknown pipeline: ${pipelineId}. Supported pipelines: ${supported}`
                },
                timestamp: new Date().toISOString()
            });
        }

        // Check if already running
        if (!pausedPipelines.has(pipelineId)) {
            return res.status(200).json({
                pipelineId,
                status: 'running',
                message: 'Pipeline was already running',
                timestamp: new Date().toISOString()
            });
        }

        // Remove from paused set
        pausedPipelines.delete(pipelineId);

        // Try to resume the worker if it supports it
        try {
            const pipelineWorker = await workerRegistry.getWorker(pipelineId);
            if (typeof pipelineWorker.resume === 'function') {
                await pipelineWorker.resume();
                logger.info({ pipelineId }, 'Worker resume method called');
            } else if (typeof pipelineWorker.setPaused === 'function') {
                pipelineWorker.setPaused(false);
                logger.info({ pipelineId }, 'Worker setPaused(false) called');
            } else {
                logger.info({ pipelineId }, 'Worker does not have resume method, using registry-level resume');
            }
        } catch (workerErr) {
            logger.warn({ pipelineId, error: workerErr.message }, 'Could not access worker for resume, using registry-level resume');
        }

        const response = {
            pipelineId,
            status: 'running',
            message: 'Pipeline resumed successfully. Queued jobs will begin processing.',
            timestamp: new Date().toISOString()
        };

        logger.info({ pipelineId }, 'Successfully resumed pipeline');
        res.json(response);

    } catch (error) {
        logError(logger, error, 'Failed to resume pipeline', { pipelineId });

        Sentry.captureException(error, {
            tags: {
                component: 'PipelineAPI',
                endpoint: '/api/sidequest/pipeline-runners/:id/resume',
                pipelineId
            }
        });

        next(error);
    }
});

/**
 * GET /api/sidequest/pipeline-runners/:pipelineId/status
 * Get the current status of a pipeline (paused/running)
 *
 * Response: StatusResponse with pipeline status
 */
router.get('/:pipelineId/status', async (req, res, next) => {
    const { pipelineId } = req.params;

    try {
        // Validate pipeline exists
        if (!workerRegistry.isSupported(pipelineId)) {
            const supported = workerRegistry.getSupportedPipelines().join(', ');
            return res.status(404).json({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: `Unknown pipeline: ${pipelineId}. Supported pipelines: ${supported}`
                },
                timestamp: new Date().toISOString()
            });
        }

        const isPaused = pausedPipelines.has(pipelineId);

        // Try to get additional stats from worker
        let workerStats = null;
        try {
            const pipelineWorker = await workerRegistry.getWorker(pipelineId);
            if (typeof pipelineWorker.getStats === 'function') {
                workerStats = pipelineWorker.getStats();
            }
        } catch (workerErr) {
            logger.debug({ pipelineId, error: workerErr.message }, 'Could not get worker stats');
        }

        const response = {
            pipelineId,
            name: getPipelineName(pipelineId),
            status: isPaused ? 'paused' : 'running',
            isPaused,
            ...(workerStats && {
                activeJobs: workerStats.active || 0,
                queuedJobs: workerStats.queued || 0
            }),
            timestamp: new Date().toISOString()
        };

        res.json(response);

    } catch (error) {
        logError(logger, error, 'Failed to get pipeline status', { pipelineId });

        Sentry.captureException(error, {
            tags: {
                component: 'PipelineAPI',
                endpoint: '/api/sidequest/pipeline-runners/:id/status',
                pipelineId
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

        // Get current in-memory jobs from the CORRECT worker for this pipeline
        // FIX: Use workerRegistry instead of hardcoded worker to get pipeline-specific jobs
        let currentJobs = [];
        try {
            if (workerRegistry.isSupported(pipelineId)) {
                const pipelineWorker = await workerRegistry.getWorker(pipelineId);
                currentJobs = pipelineWorker.getAllJobs ? pipelineWorker.getAllJobs() : [];
                logger.debug({ pipelineId, inMemoryJobCount: currentJobs.length }, 'Fetched in-memory jobs from registry worker');
            }
        } catch (workerErr) {
            // Fallback: use the legacy worker for backward compatibility
            logger.debug({ pipelineId, error: workerErr.message }, 'Could not get registry worker, using legacy fallback');
            currentJobs = worker.getAllJobs();
        }

        // Combine: in-memory jobs take precedence (newer state)
        const allJobsMap = new Map();

        // Add database jobs first
        for (const job of dbJobs) {
            allJobsMap.set(job.id, formatJobFromDb(job));
        }

        // Add/update with current in-memory jobs (only if they match this pipeline)
        for (const job of currentJobs) {
            // Filter: only include jobs that belong to this pipeline
            const jobPipelineId = job.data?.type || job.pipelineId || pipelineId;
            if (jobPipelineId === pipelineId || job.id?.includes(pipelineId)) {
                allJobsMap.set(job.id, formatJob(job, pipelineId));
            }
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
            filteredJobs = filteredJobs.filter(job => job.status === JOB_STATUS.FAILED);
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

        // Fallback to in-memory only - use correct worker from registry
        let currentJobs = [];
        let historyJobs = [];

        try {
            if (workerRegistry.isSupported(pipelineId)) {
                const pipelineWorker = await workerRegistry.getWorker(pipelineId);
                currentJobs = pipelineWorker.getAllJobs ? pipelineWorker.getAllJobs() : [];
                historyJobs = pipelineWorker.jobHistory || [];
            }
        } catch (workerErr) {
            // Last resort: use legacy worker
            logger.debug({ pipelineId, error: workerErr.message }, 'Using legacy worker for fallback');
            currentJobs = worker.getAllJobs();
            historyJobs = worker.jobHistory || [];
        }

        const allJobs = [...historyJobs, ...currentJobs]
            .filter(job => {
                // Filter to only include jobs for this pipeline
                const jobPipelineId = job.data?.type || job.pipelineId || pipelineId;
                return jobPipelineId === pipelineId || job.id?.includes(pipelineId);
            })
            .map(job => formatJob(job, pipelineId))
            .sort((a, b) => new Date(b.startTime || b.createdAt).getTime() - new Date(a.startTime || a.createdAt).getTime());

        const paginatedJobs = allJobs.slice(offset, offset + limit);

        // Return with total count (use all jobs length as estimate)
        return { jobs: paginatedJobs, total: allJobs.length };
    }
}

/**
 * Format a job from database for API response
 * Includes all fields needed by the dashboard modal
 */
function formatJobFromDb(job) {
    const duration = job.completedAt && job.startedAt
        ? new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()
        : null;

    const formatted = {
        id: job.id,
        pipelineId: job.pipelineId,
        status: job.status,
        startTime: job.startedAt || job.createdAt,
        createdAt: job.createdAt // Needed for timeline display in modal
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

    // Add result data (pass through all fields for modal display)
    if (job.result) {
        formatted.result = { ...job.result };
    }

    // Add error at top level (modal checks job.error, not job.result.error)
    if (job.error) {
        formatted.error = job.error;
    }

    // Add git info if available (needed for git workflow display in modal)
    if (job.git) {
        formatted.git = job.git;
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
 * Uses WorkerRegistry singleton to support all pipeline types.
 * Previously only supported duplicate-detection, now supports all 7+ pipelines.
 *
 * @param pipelineId - Pipeline identifier
 * @param parameters - Job parameters
 * @returns New job ID
 */
async function triggerPipelineJob(pipelineId, parameters) {
    // Validate pipeline is supported using WorkerRegistry
    if (!workerRegistry.isSupported(pipelineId)) {
        const supported = workerRegistry.getSupportedPipelines().join(', ');
        throw new Error(`Unknown pipeline: ${pipelineId}. Supported pipelines: ${supported}`);
    }

    logger.info({ pipelineId, parameters }, 'Triggering pipeline job via WorkerRegistry');

    // Get or create worker instance (cached by WorkerRegistry)
    const pipelineWorker = await workerRegistry.getWorker(pipelineId);

    // Generate job ID with pipeline prefix for clarity
    const jobId = `${pipelineId}-manual-${Date.now()}`;

    // Handle pipeline-specific job creation
    // Some pipelines have specialized methods (like duplicate-detection's scheduleScan)
    // while others use the generic createJob pattern
    if (pipelineId === 'duplicate-detection') {
        // Legacy duplicate-detection uses scheduleScan method
        if (parameters.repositoryPath) {
            const pathModule = await import('path');
            pipelineWorker.scheduleScan('intra-project', [{
                name: pathModule.basename(parameters.repositoryPath),
                path: parameters.repositoryPath
            }]);
        } else if (parameters.repositoryPaths && Array.isArray(parameters.repositoryPaths)) {
            const pathModule = await import('path');
            const repositories = parameters.repositoryPaths.map(repoPath => ({
                name: pathModule.basename(repoPath),
                path: repoPath
            }));
            pipelineWorker.scheduleScan('inter-project', repositories);
        } else {
            throw new Error('duplicate-detection requires either repositoryPath or repositoryPaths parameter');
        }
    } else if (pipelineId === 'schema-enhancement') {
        // Schema enhancement requires readmePath for single-file mode
        // or directory for full-scan mode
        if (!parameters.readmePath && !parameters.directory) {
            throw new Error(
                'schema-enhancement requires either readmePath (single file) or directory (full scan) parameter. ' +
                'Example: { "readmePath": "/path/to/README.md" } or { "directory": "/path/to/project" }'
            );
        }

        if (parameters.directory) {
            // Import and use the pipeline for directory scan mode
            const { SchemaEnhancementPipeline } = await import('../../sidequest/pipeline-runners/schema-enhancement-pipeline.js');
            const pipeline = new SchemaEnhancementPipeline({
                dryRun: parameters.dryRun ?? false,
                gitWorkflowEnabled: parameters.gitWorkflowEnabled ?? false
            });
            // Run enhancement asynchronously (don't await - let it run in background)
            pipeline.runEnhancement(parameters.directory).catch(error => {
                logError(logger, error, 'Directory scan failed', { pipelineId, directory: parameters.directory });
            });
        } else {
            // Single file mode - use worker directly
            pipelineWorker.createJob(jobId, {
                type: pipelineId,
                readmePath: parameters.readmePath,
                relativePath: parameters.relativePath || parameters.readmePath,
                context: parameters.context || {},
                triggeredBy: 'api',
                triggeredAt: new Date().toISOString()
            });
        }
    } else if (pipelineId === 'repomix') {
        // Repomix requires sourceDir and relativePath parameters
        const sourceDir = parameters.sourceDir || parameters.repositoryPath;
        const relativePath = parameters.relativePath || parameters.repositoryPath?.split('/').slice(-2).join('/') || 'repo';

        if (!sourceDir) {
            throw new Error('repomix requires sourceDir or repositoryPath parameter');
        }

        // Use the specialized createRepomixJob method
        pipelineWorker.createRepomixJob(sourceDir, relativePath);
    } else {
        // Generic job creation for other pipelines
        // Workers extend SidequestServer which provides createJob method
        if (typeof pipelineWorker.createJob === 'function') {
            pipelineWorker.createJob(jobId, {
                type: pipelineId,
                ...parameters,
                triggeredBy: 'api',
                triggeredAt: new Date().toISOString()
            });
        } else if (typeof pipelineWorker.scheduleJob === 'function') {
            // Some workers use scheduleJob instead
            pipelineWorker.scheduleJob({
                id: jobId,
                type: pipelineId,
                ...parameters,
                triggeredBy: 'api',
                triggeredAt: new Date().toISOString()
            });
        } else if (typeof pipelineWorker.addJob === 'function') {
            // Fallback to addJob if available
            await pipelineWorker.addJob({
                id: jobId,
                data: {
                    type: pipelineId,
                    ...parameters,
                    triggeredBy: 'api',
                    triggeredAt: new Date().toISOString()
                }
            });
        } else {
            // Last resort: emit job:created event directly
            logger.warn({ pipelineId }, 'Worker lacks createJob/scheduleJob/addJob method, using direct job queuing');
            pipelineWorker.emit('job:created', {
                id: jobId,
                status: 'queued',
                data: { type: pipelineId, ...parameters },
                createdAt: new Date()
            });
        }
    }

    logger.info({
        pipelineId,
        jobId,
        parameters
    }, 'Successfully triggered pipeline job');

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
        logError(logger, error, 'Failed to fetch pipeline documentation', { pipelineId });

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
                success: false,
                error: {
                    code: 'INVALID_REQUEST',
                    message: 'Invalid pipeline ID'
                },
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
                        success: false,
                        error: {
                            code: 'NOT_FOUND',
                            message: `No HTML report found for pipeline: ${pipelineId}`
                        },
                        timestamp: new Date().toISOString()
                    });
                }
            } catch (readErr) {
                logError(logger, readErr, 'Failed to read reports directory', { reportsDir });
                throw readErr;
            }
        }

        // Serve the HTML file
        res.sendFile(htmlPath, (err) => {
            if (err) {
                logError(logger, err, 'Failed to send HTML file', { htmlPath });

                Sentry.captureException(err, {
                    tags: {
                        component: 'PipelineAPI',
                        endpoint: '/api/pipelines/:id/html',
                        pipelineId
                    }
                });

                if (!res.headersSent) {
                    res.status(500).json({
                        success: false,
                        error: {
                            code: 'INTERNAL_ERROR',
                            message: 'Failed to serve HTML report'
                        },
                        timestamp: new Date().toISOString()
                    });
                }
            } else {
                logger.info({ pipelineId, htmlPath }, 'Successfully served HTML report');
            }
        });

    } catch (error) {
        logError(logger, error, 'Failed to fetch HTML report', { pipelineId });

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
                success: false,
                error: {
                    code: 'INVALID_REQUEST',
                    message: 'Invalid pipeline ID'
                },
                timestamp: new Date().toISOString()
            });
        }

        next(error);
    }
});

/**
 * Check if a pipeline is currently paused
 * @param {string} pipelineId - Pipeline identifier
 * @returns {boolean} True if pipeline is paused
 */
export function isPipelinePaused(pipelineId) {
    return pausedPipelines.has(pipelineId);
}

/**
 * Get all currently paused pipelines
 * @returns {string[]} Array of paused pipeline IDs
 */
export function getPausedPipelines() {
    return Array.from(pausedPipelines);
}

export default router;

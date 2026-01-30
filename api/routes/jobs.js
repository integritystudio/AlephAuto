/**
 * Jobs API Routes
 * Provides access to job queue across all pipelines
 */

import express from 'express';
import crypto from 'crypto';
import { createComponentLogger } from '../../sidequest/utils/logger.js';
import { jobRepository } from '../../sidequest/core/job-repository.js';
import { workerRegistry } from '../utils/worker-registry.js';
import { config } from '../../sidequest/core/config.js';
import { getPipelineName } from '../../sidequest/utils/pipeline-names.js';
import { isValidJobStatus, JOB_STATUS } from '../types/job-status.js';
import { PAGINATION, VALIDATION, RETRY } from '../../sidequest/core/constants.js';
import { sendError, sendNotFoundError, sendInternalError, ERROR_CODES } from '../utils/api-error.js';
import { bulkImportRateLimiter } from '../middleware/rate-limit.js';

/**
 * Timing-safe string comparison to prevent timing attacks
 * Returns false for mismatched lengths without leaking length info through timing
 *
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {boolean} True if strings are equal
 */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;

  // Use a fixed-length comparison to avoid leaking length information
  // If lengths differ, still compare against a buffer of the expected length
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  // If lengths don't match, compare a against itself to maintain constant time
  // but return false
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

const router = express.Router();
const logger = createComponentLogger('JobsAPI');

/**
 * Validate and sanitize job ID from URL parameter
 * Prevents path traversal and injection attacks
 *
 * @param {string} jobId - Job ID from URL parameter
 * @returns {{ valid: boolean, sanitized?: string, error?: string }}
 */
function validateJobId(jobId) {
  if (!jobId) {
    return { valid: false, error: 'Job ID is required' };
  }

  if (!VALIDATION.JOB_ID_PATTERN.test(jobId)) {
    return {
      valid: false,
      error: 'Invalid job ID format. Must be alphanumeric with hyphens/underscores (max 100 chars)'
    };
  }

  return { valid: true, sanitized: jobId };
}

/**
 * Sanitize pagination parameters to prevent memory issues and NaN propagation
 *
 * @param {string|number} limit - Requested page size
 * @param {string|number} offset - Requested offset
 * @returns {{ limit: number, offset: number }}
 */
function sanitizePaginationParams(limit, offset) {
  // Convert to string to ensure parseInt works correctly
  const limitStr = String(limit);
  const offsetStr = String(offset);

  // Parse and use default if NaN (use ?? to handle 0 correctly)
  const parsedLimit = parseInt(limitStr);
  const parsedOffset = parseInt(offsetStr);

  // Sanitize limit: enforce bounds [1, MAX_LIMIT], default to DEFAULT_LIMIT if NaN
  const limitNum = Math.min(
    Math.max(1, Number.isNaN(parsedLimit) ? PAGINATION.DEFAULT_LIMIT : parsedLimit),
    PAGINATION.MAX_LIMIT
  );

  // Sanitize offset: ensure non-negative, default to 0 if NaN
  const offsetNum = Math.max(0, Number.isNaN(parsedOffset) ? 0 : parsedOffset);

  return { limit: limitNum, offset: offsetNum };
}

/**
 * Safely parse JSON with fallback on error
 * Prevents crashes from corrupted database data
 *
 * @param {string|null} str - JSON string to parse
 * @param {*} fallback - Value to return on parse error
 * @returns {*} Parsed object or fallback
 */
function safeJsonParse(str, fallback = null) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch (error) {
    logger.warn({ error: error.message, preview: str.substring(0, 100) }, 'Failed to parse JSON in API response');
    return fallback;
  }
}

/**
 * GET /api/jobs
 * Get all jobs with optional status filtering
 *
 * Query params:
 * - status: Filter by job status (running, queued, completed, failed)
 * - limit: Number of jobs to return (default: 50)
 * - offset: Pagination offset (default: 0)
 */
router.get('/', (req, res) => {
  try {
    const { status, limit = PAGINATION.DEFAULT_LIMIT, offset = 0 } = req.query;

    // Validate status if provided (use explicit null check, not truthy check)
    if (status !== undefined && status !== null && !isValidJobStatus(status)) {
      return sendError(res, ERROR_CODES.INVALID_STATUS,
        `Invalid status '${status}'. Must be one of: ${Object.values(JOB_STATUS).join(', ')}`, 400);
    }

    // Get all jobs from database
    const allJobs = jobRepository.getAllJobs();

    // Filter by status if provided
    let filteredJobs = allJobs;
    if (status) {
      filteredJobs = allJobs.filter(job => job.status === status);
    }

    // Sanitize pagination parameters to prevent memory issues and NaN propagation
    const { limit: limitNum, offset: offsetNum } = sanitizePaginationParams(limit, offset);
    const paginatedJobs = filteredJobs.slice(offsetNum, offsetNum + limitNum);

    // Format response
    const jobs = paginatedJobs.map(job => ({
      '@type': 'https://schema.org/Action',
      id: job.id,
      pipelineId: job.pipeline_id,
      pipelineName: getPipelineName(job.pipeline_id),
      status: job.status,
      createdAt: job.created_at,
      startedAt: job.started_at,
      completedAt: job.completed_at,
      duration: job.duration,
      progress: job.progress,
      currentOperation: job.current_operation,
      error: job.error,
      errorType: job.error_type,
      retryCount: job.retry_count,
      maxRetries: job.max_retries,
      results: safeJsonParse(job.results)
    }));

    // Calculate pagination (handle edge case of limitNum being 0)
    const page = limitNum > 0 ? Math.floor(offsetNum / limitNum) : 0;
    const hasMore = (offsetNum + limitNum) < filteredJobs.length;

    res.json({
      success: true,
      data: {
        jobs,
        total: filteredJobs.length,
        page,
        limit: limitNum,
        hasMore
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error({ error }, 'Failed to get jobs');
    return sendInternalError(res, 'Failed to retrieve jobs');
  }
});

/**
 * POST /api/jobs/bulk-import
 * Bulk import jobs (for database migration)
 * NOTE: This route MUST be defined before /:jobId routes to avoid matching 'bulk-import' as a jobId
 * Requires MIGRATION_API_KEY environment variable for authentication
 *
 * Request body:
 * {
 *   "jobs": [{ id, pipeline_id, status, created_at, ... }],
 *   "apiKey": "migration-key-from-env"
 * }
 */
router.post('/bulk-import', bulkImportRateLimiter, (req, res) => {
  try {
    const { jobs, apiKey } = req.body;

    // Validate API key for migration operations
    // Note: config.migrationApiKey is loaded via Doppler - never use process.env directly
    const migrationKey = config.migrationApiKey;
    if (!migrationKey) {
      return sendError(res, ERROR_CODES.MIGRATION_NOT_CONFIGURED,
        'Migration API not configured. Set MIGRATION_API_KEY environment variable.', 503);
    }

    if (!timingSafeEqual(apiKey, migrationKey)) {
      logger.warn('Bulk import attempted with invalid API key');
      return sendError(res, ERROR_CODES.UNAUTHORIZED, 'Invalid migration API key', 401);
    }

    // Validate jobs array
    if (!Array.isArray(jobs) || jobs.length === 0) {
      return sendError(res, ERROR_CODES.INVALID_REQUEST,
        'Request body must contain a non-empty "jobs" array', 400);
    }

    // Validate required fields
    const requiredFields = ['id', 'status'];
    for (const job of jobs) {
      for (const field of requiredFields) {
        if (!job[field]) {
          return sendError(res, ERROR_CODES.INVALID_JOB_DATA,
            `Job missing required field: ${field}`, 400);
        }
      }
    }

    logger.info({ jobCount: jobs.length }, 'Starting bulk import');

    // Perform bulk import
    const result = jobRepository.bulkImport(jobs);

    logger.info({
      imported: result.imported,
      skipped: result.skipped,
      errors: result.errors.length
    }, 'Bulk import completed');

    res.json({
      success: true,
      data: {
        imported: result.imported,
        skipped: result.skipped,
        errors: result.errors
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error({ error }, 'Bulk import failed');
    return sendError(res, ERROR_CODES.INTERNAL_ERROR, 'Bulk import failed', 500, { details: error.message });
  }
});

/**
 * GET /api/jobs/:jobId
 * Get details for a specific job
 */
router.get('/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;

    // Validate job ID to prevent path traversal and injection attacks
    const validation = validateJobId(jobId);
    if (!validation.valid) {
      return sendError(res, ERROR_CODES.INVALID_REQUEST, validation.error, 400);
    }

    const allJobs = jobRepository.getAllJobs();
    const job = allJobs.find(j => j.id === validation.sanitized);

    if (!job) {
      return sendNotFoundError(res, 'Job', validation.sanitized);
    }

    res.json({
      success: true,
      data: {
        '@type': 'https://schema.org/Action',
        id: job.id,
        pipelineId: job.pipeline_id,
        pipelineName: getPipelineName(job.pipeline_id),
        status: job.status,
        createdAt: job.created_at,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        duration: job.duration,
        progress: job.progress,
        currentOperation: job.current_operation,
        error: job.error,
        errorType: job.error_type,
        retryCount: job.retry_count,
        maxRetries: job.max_retries,
        results: safeJsonParse(job.results)
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error({ error, jobId: req.params.jobId }, 'Failed to get job details');
    return sendInternalError(res, 'Failed to retrieve job details');
  }
});

/**
 * POST /api/jobs/:jobId/cancel
 * Cancel a running or queued job
 */
router.post('/:jobId/cancel', async (req, res) => {
  try {
    const { jobId } = req.params;

    // Validate job ID to prevent path traversal and injection attacks
    const validation = validateJobId(jobId);
    if (!validation.valid) {
      return sendError(res, ERROR_CODES.INVALID_REQUEST, validation.error, 400);
    }

    const sanitizedJobId = validation.sanitized;
    logger.info({ jobId: sanitizedJobId }, 'Cancelling job');

    // Extract pipeline ID from job ID (format: pipelineId-*)
    const pipelineId = sanitizedJobId.split('-')[0];

    // Get worker for this pipeline
    const worker = await workerRegistry.getWorker(pipelineId);

    if (!worker) {
      return sendError(res, ERROR_CODES.WORKER_NOT_FOUND,
        `No worker found for pipeline: ${pipelineId}`, 404);
    }

    // Cancel the job via worker
    const result = worker.cancelJob(sanitizedJobId);

    if (result.success) {
      logger.info({ jobId: sanitizedJobId }, 'Job cancelled successfully');
      res.json({
        success: true,
        message: result.message || 'Job cancelled successfully',
        timestamp: new Date().toISOString()
      });
    } else {
      logger.warn({ jobId: sanitizedJobId, message: result.message }, 'Failed to cancel job');
      return sendError(res, ERROR_CODES.CANCEL_FAILED,
        result.message || 'Failed to cancel job', 400);
    }

  } catch (error) {
    logger.error({ error, jobId: req.params.jobId }, 'Failed to cancel job');
    return sendInternalError(res, 'Failed to cancel job');
  }
});

/**
 * POST /api/jobs/:jobId/retry
 * Retry a failed job
 */
router.post('/:jobId/retry', async (req, res) => {
  try {
    const { jobId } = req.params;

    // Validate job ID to prevent path traversal and injection attacks
    const validation = validateJobId(jobId);
    if (!validation.valid) {
      return sendError(res, ERROR_CODES.INVALID_REQUEST, validation.error, 400);
    }

    const sanitizedJobId = validation.sanitized;
    logger.info({ jobId: sanitizedJobId }, 'Retrying job');

    // Get job details to determine pipeline
    const allJobs = jobRepository.getAllJobs();
    const job = allJobs.find(j => j.id === sanitizedJobId);

    if (!job) {
      return sendNotFoundError(res, 'Job', sanitizedJobId);
    }

    // Can only retry failed jobs
    if (job.status !== 'failed') {
      return sendError(res, ERROR_CODES.INVALID_STATUS,
        `Cannot retry job with status '${job.status}'. Only failed jobs can be retried.`, 400);
    }

    // Enforce maximum retry count to prevent infinite retry loops
    const currentRetryCount = job.retry_count ?? 0;
    if (currentRetryCount >= RETRY.MAX_MANUAL_RETRIES) {
      return sendError(res, ERROR_CODES.INVALID_REQUEST,
        `Job has already been retried ${currentRetryCount} times (max: ${RETRY.MAX_MANUAL_RETRIES})`, 400);
    }

    const pipelineId = job.pipeline_id;

    // Get worker for this pipeline
    const worker = await workerRegistry.getWorker(pipelineId);

    if (!worker) {
      return sendError(res, ERROR_CODES.WORKER_NOT_FOUND,
        `No worker found for pipeline: ${pipelineId}`, 404);
    }

    // Create a new job with same parameters (retry by creating duplicate)
    const newJobId = `${pipelineId}-retry-${Date.now()}`;

    // Parse job data (parameters) using safe parsing
    const jobData = job.data ? (typeof job.data === 'string' ? safeJsonParse(job.data, {}) : job.data) : {};

    // Create new job with retry metadata
    const newJob = worker.createJob(newJobId, {
      ...jobData,
      retriedFrom: sanitizedJobId,
      retryCount: (job.retry_count ?? 0) + 1,
      triggeredBy: 'retry',
      triggeredAt: new Date().toISOString()
    });

    logger.info({ jobId: sanitizedJobId, newJobId: newJob.id }, 'Job retried successfully');
    res.json({
      success: true,
      message: 'Job retried successfully',
      newJobId: newJob.id,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error({ error, jobId: req.params.jobId }, 'Failed to retry job');
    return sendInternalError(res, 'Failed to retry job');
  }
});

export default router;

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
import { PAGINATION, VALIDATION } from '../../sidequest/core/constants.js';

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

    // Validate status if provided
    if (status && !isValidJobStatus(status)) {
      return res.status(400).json({
        success: false,
        error: {
          message: `Invalid status '${status}'. Must be one of: ${Object.values(JOB_STATUS).join(', ')}`,
          code: 'INVALID_STATUS'
        },
        timestamp: new Date().toISOString()
      });
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
      results: job.results ? JSON.parse(job.results) : null
    }));

    // Calculate pagination
    const page = Math.floor(offsetNum / limitNum);
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
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to retrieve jobs',
        code: 'INTERNAL_ERROR'
      },
      timestamp: new Date().toISOString()
    });
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
router.post('/bulk-import', (req, res) => {
  try {
    const { jobs, apiKey } = req.body;

    // Validate API key for migration operations
    // Note: config.migrationApiKey is loaded via Doppler - never use process.env directly
    const migrationKey = config.migrationApiKey;
    if (!migrationKey) {
      return res.status(503).json({
        success: false,
        error: {
          message: 'Migration API not configured. Set MIGRATION_API_KEY environment variable.',
          code: 'MIGRATION_NOT_CONFIGURED'
        },
        timestamp: new Date().toISOString()
      });
    }

    if (!timingSafeEqual(apiKey, migrationKey)) {
      logger.warn('Bulk import attempted with invalid API key');
      return res.status(401).json({
        success: false,
        error: {
          message: 'Invalid migration API key',
          code: 'UNAUTHORIZED'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Validate jobs array
    if (!Array.isArray(jobs) || jobs.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Request body must contain a non-empty "jobs" array',
          code: 'INVALID_REQUEST'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Validate required fields
    const requiredFields = ['id', 'status'];
    for (const job of jobs) {
      for (const field of requiredFields) {
        if (!job[field]) {
          return res.status(400).json({
            success: false,
            error: {
              message: `Job missing required field: ${field}`,
              code: 'INVALID_JOB_DATA'
            },
            timestamp: new Date().toISOString()
          });
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
    res.status(500).json({
      success: false,
      error: {
        message: 'Bulk import failed',
        code: 'INTERNAL_ERROR',
        details: error.message
      },
      timestamp: new Date().toISOString()
    });
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
      return res.status(400).json({
        success: false,
        error: {
          message: validation.error,
          code: 'INVALID_JOB_ID'
        },
        timestamp: new Date().toISOString()
      });
    }

    const allJobs = jobRepository.getAllJobs();
    const job = allJobs.find(j => j.id === validation.sanitized);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Job not found',
          code: 'NOT_FOUND'
        },
        timestamp: new Date().toISOString()
      });
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
        results: job.results ? JSON.parse(job.results) : null
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error({ error, jobId: req.params.jobId }, 'Failed to get job details');
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to retrieve job details',
        code: 'INTERNAL_ERROR'
      },
      timestamp: new Date().toISOString()
    });
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
      return res.status(400).json({
        success: false,
        error: {
          message: validation.error,
          code: 'INVALID_JOB_ID'
        },
        timestamp: new Date().toISOString()
      });
    }

    const sanitizedJobId = validation.sanitized;
    logger.info({ jobId: sanitizedJobId }, 'Cancelling job');

    // Extract pipeline ID from job ID (format: pipelineId-*)
    const pipelineId = sanitizedJobId.split('-')[0];

    // Get worker for this pipeline
    const worker = await workerRegistry.getWorker(pipelineId);

    if (!worker) {
      return res.status(404).json({
        success: false,
        error: {
          message: `No worker found for pipeline: ${pipelineId}`,
          code: 'WORKER_NOT_FOUND'
        },
        timestamp: new Date().toISOString()
      });
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
      res.status(400).json({
        success: false,
        error: {
          message: result.message || 'Failed to cancel job',
          code: 'CANCEL_FAILED'
        },
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    logger.error({ error, jobId: req.params.jobId }, 'Failed to cancel job');
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to cancel job',
        code: 'INTERNAL_ERROR'
      },
      timestamp: new Date().toISOString()
    });
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
      return res.status(400).json({
        success: false,
        error: {
          message: validation.error,
          code: 'INVALID_JOB_ID'
        },
        timestamp: new Date().toISOString()
      });
    }

    const sanitizedJobId = validation.sanitized;
    logger.info({ jobId: sanitizedJobId }, 'Retrying job');

    // Get job details to determine pipeline
    const allJobs = jobRepository.getAllJobs();
    const job = allJobs.find(j => j.id === sanitizedJobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Job not found',
          code: 'NOT_FOUND'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Can only retry failed jobs
    if (job.status !== 'failed') {
      return res.status(400).json({
        success: false,
        error: {
          message: `Cannot retry job with status '${job.status}'. Only failed jobs can be retried.`,
          code: 'INVALID_STATUS'
        },
        timestamp: new Date().toISOString()
      });
    }

    const pipelineId = job.pipeline_id;

    // Get worker for this pipeline
    const worker = await workerRegistry.getWorker(pipelineId);

    if (!worker) {
      return res.status(404).json({
        success: false,
        error: {
          message: `No worker found for pipeline: ${pipelineId}`,
          code: 'WORKER_NOT_FOUND'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Create a new job with same parameters (retry by creating duplicate)
    const newJobId = `${pipelineId}-retry-${Date.now()}`;

    // Parse job data (parameters)
    const jobData = job.data ? (typeof job.data === 'string' ? JSON.parse(job.data) : job.data) : {};

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
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to retry job',
        code: 'INTERNAL_ERROR'
      },
      timestamp: new Date().toISOString()
    });
  }
});

export default router;

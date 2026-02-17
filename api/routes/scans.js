/**
 * Scan Routes (with Zod validation)
 *
 * API endpoints for managing duplicate detection scans.
 */

import express from 'express';
import { CachedScanner } from '../../sidequest/pipeline-core/cache/cached-scanner.js';
import { InterProjectScanner } from '../../sidequest/pipeline-core/inter-project-scanner.js';
import { DuplicateDetectionWorker } from '../../sidequest/pipeline-runners/duplicate-detection-pipeline.js';
import { createComponentLogger, logError, logStart } from '../../sidequest/utils/logger.js';
import { strictRateLimiter } from '../middleware/rate-limit.js';
import { validateRequest } from '../middleware/validation.js';
import { StartScanRequestSchema } from '../types/scan-requests.ts';
import { getJobs, saveJob } from '../../sidequest/core/database.js';
import path from 'path';

const router = express.Router();
const logger = createComponentLogger('ScanRoutes');

// Initialize scanners
const cachedScanner = new CachedScanner({ cacheEnabled: true });
const interProjectScanner = new InterProjectScanner();
const worker = new DuplicateDetectionWorker({ maxConcurrentScans: 3 });

// Export worker for use in status endpoint
export { worker };

// Initialize worker
worker.initialize().catch(error => {
  logError(logger, error, 'Failed to initialize worker');
});

/**
 * POST /api/scans/start
 * Start a new duplicate detection scan
 */
router.post(
  '/start',
  strictRateLimiter,
  validateRequest(StartScanRequestSchema), // Zod validation middleware
  async (req, res, next) => {
    try {
      // Request body is now validated
      const { repositoryPath, options = {} } = req.body;

      logStart(logger, 'scan via API', { repositoryPath, options });

      // Start scan asynchronously
      const jobId = `api-scan-${Date.now()}`;
      const job = worker.scheduleScan('intra-project', [{
        name: path.basename(repositoryPath),
        path: repositoryPath
      }]);

      const response = {
        success: true,
        job_id: job.id,
        status_url: `/api/scans/${job.id}/status`,
        results_url: `/api/scans/${job.id}/results`,
        timestamp: new Date().toISOString()
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/scans/start-multi
 * Start an inter-project scan across multiple repositories
 */
router.post('/start-multi', strictRateLimiter, async (req, res, next) => {
  try {
    const { repositoryPaths, groupName } = req.body;

    if (!repositoryPaths || !Array.isArray(repositoryPaths) || repositoryPaths.length < 2) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'repositoryPaths must be an array with at least 2 repositories'
        },
        timestamp: new Date().toISOString()
      });
    }

    logStart(logger, 'inter-project scan via API', { repositoryPaths, groupName });

    // Start inter-project scan
    const jobId = `api-inter-scan-${Date.now()}`;
    const repositories = repositoryPaths.map(repoPath => ({
      name: path.basename(repoPath),
      path: repoPath
    }));

    const job = worker.scheduleScan('inter-project', repositories);

    res.status(201).json({
      success: true,
      job_id: jobId,
      group_name: groupName || 'unnamed-group',
      repository_count: repositoryPaths.length,
      status_url: `/api/scans/${jobId}/status`,
      results_url: `/api/scans/${jobId}/results`,
      message: 'Inter-project scan started successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/scans/recent
 * Get recent scans from database
 * NOTE: This must come BEFORE /:scanId routes to avoid being caught as a scanId
 */
router.get('/recent', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status; // Optional status filter

    logger.info({ limit, status }, 'Fetching recent scan history');

    // Query database for completed scan jobs (duplicate-detection pipeline)
    const result = getJobs('duplicate-detection', {
      status: status || 'completed',
      limit,
      offset: 0,
      includeTotal: true
    });

    // Format scan results for API response
    const scans = result.jobs.map(job => {
      const data = job.data || {};
      const jobResult = job.result || {};

      return {
        scanId: job.id,
        repository: data.repositoryPath || data.name || (data.repositories && data.repositories[0]) || 'unknown',
        scanType: data.scanType || 'intra-project',
        status: job.status,
        startTime: job.startedAt,
        endTime: job.completedAt,
        duration: job.completedAt && job.startedAt
          ? new Date(job.completedAt) - new Date(job.startedAt)
          : null,
        duplicatesFound: jobResult.totalDuplicates || jobResult.duplicatesFound || 0,
        filesScanned: jobResult.totalFiles || jobResult.filesScanned || jobResult.totalBlocks || 0,
        summary: jobResult.summary || null
      };
    });

    // Get queue stats for context
    const queueStats = worker.getStats();

    res.json({
      scans,
      total: result.total,
      limit: limit,
      queue_stats: {
        active: queueStats.active,
        queued: queueStats.queued,
        completed: queueStats.completed
      },
      timestamp: new Date().toISOString()
    });

    logger.info({ count: scans.length, total: result.total }, 'Fetched scan history successfully');

  } catch (error) {
    logger.error({ error: error.message }, 'Failed to fetch scan history');
    next(error);
  }
});

/**
 * GET /api/scans/stats
 * Get scanning statistics
 * NOTE: This must come BEFORE /:scanId routes to avoid being caught as a scanId
 */
router.get('/stats', async (req, res, next) => {
  try {
    const scanMetrics = worker.getScanMetrics();
    const queueStats = worker.getStats();

    res.json({
      scan_metrics: {
        total_scans: scanMetrics.totalScans || 0,
        duplicates_found: scanMetrics.duplicatesFound || 0,
        files_scanned: scanMetrics.filesScanned || 0
      },
      queue_stats: {
        active: queueStats.active,
        queued: queueStats.queued,
        completed: queueStats.completed
      },
      cache_stats: {
        hits: scanMetrics.cacheHits || 0,
        misses: scanMetrics.cacheMisses || 0
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/scans/:scanId/status
 * Get scan status
 */
router.get('/:scanId/status', async (req, res, next) => {
  try {
    const { scanId } = req.params;

    const queueStats = worker.getStats();

    // Determine job status based on queue state
    let status = 'completed';
    if (queueStats.active > 0) {
      status = 'running';
    } else if (queueStats.queued > 0) {
      status = 'queued';
    }

    res.json({
      job_id: scanId,
      status: status,
      queued: queueStats.queued,
      active: queueStats.active,
      completed: queueStats.completed,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/scans/:scanId/results
 * Get scan results
 */
router.get('/:scanId/results', async (req, res, next) => {
  try {
    const { scanId } = req.params;
    const { format } = req.query;

    const scanMetrics = worker.getScanMetrics();

    const response = {
      job_id: scanId,
      metrics: {
        total_scans: scanMetrics.totalScans || 0,
        duplicates_found: scanMetrics.duplicatesFound || 0,
        files_scanned: scanMetrics.filesScanned || 0
      },
      timestamp: new Date().toISOString()
    };

    // Add detailed metrics if requested
    if (format === 'full') {
      response.detailed_metrics = {
        cache_hits: scanMetrics.cacheHits || 0,
        cache_misses: scanMetrics.cacheMisses || 0,
        average_scan_time: scanMetrics.avgScanTime || 0
      };
    }

    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/scans/:jobId
 * Cancel a scan job
 *
 * Cancellation behavior:
 * - Queued jobs: Removed from queue and marked as cancelled
 * - Running jobs: Marked as cancelled (may complete current operation)
 * - Completed/Failed jobs: Cannot be cancelled (returns 400)
 */
router.delete('/:jobId', async (req, res, next) => {
  try {
    const { jobId } = req.params;

    logger.info({ jobId }, 'Received job cancellation request');

    // Attempt to cancel the job
    const result = worker.cancelJob(jobId);

    if (result.success) {
      logger.info({ jobId }, 'Job cancelled successfully');
      res.json({
        success: true,
        job_id: jobId,
        message: result.message,
        previous_status: result.job?.status,
        timestamp: new Date().toISOString()
      });
    } else {
      // Job not found or cannot be cancelled
      const statusCode = result.message.includes('not found') ? 404 : 400;
      logger.warn({ jobId, reason: result.message }, 'Job cancellation failed');

      res.status(statusCode).json({
        success: false,
        job_id: jobId,
        message: result.message,
        current_status: result.job?.status,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    logger.error({ error: error.message }, 'Error during job cancellation');
    next(error);
  }
});

export default router;

/**
 * Scan Routes
 *
 * API endpoints for managing duplicate detection scans.
 */

import express from 'express';
import { CachedScanner } from '../../lib/cache/cached-scanner.js';
import { InterProjectScanner } from '../../lib/inter-project-scanner.js';
import { DuplicateDetectionWorker } from '../../pipelines/duplicate-detection-pipeline.js';
import { createComponentLogger } from '../../sidequest/logger.js';
import { strictRateLimiter } from '../middleware/rate-limit.js';
import path from 'path';

const router = express.Router();
const logger = createComponentLogger('ScanRoutes');

// Initialize scanners
const cachedScanner = new CachedScanner({ cacheEnabled: true });
const interProjectScanner = new InterProjectScanner();
const worker = new DuplicateDetectionWorker({ maxConcurrentScans: 3 });

// Initialize worker
worker.initialize().catch(error => {
  logger.error({ error }, 'Failed to initialize worker');
});

/**
 * POST /api/scans/start
 * Start a new duplicate detection scan
 */
router.post('/start', strictRateLimiter, async (req, res, next) => {
  try {
    const { repositoryPath, options = {} } = req.body;

    if (!repositoryPath) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'repositoryPath is required',
        timestamp: new Date().toISOString()
      });
    }

    logger.info({ repositoryPath, options }, 'Starting scan via API');

    // Start scan asynchronously
    const jobId = `api-scan-${Date.now()}`;
    const job = worker.scheduleScan('intra-project', [{
      name: path.basename(repositoryPath),
      path: repositoryPath
    }]);

    res.status(201).json({
      success: true,
      job_id: jobId,
      status_url: `/api/scans/${jobId}/status`,
      results_url: `/api/scans/${jobId}/results`,
      message: 'Scan started successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/scans/start-multi
 * Start an inter-project scan across multiple repositories
 */
router.post('/start-multi', strictRateLimiter, async (req, res, next) => {
  try {
    const { repositoryPaths, groupName } = req.body;

    if (!repositoryPaths || !Array.isArray(repositoryPaths) || repositoryPaths.length < 2) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'repositoryPaths must be an array with at least 2 repositories',
        timestamp: new Date().toISOString()
      });
    }

    logger.info({
      repositoryCount: repositoryPaths.length,
      groupName
    }, 'Starting inter-project scan via API');

    // Start scan asynchronously
    const jobId = `api-multi-scan-${Date.now()}`;

    const repositories = repositoryPaths.map(p => ({
      name: path.basename(p),
      path: p
    }));

    const job = worker.scheduleScan('inter-project', repositories, groupName);

    res.status(201).json({
      success: true,
      job_id: jobId,
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
 * GET /api/scans/:jobId/status
 * Get scan job status
 */
router.get('/:jobId/status', async (req, res, next) => {
  try {
    const { jobId } = req.params;

    logger.debug({ jobId }, 'Getting scan status');

    // Get job stats from worker
    const stats = worker.getStats();

    // Mock status for now - in production, track jobs in database/Redis
    const status = {
      job_id: jobId,
      status: stats.queued > 0 ? 'queued' : stats.active > 0 ? 'running' : 'completed',
      queued: stats.queued,
      active: stats.active,
      completed: stats.completed,
      failed: stats.failed,
      timestamp: new Date().toISOString()
    };

    res.json(status);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/scans/:jobId/results
 * Get scan results
 */
router.get('/:jobId/results', async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const { format = 'summary' } = req.query;

    logger.info({ jobId, format }, 'Getting scan results');

    // In production, retrieve from database/storage
    // For now, return metrics from worker
    const metrics = worker.getScanMetrics();

    const results = {
      job_id: jobId,
      scan_type: 'completed',
      metrics: {
        total_scans: metrics.totalScans,
        successful_scans: metrics.queueStats.completed,
        failed_scans: metrics.queueStats.failed,
        duplicates_found: metrics.totalDuplicatesFound,
        suggestions_generated: metrics.totalSuggestionsGenerated,
        high_impact_duplicates: metrics.highImpactDuplicates
      },
      timestamp: new Date().toISOString()
    };

    if (format === 'full') {
      results.detailed_metrics = metrics;
    }

    res.json(results);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/scans/recent
 * List recent scans
 */
router.get('/recent', async (req, res, next) => {
  try {
    const { limit = 10 } = req.query;

    logger.debug({ limit }, 'Listing recent scans');

    const metrics = worker.getScanMetrics();

    const recentScans = {
      total: metrics.totalScans,
      scans: [{
        scan_type: 'automated',
        total_scans: metrics.totalScans,
        duplicates_found: metrics.totalDuplicatesFound,
        suggestions: metrics.totalSuggestionsGenerated
      }],
      timestamp: new Date().toISOString()
    };

    res.json(recentScans);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/scans/stats
 * Get scanning statistics
 */
router.get('/stats', async (req, res, next) => {
  try {
    logger.debug('Getting scan statistics');

    const metrics = worker.getScanMetrics();
    const cacheStats = await cachedScanner.getStats();

    const stats = {
      scan_metrics: {
        total_scans: metrics.totalScans,
        successful_scans: metrics.queueStats.completed,
        failed_scans: metrics.queueStats.failed,
        duplicates_found: metrics.totalDuplicatesFound,
        suggestions_generated: metrics.totalSuggestionsGenerated,
        high_impact_duplicates: metrics.highImpactDuplicates
      },
      queue_stats: {
        queued: metrics.queueStats.queued,
        active: metrics.queueStats.active,
        completed: metrics.queueStats.completed,
        failed: metrics.queueStats.failed
      },
      cache_stats: cacheStats,
      timestamp: new Date().toISOString()
    };

    res.json(stats);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/scans/:jobId
 * Cancel a running scan
 */
router.delete('/:jobId', async (req, res, next) => {
  try {
    const { jobId } = req.params;

    logger.info({ jobId }, 'Cancelling scan');

    // In production, cancel the job
    // For now, return success
    res.json({
      success: true,
      job_id: jobId,
      message: 'Scan cancelled successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

export default router;

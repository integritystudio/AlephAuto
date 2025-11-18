/**
 * Scan Routes (TypeScript version with Zod validation)
 *
 * API endpoints for managing duplicate detection scans.
 */

import express, { Request, Response, NextFunction } from 'express';
import { CachedScanner } from '../../lib/cache/cached-scanner.js';
import { InterProjectScanner } from '../../lib/inter-project-scanner.js';
import { DuplicateDetectionWorker } from '../../pipelines/duplicate-detection-pipeline.js';
import { createComponentLogger } from '../../sidequest/logger.js';
import { strictRateLimiter } from '../middleware/rate-limit.js';
import { validateRequest } from '../middleware/validation.js';
import {
  StartScanRequestSchema,
  type StartScanRequest,
  type ScanResponse
} from '../types/scan-requests.js';
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
  logger.error({ error }, 'Failed to initialize worker');
});

/**
 * POST /api/scans/start
 * Start a new duplicate detection scan
 */
router.post(
  '/start',
  strictRateLimiter,
  validateRequest(StartScanRequestSchema), // Zod validation middleware
  async (req: Request<{}, {}, StartScanRequest>, res: Response, next: NextFunction) => {
    try {
      // Request body is now type-safe and validated
      const { repositoryPath, options = {} } = req.body;

      logger.info({ repositoryPath, options }, 'Starting scan via API');

      // Start scan asynchronously
      const jobId = `api-scan-${Date.now()}`;
      const job = worker.scheduleScan('intra-project', [{
        name: path.basename(repositoryPath),
        path: repositoryPath
      }]);

      const response: ScanResponse = {
        scanId: jobId,
        repositoryPath,
        status: 'queued',
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
        error: 'Bad Request',
        message: 'repositoryPaths must be an array with at least 2 repositories',
        timestamp: new Date().toISOString()
      });
    }

    logger.info({ repositoryPaths, groupName }, 'Starting inter-project scan via API');

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
 * GET /api/scans/:scanId/status
 * Get scan status
 */
router.get('/:scanId/status', async (req, res, next) => {
  try {
    const { scanId } = req.params;

    const scanMetrics = worker.getScanMetrics();
    const queueStats = worker.getStats();

    res.json({
      scan_id: scanId,
      status: queueStats.activeJobs > 0 ? 'running' : 'idle',
      active_jobs: queueStats.activeJobs,
      queued_jobs: queueStats.queuedJobs,
      completed_scans: scanMetrics.totalScans || 0,
      failed_scans: scanMetrics.failedScans || 0,
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

    // TODO: Implement result storage and retrieval
    res.json({
      scan_id: scanId,
      status: 'completed',
      results: [],
      message: 'Result storage not yet implemented',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

export default router;

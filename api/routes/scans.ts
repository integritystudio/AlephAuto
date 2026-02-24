/**
 * Scan Routes (TypeScript version with Zod validation)
 *
 * API endpoints for managing duplicate detection scans.
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import { CachedScanner } from '#sidequest/pipeline-core/cache/cached-scanner.ts';
import { InterProjectScanner } from '#sidequest/pipeline-core/inter-project-scanner.ts';
import { DuplicateDetectionWorker } from '#sidequest/pipeline-runners/duplicate-detection-pipeline.ts';
import { createComponentLogger, logStart } from '#sidequest/utils/logger.ts';
import { strictRateLimiter } from '../middleware/rate-limit.ts';
import { validateRequest } from '../middleware/validation.ts';
import {
  StartScanRequestSchema,
  type StartScanRequest,
  type ScanResponse,
  type ScanResults
} from '../types/scan-requests.ts';
import { getJobs } from '#sidequest/core/database.ts';
import { JOB_STATUS } from '../types/job-status.ts';
import { PAGINATION } from '#sidequest/core/constants.ts';
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

      logStart(logger, 'scan via API', { repositoryPath, options });

      // Start scan asynchronously - use the actual job ID from scheduleScan
      const job = worker.scheduleScan('intra-project', [{
        name: path.basename(repositoryPath),
        path: repositoryPath
      }] as any);

      const response: ScanResponse = {
        scanId: job.id, // Use the actual job ID for consistency
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

    logStart(logger, 'inter-project scan via API', { repositoryPaths, groupName });

    // Start inter-project scan
    const repositories = repositoryPaths.map(repoPath => ({
      name: path.basename(repoPath),
      path: repoPath
    }));

    const job = worker.scheduleScan('inter-project', repositories as any);

    res.status(201).json({
      success: true,
      job_id: job.id, // Use the actual job ID from scheduleScan
      group_name: groupName || 'unnamed-group',
      repository_count: repositoryPaths.length,
      status_url: `/api/scans/${job.id}/status`,
      results_url: `/api/scans/${job.id}/results`,
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
      status: queueStats.active > 0 ? 'running' : 'idle',
      active_jobs: queueStats.active,
      queued_jobs: queueStats.queued,
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
 * Get scan results from database
 */
router.get('/:scanId/results', async (req, res, next) => {
  try {
    const { scanId } = req.params;

    logger.debug({ scanId }, 'Fetching scan results');

    // Query database for the scan job
    // First try duplicate-detection pipeline (most scans)
    let jobs = getJobs('duplicate-detection', { limit: PAGINATION.MAX_LIMIT }) as any[];
    let job = jobs.find((j: any) => j.id === scanId);

    // If not found, check all pipeline types in the database
    if (!job) {
      const allPipelines = ['repomix', 'schema-enhancement', 'git-activity', 'gitignore-manager', 'plugin-manager', 'claude-health'];
      for (const pipelineId of allPipelines) {
        jobs = getJobs(pipelineId, { limit: PAGINATION.MAX_LIMIT }) as any[];
        job = jobs.find((j: any) => j.id === scanId);
        if (job) break;
      }
    }

    // Return 404 if scan not found
    if (!job) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Scan with ID '${scanId}' not found`,
        timestamp: new Date().toISOString()
      });
    }

    // Format results based on job status
    const response: ScanResults = {
      scanId: job.id,
      status: job.status as 'queued' | 'running' | 'completed' | 'failed',
      timestamp: new Date().toISOString()
    };

    // Add timing information if available
    if (job.startedAt) {
      response.startTime = job.startedAt;
    }
    if (job.completedAt) {
      response.endTime = job.completedAt;
    }

    // Add results for completed jobs
    if (job.status === JOB_STATUS.COMPLETED && job.result) {
      response.results = {
        scanType: job.data?.scanType,
        totalDuplicates: job.result.totalDuplicates ?? job.result.duplicates ?? job.result.crossRepoDuplicates,
        duplicates: job.result.duplicates,
        crossRepoDuplicates: job.result.crossRepoDuplicates,
        totalBlocks: job.result.totalBlocks,
        scanDuration: job.result.duration ?? job.result.scanDuration,
        suggestions: job.result.suggestions,
        repositories: job.data?.repositories,
        reportPath: job.result.reportPath,
        prResults: job.result.prResults
      };
    }

    // Add error for failed jobs
    if (job.status === JOB_STATUS.FAILED && job.error) {
      response.error = {
        message: typeof job.error === 'string' ? job.error : job.error.message,
        code: typeof job.error === 'object' ? job.error.code : undefined,
        stack: typeof job.error === 'object' ? job.error.stack : undefined
      };
    }

    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;

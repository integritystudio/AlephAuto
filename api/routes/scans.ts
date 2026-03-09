/**
 * Scan Routes (TypeScript version with Zod validation)
 *
 * API endpoints for managing duplicate detection scans.
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import { DuplicateDetectionWorker } from '#sidequest/workers/duplicate-detection-worker.ts';
import { createComponentLogger, logStart } from '#sidequest/utils/logger.ts';
import { strictRateLimiter } from '../middleware/rate-limit.ts';
import { validateRequest } from '../middleware/validation.ts';
import { workerRegistry } from '../utils/worker-registry.ts';
import {
  StartScanRequestSchema,
  StartMultiScanRequestSchema,
  type StartScanRequest,
  type StartMultiScanRequest,
  type ScanResponse,
  type ScanResults
} from '../types/scan-requests.ts';
import { JOB_STATUS } from '../types/job-status.ts';
import { VALIDATION } from '#sidequest/core/constants.ts';
import { jobRepository } from '#sidequest/core/job-repository.ts';
import { type RepositoryConfig } from '#sidequest/pipeline-core/config/repository-config-loader.ts';
import path from 'path';
import { HttpStatus } from '../../shared/constants/http-status.ts';

const router = express.Router();
const logger = createComponentLogger('ScanRoutes');

// Create standalone worker and register it with the registry for lifecycle management
const worker = new DuplicateDetectionWorker({ maxConcurrentScans: 3 });

// Export worker so tests can control it (stop, cancel jobs)
export { worker };

// Initialize worker and register with registry for activity feed + graceful shutdown
worker.initialize().then(() => {
  workerRegistry.registerWorker('duplicate-detection', worker);
}).catch(error => {
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
      }] as unknown as Parameters<typeof worker.scheduleScan>[1]);

      const response: ScanResponse = {
        scanId: job.id, // Use the actual job ID for consistency
        repositoryPath,
        status: 'queued',
        timestamp: new Date().toISOString()
      };

      res.status(HttpStatus.CREATED).json(response);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/scans/start-multi
 * Start an inter-project scan across multiple repositories
 */
router.post(
  '/start-multi',
  strictRateLimiter,
  validateRequest(StartMultiScanRequestSchema),
  async (req: Request<{}, {}, StartMultiScanRequest>, res: Response, next: NextFunction) => {
    try {
      const { repositoryPaths, groupName } = req.body;

      // Validate all paths are absolute and don't contain null bytes or path traversal
      for (const repoPath of repositoryPaths) {
        if (!path.isAbsolute(repoPath) || repoPath.includes('\0')) {
          return res.status(HttpStatus.BAD_REQUEST).json({
            error: 'Bad Request',
            message: `Invalid repository path: must be absolute with no null bytes`,
            timestamp: new Date().toISOString()
          });
        }
        const normalized = path.normalize(repoPath);
        if (normalized !== repoPath) {
          return res.status(HttpStatus.BAD_REQUEST).json({
            error: 'Bad Request',
            message: `Invalid repository path: path traversal not allowed`,
            timestamp: new Date().toISOString()
          });
        }
      }

      logStart(logger, 'inter-project scan via API', { repositoryPaths, groupName });

      const repositories = repositoryPaths.map(repoPath => ({
        name: path.basename(repoPath),
        path: repoPath
      }));

      const job = worker.scheduleScan('inter-project', repositories as RepositoryConfig[]);

      res.status(HttpStatus.CREATED).json({
        success: true,
        job_id: job.id,
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
  }
);

/**
 * GET /api/scans/:scanId/status
 * Get scan status for a specific scan job
 */
router.get('/:scanId/status', async (req, res, next) => {
  try {
    const { scanId } = req.params;

    if (!VALIDATION.JOB_ID_PATTERN.test(scanId)) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        error: 'Bad Request',
        message: 'Invalid scan ID format',
        timestamp: new Date().toISOString()
      });
    }

    const job = jobRepository.getJob(scanId);

    if (!job) {
      return res.status(HttpStatus.NOT_FOUND).json({
        error: 'Not Found',
        message: `Scan with ID '${scanId}' not found`,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      scan_id: scanId,
      status: job.status,
      started_at: job.startedAt,
      completed_at: job.completedAt,
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

    if (!VALIDATION.JOB_ID_PATTERN.test(scanId)) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        error: 'Bad Request',
        message: 'Invalid scan ID format',
        timestamp: new Date().toISOString()
      });
    }

    // Direct primary-key lookup instead of scanning all pipelines
    const job = jobRepository.getJob(scanId);

    if (!job) {
      return res.status(HttpStatus.NOT_FOUND).json({
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
      const result = job.result as Record<string, unknown>;
      const data = job.data as Record<string, unknown> | null | undefined;
      response.results = {
        scanType: data?.scanType as string | undefined,
        totalDuplicates: (result.totalDuplicates ?? result.duplicates ?? result.crossRepoDuplicates) as number | undefined,
        duplicates: result.duplicates as number | undefined,
        crossRepoDuplicates: result.crossRepoDuplicates as number | undefined,
        totalBlocks: result.totalBlocks as number | undefined,
        scanDuration: (result.duration ?? result.scanDuration) as number | undefined,
        suggestions: result.suggestions as number | undefined,
        repositories: data?.repositories as { name: string; path: string }[] | undefined,
        reportPath: result.reportPath as string | undefined,
        prResults: result.prResults as unknown
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

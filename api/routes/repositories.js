/**
 * Repository Routes
 *
 * API endpoints for repository configuration management.
 */

import express from 'express';
import { RepositoryConfigLoader } from '../../sidequest/pipeline-core/config/repository-config-loader.js';
import { CachedScanner } from '../../sidequest/pipeline-core/cache/cached-scanner.js';
import { createComponentLogger, logError } from '../../sidequest/utils/logger.js';
import { strictRateLimiter } from '../middleware/rate-limit.js';
import { validateQuery } from '../middleware/validation.js';
import { RepositoryQuerySchema, RepositoryGroupQuerySchema } from '../types/repository-requests.js';

const router = express.Router();
const logger = createComponentLogger('RepositoryRoutes');

// Initialize components
const configLoader = new RepositoryConfigLoader();
const cachedScanner = new CachedScanner({ cacheEnabled: true });

// Load configuration
configLoader.load().catch(error => {
  logError(logger, error, 'Failed to load configuration');
});

/**
 * GET /api/repositories
 * List all repositories
 */
router.get('/', validateQuery(RepositoryQuerySchema), async (req, res, next) => {
  try {
    // Query params are now validated by Zod
    const { enabled, priority, tag } = req.query;

    logger.debug({ enabled, priority, tag }, 'Listing repositories');

    let repositories;

    if (enabled === 'true') {
      repositories = configLoader.getEnabledRepositories();
    } else {
      repositories = configLoader.getAllRepositories();
    }

    // Filter by priority
    if (priority) {
      repositories = repositories.filter(r => r.priority === priority);
    }

    // Filter by tag
    if (tag) {
      repositories = repositories.filter(r =>
        r.tags && r.tags.includes(tag)
      );
    }

    const repoList = repositories.map(r => ({
      name: r.name,
      path: r.path,
      priority: r.priority,
      scan_frequency: r.scanFrequency,
      enabled: r.enabled,
      last_scanned: r.lastScannedAt,
      tags: r.tags || [],
      scan_history: r.scanHistory || []
    }));

    res.json({
      total: repoList.length,
      repositories: repoList,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/repositories/:name
 * Get repository details
 */
router.get('/:name', async (req, res, next) => {
  try {
    const { name } = req.params;

    logger.debug({ name }, 'Getting repository details');

    const repository = configLoader.getRepository(name);

    if (!repository) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Repository '${name}' not found`
        },
        timestamp: new Date().toISOString()
      });
    }

    // Get cache status
    const cacheStatus = await cachedScanner.getCacheStatus(repository.path);

    res.json({
      ...repository,
      cache_status: cacheStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/repositories/:name/scan
 * Trigger a scan for a specific repository
 */
router.post('/:name/scan', strictRateLimiter, async (req, res, next) => {
  try {
    const { name } = req.params;
    const { forceRefresh = false } = req.body;

    logger.info({ name, forceRefresh }, 'Triggering repository scan');

    const repository = configLoader.getRepository(name);

    if (!repository) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Repository '${name}' not found`
        },
        timestamp: new Date().toISOString()
      });
    }

    // Start scan
    const jobId = `repo-scan-${name}-${Date.now()}`;

    res.json({
      success: true,
      job_id: jobId,
      repository: name,
      status_url: `/api/scans/${jobId}/status`,
      results_url: `/api/scans/${jobId}/results`,
      message: `Scan started for repository '${name}'`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/repositories/:name/cache
 * Get cache status for a repository
 */
router.get('/:name/cache', async (req, res, next) => {
  try {
    const { name } = req.params;

    logger.debug({ name }, 'Getting repository cache status');

    const repository = configLoader.getRepository(name);

    if (!repository) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Repository '${name}' not found`
        },
        timestamp: new Date().toISOString()
      });
    }

    const cacheStatus = await cachedScanner.getCacheStatus(repository.path);

    res.json({
      repository: name,
      cache_status: cacheStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/repositories/:name/cache
 * Invalidate cache for a repository
 */
router.delete('/:name/cache', async (req, res, next) => {
  try {
    const { name } = req.params;

    logger.info({ name }, 'Invalidating repository cache');

    const repository = configLoader.getRepository(name);

    if (!repository) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Repository '${name}' not found`
        },
        timestamp: new Date().toISOString()
      });
    }

    const deletedCount = await cachedScanner.invalidateCache(repository.path);

    res.json({
      success: true,
      repository: name,
      cache_entries_deleted: deletedCount,
      message: 'Cache invalidated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/repositories/groups
 * List repository groups
 */
router.get('/groups/list', validateQuery(RepositoryGroupQuerySchema), async (req, res, next) => {
  try {
    // Query params are now validated by Zod
    const { enabled } = req.query;

    logger.debug({ enabled }, 'Listing repository groups');

    let groups;

    if (enabled === 'true') {
      groups = configLoader.getEnabledGroups();
    } else {
      groups = configLoader.getAllGroups();
    }

    const groupList = groups.map(g => ({
      name: g.name,
      description: g.description,
      scan_type: g.scanType,
      enabled: g.enabled,
      repositories: g.repositories
    }));

    res.json({
      total: groupList.length,
      groups: groupList,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/repositories/groups/:name
 * Get repository group details
 */
router.get('/groups/:name', async (req, res, next) => {
  try {
    const { name } = req.params;

    logger.debug({ name }, 'Getting repository group details');

    const group = configLoader.getGroup(name);

    if (!group) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Repository group '${name}' not found`
        },
        timestamp: new Date().toISOString()
      });
    }

    // Get group repositories with details
    const groupRepos = configLoader.getGroupRepositories(name);

    res.json({
      ...group,
      repository_details: groupRepos,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

export default router;

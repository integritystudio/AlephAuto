/**
 * Cached Scanner
 *
 * Integrates Git commit tracking with scan result caching.
 * Automatically uses cached results when repository hasn't changed.
 */

import { GitCommitTracker } from './git-tracker.js';
import { ScanResultCache } from './scan-cache.js';
import { ScanOrchestrator } from '../scan-orchestrator.js';
import { createComponentLogger, logStart, logComplete, logError, logWarn, logSkip } from '../../utils/logger.js';
import * as Sentry from '@sentry/node';

const logger = createComponentLogger('CachedScanner');

export class CachedScanner {
  /**
   * @param {Object} options - Scanner options
   */
  constructor(options = {}) {
    this.gitTracker = new GitCommitTracker();
    this.cache = options.cache || null; // ScanResultCache instance (optional)
    this.scanner = new ScanOrchestrator(options.scannerOptions || {});

    this.cacheEnabled = options.cacheEnabled !== false;
    this.forceRefresh = options.forceRefresh || false;
    this.trackUncommitted = options.trackUncommitted !== false;

    logger.info({
      cacheEnabled: this.cacheEnabled,
      forceRefresh: this.forceRefresh,
      trackUncommitted: this.trackUncommitted
    }, 'Cached scanner initialized');
  }

  /**
   * Initialize cache connection
   * @param {Object} redisClient - Redis MCP client
   * @param {Object} cacheOptions - Cache options
   */
  initializeCache(redisClient, cacheOptions = {}) {
    this.cache = new ScanResultCache(redisClient, {
      enabled: this.cacheEnabled,
      ...cacheOptions
    });

    logger.info('Cache initialized with Redis client');
  }

  /**
   * Scan repository with intelligent caching
   * @param {string} repoPath - Path to repository
   * @param {Object} options - Scan options
   * @returns {Promise<Object>} - Scan result
   */
  async scanRepository(repoPath, options = {}) {
    const startTime = Date.now();

    try {
      logger.info({ repoPath, options }, 'Starting cached repository scan');

      // Get repository Git status
      const repoStatus = await this.gitTracker.getRepositoryStatus(repoPath);

      // Determine if we should use cache
      const shouldUseCache = await this._shouldUseCache(repoPath, repoStatus, options);

      if (shouldUseCache) {
        // Try to get from cache
        const cachedResult = await this._getCachedResult(repoPath, repoStatus.current_commit);

        if (cachedResult) {
          const duration = (Date.now() - startTime) / 1000;

          logger.info({
            repoPath,
            fromCache: true,
            duration,
            cacheAge: cachedResult.cache_metadata?.age
          }, 'Scan completed from cache');

          return {
            ...cachedResult,
            scan_metadata: {
              ...cachedResult.scan_metadata,
              duration_seconds: duration,
              git_status: repoStatus
            }
          };
        }
      }

      // Cache miss or forced refresh - run actual scan
      logger.info({ repoPath, reason: options.forceRefresh ? 'forced_refresh' : 'cache_miss' }, 'Running fresh scan');

      const scanResult = await this.scanner.scanRepository(repoPath, options);

      // Cache the result if caching is enabled
      if (this.cacheEnabled && this.cache && repoStatus.current_commit) {
        await this._cacheResult(repoPath, repoStatus.current_commit, scanResult);
      }

      const duration = (Date.now() - startTime) / 1000;

      logger.info({
        repoPath,
        fromCache: false,
        duration,
        duplicates: scanResult.metrics?.total_duplicate_groups || 0
      }, 'Scan completed from fresh scan');

      return {
        ...scanResult,
        scan_metadata: {
          ...scanResult.scan_metadata,
          duration_seconds: duration,
          git_status: repoStatus,
          from_cache: false
        }
      };
    } catch (error) {
      logError(logger, error, 'Cached scan failed', { repoPath });
      Sentry.captureException(error, {
        tags: {
          component: 'cached-scanner',
          repository: repoPath
        }
      });
      throw error;
    }
  }

  /**
   * Determine if cache should be used
   * @param {string} repoPath - Repository path
   * @param {Object} repoStatus - Repository Git status
   * @param {Object} options - Scan options
   * @returns {Promise<boolean>} - True if should use cache
   * @private
   */
  async _shouldUseCache(repoPath, repoStatus, options) {
    // Never use cache if forced refresh
    if (options.forceRefresh || this.forceRefresh) {
      logSkip(logger, 'cache', 'forced refresh', { repoPath });
      return false;
    }

    // Never use cache if caching disabled
    if (!this.cacheEnabled || !this.cache) {
      logSkip(logger, 'cache', 'caching disabled', { repoPath });
      return false;
    }

    // Never use cache if not a Git repository
    if (!repoStatus.is_git_repository) {
      logSkip(logger, 'cache', 'not a git repository', { repoPath });
      return false;
    }

    // Check for uncommitted changes
    if (this.trackUncommitted && repoStatus.has_uncommitted_changes) {
      logSkip(logger, 'cache', 'has uncommitted changes', { repoPath });
      return false;
    }

    return true;
  }

  /**
   * Get cached result
   * @param {string} repoPath - Repository path
   * @param {string} commitHash - Commit hash
   * @returns {Promise<Object|null>} - Cached result or null
   * @private
   */
  async _getCachedResult(repoPath, commitHash) {
    try {
      const cachedResult = await this.cache.getCachedScan(repoPath, commitHash);

      if (cachedResult) {
        // Calculate cache age
        const cacheAge = await this.cache.getCacheAge(repoPath, commitHash);

        return {
          ...cachedResult,
          cache_metadata: {
            ...cachedResult.cache_metadata,
            age: cacheAge,
            age_hours: cacheAge / (60 * 60 * 1000),
            age_days: cacheAge / (24 * 60 * 60 * 1000)
          }
        };
      }

      return null;
    } catch (error) {
      logWarn(logger, error, 'Failed to get cached result', { repoPath });
      return null;
    }
  }

  /**
   * Cache scan result
   * @param {string} repoPath - Repository path
   * @param {string} commitHash - Commit hash
   * @param {Object} scanResult - Scan result
   * @private
   */
  async _cacheResult(repoPath, commitHash, scanResult) {
    try {
      await this.cache.cacheScan(repoPath, commitHash, scanResult);
    } catch (error) {
      logWarn(logger, error, 'Failed to cache scan result (non-fatal)', { repoPath });
      // Don't throw - caching failure shouldn't fail the scan
    }
  }

  /**
   * Invalidate cache for a repository
   * @param {string} repoPath - Repository path
   * @returns {Promise<number>} - Number of cache entries invalidated
   */
  async invalidateCache(repoPath) {
    if (!this.cache) {
      logWarn(logger, null, 'Cannot invalidate cache: cache not initialized', { repoPath });
      return 0;
    }

    try {
      logger.info({ repoPath }, 'Invalidating cache for repository');

      const deletedCount = await this.cache.invalidateCache(repoPath);

      logger.info({
        repoPath,
        entriesDeleted: deletedCount
      }, 'Cache invalidated successfully');

      return deletedCount;
    } catch (error) {
      logError(logger, error, 'Failed to invalidate cache', { repoPath });
      throw error;
    }
  }

  /**
   * Check if repository scan is cached
   * @param {string} repoPath - Repository path
   * @returns {Promise<Object>} - Cache status
   */
  async getCacheStatus(repoPath) {
    try {
      const repoStatus = await this.gitTracker.getRepositoryStatus(repoPath);

      if (!repoStatus.current_commit) {
        return {
          is_cached: false,
          reason: 'not_a_git_repository',
          repository_status: repoStatus
        };
      }

      const isCached = await this.cache?.isCached(repoPath, repoStatus.current_commit);
      const cacheAge = isCached ? await this.cache.getCacheAge(repoPath, repoStatus.current_commit) : null;
      const metadata = isCached ? await this.cache.getCacheMetadata(repoPath, repoStatus.current_commit) : null;

      return {
        is_cached: isCached || false,
        cache_age_ms: cacheAge,
        cache_age_hours: cacheAge ? cacheAge / (60 * 60 * 1000) : null,
        cache_age_days: cacheAge ? cacheAge / (24 * 60 * 60 * 1000) : null,
        metadata,
        repository_status: repoStatus
      };
    } catch (error) {
      logError(logger, error, 'Failed to get cache status', { repoPath });
      throw error;
    }
  }

  /**
   * Get scanner statistics
   * @returns {Promise<Object>} - Scanner statistics
   */
  async getStats() {
    const cacheStats = this.cache ? await this.cache.getStats() : null;

    return {
      cache_enabled: this.cacheEnabled,
      force_refresh: this.forceRefresh,
      track_uncommitted: this.trackUncommitted,
      cache_initialized: this.cache !== null,
      cache_stats: cacheStats
    };
  }

  /**
   * Warm cache by scanning repositories
   * @param {Array<string>} repoPaths - Array of repository paths to scan
   * @param {Object} options - Scan options
   * @returns {Promise<Object>} - Warm-up results
   */
  async warmCache(repoPaths, options = {}) {
    logger.info({ repositoryCount: repoPaths.length }, 'Starting cache warm-up');

    const results = {
      total: repoPaths.length,
      successful: 0,
      failed: 0,
      errors: []
    };

    for (const repoPath of repoPaths) {
      try {
        await this.scanRepository(repoPath, {
          ...options,
          forceRefresh: true // Force scan to populate cache
        });

        results.successful++;

        logger.info({
          repoPath,
          progress: `${results.successful}/${results.total}`
        }, 'Repository scanned for cache warm-up');
      } catch (error) {
        results.failed++;
        results.errors.push({
          repository: repoPath,
          error: error.message
        });

        logError(logger, error, 'Failed to scan repository for cache warm-up', { repoPath });
      }
    }

    logger.info(results, 'Cache warm-up completed');

    return results;
  }
}

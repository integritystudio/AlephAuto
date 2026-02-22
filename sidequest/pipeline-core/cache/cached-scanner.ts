/**
 * Cached Scanner
 *
 * Integrates Git commit tracking with scan result caching.
 * Automatically uses cached results when repository hasn't changed.
 */

import { GitCommitTracker, type RepositoryStatus } from './git-tracker.ts';
import { ScanResultCache, type ScanResultWithCache, type CacheStats, type RedisClient, type ScanCacheOptions } from './scan-cache.ts';
import { ScanOrchestrator, type ScanResult, type ScanConfig } from '../scan-orchestrator.ts';
import { createComponentLogger, logStart, logError, logWarn, logSkip } from '../../utils/logger.ts';
import * as Sentry from '@sentry/node';

const logger = createComponentLogger('CachedScanner');

export interface CachedScannerOptions {
  cache?: ScanResultCache | null;
  scannerOptions?: Record<string, unknown>;
  cacheEnabled?: boolean;
  forceRefresh?: boolean;
  trackUncommitted?: boolean;
}

export interface WarmUpError {
  repository: string;
  error: string;
}

export interface WarmUpResults {
  total: number;
  successful: number;
  failed: number;
  errors: WarmUpError[];
}

export interface ScannerStats {
  cache_enabled: boolean;
  force_refresh: boolean;
  track_uncommitted: boolean;
  cache_initialized: boolean;
  cache_stats: CacheStats | null;
}

export interface CacheStatusResult {
  is_cached: boolean;
  reason?: string;
  cache_age_ms: number | null;
  cache_age_hours: number | null;
  cache_age_days: number | null;
  metadata: import('./scan-cache.ts').CacheMetadata | null;
  repository_status: RepositoryStatus;
}

export interface CachedScanOptions extends ScanConfig {
  forceRefresh?: boolean;
}

export interface CachedScanResult extends ScanResult {
  scan_metadata: ScanResult['scan_metadata'] & {
    git_status?: RepositoryStatus;
    from_cache?: boolean;
  };
  cache_metadata?: import('./scan-cache.ts').CacheMetadataAttachment;
}

export class CachedScanner {
  private readonly gitTracker: GitCommitTracker;
  private cache: ScanResultCache | null;
  private readonly scanner: ScanOrchestrator;
  private readonly cacheEnabled: boolean;
  private readonly forceRefresh: boolean;
  private readonly trackUncommitted: boolean;

  constructor(options: CachedScannerOptions = {}) {
    this.gitTracker = new GitCommitTracker();
    this.cache = options.cache ?? null; // ScanResultCache instance (optional)
    this.scanner = new ScanOrchestrator(options.scannerOptions ?? {});

    this.cacheEnabled = options.cacheEnabled !== false;
    this.forceRefresh = options.forceRefresh ?? false;
    this.trackUncommitted = options.trackUncommitted !== false;

    logger.info({
      cacheEnabled: this.cacheEnabled,
      forceRefresh: this.forceRefresh,
      trackUncommitted: this.trackUncommitted
    }, 'Cached scanner initialized');
  }

  /**
   * Initialize cache connection
   */
  initializeCache(redisClient: RedisClient, cacheOptions: ScanCacheOptions = {}): void {
    this.cache = new ScanResultCache(redisClient, {
      enabled: this.cacheEnabled,
      ...cacheOptions
    });

    logger.info('Cache initialized with Redis client');
  }

  /**
   * Scan repository with intelligent caching
   */
  async scanRepository(repoPath: string, options: CachedScanOptions = {}): Promise<CachedScanResult> {
    const startTime = Date.now();

    try {
      logStart(logger, 'cached repository scan', { repoPath, options });

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

      const scanResult: ScanResult = await this.scanner.scanRepository(repoPath, options);

      // Cache the result if caching is enabled
      if (this.cacheEnabled && this.cache && repoStatus.current_commit) {
        await this._cacheResult(repoPath, repoStatus.current_commit, scanResult);
      }

      const duration = (Date.now() - startTime) / 1000;

      logger.info({
        repoPath,
        fromCache: false,
        duration,
        duplicates: scanResult.metrics?.total_duplicate_groups ?? 0
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
   */
  private async _shouldUseCache(
    repoPath: string,
    repoStatus: RepositoryStatus,
    options: CachedScanOptions
  ): Promise<boolean> {
    // Never use cache if forced refresh
    if (options.forceRefresh ?? this.forceRefresh) {
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
   */
  private async _getCachedResult(
    repoPath: string,
    commitHash: string | null
  ): Promise<CachedScanResult | null> {
    try {
      const cachedResult = await this.cache!.getCachedScan(repoPath, commitHash);

      if (cachedResult) {
        // Calculate cache age
        const cacheAge = await this.cache!.getCacheAge(repoPath, commitHash);

        return {
          ...(cachedResult as unknown as CachedScanResult),
          cache_metadata: {
            ...cachedResult.cache_metadata,
            age: cacheAge,
            age_hours: cacheAge !== null ? cacheAge / (60 * 60 * 1000) : null,
            age_days: cacheAge !== null ? cacheAge / (24 * 60 * 60 * 1000) : null
          }
        };
      }

      return null;
    } catch (error) {
      logWarn(logger, error as Error | null, 'Failed to get cached result', { repoPath });
      return null;
    }
  }

  /**
   * Cache scan result
   */
  private async _cacheResult(
    repoPath: string,
    commitHash: string,
    scanResult: ScanResult
  ): Promise<void> {
    try {
      await this.cache!.cacheScan(repoPath, commitHash, scanResult as unknown as ScanResultWithCache);
    } catch (error) {
      logWarn(logger, error as Error | null, 'Failed to cache scan result (non-fatal)', { repoPath });
      // Don't throw - caching failure shouldn't fail the scan
    }
  }

  /**
   * Invalidate cache for a repository
   */
  async invalidateCache(repoPath: string): Promise<number> {
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
   */
  async getCacheStatus(repoPath: string): Promise<CacheStatusResult> {
    try {
      const repoStatus = await this.gitTracker.getRepositoryStatus(repoPath);

      if (!repoStatus.current_commit) {
        return {
          is_cached: false,
          reason: 'not_a_git_repository',
          cache_age_ms: null,
          cache_age_hours: null,
          cache_age_days: null,
          metadata: null,
          repository_status: repoStatus
        };
      }

      const isCached = await this.cache?.isCached(repoPath, repoStatus.current_commit);
      const cacheAge = isCached ? await this.cache!.getCacheAge(repoPath, repoStatus.current_commit) : null;
      const metadata = isCached ? await this.cache!.getCacheMetadata(repoPath, repoStatus.current_commit) : null;

      return {
        is_cached: isCached ?? false,
        cache_age_ms: cacheAge,
        cache_age_hours: cacheAge != null ? cacheAge / (60 * 60 * 1000) : null,
        cache_age_days: cacheAge != null ? cacheAge / (24 * 60 * 60 * 1000) : null,
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
   */
  async getStats(): Promise<ScannerStats> {
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
   */
  async warmCache(repoPaths: string[], options: CachedScanOptions = {}): Promise<WarmUpResults> {
    logStart(logger, 'cache warm-up', { repositoryCount: repoPaths.length });

    const results: WarmUpResults = {
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
          error: (error as Error).message
        });

        logError(logger, error, 'Failed to scan repository for cache warm-up', { repoPath });
      }
    }

    logger.info(results, 'Cache warm-up completed');

    return results;
  }
}

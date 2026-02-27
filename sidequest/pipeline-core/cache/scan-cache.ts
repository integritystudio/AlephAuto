/**
 * Scan Result Cache
 *
 * Caches duplicate detection scan results in Redis using Git commit hashes as keys.
 * Provides fast retrieval of scan results for unchanged repositories.
 */

import { createComponentLogger, logError } from '../../utils/logger.ts';
import crypto from 'crypto';

const logger = createComponentLogger('ScanResultCache');

export interface RedisClient {
  hexists(args: { name: string; key: string }): Promise<boolean>;
  hget(args: { name: string; key: string }): Promise<string | null>;
  hset(args: { name: string; key: string; value: string; expire_seconds: number }): Promise<unknown>;
  lpush(args: { name: string; value: string; expire: number }): Promise<unknown>;
  lrange(args: { name: string; start: number; stop: number }): Promise<string[]>;
  scan_all_keys(args: { pattern: string }): Promise<string[]>;
  delete(args: { key: string }): Promise<unknown>;
}

export interface ScanCacheOptions {
  ttl?: number;
  keyPrefix?: string;
  enabled?: boolean;
}

export interface CacheMetadata {
  repository_path: string;
  commit_hash: string | null;
  short_commit: string | null;
  cached_at: string;
  ttl: number;
  scan_type: string;
  total_duplicates: number;
  total_suggestions: number;
}

export interface IndexEntry {
  cache_key: string;
  repository_path: string;
  commit_hash: string | null;
  indexed_at: string;
}

export interface CacheStats {
  total_cached_scans: number;
  cache_enabled: boolean;
  ttl_seconds: number;
  ttl_days: number;
  prefix: string;
  error?: string;
}

export interface ScanResultWithCache extends Record<string, unknown> {
  scan_type?: string;
  metrics?: {
    total_duplicate_groups?: number;
    total_suggestions?: number;
    [key: string]: unknown;
  };
  cache_metadata?: CacheMetadataAttachment;
  scan_metadata?: Record<string, unknown>;
}

export interface CacheMetadataAttachment {
  cached_at?: string;
  from_cache?: boolean;
  cache_key?: string;
  age?: number | null;
  age_hours?: number | null;
  age_days?: number | null;
  [key: string]: unknown;
}

export class ScanResultCache {
  private readonly redis: RedisClient;
  private readonly ttl: number;
  private readonly keyPrefix: string;
  private readonly enabled: boolean;

    /**
   * Constructor.
   *
   * @param {RedisClient} redisClient - The redisClient
   * @param {ScanCacheOptions} [options={}] - Options dictionary
   */
  constructor(redisClient: RedisClient, options: ScanCacheOptions = {}) {
    this.redis = redisClient;
    this.ttl = options.ttl ?? (30 * 24 * 60 * 60); // Default: 30 days in seconds
    this.keyPrefix = options.keyPrefix ?? 'scan:';
    this.enabled = options.enabled !== false;
  }

  /**
   * Generate cache key for a repository scan
   */
  private _generateCacheKey(repoPath: string, commitHash: string | null): string {
    // Create a stable hash of repository path
    const pathHash = crypto
      .createHash('sha256')
      .update(repoPath)
      .digest('hex')
      .substring(0, 16);

    const shortCommit = commitHash ? commitHash.substring(0, 7) : 'no-git';

    return `${this.keyPrefix}${pathHash}:${shortCommit}`;
  }

    /**
   * Get the cached scan.
   *
   * @param {string} repoPath - The repoPath
   * @param {string | null} commitHash - The commitHash
   *
   * @returns {Promise<ScanResultWithCache | null>} The cached scan
   * @async
   */
  async getCachedScan(repoPath: string, commitHash: string | null): Promise<ScanResultWithCache | null> {
    if (!this.enabled) {
      logger.debug('Cache disabled, skipping lookup');
      return null;
    }

    const cacheKey = this._generateCacheKey(repoPath, commitHash);

    try {
      logger.debug({ cacheKey, repoPath, commitHash }, 'Looking up cached scan');

      // Check if key exists
      const exists = await this.redis.hexists({ name: cacheKey, key: 'scan_result' });

      if (!exists) {
        logger.info({ cacheKey, repoPath }, 'Cache miss');
        return null;
      }

      // Retrieve scan result
      const cachedData = await this.redis.hget({ name: cacheKey, key: 'scan_result' });

      if (!cachedData) {
        logger.warn({ cacheKey }, 'Cache key exists but no data found');
        return null;
      }

      const scanResult = JSON.parse(cachedData) as ScanResultWithCache;

      // Retrieve metadata
      const metadataStr = await this.redis.hget({ name: cacheKey, key: 'metadata' });
      const metadata: CacheMetadata | Record<string, unknown> = metadataStr ? JSON.parse(metadataStr) : {};

      logger.info({
        cacheKey,
        repoPath,
        cachedAt: (metadata as CacheMetadata).cached_at,
        age: Date.now() - new Date((metadata as CacheMetadata).cached_at).getTime()
      }, 'Cache hit');

      return {
        ...scanResult,
        cache_metadata: {
          ...metadata,
          from_cache: true,
          cache_key: cacheKey
        }
      };
    } catch (error) {
      logError(logger, error, 'Failed to retrieve cached scan', { cacheKey, repoPath });
      return null;
    }
  }

  /**
   * Cache a scan result
   */
  async cacheScan(
    repoPath: string,
    commitHash: string | null,
    scanResult: ScanResultWithCache,
    _options: Record<string, unknown> = {}
  ): Promise<boolean> {
    if (!this.enabled) {
      logger.debug('Cache disabled, skipping storage');
      return false;
    }

    const cacheKey = this._generateCacheKey(repoPath, commitHash);

    try {
      const metadata: CacheMetadata = {
        repository_path: repoPath,
        commit_hash: commitHash,
        short_commit: commitHash ? commitHash.substring(0, 7) : null,
        cached_at: new Date().toISOString(),
        ttl: this.ttl,
        scan_type: (scanResult.scan_type as string) ?? 'unknown',
        total_duplicates: (scanResult.metrics?.total_duplicate_groups as number) ?? 0,
        total_suggestions: (scanResult.metrics?.total_suggestions as number) ?? 0
      };

      // Store scan result
      await this.redis.hset({
        name: cacheKey,
        key: 'scan_result',
        value: JSON.stringify(scanResult),
        expire_seconds: this.ttl
      });

      // Store metadata
      await this.redis.hset({
        name: cacheKey,
        key: 'metadata',
        value: JSON.stringify(metadata),
        expire_seconds: this.ttl
      });

      // Store repository path for reverse lookup
      await this.redis.hset({
        name: cacheKey,
        key: 'repository_path',
        value: repoPath,
        expire_seconds: this.ttl
      });

      // Add to index for listing cached scans
      await this._addToIndex(cacheKey, repoPath, commitHash);

      logger.info({
        cacheKey,
        repoPath,
        commitHash: commitHash ? commitHash.substring(0, 7) : null,
        ttl: this.ttl,
        duplicates: metadata.total_duplicates
      }, 'Scan result cached successfully');

      return true;
    } catch (error) {
      logError(logger, error, 'Failed to cache scan result', { cacheKey, repoPath });
      return false;
    }
  }

  /**
   * Add cache key to index for listing
   */
  private async _addToIndex(cacheKey: string, repoPath: string, commitHash: string | null): Promise<void> {
    try {
      const indexKey = `${this.keyPrefix}index`;
      const indexEntry: IndexEntry = {
        cache_key: cacheKey,
        repository_path: repoPath,
        commit_hash: commitHash,
        indexed_at: new Date().toISOString()
      };

      await this.redis.lpush({
        name: indexKey,
        value: JSON.stringify(indexEntry),
        expire: this.ttl
      });

      // Keep only the 100 most recent entries
      await this.redis.lrange({
        name: indexKey,
        start: 0,
        stop: 99
      });
    } catch (error) {
      logger.warn({ error, cacheKey }, 'Failed to update cache index');
    }
  }

    /**
   * Invalidate cache.
   *
   * @param {string} repoPath - The repoPath
   *
   * @returns {Promise<number>} The Promise<number>
   * @async
   */
  async invalidateCache(repoPath: string): Promise<number> {
    try {
      const pathHash = crypto
        .createHash('sha256')
        .update(repoPath)
        .digest('hex')
        .substring(0, 16);

      const pattern = `${this.keyPrefix}${pathHash}:*`;

      logger.info({ repoPath, pattern }, 'Invalidating cache for repository');

      // Scan for matching keys
      const keys = await this.redis.scan_all_keys({ pattern });

      if (keys.length === 0) {
        logger.info({ repoPath }, 'No cached scans found to invalidate');
        return 0;
      }

      // Delete all matching keys
      let deletedCount = 0;
      for (const key of keys) {
        await this.redis.delete({ key });
        deletedCount++;
      }

      logger.info({
        repoPath,
        keysDeleted: deletedCount
      }, 'Cache invalidated successfully');

      return deletedCount;
    } catch (error) {
      logError(logger, error, 'Failed to invalidate cache', { repoPath });
      return 0;
    }
  }

    /**
   * Get the stats.
   *
   * @returns {Promise<CacheStats>} The stats
   * @async
   */
  async getStats(): Promise<CacheStats> {
    try {
      const pattern = `${this.keyPrefix}*`;
      const allKeys = await this.redis.scan_all_keys({ pattern });

      // Filter out index keys
      const cacheKeys = allKeys.filter(key => !key.endsWith(':index'));

      const stats: CacheStats = {
        total_cached_scans: cacheKeys.length,
        cache_enabled: this.enabled,
        ttl_seconds: this.ttl,
        ttl_days: Math.floor(this.ttl / (24 * 60 * 60)),
        prefix: this.keyPrefix
      };

      logger.info(stats, 'Retrieved cache statistics');

      return stats;
    } catch (error) {
      logError(logger, error, 'Failed to get cache statistics');
      return {
        total_cached_scans: 0,
        cache_enabled: this.enabled,
        ttl_seconds: this.ttl,
        ttl_days: Math.floor(this.ttl / (24 * 60 * 60)),
        prefix: this.keyPrefix,
        error: (error as Error).message
      };
    }
  }

    /**
   * List cached scans.
   *
   * @param {*} [limit=10] - The limit
   *
   * @returns {Promise<IndexEntry[]>} The Promise<IndexEntry[]>
   * @async
   */
  async listCachedScans(limit = 10): Promise<IndexEntry[]> {
    try {
      const indexKey = `${this.keyPrefix}index`;
      const entries = await this.redis.lrange({
        name: indexKey,
        start: 0,
        stop: limit - 1
      });

      const cachedScans = entries.map(entry => JSON.parse(entry) as IndexEntry);

      logger.info({ count: cachedScans.length }, 'Retrieved cached scan list');

      return cachedScans;
    } catch (error) {
      logError(logger, error, 'Failed to list cached scans');
      return [];
    }
  }

    /**
   * Get the cache metadata.
   *
   * @param {string} repoPath - The repoPath
   * @param {string | null} commitHash - The commitHash
   *
   * @returns {Promise<CacheMetadata | null>} The cache metadata
   * @async
   */
  async getCacheMetadata(repoPath: string, commitHash: string | null): Promise<CacheMetadata | null> {
    const cacheKey = this._generateCacheKey(repoPath, commitHash);

    try {
      const metadataStr = await this.redis.hget({ name: cacheKey, key: 'metadata' });

      if (!metadataStr) {
        return null;
      }

      const metadata = JSON.parse(metadataStr) as CacheMetadata;

      logger.debug({ cacheKey, repoPath }, 'Retrieved cache metadata');

      return metadata;
    } catch (error) {
      logError(logger, error, 'Failed to get cache metadata', { cacheKey, repoPath });
      return null;
    }
  }

    /**
   * Clear all.
   *
   * @returns {Promise<number>} The Promise<number>
   * @async
   */
  async clearAll(): Promise<number> {
    try {
      logger.warn('Clearing all cached scans');

      const pattern = `${this.keyPrefix}*`;
      const allKeys = await this.redis.scan_all_keys({ pattern });

      let deletedCount = 0;
      for (const key of allKeys) {
        await this.redis.delete({ key });
        deletedCount++;
      }

      logger.warn({ keysDeleted: deletedCount }, 'All cached scans cleared');

      return deletedCount;
    } catch (error) {
      logError(logger, error, 'Failed to clear all cached scans');
      return 0;
    }
  }

    /**
   * Check if cached.
   *
   * @param {string} repoPath - The repoPath
   * @param {string | null} commitHash - The commitHash
   *
   * @returns {Promise<boolean>} True if cached, False otherwise
   * @async
   */
  async isCached(repoPath: string, commitHash: string | null): Promise<boolean> {
    const cacheKey = this._generateCacheKey(repoPath, commitHash);

    try {
      const exists = await this.redis.hexists({ name: cacheKey, key: 'scan_result' });

      logger.debug({ cacheKey, repoPath, exists }, 'Checked if scan is cached');

      return exists;
    } catch (error) {
      logError(logger, error, 'Failed to check if scan is cached', { cacheKey, repoPath });
      return false;
    }
  }

    /**
   * Get the cache age.
   *
   * @param {string} repoPath - The repoPath
   * @param {string | null} commitHash - The commitHash
   *
   * @returns {Promise<number | null>} The cache age
   * @async
   */
  async getCacheAge(repoPath: string, commitHash: string | null): Promise<number | null> {
    const metadata = await this.getCacheMetadata(repoPath, commitHash);

    if (!metadata?.cached_at) {
      return null;
    }

    const age = Date.now() - new Date(metadata.cached_at).getTime();

    logger.debug({ repoPath, ageMs: age, ageDays: age / (24 * 60 * 60 * 1000) }, 'Calculated cache age');

    return age;
  }
}

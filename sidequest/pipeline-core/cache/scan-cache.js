/**
 * Scan Result Cache
 *
 * Caches duplicate detection scan results in Redis using Git commit hashes as keys.
 * Provides fast retrieval of scan results for unchanged repositories.
 */

import { createComponentLogger, logError } from '../../utils/logger.js';
import crypto from 'crypto';

const logger = createComponentLogger('ScanResultCache');

export class ScanResultCache {
  /**
   * @param {Object} redisClient - Redis MCP client
   * @param {Object} options - Cache options
   */
  constructor(redisClient, options = {}) {
    this.redis = redisClient;
    this.ttl = options.ttl || (30 * 24 * 60 * 60); // Default: 30 days in seconds
    this.keyPrefix = options.keyPrefix || 'scan:';
    this.enabled = options.enabled !== false;
  }

  /**
   * Generate cache key for a repository scan
   * @param {string} repoPath - Repository path
   * @param {string} commitHash - Git commit hash
   * @returns {string} - Cache key
   */
  _generateCacheKey(repoPath, commitHash) {
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
   * Get cached scan result
   * @param {string} repoPath - Repository path
   * @param {string} commitHash - Git commit hash
   * @returns {Promise<Object|null>} - Cached scan result or null
   */
  async getCachedScan(repoPath, commitHash) {
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

      const scanResult = JSON.parse(cachedData);

      // Retrieve metadata
      const metadataStr = await this.redis.hget({ name: cacheKey, key: 'metadata' });
      const metadata = metadataStr ? JSON.parse(metadataStr) : {};

      logger.info({
        cacheKey,
        repoPath,
        cachedAt: metadata.cached_at,
        age: Date.now() - new Date(metadata.cached_at).getTime()
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
   * @param {string} repoPath - Repository path
   * @param {string} commitHash - Git commit hash
   * @param {Object} scanResult - Scan result to cache
   * @param {Object} options - Caching options
   * @returns {Promise<boolean>} - True if cached successfully
   */
  async cacheScan(repoPath, commitHash, scanResult, options = {}) {
    if (!this.enabled) {
      logger.debug('Cache disabled, skipping storage');
      return false;
    }

    const cacheKey = this._generateCacheKey(repoPath, commitHash);

    try {
      const metadata = {
        repository_path: repoPath,
        commit_hash: commitHash,
        short_commit: commitHash ? commitHash.substring(0, 7) : null,
        cached_at: new Date().toISOString(),
        ttl: this.ttl,
        scan_type: scanResult.scan_type || 'unknown',
        total_duplicates: scanResult.metrics?.total_duplicate_groups || 0,
        total_suggestions: scanResult.metrics?.total_suggestions || 0
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
   * @param {string} cacheKey - Cache key
   * @param {string} repoPath - Repository path
   * @param {string} commitHash - Commit hash
   * @private
   */
  async _addToIndex(cacheKey, repoPath, commitHash) {
    try {
      const indexKey = `${this.keyPrefix}index`;
      const indexEntry = JSON.stringify({
        cache_key: cacheKey,
        repository_path: repoPath,
        commit_hash: commitHash,
        indexed_at: new Date().toISOString()
      });

      await this.redis.lpush({
        name: indexKey,
        value: indexEntry,
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
   * Invalidate cache for a repository
   * @param {string} repoPath - Repository path
   * @returns {Promise<number>} - Number of keys invalidated
   */
  async invalidateCache(repoPath) {
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
   * Get cache statistics
   * @returns {Promise<Object>} - Cache statistics
   */
  async getStats() {
    try {
      const pattern = `${this.keyPrefix}*`;
      const allKeys = await this.redis.scan_all_keys({ pattern });

      // Filter out index keys
      const cacheKeys = allKeys.filter(key => !key.endsWith(':index'));

      const stats = {
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
        error: error.message
      };
    }
  }

  /**
   * List cached scans
   * @param {number} limit - Maximum number of scans to list
   * @returns {Promise<Array>} - Array of cached scan info
   */
  async listCachedScans(limit = 10) {
    try {
      const indexKey = `${this.keyPrefix}index`;
      const entries = await this.redis.lrange({
        name: indexKey,
        start: 0,
        stop: limit - 1
      });

      const cachedScans = entries.map(entry => JSON.parse(entry));

      logger.info({ count: cachedScans.length }, 'Retrieved cached scan list');

      return cachedScans;
    } catch (error) {
      logError(logger, error, 'Failed to list cached scans');
      return [];
    }
  }

  /**
   * Get cache metadata for a specific scan
   * @param {string} repoPath - Repository path
   * @param {string} commitHash - Commit hash
   * @returns {Promise<Object|null>} - Cache metadata
   */
  async getCacheMetadata(repoPath, commitHash) {
    const cacheKey = this._generateCacheKey(repoPath, commitHash);

    try {
      const metadataStr = await this.redis.hget({ name: cacheKey, key: 'metadata' });

      if (!metadataStr) {
        return null;
      }

      const metadata = JSON.parse(metadataStr);

      logger.debug({ cacheKey, repoPath }, 'Retrieved cache metadata');

      return metadata;
    } catch (error) {
      logError(logger, error, 'Failed to get cache metadata', { cacheKey, repoPath });
      return null;
    }
  }

  /**
   * Clear all cached scans
   * @returns {Promise<number>} - Number of keys cleared
   */
  async clearAll() {
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
   * Check if a scan is cached
   * @param {string} repoPath - Repository path
   * @param {string} commitHash - Commit hash
   * @returns {Promise<boolean>} - True if cached
   */
  async isCached(repoPath, commitHash) {
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
   * Get cache age in milliseconds
   * @param {string} repoPath - Repository path
   * @param {string} commitHash - Commit hash
   * @returns {Promise<number|null>} - Age in milliseconds, or null if not cached
   */
  async getCacheAge(repoPath, commitHash) {
    const metadata = await this.getCacheMetadata(repoPath, commitHash);

    if (!metadata || !metadata.cached_at) {
      return null;
    }

    const age = Date.now() - new Date(metadata.cached_at).getTime();

    logger.debug({ repoPath, ageMs: age, ageDays: age / (24 * 60 * 60 * 1000) }, 'Calculated cache age');

    return age;
  }
}

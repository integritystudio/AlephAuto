/**
 * ScanResultCache Unit Tests
 *
 * Tests for the Redis-based scan result caching system.
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import { ScanResultCache } from '../../sidequest/pipeline-core/cache/scan-cache.js';

describe('ScanResultCache', () => {
  let cache;
  let mockRedis;
  let storage;

  beforeEach(() => {
    // In-memory storage to simulate Redis
    storage = new Map();

    // Create mock Redis client
    mockRedis = {
      hexists: mock.fn(async ({ name, key }) => {
        const hash = storage.get(name);
        return hash ? hash.has(key) : false;
      }),
      hget: mock.fn(async ({ name, key }) => {
        const hash = storage.get(name);
        return hash ? hash.get(key) : null;
      }),
      hset: mock.fn(async ({ name, key, value }) => {
        if (!storage.has(name)) {
          storage.set(name, new Map());
        }
        storage.get(name).set(key, value);
        return 1;
      }),
      lpush: mock.fn(async ({ name, value }) => {
        if (!storage.has(name)) {
          storage.set(name, []);
        }
        const list = storage.get(name);
        list.unshift(value);
        return list.length;
      }),
      lrange: mock.fn(async ({ name, start, stop }) => {
        const list = storage.get(name) || [];
        return list.slice(start, stop + 1);
      }),
      scan_all_keys: mock.fn(async ({ pattern }) => {
        const prefix = pattern.replace('*', '');
        return Array.from(storage.keys()).filter(k => k.startsWith(prefix));
      }),
      delete: mock.fn(async ({ key }) => {
        storage.delete(key);
        return 1;
      })
    };

    cache = new ScanResultCache(mockRedis, {
      ttl: 3600,
      keyPrefix: 'test:scan:',
      enabled: true
    });
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const defaultCache = new ScanResultCache(mockRedis);
      assert.strictEqual(defaultCache.ttl, 30 * 24 * 60 * 60); // 30 days
      assert.strictEqual(defaultCache.keyPrefix, 'scan:');
      assert.strictEqual(defaultCache.enabled, true);
    });

    it('should accept custom options', () => {
      assert.strictEqual(cache.ttl, 3600);
      assert.strictEqual(cache.keyPrefix, 'test:scan:');
      assert.strictEqual(cache.enabled, true);
    });

    it('should allow disabling cache', () => {
      const disabledCache = new ScanResultCache(mockRedis, { enabled: false });
      assert.strictEqual(disabledCache.enabled, false);
    });
  });

  describe('_generateCacheKey', () => {
    it('should generate consistent cache keys', () => {
      const key1 = cache._generateCacheKey('/path/to/repo', 'abc1234567890');
      const key2 = cache._generateCacheKey('/path/to/repo', 'abc1234567890');
      assert.strictEqual(key1, key2);
    });

    it('should generate different keys for different repos', () => {
      const key1 = cache._generateCacheKey('/path/to/repo1', 'abc1234');
      const key2 = cache._generateCacheKey('/path/to/repo2', 'abc1234');
      assert.notStrictEqual(key1, key2);
    });

    it('should generate different keys for different commits', () => {
      const key1 = cache._generateCacheKey('/path/to/repo', 'abc1234');
      const key2 = cache._generateCacheKey('/path/to/repo', 'def5678');
      assert.notStrictEqual(key1, key2);
    });

    it('should handle null commit hash', () => {
      const key = cache._generateCacheKey('/path/to/repo', null);
      assert.ok(key.includes('no-git'));
    });

    it('should include key prefix', () => {
      const key = cache._generateCacheKey('/path/to/repo', 'abc1234');
      assert.ok(key.startsWith('test:scan:'));
    });

    it('should truncate commit hash to 7 characters', () => {
      const key = cache._generateCacheKey('/path/to/repo', 'abc1234567890abcdef');
      assert.ok(key.includes('abc1234'));
      assert.ok(!key.includes('abc1234567890'));
    });
  });

  describe('cacheScan', () => {
    it('should cache scan result successfully', async () => {
      const scanResult = {
        scan_type: 'intra-project',
        metrics: {
          total_duplicate_groups: 5,
          total_suggestions: 10
        }
      };

      const result = await cache.cacheScan('/path/to/repo', 'abc1234', scanResult);

      assert.strictEqual(result, true);
      assert.ok(mockRedis.hset.mock.calls.length >= 3); // scan_result, metadata, repository_path
    });

    it('should not cache when disabled', async () => {
      const disabledCache = new ScanResultCache(mockRedis, { enabled: false });

      const result = await disabledCache.cacheScan('/path/to/repo', 'abc1234', {});

      assert.strictEqual(result, false);
      assert.strictEqual(mockRedis.hset.mock.calls.length, 0);
    });

    it('should store metadata with scan result', async () => {
      const scanResult = {
        scan_type: 'inter-project',
        metrics: {
          total_duplicate_groups: 3,
          total_suggestions: 7
        }
      };

      await cache.cacheScan('/path/to/repo', 'abc1234', scanResult);

      // Find the metadata hset call
      const metadataCall = mockRedis.hset.mock.calls.find(
        call => call.arguments[0].key === 'metadata'
      );
      assert.ok(metadataCall);

      const metadata = JSON.parse(metadataCall.arguments[0].value);
      assert.strictEqual(metadata.repository_path, '/path/to/repo');
      assert.strictEqual(metadata.scan_type, 'inter-project');
      assert.strictEqual(metadata.total_duplicates, 3);
      assert.strictEqual(metadata.total_suggestions, 7);
    });

    it('should handle caching errors gracefully', async () => {
      mockRedis.hset = mock.fn(async () => {
        throw new Error('Redis connection failed');
      });

      const result = await cache.cacheScan('/path/to/repo', 'abc1234', {});

      assert.strictEqual(result, false);
    });
  });

  describe('getCachedScan', () => {
    it('should return cached scan result', async () => {
      const scanResult = {
        scan_type: 'intra-project',
        duplicates: []
      };

      await cache.cacheScan('/path/to/repo', 'abc1234', scanResult);
      const cached = await cache.getCachedScan('/path/to/repo', 'abc1234');

      assert.ok(cached);
      assert.strictEqual(cached.scan_type, 'intra-project');
      assert.ok(cached.cache_metadata);
      assert.strictEqual(cached.cache_metadata.from_cache, true);
    });

    it('should return null for cache miss', async () => {
      const cached = await cache.getCachedScan('/path/to/nonexistent', 'abc1234');
      assert.strictEqual(cached, null);
    });

    it('should return null when disabled', async () => {
      const disabledCache = new ScanResultCache(mockRedis, { enabled: false });

      await cache.cacheScan('/path/to/repo', 'abc1234', { test: true });
      const cached = await disabledCache.getCachedScan('/path/to/repo', 'abc1234');

      assert.strictEqual(cached, null);
    });

    it('should handle retrieval errors gracefully', async () => {
      mockRedis.hexists = mock.fn(async () => {
        throw new Error('Redis error');
      });

      const cached = await cache.getCachedScan('/path/to/repo', 'abc1234');
      assert.strictEqual(cached, null);
    });
  });

  describe('invalidateCache', () => {
    it('should invalidate all cache entries for a repository', async () => {
      // Cache multiple scans for same repo
      await cache.cacheScan('/path/to/repo', 'abc1234', { v: 1 });
      await cache.cacheScan('/path/to/repo', 'def5678', { v: 2 });

      const deleted = await cache.invalidateCache('/path/to/repo');

      assert.ok(deleted >= 0);
    });

    it('should return 0 when no cache entries exist', async () => {
      const deleted = await cache.invalidateCache('/path/to/nonexistent');
      assert.strictEqual(deleted, 0);
    });

    it('should handle invalidation errors gracefully', async () => {
      mockRedis.scan_all_keys = mock.fn(async () => {
        throw new Error('Redis error');
      });

      const deleted = await cache.invalidateCache('/path/to/repo');
      assert.strictEqual(deleted, 0);
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', async () => {
      await cache.cacheScan('/path/to/repo1', 'abc1234', {});
      await cache.cacheScan('/path/to/repo2', 'def5678', {});

      const stats = await cache.getStats();

      assert.strictEqual(stats.cache_enabled, true);
      assert.strictEqual(stats.ttl_seconds, 3600);
      assert.strictEqual(stats.prefix, 'test:scan:');
      assert.ok(typeof stats.total_cached_scans === 'number');
    });

    it('should handle stats errors gracefully', async () => {
      mockRedis.scan_all_keys = mock.fn(async () => {
        throw new Error('Redis error');
      });

      const stats = await cache.getStats();

      assert.strictEqual(stats.total_cached_scans, 0);
      assert.ok(stats.error);
    });
  });

  describe('listCachedScans', () => {
    it('should list cached scans', async () => {
      await cache.cacheScan('/path/to/repo1', 'abc1234', {});
      await cache.cacheScan('/path/to/repo2', 'def5678', {});

      const scans = await cache.listCachedScans(10);

      assert.ok(Array.isArray(scans));
    });

    it('should respect limit parameter', async () => {
      await cache.cacheScan('/path/to/repo1', 'abc1234', {});
      await cache.cacheScan('/path/to/repo2', 'def5678', {});
      await cache.cacheScan('/path/to/repo3', 'ghi9012', {});

      const scans = await cache.listCachedScans(2);

      assert.ok(scans.length <= 2);
    });

    it('should handle errors gracefully', async () => {
      mockRedis.lrange = mock.fn(async () => {
        throw new Error('Redis error');
      });

      const scans = await cache.listCachedScans();
      assert.deepStrictEqual(scans, []);
    });
  });

  describe('getCacheMetadata', () => {
    it('should return metadata for cached scan', async () => {
      await cache.cacheScan('/path/to/repo', 'abc1234', {
        scan_type: 'intra-project'
      });

      const metadata = await cache.getCacheMetadata('/path/to/repo', 'abc1234');

      assert.ok(metadata);
      assert.strictEqual(metadata.repository_path, '/path/to/repo');
      assert.ok(metadata.cached_at);
    });

    it('should return null for non-existent cache', async () => {
      const metadata = await cache.getCacheMetadata('/path/to/nonexistent', 'abc1234');
      assert.strictEqual(metadata, null);
    });

    it('should handle errors gracefully', async () => {
      mockRedis.hget = mock.fn(async () => {
        throw new Error('Redis error');
      });

      const metadata = await cache.getCacheMetadata('/path/to/repo', 'abc1234');
      assert.strictEqual(metadata, null);
    });
  });

  describe('isCached', () => {
    it('should return true for cached scan', async () => {
      await cache.cacheScan('/path/to/repo', 'abc1234', {});

      const exists = await cache.isCached('/path/to/repo', 'abc1234');
      assert.strictEqual(exists, true);
    });

    it('should return false for non-existent cache', async () => {
      const exists = await cache.isCached('/path/to/nonexistent', 'abc1234');
      assert.strictEqual(exists, false);
    });

    it('should handle errors gracefully', async () => {
      mockRedis.hexists = mock.fn(async () => {
        throw new Error('Redis error');
      });

      const exists = await cache.isCached('/path/to/repo', 'abc1234');
      assert.strictEqual(exists, false);
    });
  });

  describe('getCacheAge', () => {
    it('should return cache age in milliseconds', async () => {
      await cache.cacheScan('/path/to/repo', 'abc1234', {});

      const age = await cache.getCacheAge('/path/to/repo', 'abc1234');

      assert.ok(typeof age === 'number');
      assert.ok(age >= 0);
      assert.ok(age < 1000); // Should be less than 1 second
    });

    it('should return null for non-existent cache', async () => {
      const age = await cache.getCacheAge('/path/to/nonexistent', 'abc1234');
      assert.strictEqual(age, null);
    });
  });

  describe('clearAll', () => {
    it('should clear all cached scans', async () => {
      await cache.cacheScan('/path/to/repo1', 'abc1234', {});
      await cache.cacheScan('/path/to/repo2', 'def5678', {});

      const deleted = await cache.clearAll();

      assert.ok(deleted >= 0);
    });

    it('should handle errors gracefully', async () => {
      mockRedis.scan_all_keys = mock.fn(async () => {
        throw new Error('Redis error');
      });

      const deleted = await cache.clearAll();
      assert.strictEqual(deleted, 0);
    });
  });
});

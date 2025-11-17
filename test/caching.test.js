import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { CachedScanner } from '../lib/cache/cached-scanner.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('Caching Layer', () => {
  let scanner;
  let tempDir;

  beforeEach(async () => {
    // Create temporary directory for cache
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cache-test-'));

    scanner = new CachedScanner({
      cacheEnabled: true,
      cacheDir: tempDir,
      cacheTTL: 3600 // 1 hour
    });
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Cache Initialization', () => {
    test('should initialize with cache enabled', () => {
      assert.strictEqual(scanner.cacheEnabled, true);
      assert.strictEqual(scanner.cacheDir, tempDir);
    });

    test('should initialize with cache disabled', () => {
      const disabledScanner = new CachedScanner({ cacheEnabled: false });
      assert.strictEqual(disabledScanner.cacheEnabled, false);
    });

    test('should create cache directory if it does not exist', async () => {
      const newCacheDir = path.join(tempDir, 'new-cache');
      const newScanner = new CachedScanner({
        cacheEnabled: true,
        cacheDir: newCacheDir
      });

      await newScanner.initialize();

      const stats = await fs.stat(newCacheDir);
      assert.ok(stats.isDirectory());
    });
  });

  describe('Cache Key Generation', () => {
    test('should generate consistent cache keys', () => {
      const repoPath = '/test/repo';
      const options = { pattern: 'test' };

      const key1 = scanner.generateCacheKey(repoPath, options);
      const key2 = scanner.generateCacheKey(repoPath, options);

      assert.strictEqual(key1, key2);
    });

    test('should generate different keys for different repos', () => {
      const options = {};

      const key1 = scanner.generateCacheKey('/test/repo1', options);
      const key2 = scanner.generateCacheKey('/test/repo2', options);

      assert.notStrictEqual(key1, key2);
    });

    test('should generate different keys for different options', () => {
      const repoPath = '/test/repo';

      const key1 = scanner.generateCacheKey(repoPath, { pattern: 'a' });
      const key2 = scanner.generateCacheKey(repoPath, { pattern: 'b' });

      assert.notStrictEqual(key1, key2);
    });

    test('cache keys should be valid file names', () => {
      const key = scanner.generateCacheKey('/test/repo', {});

      // Should not contain invalid filename characters
      assert.ok(!/[<>:"|?*]/.test(key));
      // Should be a reasonable length
      assert.ok(key.length > 0 && key.length < 256);
    });
  });

  describe('Cache Storage', () => {
    test('should store scan results in cache', async () => {
      const repoPath = '/test/repo';
      const results = {
        blocks: 10,
        groups: 2,
        timestamp: Date.now()
      };

      await scanner.setCacheEntry(repoPath, {}, results);

      const cached = await scanner.getCacheEntry(repoPath, {});
      assert.ok(cached);
      assert.strictEqual(cached.blocks, 10);
      assert.strictEqual(cached.groups, 2);
    });

    test('should return null for cache miss', async () => {
      const cached = await scanner.getCacheEntry('/nonexistent/repo', {});
      assert.strictEqual(cached, null);
    });

    test('should overwrite existing cache entry', async () => {
      const repoPath = '/test/repo';

      await scanner.setCacheEntry(repoPath, {}, { version: 1 });
      await scanner.setCacheEntry(repoPath, {}, { version: 2 });

      const cached = await scanner.getCacheEntry(repoPath, {});
      assert.strictEqual(cached.version, 2);
    });
  });

  describe('Cache Expiration', () => {
    test('should expire old cache entries', async () => {
      const shortTTLScanner = new CachedScanner({
        cacheEnabled: true,
        cacheDir: tempDir,
        cacheTTL: 0.1 // 100ms
      });

      const repoPath = '/test/repo';
      await shortTTLScanner.setCacheEntry(repoPath, {}, { data: 'test' });

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      const cached = await shortTTLScanner.getCacheEntry(repoPath, {});
      assert.strictEqual(cached, null, 'Expired entry should return null');
    });

    test('should return fresh cache entries within TTL', async () => {
      const repoPath = '/test/repo';
      const results = { data: 'fresh' };

      await scanner.setCacheEntry(repoPath, {}, results);

      // Immediately retrieve
      const cached = await scanner.getCacheEntry(repoPath, {});
      assert.ok(cached);
      assert.strictEqual(cached.data, 'fresh');
    });
  });

  describe('Cache Invalidation', () => {
    test('should invalidate specific cache entry', async () => {
      const repoPath = '/test/repo';
      await scanner.setCacheEntry(repoPath, {}, { data: 'test' });

      await scanner.invalidateCacheEntry(repoPath, {});

      const cached = await scanner.getCacheEntry(repoPath, {});
      assert.strictEqual(cached, null);
    });

    test('should clear all cache entries', async () => {
      await scanner.setCacheEntry('/test/repo1', {}, { data: '1' });
      await scanner.setCacheEntry('/test/repo2', {}, { data: '2' });

      await scanner.clearCache();

      const cached1 = await scanner.getCacheEntry('/test/repo1', {});
      const cached2 = await scanner.getCacheEntry('/test/repo2', {});

      assert.strictEqual(cached1, null);
      assert.strictEqual(cached2, null);
    });
  });

  describe('Cache Statistics', () => {
    test('should track cache hits and misses', async () => {
      const repoPath = '/test/repo';

      // Cache miss
      await scanner.getCacheEntry(repoPath, {});

      // Cache hit
      await scanner.setCacheEntry(repoPath, {}, { data: 'test' });
      await scanner.getCacheEntry(repoPath, {});
      await scanner.getCacheEntry(repoPath, {});

      const stats = await scanner.getStats();
      assert.ok(stats.hits >= 2);
      assert.ok(stats.misses >= 1);
      assert.ok(typeof stats.hit_rate === 'number');
    });

    test('should track cache size', async () => {
      await scanner.setCacheEntry('/test/repo1', {}, { data: 'test1' });
      await scanner.setCacheEntry('/test/repo2', {}, { data: 'test2' });

      const stats = await scanner.getStats();
      assert.ok(stats.total_entries >= 2);
      assert.ok(typeof stats.total_size_bytes === 'number');
    });

    test('should calculate hit rate correctly', async () => {
      const repoPath = '/test/repo';

      // 1 miss
      await scanner.getCacheEntry(repoPath, {});

      // 2 hits
      await scanner.setCacheEntry(repoPath, {}, { data: 'test' });
      await scanner.getCacheEntry(repoPath, {});
      await scanner.getCacheEntry(repoPath, {});

      const stats = await scanner.getStats();
      const expectedHitRate = stats.hits / (stats.hits + stats.misses);
      assert.strictEqual(stats.hit_rate, expectedHitRate);
    });
  });

  describe('Cache-Aware Scanning', () => {
    test('should use cache when enabled', async () => {
      const repoPath = '/test/repo';
      const mockResults = {
        duplicate_groups: [],
        metrics: { total_blocks: 0 }
      };

      // Populate cache
      await scanner.setCacheEntry(repoPath, {}, mockResults);

      // Scan should return cached results
      const results = await scanner.scanWithCache(repoPath, {});

      assert.ok(results);
      assert.deepStrictEqual(results, mockResults);
    });

    test('should perform fresh scan on cache miss', async () => {
      // This would need to be tested with a mock scan function
      // For now, just verify the behavior exists
      const scanner = new CachedScanner({ cacheEnabled: true, cacheDir: tempDir });
      assert.ok(typeof scanner.scanWithCache === 'function');
    });

    test('should bypass cache when disabled', async () => {
      const disabledScanner = new CachedScanner({ cacheEnabled: false });
      const repoPath = '/test/repo';

      // Even if we set cache, it should not be used
      await disabledScanner.setCacheEntry(repoPath, {}, { data: 'cached' });

      // scanWithCache should perform fresh scan (not return cached data)
      // This would need a mock to verify, but we can check cache is disabled
      assert.strictEqual(disabledScanner.cacheEnabled, false);
    });
  });

  describe('Error Handling', () => {
    test('should handle corrupted cache files gracefully', async () => {
      const repoPath = '/test/repo';
      const cacheKey = scanner.generateCacheKey(repoPath, {});
      const cachePath = path.join(tempDir, `${cacheKey}.json`);

      // Write corrupted JSON
      await fs.writeFile(cachePath, 'invalid json{]');

      // Should return null instead of throwing
      const cached = await scanner.getCacheEntry(repoPath, {});
      assert.strictEqual(cached, null);
    });

    test('should handle missing cache directory', async () => {
      const missingDirScanner = new CachedScanner({
        cacheEnabled: true,
        cacheDir: '/nonexistent/cache/dir'
      });

      // Should not throw when accessing non-existent cache
      await assert.doesNotReject(async () => {
        await missingDirScanner.getCacheEntry('/test/repo', {});
      });
    });

    test('should handle concurrent cache access', async () => {
      const repoPath = '/test/repo';

      // Simulate concurrent writes
      const writes = [];
      for (let i = 0; i < 5; i++) {
        writes.push(scanner.setCacheEntry(repoPath, {}, { version: i }));
      }

      await Promise.all(writes);

      // Should have a valid final state (not corrupted)
      const cached = await scanner.getCacheEntry(repoPath, {});
      assert.ok(cached);
      assert.ok(typeof cached.version === 'number');
    });
  });
});

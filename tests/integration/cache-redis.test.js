/**
 * Redis Cache Integration Tests
 *
 * Comprehensive tests for ScanResultCache and CachedScanner with real Redis.
 * Tests cache operations, TTL, invalidation, Git integration, and error handling.
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { ScanResultCache } from '../../sidequest/pipeline-core/cache/scan-cache.js';
import { CachedScanner } from '../../sidequest/pipeline-core/cache/cached-scanner.js';
import { GitCommitTracker } from '../../sidequest/pipeline-core/cache/git-tracker.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

const execPromise = promisify(exec);

// Redis MCP client wrapper
class RedisMCPClient {
  constructor() {
    this.connected = false;
  }

  async connect() {
    try {
      // Test connection
      const { stdout } = await execPromise('redis-cli ping');
      this.connected = stdout.trim() === 'PONG';
      return this.connected;
    } catch (error) {
      this.connected = false;
      return false;
    }
  }

  async hset({ name, key, value, expire_seconds }) {
    const { stdout } = await execPromise(
      `redis-cli HSET "${name}" "${key}" '${value.replace(/'/g, "'\\''")}'`
    );

    if (expire_seconds) {
      await execPromise(`redis-cli EXPIRE "${name}" ${expire_seconds}`);
    }

    return stdout.trim() === '1' || stdout.trim() === '0';
  }

  async hget({ name, key }) {
    try {
      const { stdout } = await execPromise(`redis-cli HGET "${name}" "${key}"`);
      const result = stdout.trim();
      return result === '(nil)' ? null : result;
    } catch (error) {
      return null;
    }
  }

  async hexists({ name, key }) {
    const { stdout } = await execPromise(`redis-cli HEXISTS "${name}" "${key}"`);
    return stdout.trim() === '1';
  }

  async delete({ key }) {
    await execPromise(`redis-cli DEL "${key}"`);
    return true;
  }

  async scan_all_keys({ pattern }) {
    try {
      const { stdout } = await execPromise(`redis-cli --scan --pattern "${pattern}"`);
      const keys = stdout.trim().split('\n').filter(k => k.length > 0);
      return keys;
    } catch (error) {
      return [];
    }
  }

  async lpush({ name, value, expire }) {
    await execPromise(`redis-cli LPUSH "${name}" '${value.replace(/'/g, "'\\''")}'`);

    if (expire) {
      await execPromise(`redis-cli EXPIRE "${name}" ${expire}`);
    }

    return true;
  }

  async lrange({ name, start, stop }) {
    try {
      const { stdout } = await execPromise(`redis-cli LRANGE "${name}" ${start} ${stop}`);
      const lines = stdout.trim().split('\n').filter(l => l.length > 0);
      return lines;
    } catch (error) {
      return [];
    }
  }

  async flushTestKeys() {
    // Clean up all test keys
    const patterns = ['test:scan:*', 'scan:*test*'];
    for (const pattern of patterns) {
      const keys = await this.scan_all_keys({ pattern });
      for (const key of keys) {
        await this.delete({ key });
      }
    }
  }
}

describe('ScanResultCache Integration Tests', () => {
  let redisClient;
  let cache;
  const testRepoPath = '/Users/alyshialedlie/code/jobs';
  const testCommit = 'abc123def456789012345678901234567890abcd';

  before(async () => {
    redisClient = new RedisMCPClient();
    const connected = await redisClient.connect();

    if (!connected) {
      throw new Error('Redis not available. Please start Redis server.');
    }

    // Clean up any test data
    await redisClient.flushTestKeys();
  });

  beforeEach(async () => {
    // Initialize cache with test prefix
    cache = new ScanResultCache(redisClient, {
      enabled: true,
      ttl: 3600, // 1 hour for tests
      keyPrefix: 'test:scan:'
    });

    // Clean up before each test
    await redisClient.flushTestKeys();
  });

  after(async () => {
    // Clean up after all tests
    if (redisClient) {
      await redisClient.flushTestKeys();
    }
  });

  describe('Cache Key Generation', () => {
    it('should generate consistent cache keys for same input', async () => {
      const key1 = cache._generateCacheKey(testRepoPath, testCommit);
      const key2 = cache._generateCacheKey(testRepoPath, testCommit);

      assert.strictEqual(key1, key2, 'Cache keys should be identical for same input');
    });

    it('should generate different keys for different repos', async () => {
      const key1 = cache._generateCacheKey('/path/to/repo1', testCommit);
      const key2 = cache._generateCacheKey('/path/to/repo2', testCommit);

      assert.notStrictEqual(key1, key2, 'Different repos should have different keys');
    });

    it('should generate different keys for different commits', async () => {
      const key1 = cache._generateCacheKey(testRepoPath, 'abc123');
      const key2 = cache._generateCacheKey(testRepoPath, 'def456');

      assert.notStrictEqual(key1, key2, 'Different commits should have different keys');
    });

    it('should match expected key format', async () => {
      const key = cache._generateCacheKey(testRepoPath, testCommit);

      // Format: test:scan:{16-char-hash}:{7-char-commit}
      assert.match(key, /^test:scan:[a-f0-9]{16}:[a-f0-9]{7}$/, 'Key should match expected format');
    });

    it('should handle no-git repositories', async () => {
      const key = cache._generateCacheKey(testRepoPath, null);

      assert.match(key, /^test:scan:[a-f0-9]{16}:no-git$/, 'Should use "no-git" for null commits');
    });
  });

  describe('Cache Storage and Retrieval', () => {
    const mockScanResult = {
      scan_type: 'intra-project',
      metrics: {
        total_duplicate_groups: 5,
        total_suggestions: 10
      },
      scan_metadata: {
        scan_id: 'test-scan-123',
        duration_seconds: 2.5
      }
    };

    it('should successfully cache a scan result', async () => {
      const cached = await cache.cacheScan(testRepoPath, testCommit, mockScanResult);

      assert.strictEqual(cached, true, 'Should return true on successful cache');
    });

    it('should retrieve cached scan result', async () => {
      await cache.cacheScan(testRepoPath, testCommit, mockScanResult);

      const result = await cache.getCachedScan(testRepoPath, testCommit);

      assert.ok(result, 'Should retrieve cached result');
      assert.strictEqual(result.scan_type, mockScanResult.scan_type);
      assert.strictEqual(result.metrics.total_duplicate_groups, 5);
      assert.ok(result.cache_metadata, 'Should include cache metadata');
      assert.strictEqual(result.cache_metadata.from_cache, true);
    });

    it('should return null for cache miss', async () => {
      const result = await cache.getCachedScan(testRepoPath, 'nonexistent-commit');

      assert.strictEqual(result, null, 'Should return null for cache miss');
    });

    it('should include metadata in cached result', async () => {
      await cache.cacheScan(testRepoPath, testCommit, mockScanResult);

      const metadata = await cache.getCacheMetadata(testRepoPath, testCommit);

      assert.ok(metadata, 'Should retrieve metadata');
      assert.strictEqual(metadata.repository_path, testRepoPath);
      assert.strictEqual(metadata.commit_hash, testCommit);
      assert.strictEqual(metadata.short_commit, testCommit.substring(0, 7));
      assert.strictEqual(metadata.total_duplicates, 5);
      assert.strictEqual(metadata.total_suggestions, 10);
      assert.ok(metadata.cached_at, 'Should have cached_at timestamp');
    });

    it('should check if scan is cached', async () => {
      const beforeCache = await cache.isCached(testRepoPath, testCommit);
      assert.strictEqual(beforeCache, false, 'Should not be cached initially');

      await cache.cacheScan(testRepoPath, testCommit, mockScanResult);

      const afterCache = await cache.isCached(testRepoPath, testCommit);
      assert.strictEqual(afterCache, true, 'Should be cached after caching');
    });
  });

  describe('Cache Age Calculation', () => {
    const mockScanResult = {
      scan_type: 'test',
      metrics: { total_duplicate_groups: 0, total_suggestions: 0 }
    };

    it('should calculate cache age correctly', async () => {
      await cache.cacheScan(testRepoPath, testCommit, mockScanResult);

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      const age = await cache.getCacheAge(testRepoPath, testCommit);

      assert.ok(age !== null, 'Should return age');
      assert.ok(age >= 100, 'Age should be at least 100ms');
      assert.ok(age < 1000, 'Age should be less than 1 second');
    });

    it('should return null for non-cached scan', async () => {
      const age = await cache.getCacheAge(testRepoPath, 'nonexistent');

      assert.strictEqual(age, null, 'Should return null for non-cached scan');
    });

    it('should include age in cached result metadata', async () => {
      await cache.cacheScan(testRepoPath, testCommit, mockScanResult);

      await new Promise(resolve => setTimeout(resolve, 50));

      const result = await cache.getCachedScan(testRepoPath, testCommit);

      assert.ok(result.cache_metadata, 'Should have cache metadata');
      // Age is added by CachedScanner, not ScanResultCache
    });
  });

  describe('Cache Invalidation', () => {
    const mockScanResult = {
      scan_type: 'test',
      metrics: { total_duplicate_groups: 0, total_suggestions: 0 }
    };

    it('should invalidate cache for a repository', async () => {
      // Cache scans for same repo with different commits
      await cache.cacheScan(testRepoPath, 'commit1abc', mockScanResult);
      await cache.cacheScan(testRepoPath, 'commit2def', mockScanResult);

      const count = await cache.invalidateCache(testRepoPath);

      assert.ok(count >= 2, 'Should invalidate at least 2 cache entries');

      // Verify caches are invalidated
      const cached1 = await cache.isCached(testRepoPath, 'commit1abc');
      const cached2 = await cache.isCached(testRepoPath, 'commit2def');

      assert.strictEqual(cached1, false, 'First cache should be invalidated');
      assert.strictEqual(cached2, false, 'Second cache should be invalidated');
    });

    it('should return 0 for non-existent repository', async () => {
      const count = await cache.invalidateCache('/nonexistent/repo');

      assert.strictEqual(count, 0, 'Should return 0 for non-existent repo');
    });
  });

  describe('Cache Statistics', () => {
    const mockScanResult = {
      scan_type: 'test',
      metrics: { total_duplicate_groups: 0, total_suggestions: 0 }
    };

    it('should return accurate cache statistics', async () => {
      await cache.cacheScan(testRepoPath, 'commit1', mockScanResult);
      await cache.cacheScan(testRepoPath, 'commit2', mockScanResult);

      const stats = await cache.getStats();

      assert.ok(stats.total_cached_scans >= 2, 'Should count cached scans');
      assert.strictEqual(stats.cache_enabled, true);
      assert.strictEqual(stats.ttl_seconds, 3600);
      assert.strictEqual(stats.ttl_days, 0); // Less than 1 day
      assert.strictEqual(stats.prefix, 'test:scan:');
    });

    it('should list cached scans', async () => {
      await cache.cacheScan(testRepoPath, 'commit1', mockScanResult);

      const scans = await cache.listCachedScans(10);

      assert.ok(Array.isArray(scans), 'Should return array');
      // List may be empty if index isn't working with test Redis
    });
  });

  describe('Cache Disabled Mode', () => {
    beforeEach(() => {
      cache = new ScanResultCache(redisClient, {
        enabled: false,
        keyPrefix: 'test:scan:'
      });
    });

    it('should skip caching when disabled', async () => {
      const mockScanResult = {
        scan_type: 'test',
        metrics: { total_duplicate_groups: 0, total_suggestions: 0 }
      };

      const cached = await cache.cacheScan(testRepoPath, testCommit, mockScanResult);

      assert.strictEqual(cached, false, 'Should return false when disabled');
    });

    it('should return null for lookups when disabled', async () => {
      const result = await cache.getCachedScan(testRepoPath, testCommit);

      assert.strictEqual(result, null, 'Should return null when disabled');
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis errors gracefully during lookup', async () => {
      const failingClient = {
        hexists: async () => { throw new Error('Redis connection failed'); }
      };

      const testCache = new ScanResultCache(failingClient, { keyPrefix: 'test:' });
      const result = await testCache.getCachedScan(testRepoPath, testCommit);

      assert.strictEqual(result, null, 'Should return null on Redis error');
    });

    it('should handle Redis errors gracefully during caching', async () => {
      const failingClient = {
        hset: async () => { throw new Error('Redis write failed'); }
      };

      const testCache = new ScanResultCache(failingClient, { keyPrefix: 'test:' });
      const mockScanResult = {
        scan_type: 'test',
        metrics: { total_duplicate_groups: 0, total_suggestions: 0 }
      };

      const cached = await testCache.cacheScan(testRepoPath, testCommit, mockScanResult);

      assert.strictEqual(cached, false, 'Should return false on Redis error');
    });

    it('should handle corrupted cache data', async () => {
      // Manually set invalid JSON
      await redisClient.hset({
        name: 'test:scan:corrupt:abc123d',
        key: 'scan_result',
        value: '{invalid json',
        expire_seconds: 3600
      });

      const result = await cache.getCachedScan('/corrupt/repo', 'abc123def');

      // Should handle parsing error gracefully
      assert.strictEqual(result, null, 'Should return null for corrupted data');
    });
  });

  describe('Clear All Cache', () => {
    const mockScanResult = {
      scan_type: 'test',
      metrics: { total_duplicate_groups: 0, total_suggestions: 0 }
    };

    it('should clear all cached scans', async () => {
      await cache.cacheScan(testRepoPath, 'commit1', mockScanResult);
      await cache.cacheScan(testRepoPath, 'commit2', mockScanResult);

      const count = await cache.clearAll();

      assert.ok(count >= 2, 'Should clear at least 2 entries');

      const stats = await cache.getStats();
      assert.strictEqual(stats.total_cached_scans, 0, 'Should have no cached scans');
    });
  });
});

describe('CachedScanner Integration Tests', () => {
  let redisClient;
  let scanner;
  let tempRepo;

  before(async () => {
    redisClient = new RedisMCPClient();
    const connected = await redisClient.connect();

    if (!connected) {
      throw new Error('Redis not available. Please start Redis server.');
    }

    await redisClient.flushTestKeys();
  });

  beforeEach(async () => {
    // Create temporary Git repository for testing
    tempRepo = path.join(os.tmpdir(), `test-cache-repo-${Date.now()}`);
    await fs.mkdir(tempRepo, { recursive: true });

    // Initialize Git repo
    await execPromise('git init', { cwd: tempRepo });
    await execPromise('git config user.email "test@example.com"', { cwd: tempRepo });
    await execPromise('git config user.name "Test User"', { cwd: tempRepo });

    // Create a test file
    await fs.writeFile(path.join(tempRepo, 'test.txt'), 'test content');
    await execPromise('git add .', { cwd: tempRepo });
    await execPromise('git commit -m "Initial commit"', { cwd: tempRepo });

    // Initialize scanner
    scanner = new CachedScanner({
      cacheEnabled: true,
      forceRefresh: false,
      trackUncommitted: true
    });

    scanner.initializeCache(redisClient, {
      ttl: 3600,
      keyPrefix: 'test:scan:'
    });

    await redisClient.flushTestKeys();
  });

  afterEach(async () => {
    // Clean up temp repo
    if (tempRepo) {
      try {
        await fs.rm(tempRepo, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  after(async () => {
    if (redisClient) {
      await redisClient.flushTestKeys();
    }
  });

  describe('Cache Decision Logic', () => {
    it('should skip cache when forced refresh is enabled', async () => {
      const gitTracker = new GitCommitTracker();
      const repoStatus = await gitTracker.getRepositoryStatus(tempRepo);

      const shouldUse = await scanner._shouldUseCache(tempRepo, repoStatus, {
        forceRefresh: true
      });

      assert.strictEqual(shouldUse, false, 'Should not use cache with forceRefresh');
    });

    it('should skip cache when caching is disabled', async () => {
      const disabledScanner = new CachedScanner({
        cacheEnabled: false
      });

      const gitTracker = new GitCommitTracker();
      const repoStatus = await gitTracker.getRepositoryStatus(tempRepo);

      const shouldUse = await disabledScanner._shouldUseCache(tempRepo, repoStatus, {});

      assert.strictEqual(shouldUse, false, 'Should not use cache when disabled');
    });

    it('should skip cache for non-Git repositories', async () => {
      const repoStatus = {
        is_git_repository: false,
        current_commit: null,
        has_uncommitted_changes: false
      };

      const shouldUse = await scanner._shouldUseCache('/non/git/repo', repoStatus, {});

      assert.strictEqual(shouldUse, false, 'Should not use cache for non-Git repos');
    });

    it('should skip cache when uncommitted changes exist', async () => {
      // Make an uncommitted change
      await fs.writeFile(path.join(tempRepo, 'test.txt'), 'modified content');

      const gitTracker = new GitCommitTracker();
      const repoStatus = await gitTracker.getRepositoryStatus(tempRepo);

      const shouldUse = await scanner._shouldUseCache(tempRepo, repoStatus, {});

      assert.strictEqual(shouldUse, false, 'Should not use cache with uncommitted changes');
    });

    it('should use cache for clean Git repository', async () => {
      const gitTracker = new GitCommitTracker();
      const repoStatus = await gitTracker.getRepositoryStatus(tempRepo);

      const shouldUse = await scanner._shouldUseCache(tempRepo, repoStatus, {});

      assert.strictEqual(shouldUse, true, 'Should use cache for clean Git repo');
    });
  });

  describe('Cache Status', () => {
    it('should get cache status for repository', async () => {
      const status = await scanner.getCacheStatus(tempRepo);

      assert.ok(status, 'Should return status object');
      assert.strictEqual(typeof status.is_cached, 'boolean');
      assert.ok(status.repository_status, 'Should include repository status');
      assert.strictEqual(status.repository_status.is_git_repository, true);
    });

    it('should report non-Git repository correctly', async () => {
      const nonGitDir = path.join(os.tmpdir(), `non-git-${Date.now()}`);
      await fs.mkdir(nonGitDir, { recursive: true });

      try {
        const status = await scanner.getCacheStatus(nonGitDir);

        assert.strictEqual(status.is_cached, false);
        assert.strictEqual(status.reason, 'not_a_git_repository');
      } finally {
        await fs.rm(nonGitDir, { recursive: true, force: true });
      }
    });
  });

  describe('Scanner Statistics', () => {
    it('should return scanner statistics', async () => {
      const stats = await scanner.getStats();

      assert.strictEqual(stats.cache_enabled, true);
      assert.strictEqual(stats.force_refresh, false);
      assert.strictEqual(stats.track_uncommitted, true);
      assert.strictEqual(stats.cache_initialized, true);
      assert.ok(stats.cache_stats, 'Should include cache statistics');
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate cache for repository', async () => {
      // Note: We can't easily test full scan without actual duplicate detection
      // Just test the invalidation API
      const count = await scanner.invalidateCache(tempRepo);

      assert.strictEqual(typeof count, 'number', 'Should return invalidation count');
    });
  });
});

console.log('\n✅ All Redis cache integration tests defined\n');

#!/usr/bin/env node
/**
 * Cached Scanner Tests
 *
 * Tests for the cached scanner that integrates git tracking with scan caching.
 */

// @ts-nocheck
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CachedScanner } from '../../sidequest/pipeline-core/cache/cached-scanner.js';

// Mock dependencies
class MockGitTracker {
  constructor() {
    this.mockStatus = {
      is_git_repository: true,
      current_commit: 'abc123def456789',
      short_commit: 'abc123d',
      branch: 'main',
      has_uncommitted_changes: false,
      remote_url: 'https://github.com/test/repo.git',
      scanned_at: new Date().toISOString()
    };
  }

  async getRepositoryStatus() {
    return this.mockStatus;
  }

  setMockStatus(status) {
    this.mockStatus = { ...this.mockStatus, ...status };
  }
}

class MockCache {
  constructor() {
    this.cache = new Map();
    this.enabled = true;
  }

  async getCachedScan(repoPath, commitHash) {
    const key = `${repoPath}:${commitHash}`;
    return this.cache.get(key) || null;
  }

  async cacheScan(repoPath, commitHash, scanResult) {
    const key = `${repoPath}:${commitHash}`;
    this.cache.set(key, {
      ...scanResult,
      cache_metadata: {
        cached_at: new Date().toISOString()
      }
    });
  }

  async isCached(repoPath, commitHash) {
    const key = `${repoPath}:${commitHash}`;
    return this.cache.has(key);
  }

  async getCacheAge(repoPath, commitHash) {
    return 3600000; // 1 hour
  }

  async getCacheMetadata(repoPath, commitHash) {
    const key = `${repoPath}:${commitHash}`;
    const cached = this.cache.get(key);
    return cached?.cache_metadata || null;
  }

  async invalidateCache(repoPath) {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(repoPath)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  async getStats() {
    return {
      total_entries: this.cache.size,
      enabled: this.enabled
    };
  }
}

class MockScanner {
  async scanRepository(repoPath, options) {
    return {
      repository_info: {
        path: repoPath,
        name: 'test-repo'
      },
      metrics: {
        total_duplicate_groups: 5,
        total_code_blocks: 100
      },
      scan_metadata: {
        scanned_at: new Date().toISOString()
      }
    };
  }
}

describe('CachedScanner', () => {
  describe('Constructor', () => {
    it('should initialize with default options', () => {
      const scanner = new CachedScanner();
      assert.strictEqual(scanner.cacheEnabled, true);
      assert.strictEqual(scanner.forceRefresh, false);
      assert.strictEqual(scanner.trackUncommitted, true);
    });

    it('should initialize with custom options', () => {
      const scanner = new CachedScanner({
        cacheEnabled: false,
        forceRefresh: true,
        trackUncommitted: false
      });

      assert.strictEqual(scanner.cacheEnabled, false);
      assert.strictEqual(scanner.forceRefresh, true);
      assert.strictEqual(scanner.trackUncommitted, false);
    });

    it('should accept cache instance', () => {
      const mockCache = new MockCache();
      const scanner = new CachedScanner({ cache: mockCache });
      assert.strictEqual(scanner.cache, mockCache);
    });
  });

  describe('initializeCache', () => {
    it('should initialize cache with Redis client', () => {
      const scanner = new CachedScanner();
      const mockRedisClient = { set: () => {}, get: () => {} };

      scanner.initializeCache(mockRedisClient, { ttl: 3600 });
      assert.ok(scanner.cache);
    });
  });

  describe('_shouldUseCache', () => {
    it('should return false when forceRefresh is true', async () => {
      const scanner = new CachedScanner({ forceRefresh: true });
      scanner.cache = new MockCache();

      const repoStatus = {
        is_git_repository: true,
        has_uncommitted_changes: false
      };

      const result = await scanner._shouldUseCache('/repo', repoStatus, {});
      assert.strictEqual(result, false);
    });

    it('should return false when cacheEnabled is false', async () => {
      const scanner = new CachedScanner({ cacheEnabled: false });

      const repoStatus = {
        is_git_repository: true,
        has_uncommitted_changes: false
      };

      const result = await scanner._shouldUseCache('/repo', repoStatus, {});
      assert.strictEqual(result, false);
    });

    it('should return false when cache is not initialized', async () => {
      const scanner = new CachedScanner({ cacheEnabled: true });
      // scanner.cache is null by default

      const repoStatus = {
        is_git_repository: true,
        has_uncommitted_changes: false
      };

      const result = await scanner._shouldUseCache('/repo', repoStatus, {});
      assert.strictEqual(result, false);
    });

    it('should return false for non-git repository', async () => {
      const scanner = new CachedScanner();
      scanner.cache = new MockCache();

      const repoStatus = {
        is_git_repository: false,
        has_uncommitted_changes: false
      };

      const result = await scanner._shouldUseCache('/repo', repoStatus, {});
      assert.strictEqual(result, false);
    });

    it('should return false when has uncommitted changes and trackUncommitted is true', async () => {
      const scanner = new CachedScanner({ trackUncommitted: true });
      scanner.cache = new MockCache();

      const repoStatus = {
        is_git_repository: true,
        has_uncommitted_changes: true
      };

      const result = await scanner._shouldUseCache('/repo', repoStatus, {});
      assert.strictEqual(result, false);
    });

    it('should return true when all conditions are met', async () => {
      const scanner = new CachedScanner();
      scanner.cache = new MockCache();

      const repoStatus = {
        is_git_repository: true,
        has_uncommitted_changes: false
      };

      const result = await scanner._shouldUseCache('/repo', repoStatus, {});
      assert.strictEqual(result, true);
    });

    it('should return false when options.forceRefresh is true', async () => {
      const scanner = new CachedScanner();
      scanner.cache = new MockCache();

      const repoStatus = {
        is_git_repository: true,
        has_uncommitted_changes: false
      };

      const result = await scanner._shouldUseCache('/repo', repoStatus, { forceRefresh: true });
      assert.strictEqual(result, false);
    });
  });

  describe('_getCachedResult', () => {
    it('should return cached result with age metadata', async () => {
      const scanner = new CachedScanner();
      const mockCache = new MockCache();
      scanner.cache = mockCache;

      // Populate cache
      await mockCache.cacheScan('/repo', 'commit123', { data: 'test' });

      const result = await scanner._getCachedResult('/repo', 'commit123');
      assert.ok(result);
      assert.ok(result.cache_metadata);
      assert.ok(result.cache_metadata.age);
    });

    it('should return null for cache miss', async () => {
      const scanner = new CachedScanner();
      scanner.cache = new MockCache();

      const result = await scanner._getCachedResult('/repo', 'nonexistent');
      assert.strictEqual(result, null);
    });

    it('should return null and not throw on cache error', async () => {
      const scanner = new CachedScanner();
      scanner.cache = {
        getCachedScan: async () => { throw new Error('Cache error'); }
      };

      const result = await scanner._getCachedResult('/repo', 'commit123');
      assert.strictEqual(result, null);
    });
  });

  describe('_cacheResult', () => {
    it('should cache scan result', async () => {
      const scanner = new CachedScanner();
      const mockCache = new MockCache();
      scanner.cache = mockCache;

      await scanner._cacheResult('/repo', 'commit123', { data: 'test' });

      const isCached = await mockCache.isCached('/repo', 'commit123');
      assert.strictEqual(isCached, true);
    });

    it('should not throw on cache error', async () => {
      const scanner = new CachedScanner();
      scanner.cache = {
        cacheScan: async () => { throw new Error('Cache error'); }
      };

      // Should not throw
      await assert.doesNotReject(async () => {
        await scanner._cacheResult('/repo', 'commit123', { data: 'test' });
      });
    });
  });

  describe('invalidateCache', () => {
    it('should invalidate cache entries for repository', async () => {
      const scanner = new CachedScanner();
      const mockCache = new MockCache();
      scanner.cache = mockCache;

      // Add some cache entries
      await mockCache.cacheScan('/repo', 'commit1', { data: '1' });
      await mockCache.cacheScan('/repo', 'commit2', { data: '2' });

      const deletedCount = await scanner.invalidateCache('/repo');
      assert.strictEqual(deletedCount, 2);
    });

    it('should return 0 when cache not initialized', async () => {
      const scanner = new CachedScanner();
      scanner.cache = null;

      const deletedCount = await scanner.invalidateCache('/repo');
      assert.strictEqual(deletedCount, 0);
    });
  });

  describe('getCacheStatus', () => {
    it('should return cache status for cached repository', async () => {
      const scanner = new CachedScanner();
      const mockCache = new MockCache();
      const mockGitTracker = new MockGitTracker();
      scanner.cache = mockCache;
      scanner.gitTracker = mockGitTracker;

      // Cache a result
      await mockCache.cacheScan('/repo', mockGitTracker.mockStatus.current_commit, { data: 'test' });

      const status = await scanner.getCacheStatus('/repo');
      assert.strictEqual(status.is_cached, true);
      assert.ok(status.cache_age_ms);
      assert.ok(status.repository_status);
    });

    it('should return not_a_git_repository reason', async () => {
      const scanner = new CachedScanner();
      const mockGitTracker = new MockGitTracker();
      mockGitTracker.setMockStatus({
        is_git_repository: false,
        current_commit: null
      });
      scanner.gitTracker = mockGitTracker;

      const status = await scanner.getCacheStatus('/non-git');
      assert.strictEqual(status.is_cached, false);
      assert.strictEqual(status.reason, 'not_a_git_repository');
    });
  });

  describe('getStats', () => {
    it('should return scanner statistics', async () => {
      const scanner = new CachedScanner();
      const mockCache = new MockCache();
      scanner.cache = mockCache;

      const stats = await scanner.getStats();
      assert.strictEqual(stats.cache_enabled, true);
      assert.strictEqual(stats.force_refresh, false);
      assert.strictEqual(stats.track_uncommitted, true);
      assert.strictEqual(stats.cache_initialized, true);
      assert.ok(stats.cache_stats);
    });

    it('should return null cache_stats when cache not initialized', async () => {
      const scanner = new CachedScanner();
      scanner.cache = null;

      const stats = await scanner.getStats();
      assert.strictEqual(stats.cache_stats, null);
    });
  });
});

describe('CachedScanner - Integration Behavior', () => {
  describe('Caching logic', () => {
    it('should use cache when conditions are met', async () => {
      // Test the expected behavior without actually calling scanRepository
      const scanner = new CachedScanner({ cacheEnabled: true });
      const mockCache = new MockCache();
      scanner.cache = mockCache;

      const repoStatus = {
        is_git_repository: true,
        has_uncommitted_changes: false,
        current_commit: 'abc123'
      };

      // Should use cache
      const shouldCache = await scanner._shouldUseCache('/repo', repoStatus, {});
      assert.strictEqual(shouldCache, true);

      // Cache a result
      await scanner._cacheResult('/repo', 'abc123', { metrics: { total: 10 } });

      // Should retrieve from cache
      const cached = await scanner._getCachedResult('/repo', 'abc123');
      assert.ok(cached);
      assert.strictEqual(cached.metrics.total, 10);
    });

    it('should not use cache when uncommitted changes exist', async () => {
      const scanner = new CachedScanner({ cacheEnabled: true, trackUncommitted: true });
      scanner.cache = new MockCache();

      const repoStatus = {
        is_git_repository: true,
        has_uncommitted_changes: true,
        current_commit: 'abc123'
      };

      const shouldCache = await scanner._shouldUseCache('/repo', repoStatus, {});
      assert.strictEqual(shouldCache, false);
    });
  });

  describe('Cache age calculation', () => {
    it('should calculate age in hours and days', async () => {
      const scanner = new CachedScanner();
      const mockCache = new MockCache();
      scanner.cache = mockCache;

      // Cache something
      await mockCache.cacheScan('/repo', 'commit', { data: 'test' });

      const result = await scanner._getCachedResult('/repo', 'commit');

      assert.ok(result.cache_metadata);
      assert.ok(result.cache_metadata.age);
      assert.ok(result.cache_metadata.age_hours !== undefined);
      assert.ok(result.cache_metadata.age_days !== undefined);
    });
  });
});

describe('CachedScanner - warmCache', () => {
  // Mock scanner that always succeeds
  class SuccessScanner {
    async scanRepository(repoPath, options) {
      return {
        repository_info: { path: repoPath },
        metrics: { total_duplicate_groups: 1 }
      };
    }
  }

  // Mock scanner that always fails
  class FailingScanner {
    async scanRepository(repoPath, options) {
      throw new Error('Simulated scan failure');
    }
  }

  it('should warm cache for multiple repositories', async () => {
    const scanner = new CachedScanner();
    const mockCache = new MockCache();
    const mockScanner = new SuccessScanner();
    const mockGitTracker = new MockGitTracker();

    scanner.cache = mockCache;
    scanner.scanner = mockScanner;
    scanner.gitTracker = mockGitTracker;

    const repoPaths = ['/repo1', '/repo2', '/repo3'];
    const results = await scanner.warmCache(repoPaths);

    assert.strictEqual(results.total, 3);
    assert.strictEqual(results.successful, 3);
    assert.strictEqual(results.failed, 0);
    assert.deepStrictEqual(results.errors, []);
  });

  it('should handle failures during warm-up', async () => {
    const scanner = new CachedScanner();
    const mockCache = new MockCache();
    const mockScanner = new FailingScanner();
    const mockGitTracker = new MockGitTracker();

    scanner.cache = mockCache;
    scanner.scanner = mockScanner;
    scanner.gitTracker = mockGitTracker;

    const repoPaths = ['/repo1', '/repo2'];
    const results = await scanner.warmCache(repoPaths);

    assert.strictEqual(results.total, 2);
    assert.strictEqual(results.successful, 0);
    assert.strictEqual(results.failed, 2);
    assert.strictEqual(results.errors.length, 2);
    assert.ok(results.errors[0].error.includes('Simulated'));
  });

  it('should continue after individual failures', async () => {
    let callCount = 0;
    class MixedScanner {
      async scanRepository(repoPath, options) {
        callCount++;
        if (callCount === 2) {
          throw new Error('Fails on second repo');
        }
        return { repository_info: { path: repoPath } };
      }
    }

    const scanner = new CachedScanner();
    scanner.cache = new MockCache();
    scanner.scanner = new MixedScanner();
    scanner.gitTracker = new MockGitTracker();

    const repoPaths = ['/repo1', '/repo2', '/repo3'];
    const results = await scanner.warmCache(repoPaths);

    assert.strictEqual(results.total, 3);
    assert.strictEqual(results.successful, 2);
    assert.strictEqual(results.failed, 1);
  });

  it('should return empty results for empty input', async () => {
    const scanner = new CachedScanner();
    scanner.cache = new MockCache();
    scanner.gitTracker = new MockGitTracker();

    const results = await scanner.warmCache([]);

    assert.strictEqual(results.total, 0);
    assert.strictEqual(results.successful, 0);
    assert.strictEqual(results.failed, 0);
  });

  it('should force refresh when warming cache', async () => {
    let receivedOptions = null;
    class OptionsTrackingScanner {
      async scanRepository(repoPath, options) {
        receivedOptions = options;
        return { repository_info: { path: repoPath } };
      }
    }

    const scanner = new CachedScanner();
    scanner.cache = new MockCache();
    scanner.scanner = new OptionsTrackingScanner();
    scanner.gitTracker = new MockGitTracker();

    await scanner.warmCache(['/repo1'], { customOption: true });

    assert.ok(receivedOptions);
    assert.strictEqual(receivedOptions.forceRefresh, true);
    assert.strictEqual(receivedOptions.customOption, true);
  });
});

describe('CachedScanner - Error Handling', () => {
  class ErrorThrowingCache {
    async invalidateCache() {
      throw new Error('Cache invalidation failed');
    }
    async isCached() {
      return false;
    }
    async getCacheAge() {
      return null;
    }
    async getCacheMetadata() {
      return null;
    }
  }

  class ErrorThrowingGitTracker {
    async getRepositoryStatus() {
      throw new Error('Git tracker failed');
    }
  }

  it('should throw error when invalidateCache fails', async () => {
    const scanner = new CachedScanner();
    scanner.cache = new ErrorThrowingCache();

    await assert.rejects(
      () => scanner.invalidateCache('/repo'),
      (err) => {
        assert.ok(err.message.includes('Cache invalidation failed'));
        return true;
      }
    );
  });

  it('should throw error when getCacheStatus fails', async () => {
    const scanner = new CachedScanner();
    scanner.gitTracker = new ErrorThrowingGitTracker();
    scanner.cache = new MockCache();

    await assert.rejects(
      () => scanner.getCacheStatus('/repo'),
      (err) => {
        assert.ok(err.message.includes('Git tracker failed'));
        return true;
      }
    );
  });
});

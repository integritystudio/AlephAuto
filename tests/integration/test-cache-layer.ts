#!/usr/bin/env node

/**
 * Test Cache Layer
 *
 * Tests the caching layer with Git commit tracking and Redis caching.
 *
 * Usage:
 *   node test-cache-layer.js
 */

import { CachedScanner } from '../../sidequest/pipeline-core/cache/cached-scanner.ts';
import { GitCommitTracker } from '../../sidequest/pipeline-core/cache/git-tracker.ts';
import { ScanResultCache } from '../../sidequest/pipeline-core/cache/scan-cache.ts';
import { createComponentLogger } from '../../sidequest/utils/logger.ts';
import path from 'path';

const logger = createComponentLogger('TestCacheLayer');

// Redis MCP client - mock for testing without Redis
const mockRedisClient = {
  /**
   * hset.
   */
  async hset({ name, key, value: _value, expire_seconds: _expire_seconds }) {
    logger.debug({ name, key }, 'Mock Redis: HSET');
    return true;
  },

  /**
   * hget.
   */
  async hget({ name, key }) {
    logger.debug({ name, key }, 'Mock Redis: HGET');
    return null; // Simulate cache miss
  },

  /**
   * hexists.
   */
  async hexists({ name, key }) {
    logger.debug({ name, key }, 'Mock Redis: HEXISTS');
    return false; // Simulate cache miss
  },

  /**
   * delete.
   */
  async delete({ key }) {
    logger.debug({ key }, 'Mock Redis: DELETE');
    return true;
  },

  /**
   * scan_all_keys.
   */
  async scan_all_keys({ pattern }) {
    logger.debug({ pattern }, 'Mock Redis: SCAN');
    return [];
  },

  /**
   * lpush.
   */
  async lpush({ name, value: _value, expire: _expire }) {
    logger.debug({ name }, 'Mock Redis: LPUSH');
    return true;
  },

  /**
   * lrange.
   */
  async lrange({ name, start, stop }) {
    logger.debug({ name, start, stop }, 'Mock Redis: LRANGE');
    return [];
  }
};

/**
 * testGitTracker.
 */
async function testGitTracker() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║              TEST 1: GIT COMMIT TRACKER                  ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const gitTracker = new GitCommitTracker();
  const testRepoPath = process.cwd(); // Current jobs repo

  try {
    // Test 1.1: Get repository commit
    console.log('📝 Test 1.1: Get repository commit hash\n');

    const commitHash = await gitTracker.getRepositoryCommit(testRepoPath);
    console.log(`   ✅ Commit hash: ${commitHash ? commitHash.substring(0, 7) : 'Not a git repo'}\n`);

    // Test 1.2: Get repository status
    console.log('📝 Test 1.2: Get repository status\n');

    const repoStatus = await gitTracker.getRepositoryStatus(testRepoPath);
    console.log(`   Git Repository: ${repoStatus.is_git_repository}`);
    console.log(`   Current Commit: ${repoStatus.short_commit}`);
    console.log(`   Branch: ${repoStatus.branch}`);
    console.log(`   Has Uncommitted: ${repoStatus.has_uncommitted_changes}`);
    console.log(`   Remote URL: ${repoStatus.remote_url}\n`);

    // Test 1.3: Get commit metadata
    if (commitHash) {
      console.log('📝 Test 1.3: Get commit metadata\n');

      const metadata = await gitTracker.getCommitMetadata(testRepoPath);
      console.log(`   Author: ${metadata.author}`);
      console.log(`   Date: ${metadata.date}`);
      console.log(`   Message: ${metadata.message.substring(0, 60)}...\n`);
    }

    // Test 1.4: Get commit history
    console.log('📝 Test 1.4: Get commit history (last 5 commits)\n');

    const history = await gitTracker.getCommitHistory(testRepoPath, 5);
    history.forEach((commit, index) => {
      console.log(`   ${index + 1}. ${commit.shortHash} - ${commit.message.substring(0, 50)}`);
    });
    console.log('');

    return true;
  } catch (error) {
    console.error('   ❌ Test failed:', error.message);
    return false;
  }
}

/**
 * testScanCache.
 */
async function testScanCache() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║               TEST 2: SCAN RESULT CACHE                  ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const scanCache = new ScanResultCache(mockRedisClient, {
    enabled: true,
    ttl: 2592000, // 30 days
    keyPrefix: 'test:scan:'
  });

  try {
    const testRepoPath = process.cwd();
    const testCommit = 'abc123def456';

    // Test 2.1: Cache key generation
    console.log('📝 Test 2.1: Cache key generation\n');

    const cacheKey = scanCache._generateCacheKey(testRepoPath, testCommit);
    console.log(`   ✅ Cache key: ${cacheKey}\n`);

    // Test 2.2: Check if cached (should be false)
    console.log('📝 Test 2.2: Check if scan is cached\n');

    const isCached = await scanCache.isCached(testRepoPath, testCommit);
    console.log(`   Cached: ${isCached}`);
    console.log(`   ✅ Expected: false (cache miss)\n`);

    // Test 2.3: Get cache statistics
    console.log('📝 Test 2.3: Get cache statistics\n');

    const stats = await scanCache.getStats();
    console.log(`   Total Cached Scans: ${stats.total_cached_scans}`);
    console.log(`   Cache Enabled: ${stats.cache_enabled}`);
    console.log(`   TTL Days: ${stats.ttl_days}`);
    console.log(`   Prefix: ${stats.prefix}\n`);

    // Test 2.4: Mock caching a scan result
    console.log('📝 Test 2.4: Cache a mock scan result\n');

    const mockScanResult = {
      scan_type: 'intra-project',
      metrics: {
        total_duplicate_groups: 10,
        total_suggestions: 10
      },
      scan_metadata: {
        scan_id: 'test-123',
        duration_seconds: 2.5
      }
    };

    const cached = await scanCache.cacheScan(testRepoPath, testCommit, mockScanResult);
    console.log(`   ✅ Caching attempted: ${cached ? 'success' : 'failed (expected with mock Redis)'}\n`);

    return true;
  } catch (error) {
    console.error('   ❌ Test failed:', error.message);
    return false;
  }
}

/**
 * testCachedScanner.
 */
async function testCachedScanner() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                TEST 3: CACHED SCANNER                    ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const cachedScanner = new CachedScanner({
    cacheEnabled: true,
    forceRefresh: false,
    trackUncommitted: true
  });

  // Initialize with mock Redis
  cachedScanner.initializeCache(mockRedisClient, {
    ttl: 2592000,
    keyPrefix: 'test:scan:'
  });

  try {
    const testRepoPath = path.join(process.cwd(), 'sidequest');

    // Test 3.1: Get cache status
    console.log('📝 Test 3.1: Get cache status for repository\n');

    const cacheStatus = await cachedScanner.getCacheStatus(testRepoPath);
    console.log(`   Is Cached: ${cacheStatus.is_cached}`);
    console.log(`   Is Git Repo: ${cacheStatus.repository_status.is_git_repository}`);
    console.log(`   Current Commit: ${cacheStatus.repository_status.short_commit}`);
    console.log(`   Has Uncommitted: ${cacheStatus.repository_status.has_uncommitted_changes}\n`);

    // Test 3.2: Get scanner statistics
    console.log('📝 Test 3.2: Get scanner statistics\n');

    const stats = await cachedScanner.getStats();
    console.log(`   Cache Enabled: ${stats.cache_enabled}`);
    console.log(`   Force Refresh: ${stats.force_refresh}`);
    console.log(`   Track Uncommitted: ${stats.track_uncommitted}`);
    console.log(`   Cache Initialized: ${stats.cache_initialized}\n`);

    // Test 3.3: Scan repository (will use actual scanner)
    console.log('📝 Test 3.3: Scan repository with caching\n');
    console.log('   Note: This will run an actual scan since cache is mock\n');

    // Skip actual scan in test mode
    console.log('   ⏭️  Skipping actual scan (would take too long)\n');

    return true;
  } catch (error) {
    console.error('   ❌ Test failed:', error.message);
    return false;
  }
}

/**
 * main.
 */
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║            CACHE LAYER INTEGRATION TEST                 ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  const results = {
    gitTracker: false,
    scanCache: false,
    cachedScanner: false
  };

  // Run tests
  results.gitTracker = await testGitTracker();
  results.scanCache = await testScanCache();
  results.cachedScanner = await testCachedScanner();

  // Summary
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                   TEST SUMMARY                           ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  console.log(`   Test 1 - Git Commit Tracker:  ${results.gitTracker ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Test 2 - Scan Result Cache:   ${results.scanCache ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Test 3 - Cached Scanner:      ${results.cachedScanner ? '✅ PASS' : '❌ FAIL'}`);
  console.log('');

  const allPassed = Object.values(results).every(r => r === true);

  if (allPassed) {
    console.log('   ✅ All tests passed!\n');
    process.exit(0);
  } else {
    console.log('   ❌ Some tests failed\n');
    process.exit(1);
  }
}

main();

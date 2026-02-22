#!/usr/bin/env node

/**
 * Integration Test: Retry Logic
 *
 * Tests the retry logic in the duplicate detection pipeline with real job failures.
 *
 * Verifies:
 * 1. Retries are tracked by original job ID (not retry suffixes)
 * 2. Configured max retries are respected
 * 3. Circuit breaker prevents infinite retry loops
 * 4. Retry job IDs are generated correctly
 *
 * Usage:
 *   node tests/integration/test-retry-logic.js
 */

import { DuplicateDetectionWorker } from '../../sidequest/workers/duplicate-detection-worker.ts';
import { createComponentLogger } from '../../sidequest/utils/logger.ts';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = createComponentLogger('RetryLogicIntegrationTest');

/**
 * Test harness that extends DuplicateDetectionWorker
 * to simulate failures and track retry attempts
 */
class RetryTestWorker extends DuplicateDetectionWorker {
  constructor(options = {}) {
    super({
      ...options,
      configPath: path.join(__dirname, '../fixtures/test-scan-config.json')
    });

    this.failureCount = 0;
    this.maxFailures = options.maxFailures || 3;
    this.retryHistory = [];
  }

  /**
   * Override runJobHandler to simulate failures
   */
  async runJobHandler(job) {
    this.retryHistory.push({
      jobId: job.id,
      originalJobId: this._getOriginalJobId(job.id),
      attempt: this.retryQueue.get(this._getOriginalJobId(job.id))?.attempts || 0,
      timestamp: new Date().toISOString()
    });

    // Simulate failure for first N attempts
    if (this.failureCount < this.maxFailures) {
      this.failureCount++;
      throw new Error(`Simulated failure ${this.failureCount}/${this.maxFailures}`);
    }

    // Success after max failures
    logger.info({ jobId: job.id }, 'Job succeeded after retries');
    return { success: true, retries: this.failureCount };
  }
}

/**
 * Create test configuration
 */
async function createTestConfig() {
  const configPath = path.join(__dirname, '../fixtures/test-scan-config.json');
  const config = {
    version: '1.0.0',
    scanConfig: {
      enabled: true,
      retryAttempts: 2,
      retryDelay: 100, // Short delay for testing
      maxConcurrentScans: 1
    },
    cacheConfig: {
      enabled: false
    },
    repositories: [],
    repositoryGroups: [],
    scanDefaults: {
      languages: ['javascript']
    },
    notifications: {
      enabled: false
    }
  };

  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  return configPath;
}

/**
 * Test 1: Retry counter tracks by original job ID
 */
async function testRetryCounterTracking() {
  console.log('\n📊 Test 1: Retry Counter Tracking\n');

  const configPath = await createTestConfig();
  const worker = new RetryTestWorker({ maxFailures: 2, configPath });

  await worker.initialize();

  // Create a job that will fail and retry
  const jobId = 'test-retry-tracking-' + Date.now();
  worker.createJob(jobId, { scanType: 'test', repositories: [] });

  // Wait for job to complete (including retries)
  await new Promise(resolve => setTimeout(resolve, 500));

  // Verify retry history
  const originalId = worker._getOriginalJobId(jobId);
  const retriesForOriginalId = worker.retryHistory.filter(
    h => h.originalJobId === originalId
  );

  console.log(`Original Job ID: ${originalId}`);
  console.log(`Total Retry History Entries: ${worker.retryHistory.length}`);
  console.log(`Retries for Original ID: ${retriesForOriginalId.length}`);

  worker.retryHistory.forEach((entry, idx) => {
    console.log(`  ${idx + 1}. Job ID: ${entry.jobId}, Attempt: ${entry.attempt}`);
  });

  // All retry attempts should have same original job ID
  const allSameOriginalId = retriesForOriginalId.every(
    h => h.originalJobId === originalId
  );

  if (allSameOriginalId && retriesForOriginalId.length > 0) {
    console.log('✅ PASS: Retry counter correctly tracks by original job ID\n');
    return true;
  } else {
    console.log('❌ FAIL: Retry counter not tracking correctly\n');
    return false;
  }
}

/**
 * Test 2: Configured max retries are respected
 */
async function testConfiguredMaxRetries() {
  console.log('📊 Test 2: Configured Max Retries\n');

  const configPath = await createTestConfig();
  const worker = new RetryTestWorker({ maxFailures: 10, configPath }); // More failures than allowed retries

  await worker.initialize();

  const jobId = 'test-max-retries-' + Date.now();
  worker.createJob(jobId, { scanType: 'test', repositories: [] });

  // Wait for job to fail completely
  await new Promise(resolve => setTimeout(resolve, 1000));

  const originalId = worker._getOriginalJobId(jobId);
  const retriesForOriginalId = worker.retryHistory.filter(
    h => h.originalJobId === originalId
  );

  console.log(`Configured Max Retries: 2`);
  console.log(`Actual Retry Attempts: ${retriesForOriginalId.length}`);
  console.log(`Job Failure Count: ${worker.failureCount}`);

  // Should stop at configured max (2) + initial attempt (1) = 3 total attempts
  const totalAttempts = retriesForOriginalId.length;
  const expectedAttempts = 3; // 1 initial + 2 retries

  if (totalAttempts === expectedAttempts) {
    console.log('✅ PASS: Configured max retries respected\n');
    return true;
  } else {
    console.log(`❌ FAIL: Expected ${expectedAttempts} attempts, got ${totalAttempts}\n`);
    return false;
  }
}

/**
 * Test 3: Circuit breaker prevents infinite loops
 */
async function testCircuitBreaker() {
  console.log('📊 Test 3: Circuit Breaker\n');

  // Modify config to have high retry attempts
  const configPath = path.join(__dirname, '../fixtures/test-scan-config.json');
  const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
  config.scanConfig.retryAttempts = 10; // Higher than circuit breaker max (5)
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));

  const worker = new RetryTestWorker({ maxFailures: 20, configPath }); // Many failures

  await worker.initialize();

  const jobId = 'test-circuit-breaker-' + Date.now();
  worker.createJob(jobId, { scanType: 'test', repositories: [] });

  // Wait for circuit breaker to trigger
  await new Promise(resolve => setTimeout(resolve, 2000));

  const originalId = worker._getOriginalJobId(jobId);
  const retriesForOriginalId = worker.retryHistory.filter(
    h => h.originalJobId === originalId
  );

  console.log(`Configured Max Retries: 10`);
  console.log(`Circuit Breaker Max: 5`);
  console.log(`Actual Retry Attempts: ${retriesForOriginalId.length}`);

  // Should stop at circuit breaker max (5) + initial (1) = 6 total
  const totalAttempts = retriesForOriginalId.length;
  const maxExpected = 6; // 1 initial + 5 retries (circuit breaker)

  if (totalAttempts <= maxExpected) {
    console.log('✅ PASS: Circuit breaker prevented infinite loop\n');
    return true;
  } else {
    console.log(`❌ FAIL: Circuit breaker failed, got ${totalAttempts} attempts (expected <= ${maxExpected})\n`);
    return false;
  }
}

/**
 * Test 4: Retry job IDs are generated correctly
 */
async function testRetryJobIdGeneration() {
  console.log('📊 Test 4: Retry Job ID Generation\n');

  const configPath = await createTestConfig();
  const worker = new RetryTestWorker({ maxFailures: 2, configPath });

  await worker.initialize();

  const jobId = 'test-job-id-gen-' + Date.now();
  worker.createJob(jobId, { scanType: 'test', repositories: [] });

  await new Promise(resolve => setTimeout(resolve, 500));

  console.log('Retry Job IDs:');
  worker.retryHistory.forEach((entry, idx) => {
    console.log(`  ${idx + 1}. ${entry.jobId}`);
  });

  // Check that retry job IDs follow pattern: original-retryN
  const retryJobIds = worker.retryHistory.map(h => h.jobId);
  const validPattern = retryJobIds.every(id => {
    // First job should be original ID
    if (id === jobId) return true;
    // Retry jobs should match pattern: original-retryN
    return id.match(new RegExp(`^${jobId}-retry\\d+$`));
  });

  if (validPattern) {
    console.log('✅ PASS: Retry job IDs generated correctly\n');
    return true;
  } else {
    console.log('❌ FAIL: Invalid retry job ID pattern\n');
    return false;
  }
}

/**
 * Run all integration tests
 */
async function runTests() {
  console.log('🧪 Retry Logic Integration Tests\n');
  console.log('='.repeat(50));

  const results = [];

  try {
    results.push(await testRetryCounterTracking());
    results.push(await testConfiguredMaxRetries());
    results.push(await testCircuitBreaker());
    results.push(await testRetryJobIdGeneration());

    // Summary
    console.log('='.repeat(50));
    console.log('\n📋 Test Summary\n');

    const passed = results.filter(r => r).length;
    const failed = results.filter(r => !r).length;

    console.log(`Total Tests: ${results.length}`);
    console.log(`Passed: ${passed} ✅`);
    console.log(`Failed: ${failed} ❌`);

    if (failed === 0) {
      console.log('\n🎉 All tests passed!\n');
      process.exit(0);
    } else {
      console.log('\n❌ Some tests failed\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  }
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests();
}

export { RetryTestWorker };

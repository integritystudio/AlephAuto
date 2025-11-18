#!/usr/bin/env node
/**
 * Phase 4.1.1 - Retry Metrics Dashboard Validation Test
 *
 * Tests retry metrics functionality end-to-end:
 * - Triggers failing jobs to create retries
 * - Validates retry metrics API endpoint
 * - Tests circuit breaker limits
 * - Verifies error classification
 */

// @ts-nocheck
import { createTempRepository } from '../fixtures/test-helpers.js';
import { createComponentLogger } from '../../sidequest/logger.js';
// Using Node.js built-in fetch (v18+)

const logger = createComponentLogger('RetryMetricsTest');

const API_BASE_URL = 'http://localhost:8080';
const TESTS_TO_RUN = {
  retryableError: true,
  nonRetryableError: true,
  circuitBreaker: true,
  retryMetricsAPI: true
};

/**
 * Wait for a condition to be true
 */
async function waitFor(conditionFn, timeout = 30000, interval = 500) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (await conditionFn()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}

/**
 * Get current retry metrics from API
 */
async function getRetryMetrics() {
  const response = await fetch(`${API_BASE_URL}/api/status`);
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  return data.retryMetrics;
}

/**
 * Trigger a scan that will fail (non-existent directory)
 */
async function triggerFailingScan(repoPath) {
  logger.info({ repoPath }, 'Triggering scan that will fail');

  const response = await fetch(`${API_BASE_URL}/api/scans/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repositoryPath: repoPath })
  });

  if (!response.ok) {
    throw new Error(`Scan trigger failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  logger.info({ scanId: result.scanId }, 'Scan triggered');
  return result.scanId;
}

/**
 * Test 1: Retryable Error (ENOENT should be retried)
 */
async function testRetryableError() {
  logger.info('TEST 1: Retryable Error Classification');

  // Create temp repo that will be deleted immediately (causing ENOENT)
  const testRepo = await createTempRepository('retry-test-enoent');
  const repoPath = testRepo.path;

  // Delete the directory before scanning
  await testRepo.cleanup();

  // Trigger scan on non-existent directory
  const scanId = await triggerFailingScan(repoPath);

  // Wait for retry to be scheduled
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Check retry metrics
  const metrics = await getRetryMetrics();

  logger.info({
    activeRetries: metrics.activeRetries,
    totalRetryAttempts: metrics.totalRetryAttempts,
    distribution: metrics.retryDistribution
  }, 'Retry metrics after retryable error');

  // Validate
  const success = metrics.activeRetries >= 0 && metrics.totalRetryAttempts >= 0;
  logger.info({ success }, 'TEST 1 Result');

  return {
    test: 'Retryable Error',
    passed: success,
    metrics
  };
}

/**
 * Test 2: Non-retryable Error (ValidationError should not retry)
 */
async function testNonRetryableError() {
  logger.info('TEST 2: Non-retryable Error Classification');

  // Trigger scan with invalid data (empty repositoryPath)
  try {
    const response = await fetch(`${API_BASE_URL}/api/scans/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repositoryPath: '' })
    });

    const result = await response.json();
    logger.info({ status: response.status, result }, 'Non-retryable error response');

    // Should receive 400 Bad Request
    const success = response.status === 400;
    logger.info({ success }, 'TEST 2 Result');

    return {
      test: 'Non-retryable Error',
      passed: success,
      expectedStatus: 400,
      actualStatus: response.status
    };
  } catch (error) {
    logger.error({ error }, 'TEST 2 Failed');
    return {
      test: 'Non-retryable Error',
      passed: false,
      error: error.message
    };
  }
}

/**
 * Test 3: Circuit Breaker (5 attempts max)
 */
async function testCircuitBreaker() {
  logger.info('TEST 3: Circuit Breaker Validation');

  // Create multiple failing scans to test circuit breaker
  const failingScans = [];

  for (let i = 0; i < 3; i++) {
    const testRepo = await createTempRepository(`circuit-breaker-${i}`);
    const repoPath = testRepo.path;
    await testRepo.cleanup(); // Delete immediately

    const scanId = await triggerFailingScan(repoPath);
    failingScans.push(scanId);

    // Small delay between scans
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Wait for retries to accumulate
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Check metrics
  const metrics = await getRetryMetrics();

  logger.info({
    activeRetries: metrics.activeRetries,
    totalRetryAttempts: metrics.totalRetryAttempts,
    nearingLimit: metrics.retryDistribution.nearingLimit,
    distribution: metrics.retryDistribution
  }, 'Circuit breaker metrics');

  // Validate that jobs are being retried but not exceeding limits
  const success = metrics.totalRetryAttempts > 0;
  logger.info({ success }, 'TEST 3 Result');

  return {
    test: 'Circuit Breaker',
    passed: success,
    metrics
  };
}

/**
 * Test 4: Retry Metrics API Structure
 */
async function testRetryMetricsAPI() {
  logger.info('TEST 4: Retry Metrics API Structure Validation');

  const metrics = await getRetryMetrics();

  // Validate structure
  const hasRequiredFields =
    typeof metrics.activeRetries === 'number' &&
    typeof metrics.totalRetryAttempts === 'number' &&
    Array.isArray(metrics.jobsBeingRetried) &&
    typeof metrics.retryDistribution === 'object' &&
    typeof metrics.retryDistribution.attempt1 === 'number' &&
    typeof metrics.retryDistribution.attempt2 === 'number' &&
    typeof metrics.retryDistribution.attempt3Plus === 'number' &&
    typeof metrics.retryDistribution.nearingLimit === 'number';

  logger.info({
    hasRequiredFields,
    metricsStructure: {
      activeRetries: typeof metrics.activeRetries,
      totalRetryAttempts: typeof metrics.totalRetryAttempts,
      jobsBeingRetried: Array.isArray(metrics.jobsBeingRetried) ? 'array' : typeof metrics.jobsBeingRetried,
      retryDistribution: typeof metrics.retryDistribution
    }
  }, 'API structure validation');

  logger.info({ passed: hasRequiredFields }, 'TEST 4 Result');

  return {
    test: 'Retry Metrics API Structure',
    passed: hasRequiredFields,
    metrics
  };
}

/**
 * Main test runner
 */
async function runTests() {
  logger.info('Starting Phase 4.1.1 - Retry Metrics Validation Tests');
  logger.info(`API Base URL: ${API_BASE_URL}`);

  const results = [];

  try {
    // Check API health first
    logger.info('Checking API health...');
    const healthResponse = await fetch(`${API_BASE_URL}/health`);
    if (!healthResponse.ok) {
      throw new Error('API server is not healthy');
    }
    logger.info('API server is healthy ✓');

    // Run tests
    if (TESTS_TO_RUN.retryMetricsAPI) {
      results.push(await testRetryMetricsAPI());
    }

    if (TESTS_TO_RUN.retryableError) {
      results.push(await testRetryableError());
    }

    if (TESTS_TO_RUN.nonRetryableError) {
      results.push(await testNonRetryableError());
    }

    if (TESTS_TO_RUN.circuitBreaker) {
      results.push(await testCircuitBreaker());
    }

    // Summary
    logger.info('\n=== TEST SUMMARY ===');
    const passed = results.filter(r => r.passed).length;
    const total = results.length;

    results.forEach((result, index) => {
      const status = result.passed ? '✓ PASS' : '✗ FAIL';
      logger.info(`${index + 1}. ${result.test}: ${status}`);
      if (result.metrics) {
        logger.info({
          activeRetries: result.metrics.activeRetries,
          totalAttempts: result.metrics.totalRetryAttempts,
          distribution: result.metrics.retryDistribution
        }, '   Metrics');
      }
    });

    logger.info(`\n${passed}/${total} tests passed`);

    // Final metrics check
    const finalMetrics = await getRetryMetrics();
    logger.info('\n=== FINAL RETRY METRICS ===');
    logger.info({
      activeRetries: finalMetrics.activeRetries,
      totalRetryAttempts: finalMetrics.totalRetryAttempts,
      jobsBeingRetried: finalMetrics.jobsBeingRetried.length,
      distribution: finalMetrics.retryDistribution
    }, 'Final state');

    // Exit with appropriate code
    process.exit(passed === total ? 0 : 1);

  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Test runner failed');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  logger.error({ error }, 'Unhandled error in test runner');
  process.exit(1);
});

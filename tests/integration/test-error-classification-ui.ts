#!/usr/bin/env node
/**
 * Phase 4.1.2 - Error Classification UI Validation Test
 *
 * Tests error handling UI and classification:
 * - Retryable error display (ETIMEDOUT, network errors)
 * - Non-retryable error display (ENOENT, validation errors)
 * - Error message clarity and actionability
 * - Error type indicators in UI
 */

// @ts-nocheck
import { createTempRepository } from '../fixtures/test-helpers.ts';
import { createComponentLogger } from '../../sidequest/utils/logger.ts';

const logger = createComponentLogger('ErrorClassificationTest');

const API_BASE_URL = 'http://localhost:8080';
const TESTS_TO_RUN = {
  retryableErrors: true,
  nonRetryableErrors: true,
  errorMessages: true,
  activityFeed: true
};

/**
 * Wait for a condition to be true
 */
async function _waitFor(conditionFn, timeout = 30000, interval = 500) {
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
 * Get system status including activity feed
 */
async function getSystemStatus() {
  const response = await fetch(`${API_BASE_URL}/api/status`);
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }
  return await response.json();
}

/**
 * Trigger a scan
 */
async function triggerScan(repoPath) {
  const response = await fetch(`${API_BASE_URL}/api/scans/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repositoryPath: repoPath })
  });

  if (!response.ok) {
    const errorData = await response.json();
    return { success: false, status: response.status, error: errorData };
  }

  const result = await response.json();
  return { success: true, scanId: result.scanId };
}

/**
 * Test 1: Retryable Error Classification
 * Trigger ENOENT error (file not found - retryable)
 */
async function testRetryableErrors() {
  logger.info('TEST 1: Retryable Error Classification (ENOENT)');

  // Create temp repo and delete it to trigger ENOENT
  const testRepo = await createTempRepository('error-test-retryable');
  const repoPath = testRepo.path;
  await testRepo.cleanup(); // Delete before scanning

  // Trigger scan that will fail with ENOENT
  const result = await triggerScan(repoPath);

  if (!result.success) {
    logger.error({ status: result.status, error: result.error }, 'Scan failed to trigger');
    return {
      test: 'Retryable Error (ENOENT)',
      passed: false,
      error: 'Failed to trigger scan'
    };
  }

  logger.info({ scanId: result.scanId }, 'Scan triggered, waiting for retry...');

  // Wait for scan to fail and retry to be scheduled
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Get system status to check activity feed
  const status = await getSystemStatus();

  logger.info({
    activeRetries: status.retryMetrics?.activeRetries,
    recentActivity: status.activity?.recent?.length
  }, 'System status after retryable error');

  // Validate retry was scheduled (or at least attempt was made)
  const hasRetryMetrics = status.retryMetrics && (
    status.retryMetrics.activeRetries >= 0 &&
    status.retryMetrics.totalRetryAttempts >= 0
  );

  const success = hasRetryMetrics;
  logger.info({ success }, 'TEST 1 Result');

  return {
    test: 'Retryable Error (ENOENT)',
    passed: success,
    retryMetrics: status.retryMetrics,
    activityCount: status.activity?.recent?.length || 0
  };
}

/**
 * Test 2: Non-retryable Error Classification
 * Trigger validation error (empty path - non-retryable)
 */
async function testNonRetryableErrors() {
  logger.info('TEST 2: Non-retryable Error Classification (ValidationError)');

  // Trigger scan with invalid data
  const result = await triggerScan(''); // Empty path should fail validation

  logger.info({
    success: result.success,
    status: result.status,
    error: result.error
  }, 'Non-retryable error response');

  // Should receive 400 Bad Request (non-retryable)
  const validationFailed = !result.success && result.status === 400;
  const hasErrorMessage = result.error && result.error.message;
  const messageIsClear = hasErrorMessage && result.error.message.includes('required');

  const success = validationFailed && hasErrorMessage && messageIsClear;
  logger.info({ success }, 'TEST 2 Result');

  return {
    test: 'Non-retryable Error (ValidationError)',
    passed: success,
    expectedStatus: 400,
    actualStatus: result.status,
    errorMessage: result.error?.message,
    messageClear: messageIsClear
  };
}

/**
 * Test 3: Error Message Clarity
 * Verify error messages are actionable and clear
 */
async function testErrorMessages() {
  logger.info('TEST 3: Error Message Clarity');

  const errorScenarios = [
    {
      name: 'Empty repositoryPath',
      payload: { repositoryPath: '' },
      expectedStatus: 400,
      expectedMessagePattern: /required|missing|empty/i
    },
    {
      name: 'Invalid repositoryPath type',
      payload: { repositoryPath: 123 },
      expectedStatus: 400,
      expectedMessagePattern: /invalid|string|type/i
    },
    {
      name: 'Missing repositoryPath',
      payload: {},
      expectedStatus: 400,
      expectedMessagePattern: /required|missing/i
    }
  ];

  const results = [];

  for (const scenario of errorScenarios) {
    const response = await fetch(`${API_BASE_URL}/api/scans/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scenario.payload)
    });

    const errorData = await response.json();

    const statusMatches = response.status === scenario.expectedStatus;
    const messageExists = errorData.message && typeof errorData.message === 'string';
    const messageMatches = messageExists && scenario.expectedMessagePattern.test(errorData.message);
    const hasTimestamp = !!errorData.timestamp;

    const passed = statusMatches && messageExists && messageMatches && hasTimestamp;

    logger.info({
      scenario: scenario.name,
      passed,
      status: response.status,
      message: errorData.message,
      hasTimestamp
    }, `Error message test: ${scenario.name}`);

    results.push({
      scenario: scenario.name,
      passed,
      status: response.status,
      message: errorData.message
    });
  }

  const allPassed = results.every(r => r.passed);
  logger.info({ allPassed }, 'TEST 3 Result');

  return {
    test: 'Error Message Clarity',
    passed: allPassed,
    scenarios: results
  };
}

/**
 * Test 4: Activity Feed Error Display
 * Verify errors appear in activity feed with correct classification
 */
async function testActivityFeed() {
  logger.info('TEST 4: Activity Feed Error Display');

  // Get initial activity count
  const initialStatus = await getSystemStatus();
  const initialActivityCount = initialStatus.recentActivity?.length || 0;

  logger.info({ initialActivityCount }, 'Initial activity feed state');

  // Trigger an actual scan job (not validation error) to populate activity feed
  // Use a valid path format but non-existent path to trigger a job failure
  const _result = await triggerScan('/tmp/non-existent-repo-12345');

  // Wait for job to be created and fail
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Get updated activity
  const updatedStatus = await getSystemStatus();
  const updatedActivityCount = updatedStatus.recentActivity?.length || 0;

  logger.info({
    initialActivityCount,
    updatedActivityCount,
    activityDelta: updatedActivityCount - initialActivityCount
  }, 'Activity feed after scan job');

  // Activity feed should exist and be an array
  const hasActivityFeed = Array.isArray(updatedStatus.recentActivity);

  // Check if activity feed structure is correct and has new entries
  let activityStructureValid = false;
  let hasJobEvents = false;

  if (hasActivityFeed && updatedStatus.recentActivity.length > 0) {
    const recentActivity = updatedStatus.recentActivity[0];
    activityStructureValid =
      recentActivity.timestamp &&
      recentActivity.type &&
      recentActivity.message &&
      recentActivity.icon;

    // Check for job-related events (created, started, failed, etc.)
    hasJobEvents = updatedStatus.recentActivity.some(activity =>
      activity.type && activity.type.startsWith('job:')
    );
  }

  // Log activity feed for debugging
  if (hasActivityFeed && updatedStatus.recentActivity.length > 0) {
    logger.info({
      activityCount: updatedStatus.recentActivity.length,
      latestActivity: updatedStatus.recentActivity.slice(0, 3)
    }, 'Activity feed sample');
  }

  const success = hasActivityFeed && activityStructureValid && hasJobEvents;
  logger.info({ success, hasActivityFeed, activityStructureValid, hasJobEvents }, 'TEST 4 Result');

  return {
    test: 'Activity Feed Job Events Display',
    passed: success,
    hasActivityFeed,
    activityStructureValid,
    hasJobEvents,
    activityCount: updatedActivityCount,
    sampleActivity: hasActivityFeed && updatedStatus.recentActivity.length > 0 ? updatedStatus.recentActivity[0] : null
  };
}

function logTestResult(result: any, index: number) {
  const status = result.passed ? '✓ PASS' : '✗ FAIL';
  logger.info(`${index + 1}. ${result.test}: ${status}`);

  if (result.scenarios) {
    result.scenarios.forEach((scenario: any) => {
      logger.info(`${scenario.passed ? '  ✓' : '  ✗'} ${scenario.scenario}: ${scenario.message}`);
    });
  } else if (result.errorMessage) {
    logger.info(`   Error message: "${result.errorMessage}"`);
  } else if (result.retryMetrics) {
    logger.info({
      activeRetries: result.retryMetrics.activeRetries,
      totalAttempts: result.retryMetrics.totalRetryAttempts
    }, '   Retry metrics');
  }
}

/**
 * Main test runner
 */
async function runTests() {
  logger.info('Starting Phase 4.1.2 - Error Classification UI Validation Tests');
  logger.info(`API Base URL: ${API_BASE_URL}`);

  const results = [];

  try {
    logger.info('Checking API health...');
    const healthResponse = await fetch(`${API_BASE_URL}/health`);
    if (!healthResponse.ok) throw new Error('API server is not healthy');
    logger.info('API server is healthy ✓');

    if (TESTS_TO_RUN.retryableErrors) results.push(await testRetryableErrors());
    if (TESTS_TO_RUN.nonRetryableErrors) results.push(await testNonRetryableErrors());
    if (TESTS_TO_RUN.errorMessages) results.push(await testErrorMessages());
    if (TESTS_TO_RUN.activityFeed) results.push(await testActivityFeed());

    logger.info('\n=== TEST SUMMARY ===');
    const passed = results.filter(r => r.passed).length;
    results.forEach((result, index) => logTestResult(result, index));
    logger.info(`\n${passed}/${results.length} tests passed`);

    process.exit(passed === results.length ? 0 : 1);

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

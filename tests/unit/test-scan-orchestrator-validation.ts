#!/usr/bin/env -S npx tsx
/**
 * Test scan orchestrator validation
 * Verifies that scanRepository properly validates repoPath parameter
 *
 * TypeScript Best Practices:
 * - Uses `unknown` for error handling with proper type guards
 * - Uses `any` assertions only for intentionally invalid test inputs
 * - Proper type narrowing with instanceof checks
 * - Helper function to reduce code duplication
 */

import { ScanOrchestrator, ScanError } from '../../sidequest/pipeline-core/scan-orchestrator.ts';
import { strict as assert } from 'assert';

/**
 * Type guard to check if error is ScanError
 */
function isScanError(error: unknown): error is ScanError {
  return error instanceof ScanError;
}

/**
 * Type guard to check if error is Error
 */
function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/**
 * Test case result type
 */
interface TestResult {
  testName: string;
  passed: boolean;
  error?: string;
}

/**
 * Test constants for invalid inputs
 * Using named constants avoids magic numbers and improves test readability
 */
const TEST_INVALID_NUMERIC_PATH = 123;

/**
 * Helper function to test invalid repository path
 */
async function testInvalidRepoPath(
  orchestrator: ScanOrchestrator,
  testName: string,
  invalidValue: any,
  expectedErrorFragment: string
): Promise<TestResult> {
  console.log(`Test: ${testName}`);

  try {
    await orchestrator.scanRepository(invalidValue);
    console.log(`❌ FAILED: Should have thrown ScanError for ${testName}`);
    return {
      testName,
      passed: false,
      error: `Expected ScanError but no error was thrown`
    };
  } catch (error: unknown) {
    if (isScanError(error) && error.message.includes(expectedErrorFragment)) {
      console.log(`✅ PASSED: Correctly rejected ${testName}\n`);
      return { testName, passed: true };
    } else {
      const errorMsg = isError(error) ? error.message : String(error);
      console.log(`❌ FAILED: Wrong error type or message: ${errorMsg}`);
      return {
        testName,
        passed: false,
        error: `Expected ScanError with "${expectedErrorFragment}" but got: ${errorMsg}`
      };
    }
  }
}

/**
 * Main test function for ScanOrchestrator validation
 */
async function testScanOrchestratorValidation(): Promise<void> {
  console.log('🧪 Testing ScanOrchestrator validation...\n');

  const orchestrator = new ScanOrchestrator();
  const results: TestResult[] = [];

  // Test 1: undefined repoPath
  results.push(await testInvalidRepoPath(
    orchestrator,
    'undefined repoPath',
    undefined as any,
    'Invalid repository path: undefined'
  ));

  // Test 2: null repoPath
  results.push(await testInvalidRepoPath(
    orchestrator,
    'null repoPath',
    null as any,
    'Invalid repository path: null'
  ));

  // Test 3: empty string repoPath
  results.push(await testInvalidRepoPath(
    orchestrator,
    'empty string repoPath',
    '',
    'Invalid repository path'
  ));

  // Test 4: non-string repoPath (number)
  results.push(await testInvalidRepoPath(
    orchestrator,
    `number repoPath (${TEST_INVALID_NUMERIC_PATH})`,
    TEST_INVALID_NUMERIC_PATH as any,
    'Invalid repository path: number'
  ));

  // Test 5: non-string repoPath (object)
  results.push(await testInvalidRepoPath(
    orchestrator,
    'object repoPath ({ path: "/some/path" })',
    { path: '/some/path' } as any,
    'Invalid repository path: object'
  ));

  // Summary
  const failedTests = results.filter(r => !r.passed);

  if (failedTests.length > 0) {
    console.log('\n❌ Test Suite Failed\n');
    console.log(`Failed tests (${failedTests.length}/${results.length}):`);
    failedTests.forEach(test => {
      console.log(`  - ${test.testName}: ${test.error}`);
    });
    process.exit(1);
  }

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║       All ScanOrchestrator Validation Tests Passed! ✅        ║');
  console.log(`║                 ${results.length}/${results.length} tests passed                              ║`);
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
}

// Execute the test
testScanOrchestratorValidation().catch((error: Error) => {
  console.error('\n❌ Test suite failed:', error);
  process.exit(1);
});
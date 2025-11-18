#!/usr/bin/env node
/**
 * Test scan orchestrator validation
 * Verifies that scanRepository properly validates repoPath parameter
 */

import { ScanOrchestrator, ScanError } from '../../lib/scan-orchestrator.js';
import { strict as assert } from 'assert';

async function testScanOrchestratorValidation() {
  console.log('🧪 Testing ScanOrchestrator validation...\n');

  const orchestrator = new ScanOrchestrator();

  // Test 1: undefined repoPath
  console.log('Test 1: undefined repoPath');
  try {
    await orchestrator.scanRepository(undefined);
    console.log('❌ FAILED: Should have thrown ScanError for undefined');
    process.exit(1);
  } catch (error) {
    if (error instanceof ScanError && error.message.includes('Invalid repository path: undefined')) {
      console.log('✅ PASSED: Correctly rejected undefined repoPath\n');
    } else {
      console.log('❌ FAILED: Wrong error type or message:', error.message);
      process.exit(1);
    }
  }

  // Test 2: null repoPath
  console.log('Test 2: null repoPath');
  try {
    await orchestrator.scanRepository(null);
    console.log('❌ FAILED: Should have thrown ScanError for null');
    process.exit(1);
  } catch (error) {
    if (error instanceof ScanError && error.message.includes('Invalid repository path: null')) {
      console.log('✅ PASSED: Correctly rejected null repoPath\n');
    } else {
      console.log('❌ FAILED: Wrong error type or message:', error.message);
      process.exit(1);
    }
  }

  // Test 3: empty string repoPath
  console.log('Test 3: empty string repoPath');
  try {
    await orchestrator.scanRepository('');
    console.log('❌ FAILED: Should have thrown ScanError for empty string');
    process.exit(1);
  } catch (error) {
    if (error instanceof ScanError && error.message.includes('Invalid repository path')) {
      console.log('✅ PASSED: Correctly rejected empty string repoPath\n');
    } else {
      console.log('❌ FAILED: Wrong error type or message:', error.message);
      process.exit(1);
    }
  }

  // Test 4: non-string repoPath (number)
  console.log('Test 4: non-string repoPath (number)');
  try {
    await orchestrator.scanRepository(123);
    console.log('❌ FAILED: Should have thrown ScanError for number');
    process.exit(1);
  } catch (error) {
    if (error instanceof ScanError && error.message.includes('Invalid repository path: number')) {
      console.log('✅ PASSED: Correctly rejected number repoPath\n');
    } else {
      console.log('❌ FAILED: Wrong error type or message:', error.message);
      process.exit(1);
    }
  }

  // Test 5: non-string repoPath (object)
  console.log('Test 5: non-string repoPath (object)');
  try {
    await orchestrator.scanRepository({ path: '/some/path' });
    console.log('❌ FAILED: Should have thrown ScanError for object');
    process.exit(1);
  } catch (error) {
    if (error instanceof ScanError && error.message.includes('Invalid repository path: object')) {
      console.log('✅ PASSED: Correctly rejected object repoPath\n');
    } else {
      console.log('❌ FAILED: Wrong error type or message:', error.message);
      process.exit(1);
    }
  }

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║       All ScanOrchestrator Validation Tests Passed! ✅        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
}

testScanOrchestratorValidation().catch((error) => {
  console.error('\n❌ Test suite failed:', error);
  process.exit(1);
});

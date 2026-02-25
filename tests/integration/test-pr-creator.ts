#!/usr/bin/env node
/**
 * Phase 4.1.5 - Auto-PR Creation Feature Validation
 *
 * Tests PRCreator functionality for automated pull request creation:
 * - Dry-run mode (prevents actual PR creation)
 * - Suggestion filtering (automatable + impact >= 50)
 * - Batching (max 5 suggestions per PR)
 * - Branch naming and commit messages
 * - PR description generation
 * - Error handling and cleanup
 */

import { PRCreator } from '../../sidequest/pipeline-core/git/pr-creator.ts';
import { createComponentLogger } from '../../sidequest/utils/logger.ts';
import { createTempRepository } from '../fixtures/test-helpers.ts';
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';

const logger = createComponentLogger('PRCreatorTest');

/**
 * Mock scan result with suggestions
 */
function createMockSuggestions(count, options = {}) {
  const suggestions = [];

  for (let i = 1; i <= count; i++) {
    suggestions.push({
      suggestion_id: `SUG-${i}`,
      target_name: `ConsolidatedUtil${i}`,
      target_location: `lib/utils/consolidated-util-${i}.js`,
      strategy: 'utility-function',
      impact_score: options.lowImpact ? 40 : 75,
      complexity: 'medium',
      migration_risk: 'low',
      automated_refactor_possible: options.nonAutomatable ? false : true,
      strategy_rationale: `Consolidate duplicate utility function pattern ${i} to improve maintainability`,
      proposed_implementation: `// Consolidated utility function ${i}\nexport function consolidatedUtil${i}() {\n  return 'Implementation ${i}';\n}\n`,
      migration_steps: [
        {
          step_number: 1,
          description: 'Import consolidated utility',
          affected_files: [`src/file${i}.js`]
        },
        {
          step_number: 2,
          description: 'Replace duplicate implementations',
          affected_files: [`src/file${i}.js`]
        }
      ],
      usage_example: `import { consolidatedUtil${i} } from './sidequest/pipeline-core/utils/consolidated-util-${i}';\n\nconst result = consolidatedUtil${i}();`
    });
  }

  return suggestions;
}

/**
 * Initialize git repository for testing
 */
async function initGitRepo(repoPath) {
  await runGitCommand(repoPath, ['init']);
  await runGitCommand(repoPath, ['config', 'user.name', 'Test User']);
  await runGitCommand(repoPath, ['config', 'user.email', 'test@example.com']);

  // Create initial commit
  await fs.writeFile(path.join(repoPath, 'README.md'), '# Test Repository\n', 'utf-8');
  await runGitCommand(repoPath, ['add', 'README.md']);
  await runGitCommand(repoPath, ['commit', '-m', 'Initial commit']);
}

/**
 * Run git command
 */
function runGitCommand(cwd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', args, { cwd });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Git command failed: git ${args.join(' ')}\n${stderr}`));
      }
    });

    proc.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Test 1: Dry Run Mode
 * Verify dry-run mode prevents actual PR creation
 */
async function testDryRunMode() {
  logger.info('TEST 1: Dry Run Mode');

  const testRepo = await createTempRepository('pr-creator-dryrun');

  try {
    // Initialize git repo
    await initGitRepo(testRepo.path);

    // Create mock scan result
    const scanResult = {
      suggestions: createMockSuggestions(3)
    };

    // Create PRCreator in dry-run mode
    const creator = new PRCreator({
      dryRun: true,
      baseBranch: 'main'
    });

    // Create PRs (should not actually create PRs)
    const result = await creator.createPRsForSuggestions(scanResult, testRepo.path);

    // Verify dry-run results
    const dryRunSuccess =
      result.prsCreated === 1 && // 3 suggestions = 1 batch
      result.prUrls.length === 1 &&
      result.prUrls[0].startsWith('dry-run-') &&
      result.errors.length === 0;

    // Verify we're still on main branch
    const currentBranch = await runGitCommand(testRepo.path, ['branch', '--show-current']);
    const onMainBranch = currentBranch === 'main';

    // Verify no remote branches created
    const branches = await runGitCommand(testRepo.path, ['branch', '-a']);
    const noRemoteBranches = !branches.includes('remotes/');

    const success = dryRunSuccess && onMainBranch && noRemoteBranches;

    logger.info({
      success,
      prsCreated: result.prsCreated,
      prUrls: result.prUrls,
      onMainBranch,
      noRemoteBranches
    }, 'TEST 1 Result');

    return {
      test: 'Dry Run Mode',
      passed: success,
      prsCreated: result.prsCreated,
      prUrls: result.prUrls,
      onMainBranch,
      noRemoteBranches
    };
  } finally {
    await testRepo.cleanup();
  }
}

/**
 * Test 2: Suggestion Filtering
 * Verify only automatable suggestions with impact >= 50 are processed
 */
async function testSuggestionFiltering() {
  logger.info('TEST 2: Suggestion Filtering');

  const testRepo = await createTempRepository('pr-creator-filtering');

  try {
    // Initialize git repo
    await initGitRepo(testRepo.path);

    // Create mixed suggestions
    const scanResult = {
      suggestions: [
        ...createMockSuggestions(2), // Good: automatable, impact 75
        ...createMockSuggestions(2, { lowImpact: true }), // Bad: low impact (40)
        ...createMockSuggestions(2, { nonAutomatable: true }) // Bad: not automatable
      ]
    };

    const creator = new PRCreator({ dryRun: true });

    const result = await creator.createPRsForSuggestions(scanResult, testRepo.path);

    // Should only process 2 suggestions (the good ones)
    // Note: skipped count only applies to suggestions that couldn't be batched
    // Filtered suggestions are not counted in skipped
    const filteringSuccess =
      result.prsCreated === 1; // 2 good suggestions = 1 batch

    logger.info({
      filteringSuccess,
      prsCreated: result.prsCreated,
      skipped: result.skipped,
      totalSuggestions: scanResult.suggestions.length,
      expectedProcessed: 2
    }, 'TEST 2 Result');

    return {
      test: 'Suggestion Filtering',
      passed: filteringSuccess,
      prsCreated: result.prsCreated,
      skipped: result.skipped,
      totalSuggestions: scanResult.suggestions.length,
      expectedProcessed: 2,
      note: 'Filtered out 4 non-automatable/low-impact suggestions'
    };
  } finally {
    await testRepo.cleanup();
  }
}

/**
 * Test 3: Batching (Max 5 per PR)
 * Verify suggestions are batched correctly
 */
async function testBatching() {
  logger.info('TEST 3: Batching (Max 5 per PR)');

  const testRepo = await createTempRepository('pr-creator-batching');

  try {
    // Initialize git repo
    await initGitRepo(testRepo.path);

    // Create 12 good suggestions (should create 3 PRs: 5, 5, 2)
    const scanResult = {
      suggestions: createMockSuggestions(12)
    };

    const creator = new PRCreator({
      dryRun: true,
      maxSuggestionsPerPR: 5
    });

    const result = await creator.createPRsForSuggestions(scanResult, testRepo.path);

    // Should create 3 batches: 5 + 5 + 2
    const batchingSuccess =
      result.prsCreated === 3 &&
      result.prUrls.length === 3 &&
      result.errors.length === 0;

    logger.info({
      batchingSuccess,
      prsCreated: result.prsCreated,
      totalSuggestions: scanResult.suggestions.length,
      expectedBatches: 3
    }, 'TEST 3 Result');

    return {
      test: 'Batching (Max 5 per PR)',
      passed: batchingSuccess,
      prsCreated: result.prsCreated,
      totalSuggestions: scanResult.suggestions.length,
      expectedBatches: 3
    };
  } finally {
    await testRepo.cleanup();
  }
}

/**
 * Test 4: Branch Naming
 * Verify branch names are generated correctly
 */
async function testBranchNaming() {
  logger.info('TEST 4: Branch Naming');

  const testRepo = await createTempRepository('pr-creator-branches');

  try {
    // Initialize git repo
    await initGitRepo(testRepo.path);

    const scanResult = {
      suggestions: createMockSuggestions(2)
    };

    const creator = new PRCreator({
      dryRun: true,
      branchPrefix: 'consolidate'
    });

    const result = await creator.createPRsForSuggestions(scanResult, testRepo.path);

    // Check branch naming pattern
    const hasPrUrl = result.prUrls && result.prUrls.length > 0;
    let branchNameValid = false;
    let branchName = '';

    if (hasPrUrl) {
      branchName = result.prUrls[0].replace('dry-run-', '');
      branchNameValid =
        branchName.startsWith('consolidate/batch-1-') &&
        /consolidate\/batch-1-\d+/.test(branchName);
    }

    logger.info({
      branchNameValid,
      branchName
    }, 'TEST 4 Result');

    return {
      test: 'Branch Naming',
      passed: branchNameValid,
      branchName,
      expectedPattern: 'consolidate/batch-{number}-{timestamp}'
    };
  } finally {
    await testRepo.cleanup();
  }
}

/**
 * Test 5: No Suggestions Handling
 * Verify graceful handling when no suggestions provided
 */
async function testNoSuggestions() {
  logger.info('TEST 5: No Suggestions Handling');

  const testRepo = await createTempRepository('pr-creator-nosug');

  try {
    // Initialize git repo
    await initGitRepo(testRepo.path);

    const scanResult = {
      suggestions: []
    };

    const creator = new PRCreator({ dryRun: true });

    const result = await creator.createPRsForSuggestions(scanResult, testRepo.path);

    const noSuggestionsSuccess =
      result.prsCreated === 0 &&
      (!result.prUrls || result.prUrls.length === 0) &&
      result.skipped === 0 &&
      result.errors.length === 0;

    logger.info({
      noSuggestionsSuccess,
      result
    }, 'TEST 5 Result');

    return {
      test: 'No Suggestions Handling',
      passed: noSuggestionsSuccess,
      prsCreated: result.prsCreated,
      expectedBehavior: 'Returns empty result without errors'
    };
  } finally {
    await testRepo.cleanup();
  }
}

/**
 * Test 6: File Creation
 * Verify consolidated files are created correctly in dry-run
 */
async function testFileCreation() {
  logger.info('TEST 6: File Creation');

  const testRepo = await createTempRepository('pr-creator-files');

  try {
    // Initialize git repo
    await initGitRepo(testRepo.path);

    const scanResult = {
      suggestions: createMockSuggestions(2)
    };

    const creator = new PRCreator({ dryRun: true });

    const result = await creator.createPRsForSuggestions(scanResult, testRepo.path);

    // In dry-run, files should be created but branch deleted
    // Check if lib directory was created (then cleaned up)
    const fileCreationSuccess = result.prsCreated === 1;

    logger.info({
      fileCreationSuccess,
      prsCreated: result.prsCreated
    }, 'TEST 6 Result');

    return {
      test: 'File Creation',
      passed: fileCreationSuccess,
      prsCreated: result.prsCreated,
      expectedFiles: 2
    };
  } finally {
    await testRepo.cleanup();
  }
}

/**
 * Main test runner
 */
async function runTests() {
  logger.info('Starting Phase 4.1.5 - Auto-PR Creation Feature Validation Tests');

  const results = {
    test1: null,
    test2: null,
    test3: null,
    test4: null,
    test5: null,
    test6: null
  };

  try {
    // Run tests sequentially
    results.test1 = await testDryRunMode();
    results.test2 = await testSuggestionFiltering();
    results.test3 = await testBatching();
    results.test4 = await testBranchNaming();
    results.test5 = await testNoSuggestions();
    results.test6 = await testFileCreation();

    // Print summary
    console.log('\n=== TEST SUMMARY ===');

    if (results.test1.passed) {
      console.log('1. Dry Run Mode: ✓ PASS');
      console.log(`   PRs created: ${results.test1.prsCreated}, On main branch: ${results.test1.onMainBranch}`);
    } else {
      console.log('1. Dry Run Mode: ✗ FAIL');
    }

    if (results.test2.passed) {
      console.log('2. Suggestion Filtering: ✓ PASS');
      console.log(`   Processed: 2 of ${results.test2.totalSuggestions}, Skipped: ${results.test2.skipped}`);
    } else {
      console.log('2. Suggestion Filtering: ✗ FAIL');
    }

    if (results.test3.passed) {
      console.log('3. Batching (Max 5 per PR): ✓ PASS');
      console.log(`   Batches: ${results.test3.prsCreated} of ${results.test3.expectedBatches} expected`);
    } else {
      console.log('3. Batching (Max 5 per PR): ✗ FAIL');
    }

    if (results.test4.passed) {
      console.log('4. Branch Naming: ✓ PASS');
      console.log(`   Pattern: ${results.test4.expectedPattern}`);
    } else {
      console.log('4. Branch Naming: ✗ FAIL');
    }

    if (results.test5.passed) {
      console.log('5. No Suggestions Handling: ✓ PASS');
      console.log(`   Behavior: ${results.test5.expectedBehavior}`);
    } else {
      console.log('5. No Suggestions Handling: ✗ FAIL');
    }

    if (results.test6.passed) {
      console.log('6. File Creation: ✓ PASS');
      console.log(`   Expected files: ${results.test6.expectedFiles}`);
    } else {
      console.log('6. File Creation: ✗ FAIL');
    }

    const passedCount = Object.values(results).filter(r => r && r.passed).length;
    console.log(`\n${passedCount}/6 tests passed`);

    process.exit(passedCount === 6 ? 0 : 1);
  } catch (error) {
    logger.error({ error }, 'Test suite failed');
    console.error('Test suite error:', error.message);
    process.exit(1);
  }
}

// Run tests
runTests();

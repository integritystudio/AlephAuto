/**
 * Phase 4.1.4: Gitignore Manager Integration Tests
 *
 * Validates GitignoreWorker and GitignoreRepomixUpdater integration
 * Tests:
 * 1. Dry-run mode (no actual changes)
 * 2. Gitignore entry addition
 * 3. Skip existing entries
 * 4. Error handling
 * 5. Specific repository filtering
 */

import { GitignoreWorker } from '../../sidequest/workers/gitignore-worker.js';
import { createComponentLogger } from '../../sidequest/utils/logger.ts';
import { createMultipleTempRepositories } from '../fixtures/test-helpers.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import assert from 'assert';

const logger = createComponentLogger('GitignoreManagerTest');

/**
 * Create isolated test directory for repos
 * @returns {Promise<{path: string, cleanup: Function}>}
 */
async function createTestDirectory() {
  const testDir = path.join(os.tmpdir(), `gitignore-test-${Date.now()}`);
  await fs.mkdir(testDir, { recursive: true });

  return {
    path: testDir,
    cleanup: async () => {
      try {
        await fs.rm(testDir, { recursive: true, force: true });
      } catch (error) {
        logger.warn({ error, testDir }, 'Failed to cleanup test directory');
      }
    }
  };
}

/**
 * Create git repository in test directory
 */
async function createGitRepo(testDir, repoName) {
  const repoPath = path.join(testDir, repoName);
  await fs.mkdir(repoPath, { recursive: true });
  await fs.mkdir(path.join(repoPath, '.git'), { recursive: true });
  return repoPath;
}

/**
 * Test 1: Dry Run Mode
 * Verify dry-run mode doesn't modify .gitignore files
 */
async function testDryRunMode() {
  logger.info('TEST 1: Dry Run Mode');

  const testDir = await createTestDirectory();

  try {
    // Create 3 test repos
    const repos = [];
    for (let i = 1; i <= 3; i++) {
      const repoPath = await createGitRepo(testDir.path, `repo-${i}`);
      repos.push(repoPath);

      // Create .gitignore files (without repomix-output.xml entry)
      await fs.writeFile(
        path.join(repoPath, '.gitignore'),
        'node_modules/\n.env\n'
      );
    }

    // Create worker
    const worker = new GitignoreWorker({
      baseDir: testDir.path,
      maxConcurrent: 1
    });

    // Create dry-run job
    const job = await worker.createJob('test-dry-run', {
      baseDir: testDir.path,
      dryRun: true,
      gitignoreEntry: 'repomix-output.xml'
    });

    // Run job
    const result = await worker.runJobHandler(job);

    // Verify results
    const dryRunSuccess =
      result.dryRun === true &&
      result.summary.would_add === 3 &&
      result.summary.added === 0;

    // Verify .gitignore files weren't modified
    let filesUnmodified = true;
    for (const repoPath of repos) {
      const content = await fs.readFile(
        path.join(repoPath, '.gitignore'),
        'utf-8'
      );
      if (content.includes('repomix-output.xml')) {
        filesUnmodified = false;
        break;
      }
    }

    const success = dryRunSuccess && filesUnmodified;

    logger.info({
      success,
      wouldAdd: result.summary.would_add,
      filesUnmodified
    }, 'TEST 1 Result');

    return {
      test: 'Dry Run Mode',
      passed: success,
      wouldAdd: result.summary.would_add,
      actuallyAdded: result.summary.added,
      filesUnmodified
    };
  } finally {
    // Cleanup
    await testDir.cleanup();
  }
}

/**
 * Test 2: Gitignore Entry Addition
 * Verify entries are added correctly to .gitignore files
 */
async function testGitignoreAddition() {
  logger.info('TEST 2: Gitignore Entry Addition');

  const testDir = await createTestDirectory();

  try {
    // Create 2 test repos in isolated directory
    const repos = [];
    for (let i = 1; i <= 2; i++) {
      const repoPath = await createGitRepo(testDir.path, `repo-${i}`);
      repos.push(repoPath);

      // Create .gitignore files (without repomix-output.xml entry)
      await fs.writeFile(
        path.join(repoPath, '.gitignore'),
        'node_modules/\n.env\n'
      );
    }

    // Create worker
    const worker = new GitignoreWorker({
      baseDir: testDir.path,
      maxConcurrent: 1
    });

    // Create update job (NOT dry-run)
    const job = await worker.createJob('test-add-entry', {
      baseDir: testDir.path,
      dryRun: false,
      gitignoreEntry: 'repomix-output.xml'
    });

    // Run job
    const result = await worker.runJobHandler(job);

    // Verify results
    const additionSuccess = result.summary.added === 2;

    // Verify .gitignore files were modified
    let entriesAdded = 0;
    for (const repoPath of repos) {
      const content = await fs.readFile(
        path.join(repoPath, '.gitignore'),
        'utf-8'
      );
      if (content.includes('repomix-output.xml')) {
        entriesAdded++;
      }
    }

    const success = additionSuccess && entriesAdded === result.summary.added;

    logger.info({
      success,
      added: result.summary.added,
      entriesAdded
    }, 'TEST 2 Result');

    return {
      test: 'Gitignore Entry Addition',
      passed: success,
      added: result.summary.added,
      entriesAdded,
      matchesExpected: entriesAdded === result.summary.added
    };
  } finally {
    // Cleanup
    await testDir.cleanup();
  }
}

/**
 * Test 3: Skip Existing Entries
 * Verify existing entries are not duplicated
 */
async function testSkipExisting() {
  logger.info('TEST 3: Skip Existing Entries');

  const testDir = await createTestDirectory();

  try {
    // Create 2 test repos in isolated directory
    const repos = [];
    for (let i = 1; i <= 2; i++) {
      const repoPath = await createGitRepo(testDir.path, `repo-${i}`);
      repos.push(repoPath);

      // Create .gitignore files (WITH repomix-output.xml entry already)
      await fs.writeFile(
        path.join(repoPath, '.gitignore'),
        'node_modules/\n.env\nrepomix-output.xml\n'
      );
    }

    // Create worker
    const worker = new GitignoreWorker({
      baseDir: testDir.path,
      maxConcurrent: 1
    });

    // Create update job
    const job = await worker.createJob('test-skip-existing', {
      baseDir: testDir.path,
      dryRun: false,
      gitignoreEntry: 'repomix-output.xml'
    });

    // Run job
    const result = await worker.runJobHandler(job);

    // Verify results - should skip all repos
    const skipSuccess =
      result.summary.skipped === 2 &&
      result.summary.added === 0;

    // Verify no duplicate entries were added
    let noDuplicates = true;
    for (const repoPath of repos) {
      const content = await fs.readFile(
        path.join(repoPath, '.gitignore'),
        'utf-8'
      );
      const matches = content.match(/repomix-output\.xml/g) || [];
      if (matches.length !== 1) {
        noDuplicates = false;
        break;
      }
    }

    const success = skipSuccess && noDuplicates;

    logger.info({
      success,
      skipped: result.summary.skipped,
      noDuplicates
    }, 'TEST 3 Result');

    return {
      test: 'Skip Existing Entries',
      passed: success,
      skipped: result.summary.skipped,
      added: result.summary.added,
      noDuplicates
    };
  } finally {
    // Cleanup
    await testDir.cleanup();
  }
}

/**
 * Test 4: Error Handling
 * Verify graceful handling of missing .gitignore files
 */
async function testErrorHandling() {
  logger.info('TEST 4: Error Handling');

  const testDir = await createTestDirectory();

  try {
    // Create 3 test repos in isolated directory
    const repos = [];
    for (let i = 1; i <= 3; i++) {
      const repoPath = await createGitRepo(testDir.path, `repo-${i}`);
      repos.push(repoPath);
    }

    // Create .gitignore only for first 2 repos, leave 3rd without
    for (let i = 0; i < 2; i++) {
      await fs.writeFile(
        path.join(repos[i], '.gitignore'),
        'node_modules/\n.env\n'
      );
    }
    // Third repo has no .gitignore

    // Create worker
    const worker = new GitignoreWorker({
      baseDir: testDir.path,
      maxConcurrent: 1
    });

    // Create update job
    const job = await worker.createJob('test-error-handling', {
      baseDir: testDir.path,
      dryRun: false,
      gitignoreEntry: 'repomix-output.xml'
    });

    // Run job - should handle missing .gitignore gracefully
    const result = await worker.runJobHandler(job);

    // Verify: should add to 2 repos, handle 3rd gracefully
    const handlingSuccess =
      result.summary.added >= 2 &&
      result.totalRepositories === 3;

    logger.info({
      totalRepos: result.totalRepositories,
      added: result.summary.added,
      errors: result.summary.error || 0
    }, 'TEST 4 Result');

    return {
      test: 'Error Handling',
      passed: handlingSuccess,
      totalRepositories: result.totalRepositories,
      added: result.summary.added,
      errors: result.summary.error || 0
    };
  } finally {
    // Cleanup
    await testDir.cleanup();
  }
}

/**
 * Test 5: Specific Repository Filtering
 * Verify ability to process only specific repositories
 */
async function testSpecificRepositories() {
  logger.info('TEST 5: Specific Repository Filtering');

  const testDir = await createTestDirectory();

  try {
    // Create 3 test repos in isolated directory
    const repos = [];
    for (let i = 1; i <= 3; i++) {
      const repoPath = await createGitRepo(testDir.path, `repo-${i}`);
      repos.push(repoPath);

      // Create .gitignore files for all repos
      await fs.writeFile(
        path.join(repoPath, '.gitignore'),
        'node_modules/\n.env\n'
      );
    }

    // Create worker
    const worker = new GitignoreWorker({
      baseDir: testDir.path,
      maxConcurrent: 1
    });

    // Create update job for only first 2 repos
    const specificRepos = [repos[0], repos[1]];
    const job = await worker.createJob('test-specific-repos', {
      baseDir: testDir.path,
      dryRun: false,
      gitignoreEntry: 'repomix-output.xml',
      repositories: specificRepos
    });

    // Run job
    const result = await worker.runJobHandler(job);

    // Verify: should only process 2 repos
    const filterSuccess = result.summary.added === 2;

    // Verify only first 2 repos were modified
    const firstModified = (await fs.readFile(
      path.join(repos[0], '.gitignore'),
      'utf-8'
    )).includes('repomix-output.xml');

    const secondModified = (await fs.readFile(
      path.join(repos[1], '.gitignore'),
      'utf-8'
    )).includes('repomix-output.xml');

    const thirdUnmodified = !(await fs.readFile(
      path.join(repos[2], '.gitignore'),
      'utf-8'
    )).includes('repomix-output.xml');

    const success = filterSuccess && firstModified && secondModified && thirdUnmodified;

    logger.info({
      success,
      added: result.summary.added,
      firstModified,
      secondModified,
      thirdUnmodified
    }, 'TEST 5 Result');

    return {
      test: 'Specific Repository Filtering',
      passed: success,
      added: result.summary.added,
      expectedModified: 2,
      firstModified,
      secondModified,
      thirdUnmodified
    };
  } finally {
    // Cleanup
    await testDir.cleanup();
  }
}

/**
 * Main test runner
 */
async function runTests() {
  logger.info('Starting Phase 4.1.4 - Gitignore Manager Integration Tests');

  const results = {
    test1: null,
    test2: null,
    test3: null,
    test4: null,
    test5: null
  };

  try {
    // Run tests sequentially
    results.test1 = await testDryRunMode();
    results.test2 = await testGitignoreAddition();
    results.test3 = await testSkipExisting();
    results.test4 = await testErrorHandling();
    results.test5 = await testSpecificRepositories();

    // Print summary
    console.log('\n=== TEST SUMMARY ===');

    if (results.test1.passed) {
      console.log('1. Dry Run Mode: ✓ PASS');
      console.log(`   Would add: ${results.test1.wouldAdd}, Actually added: ${results.test1.actuallyAdded}`);
    } else {
      console.log('1. Dry Run Mode: ✗ FAIL');
    }

    if (results.test2.passed) {
      console.log('2. Gitignore Entry Addition: ✓ PASS');
      console.log(`   Added: ${results.test2.added}, Verified: ${results.test2.entriesAdded}`);
    } else {
      console.log('2. Gitignore Entry Addition: ✗ FAIL');
    }

    if (results.test3.passed) {
      console.log('3. Skip Existing Entries: ✓ PASS');
      console.log(`   Skipped: ${results.test3.skipped}, No duplicates: ${results.test3.noDuplicates}`);
    } else {
      console.log('3. Skip Existing Entries: ✗ FAIL');
    }

    if (results.test4.passed) {
      console.log('4. Error Handling: ✓ PASS');
      console.log(`   Total repos: ${results.test4.totalRepositories}, Added: ${results.test4.added}`);
    } else {
      console.log('4. Error Handling: ✗ FAIL');
    }

    if (results.test5.passed) {
      console.log('5. Specific Repository Filtering: ✓ PASS');
      console.log(`   Modified: ${results.test5.added} of ${results.test5.expectedModified} expected`);
    } else {
      console.log('5. Specific Repository Filtering: ✗ FAIL');
    }

    const passedCount = Object.values(results).filter(r => r && r.passed).length;
    console.log(`\n${passedCount}/5 tests passed`);

    process.exit(passedCount === 5 ? 0 : 1);
  } catch (error) {
    logger.error({ error }, 'Test suite failed');
    console.error('Test suite error:', error.message);
    process.exit(1);
  }
}

// Run tests
runTests();

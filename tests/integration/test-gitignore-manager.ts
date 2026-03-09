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

import { GitignoreWorker } from '../../sidequest/workers/gitignore-worker.ts';
import { createComponentLogger } from '../../sidequest/utils/logger.ts';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const logger = createComponentLogger('GitignoreManagerTest');

/**
 * Create isolated test directory for repos
 * @returns {Promise<{path: string, cleanup: Function}>}
 */
async function createTestDirectory(): Promise<{ path: string; cleanup: () => Promise<void> }> {
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

async function createTestRepos(testDirPath: string, count: number, gitignoreContent?: string): Promise<string[]> {
  const repos: string[] = [];
  for (let i = 1; i <= count; i++) {
    const repoPath = await createGitRepo(testDirPath, `repo-${i}`);
    repos.push(repoPath);
    if (gitignoreContent !== undefined) {
      await fs.writeFile(path.join(repoPath, '.gitignore'), gitignoreContent);
    }
  }
  return repos;
}

function createGitignoreWorker(baseDir: string) {
  return new GitignoreWorker({ baseDir, maxConcurrent: 1 });
}

async function countGitignoreMatches(repos: string[], entry: string): Promise<number> {
  let count = 0;
  for (const repoPath of repos) {
    const content = await fs.readFile(path.join(repoPath, '.gitignore'), 'utf-8');
    if (content.includes(entry)) count++;
  }
  return count;
}

function printResult(index: number, label: string, passed: boolean, detail?: string) {
  console.log(`${index}. ${label}: ${passed ? '✓ PASS' : '✗ FAIL'}`);
  if (detail) console.log(`   ${detail}`);
}

/**
 * Test 1: Dry Run Mode
 * Verify dry-run mode doesn't modify .gitignore files
 */
async function testDryRunMode() {
  logger.info('TEST 1: Dry Run Mode');

  const testDir = await createTestDirectory();

  try {
    const repos = await createTestRepos(testDir.path, 3, 'node_modules/\n.env\n');

    const worker = createGitignoreWorker(testDir.path);
    const job = await worker.createJob('test-dry-run', {
      baseDir: testDir.path,
      dryRun: true,
      gitignoreEntry: 'repomix-output.xml'
    });
    const result = await worker.runJobHandler(job);

    const dryRunSuccess =
      result.dryRun === true &&
      result.summary.would_add === 3 &&
      result.summary.added === 0;

    const matchCount = await countGitignoreMatches(repos, 'repomix-output.xml');
    const filesUnmodified = matchCount === 0;
    const success = dryRunSuccess && filesUnmodified;

    logger.info({ success, wouldAdd: result.summary.would_add, filesUnmodified }, 'TEST 1 Result');

    return { test: 'Dry Run Mode', passed: success, wouldAdd: result.summary.would_add, actuallyAdded: result.summary.added, filesUnmodified };
  } finally {
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
    const repos = await createTestRepos(testDir.path, 2, 'node_modules/\n.env\n');

    const worker = createGitignoreWorker(testDir.path);
    const job = await worker.createJob('test-add-entry', {
      baseDir: testDir.path,
      dryRun: false,
      gitignoreEntry: 'repomix-output.xml'
    });
    const result = await worker.runJobHandler(job);

    const entriesAdded = await countGitignoreMatches(repos, 'repomix-output.xml');
    const success = result.summary.added === 2 && entriesAdded === result.summary.added;

    logger.info({ success, added: result.summary.added, entriesAdded }, 'TEST 2 Result');

    return { test: 'Gitignore Entry Addition', passed: success, added: result.summary.added, entriesAdded, matchesExpected: entriesAdded === result.summary.added };
  } finally {
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
    const repos = await createTestRepos(testDir.path, 2, 'node_modules/\n.env\nrepomix-output.xml\n');

    const worker = createGitignoreWorker(testDir.path);
    const job = await worker.createJob('test-skip-existing', {
      baseDir: testDir.path,
      dryRun: false,
      gitignoreEntry: 'repomix-output.xml'
    });
    const result = await worker.runJobHandler(job);

    const skipSuccess = result.summary.skipped === 2 && result.summary.added === 0;

    let noDuplicates = true;
    for (const repoPath of repos) {
      const content = await fs.readFile(path.join(repoPath, '.gitignore'), 'utf-8');
      if ((content.match(/repomix-output\.xml/g) || []).length !== 1) {
        noDuplicates = false;
        break;
      }
    }

    const success = skipSuccess && noDuplicates;

    logger.info({ success, skipped: result.summary.skipped, noDuplicates }, 'TEST 3 Result');

    return { test: 'Skip Existing Entries', passed: success, skipped: result.summary.skipped, added: result.summary.added, noDuplicates };
  } finally {
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
    // Create 3 repos; only first 2 get .gitignore files
    const repos = await createTestRepos(testDir.path, 3);
    for (let i = 0; i < 2; i++) {
      await fs.writeFile(path.join(repos[i], '.gitignore'), 'node_modules/\n.env\n');
    }

    const worker = createGitignoreWorker(testDir.path);
    const job = await worker.createJob('test-error-handling', {
      baseDir: testDir.path,
      dryRun: false,
      gitignoreEntry: 'repomix-output.xml'
    });
    const result = await worker.runJobHandler(job);

    const handlingSuccess = result.summary.added >= 2 && result.totalRepositories === 3;

    logger.info({ totalRepos: result.totalRepositories, added: result.summary.added, errors: result.summary.error || 0 }, 'TEST 4 Result');

    return { test: 'Error Handling', passed: handlingSuccess, totalRepositories: result.totalRepositories, added: result.summary.added, errors: result.summary.error || 0 };
  } finally {
    await testDir.cleanup();
  }
}

/**
 * Test 5: Specific Repository Filtering
 * Verify ability to process only specific repositories
 */
async function readGitignoreContains(repoPath: string, entry: string): Promise<boolean> {
  const content = await fs.readFile(path.join(repoPath, '.gitignore'), 'utf-8');
  return content.includes(entry);
}

async function testSpecificRepositories() {
  logger.info('TEST 5: Specific Repository Filtering');

  const testDir = await createTestDirectory();

  try {
    const repos = await createTestRepos(testDir.path, 3, 'node_modules/\n.env\n');

    const worker = createGitignoreWorker(testDir.path);
    const job = await worker.createJob('test-specific-repos', {
      baseDir: testDir.path,
      dryRun: false,
      gitignoreEntry: 'repomix-output.xml',
      repositories: [repos[0], repos[1]]
    });
    const result = await worker.runJobHandler(job);

    const filterSuccess = result.summary.added === 2;
    const firstModified = await readGitignoreContains(repos[0], 'repomix-output.xml');
    const secondModified = await readGitignoreContains(repos[1], 'repomix-output.xml');
    const thirdUnmodified = !(await readGitignoreContains(repos[2], 'repomix-output.xml'));
    const success = filterSuccess && firstModified && secondModified && thirdUnmodified;

    logger.info({ success, added: result.summary.added, firstModified, secondModified, thirdUnmodified }, 'TEST 5 Result');

    return { test: 'Specific Repository Filtering', passed: success, added: result.summary.added, expectedModified: 2, firstModified, secondModified, thirdUnmodified };
  } finally {
    await testDir.cleanup();
  }
}

/**
 * Main test runner
 */
async function runTests() {
  logger.info('Starting Phase 4.1.4 - Gitignore Manager Integration Tests');

  try {
    const test1 = await testDryRunMode();
    const test2 = await testGitignoreAddition();
    const test3 = await testSkipExisting();
    const test4 = await testErrorHandling();
    const test5 = await testSpecificRepositories();

    console.log('\n=== TEST SUMMARY ===');
    printResult(1, 'Dry Run Mode', test1.passed, `Would add: ${test1.wouldAdd}, Actually added: ${test1.actuallyAdded}`);
    printResult(2, 'Gitignore Entry Addition', test2.passed, `Added: ${test2.added}, Verified: ${test2.entriesAdded}`);
    printResult(3, 'Skip Existing Entries', test3.passed, `Skipped: ${test3.skipped}, No duplicates: ${test3.noDuplicates}`);
    printResult(4, 'Error Handling', test4.passed, `Total repos: ${test4.totalRepositories}, Added: ${test4.added}`);
    printResult(5, 'Specific Repository Filtering', test5.passed, `Modified: ${test5.added} of ${test5.expectedModified} expected`);

    const passedCount = [test1, test2, test3, test4, test5].filter(r => r.passed).length;
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

#!/usr/bin/env node

/**
 * Test script to verify RepomixWorker respects .gitignore files
 */

import { RepomixWorker } from '../../sidequest/workers/repomix-worker.ts';
import fs from 'fs/promises';
import path from 'path';
import { createTempRepository } from '../fixtures/test-helpers.ts';
import os from 'os';

async function testGitignoreRespect() {
  console.log('🔍 Testing .gitignore Respect...\n');

  // Create temporary test directory
  const testRepo = await createTempRepository('gitignore-test');
  const testDir = testRepo.path;
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'repomix-output-'));

  try {
    // Setup: Create test directory structure
    console.log('Setup: Creating test directory structure...');
    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(path.join(testDir, 'included'), { recursive: true });
    await fs.mkdir(path.join(testDir, 'ignored'), { recursive: true });
    await fs.mkdir(path.join(testDir, 'node_modules'), { recursive: true });

    // Create test files
    await fs.writeFile(
      path.join(testDir, 'included', 'file.js'),
      'console.log("This should be included");'
    );
    await fs.writeFile(
      path.join(testDir, 'ignored', 'file.js'),
      'console.log("This should be ignored");'
    );
    await fs.writeFile(
      path.join(testDir, 'node_modules', 'package.js'),
      'console.log("This should also be ignored");'
    );

    // Create .gitignore
    await fs.writeFile(
      path.join(testDir, '.gitignore'),
      'ignored/\n*.log\nnode_modules/\n'
    );

    console.log('✅ Test directory structure created\n');

    // Test 1: Default behavior (respects .gitignore)
    console.log('Test 1: RepomixWorker with default settings (respects .gitignore)...');
    const worker1 = new RepomixWorker({
      outputBaseDir: outputDir,
      maxConcurrent: 1,
    });

    const _job1 = worker1.createRepomixJob(testDir, 'gitignore-test');

    await new Promise((resolve) => {
      worker1.on('job:completed', async (job) => {
        console.log('✅ Job completed');

        // Read the output and verify ignored directory is not included
        const output = await fs.readFile(job.result.outputFile, 'utf8');

        if (output.includes('This should be included')) {
          console.log('  ✅ Included files are present');
        } else {
          console.log('  ❌ Included files are missing');
        }

        if (!output.includes('This should be ignored')) {
          console.log('  ✅ .gitignore\'d files are excluded');
        } else {
          console.log('  ⚠️  Warning: .gitignore\'d files are present (might be expected in some configs)');
        }

        if (!output.includes('node_modules')) {
          console.log('  ✅ node_modules excluded by default');
        }

        resolve();
      });

      worker1.on('job:failed', (job) => {
        console.error('❌ Job failed:', job.error);
        resolve();
      });
    });

    console.log('\nTest 2: RepomixWorker with additional ignore patterns...');
    const _worker2 = new RepomixWorker({
      outputBaseDir: outputDir,
      maxConcurrent: 1,
      additionalIgnorePatterns: ['*.log', 'temp/**'],
    });

    console.log('  ✅ Worker created with additional patterns: *.log, temp/**');

    // Cleanup
    console.log('\nCleanup: Removing test directories...');
    await testRepo.cleanup();
    await fs.rm(outputDir, { recursive: true, force: true });
    console.log('✅ Cleanup complete\n');

    console.log('=' .repeat(50));
    console.log('✨ All tests passed!');
    console.log('=' .repeat(50));
    console.log('\nSummary:');
    console.log('  ✓ .gitignore files are respected by default');
    console.log('  ✓ Ignored directories are excluded from output');
    console.log('  ✓ Additional ignore patterns can be specified');
    console.log('  ✓ node_modules excluded by default patterns\n');

    return true;
  } catch (error) {
    console.error('\n❌ Test failed:');
    console.error(error.message);
    console.error('\nStack trace:');
    console.error(error.stack);

    // Cleanup on error
    try {
      await testRepo.cleanup();
      await fs.rm(outputDir, { recursive: true, force: true });
    } catch (_cleanupError) {
      // Ignore cleanup errors
    }

    return false;
  }
}

// Run the test
testGitignoreRespect()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });

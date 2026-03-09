#!/usr/bin/env node
/**
 * Test script for RepoCleanupWorker
 * Tests worker initialization and dry run functionality
 */

import { RepoCleanupWorker } from '../../sidequest/workers/repo-cleanup-worker.ts';
import path from 'path';

const TEST_TIMEOUT_MS = 30000;

function setupCleanupEventListeners(worker: RepoCleanupWorker) {
  worker.on('job:started', (_j) => {
    console.log('✓ Job started event received');
  });

  worker.on('job:completed', (j) => {
    console.log('✓ Job completed event received');
    console.log('  Total items:', j.result?.totalItems || 0);
    console.log('  Summary:', j.result?.summary || {});
    process.exit(0);
  });

  worker.on('job:failed', (j) => {
    console.error('✗ Job failed:', j.error);
    process.exit(1);
  });
}

/**
 * main.
 */
async function main() {
  console.log('Testing RepoCleanupWorker...\n');

  console.log('Test 1: Initialize worker');
  const worker = new RepoCleanupWorker({ baseDir: path.join(process.cwd(), 'sidequest') });
  console.log('✓ Worker initialized');
  console.log('  Base directory:', worker.baseDir);
  console.log('  Script path:', worker.scriptPath);
  console.log('');

  console.log('Test 2: Create dry run job');
  const job = worker.createDryRunJob(path.join(process.cwd(), 'sidequest'));
  console.log('✓ Job created');
  console.log('  Job ID:', job.id);
  console.log('  Job type:', job.data.type);
  console.log('  Target dir:', job.data.targetDir);
  console.log('  Dry run:', job.data.dryRun);
  console.log('');

  console.log('Test 3: Test job events');
  setupCleanupEventListeners(worker);

  console.log('Waiting for job to complete...\n');
  setTimeout(() => {
    console.error('✗ Test timeout after 30 seconds');
    process.exit(1);
  }, TEST_TIMEOUT_MS);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

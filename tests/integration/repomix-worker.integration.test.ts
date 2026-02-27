/**
 * RepomixWorker Integration Tests
 *
 * Tests that require real repomix execution:
 * - Output directory creation during job processing
 *
 * Skipped automatically if repomix is not installed.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import { RepomixWorker } from '../../sidequest/workers/repomix-worker.ts';
import { createTempRepository, cleanupRepositories } from '../fixtures/test-helpers.ts';
import { initDatabase } from '../../sidequest/core/database.ts';
import { TIMEOUTS } from '../../sidequest/core/constants.ts';

let repomixAvailable = false;
try {
  execSync('npx repomix --version', { stdio: 'ignore', timeout: 15000 });
  repomixAvailable = true;
} catch {
  // repomix not installed — tests will be skipped
}

describe('RepomixWorker - Integration Tests', { skip: !repomixAvailable && 'repomix not available' }, () => {
  let testRepos: Awaited<ReturnType<typeof createTempRepository>>[] = [];
  let worker: RepomixWorker | undefined;

  beforeEach(async () => {
    await initDatabase(':memory:');
  });

  afterEach(async () => {
    worker?.stop();
    worker = undefined;
    if (testRepos.length > 0) {
      await cleanupRepositories(testRepos);
      testRepos = [];
    }
  });

  it('should create output directory structure', async () => {
    const testRepo = await createTempRepository('test');
    const outputRepo = await createTempRepository('output');
    testRepos.push(testRepo, outputRepo);

    worker = new RepomixWorker({
      outputBaseDir: outputRepo.path,
      logDir: path.join(outputRepo.path, 'logs'),
    });

    await fs.mkdir(path.join(outputRepo.path, 'logs'), { recursive: true });

    const relativePath = 'test/project';

    const jobDone = new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, TIMEOUTS.MEDIUM_MS);
      worker!.once('job:completed', () => { clearTimeout(timeout); resolve(); });
      worker!.once('job:failed', () => { clearTimeout(timeout); resolve(); });
    });

    worker.createRepomixJob(testRepo.path, relativePath);
    await jobDone;

    const outputDir = path.join(outputRepo.path, relativePath);
    const dirExists = await fs.access(outputDir).then(() => true).catch(() => false);
    assert.ok(dirExists, 'Output directory should be created');
  });
});

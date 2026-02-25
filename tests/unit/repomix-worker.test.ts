import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert';
import { RepomixWorker } from '../../sidequest/workers/repomix-worker.ts';
import { createTempRepository, createMultipleTempRepositories, cleanupRepositories } from '../fixtures/test-helpers.ts';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('RepomixWorker', () => {
  let testRepos = [];

  afterEach(async () => {
    // Cleanup all temporary repositories created during tests
    if (testRepos.length > 0) {
      await cleanupRepositories(testRepos);
      testRepos = [];
    }
  });

  test('should initialize with default options', () => {
    const worker = new RepomixWorker();
    assert.strictEqual(worker.outputBaseDir, './condense');
    assert.strictEqual(worker.codeBaseDir, path.join(os.homedir(), 'code'));
  });

  test('should initialize with custom options', () => {
    const worker = new RepomixWorker({
      outputBaseDir: '/custom/output',
      codeBaseDir: '/custom/code',
      maxConcurrent: 3,
    });

    assert.strictEqual(worker.outputBaseDir, '/custom/output');
    assert.strictEqual(worker.codeBaseDir, '/custom/code');
    assert.strictEqual(worker.maxConcurrent, 3);
  });

  test('should create a repomix job with correct structure', async () => {
    const worker = new RepomixWorker();
    const testRepo = await createTempRepository('test');
    testRepos.push(testRepo);

    worker.stop();

    const sourceDir = testRepo.path;
    const relativePath = 'project/subdir';

    const job = worker.createRepomixJob(sourceDir, relativePath);

    assert.ok(job.id.includes('repomix-'));
    assert.ok(job.id.includes('project-subdir'));
    assert.strictEqual(job.data.sourceDir, sourceDir);
    assert.strictEqual(job.data.relativePath, relativePath);
    assert.strictEqual(job.data.type, 'repomix');
  });

  test('should generate unique job IDs', async () => {
    const worker = new RepomixWorker();
    const repos = await createMultipleTempRepositories(2);
    testRepos.push(...repos);

    worker.stop();

    const job1 = worker.createRepomixJob(repos[0].path, 'dir1');
    const job2 = worker.createRepomixJob(repos[1].path, 'dir2');

    assert.notStrictEqual(job1.id, job2.id);
  });

  test('should create output directory structure', { skip: 'requires real repomix execution; move to integration tests' }, async () => {
    const testRepo = await createTempRepository('test');
    const outputRepo = await createTempRepository('output');
    testRepos.push(testRepo, outputRepo);

    const worker = new RepomixWorker({
      outputBaseDir: outputRepo.path,
      logDir: path.join(outputRepo.path, 'logs'),
    });

    await fs.mkdir(path.join(outputRepo.path, 'logs'), { recursive: true });

    const relativePath = 'test/project';

    const jobDone = new Promise((resolve) => {
      const timeout = setTimeout(resolve, 5000);
      worker.once('job:completed', () => { clearTimeout(timeout); resolve(); });
      worker.once('job:failed', () => { clearTimeout(timeout); resolve(); });
    });

    worker.createRepomixJob(testRepo.path, relativePath);
    await jobDone;

    worker.stop();

    const outputDir = path.join(outputRepo.path, relativePath);
    const dirExists = await fs.access(outputDir).then(() => true).catch(() => false);
    assert.ok(dirExists, 'Output directory should be created');
  });

  test('should queue multiple jobs', async () => {
    const worker = new RepomixWorker();
    const repos = await createMultipleTempRepositories(3);
    testRepos.push(...repos);

    worker.stop();

    worker.createRepomixJob(repos[0].path, 'dir1');
    worker.createRepomixJob(repos[1].path, 'dir2');
    worker.createRepomixJob(repos[2].path, 'dir3');

    const allJobs = worker.getAllJobs();
    assert.strictEqual(allJobs.length, 3);
  });

  test('should inherit from SidequestServer', () => {
    const worker = new RepomixWorker();

    // Should have SidequestServer methods
    assert.ok(typeof worker.createJob === 'function');
    assert.ok(typeof worker.getJob === 'function');
    assert.ok(typeof worker.getAllJobs === 'function');
    assert.ok(typeof worker.getStats === 'function');
  });

  test('should emit job events', async () => {
    const worker = new RepomixWorker();
    const testRepo = await createTempRepository('test');
    testRepos.push(testRepo);

    worker.stop();

    const eventPromise = new Promise((resolve) => {
      worker.on('job:created', (job) => {
        assert.ok(job.id);
        assert.strictEqual(job.data.type, 'repomix');
        resolve();
      });
    });

    worker.createRepomixJob(testRepo.path, 'test-dir');

    await eventPromise;
  });
});

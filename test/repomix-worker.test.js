import { test, describe } from 'node:test';
import assert from 'node:assert';
import { RepomixWorker } from '../sidequest/repomix-worker.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('RepomixWorker', () => {
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

  test('should create a repomix job with correct structure', () => {
    const worker = new RepomixWorker();
    const sourceDir = '/test/source/dir';
    const relativePath = 'project/subdir';

    const job = worker.createRepomixJob(sourceDir, relativePath);

    assert.ok(job.id.includes('repomix-'));
    assert.ok(job.id.includes('project-subdir'));
    assert.strictEqual(job.data.sourceDir, sourceDir);
    assert.strictEqual(job.data.relativePath, relativePath);
    assert.strictEqual(job.data.type, 'repomix');
  });

  test('should generate unique job IDs', () => {
    const worker = new RepomixWorker();
    const job1 = worker.createRepomixJob('/test/dir1', 'dir1');
    const job2 = worker.createRepomixJob('/test/dir2', 'dir2');

    assert.notStrictEqual(job1.id, job2.id);
  });

  test('should create output directory structure', async () => {
    const tempOutputDir = path.join(os.tmpdir(), 'test-output-' + Date.now());
    const tempSourceDir = path.join(os.tmpdir(), 'test-source-' + Date.now());

    try {
      // Create a test source directory with some files
      await fs.mkdir(tempSourceDir, { recursive: true });
      await fs.writeFile(path.join(tempSourceDir, 'test.txt'), 'test content');

      const worker = new RepomixWorker({
        outputBaseDir: tempOutputDir,
        logDir: path.join(tempOutputDir, 'logs'),
      });

      // Create logs directory
      await fs.mkdir(path.join(tempOutputDir, 'logs'), { recursive: true });

      const relativePath = 'test/project';

      // Create job - it will fail because repomix might not be installed or work
      // but we can still verify the directory structure is created
      const job = worker.createRepomixJob(tempSourceDir, relativePath);

      // Wait a bit for job to attempt execution
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Check that output directory was created
      const outputDir = path.join(tempOutputDir, relativePath);
      const dirExists = await fs.access(outputDir).then(() => true).catch(() => false);

      // Directory should exist even if repomix fails
      assert.ok(dirExists, 'Output directory should be created');
    } finally {
      await fs.rm(tempOutputDir, { recursive: true, force: true });
      await fs.rm(tempSourceDir, { recursive: true, force: true });
    }
  });

  test('should queue multiple jobs', () => {
    const worker = new RepomixWorker();

    worker.createRepomixJob('/dir1', 'dir1');
    worker.createRepomixJob('/dir2', 'dir2');
    worker.createRepomixJob('/dir3', 'dir3');

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

  test('should emit job events', (t, done) => {
    const worker = new RepomixWorker();
    let createdFired = false;

    worker.on('job:created', (job) => {
      assert.ok(job.id);
      assert.strictEqual(job.data.type, 'repomix');
      createdFired = true;
      done();
    });

    worker.createRepomixJob('/test/dir', 'test-dir');
  });
});

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { SidequestServer } from '../../sidequest/server.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Mock SidequestServer for testing
class TestSidequestServer extends SidequestServer {
  constructor(options = {}) {
    super(options);
  }

  async runJobHandler(job) {
    // Simulate job execution
    if (job.data.shouldFail) {
      throw new Error('Simulated job failure');
    }
    return { success: true, data: job.data };
  }
}

describe('SidequestServer', () => {
  test('should initialize with default options', () => {
    const server = new TestSidequestServer();
    assert.strictEqual(server.maxConcurrent, 5);
    assert.strictEqual(server.activeJobs, 0);
    assert.ok(server.jobs instanceof Map);
    assert.ok(Array.isArray(server.queue));
  });

  test('should initialize with custom options', () => {
    const server = new TestSidequestServer({
      maxConcurrent: 10,
      logDir: '/custom/logs',
    });

    assert.strictEqual(server.maxConcurrent, 10);
    assert.strictEqual(server.logDir, '/custom/logs');
  });

  test('should create a job', () => {
    const server = new TestSidequestServer();
    const job = server.createJob('test-job-1', { foo: 'bar' });

    assert.strictEqual(job.id, 'test-job-1');
    // Status can be 'queued' or 'running' depending on timing since processQueue is called immediately
    assert.ok(job.status === 'queued' || job.status === 'running');
    assert.deepStrictEqual(job.data, { foo: 'bar' });
    assert.ok(job.createdAt instanceof Date);
    // startedAt may or may not be null depending on timing
    assert.ok(job.completedAt === null); // Should not be completed yet
  });

  test('should add job to queue', () => {
    // Create server with maxConcurrent=0 to prevent immediate processing
    const server = new TestSidequestServer({ maxConcurrent: 0 });
    server.createJob('test-job-1', { foo: 'bar' });

    // With maxConcurrent=0, job should remain queued
    assert.strictEqual(server.queue.length, 1);
    assert.strictEqual(server.queue[0], 'test-job-1');
  });

  test('should store job in jobs Map', () => {
    const server = new TestSidequestServer();
    server.createJob('test-job-1', { foo: 'bar' });

    assert.ok(server.jobs.has('test-job-1'));
    const job = server.jobs.get('test-job-1');
    assert.strictEqual(job.id, 'test-job-1');
  });

  test('should execute job successfully', async () => {
    const tempLogDir = path.join(os.tmpdir(), 'test-logs-' + Date.now());
    await fs.mkdir(tempLogDir, { recursive: true });

    try {
      const server = new TestSidequestServer({
        logDir: tempLogDir,
      });

      const job = server.createJob('test-job-1', { foo: 'bar' });

      // Wait for job to complete
      await new Promise((resolve) => {
        server.on('job:completed', (completedJob) => {
          if (completedJob.id === 'test-job-1') {
            resolve();
          }
        });
      });

      const completedJob = server.getJob('test-job-1');
      assert.strictEqual(completedJob.status, 'completed');
      assert.ok(completedJob.startedAt instanceof Date);
      assert.ok(completedJob.completedAt instanceof Date);
      assert.ok(completedJob.result);
      assert.strictEqual(completedJob.result.success, true);
    } finally {
      await fs.rm(tempLogDir, { recursive: true, force: true });
    }
  });

  test('should handle job failure', async () => {
    const tempLogDir = path.join(os.tmpdir(), 'test-logs-fail-' + Date.now());
    await fs.mkdir(tempLogDir, { recursive: true });

    try {
      const server = new TestSidequestServer({
        logDir: tempLogDir,
      });

      server.createJob('test-job-fail', { shouldFail: true });

      // Wait for job to fail
      await new Promise((resolve) => {
        server.on('job:failed', (failedJob) => {
          if (failedJob.id === 'test-job-fail') {
            resolve();
          }
        });
      });

      const failedJob = server.getJob('test-job-fail');
      assert.strictEqual(failedJob.status, 'failed');
      assert.ok(failedJob.error);
      assert.ok(failedJob.error.includes('Simulated job failure'));
    } finally {
      await fs.rm(tempLogDir, { recursive: true, force: true });
    }
  });

  test('should respect maxConcurrent limit', async () => {
    const server = new TestSidequestServer({
      maxConcurrent: 2,
    });

    // Create 5 jobs
    for (let i = 0; i < 5; i++) {
      server.createJob(`job-${i}`, { id: i });
    }

    // Check that only 2 are active at most
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Active jobs should not exceed maxConcurrent
    assert.ok(server.activeJobs <= 2);
  });

  test('should emit job events', (t, done) => {
    const server = new TestSidequestServer();
    let eventsFired = [];

    server.on('job:created', () => eventsFired.push('created'));
    server.on('job:started', () => eventsFired.push('started'));
    server.on('job:completed', () => {
      eventsFired.push('completed');
      assert.ok(eventsFired.includes('created'));
      assert.ok(eventsFired.includes('started'));
      assert.ok(eventsFired.includes('completed'));
      done();
    });

    server.createJob('event-test', { foo: 'bar' });
  });

  test('should get job by id', () => {
    const server = new TestSidequestServer();
    server.createJob('test-job-1', { foo: 'bar' });

    const job = server.getJob('test-job-1');
    assert.ok(job);
    assert.strictEqual(job.id, 'test-job-1');
  });

  test('should get all jobs', () => {
    const server = new TestSidequestServer();
    server.createJob('job-1', { id: 1 });
    server.createJob('job-2', { id: 2 });

    const allJobs = server.getAllJobs();
    assert.strictEqual(allJobs.length, 2);
  });

  test('should get stats', async () => {
    const server = new TestSidequestServer();
    server.createJob('job-1', { id: 1 });

    // Wait for job to complete
    await new Promise((resolve) => {
      server.on('job:completed', () => resolve());
    });

    const stats = server.getStats();
    assert.ok(stats.total >= 1);
    assert.ok(stats.completed >= 1);
  });
});

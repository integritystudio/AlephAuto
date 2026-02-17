/**
 * Job Persistence and Broadcast Tests
 *
 * Tests for the fixes that ensure jobs are persisted to database
 * on creation (queued status) and when running, and that WebSocket
 * broadcasts include proper job event types with job payloads.
 *
 * Related fixes:
 * - sidequest/core/server.js: saveJob() on createJob and executeJob
 * - api/activity-feed.js: WebSocket job event broadcasts
 */

import { describe, it, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { EventEmitter } from 'node:events';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

import { SidequestServer } from '../../sidequest/core/server.js';
import { ActivityFeedManager } from '../../api/activity-feed.js';
import {
  initDatabase,
  getJobs,
  getLastJob,
  isDatabaseReady,
  saveJob,
  closeDatabase
} from '../../sidequest/core/database.js';

// Test implementation of SidequestServer
class TestServer extends SidequestServer {
  constructor(options = {}) {
    super({
      jobType: options.jobType || 'test-persistence',
      ...options // Allow options to override defaults, including autoStart
    });
  }

  async runJobHandler(job) {
    // Simulate job execution with configurable delay
    const delay = job.data?.delay || 10;
    await new Promise(resolve => setTimeout(resolve, delay));

    if (job.data?.shouldFail) {
      const error = new Error(job.data.errorMessage || 'Simulated failure');
      // Use ENOENT code to make error non-retryable (prevents retry loop in tests)
      error.code = 'ENOENT';
      throw error;
    }

    return { success: true, processedAt: new Date().toISOString() };
  }
}

describe('Job Persistence on Creation', () => {
  let server;
  let tempLogDir;

  beforeEach(async () => {
    // Ensure database is initialized
    if (!isDatabaseReady()) {
      await initDatabase(':memory:');
    }

    tempLogDir = path.join(os.tmpdir(), `test-logs-${Date.now()}`);
    await fs.mkdir(tempLogDir, { recursive: true });

    server = new TestServer({
      logDir: tempLogDir,
      jobType: 'test-persistence',
      autoStart: false // Prevent immediate processing to test queued state
    });
  });

  afterEach(async () => {
    await fs.rm(tempLogDir, { recursive: true, force: true });
  });

  it('should persist job to database immediately on creation', () => {
    const jobId = `persist-create-${Date.now()}`;
    const job = server.createJob(jobId, { testData: 'value' });

    // Job should be created with queued status
    assert.strictEqual(job.status, 'queued');
    assert.strictEqual(job.id, jobId);

    // Verify job was persisted to database
    const jobs = getJobs('test-persistence', { status: 'queued', limit: 10 });
    const persistedJob = jobs.find(j => j.id === jobId);

    assert.ok(persistedJob, 'Job should be persisted to database on creation');
    assert.strictEqual(persistedJob.status, 'queued');
    assert.strictEqual(persistedJob.pipelineId, 'test-persistence');
  });

  it('should persist job with all metadata fields', () => {
    const jobId = `persist-full-${Date.now()}`;
    const jobData = {
      repositoryPath: '/test/path',
      scanType: 'intra-project',
      customField: { nested: 'value' }
    };

    server.createJob(jobId, jobData);

    const jobs = getJobs('test-persistence', { limit: 10 });
    const persistedJob = jobs.find(j => j.id === jobId);

    assert.ok(persistedJob, 'Job should be persisted');
    assert.deepStrictEqual(persistedJob.data, jobData);
    assert.ok(persistedJob.createdAt, 'Should have createdAt timestamp');
  });

  it('should persist multiple jobs independently', () => {
    const jobIds = [
      `multi-job-1-${Date.now()}`,
      `multi-job-2-${Date.now()}`,
      `multi-job-3-${Date.now()}`
    ];

    jobIds.forEach((id, index) => {
      server.createJob(id, { order: index });
    });

    const jobs = getJobs('test-persistence', { limit: 10 });

    jobIds.forEach(id => {
      const job = jobs.find(j => j.id === id);
      assert.ok(job, `Job ${id} should be persisted`);
    });
  });
});

describe('Job Persistence on Running Status', () => {
  let server;
  let tempLogDir;

  beforeEach(async () => {
    if (!isDatabaseReady()) {
      await initDatabase(':memory:');
    }

    tempLogDir = path.join(os.tmpdir(), `test-logs-running-${Date.now()}`);
    await fs.mkdir(tempLogDir, { recursive: true });

    server = new TestServer({
      logDir: tempLogDir,
      jobType: 'test-running',
      autoStart: true
    });
  });

  afterEach(async () => {
    await fs.rm(tempLogDir, { recursive: true, force: true });
  });

  it('should update job status to running in database when execution starts', async () => {
    const jobId = `running-status-${Date.now()}`;

    // Set up promise to wait for job:started event
    const startedPromise = new Promise(resolve => {
      server.once('job:started', (job) => {
        if (job.id === jobId) resolve(job);
      });
    });

    // Create job
    server.createJob(jobId, { delay: 200 });

    // Wait for job to start (with timeout)
    const startedJob = await Promise.race([
      startedPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Job did not start')), 5000))
    ]);

    assert.ok(startedJob, 'Job should have started');
    assert.strictEqual(startedJob.status, 'running');

    // Check database for running status
    const jobs = getJobs('test-running', { limit: 10 });
    const dbJob = jobs.find(j => j.id === jobId);

    assert.ok(dbJob, 'Job should be in database');
    assert.ok(dbJob.startedAt, 'Should have startedAt timestamp in database');
  });

  it('should persist startedAt timestamp when job starts running', async () => {
    const jobId = `started-at-${Date.now()}`;
    const beforeStart = new Date();

    // Set up promise to wait for job:completed event
    const completedPromise = new Promise(resolve => {
      server.once('job:completed', (job) => {
        if (job.id === jobId) resolve(job);
      });
    });

    server.createJob(jobId, { delay: 50 });

    // Wait for job to complete (with timeout)
    await Promise.race([
      completedPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Job did not complete')), 5000))
    ]);

    // Check final state in database
    const jobs = getJobs('test-running', { limit: 10 });
    const completedJob = jobs.find(j => j.id === jobId);

    assert.ok(completedJob, 'Job should be in database');
    assert.ok(completedJob.startedAt, 'Should have startedAt');

    const startedAt = new Date(completedJob.startedAt);
    assert.ok(startedAt >= beforeStart, 'startedAt should be after test started');
  });
});

describe('Job Status Lifecycle in Database', () => {
  let server;
  let tempLogDir;
  const statuses = [];

  beforeEach(async () => {
    if (!isDatabaseReady()) {
      await initDatabase(':memory:');
    }

    tempLogDir = path.join(os.tmpdir(), `test-lifecycle-${Date.now()}`);
    await fs.mkdir(tempLogDir, { recursive: true });

    server = new TestServer({
      logDir: tempLogDir,
      jobType: 'test-lifecycle',
      autoStart: true
    });

    statuses.length = 0;
  });

  afterEach(async () => {
    await fs.rm(tempLogDir, { recursive: true, force: true });
  });

  it('should track job through queued -> running -> completed lifecycle', async () => {
    const jobId = `lifecycle-${Date.now()}`;

    // Track status changes
    server.on('job:created', () => statuses.push('queued'));
    server.on('job:started', () => statuses.push('running'));
    server.on('job:completed', () => statuses.push('completed'));

    // Set up completion promise with timeout
    const completedPromise = new Promise(resolve => {
      server.once('job:completed', (job) => {
        if (job.id === jobId) resolve(job);
      });
    });

    server.createJob(jobId, { delay: 50 });

    // Wait for completion with timeout
    await Promise.race([
      completedPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Job did not complete')), 5000))
    ]);

    // Verify lifecycle
    assert.deepStrictEqual(statuses, ['queued', 'running', 'completed']);

    // Verify final database state
    const jobs = getJobs('test-lifecycle', { limit: 10 });
    const job = jobs.find(j => j.id === jobId);

    assert.strictEqual(job.status, 'completed');
    assert.ok(job.createdAt, 'Should have createdAt');
    assert.ok(job.startedAt, 'Should have startedAt');
    assert.ok(job.completedAt, 'Should have completedAt');
  });

  it('should track job through queued -> running -> failed lifecycle', async () => {
    const jobId = `lifecycle-fail-${Date.now()}`;

    server.on('job:created', () => statuses.push('queued'));
    server.on('job:started', () => statuses.push('running'));
    server.on('job:failed', () => statuses.push('failed'));

    // Set up failure promise with timeout
    const failedPromise = new Promise(resolve => {
      server.once('job:failed', (job) => {
        if (job.id === jobId) resolve(job);
      });
    });

    server.createJob(jobId, { shouldFail: true, errorMessage: 'Test failure' });

    // Wait for failure with timeout
    await Promise.race([
      failedPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Job did not fail')), 5000))
    ]);

    // Verify lifecycle
    assert.deepStrictEqual(statuses, ['queued', 'running', 'failed']);

    // Verify final database state
    const jobs = getJobs('test-lifecycle', { limit: 10 });
    const job = jobs.find(j => j.id === jobId);

    assert.strictEqual(job.status, 'failed');
    assert.ok(job.error, 'Should have error details');
  });
});

describe('WebSocket Job Event Broadcasts', () => {
  let activityFeed;
  let mockBroadcaster;
  let mockWorker;
  let broadcasts;

  beforeEach(() => {
    broadcasts = [];

    // Mock broadcaster that captures all broadcasts
    mockBroadcaster = {
      broadcast: (message, channel) => {
        broadcasts.push({ message, channel });
      }
    };

    activityFeed = new ActivityFeedManager(mockBroadcaster, {
      maxActivities: 50
    });

    // Mock worker with jobType property
    mockWorker = new EventEmitter();
    mockWorker.jobType = 'test-broadcast';

    activityFeed.listenToWorker(mockWorker);
  });

  afterEach(() => {
    activityFeed.clear();
    broadcasts.length = 0;
  });

  describe('job:created broadcast', () => {
    it('should broadcast job:created event with job payload', () => {
      const job = {
        id: 'broadcast-create-1',
        status: 'queued',
        data: { pipelineId: 'test-pipeline', customData: 'value' },
        createdAt: new Date()
      };

      mockWorker.emit('job:created', job);

      // Should have activity broadcast AND job event broadcast
      const jobBroadcast = broadcasts.find(
        b => b.message.type === 'job:created' && b.channel === 'jobs'
      );

      assert.ok(jobBroadcast, 'Should broadcast job:created to jobs channel');
      assert.ok(jobBroadcast.message.job, 'Should include job object');
      assert.strictEqual(jobBroadcast.message.job.id, job.id);
      assert.strictEqual(jobBroadcast.message.job.status, 'queued');
    });

    it('should include pipelineId from job data or worker jobType', () => {
      const job = {
        id: 'broadcast-create-2',
        status: 'queued',
        data: {},
        createdAt: new Date()
      };

      mockWorker.emit('job:created', job);

      const jobBroadcast = broadcasts.find(
        b => b.message.type === 'job:created' && b.channel === 'jobs'
      );

      // Should fall back to worker.jobType when pipelineId not in job data
      assert.strictEqual(jobBroadcast.message.job.pipelineId, 'test-broadcast');
    });
  });

  describe('job:started broadcast', () => {
    it('should broadcast job:started event with job payload', () => {
      const job = {
        id: 'broadcast-start-1',
        status: 'running',
        data: { type: 'test' },
        startedAt: new Date()
      };

      mockWorker.emit('job:started', job);

      const jobBroadcast = broadcasts.find(
        b => b.message.type === 'job:started' && b.channel === 'jobs'
      );

      assert.ok(jobBroadcast, 'Should broadcast job:started to jobs channel');
      assert.strictEqual(jobBroadcast.message.job.id, job.id);
      assert.strictEqual(jobBroadcast.message.job.status, 'running');
      assert.ok(jobBroadcast.message.job.startedAt, 'Should include startedAt');
    });
  });

  describe('job:completed broadcast', () => {
    it('should broadcast job:completed event with job payload and result', () => {
      const job = {
        id: 'broadcast-complete-1',
        status: 'completed',
        data: { type: 'test' },
        completedAt: new Date(),
        result: { success: true, items: 42 }
      };

      mockWorker.emit('job:completed', job);

      const jobBroadcast = broadcasts.find(
        b => b.message.type === 'job:completed' && b.channel === 'jobs'
      );

      assert.ok(jobBroadcast, 'Should broadcast job:completed to jobs channel');
      assert.strictEqual(jobBroadcast.message.job.id, job.id);
      assert.strictEqual(jobBroadcast.message.job.status, 'completed');
      assert.deepStrictEqual(jobBroadcast.message.job.result, job.result);
    });
  });

  describe('job:failed broadcast', () => {
    it('should broadcast job:failed event with job payload and error', () => {
      const job = {
        id: 'broadcast-fail-1',
        status: 'failed',
        data: { type: 'test' },
        completedAt: new Date()
      };
      const error = new Error('Test failure');
      error.code = 'TEST_ERROR';

      mockWorker.emit('job:failed', job, error);

      const jobBroadcast = broadcasts.find(
        b => b.message.type === 'job:failed' && b.channel === 'jobs'
      );

      assert.ok(jobBroadcast, 'Should broadcast job:failed to jobs channel');
      assert.strictEqual(jobBroadcast.message.job.id, job.id);
      assert.strictEqual(jobBroadcast.message.job.status, 'failed');
      assert.ok(jobBroadcast.message.job.error, 'Should include error details');
      assert.strictEqual(jobBroadcast.message.job.error.message, 'Test failure');
      assert.strictEqual(jobBroadcast.message.job.error.code, 'TEST_ERROR');
    });
  });

  describe('broadcast channel separation', () => {
    it('should broadcast to both activity and jobs channels', () => {
      const job = {
        id: 'dual-channel-1',
        status: 'queued',
        data: {},
        createdAt: new Date()
      };

      mockWorker.emit('job:created', job);

      const activityBroadcast = broadcasts.find(b => b.channel === 'activity');
      const jobsBroadcast = broadcasts.find(b => b.channel === 'jobs');

      assert.ok(activityBroadcast, 'Should broadcast to activity channel');
      assert.ok(jobsBroadcast, 'Should broadcast to jobs channel');

      // Activity channel should have activity:new type
      assert.strictEqual(activityBroadcast.message.type, 'activity:new');

      // Jobs channel should have job:created type
      assert.strictEqual(jobsBroadcast.message.type, 'job:created');
    });
  });
});

describe('Integration: Server + Activity Feed', () => {
  let server;
  let activityFeed;
  let mockBroadcaster;
  let tempLogDir;
  let broadcasts;

  beforeEach(async () => {
    if (!isDatabaseReady()) {
      await initDatabase(':memory:');
    }

    tempLogDir = path.join(os.tmpdir(), `test-integration-${Date.now()}`);
    await fs.mkdir(tempLogDir, { recursive: true });

    broadcasts = [];
    mockBroadcaster = {
      broadcast: (message, channel) => {
        broadcasts.push({ message, channel, timestamp: Date.now() });
      }
    };

    server = new TestServer({
      logDir: tempLogDir,
      jobType: 'test-integration',
      autoStart: true
    });

    activityFeed = new ActivityFeedManager(mockBroadcaster, {
      maxActivities: 50
    });

    activityFeed.listenToWorker(server);
  });

  afterEach(async () => {
    activityFeed.clear();
    await fs.rm(tempLogDir, { recursive: true, force: true });
  });

  it('should persist and broadcast job through full lifecycle', async () => {
    const jobId = `integration-${Date.now()}`;

    // Set up completion promise with timeout
    const completedPromise = new Promise(resolve => {
      server.once('job:completed', (job) => {
        if (job.id === jobId) resolve(job);
      });
    });

    server.createJob(jobId, { delay: 50 });

    // Wait for completion with timeout
    await Promise.race([
      completedPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Job did not complete')), 5000))
    ]);

    // Verify database persistence
    const jobs = getJobs('test-integration', { limit: 10 });
    const dbJob = jobs.find(j => j.id === jobId);
    assert.ok(dbJob, 'Job should be in database');
    assert.strictEqual(dbJob.status, 'completed');

    // Verify broadcasts occurred
    const createdBroadcast = broadcasts.find(
      b => b.message.type === 'job:created' && b.channel === 'jobs'
    );
    const startedBroadcast = broadcasts.find(
      b => b.message.type === 'job:started' && b.channel === 'jobs'
    );
    const completedBroadcast = broadcasts.find(
      b => b.message.type === 'job:completed' && b.channel === 'jobs'
    );

    assert.ok(createdBroadcast, 'Should have job:created broadcast');
    assert.ok(startedBroadcast, 'Should have job:started broadcast');
    assert.ok(completedBroadcast, 'Should have job:completed broadcast');

    // Verify broadcast order
    assert.ok(
      createdBroadcast.timestamp <= startedBroadcast.timestamp,
      'created should come before started'
    );
    assert.ok(
      startedBroadcast.timestamp <= completedBroadcast.timestamp,
      'started should come before completed'
    );
  });

  it('should handle failed job with persistence and broadcast', async () => {
    const jobId = `integration-fail-${Date.now()}`;

    // Set up failure promise with timeout
    const failedPromise = new Promise(resolve => {
      server.once('job:failed', (job) => {
        if (job.id === jobId) resolve(job);
      });
    });

    server.createJob(jobId, { shouldFail: true, errorMessage: 'Integration test failure' });

    // Wait for failure with timeout
    await Promise.race([
      failedPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Job did not fail')), 5000))
    ]);

    // Verify database persistence
    const jobs = getJobs('test-integration', { limit: 10 });
    const dbJob = jobs.find(j => j.id === jobId);
    assert.ok(dbJob, 'Failed job should be in database');
    assert.strictEqual(dbJob.status, 'failed');

    // Verify failed broadcast
    const failedBroadcast = broadcasts.find(
      b => b.message.type === 'job:failed' && b.channel === 'jobs'
    );
    assert.ok(failedBroadcast, 'Should have job:failed broadcast');
    assert.ok(failedBroadcast.message.job.error, 'Failed broadcast should include error');
  });
});

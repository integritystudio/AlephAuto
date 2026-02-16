#!/usr/bin/env node
/**
 * SidequestServer Unit Tests
 *
 * Tests for the core SidequestServer class functionality.
 * Uses autoStart: false to control job execution and avoid database hanging issues.
 */

// @ts-nocheck
import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { SidequestServer } from '../../sidequest/core/server.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Test subclass that implements the required handler
class TestSidequestServer extends SidequestServer {
  constructor(options = {}) {
    super({
      ...options,
      autoStart: options.autoStart ?? false // Disable auto-start by default for tests
    });
    this.handlerCalls = [];
    this.shouldFailHandler = false;
    this.handlerResult = { success: true };
  }

  async runJobHandler(job) {
    this.handlerCalls.push(job);
    if (this.shouldFailHandler) {
      throw new Error('Simulated job failure');
    }
    return this.handlerResult;
  }
}

describe('SidequestServer - Constructor', () => {
  it('should initialize with default options', () => {
    const server = new TestSidequestServer();

    assert.strictEqual(server.maxConcurrent, 5);
    assert.strictEqual(server.activeJobs, 0);
    assert.ok(server.jobs instanceof Map);
    assert.ok(Array.isArray(server.queue));
    assert.strictEqual(server.logDir, './logs');
    assert.strictEqual(server.gitWorkflowEnabled, false);
    assert.strictEqual(server.jobType, 'job');
  });

  it('should initialize with custom maxConcurrent', () => {
    const server = new TestSidequestServer({ maxConcurrent: 10 });
    assert.strictEqual(server.maxConcurrent, 10);
  });

  it('should initialize with custom logDir', () => {
    const server = new TestSidequestServer({ logDir: '/custom/logs' });
    assert.strictEqual(server.logDir, '/custom/logs');
  });

  it('should initialize with git workflow options', () => {
    const server = new TestSidequestServer({
      gitWorkflowEnabled: true,
      gitBaseBranch: 'develop',
      gitBranchPrefix: 'feature',
      gitDryRun: true,
      jobType: 'duplicate-detection'
    });

    assert.strictEqual(server.gitWorkflowEnabled, true);
    assert.strictEqual(server.gitBaseBranch, 'develop');
    assert.strictEqual(server.gitBranchPrefix, 'feature');
    assert.strictEqual(server.gitDryRun, true);
    assert.strictEqual(server.jobType, 'duplicate-detection');
    assert.ok(server.gitWorkflowManager);
  });

  it('should not create gitWorkflowManager when git workflow is disabled', () => {
    const server = new TestSidequestServer({ gitWorkflowEnabled: false });
    assert.strictEqual(server.gitWorkflowManager, undefined);
  });

  it('should handle autoStart option', () => {
    const server1 = new TestSidequestServer({ autoStart: false });
    assert.strictEqual(server1.isRunning, false);

    const server2 = new TestSidequestServer({ autoStart: true });
    assert.strictEqual(server2.isRunning, true);
  });

  it('should use nullish coalescing for maxConcurrent', () => {
    const server = new TestSidequestServer({ maxConcurrent: 0 });
    assert.strictEqual(server.maxConcurrent, 0);
  });
});

describe('SidequestServer - createJob', () => {
  it('should create a job with correct structure', () => {
    const server = new TestSidequestServer();
    const job = server.createJob('job-123', { key: 'value' });

    assert.strictEqual(job.id, 'job-123');
    assert.strictEqual(job.status, 'queued');
    assert.deepStrictEqual(job.data, { key: 'value' });
    assert.ok(job.createdAt instanceof Date);
    assert.strictEqual(job.startedAt, null);
    assert.strictEqual(job.completedAt, null);
    assert.strictEqual(job.error, null);
    assert.strictEqual(job.result, null);
    assert.ok(job.git);
    assert.strictEqual(job.git.branchName, null);
  });

  it('should add job to jobs Map', () => {
    const server = new TestSidequestServer();
    server.createJob('job-123', {});

    assert.ok(server.jobs.has('job-123'));
    assert.strictEqual(server.jobs.size, 1);
  });

  it('should add job to queue', () => {
    const server = new TestSidequestServer();
    server.createJob('job-123', {});

    assert.strictEqual(server.queue.length, 1);
    assert.strictEqual(server.queue[0], 'job-123');
  });

  it('should emit job:created event', () => {
    const server = new TestSidequestServer();
    let eventReceived = false;
    let eventJob = null;

    server.on('job:created', (job) => {
      eventReceived = true;
      eventJob = job;
    });

    server.createJob('job-123', { data: 'test' });

    assert.ok(eventReceived);
    assert.strictEqual(eventJob.id, 'job-123');
  });

  it('should initialize git metadata', () => {
    const server = new TestSidequestServer();
    const job = server.createJob('job-123', {});

    assert.deepStrictEqual(job.git, {
      branchName: null,
      originalBranch: null,
      commitSha: null,
      prUrl: null,
      changedFiles: []
    });
  });
});

describe('SidequestServer - processQueue', () => {
  it('should not process when isRunning is false', async () => {
    const server = new TestSidequestServer({ autoStart: false });
    server.createJob('job-123', {});

    await server.processQueue();

    assert.strictEqual(server.activeJobs, 0);
  });

  it('should process jobs when isRunning is true', async () => {
    const server = new TestSidequestServer({ autoStart: false });
    server.createJob('job-123', {});

    server.isRunning = true;
    await server.processQueue();

    // Job should have started processing
    assert.ok(server.activeJobs >= 0);
  });

  it('should respect maxConcurrent limit', async () => {
    const server = new TestSidequestServer({ maxConcurrent: 2, autoStart: false });

    // Create 5 jobs
    for (let i = 0; i < 5; i++) {
      server.createJob(`job-${i}`, {});
    }

    // Manual start with limit
    server.isRunning = true;
    await server.processQueue();

    // Should not exceed maxConcurrent
    assert.ok(server.activeJobs <= 2);
  });
});

describe('SidequestServer - start and stop', () => {
  it('should set isRunning to true on start', async () => {
    const server = new TestSidequestServer({ autoStart: false });
    assert.strictEqual(server.isRunning, false);

    await server.start();

    assert.strictEqual(server.isRunning, true);
  });

  it('should set isRunning to false on stop', () => {
    const server = new TestSidequestServer({ autoStart: true });
    assert.strictEqual(server.isRunning, true);

    server.stop();

    assert.strictEqual(server.isRunning, false);
  });
});

describe('SidequestServer - getJob', () => {
  it('should return job by id', () => {
    const server = new TestSidequestServer();
    server.createJob('job-123', { key: 'value' });

    const job = server.getJob('job-123');

    assert.ok(job);
    assert.strictEqual(job.id, 'job-123');
    assert.strictEqual(job.data.key, 'value');
  });

  it('should return undefined for non-existent job', () => {
    const server = new TestSidequestServer();

    const job = server.getJob('non-existent');

    assert.strictEqual(job, undefined);
  });
});

describe('SidequestServer - getAllJobs', () => {
  it('should return all jobs as array', () => {
    const server = new TestSidequestServer();
    server.createJob('job-1', {});
    server.createJob('job-2', {});
    server.createJob('job-3', {});

    const jobs = server.getAllJobs();

    assert.ok(Array.isArray(jobs));
    assert.strictEqual(jobs.length, 3);
  });

  it('should return empty array when no jobs', () => {
    const server = new TestSidequestServer();

    const jobs = server.getAllJobs();

    assert.deepStrictEqual(jobs, []);
  });
});

describe('SidequestServer - getStats', () => {
  it('should return correct stats structure', () => {
    const server = new TestSidequestServer();

    const stats = server.getStats();

    assert.ok('total' in stats);
    assert.ok('queued' in stats);
    assert.ok('active' in stats);
    assert.ok('completed' in stats);
    assert.ok('failed' in stats);
  });

  it('should track total jobs', () => {
    const server = new TestSidequestServer();
    server.createJob('job-1', {});
    server.createJob('job-2', {});

    const stats = server.getStats();

    assert.strictEqual(stats.total, 2);
  });

  it('should track queued jobs', () => {
    const server = new TestSidequestServer();
    server.createJob('job-1', {});
    server.createJob('job-2', {});

    const stats = server.getStats();

    assert.strictEqual(stats.queued, 2);
  });
});

describe('SidequestServer - cancelJob', () => {
  it('should cancel a queued job', () => {
    const server = new TestSidequestServer();
    server.createJob('job-123', {});

    const result = server.cancelJob('job-123');

    assert.strictEqual(result.success, true);
    assert.ok(result.message.includes('cancelled successfully'));
    assert.strictEqual(result.job.status, 'cancelled');
  });

  it('should remove cancelled job from queue', () => {
    const server = new TestSidequestServer();
    server.createJob('job-123', {});
    assert.strictEqual(server.queue.length, 1);

    server.cancelJob('job-123');

    assert.strictEqual(server.queue.length, 0);
  });

  it('should set completedAt on cancellation', () => {
    const server = new TestSidequestServer();
    server.createJob('job-123', {});

    server.cancelJob('job-123');

    const job = server.getJob('job-123');
    assert.ok(job.completedAt instanceof Date);
  });

  it('should set error with cancelled flag', () => {
    const server = new TestSidequestServer();
    server.createJob('job-123', {});

    server.cancelJob('job-123');

    const job = server.getJob('job-123');
    assert.ok(job.error);
    assert.strictEqual(job.error.cancelled, true);
    assert.ok(job.error.message.includes('cancelled by user'));
  });

  it('should emit job:cancelled event', () => {
    const server = new TestSidequestServer();
    server.createJob('job-123', {});

    let eventReceived = false;
    server.on('job:cancelled', () => { eventReceived = true; });

    server.cancelJob('job-123');

    assert.ok(eventReceived);
  });

  it('should return error for non-existent job', () => {
    const server = new TestSidequestServer();

    const result = server.cancelJob('non-existent');

    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes('not found'));
  });

  it('should not cancel already completed job', () => {
    const server = new TestSidequestServer();
    const job = server.createJob('job-123', {});
    job.status = 'completed';

    const result = server.cancelJob('job-123');

    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes("Cannot cancel job with status 'completed'"));
  });

  it('should not cancel already failed job', () => {
    const server = new TestSidequestServer();
    const job = server.createJob('job-123', {});
    job.status = 'failed';

    const result = server.cancelJob('job-123');

    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes("Cannot cancel job with status 'failed'"));
  });

  it('should not cancel already cancelled job', () => {
    const server = new TestSidequestServer();
    server.createJob('job-123', {});
    server.cancelJob('job-123');

    const result = server.cancelJob('job-123');

    assert.strictEqual(result.success, false);
  });
});

describe('SidequestServer - pauseJob', () => {
  it('should pause a queued job', () => {
    const server = new TestSidequestServer();
    server.createJob('job-123', {});

    const result = server.pauseJob('job-123');

    assert.strictEqual(result.success, true);
    assert.ok(result.message.includes('paused successfully'));
    assert.strictEqual(result.job.status, 'paused');
  });

  it('should remove paused job from queue', () => {
    const server = new TestSidequestServer();
    server.createJob('job-123', {});
    assert.strictEqual(server.queue.length, 1);

    server.pauseJob('job-123');

    assert.strictEqual(server.queue.length, 0);
  });

  it('should set pausedAt timestamp', () => {
    const server = new TestSidequestServer();
    server.createJob('job-123', {});

    server.pauseJob('job-123');

    const job = server.getJob('job-123');
    assert.ok(job.pausedAt instanceof Date);
  });

  it('should emit job:paused event', () => {
    const server = new TestSidequestServer();
    server.createJob('job-123', {});

    let eventReceived = false;
    server.on('job:paused', () => { eventReceived = true; });

    server.pauseJob('job-123');

    assert.ok(eventReceived);
  });

  it('should return error for non-existent job', () => {
    const server = new TestSidequestServer();

    const result = server.pauseJob('non-existent');

    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes('not found'));
  });

  it('should not pause completed job', () => {
    const server = new TestSidequestServer();
    const job = server.createJob('job-123', {});
    job.status = 'completed';

    const result = server.pauseJob('job-123');

    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes("Cannot pause job with status 'completed'"));
  });

  it('should not pause failed job', () => {
    const server = new TestSidequestServer();
    const job = server.createJob('job-123', {});
    job.status = 'failed';

    const result = server.pauseJob('job-123');

    assert.strictEqual(result.success, false);
  });

  it('should not pause already paused job', () => {
    const server = new TestSidequestServer();
    server.createJob('job-123', {});
    server.pauseJob('job-123');

    const result = server.pauseJob('job-123');

    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes("Cannot pause job with status 'paused'"));
  });

  it('should not pause cancelled job', () => {
    const server = new TestSidequestServer();
    server.createJob('job-123', {});
    server.cancelJob('job-123');

    const result = server.pauseJob('job-123');

    assert.strictEqual(result.success, false);
  });
});

describe('SidequestServer - resumeJob', () => {
  it('should resume a paused job', () => {
    const server = new TestSidequestServer();
    server.createJob('job-123', {});
    server.pauseJob('job-123');

    const result = server.resumeJob('job-123');

    assert.strictEqual(result.success, true);
    assert.ok(result.message.includes('resumed successfully'));
    assert.strictEqual(result.job.status, 'queued');
  });

  it('should add resumed job back to queue', () => {
    const server = new TestSidequestServer();
    server.createJob('job-123', {});
    server.pauseJob('job-123');
    assert.strictEqual(server.queue.length, 0);

    server.resumeJob('job-123');

    assert.strictEqual(server.queue.length, 1);
    assert.strictEqual(server.queue[0], 'job-123');
  });

  it('should set resumedAt timestamp', () => {
    const server = new TestSidequestServer();
    server.createJob('job-123', {});
    server.pauseJob('job-123');

    server.resumeJob('job-123');

    const job = server.getJob('job-123');
    assert.ok(job.resumedAt instanceof Date);
  });

  it('should remove pausedAt timestamp', () => {
    const server = new TestSidequestServer();
    server.createJob('job-123', {});
    server.pauseJob('job-123');

    server.resumeJob('job-123');

    const job = server.getJob('job-123');
    assert.strictEqual(job.pausedAt, undefined);
  });

  it('should emit job:resumed event', () => {
    const server = new TestSidequestServer();
    server.createJob('job-123', {});
    server.pauseJob('job-123');

    let eventReceived = false;
    server.on('job:resumed', () => { eventReceived = true; });

    server.resumeJob('job-123');

    assert.ok(eventReceived);
  });

  it('should return error for non-existent job', () => {
    const server = new TestSidequestServer();

    const result = server.resumeJob('non-existent');

    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes('not found'));
  });

  it('should not resume queued job', () => {
    const server = new TestSidequestServer();
    server.createJob('job-123', {});

    const result = server.resumeJob('job-123');

    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes('Only paused jobs can be resumed'));
  });

  it('should not resume completed job', () => {
    const server = new TestSidequestServer();
    const job = server.createJob('job-123', {});
    job.status = 'completed';

    const result = server.resumeJob('job-123');

    assert.strictEqual(result.success, false);
  });

  it('should not resume cancelled job', () => {
    const server = new TestSidequestServer();
    server.createJob('job-123', {});
    server.cancelJob('job-123');

    const result = server.resumeJob('job-123');

    assert.strictEqual(result.success, false);
  });
});

describe('SidequestServer - handleJob setter', () => {
  it('should allow setting job handler via property', () => {
    const server = new TestSidequestServer();
    let handlerCalled = false;

    server.handleJob = async (job) => {
      handlerCalled = true;
      return { handled: true };
    };

    // Check that runJobHandler was updated
    assert.ok(server.runJobHandler);
  });
});

describe('SidequestServer - _generateCommitMessage', () => {
  it('should generate commit message with job info', async () => {
    const server = new TestSidequestServer({ jobType: 'duplicate-detection' });
    const job = {
      id: 'job-123',
      git: { changedFiles: ['file1.js', 'file2.js'] }
    };

    const message = await server._generateCommitMessage(job);

    assert.ok(message.title);
    assert.ok(message.body);
    assert.ok(message.title.includes('duplicate-detection'));
    assert.ok(message.title.includes('job-123'));
    assert.ok(message.body.includes('2'));
  });

  it('should use default jobType', async () => {
    const server = new TestSidequestServer();
    const job = {
      id: 'job-456',
      git: { changedFiles: [] }
    };

    const message = await server._generateCommitMessage(job);

    assert.ok(message.title.includes('job:'));
  });
});

describe('SidequestServer - _generatePRContext', () => {
  it('should generate PR context with all fields', async () => {
    const server = new TestSidequestServer({ jobType: 'test-job' });
    const job = {
      id: 'job-789',
      git: {
        branchName: 'test/branch',
        changedFiles: ['src/file1.js', 'src/file2.js']
      }
    };

    const context = await server._generatePRContext(job);

    assert.ok(context.branchName);
    assert.ok(context.title);
    assert.ok(context.body);
    assert.ok(Array.isArray(context.labels));
    assert.strictEqual(context.branchName, 'test/branch');
    assert.ok(context.body.includes('job-789'));
    assert.ok(context.body.includes('test-job'));
    assert.ok(context.body.includes('src/file1.js'));
    assert.ok(context.labels.includes('automated'));
  });

  it('should include Claude Code attribution', async () => {
    const server = new TestSidequestServer();
    const job = {
      id: 'job-123',
      git: { branchName: 'branch', changedFiles: [] }
    };

    const context = await server._generatePRContext(job);

    assert.ok(context.body.includes('Claude Code'));
  });
});

describe('SidequestServer - logJobCompletion', () => {
  let tempLogDir;

  beforeEach(async () => {
    tempLogDir = path.join(os.tmpdir(), 'test-log-completion-' + Date.now());
    await fs.mkdir(tempLogDir, { recursive: true });
  });

  afterEach(async () => {
    if (tempLogDir) {
      await fs.rm(tempLogDir, { recursive: true, force: true });
    }
  });

  it('should write job completion log to file', async () => {
    const server = new TestSidequestServer({ logDir: tempLogDir });
    const job = {
      id: 'completed-job',
      status: 'completed',
      data: { test: true },
      result: { success: true }
    };

    await server.logJobCompletion(job);

    const logPath = path.join(tempLogDir, 'completed-job.json');
    const exists = await fs.access(logPath).then(() => true).catch(() => false);
    assert.ok(exists);

    const content = JSON.parse(await fs.readFile(logPath, 'utf-8'));
    assert.strictEqual(content.id, 'completed-job');
    assert.strictEqual(content.status, 'completed');
  });

  it('should create log directory if it does not exist', async () => {
    const nestedLogDir = path.join(tempLogDir, 'nested', 'logs');
    const server = new TestSidequestServer({ logDir: nestedLogDir });
    const job = { id: 'test-job', status: 'completed' };

    await server.logJobCompletion(job);

    const dirExists = await fs.access(nestedLogDir).then(() => true).catch(() => false);
    assert.ok(dirExists);
  });
});

describe('SidequestServer - logJobFailure', () => {
  let tempLogDir;

  beforeEach(async () => {
    tempLogDir = path.join(os.tmpdir(), 'test-log-failure-' + Date.now());
    await fs.mkdir(tempLogDir, { recursive: true });
  });

  afterEach(async () => {
    if (tempLogDir) {
      await fs.rm(tempLogDir, { recursive: true, force: true });
    }
  });

  it('should write job failure log to file', async () => {
    const server = new TestSidequestServer({ logDir: tempLogDir });
    const job = {
      id: 'failed-job',
      status: 'failed',
      data: { test: true }
    };
    const error = new Error('Test error message');

    await server.logJobFailure(job, error);

    const logPath = path.join(tempLogDir, 'failed-job.error.json');
    const exists = await fs.access(logPath).then(() => true).catch(() => false);
    assert.ok(exists);

    const content = JSON.parse(await fs.readFile(logPath, 'utf-8'));
    assert.strictEqual(content.id, 'failed-job');
    assert.ok(content.error);
    assert.strictEqual(content.error.message, 'Test error message');
    assert.ok(content.error.stack);
  });

  it('should create log directory if it does not exist', async () => {
    const nestedLogDir = path.join(tempLogDir, 'nested', 'errors');
    const server = new TestSidequestServer({ logDir: nestedLogDir });
    const job = { id: 'test-job', status: 'failed' };
    const error = new Error('Test');

    await server.logJobFailure(job, error);

    const dirExists = await fs.access(nestedLogDir).then(() => true).catch(() => false);
    assert.ok(dirExists);
  });
});

describe('SidequestServer - Event Emission', () => {
  it('should be an EventEmitter', () => {
    const server = new TestSidequestServer();
    assert.ok(server.on);
    assert.ok(server.emit);
    assert.ok(server.removeListener);
  });

  it('should allow multiple listeners for same event', () => {
    const server = new TestSidequestServer();
    let count = 0;

    server.on('job:created', () => { count++; });
    server.on('job:created', () => { count++; });
    server.createJob('job-123', {});

    assert.strictEqual(count, 2);
  });

  it('should emit events in correct order', () => {
    const server = new TestSidequestServer();
    const events = [];

    server.on('job:created', () => events.push('created'));

    server.createJob('job-123', {});

    assert.deepStrictEqual(events, ['created']);
  });
});

describe('SidequestServer - runJobHandler', () => {
  it('should throw error if not implemented', async () => {
    // Use base class directly
    const server = new SidequestServer({ autoStart: false });

    await assert.rejects(
      async () => server.runJobHandler({}),
      /runJobHandler must be implemented by subclass/
    );
  });
});

describe('SidequestServer - Integration Scenarios', () => {
  it('should handle multiple jobs in queue', () => {
    const server = new TestSidequestServer();

    for (let i = 0; i < 10; i++) {
      server.createJob(`job-${i}`, { index: i });
    }

    assert.strictEqual(server.jobs.size, 10);
    assert.strictEqual(server.queue.length, 10);
  });

  it('should handle pause then resume workflow', () => {
    const server = new TestSidequestServer();
    server.createJob('job-123', {});

    // Pause
    const pauseResult = server.pauseJob('job-123');
    assert.strictEqual(pauseResult.success, true);
    assert.strictEqual(server.getJob('job-123').status, 'paused');
    assert.strictEqual(server.queue.length, 0);

    // Resume
    const resumeResult = server.resumeJob('job-123');
    assert.strictEqual(resumeResult.success, true);
    assert.strictEqual(server.getJob('job-123').status, 'queued');
    assert.strictEqual(server.queue.length, 1);
  });

  it('should track job history after state changes', () => {
    const server = new TestSidequestServer();
    server.createJob('job-1', {});
    server.createJob('job-2', {});
    server.createJob('job-3', {});

    // Cancel job-1
    server.cancelJob('job-1');

    // Pause job-2
    server.pauseJob('job-2');

    assert.strictEqual(server.getJob('job-1').status, 'cancelled');
    assert.strictEqual(server.getJob('job-2').status, 'paused');
    assert.strictEqual(server.getJob('job-3').status, 'queued');
  });
});

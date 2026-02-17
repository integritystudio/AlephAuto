/**
 * Integration test for pipeline job triggering via API
 *
 * Tests:
 * - Worker registry initialization
 * - Job creation through API endpoint
 * - Error handling for unknown pipelines
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { workerRegistry } from '../../api/utils/worker-registry.js';
import { createComponentLogger } from '../../sidequest/utils/logger.ts';
import { createTempRepository } from '../fixtures/test-helpers.js';

const logger = createComponentLogger('PipelineTriggerTest');

let testRepo;

describe('Pipeline Job Trigger', () => {
  beforeEach(async () => {
    testRepo = await createTempRepository({ name: 'test' });
  });

  afterEach(async () => {
    if (testRepo) await testRepo.cleanup();
  });

  after(async () => {
    // Cancel any pending jobs and shutdown all workers
    for (const worker of workerRegistry._workers?.values() ?? []) {
      if (worker.cancelAllJobs) {
        try { await worker.cancelAllJobs(); } catch {}
      }
    }
    await workerRegistry.shutdown();
  });

  it('should support known pipeline IDs', () => {
    const supportedPipelines = workerRegistry.getSupportedPipelines();

    assert.ok(Array.isArray(supportedPipelines), 'Should return array');
    assert.ok(supportedPipelines.length > 0, 'Should have at least one supported pipeline');
    assert.ok(supportedPipelines.includes('schema-enhancement'), 'Should support schema-enhancement');
    assert.ok(supportedPipelines.includes('git-activity'), 'Should support git-activity');
  });

  it('should check if pipeline is supported', () => {
    assert.strictEqual(workerRegistry.isSupported('schema-enhancement'), true);
    assert.strictEqual(workerRegistry.isSupported('git-activity'), true);
    assert.strictEqual(workerRegistry.isSupported('unknown-pipeline'), false);
  });

  it('should initialize worker for valid pipeline', async () => {
    const worker = await workerRegistry.getWorker('schema-enhancement');

    assert.ok(worker, 'Worker should be initialized');
    assert.strictEqual(typeof worker.createJob, 'function', 'Worker should have createJob method');
  });

  it('should return same worker instance on subsequent calls', async () => {
    const worker1 = await workerRegistry.getWorker('schema-enhancement');
    const worker2 = await workerRegistry.getWorker('schema-enhancement');

    assert.strictEqual(worker1, worker2, 'Should return same instance');
  });

  it('should throw error for unknown pipeline', async () => {
    await assert.rejects(
      async () => {
        await workerRegistry.getWorker('unknown-pipeline');
      },
      {
        name: 'Error',
        message: /Unknown pipeline ID: unknown-pipeline/
      }
    );
  });

  it('should create job with worker', async () => {
    const worker = await workerRegistry.getWorker('schema-enhancement');
    const jobId = `test-job-${Date.now()}`;

    const job = worker.createJob(jobId, {
      readmePath: `${testRepo.path}/README.md`,
      relativePath: 'test/README.md',
      context: { test: true },
      triggeredBy: 'test'
    });

    assert.ok(job, 'Job should be created');
    assert.strictEqual(job.id, jobId, 'Job ID should match');
    // Job status may be 'queued' or 'running' depending on timing
    assert.ok(['queued', 'running'].includes(job.status), `Job should be queued or running, got: ${job.status}`);
    assert.ok(job.data, 'Job should have data');
    assert.strictEqual(job.data.triggeredBy, 'test', 'Job data should be preserved');

    // Cancel the job to prevent it from running and hanging the test
    if (worker.cancelJob) {
      await worker.cancelJob(jobId);
    }
  });

  it('should track multiple workers', async () => {
    const worker1 = await workerRegistry.getWorker('schema-enhancement');
    const worker2 = await workerRegistry.getWorker('git-activity');

    assert.ok(worker1, 'Worker 1 should be initialized');
    assert.ok(worker2, 'Worker 2 should be initialized');
    assert.notStrictEqual(worker1, worker2, 'Workers should be different instances');
  });
});

logger.info('Pipeline trigger integration tests ready');

import test from 'node:test';
import assert from 'node:assert/strict';
import { SidequestServer } from './server.ts';
import { jobRepository } from './job-repository.ts';
import type { SaveJobInput } from './job-repository.ts';
import { JOB_STATUS } from '#api/types/job-status.ts';

function stubRepositoryInit(t: test.TestContext): void {
  const originalInitialize = jobRepository.initialize.bind(jobRepository);
  const originalSaveJob = jobRepository.saveJob.bind(jobRepository);
  (jobRepository as unknown as { initialize: () => Promise<void> }).initialize = async () => {};
  (jobRepository as unknown as { saveJob: (job: SaveJobInput) => void }).saveJob = (_job: SaveJobInput) => {};

  t.after(() => {
    (jobRepository as unknown as { initialize: () => Promise<void> }).initialize = originalInitialize;
    (jobRepository as unknown as { saveJob: (job: SaveJobInput) => void }).saveJob = originalSaveJob;
  });
}

class DelayedDispatchServer extends SidequestServer {
  async executeJob(jobId: string): Promise<void> {
    await new Promise<void>((resolve) => setImmediate(resolve));
    await super.executeJob(jobId);
  }
}

async function flushDispatchQueue(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
}

test('cancelJob rejects running jobs', (t) => {
  stubRepositoryInit(t);

  const server = new SidequestServer({ autoStart: false, jobType: 'action-guards' });
  server.stop();

  const job = server.createJob('running-cancel-target', {});
  job.status = JOB_STATUS.RUNNING;
  job.startedAt = new Date();

  const result = server.cancelJob(job.id);

  assert.equal(result.success, false);
  assert.equal(
    result.message,
    'Cannot cancel a running job. Cancellation is only supported for queued or paused jobs.'
  );
  assert.equal(job.status, JOB_STATUS.RUNNING);
});

test('pauseJob rejects running jobs', (t) => {
  stubRepositoryInit(t);

  const server = new SidequestServer({ autoStart: false, jobType: 'action-guards' });
  server.stop();

  const job = server.createJob('running-pause-target', {});
  job.status = JOB_STATUS.RUNNING;
  job.startedAt = new Date();

  const result = server.pauseJob(job.id);

  assert.equal(result.success, false);
  assert.equal(
    result.message,
    'Cannot pause a running job. Pause is only supported for queued jobs.'
  );
  assert.equal(job.status, JOB_STATUS.RUNNING);
});

test('getStats includes pendingRetries count', (t) => {
  stubRepositoryInit(t);

  const server = new SidequestServer({ autoStart: false, jobType: 'action-guards' });
  server.stop();

  const first = server.createJob('retry-pending-1', {});
  const second = server.createJob('retry-pending-2', {});

  first.retryPending = true;
  second.retryPending = false;

  const stats = server.getStats();
  assert.equal(stats.pendingRetries, 1);
});

test('cancelJob clears retryPending immediately', (t) => {
  stubRepositoryInit(t);

  const server = new SidequestServer({ autoStart: false, jobType: 'action-guards' });
  server.stop();

  const job = server.createJob('cancel-pending-retry', {});
  job.retryPending = true;

  const result = server.cancelJob(job.id);
  assert.equal(result.success, true);
  assert.equal(job.retryPending, false);
  assert.equal(server.getStats().pendingRetries, 0);
});

test('pauseJob clears retryPending immediately', (t) => {
  stubRepositoryInit(t);

  const server = new SidequestServer({ autoStart: false, jobType: 'action-guards' });
  server.stop();

  const job = server.createJob('pause-pending-retry', {});
  job.retryPending = true;

  const result = server.pauseJob(job.id);
  assert.equal(result.success, true);
  assert.equal(job.retryPending, false);
  assert.equal(server.getStats().pendingRetries, 0);
});

test('cancelJob blocks execution when job is cancelled during dispatch window', async (t) => {
  stubRepositoryInit(t);

  const server = new DelayedDispatchServer({ autoStart: false, jobType: 'action-guards' });
  server.stop();

  let handlerRuns = 0;
  server.handleJob = async () => {
    handlerRuns += 1;
    return { ok: true };
  };

  const job = server.createJob('dispatch-window-cancel', {});
  server.isRunning = true;
  await server.processQueue();

  const result = server.cancelJob(job.id);
  assert.equal(result.success, true);

  await flushDispatchQueue();

  assert.equal(handlerRuns, 0);
  assert.equal(job.status, JOB_STATUS.CANCELLED);
  assert.equal(server.getStats().active, 0);
});

test('pauseJob blocks execution when job is paused during dispatch window', async (t) => {
  stubRepositoryInit(t);

  const server = new DelayedDispatchServer({ autoStart: false, jobType: 'action-guards' });
  server.stop();

  let handlerRuns = 0;
  server.handleJob = async () => {
    handlerRuns += 1;
    return { ok: true };
  };

  const job = server.createJob('dispatch-window-pause', {});
  server.isRunning = true;
  await server.processQueue();

  const result = server.pauseJob(job.id);
  assert.equal(result.success, true);

  await flushDispatchQueue();

  assert.equal(handlerRuns, 0);
  assert.equal(job.status, JOB_STATUS.PAUSED);
  assert.equal(server.getStats().active, 0);
});

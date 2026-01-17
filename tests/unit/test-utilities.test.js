/**
 * Test Utilities Validation Tests
 *
 * Validates that the test utilities module works correctly
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  TestWorker,
  waitForEvent,
  waitForJobCompletion,
  createSentryMock,
  createBroadcasterMock,
  createTestJobs,
  waitForMultipleEvents,
  assertJobState,
  createTestContext
} from '../utils/test-utilities.js';

describe('Test Utilities - Validation', () => {
  describe('TestWorker', () => {
    let worker;

    afterEach(async () => {
      if (worker) {
        await worker.cleanup();
      }
    });

    it('should create a TestWorker instance', () => {
      worker = new TestWorker();
      assert.ok(worker);
      assert.equal(worker.jobType, 'test-worker');
    });

    it('should allow setting a custom handler', () => {
      worker = new TestWorker();
      const handler = async (job) => ({ success: true });
      worker.setHandler(handler);
      assert.ok(worker._testHandler);
    });

    it('should throw if handler is not a function', () => {
      worker = new TestWorker();
      assert.throws(() => {
        worker.setHandler('not a function');
      }, TypeError);
    });

    it('should throw if runJobHandler called without handler', async () => {
      worker = new TestWorker();
      await assert.rejects(
        async () => await worker.runJobHandler({}),
        /No test handler configured/
      );
    });

    it('should track events in event log', async () => {
      worker = new TestWorker();
      worker.setHandler(async () => ({ success: true }));

      worker.createJob('test-1', {});
      await waitForEvent(worker, 'job:completed');

      const createdEvents = worker.getEvents('job:created');
      const completedEvents = worker.getEvents('job:completed');

      assert.equal(createdEvents.length, 1);
      assert.equal(completedEvents.length, 1);
    });

    it('should clear event log', async () => {
      worker = new TestWorker();
      worker.setHandler(async () => ({ success: true }));

      worker.createJob('test-1', {});
      await waitForEvent(worker, 'job:completed');

      assert.ok(worker._eventLog.length > 0);
      worker.clearEvents();
      assert.equal(worker._eventLog.length, 0);
    });
  });

  describe('waitForEvent', () => {
    let worker;

    afterEach(async () => {
      if (worker) {
        await worker.cleanup();
      }
    });

    it('should wait for job:completed event', async () => {
      worker = new TestWorker();
      worker.setHandler(async () => ({ success: true }));

      worker.createJob('test-1', {});
      const [job] = await waitForEvent(worker, 'job:completed');

      assert.equal(job.id, 'test-1');
      assert.equal(job.status, 'completed');
    });

    it('should timeout if event not emitted', async () => {
      worker = new TestWorker();
      worker.setHandler(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return { success: true };
      });

      worker.createJob('test-1', {});

      await assert.rejects(
        async () => await waitForEvent(worker, 'job:never-emitted', 100),
        /Timeout waiting for event/
      );
    });
  });

  describe('waitForJobCompletion', () => {
    let worker;

    afterEach(async () => {
      if (worker) {
        await worker.cleanup();
      }
    });

    it('should wait for successful completion', async () => {
      worker = new TestWorker();
      worker.setHandler(async () => ({ result: 'success' }));

      worker.createJob('test-1', {});
      const result = await waitForJobCompletion(worker, 'test-1');

      assert.equal(result.status, 'completed');
      assert.equal(result.job.id, 'test-1');
      assert.equal(result.job.result.result, 'success');
    });

    it('should wait for failed completion', async () => {
      worker = new TestWorker();
      worker.setHandler(async () => {
        throw new Error('Test failure');
      });

      worker.createJob('test-1', {});
      const result = await waitForJobCompletion(worker, 'test-1');

      assert.equal(result.status, 'failed');
      assert.equal(result.job.id, 'test-1');
      assert.ok(result.error);
      assert.equal(result.error.message, 'Test failure');
    });
  });

  describe('createSentryMock', () => {
    it('should create a Sentry mock', () => {
      const mock = createSentryMock();
      assert.ok(mock);
      assert.ok(typeof mock.init === 'function');
      assert.ok(typeof mock.captureException === 'function');
      assert.ok(typeof mock.captureMessage === 'function');
    });

    it('should track exceptions', () => {
      const mock = createSentryMock();
      const error = new Error('Test error');
      mock.captureException(error, { tags: { test: true } });

      assert.equal(mock.events.length, 1);
      assert.equal(mock.events[0].type, 'exception');
      assert.equal(mock.events[0].error, error);
      assert.equal(mock.events[0].context.tags.test, true);
    });

    it('should track messages', () => {
      const mock = createSentryMock();
      mock.captureMessage('Test message', { level: 'info' });

      assert.equal(mock.events.length, 1);
      assert.equal(mock.events[0].type, 'message');
      assert.equal(mock.events[0].message, 'Test message');
    });

    it('should track breadcrumbs', () => {
      const mock = createSentryMock();
      mock.addBreadcrumb({ category: 'test', message: 'Test breadcrumb' });

      assert.equal(mock.breadcrumbs.length, 1);
      assert.equal(mock.breadcrumbs[0].category, 'test');
    });

    it('should track spans', async () => {
      const mock = createSentryMock();
      const result = await mock.startSpan({ name: 'test-span' }, async (span) => {
        return 'test-result';
      });

      assert.equal(result, 'test-result');
      assert.equal(mock.spans.length, 1);
      assert.equal(mock.spans[0].name, 'test-span');
      assert.ok(mock.spans[0].duration >= 0);
    });

    it('should clear all data', () => {
      const mock = createSentryMock();
      mock.captureException(new Error('Test'));
      mock.addBreadcrumb({ category: 'test' });

      mock.clear();

      assert.equal(mock.events.length, 0);
      assert.equal(mock.breadcrumbs.length, 0);
      assert.equal(mock.spans.length, 0);
    });
  });

  describe('createBroadcasterMock', () => {
    it('should create a broadcaster mock', () => {
      const mock = createBroadcasterMock();
      assert.ok(mock);
      assert.ok(typeof mock.broadcast === 'function');
    });

    it('should track broadcasts', () => {
      const mock = createBroadcasterMock();
      mock.broadcast({ type: 'test' }, 'channel-1');

      assert.equal(mock.messages.length, 1);
      assert.equal(mock.messages[0].message.type, 'test');
      assert.equal(mock.messages[0].channel, 'channel-1');
    });

    it('should filter messages by channel', () => {
      const mock = createBroadcasterMock();
      mock.broadcast({ type: 'test-1' }, 'channel-1');
      mock.broadcast({ type: 'test-2' }, 'channel-2');
      mock.broadcast({ type: 'test-3' }, 'channel-1');

      const channel1Messages = mock.getMessages('channel-1');
      assert.equal(channel1Messages.length, 2);
      assert.equal(channel1Messages[0].message.type, 'test-1');
      assert.equal(channel1Messages[1].message.type, 'test-3');
    });

    it('should clear messages', () => {
      const mock = createBroadcasterMock();
      mock.broadcast({ type: 'test' }, 'channel-1');
      mock.clear();
      assert.equal(mock.messages.length, 0);
    });
  });

  describe('createTestJobs', () => {
    let worker;

    afterEach(async () => {
      if (worker) {
        await worker.cleanup();
      }
    });

    it('should create multiple jobs', () => {
      worker = new TestWorker();
      const jobs = createTestJobs(worker, 3);

      assert.equal(jobs.length, 3);
      assert.equal(jobs[0].id, 'test-job-0');
      assert.equal(jobs[1].id, 'test-job-1');
      assert.equal(jobs[2].id, 'test-job-2');
    });

    it('should use custom base ID', () => {
      worker = new TestWorker();
      const jobs = createTestJobs(worker, 2, 'custom');

      assert.equal(jobs[0].id, 'custom-0');
      assert.equal(jobs[1].id, 'custom-1');
    });
  });

  describe('waitForMultipleEvents', () => {
    let worker;

    afterEach(async () => {
      if (worker) {
        await worker.cleanup();
      }
    });

    it('should wait for multiple job:completed events', async () => {
      worker = new TestWorker();
      worker.setHandler(async () => ({ success: true }));

      createTestJobs(worker, 3);
      const completions = await waitForMultipleEvents(worker, 'job:completed', 3);

      assert.equal(completions.length, 3);
    });

    it('should timeout if not enough events', async () => {
      worker = new TestWorker();
      worker.setHandler(async () => ({ success: true }));

      createTestJobs(worker, 2);

      await assert.rejects(
        async () => await waitForMultipleEvents(worker, 'job:completed', 5, 100),
        /Only received \d+\/5/  // Match any number of events less than 5
      );
    });
  });

  describe('assertJobState', () => {
    it('should create assertions for status', () => {
      const job = { id: 'test-1', status: 'completed' };
      const assertions = assertJobState(job, { status: 'completed' });

      assert.equal(assertions.length, 1);
      assert.equal(assertions[0].actual, 'completed');
      assert.equal(assertions[0].expected, 'completed');
    });

    it('should create assertions for error', () => {
      const job = { id: 'test-1', error: null };
      const assertions = assertJobState(job, { error: null });

      assert.equal(assertions.length, 1);
      assert.equal(assertions[0].actual, null);
      assert.equal(assertions[0].expected, null);
    });

    it('should create assertions for result', () => {
      const job = { id: 'test-1', result: { success: true } };
      const assertions = assertJobState(job, { result: { success: true } });

      assert.equal(assertions.length, 1);
      assert.deepEqual(assertions[0].actual, { success: true });
    });
  });

  describe('createTestContext', () => {
    let context;

    afterEach(async () => {
      if (context) {
        await context.cleanup();
      }
    });

    it('should create complete test context', () => {
      context = createTestContext();

      assert.ok(context.worker);
      assert.ok(context.sentryMock);
      assert.ok(context.broadcasterMock);
      assert.ok(typeof context.cleanup === 'function');
    });

    it('should allow custom worker options', () => {
      context = createTestContext({
        workerOptions: {
          jobType: 'custom-worker',
          maxConcurrent: 5
        }
      });

      assert.equal(context.worker.jobType, 'custom-worker');
      assert.equal(context.worker.maxConcurrent, 5);
    });

    it('should cleanup all resources', async () => {
      context = createTestContext();
      const { worker, broadcasterMock } = context;

      // Create some data
      worker.setHandler(async () => ({ success: true }));
      worker.createJob('test-1', {});
      await waitForEvent(worker, 'job:completed');
      broadcasterMock.broadcast({ type: 'test' }, 'channel');

      // Verify data exists
      assert.ok(worker.jobs.size > 0);
      assert.ok(broadcasterMock.messages.length > 0);

      // Cleanup
      await context.cleanup();

      // Verify cleanup
      assert.equal(worker.jobs.size, 0);
      assert.equal(broadcasterMock.messages.length, 0);
    });
  });

  describe('Integration - Full Test Flow', () => {
    let context;

    beforeEach(() => {
      context = createTestContext();
    });

    afterEach(async () => {
      await context.cleanup();
    });

    it('should support complete job lifecycle testing', async () => {
      const { worker } = context;

      // Setup handler
      worker.setHandler(async (job) => {
        if (job.data?.shouldFail === true) {
          throw new Error('Intentional failure');
        }
        return { result: 'success', data: job.data };
      });

      // Test successful job
      worker.createJob('success-1', { shouldFail: false });
      const successResult = await waitForJobCompletion(worker, 'success-1');

      assert.equal(successResult.status, 'completed');
      assert.equal(successResult.job.result.result, 'success');

      // Test failed job
      worker.createJob('fail-1', { shouldFail: true });
      const failResult = await waitForJobCompletion(worker, 'fail-1');

      assert.equal(failResult.status, 'failed');
      assert.equal(failResult.error.message, 'Intentional failure');

      // Verify event tracking
      const completedEvents = worker.getEvents('job:completed');
      const failedEvents = worker.getEvents('job:failed');

      assert.equal(completedEvents.length, 1);
      assert.equal(failedEvents.length, 1);
    });
  });
});

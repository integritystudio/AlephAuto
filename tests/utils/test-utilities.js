/**
 * Test Utilities for AlephAuto Job Queue System
 *
 * Provides reusable utilities for testing SidequestServer-based workers
 *
 * @module test-utilities
 * @see docs/testing/TEST_INFRASTRUCTURE_IMPROVEMENTS.md
 */

import { EventEmitter } from 'events';
import { SidequestServer } from '../../sidequest/core/server.js';
import * as Sentry from '@sentry/node';

/**
 * TestWorker - Base class for test workers
 *
 * Extends SidequestServer with test-specific features:
 * - Configurable handler function
 * - Event tracking
 * - Auto-cleanup
 *
 * @example
 * const worker = new TestWorker({ jobType: 'test-job' });
 * worker.setHandler(async (job) => ({ success: true }));
 * worker.createJob('job-1', { data: 'test' });
 * await waitForEvent(worker, 'job:completed');
 */
export class TestWorker extends SidequestServer {
  /**
   * Create a TestWorker instance
   * @param {Object} options - Worker configuration options
   * @param {string} [options.jobType='test-worker'] - Job type identifier
   * @param {number} [options.maxConcurrent=1] - Max concurrent jobs
   * @param {number} [options.maxRetries=0] - Max retry attempts (disabled by default for predictable test behavior)
   * @param {boolean} [options.enableSentry=false] - Enable real Sentry (disabled by default in tests)
   */
  constructor(options = {}) {
    super({
      jobType: options.jobType || 'test-worker',
      maxConcurrent: options.maxConcurrent ?? 1,
      maxRetries: options.maxRetries ?? 0, // T1 fix: disable retries by default for predictable tests
      sentryDsn: options.enableSentry ? undefined : null, // Disable real Sentry in tests
      ...options
    });

    this._testHandler = null;
    this._eventLog = [];
    this._trackEvents();
  }

  /**
   * Set the job handler for testing
   * @param {Function} handler - Async function that handles jobs
   * @example
   * worker.setHandler(async (job) => {
   *   return { result: 'success' };
   * });
   */
  setHandler(handler) {
    if (typeof handler !== 'function') {
      throw new TypeError('Handler must be a function');
    }
    this._testHandler = handler;
  }

  /**
   * Override runJobHandler to use test handler
   * @param {Object} job - Job to process
   * @returns {Promise<any>} - Job result
   */
  async runJobHandler(job) {
    if (!this._testHandler) {
      throw new Error(
        'No test handler configured. Call setHandler() first.\n' +
        'Example: worker.setHandler(async (job) => ({ success: true }))'
      );
    }
    return await this._testHandler(job);
  }

  /**
   * Track all events for assertions
   * @private
   */
  _trackEvents() {
    const events = [
      'job:created', 'job:started', 'job:completed',
      'job:failed', 'retry:created', 'retry:max-attempts'
    ];

    events.forEach(event => {
      this.on(event, (...args) => {
        this._eventLog.push({
          event,
          args,
          timestamp: Date.now()
        });
      });
    });
  }

  /**
   * Get events of specific type
   * @param {string} type - Event type to filter by
   * @returns {Array} - Filtered events
   * @example
   * const failedJobs = worker.getEvents('job:failed');
   */
  getEvents(type) {
    return this._eventLog.filter(e => e.event === type);
  }

  /**
   * Clear event log
   */
  clearEvents() {
    this._eventLog = [];
  }

  /**
   * Cleanup worker (for afterEach hooks)
   * @returns {Promise<void>}
   */
  async cleanup() {
    this.removeAllListeners();
    this.jobs.clear();
    this.queue = [];
    this.activeJobs = 0;
  }
}

/**
 * Wait for a specific event with timeout
 *
 * @param {EventEmitter} emitter - Event emitter to listen on
 * @param {string} eventName - Event name to wait for
 * @param {number} [timeout=5000] - Timeout in milliseconds
 * @returns {Promise<Array>} - Event arguments
 *
 * @example
 * const [job] = await waitForEvent(worker, 'job:completed');
 * assert.equal(job.status, 'completed');
 */
export function waitForEvent(emitter, eventName, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for event: ${eventName} (waited ${timeout}ms)`));
    }, timeout);

    emitter.once(eventName, (...args) => {
      clearTimeout(timer);
      resolve(args);
    });
  });
}

/**
 * Wait for job completion (success or failure)
 *
 * @param {SidequestServer} worker - Worker instance
 * @param {string} jobId - Job ID to wait for
 * @param {number} [timeout=5000] - Timeout in milliseconds
 * @returns {Promise<Object>} - Result object with status, job, and optional error
 *
 * @example
 * const result = await waitForJobCompletion(worker, 'job-1');
 * if (result.status === 'completed') {
 *   assert.equal(result.job.result.success, true);
 * } else {
 *   console.error('Job failed:', result.error);
 * }
 */
export async function waitForJobCompletion(worker, jobId, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Job ${jobId} did not complete within ${timeout}ms`));
    }, timeout);

    const checkCompletion = (job) => {
      if (job.id === jobId) {
        clearTimeout(timer);
        worker.off('job:completed', checkCompletion);
        worker.off('job:failed', checkFailed);
        resolve({ status: 'completed', job });
      }
    };

    const checkFailed = (job, error) => {
      if (job.id === jobId) {
        clearTimeout(timer);
        worker.off('job:completed', checkCompletion);
        worker.off('job:failed', checkFailed);
        resolve({ status: 'failed', job, error });
      }
    };

    worker.on('job:completed', checkCompletion);
    worker.on('job:failed', checkFailed);
  });
}

/**
 * Create Sentry mock for testing
 *
 * @returns {Object} - Sentry mock with tracking capabilities
 *
 * @example
 * const sentryMock = createSentryMock();
 * global.Sentry = sentryMock;
 * // ... run tests ...
 * assert.equal(sentryMock.events.length, 1);
 * assert.equal(sentryMock.events[0].error.message, 'Expected error');
 */
export function createSentryMock() {
  const mock = {
    events: [],
    breadcrumbs: [],
    spans: [],
    config: null,

    /**
     * Mock Sentry.init
     * @param {Object} options - Sentry configuration
     */
    init: (options) => {
      mock.config = options;
    },

    /**
     * Mock Sentry.captureException
     * @param {Error} error - Error to capture
     * @param {Object} context - Additional context
     */
    captureException: (error, context) => {
      mock.events.push({ type: 'exception', error, context, timestamp: Date.now() });
    },

    /**
     * Mock Sentry.captureMessage
     * @param {string} message - Message to capture
     * @param {Object} context - Additional context
     */
    captureMessage: (message, context) => {
      mock.events.push({ type: 'message', message, context, timestamp: Date.now() });
    },

    /**
     * Mock Sentry.addBreadcrumb
     * @param {Object} breadcrumb - Breadcrumb to add
     */
    addBreadcrumb: (breadcrumb) => {
      mock.breadcrumbs.push({ ...breadcrumb, timestamp: Date.now() });
    },

    /**
     * Mock Sentry.startSpan
     * @param {Object} options - Span options
     * @param {Function} callback - Callback to execute within span
     * @returns {Promise<any>} - Callback result
     */
    startSpan: async (options, callback) => {
      const span = {
        ...options,
        startTime: Date.now(),
        // Add span methods that might be called
        setStatus: function(status) {
          this.status = status;
        },
        setAttribute: function(key, value) {
          if (!this.attributes) this.attributes = {};
          this.attributes[key] = value;
        }
      };
      mock.spans.push(span);

      try {
        const result = await callback(span);
        span.endTime = Date.now();
        span.duration = span.endTime - span.startTime;
        return result;
      } catch (error) {
        span.endTime = Date.now();
        span.duration = span.endTime - span.startTime;
        span.error = error;
        throw error;
      }
    },

    /**
     * Mock Sentry.withScope
     * @param {Function} callback - Callback with scope
     */
    withScope: (callback) => {
      const scope = {
        setTag: (key, value) => {},
        setContext: (name, context) => {},
        setLevel: (level) => {}
      };
      callback(scope);
    },

    /**
     * Clear all captured data
     */
    clear: () => {
      mock.events = [];
      mock.breadcrumbs = [];
      mock.spans = [];
      mock.config = null;
    }
  };

  return mock;
}

/**
 * Mock WebSocket broadcaster for testing
 *
 * @returns {Object} - Broadcaster mock with message tracking
 *
 * @example
 * const broadcasterMock = createBroadcasterMock();
 * activityFeed = new ActivityFeedManager(broadcasterMock);
 * // ... trigger activities ...
 * const messages = broadcasterMock.getMessages('activity');
 * assert.equal(messages.length, 3);
 */
export function createBroadcasterMock() {
  return {
    messages: [],

    /**
     * Broadcast a message
     * @param {any} message - Message to broadcast
     * @param {string} channel - Channel name
     */
    broadcast: function(message, channel) {
      this.messages.push({
        message,
        channel,
        timestamp: Date.now()
      });
    },

    /**
     * Get messages, optionally filtered by channel
     * @param {string} [channel] - Channel to filter by
     * @returns {Array} - Messages
     */
    getMessages: function(channel) {
      return channel
        ? this.messages.filter(m => m.channel === channel)
        : this.messages;
    },

    /**
     * Clear all messages
     */
    clear: function() {
      this.messages = [];
    }
  };
}

/**
 * Create multiple test jobs
 *
 * @param {SidequestServer} worker - Worker instance
 * @param {number} count - Number of jobs to create
 * @param {string} [baseId='test-job'] - Base ID for jobs
 * @returns {Array<Object>} - Created jobs
 *
 * @example
 * const jobs = createTestJobs(worker, 5);
 * const results = await Promise.all(
 *   jobs.map(j => waitForJobCompletion(worker, j.id))
 * );
 */
export function createTestJobs(worker, count, baseId = 'test-job') {
  const jobs = [];
  for (let i = 0; i < count; i++) {
    const job = worker.createJob(`${baseId}-${i}`, {
      type: 'test',
      index: i,
      data: { test: true }
    });
    jobs.push(job);
  }
  return jobs;
}

/**
 * Wait for multiple events
 *
 * @param {EventEmitter} worker - Event emitter to listen on
 * @param {string} eventName - Event name to wait for
 * @param {number} count - Number of events to collect
 * @param {number} [timeout=5000] - Timeout in milliseconds
 * @returns {Promise<Array>} - Array of event arguments
 *
 * @example
 * const completions = await waitForMultipleEvents(worker, 'job:completed', 5);
 * assert.equal(completions.length, 5);
 */
export async function waitForMultipleEvents(worker, eventName, count, timeout = 5000) {
  const events = [];

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Only received ${events.length}/${count} ${eventName} events within ${timeout}ms`));
    }, timeout);

    const handler = (...args) => {
      events.push(args);
      if (events.length >= count) {
        clearTimeout(timer);
        worker.off(eventName, handler);
        resolve(events);
      }
    };

    worker.on(eventName, handler);
  });
}

/**
 * Assert job state
 *
 * @param {Object} job - Job to check
 * @param {Object} expected - Expected state
 * @param {string} [expected.status] - Expected status
 * @param {*} [expected.error] - Expected error (or null)
 * @param {*} [expected.result] - Expected result
 * @returns {Array<Object>} - Assertions with actual/expected values
 *
 * @example
 * const assertions = assertJobState(job, {
 *   status: 'completed',
 *   error: null,
 *   result: { success: true }
 * });
 * assertions.forEach(a => {
 *   assert.deepEqual(a.actual, a.expected, a.message);
 * });
 */
export function assertJobState(job, expected) {
  const assertions = [];

  if (expected.status !== undefined) {
    assertions.push({
      actual: job.status,
      expected: expected.status,
      message: `Job status should be ${expected.status}`
    });
  }

  if (expected.error !== undefined) {
    if (expected.error === null) {
      assertions.push({
        actual: job.error,
        expected: null,
        message: 'Job should not have error'
      });
    } else {
      assertions.push({
        actual: job.error,
        expected: expected.error,
        message: 'Job error should match'
      });
    }
  }

  if (expected.result !== undefined) {
    assertions.push({
      actual: job.result,
      expected: expected.result,
      message: 'Job result should match'
    });
  }

  return assertions;
}

/**
 * Create test context with all utilities
 *
 * Provides a complete test setup with worker, mocks, and cleanup
 *
 * @param {Object} options - Configuration options
 * @param {Object} [options.workerOptions] - Options to pass to TestWorker
 * @param {boolean} [options.enableSentry=false] - Enable real Sentry
 * @returns {Object} - Test context with worker, mocks, and cleanup function
 *
 * @example
 * let context;
 *
 * beforeEach(() => {
 *   context = createTestContext();
 * });
 *
 * afterEach(async () => {
 *   await context.cleanup();
 * });
 *
 * it('should process job', async () => {
 *   const { worker, sentryMock } = context;
 *   worker.setHandler(async () => ({ success: true }));
 *   // ... test logic ...
 * });
 */
export function createTestContext(options = {}) {
  const sentryMock = createSentryMock();
  const broadcasterMock = createBroadcasterMock();

  // Worker already has Sentry disabled via sentryDsn: null
  const worker = new TestWorker(options.workerOptions || {});

  // Note: We don't try to replace the global Sentry module (ES6 modules are read-only)
  // Instead, the sentryMock is available for manual assertions
  // Workers created with sentryDsn: null won't actually send to Sentry

  return {
    worker,
    sentryMock,
    broadcasterMock,

    /**
     * Cleanup function - call in afterEach
     * @returns {Promise<void>}
     */
    async cleanup() {
      await worker.cleanup();
      sentryMock.clear();
      broadcasterMock.clear();
    }
  };
}

// Export all utilities
export default {
  TestWorker,
  waitForEvent,
  waitForJobCompletion,
  createSentryMock,
  createBroadcasterMock,
  createTestJobs,
  waitForMultipleEvents,
  assertJobState,
  createTestContext
};

import { EventEmitter } from 'events';
import { SidequestServer } from '../../sidequest/core/server.ts';
import { TestTiming } from '../constants/timing-test-constants.ts';

interface TestWorkerOptions {
  jobType?: string;
  maxConcurrent?: number;
  maxRetries?: number;
  [key: string]: unknown;
}

interface EventLogEntry {
  event: string;
  args: unknown[];
  timestamp: number;
}

export class TestWorker extends SidequestServer {
  private _testHandler: ((job: unknown) => Promise<unknown>) | null;
  private _eventLog: EventLogEntry[];

  /** Create a test worker with deterministic defaults for unit tests. */
  constructor(options: TestWorkerOptions = {}) {
    super({
      jobType: options.jobType ?? 'test-worker',
      maxConcurrent: options.maxConcurrent ?? 1,
      maxRetries: options.maxRetries ?? 0,
      ...options
    });

    this._testHandler = null;
    this._eventLog = [];
    this._trackEvents();
  }

  /** Register a job handler used by runJobHandler in tests. */
  setHandler(handler: (job: unknown) => Promise<unknown>): void {
    if (typeof handler !== 'function') {
      throw new TypeError('Handler must be a function');
    }
    this._testHandler = handler;
  }

  /** Execute the configured test job handler. */
  async runJobHandler(job: unknown): Promise<unknown> {
    if (!this._testHandler) {
      throw new Error(
        'No test handler configured. Call setHandler() first.\n' +
        'Example: worker.setHandler(async (job) => ({ success: true }))'
      );
    }
    return await this._testHandler(job);
  }

  private _trackEvents(): void {
    const events = [
      'job:created', 'job:started', 'job:completed',
      'job:failed', 'retry:created', 'retry:max-attempts'
    ];

    events.forEach(event => {
      this.on(event, (...args: unknown[]) => {
        this._eventLog.push({
          event,
          args,
          timestamp: Date.now()
        });
      });
    });
  }

  /** Return captured events filtered by event type. */
  getEvents(type: string): EventLogEntry[] {
    return this._eventLog.filter(e => e.event === type);
  }

  /** Clear captured event history. */
  clearEvents(): void {
    this._eventLog = [];
  }

  /** Reset listeners and queue/job state between tests. */
  async cleanup(): Promise<void> {
    this.removeAllListeners();
    this.jobs.clear();
    this.queue = [];
    this.activeJobs = 0;
  }
}

/** Wait for one event emission and resolve with emitted arguments. */
export function waitForEvent(
  emitter: EventEmitter,
  eventName: string,
  timeout = TestTiming.DEFAULT_WAIT_TIMEOUT_MS
): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for event: ${eventName} (waited ${timeout}ms)`));
    }, timeout);

    emitter.once(eventName, (...args: unknown[]) => {
      clearTimeout(timer);
      resolve(args);
    });
  });
}

interface JobCompletionResult {
  status: 'completed' | 'failed';
  job: unknown;
  error?: unknown;
}

/** Wait until a specific job reaches completed or failed status. */
export async function waitForJobCompletion(
  worker: EventEmitter,
  jobId: string,
  timeout = TestTiming.DEFAULT_WAIT_TIMEOUT_MS
): Promise<JobCompletionResult> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Job ${jobId} did not complete within ${timeout}ms`));
    }, timeout);

    /** Resolve when the target job completes successfully. */
    const checkCompletion = (job: { id: string }) => {
      if (job.id === jobId) {
        clearTimeout(timer);
        worker.off('job:completed', checkCompletion);
        worker.off('job:failed', checkFailed);
        resolve({ status: 'completed', job });
      }
    };

    /** Resolve when the target job fails. */
    const checkFailed = (job: { id: string }, error: unknown) => {
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

interface SentryMock {
  events: Array<{ type: string; error?: unknown; message?: string; context?: unknown; timestamp: number }>;
  breadcrumbs: Array<Record<string, unknown>>;
  spans: Array<Record<string, unknown>>;
  config: unknown;
  init: (options: unknown) => void;
  captureException: (error: unknown, context?: unknown) => void;
  captureMessage: (message: string, context?: unknown) => void;
  addBreadcrumb: (breadcrumb: Record<string, unknown>) => void;
  startSpan: (options: Record<string, unknown>, callback: (span: unknown) => Promise<unknown>) => Promise<unknown>;
  withScope: (callback: (scope: unknown) => void) => void;
  clear: () => void;
}

/** Create an in-memory Sentry mock with captured events/breadcrumbs/spans. */
export function createSentryMock(): SentryMock {
  const mock: SentryMock = {
    events: [],
    breadcrumbs: [],
    spans: [],
    config: null,

    init: (options) => {
      mock.config = options;
    },

    captureException: (error, context) => {
      mock.events.push({ type: 'exception', error, context, timestamp: Date.now() });
    },

    captureMessage: (message, context) => {
      mock.events.push({ type: 'message', message, context, timestamp: Date.now() });
    },

    addBreadcrumb: (breadcrumb) => {
      mock.breadcrumbs.push({ ...breadcrumb, timestamp: Date.now() });
    },

    startSpan: async (options, callback) => {
      const span: Record<string, unknown> = {
        ...options,
        startTime: Date.now(),
        setStatus: function(status: unknown) { (this as Record<string, unknown>)['status'] = status; },
        setAttribute: function(key: string, value: unknown) {
          if (!(this as Record<string, unknown>)['attributes']) (this as Record<string, unknown>)['attributes'] = {};
          ((this as Record<string, unknown>)['attributes'] as Record<string, unknown>)[key] = value;
        }
      };
      mock.spans.push(span);

      try {
        const result = await callback(span);
        span['endTime'] = Date.now();
        span['duration'] = (span['endTime'] as number) - (span['startTime'] as number);
        return result;
      } catch (error) {
        span['endTime'] = Date.now();
        span['duration'] = (span['endTime'] as number) - (span['startTime'] as number);
        span['error'] = error;
        throw error;
      }
    },

    withScope: (callback) => {
      const scope = {
        setTag: (_key: string, _value: unknown) => {},
        setContext: (_name: string, _context: unknown) => {},
        setLevel: (_level: unknown) => {}
      };
      callback(scope);
    },

    clear: () => {
      mock.events = [];
      mock.breadcrumbs = [];
      mock.spans = [];
      mock.config = null;
    }
  };

  return mock;
}

interface BroadcasterMockMessage {
  message: unknown;
  channel: string;
  timestamp: number;
}

interface BroadcasterMock {
  messages: BroadcasterMockMessage[];
  broadcast: (message: unknown, channel: string) => void;
  getMessages: (channel?: string) => BroadcasterMockMessage[];
  clear: () => void;
}

/** Create a broadcaster mock that records sent messages by channel. */
export function createBroadcasterMock(): BroadcasterMock {
  return {
    messages: [],

    /** Record a broadcast payload for assertions. */
    broadcast(message, channel) {
      this.messages.push({ message, channel, timestamp: Date.now() });
    },

    /** Return all messages or only those for a specific channel. */
    getMessages(channel) {
      return channel
        ? this.messages.filter(m => m.channel === channel)
        : this.messages;
    },

    /** Clear recorded broadcast messages. */
    clear() {
      this.messages = [];
    }
  };
}

interface WorkerWithCreateJob {
  createJob: (id: string, data: unknown) => unknown;
}

/** Create a batch of test jobs with predictable ids and payloads. */
export function createTestJobs(worker: WorkerWithCreateJob, count: number, baseId = 'test-job'): unknown[] {
  const jobs: unknown[] = [];
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

export async function waitForMultipleEvents(
  worker: EventEmitter,
  eventName: string,
  count: number,
  timeout = TestTiming.DEFAULT_WAIT_TIMEOUT_MS
): Promise<unknown[][]> {
  const events: unknown[][] = [];

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Only received ${events.length}/${count} ${eventName} events within ${timeout}ms`));
    }, timeout);

    /** Collect emitted events and resolve once expected count is reached. */
    const handler = (...args: unknown[]) => {
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

interface JobAssertionInput {
  status?: string;
  error?: unknown;
  result?: unknown;
}

interface JobAssertion {
  actual: unknown;
  expected: unknown;
  message: string;
}

/** Build assertion descriptors for expected job state fields. */
export function assertJobState(job: Record<string, unknown>, expected: JobAssertionInput): JobAssertion[] {
  const assertions: JobAssertion[] = [];

  if (expected.status !== undefined) {
    assertions.push({
      actual: job['status'],
      expected: expected.status,
      message: `Job status should be ${expected.status}`
    });
  }

  if (expected.error !== undefined) {
    if (expected.error === null) {
      assertions.push({
        actual: job['error'],
        expected: null,
        message: 'Job should not have error'
      });
    } else {
      assertions.push({
        actual: job['error'],
        expected: expected.error,
        message: 'Job error should match'
      });
    }
  }

  if (expected.result !== undefined) {
    assertions.push({
      actual: job['result'],
      expected: expected.result,
      message: 'Job result should match'
    });
  }

  return assertions;
}

interface TestContextOptions {
  workerOptions?: TestWorkerOptions;
}

interface TestContext {
  worker: TestWorker;
  sentryMock: SentryMock;
  broadcasterMock: BroadcasterMock;
  cleanup: () => Promise<void>;
}

/** Create a complete test context with worker, mocks, and cleanup helper. */
export function createTestContext(options: TestContextOptions = {}): TestContext {
  const sentryMock = createSentryMock();
  const broadcasterMock = createBroadcasterMock();
  const worker = new TestWorker(options.workerOptions ?? {});

  return {
    worker,
    sentryMock,
    broadcasterMock,

    /** Clean up all test context resources. */
    async cleanup() {
      await worker.cleanup();
      sentryMock.clear();
      broadcasterMock.clear();
    }
  };
}

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

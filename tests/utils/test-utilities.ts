import { EventEmitter } from 'events';
import { SidequestServer } from '../../sidequest/core/server.ts';

interface TestWorkerOptions {
  jobType?: string;
  maxConcurrent?: number;
  maxRetries?: number;
  enableSentry?: boolean;
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

  constructor(options: TestWorkerOptions = {}) {
    super({
      jobType: options.jobType ?? 'test-worker',
      maxConcurrent: options.maxConcurrent ?? 1,
      maxRetries: options.maxRetries ?? 0,
      sentryDsn: options.enableSentry ? undefined : null,
      ...options
    });

    this._testHandler = null;
    this._eventLog = [];
    this._trackEvents();
  }

  setHandler(handler: (job: unknown) => Promise<unknown>): void {
    if (typeof handler !== 'function') {
      throw new TypeError('Handler must be a function');
    }
    this._testHandler = handler;
  }

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

  getEvents(type: string): EventLogEntry[] {
    return this._eventLog.filter(e => e.event === type);
  }

  clearEvents(): void {
    this._eventLog = [];
  }

  async cleanup(): Promise<void> {
    this.removeAllListeners();
    this.jobs.clear();
    this.queue = [];
    this.activeJobs = 0;
  }
}

export function waitForEvent(emitter: EventEmitter, eventName: string, timeout = 5000): Promise<unknown[]> {
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

export async function waitForJobCompletion(worker: EventEmitter, jobId: string, timeout = 5000): Promise<JobCompletionResult> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Job ${jobId} did not complete within ${timeout}ms`));
    }, timeout);

    const checkCompletion = (job: { id: string }) => {
      if (job.id === jobId) {
        clearTimeout(timer);
        worker.off('job:completed', checkCompletion);
        worker.off('job:failed', checkFailed);
        resolve({ status: 'completed', job });
      }
    };

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

export function createBroadcasterMock(): BroadcasterMock {
  return {
    messages: [],

    broadcast(message, channel) {
      this.messages.push({ message, channel, timestamp: Date.now() });
    },

    getMessages(channel) {
      return channel
        ? this.messages.filter(m => m.channel === channel)
        : this.messages;
    },

    clear() {
      this.messages = [];
    }
  };
}

interface WorkerWithCreateJob {
  createJob: (id: string, data: unknown) => unknown;
}

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
  timeout = 5000
): Promise<unknown[][]> {
  const events: unknown[][] = [];

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Only received ${events.length}/${count} ${eventName} events within ${timeout}ms`));
    }, timeout);

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
  enableSentry?: boolean;
}

interface TestContext {
  worker: TestWorker;
  sentryMock: SentryMock;
  broadcasterMock: BroadcasterMock;
  cleanup: () => Promise<void>;
}

export function createTestContext(options: TestContextOptions = {}): TestContext {
  const sentryMock = createSentryMock();
  const broadcasterMock = createBroadcasterMock();
  const worker = new TestWorker(options.workerOptions ?? {});

  return {
    worker,
    sentryMock,
    broadcasterMock,

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

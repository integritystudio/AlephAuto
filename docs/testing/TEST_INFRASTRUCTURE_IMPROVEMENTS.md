# Test Infrastructure Architecture

Test infrastructure for AlephAuto's 796+ tests across unit, integration, and accuracy categories.

## Test Runner

**Engine:** Node.js native `node:test` module with `node:assert/strict`.

```bash
npm test                           # Unit tests (30s timeout)
npm run test:integration           # Integration tests (60s timeout, serial)
npm run test:all:core              # Unit + integration + sidequest (SKIP_ENV_SENSITIVE_TESTS=1)
npm run test:all:env-safe          # Env-sensitive, sandbox-safe
npm run test:all:env-host-required # Env-sensitive, host-dependent (API routes, ports, WebSocket)
npm run test:all                   # Core + Python suites
npm run test:all:full              # Everything
npm run test:coverage              # Coverage report (c8)
```

Execution: `node --strip-types --test --test-timeout=<ms> --test-force-exit [files]`

## Test File Layout

| Category | Location | ~Count |
|----------|----------|--------|
| Unit | `tests/unit/*.test.ts` | 50 |
| Integration | `tests/integration/*.integration.test.ts` | 7 |
| Sidequest core | `sidequest/**/*.test.ts` | 5 |
| Pipeline runners | `sidequest/pipeline-runners/*.test.ts` | 4 |
| Workers | `sidequest/workers/*.test.ts` | 3 |
| Utilities | `sidequest/utils/*.test.ts` | 2 |

Supporting files:
- `tests/fixtures/test-helpers.ts` — repository management, job polling
- `tests/utils/test-utilities.ts` — TestWorker, event waiters, mock factories
- `tests/constants/timing-test-constants.ts` — timeout constants
- `tests/fixtures/test-repo/` — static test repository
- `tests/fixtures/test-scan-config.json` — scan configuration fixture

## Core Utilities

### `tests/utils/test-utilities.ts`

Event-driven testing for `SidequestServer`-based workers.

| Export | Purpose |
|--------|---------|
| `TestWorker` | Extends `SidequestServer` with deterministic defaults (`maxConcurrent: 1`, `maxRetries: 0`), configurable handler via `setHandler()`, event log tracking |
| `waitForEvent(emitter, event, timeout)` | Promise resolving on next event emission (default 5s timeout) |
| `waitForJobCompletion(worker, jobId, timeout)` | Resolves with `{ status, job, error? }` on job completion or failure |
| `waitForMultipleEvents(worker, event, count, timeout)` | Collects N events before resolving |
| `createSentryMock()` | In-memory mock tracking `events[]`, `breadcrumbs[]`, `spans[]` |
| `createBroadcasterMock()` | Records messages by channel, filterable via `getMessages(channel)` |
| `createTestContext(options)` | Factory returning `{ worker, sentryMock, broadcasterMock, cleanup() }` |
| `createTestJobs(worker, count, baseId)` | Batch-create jobs with predictable IDs |
| `assertJobState(job, expected)` | Build assertion descriptors for status/error/result |

### `tests/fixtures/test-helpers.ts`

Repository and job lifecycle management.

| Export | Purpose |
|--------|---------|
| `createTempRepository(name, opts)` | Git-initialized temp directory with `src/test.js`, `README.md` |
| `createMultipleTempRepositories(count)` | Batch create |
| `cleanupRepositories(repos, opts)` | Cleanup with operation tracking |
| `getTestRepoPath()` | Path to static `tests/fixtures/test-repo/` |
| `trackOperation(dirPath)` | Returns release function; prevents cleanup race conditions |
| `waitForOperations(dirPath, timeout)` | Polls until all tracked operations complete |
| `waitForQueueDrain(worker, opts)` | Poll until `queued + active = 0` |
| `waitForJobCompletion(worker, jobId, opts)` | Poll-based completion (vs event-based in test-utilities) |

## Key Patterns

### Event-Driven Assertions

```typescript
// Set up listener BEFORE triggering the event
const completed = waitForEvent(worker, 'job:completed', 5000);
worker.createJob('job-1', { data: 'test' });
const [job] = await completed;
assert.equal(job.status, 'completed');
```

### TestWorker with Custom Handler

```typescript
const worker = new TestWorker({ jobType: 'test-feature' });
worker.setHandler(async (job) => {
  return { result: 'success' };
});
worker.createJob('job-1', {});
const result = await waitForJobCompletion(worker, 'job-1');
```

### Full Test Context

```typescript
let context;
beforeEach(() => { context = createTestContext(); });
afterEach(async () => { await context.cleanup(); });

it('should track errors', async () => {
  const { worker, sentryMock } = context;
  worker.setHandler(async () => { throw new Error('fail'); });
  worker.createJob('job-1', {});
  await waitForEvent(worker, 'job:failed');
  assert.equal(sentryMock.events.length, 1);
});
```

### In-Memory Database

```typescript
import { initDatabase } from '../../sidequest/core/database.ts';
import { saveJob } from '../../sidequest/core/job-repository.ts';

before(() => { initDatabase(':memory:'); });
```

### Temp Repository Lifecycle

```typescript
let repos;
beforeEach(async () => { repos = await createMultipleTempRepositories(3); });
afterEach(async () => { await cleanupRepositories(repos); });
```

## SidequestServer Event Model

Tests must follow the server's event-driven lifecycle:

```
createJob() → job:created → queue processing → job:started → runJobHandler()
  ├── success → job:completed
  └── failure → job:failed → retryable? → retry:created → re-queue
                                        → retry:max-attempts → end
```

- Jobs process automatically on creation (no `start()` method)
- Override `runJobHandler()` (not `handleJob`)
- No `stop()` — use `cleanup()` in `afterEach`

## Timing Constants

`tests/constants/timing-test-constants.ts` provides `TestTiming`:
- `DEFAULT_WAIT_TIMEOUT_MS` — maps to `TIMEOUTS.SHORT_MS` (5000ms)
- `JOB_COMPLETION_OFFSET_MS` — job completion polling window

## CI Considerations

- Sentry disabled in tests via `sentryDsn: null` in TestWorker defaults
- `SKIP_ENV_SENSITIVE_TESTS=1` for sandboxed CI environments
- Integration tests run serially to avoid port/resource conflicts
- Temp repositories use operation tracking to prevent cleanup races

---

**Updated:** 2026-03-14 | **Version:** 2.3.20

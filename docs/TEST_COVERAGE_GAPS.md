# Test Coverage Gaps — Implementation Plan

**Created:** 2026-03-09
**Status:** Ready for implementation
**Estimated new tests:** 34

---

## Background

796+ tests across `tests/unit/`, `tests/integration/`, co-located `*.test.ts` files.
Key recent changes (SC-M1–SC-M9, SCR series, H-series API routes) shipped without
dedicated unit tests for the newly introduced validation logic, guard conditions, and
security helpers. All items below are confirmed untested gaps.

**Test runner:** Node.js built-in (`node:test` + `node:assert`)
**TypeScript execution:** `--strip-types`
**Run:** `npm test` (unit), `npm run test:integration`, `npm run test:all:core`

---

## Priority 1 — Critical

### TC-C1: `_trySilentPersist` error logging and Sentry capture (SC-H1)

**File under test:** `sidequest/core/server.ts`
**Test file:** `tests/unit/server-unit.test.ts` — new `describe` block

**What to test:**
- When `_persistJob` throws, `_trySilentPersist` calls `logError` and `Sentry.captureException`
- Sentry call receives `tags: { jobId, operation: \`persist_${context}\` }`
- Job lifecycle is NOT interrupted (error swallowed, not rethrown)
- Covers each `PERSIST_CONTEXT` value: `create`, `started`, `retry_queued`, `failed`

**Pattern:** `tests/unit/server-unit.test.ts` `TestSidequestServer` subclass pattern.

```typescript
describe('SidequestServer - _trySilentPersist', () => {
  it('should call Sentry.captureException when _persistJob throws', () => {
    const server = new TestSidequestServer({ autoStart: false });
    server._persistJob = () => { throw new Error('db write failed'); };
    const captured: unknown[] = [];
    const origCapture = Sentry.captureException;
    Sentry.captureException = (e: unknown) => { captured.push(e); };
    assert.doesNotThrow(() => server.createJob('job-1', {}));
    assert.strictEqual(captured.length, 1);
    Sentry.captureException = origCapture;
  });

  it('should not rethrow — job lifecycle continues after persist failure', async () => {
    // confirm job:created event still fires after _persistJob throws
  });
});
```

**Estimated tests:** 4

---

### TC-C2: `_queueDraining` re-entrancy guard (SC-H2)

**File under test:** `sidequest/core/server.ts`
**Test file:** `tests/unit/server-unit.test.ts` — new `describe` block

**What to test:**
- Second concurrent `processQueue` call returns early while `_queueDraining === true`
- Guard is released in `finally` even when an error occurs
- After guard is released, subsequent `processQueue` proceeds normally

**Pattern:** Existing `processQueue` tests (lines 176–212) — uses `autoStart: false`.

```typescript
describe('SidequestServer - _queueDraining guard', () => {
  it('should not re-enter processQueue while draining is in progress', async () => {
    const server = new TestSidequestServer({ autoStart: false, maxConcurrent: 1 });
    server.createJob('job-1', {});
    server.isRunning = true;
    const [p1, p2] = [server.processQueue(), server.processQueue()];
    await Promise.all([p1, p2]);
    assert.ok(server.activeJobs <= 1);
  });

  it('should release _queueDraining guard in finally even when handler throws', async () => {
    // After exception in the while loop body, _queueDraining must be false
  });
});
```

**Estimated tests:** 3

---

## Priority 2 — High

### TC-H1: `createJob` validates `JOB_ID_PATTERN`; `_writeJobLog` sanitizes filename (SC-M5)

**File under test:** `sidequest/core/server.ts`
**Test file:** `tests/unit/server-unit.test.ts` — new `describe` blocks

**What to test:**
- `createJob` throws when ID fails `JOB_ID_PATTERN` (path traversal, spaces)
- `createJob` accepts IDs at exactly 100 chars
- `_writeJobLog` writes file with sanitized filename (unsafe chars → `_`)

```typescript
describe('SidequestServer - createJob ID validation', () => {
  it('should throw for job IDs that fail JOB_ID_PATTERN', () => {
    const server = new TestSidequestServer();
    assert.throws(() => server.createJob('../bad-id', {}), /Invalid job ID/);
    assert.throws(() => server.createJob('id with spaces', {}), /Invalid job ID/);
  });

  it('should accept job ID at exactly 100 chars', () => {
    const server = new TestSidequestServer();
    assert.doesNotThrow(() => server.createJob('a'.repeat(100), {}));
  });
});
```

**Estimated tests:** 5

---

### TC-H2: `timingSafeEqual` padding and length-leak prevention (H4)

**File under test:** `api/routes/jobs.ts` (internal helper)
**Test file:** `tests/unit/input-validation.test.ts` — new `describe` block

**Prerequisite:** Extract `timingSafeEqual` to `api/utils/crypto-helpers.ts` and export it.

**What to test:**
- Returns `true` for identical strings
- Returns `false` for same-length strings with different content
- Returns `false` for different-length strings
- Returns `false` for non-string inputs

```typescript
import { timingSafeEqual } from '../../api/utils/crypto-helpers.ts';

describe('timingSafeEqual', () => {
  it('returns true for identical strings', () => assert.ok(timingSafeEqual('abc', 'abc')));
  it('returns false for same-length different content', () => assert.ok(!timingSafeEqual('key-aaa', 'key-bbb')));
  it('returns false for different lengths', () => assert.ok(!timingSafeEqual('short', 'longer-key')));
  it('returns false for non-string inputs', () => assert.ok(!timingSafeEqual(null as any, 'key')));
});
```

**Estimated tests:** 5

---

### TC-H3: `RESERVED_JOB_KEYS` strips injection on retry (H-series)

**File under test:** `api/routes/jobs.ts`
**Test file:** `tests/unit/input-validation.test.ts` — new `describe` block

**Prerequisite:** Extract key-filtering loop to `api/utils/job-helpers.ts` as `filterReservedJobKeys(jobData)`.

**What to test:**
- All four reserved keys (`retriedFrom`, `triggeredBy`, `triggeredAt`, `retryCount`) stripped
- Non-reserved keys pass through unchanged
- Empty input handled

```typescript
import { filterReservedJobKeys } from '../../api/utils/job-helpers.ts';

describe('filterReservedJobKeys', () => {
  it('should strip all four reserved keys', () => {
    const result = filterReservedJobKeys({
      repositoryPath: '/repo',
      retriedFrom: 'job-old',
      triggeredBy: 'retry',
      triggeredAt: '2026-01-01',
      retryCount: 3,
    });
    assert.ok(!('retriedFrom' in result));
    assert.ok(!('triggeredBy' in result));
    assert.ok(!('triggeredAt' in result));
    assert.ok(!('retryCount' in result));
    assert.strictEqual((result as any).repositoryPath, '/repo');
  });
});
```

**Estimated tests:** 5

---

## Priority 3 — Medium

### TC-M1: `getFileAgeDays` uses `TIMEOUTS.ONE_DAY_MS` constant (SCR-M2)

**File under test:** `scripts/cleanup-error-logs.ts`
**Test file:** `tests/unit/cleanup-error-logs.test.ts` — **new file**

**What to test:**
- File created just now has age < 1 day
- File with `mtime` 8 days ago exceeds 7-day retention threshold
- `TIMEOUTS.ONE_DAY_MS` equals `TIME_MS.DAY * 1000` (regression guard)

**Pattern:** `tests/unit/database.test.ts` — `fs.mkdtempSync` + `afterEach` cleanup.
Use `fs.utimes` to manipulate file `mtime`.

**Estimated tests:** 4

---

### TC-M2: `bulkImportJobs` `git` field JSON validation (SC-M2 completeness)

**File under test:** `sidequest/core/database.ts`
**Test file:** `tests/unit/database.test.ts` — one additional `it`

**What to test:**
- A `git` field that is a non-JSON string is rejected with `'git'` in the error message
  (parallel to existing `result` field test)

**Note:** SC-M1 (filename truncation), SC-M2 (bulkImportJobs), and SC-M8 (saveJob) already
have tests in `database.test.ts`. This adds one missing edge case.

**Estimated tests:** 1

---

### TC-M3: `scanErrorLogs` file-filter and recursion behavior (SCR-M2 supporting)

**File under test:** `scripts/cleanup-error-logs.ts`
**Test file:** `tests/unit/cleanup-error-logs.test.ts` — same new file as TC-M1

**What to test:**
- Only `.error.json` files collected; `.json` and `.txt` skipped
- Nested subdirectories are recursed into
- Empty directory returns empty array

**Estimated tests:** 4

---

### TC-M4: Route-level pagination wiring for `sanitizePaginationParams` (H-series)

**File under test:** `api/routes/jobs.ts` — route handler wiring
**Test file:** `tests/unit/input-validation.test.ts` — new `describe` block

**What to test:**
- Route passes sanitized limit/offset to `jobRepository.getJobs`
- Out-of-range values are clamped before reaching the repository

**Pattern:** `tests/unit/validation.test.ts` `createMocks` req/res pattern.

**Estimated tests:** 3

---

## Implementation Order

| Step | ID | File | Action | Tests |
|------|----|------|--------|-------|
| 1 | TC-M2 | `tests/unit/database.test.ts` | Add 1 `it` to `bulkImportJobs` block | 1 |
| 2 | TC-C2 | `tests/unit/server-unit.test.ts` | Add `_queueDraining` describe block | 3 |
| 3 | TC-C1 | `tests/unit/server-unit.test.ts` | Add `_trySilentPersist` describe block | 4 |
| 4 | TC-H1 | `tests/unit/server-unit.test.ts` | Add `createJob` validation + `_writeJobLog` tests | 5 |
| 5 | TC-H2 | Extract `timingSafeEqual` → `api/utils/crypto-helpers.ts`; add tests | 5 |
| 6 | TC-H3 | Extract `filterReservedJobKeys` → `api/utils/job-helpers.ts`; add tests | 5 |
| 7 | TC-M1 | `tests/unit/cleanup-error-logs.test.ts` | New file: `getFileAgeDays` tests | 4 |
| 8 | TC-M3 | `tests/unit/cleanup-error-logs.test.ts` | Add `scanErrorLogs` filter/recursion tests | 4 |
| 9 | TC-M4 | `tests/unit/input-validation.test.ts` | Add pagination route-wiring mock tests | 3 |

**Total:** 34 net-new tests

---

## Refactoring Prerequisites (Steps 5–6)

Two small extractions make internal logic testable without a full Express server:

1. **`timingSafeEqual`** — extract from `api/routes/jobs.ts` to `api/utils/crypto-helpers.ts`, export, re-import in `jobs.ts`
2. **`filterReservedJobKeys`** — extract key-filtering loop from `api/routes/jobs.ts` to `api/utils/job-helpers.ts`, export, re-import

Both are pure refactors (no logic change). Run `npm run typecheck && npm test` after each.

---

## Testing Infrastructure Notes

- Use `:memory:` SQLite (`initDatabase(':memory:')`) for database tests — see `tests/unit/database.test.ts:31`
- Use `createTempRepository` from `tests/fixtures/test-helpers.ts` for FS-bound tests
- Sentry mock: import `@sentry/node` before SUT, replace `Sentry.captureException` with spy in test body, restore in `afterEach`
- File `mtime` manipulation: `fs.utimes(path, accessTime, modTime)` accepts `Date` objects

---

## Verification

```bash
npm test                   # All unit tests pass
npm run typecheck          # No TS errors from extractions
npm run test:all:core      # Full core suite clean
```

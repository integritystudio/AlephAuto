# Code Quality Refactor - Task Checklist

**Last Updated:** 2026-01-29
**Status:** In Progress

## Progress Overview

| Phase | Status | Tasks | Completed |
|-------|--------|-------|-----------|
| Phase 1: Quick Wins | Complete | 2 | 2 |
| Phase 2: Constants & Types | Complete | 2 | 2 |
| Phase 3: Database Abstraction | In Progress | 2 | 1 |
| Phase 4: Server Decomposition | Not Started | 3 | 0 |
| Phase 5: API Decoupling | In Progress | 2 | 1 |
| **Total** | | **11** | **6** |

---

## Pre-Work (Completed)

- [x] Code review completed (2026-01-29)
- [x] Remove duplicate pipeline name mapping (2026-01-29, commit: 56d6e09)

---

## Phase 1: Quick Wins

### 1.1 Remove Dead Code from Worker Registry ✅
**Effort:** S | **Risk:** Low | **Dependencies:** None

- [x] Remove commented `TestRefactorWorker` import (line 17)
- [x] Remove commented code block (lines 162-170)
- [x] Run tests: `npm test`
- [x] Commit changes (32a5674)

**Files:** `api/utils/worker-registry.js`

---

### 1.2 Standardize Async Patterns ✅
**Effort:** M | **Risk:** Low | **Dependencies:** None

- [x] Audit Sentry.startSpan calls in server.js
- [x] Convert callback style to async/await - **N/A: already using async/await**
- [x] Remove unnecessary promise chaining - **N/A: single .catch() is intentional fire-and-forget**
- [x] Verified: Sentry v8 API pattern is correct
- **Result:** No changes needed - patterns already consistent

**Files:** `sidequest/core/server.js`

---

## Phase 2: Constants & Types

### 2.1 Create Constants Module ✅
**Effort:** M | **Risk:** Low | **Dependencies:** None

- [x] Create `sidequest/core/constants.js`
- [x] Define TIMEOUTS object:
  - [x] `PYTHON_PIPELINE_MS: 600000`
  - [x] `DATABASE_SAVE_INTERVAL_MS: 30000`
- [x] Define RETRY object:
  - [x] `MAX_ABSOLUTE_ATTEMPTS: 5`
- [x] Define CONCURRENCY object:
  - [x] `DEFAULT_MAX_JOBS: 5`
- [x] Update `scan-orchestrator.ts:505`
- [x] Update `duplicate-detection-worker.js:30`
- [x] Update `database.js:76`
- [x] Update `server.js:22`
- [x] Run tests: `npm test`
- [x] Commit changes (178583d)

---

### 2.2 Create JobStatus Type ✅
**Effort:** S | **Risk:** Low | **Dependencies:** None

- [x] Create `api/types/job-status.ts`
- [x] Define JobStatus enum: QUEUED, RUNNING, COMPLETED, FAILED, CANCELLED, PAUSED
- [x] Export validation helper function (isValidJobStatus, isTerminalStatus)
- [ ] Update imports where status is compared - **Deferred: gradual adoption**
- [x] Run: `npm run typecheck` - file compiles clean
- [x] Run tests: `npm test`
- [x] Commit changes (cdaed2e)

---

## Phase 3: Database Abstraction

### 3.1 Create JobRepository ✅
**Effort:** L | **Risk:** Medium | **Dependencies:** 2.2

- [x] Create `sidequest/core/job-repository.js`
- [x] Implement `saveJob(job)`
- [x] Implement `getJob(id)`
- [x] Implement `getJobs(filters)` - delegates to database.js
- [x] Implement `getJobCounts(pipelineId)`
- [x] Implement `getLastJob(pipelineId, status)`
- [x] Implement `bulkImport(jobs)`
- [ ] Write unit tests for JobRepository - **Deferred: test during migration**
- [x] Run tests: `npm test`
- [x] Commit changes (9976810)

---

### 3.2 Migrate to JobRepository
**Effort:** M | **Risk:** Medium | **Dependencies:** 3.1

- [ ] Update `api/server.js`
- [ ] Update `api/routes/jobs.js`
- [ ] Update `api/routes/pipelines.ts`
- [ ] Update `sidequest/core/server.js`
- [ ] Update `api/utils/worker-registry.js`
- [ ] Verify no direct database imports remain (except repository)
- [ ] Run tests: `npm test && npm run test:integration`
- [ ] Commit changes

---

## Phase 4: Server Decomposition

### 4.1 Extract GitWorkflowManager
**Effort:** L | **Risk:** Medium | **Dependencies:** None

- [ ] Create `sidequest/core/git-workflow-manager.js`
- [ ] Move `_handleGitWorkflowSuccess()` method
- [ ] Move `_setupGitWorkflow()` method
- [ ] Move git-related event handlers
- [ ] Update SidequestServer to use GitWorkflowManager
- [ ] Verify git workflow feature flags work
- [ ] Run tests: `npm test && npm run test:integration`
- [ ] Commit changes

---

### 4.2 Extract JobExecutor
**Effort:** XL | **Risk:** High | **Dependencies:** 4.1, 3.2

- [ ] Create `sidequest/core/job-executor.js`
- [ ] Extract `executeJob()` method
- [ ] Break into smaller methods:
  - [ ] `_prepareJobExecution()`
  - [ ] `_runJobHandler()`
  - [ ] `_handleJobSuccess()`
  - [ ] `_handleJobFailure()`
- [ ] Maintain Sentry span integration
- [ ] Update SidequestServer to use JobExecutor
- [ ] Write unit tests for JobExecutor
- [ ] Run tests: `npm test && npm run test:integration`
- [ ] Commit changes

---

### 4.3 Simplify SidequestServer
**Effort:** M | **Risk:** Medium | **Dependencies:** 4.1, 4.2

- [ ] Remove extracted code from server.js
- [ ] Add dependency injection in constructor
- [ ] Verify SidequestServer < 400 lines
- [ ] Verify no methods > 50 lines
- [ ] Update any remaining tight couplings
- [ ] Run tests: `npm test && npm run test:integration`
- [ ] Commit changes

---

## Phase 5: API Decoupling

### 5.1 Add WorkerRegistry Stats ✅
**Effort:** M | **Risk:** Low | **Dependencies:** None

- [x] Add `getAllStats()` method to WorkerRegistry
- [x] Add `getWorkerStats(pipelineId)` and `getScanMetrics(pipelineId)` helpers
- [x] Aggregate stats from all registered workers
- [x] Update `/api/status` to use `WorkerRegistry.getAllStats()`
- [x] Remove direct worker import from `api/server.js`
- [x] Run tests: `npm test`
- [x] Commit changes (0c3b0be)

---

### 5.2 Refactor ScanOrchestrator Error Handling
**Effort:** L | **Risk:** Medium | **Dependencies:** 2.1

- [ ] Create `sidequest/pipeline-core/python-process-manager.ts`
- [ ] Extract Python subprocess handling
- [ ] Make timeout configurable via constructor
- [ ] Add explicit timeout handling
- [ ] Reduce nesting depth in error handling
- [ ] Run tests: `npm test`
- [ ] Commit changes

---

## Final Verification

- [ ] All tests pass: `npm test && npm run test:integration`
- [ ] TypeScript compiles: `npm run typecheck`
- [ ] No files > 400 lines
- [ ] No functions > 50 lines
- [ ] Manual smoke test: dashboard and API
- [ ] Update CLAUDE.md with any new patterns

---

## Notes

_Use this section to track blockers, questions, or discoveries during implementation._

### Blockers
- None currently

### Questions
- None currently

### Discoveries
- None currently

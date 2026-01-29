# Code Quality Refactor Plan

**Last Updated:** 2026-01-29
**Status:** Planning
**Priority:** High
**Estimated Effort:** XL (4-6 weeks)

## Executive Summary

Address technical debt and code quality issues identified during code review. The refactoring focuses on improving modularity, maintainability, and reducing code smells while preserving existing functionality. The goal is to achieve maintainability score of 8.5+/10 (from current 7/10) and modularity score of 8+/10 (from current 6/10).

## Current State Analysis

### Metrics (Pre-Refactor)
| Metric | Current | Target |
|--------|---------|--------|
| Modularity Score | 6/10 | 8/10 |
| Maintainability Score | 7/10 | 8.5/10 |
| Largest File (server.js) | 781 lines | <400 lines |
| Largest File (scan-orchestrator.ts) | 762 lines | <400 lines |
| Code Duplication | 2+ locations | 0 |

### Issues by Severity

#### Critical (3)
1. ~~Duplicate pipeline name mapping~~ - **COMPLETED** (2026-01-29)
2. God class: SidequestServer (781 lines, executeJob() 192 lines)
3. Tight coupling: API server directly imports worker for stats

#### High Priority (3)
4. Inconsistent error handling in ScanOrchestrator
5. Magic numbers throughout codebase (timeouts, retries, intervals)
6. Inappropriate intimacy: 5+ modules directly import database functions

#### Medium Priority (4)
7. Overly complex configuration (35+ flat options)
8. Primitive obsession: Job status as strings without type safety
9. Inconsistent async patterns (mix of async/await and callbacks)
10. Dead/commented code in worker-registry.js

## Proposed Future State

### Architecture Improvements

```
BEFORE:
┌─────────────────────────────────────────────────┐
│ SidequestServer (781 lines)                     │
│ - Job queue management                          │
│ - Git workflow                                  │
│ - Database persistence                          │
│ - Sentry logging                                │
│ - File logging                                  │
│ - Event broadcasting                            │
│ - Lifecycle management                          │
└─────────────────────────────────────────────────┘

AFTER:
┌──────────────────────┐  ┌──────────────────────┐
│ SidequestServer      │  │ GitWorkflowManager   │
│ (~350 lines)         │  │ (~150 lines)         │
│ - Job queue mgmt     │  │ - Branch creation    │
│ - Lifecycle          │  │ - PR workflow        │
│ - Event coordination │  │ - Commit management  │
└──────────────────────┘  └──────────────────────┘
           │                        │
           ▼                        ▼
┌──────────────────────┐  ┌──────────────────────┐
│ JobRepository        │  │ JobExecutor          │
│ (~100 lines)         │  │ (~200 lines)         │
│ - CRUD operations    │  │ - executeJob()       │
│ - Query interface    │  │ - Error handling     │
│ - Transaction mgmt   │  │ - Retry logic        │
└──────────────────────┘  └──────────────────────┘
```

### New Modules to Create
1. `sidequest/core/git-workflow-manager.js` - Git operations extracted from server.js
2. `sidequest/core/job-repository.js` - Database abstraction layer
3. `sidequest/core/job-executor.js` - Job execution logic
4. `sidequest/core/constants.js` - Magic numbers → named constants
5. `api/types/job-status.ts` - Type-safe job status enum

---

## Implementation Phases

### Phase 1: Quick Wins (Week 1)
Low-risk changes that improve code quality immediately.

### Phase 2: Constants & Types (Week 1-2)
Extract magic numbers and add type safety.

### Phase 3: Database Abstraction (Week 2-3)
Introduce JobRepository pattern.

### Phase 4: SidequestServer Decomposition (Week 3-5)
Break down the God class into focused modules.

### Phase 5: API Decoupling (Week 5-6)
Remove tight coupling between API and workers.

---

## Detailed Tasks

### Phase 1: Quick Wins

#### 1.1 Remove Dead Code from Worker Registry
**Effort:** S
**Risk:** Low
**Dependencies:** None

**Description:** Remove commented imports and code blocks in worker-registry.js

**Acceptance Criteria:**
- [ ] Remove commented `TestRefactorWorker` import (line 17)
- [ ] Remove commented code block (lines 162-170)
- [ ] All existing tests pass
- [ ] No runtime errors

**Files:**
- `api/utils/worker-registry.js`

---

#### 1.2 Standardize Async Patterns in Server
**Effort:** M
**Risk:** Low
**Dependencies:** None

**Description:** Convert callback-style Sentry spans to async/await for consistency

**Acceptance Criteria:**
- [ ] All Sentry.startSpan calls use async/await pattern
- [ ] Remove promise chaining where async/await is cleaner
- [ ] All tests pass
- [ ] No changes to external behavior

**Files:**
- `sidequest/core/server.js`

---

### Phase 2: Constants & Types

#### 2.1 Create Constants Module
**Effort:** M
**Risk:** Low
**Dependencies:** None

**Description:** Extract all magic numbers into named constants

**Acceptance Criteria:**
- [ ] Create `sidequest/core/constants.js`
- [ ] Extract timeout values (PYTHON_PIPELINE_TIMEOUT_MS: 600000)
- [ ] Extract retry values (MAX_ABSOLUTE_RETRIES: 5)
- [ ] Extract intervals (DATABASE_SAVE_INTERVAL_MS: 30000)
- [ ] Extract concurrency (DEFAULT_MAX_CONCURRENT_JOBS: 5)
- [ ] Update all files to import from constants
- [ ] All tests pass

**Files to Update:**
- `sidequest/pipeline-core/scan-orchestrator.ts:505`
- `sidequest/workers/duplicate-detection-worker.js:30`
- `sidequest/core/database.js:76`
- `sidequest/core/server.js:22`

---

#### 2.2 Create JobStatus Type
**Effort:** S
**Risk:** Low
**Dependencies:** None

**Description:** Replace string literals with type-safe enum

**Acceptance Criteria:**
- [ ] Create `api/types/job-status.ts` with JobStatus enum
- [ ] Export type and validation helper
- [ ] Update server.js status comparisons to use enum
- [ ] TypeScript compiler passes
- [ ] All tests pass

**Files:**
- `api/types/job-status.ts` (new)
- `sidequest/core/server.js` (update)

---

### Phase 3: Database Abstraction

#### 3.1 Create JobRepository Interface
**Effort:** L
**Risk:** Medium
**Dependencies:** 2.2 (JobStatus type)

**Description:** Abstract database access behind repository pattern

**Acceptance Criteria:**
- [ ] Create `sidequest/core/job-repository.js`
- [ ] Implement methods: saveJob, getJob, getJobs, getJobCounts, getLastJob, bulkImport
- [ ] Add query builder for filtering (status, pipeline, date range)
- [ ] Maintain backward compatibility with existing database.js
- [ ] All integration tests pass

**Interface:**
```javascript
class JobRepository {
  async saveJob(job) { }
  async getJob(id) { }
  async getJobs(filters) { }
  async getJobCounts(pipelineId) { }
  async getLastJob(pipelineId, status) { }
  async bulkImport(jobs) { }
}
```

**Files:**
- `sidequest/core/job-repository.js` (new)
- `sidequest/core/database.js` (refactor)

---

#### 3.2 Migrate Consumers to JobRepository
**Effort:** M
**Risk:** Medium
**Dependencies:** 3.1

**Description:** Update all direct database imports to use JobRepository

**Acceptance Criteria:**
- [ ] Update `api/server.js` to use JobRepository
- [ ] Update `api/routes/jobs.js` to use JobRepository
- [ ] Update `api/routes/pipelines.ts` to use JobRepository
- [ ] Update `sidequest/core/server.js` to use JobRepository
- [ ] Remove direct database imports from consumer modules
- [ ] All integration tests pass

---

### Phase 4: SidequestServer Decomposition

#### 4.1 Extract GitWorkflowManager
**Effort:** L
**Risk:** Medium
**Dependencies:** None

**Description:** Extract Git workflow logic from SidequestServer

**Acceptance Criteria:**
- [ ] Create `sidequest/core/git-workflow-manager.js`
- [ ] Move `_handleGitWorkflowSuccess()` and related methods
- [ ] Move `BranchManager` integration
- [ ] SidequestServer delegates to GitWorkflowManager
- [ ] Git workflow feature flags still work
- [ ] All git-related tests pass

**Methods to Extract:**
- `_handleGitWorkflowSuccess()` (71 lines)
- `_setupGitWorkflow()`
- Git-related event handlers

---

#### 4.2 Extract JobExecutor
**Effort:** XL
**Risk:** High
**Dependencies:** 4.1, 3.2

**Description:** Extract job execution logic from SidequestServer

**Acceptance Criteria:**
- [ ] Create `sidequest/core/job-executor.js`
- [ ] Move `executeJob()` method (192 lines)
- [ ] Break into smaller methods:
  - `_prepareJobExecution()`
  - `_runJobHandler()`
  - `_handleJobSuccess()`
  - `_handleJobFailure()`
- [ ] Maintain Sentry span integration
- [ ] Error classification still works
- [ ] All job execution tests pass

---

#### 4.3 Simplify SidequestServer
**Effort:** M
**Risk:** Medium
**Dependencies:** 4.1, 4.2

**Description:** Refactor SidequestServer to coordinate extracted modules

**Acceptance Criteria:**
- [ ] SidequestServer < 400 lines
- [ ] Clear separation of concerns
- [ ] Constructor accepts injected dependencies
- [ ] Event coordination remains in SidequestServer
- [ ] All existing tests pass
- [ ] No changes to public API

---

### Phase 5: API Decoupling

#### 5.1 Add Stats Method to WorkerRegistry
**Effort:** M
**Risk:** Low
**Dependencies:** None

**Description:** Remove direct worker coupling in API server

**Acceptance Criteria:**
- [ ] Add `WorkerRegistry.getAllStats()` method
- [ ] Returns aggregated stats from all registered workers
- [ ] Update `/api/status` endpoint to use registry
- [ ] Remove direct worker import from `api/server.js`
- [ ] API tests pass

**Files:**
- `api/utils/worker-registry.js`
- `api/server.js`

---

#### 5.2 Refactor ScanOrchestrator Error Handling
**Effort:** L
**Risk:** Medium
**Dependencies:** 2.1 (constants)

**Description:** Simplify Python subprocess handling

**Acceptance Criteria:**
- [ ] Extract `PythonProcessManager` class
- [ ] Make timeout configurable via constructor
- [ ] Add explicit timeout handling (not signal detection)
- [ ] Reduce nesting depth in error handling
- [ ] All scan-orchestrator tests pass

**Files:**
- `sidequest/pipeline-core/scan-orchestrator.ts`
- `sidequest/pipeline-core/python-process-manager.ts` (new)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing functionality | Medium | High | Comprehensive test coverage before refactoring |
| Introducing new bugs | Medium | Medium | Incremental changes with tests at each step |
| Performance regression | Low | Medium | Benchmark critical paths before/after |
| Scope creep | Medium | Low | Strict adherence to task acceptance criteria |
| Merge conflicts | Medium | Low | Small, frequent PRs; communicate with team |

## Success Metrics

1. **Code Quality**
   - [ ] Modularity score: 8+/10
   - [ ] Maintainability score: 8.5+/10
   - [ ] No files > 400 lines
   - [ ] No functions > 50 lines
   - [ ] Cyclomatic complexity ≤ 10 for all functions

2. **Test Coverage**
   - [ ] Maintain or improve current coverage
   - [ ] New modules have >80% coverage

3. **Performance**
   - [ ] No regression in job execution time
   - [ ] No regression in API response time

## Required Resources

- **Time:** 4-6 weeks (part-time)
- **Testing:** Integration test suite must pass at each phase
- **Review:** Code review for each PR

## Dependencies

- Existing test suite must be reliable
- No concurrent major refactoring efforts
- Database schema remains stable

# Code Quality Refactor - Context

**Last Updated:** 2026-01-29

## Key Files

### Primary Targets (Refactoring)

| File | Lines | Issue | Target |
|------|-------|-------|--------|
| `sidequest/core/server.js` | 781 | God class, mixed responsibilities | <400 lines |
| `sidequest/pipeline-core/scan-orchestrator.ts` | 762 | Long methods, complex error handling | <400 lines |
| `api/server.js` | 368 | Tight coupling to worker | Decouple |
| `sidequest/core/database.js` | ~200 | Direct imports everywhere | Repository pattern |
| `sidequest/core/config.js` | 184 | 35+ flat options | Grouped config |

### Files to Create

| File | Purpose |
|------|---------|
| `sidequest/core/constants.js` | Named constants for magic numbers |
| `sidequest/core/job-repository.js` | Database abstraction layer |
| `sidequest/core/git-workflow-manager.js` | Git operations extracted from server |
| `sidequest/core/job-executor.js` | Job execution logic |
| `sidequest/pipeline-core/python-process-manager.ts` | Python subprocess handling |
| `api/types/job-status.ts` | Type-safe job status enum |

### Files with Direct Database Imports (to update)

1. `api/server.js` - `initDatabase`, `getAllPipelineStats`, `closeDatabase`
2. `api/routes/jobs.js` - `getAllJobs`, `bulkImportJobs`
3. `api/routes/pipelines.ts` - `getJobs`
4. `sidequest/core/server.js` - `saveJob`, `getJobCounts`, `getLastJob`, `initDatabase`
5. `api/utils/worker-registry.js` - `closeDatabase`

---

## Key Decisions

### Decision 1: Repository Pattern vs Direct Refactor
**Chosen:** Repository Pattern
**Rationale:** Provides clean abstraction, enables future database swaps, improves testability

### Decision 2: Extraction Strategy for SidequestServer
**Chosen:** Incremental extraction (Git workflow → Job executor → Simplify)
**Rationale:** Lower risk than big-bang refactor, allows testing at each step

### Decision 3: Constants Organization
**Chosen:** Single constants.js file with grouped exports
**Rationale:** Simple, low overhead, easy to find all constants

```javascript
// Preferred structure
export const TIMEOUTS = { ... };
export const RETRY = { ... };
export const CONCURRENCY = { ... };
```

### Decision 4: JobStatus Implementation
**Chosen:** TypeScript enum with runtime validation
**Rationale:** Type safety at compile time, validation at runtime for JS consumers

---

## Dependencies Map

```
Phase 1: Quick Wins
  └── No dependencies

Phase 2: Constants & Types
  ├── 2.1 Constants → No dependencies
  └── 2.2 JobStatus → No dependencies

Phase 3: Database Abstraction
  ├── 3.1 JobRepository → 2.2 (JobStatus)
  └── 3.2 Migrate Consumers → 3.1

Phase 4: SidequestServer Decomposition
  ├── 4.1 GitWorkflowManager → No dependencies
  ├── 4.2 JobExecutor → 4.1, 3.2
  └── 4.3 Simplify Server → 4.1, 4.2

Phase 5: API Decoupling
  ├── 5.1 WorkerRegistry Stats → No dependencies
  └── 5.2 ScanOrchestrator → 2.1 (constants)
```

---

## Code Patterns to Follow

### Existing Patterns (Maintain Consistency)

**Logging:**
```javascript
import { createComponentLogger } from '../utils/logger.js';
const logger = createComponentLogger('ComponentName');
logger.info({ context }, 'Message');
```

**Error Handling:**
```javascript
import { classifyError } from '../pipeline-core/errors/error-classifier.js';
const classification = classifyError(error);
```

**Zod Validation:**
```typescript
export const MySchema = z.object({ ... });
export type MyType = z.infer<typeof MySchema>;
```

**Event Emission:**
```javascript
this.emit('jobCompleted', { jobId, results });
```

### New Patterns to Introduce

**Repository Pattern:**
```javascript
class JobRepository {
  constructor(database) {
    this.db = database;
  }

  async getJobs(filters = {}) {
    // Query builder pattern
  }
}
```

**Dependency Injection:**
```javascript
class SidequestServer extends EventEmitter {
  constructor(options = {}) {
    this.jobRepository = options.jobRepository ?? new JobRepository();
    this.gitWorkflow = options.gitWorkflow ?? new GitWorkflowManager();
  }
}
```

---

## Testing Strategy

### Before Each Phase
1. Run full test suite: `npm test && npm run test:integration`
2. Note any flaky tests to exclude from regression tracking

### During Refactoring
1. Write tests for new modules before implementation
2. Maintain existing tests as behavioral contracts
3. Add integration tests for module interactions

### After Each Phase
1. Full test suite must pass
2. Manual smoke test of dashboard and API
3. Performance spot check (job execution time)

---

## Rollback Plan

Each phase should be independently deployable and reversible.

**Phase 1-2:** Pure additions, no rollback needed
**Phase 3:** Keep database.js functional, repository is wrapper
**Phase 4:** Feature flag for new vs old code paths if needed
**Phase 5:** Can revert individual PRs

---

## Reference: Current SidequestServer Responsibilities

```
SidequestServer (781 lines)
├── Constructor & Initialization (lines 1-50)
├── Queue Management (lines 51-150)
│   ├── createJob()
│   ├── processQueue()
│   └── pauseQueue() / resumeQueue()
├── Job Execution (lines 150-350) ← EXTRACT to JobExecutor
│   ├── executeJob() - 192 lines!
│   └── _updateJobProgress()
├── Git Workflow (lines 350-450) ← EXTRACT to GitWorkflowManager
│   ├── _handleGitWorkflowSuccess()
│   └── Git event handlers
├── Error Handling (lines 450-550)
│   ├── _handleJobError()
│   └── _shouldRetry()
├── Database Operations (lines 550-650) ← USE JobRepository
│   ├── _saveJob()
│   └── _loadJobs()
├── Event Handlers (lines 650-750)
│   └── Various lifecycle events
└── Utility Methods (lines 750-781)
```

---

## Completed Items

- [x] **2026-01-29:** Removed duplicate `getPipelineFriendlyName()` from `api/routes/jobs.js`
  - Commit: `56d6e09`
  - Now imports from `sidequest/utils/pipeline-names.js`

---

## Archive Notice

**Archived:** 2026-01-29
**Final Status:** ✅ All 11 tasks complete

All phases completed successfully:
- Phase 1: Quick Wins (2/2)
- Phase 2: Constants & Types (2/2)
- Phase 3: Database Abstraction (2/2)
- Phase 4: Server Decomposition (3/3)
- Phase 5: API Decoupling (2/2)

See `docs/SESSION_HISTORY.md` for full session details and commit history.

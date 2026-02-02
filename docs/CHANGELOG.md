# Changelog

All notable changes to AlephAuto are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [1.8.1] - 2026-01-30

### Summary
Expert code review using code-reviewer agent. Identified and fixed 28 issues across 4 categories. Implemented fixes in parallel using 10 concurrent agents.

### Added
- `api/utils/api-error.js` - Standardized error response utilities (`sendError`, `sendNotFoundError`)
- `tests/unit/input-validation.test.js` - 15 input validation tests
- `tests/unit/database-degraded-mode.test.js` - 12 degraded mode tests
- `tests/unit/job-repository-factory.test.js` - 15 factory function tests
- `getHealthStatus()` function in database.js for monitoring
- Database degraded mode with automatic recovery mechanism
- Emergency shutdown handler with proper resource cleanup
- Dynamic Python pipeline timeouts based on workload

### Changed
- Standardized API error format: `{ success, error: { code, message, details }, timestamp }`
- All routes now use `sendError()` utilities for consistent responses
- `sidequest/core/config.js` - Added `prDryRun`, `enablePRCreation`, `homeDir`
- `sidequest/core/constants.js` - Added `PAGINATION.MAX_LIMIT`, `VALIDATION.JOB_ID_PATTERN`, `PORT`
- Centralized `process.env` access through config module (H8)
- Standardized logging patterns with pino 'err' convention (H9)
- Added JobRepository factory function for testability (M1)
- Replaced magic numbers with named constants (M4)

### Fixed
- **C3:** Reduced `executeJob` complexity with cleaner state flow
- **C4:** Extracted deeply nested Python process handler into 4 focused methods
- **C5:** Database persistence failure handling - degraded mode with recovery
- **C6:** Worker registry race condition with atomic check-and-set

### Security
- **H5:** Job ID validation prevents path traversal and injection attacks
  - Added `VALIDATION.JOB_ID_PATTERN`: `/^[a-zA-Z0-9_-]{1,100}$/`
  - Blocks: `../etc/passwd`, `job;rm -rf /`, `<script>` injection
  - Applied to: `GET /api/jobs/:jobId`, `POST /api/jobs/:jobId/cancel`, `POST /api/jobs/:jobId/retry`
- **M7:** Pagination sanitization prevents memory exhaustion
  - `PAGINATION.MAX_LIMIT = 1000`
  - Handles NaN, negative values, Infinity

### Technical Details

#### Database Degraded Mode (C5)
When persistence fails 5 times consecutively:
1. Enters degraded mode - continues accepting writes to in-memory database
2. Alerts Sentry with error context
3. Attempts recovery with exponential backoff (5s, 10s, 20s... capped at 5 min)
4. After 10 failed recovery attempts, alerts Sentry and remains degraded
5. Provides `getHealthStatus()` for monitoring

#### Input Validation (H5, M7)
```javascript
// Job ID validation
function validateJobId(jobId) {
  if (!VALIDATION.JOB_ID_PATTERN.test(jobId)) {
    return { valid: false, error: 'Invalid job ID format' };
  }
  return { valid: true, sanitized: jobId };
}

// Pagination sanitization
function sanitizePaginationParams(limit, offset) {
  const limitNum = Math.min(Math.max(1, parsedLimit), PAGINATION.MAX_LIMIT);
  const offsetNum = Math.max(0, parsedOffset);
  return { limit: limitNum, offset: offsetNum };
}
```

---

## [1.8.0] - 2026-01-29

### Summary
Comprehensive code quality refactoring across 5 phases (11 tasks). Introduced new abstraction layers to improve modularity, reduce coupling, and establish patterns for future development.

### Added
- `sidequest/core/constants.js` - Centralized constants (TIMEOUTS, RETRY, CONCURRENCY)
- `sidequest/core/job-repository.js` - Database abstraction layer
- `sidequest/core/git-workflow-manager.js` - Git operations wrapper
- `api/types/job-status.ts` - Type-safe job status enum with validators
- `WorkerRegistry.getAllStats()` method for aggregated stats

### Changed
- **God Class Refactor:** `SidequestServer.executeJob` reduced from 190 → 31 lines
- Extracted `GitWorkflowManager` from SidequestServer
- Added helper methods: `_prepareJobExecution`, `_executeJobLogic`, `_handleJobSuccess`, `_handleJobFailure`
- Migrated core files from direct database.js imports to JobRepository
- Concurrency default changed 3 → 5 to match `CONCURRENCY.DEFAULT_MAX_JOBS`
- `tsconfig.json` - Exclude Cloudflare tunnel sync directories

### Fixed
- Orphaned `worker` reference in api/server.js after refactor
- Mismatched function signatures in job-repository.js and git-workflow-manager.js
- `api/routes/routes/pipelines.js` excluded from typecheck (Cloudflare tunnel sync file)

### Technical Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Database abstraction | Repository pattern | Clean interface, future DB swap, testability |
| SidequestServer extraction | Helper methods over full JobExecutor class | Preserves inheritance for workers |
| GitWorkflowManager scope | Operations only, not message generation | Allows workers to customize messages |
| Constants organization | Single file with grouped exports | Simple, discoverable, low overhead |

### Patterns Established
```javascript
// Database Access
import { jobRepository } from './sidequest/core/job-repository.js';
await jobRepository.saveJob(job);

// Constants
import { TIMEOUTS } from './sidequest/core/constants.js';
const timeout = TIMEOUTS.PYTHON_PIPELINE_MS;

// Git Operations (in SidequestServer subclasses)
this.gitWorkflowManager.createJobBranch(repoPath, jobInfo);

// Worker Stats
workerRegistry.getAllStats();
```

### Commits
```
56d6e09 - Remove duplicate getPipelineFriendlyName
32a5674 - Remove dead code from worker-registry
178583d - Create constants module
cdaed2e - Create JobStatus type
9976810 - Create JobRepository
88518fe - Migrate core files to JobRepository
891e9b0 - Extract GitWorkflowManager
858e576 - Break executeJob into helper methods
0c3b0be - Add WorkerRegistry stats methods
9b7533d - Fix TypeScript errors from refactoring
68b1e87 - Exclude Cloudflare tunnel sync files from typecheck
```

---

## Migration Notes

### From < 1.8.0

**Database Access:**
```javascript
// Before
import { saveJob } from './sidequest/core/database.js';

// After
import { jobRepository } from './sidequest/core/job-repository.js';
await jobRepository.saveJob(job);
```

**Magic Numbers:**
```javascript
// Before
const timeout = 600000;

// After
import { TIMEOUTS } from './sidequest/core/constants.js';
const timeout = TIMEOUTS.PYTHON_PIPELINE_MS;
```

**Git Operations:**
```javascript
// Before (in SidequestServer subclass)
this.branchManager.createJobBranch(repoPath, jobInfo);

// After
this.gitWorkflowManager.createJobBranch(repoPath, jobInfo);
```

### From < 1.8.1

**API Error Responses:**
```javascript
// Before
res.status(400).json({ error: 'Missing field' });

// After
import { sendError } from '../utils/api-error.js';
sendError(res, 'INVALID_REQUEST', 'Missing field', 400);
```

**Health Monitoring:**
```javascript
import { getHealthStatus } from './sidequest/core/database.js';
const health = getHealthStatus();
// Returns: { status, degradedMode, persistFailureCount, queuedWrites, ... }
```

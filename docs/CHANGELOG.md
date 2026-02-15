# Changelog

All notable changes to AlephAuto are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [1.8.6] - 2026-02-15

### Summary
Codebase cleanup sweep clearing 8 of 12 backlog items from analyzer scan. Net -2,170 lines across 23 files. Review score: 8.5/10.

### Removed
- Duplicate documentation files: 4 docs with canonical copies elsewhere (LOG1)
- `api/routes/routes/` and `api/routes/middleware/` duplicate directories (LOG2)
- `scripts/sync-cloudflare-tunnel-files.js` and Cloudflare tunnel sync infrastructure (LOG2)
- `sync:cloudflare` and `sync:cloudflare:check` package.json scripts (LOG2)
- Pre-commit Cloudflare sync step from `.husky/pre-commit` and `.git/hooks/pre-commit` (LOG2)
- `tsconfig.json` exclusions for removed directories (LOG2)

### Fixed
- Hardcoded `/Users/alyshialedlie/code/jobs` paths in 3 integration tests replaced with `process.cwd()` (LOG3)
- `docs/README.md` link to `INSTALL.md` updated to canonical location (LOG1)

### Changed
- `codebase-health-scanner.js` - replaced custom logger shim with `createComponentLogger` + `logError` (LOG4)
- `report-coordinator.js` - replaced `console.log` with `logger.info` (LOG4)
- `ecosystem.config.cjs` - added `max_size: '10M'` to both PM2 apps for log rotation (LOG5)
- `report-generator.js` - added `pruneOldReports()` with 30-day retention, runs after each report generation (LOG6)
- 4 migration scripts moved to `scripts/archive/` (LOG7)

### Commits
```
85ae6aa chore: remove duplicate documentation files
58561e5 chore: remove duplicate route files and Cloudflare tunnel sync
6820988 fix: replace hardcoded paths with process.cwd() in integration tests
a536810 refactor(logging): replace console.log with structured logger
c4b40c8 chore: configure PM2 log rotation with max_size 10M
895a3ed feat: add 30-day report retention policy
5417d87 chore: archive one-time migration scripts
3ca9b8a docs: update CLEANUP.md backlog with completion status
```

---

## [1.8.5] - 2026-02-08

### Summary
Pattern-based file detection for MigrationTransformer. Steps without `code_example` hints now automatically find affected files by scanning the repository. Also fixes Babel ESM/CJS interop bug that prevented AST transformations from executing.

### Added
- `_findRepositoryFiles()` - Glob scan for JS/TS files respecting `config.excludeDirs`
- `_contentMatchesStep()` - Regex matching per step type (update-import, replace-call, remove-declaration)
- `_resolveAffectedFiles()` - Single-pass file scanning: reads N files once, tests M steps against each
- `add-import` association logic: inherits files from sibling steps in the same suggestion

### Fixed
- Babel `@babel/traverse` and `@babel/generator` ESM/CJS interop (`.default` unwrapping)
- `_groupStepsByFile()` no longer falls back to sentinel keys (`__inferred_importers__`, etc.) that never resolve

### Changed
- `_groupStepsByFile()` now async with 2-pass approach (pass 1: code_example, pass 2: file detection)
- 6 previously-skipped migration transformer tests now active

---

## [1.8.4] - 2026-02-03

### Summary
Magic string to enum migration using Ralph Wiggum iterative loop. Created 6 new enums to centralize status values, eliminating scattered string literals across 13 files.

### Added
- `api/types/scan-result-status.ts` - `SCAN_RESULT_STATUS` enum (success, failure)
- `api/types/activity-status.ts` - `ACTIVITY_STATUS` and `ACTIVITY_ICONS` enums
- `HEALTH_STATUS` enum in `sidequest/core/constants.js` (healthy, warning, critical, degraded, not_initialized)
- `PIPELINE_PHASES` enum in `sidequest/core/constants.js` (startup, cron, manual, scheduled)
- `SCAN_STAGES` enum in `sidequest/core/constants.js` (scanning, extraction, analysis, comparison)
- `JOB_STATUS_VALUES` array export in `api/types/job-status.ts` for SQL/Zod usage
- `ACTIVE_STATUSES` constant for filtering non-terminal jobs
- `docs/SESSION_HISTORY.md` - Development session log

### Changed
- `api/types/scan-requests.ts` - Import `JOB_STATUS` from job-status.ts instead of duplicating z.enum
- `sidequest/workers/duplicate-detection-worker.js` - Use `SCAN_RESULT_STATUS`, `PIPELINE_PHASES`, `SCAN_STAGES`
- `sidequest/workers/claude-health-worker.js` - Use `HEALTH_STATUS` enum
- `sidequest/core/database.js` - Use `HEALTH_STATUS` for health status reporting
- `sidequest/pipeline-core/doppler-health-monitor.js` - Use `HEALTH_STATUS` for severity levels
- `sidequest/pipeline-runners/gitignore-pipeline.js` - Use `PIPELINE_PHASES` for logging tags
- `sidequest/pipeline-runners/repo-cleanup-pipeline.js` - Use `PIPELINE_PHASES` for logging tags
- `api/server.js` - Use `HEALTH_STATUS` and `PIPELINE_PHASES` enums
- `api/activity-feed.js` - Use `ACTIVITY_STATUS` and `ACTIVITY_ICONS` enums

### Fixed
- Duplicate z.enum definitions in scan-requests.ts (DRY violation)

### Commits
```
85c119f chore: remove ralph-prompt.md after enum migration complete
48d1c37 refactor(constants): add SCAN_STAGES enum for progress tracking
f68d1c7 refactor(types): add ACTIVITY_STATUS and ACTIVITY_ICONS enums
7cfdbdf refactor(constants): add PIPELINE_PHASES enum for execution context
ee03652 refactor(constants): add HEALTH_STATUS enum for system monitoring
312a9e8 refactor(types): add SCAN_RESULT_STATUS enum for pipeline outcomes
c529fc4 refactor(types): deduplicate job status enums in scan-requests
```

---

## [1.8.3] - 2026-02-02

### Summary
Major DRY refactoring introducing BasePipeline class for pipeline runners. Improved DRY score from 72 → 97.

### Added
- `sidequest/core/base-pipeline.js` - Abstract base class for pipeline runners
  - `setupEventListeners()` - Standardized job lifecycle event handling
  - `waitForCompletion()` - Polling for job queue completion
  - `scheduleCron()` - Centralized cron scheduling with validation
  - `runWithTiming()` - Consistent operation timing and logging
  - `calculateDuration()` - Duration calculation helper

### Changed
- **GitActivityPipeline** - Now extends BasePipeline (was standalone class)
- **PluginManagementPipeline** - Now extends BasePipeline
- **SchemaEnhancementPipeline** - Now extends BasePipeline
- **ClaudeHealthPipeline** - Now extends BasePipeline (with 100ms polling)
- Eliminated ~600 lines of duplicate code across 4 pipeline files
- Standardized event listener patterns using `EVENT_TYPES` constants
- Centralized cron schedule validation

### Patterns Established
```javascript
// Creating a new pipeline
import { BasePipeline } from '../core/base-pipeline.js';
import { createComponentLogger } from '../utils/logger.js';

const logger = createComponentLogger('MyPipeline');

class MyPipeline extends BasePipeline {
  constructor(options = {}) {
    const worker = new MyWorker({ ...options });
    super(worker, { logger });
  }

  // Override for custom event handling
  onJobCompleted(job) {
    const duration = this.calculateDuration(job);
    this.logger.info({ jobId: job.id, duration }, 'Job completed');
  }

  // Use runWithTiming for consistent timing
  async runTask(options = {}) {
    return this.runWithTiming('my task', async () => {
      const job = this.worker.createJob(options);
      this.logger.info({ jobId: job.id }, 'Task started');
    });
  }

  // Use scheduleCron for consistent scheduling
  scheduleTask(cronSchedule = '0 * * * *') {
    return this.scheduleCron(cronSchedule, () => this.runTask(), 'tasks');
  }
}
```

### Migration Notes
Pipelines extending BasePipeline no longer need to implement:
- `setupEventListeners()` - Provided by base class (override for custom)
- `waitForCompletion()` - Provided by base class
- Cron validation - Handled by `scheduleCron()`
- Duration calculation - Use `this.calculateDuration(job)`

---

## [1.8.2] - 2026-02-02

### Summary
Two rounds of code review fixes addressing code quality, performance, and consistency issues.

### Fixed (2026-02-01 Code Review)
- **M1:** Renamed `annotate()` → `extract_annotation()` for naming consistency in semantic_annotator.py
- **M2:** Added docstrings to grouping.py helpers (`_extract_function_names`, `_run_semantic_checks`, `_create_duplicate_group`)
- **M3:** Added Q2-2026 timeline markers to skipped tests in migration-transformer.test.js
- **M4:** Consolidated duplicate auth patterns in semantic_annotator.py
- **M5:** Added semantic annotation coverage metrics (% blocks with tags, avg tags/block)
- **M6:** Added file:line context to error messages in extract_blocks.py
- **L1:** Removed redundant DEBUG checks in verbose logging
- **L2:** Added 14 `.pyi` type stubs + `py.typed` marker for IDE support
- **L3:** Added timing metrics to Layer 3 (SemanticAnnotator + grouping.py)
- **L4:** Pre-compiled regex patterns in semantic_annotator.py (was recompiling on every call)

### Fixed (2026-02-02 Code Review)
- **H1:** Memory leak in `_consolidateSuggestionsByTarget` - removed unnecessary `member_suggestions` storage
- **H2:** DRY violation in database.js - extracted `buildStatusFilter()` helper
- **H3:** Integration test failures - Activity Feed used undefined error codes, getJobCounts returned null
- **M1:** Added dev-only console.warn logging to silent catch in extractComponentName
- **M2:** Used SHA256 hash for suggestion IDs to prevent path collision
- **M3:** Added `validate_report_path()` with size/type checks in Python scripts
- **M4:** Added timeout validation in execCommand (positive finite number)
- **M5:** Created custom error class for CommandError (replaced JSDoc casting)
- **M6:** Centralized CI detection - added `config.isCI`, updated 6 files to use it
- **L1:** Module-level import with fallback in semantic_annotator.py
- **L3:** Consistent stdout/stderr truncation (both 500 chars) in error messages
- **L4:** Extracted suggestion ID prefixes to constants
- **L5:** Optimized Set operations - internal `_affectedReposSet` converted to array only in finalize step
- **L6:** Activity Feed test now uses known non-retryable error codes (ENOENT, EINVAL, etc.)
- **L7:** `getJobCounts()` returns 0 instead of null for empty result sets

### Changed
- Refactored consolidation into 4 smaller methods (cyclomatic complexity ≤5 each)
- Logic bug fix: `category in [array]` → `.includes()` in inter-project-scanner
- Type safety: `code` → `exitCode` in CommandError
- URL validation: try-catch in extractComponentName
- Input validation: status param validated in getJobs

### Tests
- **T1:** TestWorker now disables retries by default (`maxRetries: 0`) - [#7](https://github.com/aledlie/AlephAuto/issues/7)

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

# Backlog

Technical debt and planned improvements extracted from codebase TODOs.

**Last Updated:** 2026-02-25 (Session 4)

---

## Logging DRY Utilities (2026-02-03)

> **Source:** Logging DRY refactoring session
> **Commits:** `8a5b601`, `cbb99c3`, `cb3c532`, `e0da404`, `e0af94d`, `2aed025`
> **Review Score:** 9.8/10 maintainability

### Completed
- ✅ Added `logStage`, `logMetrics`, `logRetry` utilities to logger.js
- ✅ Adopted `logStart` across 20 production files
- ✅ Adopted `logStage` across 4 pipeline files (12 stage logs)
- ✅ Adopted `logRetry` across 2 retry-handling files

### Low Priority - Remaining Opportunities

| ID | Location | Description | Status |
|----|----------|-------------|--------|
| LOG1 | `sidequest/core/database.js` | `logMetrics` adopted in database.js (3 import functions) | ✅ Done |
| LOG2 | `api/routes/jobs.js:377` | Misleading message `'Retrying job'` - should be `logStart(logger, 'job retry', {...})` since it's user-initiated, not automatic retry | ✅ Done |
| LOG3 | `sidequest/bug-fixes/index.js:77` | `'Starting automated bugfix audit'` pattern could use `logStart` for consistency | ✅ Done |

### Notes
- Test files intentionally not refactored (keep magic strings for clarity)
- Example files (`doppler-resilience.example.js`) not refactored
- Scanners using `this.logger` injected pattern not refactored (different logging architecture)

---

## Code Review Issues (2026-02-01)

> **Source:** Enterprise code review of commits `0c4027f^..c07f736`
> **Fixed:** C1-C3 (Critical), H1-H6 (High) in commit `e6a9044`

### Test Infrastructure

| ID | Location | Description | Status | Issue |
|----|----------|-------------|--------|-------|
| T1 | `tests/utils/test-utilities.js:36` | TestWorker should disable retries by default (`maxRetries: 0`) | ✅ Done | [#7](https://github.com/aledlie/AlephAuto/issues/7) |

### Medium Priority - Code Quality

| ID | Location | Description | Status |
|----|----------|-------------|--------|
| M1 | `semantic_annotator.py:281-295` | Inconsistent naming: `annotate()` vs `extract_*()` pattern | ✅ Done |
| M2 | `similarity/grouping.py` | Missing docstrings on `_extract_function_names()`, `_run_semantic_checks()`, `_create_duplicate_group()` | ✅ Done |
| M3 | `tests/unit/migration-transformer.test.js:84-143` | Skipped tests lack issue numbers/timeline (currently "requires file detection") | ✅ Done |
| M4 | `semantic_annotator.py:137-155` | Duplicate 'auth' pattern across category dictionaries | ✅ Done |
| M5 | `extractors/extract_blocks.py:733-735` | Missing semantic annotation metrics (% blocks with tags, avg tags/block) | ✅ Done |
| M6 | `extractors/extract_blocks.py:349,839` | Generic error messages not actionable (add file:line context) | ✅ Done |
| M7 | `api/activity-feed.js:372` | Already fixed in H2 (nullish coalescing) | ✅ Done |

### Low Priority - Performance & Tooling

| ID | Location | Description | Status |
|----|----------|-------------|--------|
| L1 | `extractors/extract_blocks.py:275-281` | Verbose debug logging - extract to logging helper | ✅ Done |
| L2 | Python files | Missing `.pyi` type stubs for IDE support | ✅ Done |
| L3 | Layer 3 semantic annotation | No timing/performance metrics collected | ✅ Done |
| L4 | `semantic_annotator.py:350-352` | Regex patterns compiled on every `extract_annotation()` call - should pre-compile | ✅ Done |

---

## High Priority - Feature Implementation

> **Implementation Plan:** [SEMANTIC_SIMILARITY_IMPLEMENTATION.md](architecture/SEMANTIC_SIMILARITY_IMPLEMENTATION.md)

| ID | Location | Description | Status |
|----|----------|-------------|--------|
| H1 | `sidequest/pipeline-core/similarity/grouping.py:387` | Layer 3 - Semantic similarity implementation | ✅ Done |
| H2 | `sidequest/pipeline-core/extractors/extract_blocks.py:286` | Detect language from file extension | ✅ Done |
| H3 | `sidequest/pipeline-core/annotators/semantic_annotator.py` | Implement full semantic annotator (Stage 4) | ✅ Done |
| H4 | `sidequest/pipeline-core/similarity/grouping.py` | Implement semantic grouping for duplicate detection | ✅ Done |
| H5 | `sidequest/pipeline-core/extractors/extract_blocks.py` | Calculate duplication percentage properly | ✅ Done |

## Medium Priority - Tests

| ID | Location | Description | Status |
|----|----------|-------------|--------|
| M1 | `tests/integration/activity-feed.integration.test.js:306` | Implement retry:created event emission in SidequestServer | ✅ Done |
| M2-M7 | `tests/unit/migration-transformer.test.js` | Enhanced file detection for migration | ✅ Done (2026-02-08) |

## Low Priority - Documentation

| ID | Location | Description | Status |
|----|----------|-------------|--------|
| L1 | `docs/architecture/README.md:147` | Document Layer 3: Semantic Similarity | ✅ Done |
| L2 | `docs/architecture/README.md:470` | Create AST-Grep Rules README | ✅ Done |
| L3 | `docs/architecture/README.md:471` | Create Pydantic Models README | ✅ Done |
| L4 | `docs/architecture/README.md:474` | Create Test Suite Overview README | ✅ Done |
| L5 | `docs/architecture/README.md:475` | Create Accuracy Tests README | ✅ Done |
| L6 | `docs/architecture/similarity-algorithm.md:61` | Document Category + Tags Matching | ✅ Done |
| L7 | `docs/architecture/similarity-algorithm.md:783` | Link Accuracy Test Results | ✅ Done |
| L8 | `docs/architecture/WORKER_REGISTRY.md:367` | Document actual job triggering with worker | ✅ Done |

## Code Organization

| ID | Location | Description | Status |
|----|----------|-------------|--------|
| C1 | `sidequest/utils/refactor-test-suite.ts:571` | Organize strings into meaningful groups | ✅ Done |
| C2 | `sidequest/workers/test-refactor-worker.ts:598` | Organize strings into meaningful groups | ✅ Done |

---

## Summary

| Priority | Count | Theme |
|----------|-------|-------|
| High | 0 | ~~Layer 3 semantic similarity (Stages 4-7)~~ ✅ Complete |
| Medium | 0 | ~~Code quality from 2026-02-01 review~~ ✅ Complete |
| Low | 0 | ~~Logging DRY adoption (LOG2, LOG3)~~ ✅ Complete |
| Deferred | 0 | ~~`logMetrics` utility adoption (LOG1)~~ ✅ Complete |
| Test | 0 | ~~TestWorker retry behavior~~ ✅ Fixed ([#7](https://github.com/aledlie/AlephAuto/issues/7)) |
| Organization | 0 | ~~Code cleanup~~ ✅ Complete |
| **Total** | **0** | All pre-cleanup items complete |

## Next Steps

### Completed (2026-02-01)
- ✅ Layer 3 semantic similarity fully implemented
- ✅ Critical security fixes (C1-C3): input validation, race conditions, type safety
- ✅ High priority fixes (H1-H6): config centralization, ReDoS prevention, refactoring

### Completed (2026-02-02)
- ✅ M1: Renamed `annotate()` → `extract_annotation()` for naming consistency
- ✅ M2: Added docstrings to grouping.py helpers
- ✅ M3: Added Q2-2026 timeline markers to skipped tests
- ✅ M4: Consolidated duplicate auth patterns
- ✅ M5: Added semantic annotation coverage metrics
- ✅ M6: Added context to error messages
- ✅ L1: Removed redundant DEBUG checks
- ✅ L2: Added 14 .pyi type stubs + py.typed marker for IDE support
- ✅ L3: Added timing metrics to Layer 3 (SemanticAnnotator + grouping.py)

### Completed (2026-02-03)
- ✅ Added `logStage`, `logMetrics`, `logRetry` utilities
- ✅ Adopted `logStart` across 20 files (pipeline-runners, workers, scanners, API, scripts, bug-fixes)
- ✅ Adopted `logStage` across 4 files (12 stage log statements)
- ✅ Adopted `logRetry` across 2 files (retry handling)

### Completed (2026-02-03 - Session 2)
- ✅ LOG2: Fixed misleading API route message in `api/routes/jobs.js:377` → `logStart`
- ✅ LOG3: Applied `logStart` to `sidequest/bug-fixes/index.js:77`

### Completed (2026-02-08)
- ✅ M2-M7: Pattern-based file detection for MigrationTransformer (6 skipped tests now active)

### Completed (2026-02-14)
- ✅ LOG1: Adopted `logMetrics` in `database.js` (3 import functions: reports, logs, bulk)

---

## Codebase Cleanup (2026-02-15)

> **Source:** Codebase analyzer scan + enterprise code review of cleanup session
> **Commits:** `85ae6aa`..`3ca9b8a` (8 commits, -2,170 lines)
> **Review Score:** 8.5/10
> **Detail:** `docs/backlog/CLEANUP.md`

### Completed
- ✅ LOG1-LOG7, LOG10: Duplicate files, hardcoded paths, console.log, log rotation, retention policy, migration scripts

### Medium Priority

| ID | Location | Description | Status |
|----|----------|-------------|--------|
| CL-M1 | `sidequest/utils/report-generator.js:475-483` | `pruneOldReports()` uses sequential `await` in loop - parallelize with `Promise.all()` for dirs with 100+ files | ✅ Done |
| CL-M2 | `sidequest/utils/report-generator.js` | Add `pruneOldReports()` unit tests covering deletion, retention, edge cases (file already had 30+ tests for HTML/JSON generation) | ✅ Done |

### Low Priority

| ID | Location | Description | Status |
|----|----------|-------------|--------|
| CL-L1 | `sidequest/pipeline-core/scanners/timeout-pattern-detector.js:30` | Falls back to raw `console` instead of `createComponentLogger` - inconsistent with other components | ✅ Done |
| CL-L2 | `config/ecosystem.config.cjs` | `max_size: '10M'` requires `pm2-logrotate` module - add install step to deployment runbook | ✅ Done |
| CL-L3 | `sidequest/utils/report-generator.js:111-113` | Fire-and-forget pruning errors logged but not tracked in Sentry/metrics - silent disk exhaustion risk | ✅ Done |

### Deferred (Blocked / Out of Scope)

| ID | Description | Reason |
|----|-------------|--------|
| LOG8 | 2 skipped tests (`mcp-server`, `websocket`) | `websocket.test.js` ✅ fixed 2026-02-23 (cleanup + API alignment). `mcp-server.test.js` remains skipped — binary (`mcp-servers/duplicate-detection/index.js`) not implemented. |
| LOG9 | TODO comments in `schema-enhancement-pipeline.js`, `grouping.py`, `extract_blocks.py` | Feature work (Layer 3 semantic equivalence), not cleanup |
| LOG11 | 14 deep relative imports in `api/` | ✅ Done 2026-02-23 — migrated 41 imports across 12 files to Node `#imports` subpath aliases; Step 11 reverse deps in `sidequest/core/` also migrated |
| LOG12 | `doppler-resilience.example.js` (290 lines) | Moved to [`docs/quickstart/doppler-circuit-breaker.md`](quickstart/doppler-circuit-breaker.md) |
| LOG13 | Zod schema consolidation in `api/types/` | Duplicate `ErrorResponseSchema`, `ValidationErrorResponseSchema`, `createErrorResponse` in `scan-requests.ts` + `pipeline-requests.ts` — extract to `api/types/shared-schemas.ts` | ✅ Done |

### Summary

| Priority | Count | Theme |
|----------|-------|-------|
| Medium | 0 | ~~Pruning performance (CL-M1), test coverage (CL-M2)~~ ✅ Complete |
| Low | 0 | ~~LOG13 Zod schema consolidation~~ ✅ Complete |
| Deferred | 3 | Blocked by SQLite WASM, TS migration, or feature scope |
| **Total** | **3** | LOG11 + LOG13 complete |

---

## Bugfix Audit - Open Items (2026-02-15)

> **Source:** Bugfix audit pipeline scans across `~/dev/active/`
> **Plans:** `~/dev/active/bugfix-*/plan.md`

### integritystudio/reports (P3-P4)

> **Plan:** `~/dev/active/bugfix-reports-2026-02-15/plan.md`
> **Status:** P0-P2 items fixed (10/13), 3 deferred

| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| BF-R1 | Generic font stack across all base CSS files (`report-base.css`, `portal-base.css`, `competitor-base.css`) — introduce DM Sans / Source Serif Pro | P3 | ✅ Done |
| BF-R2 | Hub layout monotony — 10 sections with mostly 1 card each, needs varied layouts | P4 | ✅ Done |
| BF-R3 | 4 parallel CSS variable namespaces across `css/*.css` — consolidate | P4 | ✅ Done |

### aledlie/tcad-scraper (P1-P3)

> **Plan:** `~/dev/active/bugfix-tcad-scraper-2026-02-13/plan.md`
> **Status:** Health check passed (617/617 tests), lint issues found

| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| BF-T1 | `isNaN()` vs `Number.isNaN()` bug in `src/utils/formatters.ts:41` — potential incorrect date formatting | P1 | ✅ Done |
| BF-T2 | Biome format drift — 57+ files with formatting issues (auto-fixable: `npx @biomejs/biome check --write .`) | P2 | ✅ Done |
| BF-T3 | Unused import in `server/src/lib/__tests__/redis-cache.service.test.ts` | P2 | ✅ Done |
| BF-T4 | LoadingSkeleton a11y — WAI-ARIA role should use semantic HTML element | P3 | ✅ Done |
| BF-T5 | Import organization drift in 3 files (auto-fixable) | P3 | ✅ Done |

### aledlie/AnalyticsBot (P3)

> **Plan:** `~/dev/active/bugfix-analyticsbot-2026-02-10/plan.md`
> **Status:** Core fixes deployed (Redis, CSP, debug code), 3 low-priority remaining

| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| BF-A1 | React Router v6 deprecation warnings (v7 future flags) | P3 | ✅ Done |
| BF-A2 | 4 TODOs in UserService.ts (cache/Redis features) | P3 | ✅ Done |
| BF-A3 | Jest `--detectOpenHandles` warning (async teardown) | P3 | ✅ Done |

---

## Server Stability (2026-02-15)

> **Source:** Integration test crash — disabled pipeline trigger causes unhandled rejection
> **Severity:** Critical (server crash)

| ID | Location | Description | Status |
|----|----------|-------------|--------|
| SRV-C1 | `api/utils/worker-registry.js:getWorker()` | Triggering a disabled pipeline creates an `initPromise` that rejects with no listener, causing an unhandled rejection that crashes the process. Fix: fast-fail before creating the promise. | ✅ Done |

### Summary

| Repo | ✅ Done | Theme |
|------|---------|-------|
| integritystudio/reports | 3 | Typography, layout, CSS architecture |
| aledlie/tcad-scraper | 5 | Lint, formatting, a11y |
| aledlie/AnalyticsBot | 3 | Deprecation warnings, TODOs, test config |
| **Total** | **11** | |

---

## JS/TS Migration - api/ Dual Files (2026-02-15)

> **Source:** Codebase analyzer scan
> **Blocked by:** LOG11 (deep relative imports deferred to TS migration Phase 9)
> **See also:** `docs/backlog/2.0/BACKLOG.md`

8 modules in `api/` have both `.js` (runtime) and `.ts` (aspirational rewrite) tracked in git. The `.js` files are imported at runtime; `.ts` files provide Zod schemas with `export type` for type-checking but have diverged from `.js` in both directions.

### Affected Files

| Module | .js status | .ts status | Drift |
|--------|-----------|-----------|-------|
| `api/types/pipeline-requests` | Stale (missing GitInfoSchema, JobErrorSchema, passthrough) | Newer schemas, helper functions | .ts ahead |
| `api/types/scan-requests` | Stale (79 lines) | Newer (150 lines) | .ts ahead |
| `api/types/job-status` | Stale (65 lines) | Newer (68 lines) | .ts ahead |
| `api/types/report-requests` | Stale (missing type exports) | Newer (has type exports) | .ts ahead |
| `api/types/repository-requests` | Stale (missing type exports) | Newer (has type exports) | .ts ahead |
| `api/routes/pipelines` | Production (905 lines, fully evolved) | Partial rewrite (304 lines) | .js ahead |
| `api/routes/scans` | Production (325 lines) | Partial rewrite (222 lines) | .js ahead |
| `api/middleware/validation` | Newer (Feb 3) | Older (Dec 24) | .js ahead |

### Migration Steps

1. **Types first:** Backport `.ts` schema additions into `.js` files (or replace `.js` with `.ts` + Node `--experimental-strip-types`)
2. **Routes:** Port `.js` route logic into `.ts` files (significant effort for pipelines.js)
3. **Middleware:** Sync validation.ts with validation.js changes
4. **Imports:** Update all `from '.../*.js'` imports once `.ts` is canonical
5. **Cleanup:** Remove redundant `.js` files after migration

### Priority: Low (deferred to TS migration phase)

---

## Production Job Population Bugfix - Deferred Items (2026-02-16)

> **Source:** Debug session for "jobs not populating in production"
> **Commits:** Uncommitted (5 files modified on `main`)
> **Fixes Applied:** `getJobById()`, `getAllJobs()` JSON parsing, API field mapping, PM2 autorestart, `getJobCount()` pagination

### High Priority

| ID | Location | Description | Status |
|----|----------|-------------|--------|
| PROD-H1 | `sidequest/core/database.js` | **Multi-process sql.js isolation** — Replaced sql.js with better-sqlite3 (WAL mode). Both PM2 processes now read/write the same `data/jobs.db` file concurrently. | ✅ Done |
| PROD-H2 | `api/utils/worker-registry.js` | **Missing pipeline registrations** — `dashboard-populate` and `plugin-manager` pipelines not registered in worker registry (8/11 present). Jobs for these pipelines return "No worker found" on cancel/retry. | ✅ Done |
| PROD-H3 | `sidequest/core/server.js:189-221` | **`_persistJob()` silently swallows DB errors** — Logs error + sends to Sentry but does not fail the job or propagate. Job can report "completed" while DB write failed, causing data loss. | ✅ Done |

### Medium Priority

| ID | Location | Description | Status |
|----|----------|-------------|--------|
| PROD-M1 | `sidequest/core/server.js:56-65` | **DB init race condition** — `jobRepository.initialize()` is called in `SidequestServer` constructor but not awaited. First job could arrive before DB is ready, causing silent failures. Needs `await` in `start()` or ready gate. | ✅ Done |

### Low Priority

| ID | Location | Description | Status |
|----|----------|-------------|--------|
| PROD-L1 | `sidequest/core/database.js:getAllPipelineStats()` | **snake_case inconsistency** — Returns `pipeline_id`, `last_run` (snake_case) while all other query functions return camelCase. Single consumer (`api/server.js:162`) compensates, but inconsistent with repository pattern. | ✅ Done |
| PROD-L2 | `tests/unit/database.test.js` | **Test isolation** — Tests now use `:memory:` databases for cross-file isolation. `initDatabase()` accepts optional path parameter. | ✅ Done |

### Summary

| Priority | Count | Theme |
|----------|-------|-------|
| High | 0 | ~~Multi-process DB isolation (PROD-H1)~~ ✅ Complete |
| Medium | 0 | ~~DB init race condition~~ ✅ Complete |
| Low | 0 | ~~Test isolation (PROD-L2)~~ ✅ Complete |
| **Total** | **0** | |

---

## TS Migration Phase 4-6 - Deferred Review Findings (2026-02-19)

> **Source:** Enterprise code review of Phase 4-6 migration (commits `34c7977`, `b897b38`, `d38e7e2`)
> **Resolved:** 3 Critical (C1-C3), 5 High (H1-H5), 5 HANDOFF.md coherence issues
> **Deferred:** 10 Medium, 5 Low (below)

### Medium Priority

| ID | Location | Description | Status |
|----|----------|-------------|--------|
| TS46-M1 | `sidequest/core/database.ts:258` | **`isValidJobId` not called in `saveJob`** — Validation only runs in `bulkImportJobs`. `saveJob` writes `id` directly without format check. Add `isValidJobId` guard for defense-in-depth. | ✅ Done |
| TS46-M2 | `sidequest/core/database.ts:130-146` | **`BulkImportJob` dual-field pattern undocumented** — Accepts both `pipeline_id` and `pipelineId` for migration compat but no `@deprecated` marker on snake_case variants. | ✅ Done |
| TS46-M3 | `sidequest/core/database.ts:50` | **`ParsedJob.error` typed `unknown`** — Should narrow to `{ message: string; stack?: string; code?: string; cancelled?: boolean } \| null` to match `Job.error` in `server.ts:39`. Downstream consumers require casts. | ✅ Done |
| TS46-M4 | `sidequest/pipeline-core/git/branch-manager.ts:336-344` | **`jobContext.jobType` not sanitized in `_generateBranchName`** — `description` is sanitized (lowercase, strip non-alphanumeric) but `jobType` is used verbatim. Special chars in jobType would break `git checkout -b`. | ✅ Done |
| TS46-M5 | `sidequest/pipeline-core/git/migration-transformer.ts:654-682` | **Incomplete backup in `rollback`** — `_createBackup` creates a directory but never copies files. `rollback` reads empty backup dir and silently restores nothing. Either copy files before transform or use `git checkout`. | ✅ Done |
| TS46-M6 | `sidequest/pipeline-core/git/migration-transformer.ts:626` | **Non-null assertion on `Map.get`** — `resolved.get(step.index)!.push(relPath)` assumes key exists. Use null-safe `const arr = resolved.get(step.index); if (arr) arr.push(relPath);` | ✅ Done |
| TS46-M7 | `sidequest/core/git-workflow-manager.ts:49-53` | **Mutable config properties** — `baseBranch`, `branchPrefix`, `dryRun`, `branchManager` are `public` but set once in constructor. Mark `readonly`. | ✅ Done |
| TS46-M8 | `sidequest/core/server.ts:98` | **`gitWorkflowManager!` definite assignment** — Only initialized when `gitWorkflowEnabled` is true. Should be `gitWorkflowManager: GitWorkflowManager \| undefined` to force callsite narrowing. | ✅ Done |
| TS46-M9 | `sidequest/pipeline-core/git/migration-transformer.ts:416-418` | **Namespace import alias hardcoded** — `_addImport` with `imported === '*'` always uses identifier `'imported'`. Dead code in practice but would break if reached. | ✅ Done |
| TS46-M10 | `tests/integration/pipeline-execution.integration.test.js:152-154` | **`--strip-types` requires Node 22.6+** — Test uses `--strip-types` flag for `.ts` syntax checking. Falls back silently via `\|\| true` on older Node. Add version guard or use `tsx`. | ✅ Done |

### Low Priority

| ID | Location | Description | Status |
|----|----------|-------------|--------|
| TS46-L1 | `sidequest/core/index.ts:136` | **Relative log path** — `saveRunSummary` writes to `'../logs'` (relative to cwd). Should use `this.worker.logDir` for deterministic output. | ✅ Done |
| TS46-L2 | `sidequest/core/database.ts:658` + `constants.ts:142` | **Job ID max length mismatch** — Error message says "max 255 chars" but `JOB_ID_PATTERN` regex enforces `{1,100}`. Update message to "max 100 chars". | ✅ Done |
| TS46-L3 | `sidequest/core/server.ts:133-142` | **`_dbReady` swallows rejection undocumented** — `.catch()` converts DB init failure to resolved promise. `start()` always succeeds. Add comment documenting graceful degradation intent. | ✅ Done |
| TS46-L4 | `sidequest/pipeline-core/git/branch-manager.ts:72-75` | **`getChangedFiles` misparses renames** — `substring(3)` on `git status --porcelain` includes `old -> ` prefix for renamed files (`R  old -> new`). | ✅ Done |
| TS46-L5 | `sidequest/core/index.ts` | **Auto-executing entry point in `core/`** — Top-level `app.start()` runs on import. Should live in `pipeline-runners/` to avoid side effects when importing from `core/`. | ✅ Done |

### Completed (2026-02-20)
- ✅ TS46-M1: Added isValidJobId guard in saveJob with runtime type guard
- ✅ TS46-M2: Added @deprecated markers on BulkImportJob snake_case fields
- ✅ TS46-M3: Narrowed ParsedJob.error with isParsedJobError runtime guard
- ✅ TS46-M4: Sanitized jobType in _generateBranchName
- ✅ TS46-M5: Replaced empty backup with git checkout rollback
- ✅ TS46-M6: Replaced non-null assertion with null-safe Map.get
- ✅ TS46-M7: Marked GitWorkflowManager config properties readonly
- ✅ TS46-M8: Changed gitWorkflowManager! to optional with narrowing guards
- ✅ TS46-M9: Derived namespace import alias from module source
- ✅ TS46-M10: Added Node 22.6+ version guard for --strip-types test
- ✅ TS46-L1: Fixed relative log path in saveRunSummary
- ✅ TS46-L2: Fixed error message "max 255 chars" → "max 100 chars"
- ✅ TS46-L3: Documented _dbReady graceful degradation intent
- ✅ TS46-L4: Fixed getChangedFiles rename parsing
- ✅ TS46-L5: Documented auto-executing entry point in core/index.ts

### Summary

| Priority | Count | Theme |
|----------|-------|-------|
| Medium | 0 | ~~Type safety, validation, readonly, broken rollback~~ ✅ Complete |
| Low | 0 | ~~Paths, docs, entry point location~~ ✅ Complete |
| **Total** | **0** | All items resolved |

---

## Test Suite Inefficiencies (2026-02-24)

> **Source:** Cross-repo test review via code-reviewer agents
> **Scope:** `tcad-scraper/server`, `tcad-scraper/src`, `tcad-scraper/e2e`, `AlephAuto/tests`
> **Note:** `tcad-scraper-restore/` was identified as a byte-identical stale clone and deleted

### Critical — Delete or Rewrite (zero regression protection)

| ID | Project | Location | Description | Status |
|----|---------|----------|-------------|--------|
| TST-C1 | tcad-scraper | `server/src/lib/__tests__/claude-mock-repro.test.ts` | **Documentation-as-tests** — 5 tests assert only `expect(true).toBe(true)`. Useful knowledge belongs in docs, not test code. Delete file. | ✅ Done |
| TST-C2 | tcad-scraper | `server/src/services/__tests__/token-refresh-mock-repro.test.ts` | **"BROKEN" test block committed** — Documents known-broken pattern. Working pattern already in `token-refresh.service.test.ts`. Delete file. | ✅ Done |
| TST-C3 | tcad-scraper | `server/src/__tests__/ci-fixes.test.ts` | **Tests compile-time invariants at runtime** — Mocks the thing it tests, validates string literals, exercises Vitest internals. TSC already enforces these. Delete file. | ✅ Done |
| TST-C4 | tcad-scraper | `server/src/queues/__tests__/scraper.queue.database-tracking.test.ts` | **Tests `Array.filter`, not production code** — No production module imported. Every test validates JS array semantics. Delete or rewrite to test actual queue processor. | ✅ Done |
| TST-C5 | AlephAuto | `tests/unit/retry-logic.test.js:189` | **Tests local shadow copy of `extractOriginalJobId`** — Function reimplemented in test file instead of imported from production. Suite is useless for regression detection. | ✅ Done |
| TST-C6 | AlephAuto | `tests/unit/mcp-server.test.js:25` | **420 lines fully `describe.skip`'d** — Blocked on MCP server binary implementation. Delete or move to `tests/future/`. | ✅ Done |
| TST-C7 | AlephAuto | `tests/unit/rate-limit.test.js` | **Mock theater** — Manually calls `mockRes.status(429)` then asserts it. Actual middleware never invoked. `next()` called directly at line 249. Rewrite with `supertest`. | ✅ Done |
| TST-C8 | AlephAuto | `tests/unit/websocket-unit.test.js:144-415` | **~270 lines asserting hand-crafted object literals** — No production imports. `assert.strictEqual(30000, 30000)`. Remove or rewrite against real module. | ✅ Done |
| TST-C9 | AlephAuto | `tests/unit/database.test.js:560,611` | **`assert.ok(true)` — two tests pass unconditionally** regardless of function behavior. Add real assertions on return value or DB state. | ✅ Done |

### High — Correctness or Performance Risk

| ID | Project | Location | Description | Status |
|----|---------|----------|-------------|--------|
| TST-H1 | tcad-scraper | 2 Claude test files (lines 8-36, 18-49) | **Duplicate Anthropic mock setup** — `vi.hoisted`/`MockAnthropic` block copy-pasted across `claude.service.test.ts`, `claude.service.json-parsing.test.ts`. Extract to `__tests__/helpers/claude-mock.ts`. (`claude-mock-repro.test.ts` deleted in TST-C1.) | |
| TST-H2 | tcad-scraper | `claude.service.test.ts` + `claude.service.json-parsing.test.ts` | **Redundant fallback tests** — "fallback on API error", "empty response", "invalid JSON" duplicated. Keep fallbacks in `claude.service.test.ts`, narrow `json-parsing` to markdown/extraction logic. | |
| TST-H3 | tcad-scraper | `server/src/__tests__/auth-database.integration.test.ts` | **`isRedisAvailable(3000)` called 8 times** — Each creates new Redis connection. Use `describe.skipIf` once. Also `expect([200, 500]).toContain(status)` always passes — a 500 crash is "expected". | |
| TST-H4 | tcad-scraper | `server/src/queues/__tests__/scraper.queue.test.ts:230-326` | **6 tests repeat identical `resetModules + import`** — Move `vi.clearAllMocks(); vi.resetModules(); await import(...)` to shared `beforeEach` in `Queue Event Listeners` block. | |
| TST-H5 | tcad-scraper | `server/src/__tests__/enqueue.test.ts:373-400` | **Wall-clock timing test** — `Date.now()` delta assertions flaky under load. Test verifies `setTimeout` delays, not queue behavior. Delete; test rate limiting via `canScheduleJob` with fake timers. | |
| TST-H6 | tcad-scraper | `server/src/__tests__/integration.test.ts:52` | **Conditional assertion** — `if (csp) { expect(csp)... }` passes vacuously when header absent. Assert unconditionally. | |
| TST-H7 | tcad-scraper | `server/vitest.config.ts:40` | **`property.routes.claude.test.ts` excluded as "requires API key"** — File is fully mocked. Never runs in `npm test`. Remove exclusion. | |
| TST-H8 | tcad-scraper | `src/components/__tests__/PropertyCard.test.tsx:284-292` | **Analytics mock never checked** — Clicks expand, asserts button text, never verifies `logPropertyView` was called. | |
| TST-H9 | tcad-scraper | `src/lib/__tests__/api-config.test.ts:25-118` | **No `vi.resetModules()`** between dynamic imports — all tests share cached module. 5 of 9 tests redundant structural checks. | |
| TST-H10 | tcad-scraper | `playwright.config.ts:9` | **`workers: 1` on CI** negates `fullyParallel: true` — 5 spec files run serially. Increase to 2+ or remove CI cap. | |
| TST-H11 | tcad-scraper | `e2e/search.spec.ts:37-46` | **Loading state assertion is a timing race** — No network interception to hold response. Use `page.route` to delay API response. | |
| TST-H12 | tcad-scraper | 3 e2e spec files | **`page.locator("h3").first()` as results sentinel** — Matches any `<h3>` on page, not just result cards. Use `[data-testid="results-grid"] h3`. | |
| TST-H13 | AlephAuto | `tests/integration/activity-feed.integration.test.js` (6 sites) | **Bare `setTimeout` waits (500ms–2s)** — Use event-based `waitForQueueDrain` (already imported in `api-routes.test.js`) or `EventEmitter` promises. | ✅ Done |
| TST-H14 | AlephAuto | `tests/unit/worker-registry.test.js:42-45` | **Re-imports module in `beforeEach` without resetting cache** — Returns same singleton. False isolation, shared mutable state across blocks. | ✅ Done |
| TST-H15 | AlephAuto | `tests/unit/database.test.js:28-757` | **3 top-level describe blocks each call `initDatabase`/`closeDatabase`** — Teardown ordering risk on shared singleton. `beforeEach` in `Query Options` re-inserts 20 jobs per test. | ✅ Done |
| TST-H16 | AlephAuto | `tests/unit/port-manager.test.js:61-408` | **Hardcoded port numbers** — Inter-test conflict risk if cleanup fails. Use `port: 0` (OS-assigned) and read `server.address().port`. | ✅ Done |

### Medium — Redundancy and Noise

| ID | Project | Location | Description | Status |
|----|---------|----------|-------------|--------|
| TST-M1 | tcad-scraper | `server/vitest.config.ts:68-70` | **`mockReset + clearMocks` redundant** — `mockReset: true` supersedes `clearMocks: true`. Drop `clearMocks`. | |
| TST-M2 | tcad-scraper | `server/src/__tests__/integration.test.ts:117-129` | **`if (!hasFrontend) return` instead of `test.skipIf`** — Tests silently pass with no assertion. 3 of 4 frontend tests use wrong pattern. | |
| TST-M3 | tcad-scraper | `server/src/__tests__/factories.ts:22-24` | **`resetFactoryCounter` exported but never called** — Counter accumulates across tests, latent isolation issue. Call in global `beforeEach` or use `crypto.randomUUID()`. | |
| TST-M4 | tcad-scraper | `server/src/__tests__/test-utils.ts:62-123` | **`skipIfRedisUnavailable` throws errors to "skip"** — Reports as failure, not skip. Functions unused — all tests use `isRedisAvailable` directly. Remove. | |
| TST-M5 | tcad-scraper | `server/src/__tests__/security.test.ts:196-199` | **Documentation-only test** — `expect(true).toBe(true)` with "This is a note" comment. Delete test case. | |
| TST-M6 | tcad-scraper | `src/__tests__/App.test.tsx:63-88` | **Two tests assert same thing** — Both render `<App>` and check `PropertySearchContainer`. Neither observes loading state. Collapse into one. | |
| TST-M7 | tcad-scraper | `src/utils/__tests__/formatters.test.ts:78-103` | **"Type safety" block duplicates "edge cases"** for null/undefined — Same calls, zero runtime value from TS annotations. Remove block. | |
| TST-M8 | AlephAuto | `tests/unit/error-classifier.test.js` (3 sites) | **ENOENT tested 3 times, ETIMEDOUT 3 times** — Exact duplicate assertions across describe blocks. Deduplicate. | ✅ Done |
| TST-M9 | AlephAuto | `tests/unit/directory-scanner.test.js` (7 sites) | **Uses raw `os.tmpdir() + Date.now()`** instead of `createTempRepository` fixture per project convention. | ✅ Done |
| TST-M10 | AlephAuto | `tests/unit/scan-orchestrator.test.js:22-94` | **9 individual constructor-option tests** — Could be parameterized. Same sub-object assertions appear in 4 describe blocks. | ✅ Done |
| TST-M11 | AlephAuto | `tests/unit/activity-feed.test.js` (3 blocks) | **3 top-level describe blocks duplicate `beforeEach`/`afterEach` setup** — Extract shared factory helper (~60 lines boilerplate). | ✅ Done |
| TST-M12 | AlephAuto | `tests/unit/api-routes.test.js:92` | **`afterEach` has hardcoded `100ms` sleep** — `waitForQueueDrain` already imported. Use it instead. | ✅ Done |
| TST-M13 | AlephAuto | `tests/integration/pipeline-execution.integration.test.js:80-104` | **Scenario 3 subsumed by Scenario 9** — Both run same syntax check. Remove Scenario 3 or fold into 9. | ✅ Done |
| TST-M14 | AlephAuto | `tests/unit/websocket.test.js:46-57` | **`afterEach` race between `wss.close` and `httpServer.close`** — Port not released before next `beforeEach`. Use `Promise.all`. | ✅ Done |
| TST-M15 | AlephAuto | `tests/integration/port-manager.integration.test.js:133` | **Skipped flaky test** — Concurrent port allocation race condition. Investigate mutex or sequential port offsets. | ✅ Done |

### Low — Info

| ID | Project | Location | Description | Status |
|----|---------|----------|-------------|--------|
| TST-L1 | tcad-scraper | `server/src/lib/__tests__/tcad-scraper.test.ts:188-307` | **Weak assertions** — `humanDelay` tests assert `expect(true).toBe(true)`, user agent tests assert only `expect(scraper).toBeDefined()`. | |
| TST-L2 | AlephAuto | `tests/unit/repository-scanner.test.js:383` | **Tests placeholder** — `getFileMetadata` returns `[]`. Test will silently pass forever. Add TODO marker. | ✅ Done |
| TST-L3 | AlephAuto | `tests/unit/database.test.js:139-149` | **`beforeEach` in `getJobs` adds 5 jobs per test run** — Counter accumulates but assertions only check `> 0`. Fragile for exact-count tests in other blocks. | ✅ Done |
| TST-L4 | AlephAuto | `tests/integration/error-recovery.integration.test.js:150` | **`findAvailablePort` reimplemented locally** instead of importing from `port-manager`. | ✅ Done |
| TST-L5 | AlephAuto | `tests/integration/pipeline-triggering.test.js:112` | **`console.log` in test body** — Noise in CI output. Remove or use test runner diagnostics. | ✅ Done |

### Completed (2026-02-24 to 2026-02-25)

AlephAuto items: TST-C5..C9 (Critical), TST-H13..H16 (High), TST-M8..M15 (Medium), TST-L2..L5 (Low), LOG13 (Zod consolidation)
tcad-scraper items: TST-C1..C4 (Critical) — deleted 4 zero-value test files (-818 lines)

### Summary

| Priority | Count | Theme |
|----------|-------|-------|
| Critical | 0 | ~~Delete mock-repro/ci-fixes files~~ ✅ Complete |
| High | 12 (tcad-scraper) | Conditional assertions, duplicate mocks, timing races |
| Medium | 7 (tcad-scraper) | Redundant tests, hardcoded sleeps |
| Low | 1 (tcad-scraper) | Weak assertions |
| AlephAuto | 0 | ✅ All AlephAuto items complete |
| **Total** | **20** | tcad-scraper H/M/L items remain (separate repo) |

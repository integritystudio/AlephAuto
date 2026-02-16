# Backlog

Technical debt and planned improvements extracted from codebase TODOs.

**Last Updated:** 2026-02-16 (Session 3)

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
| LOG8 | 3 skipped tests (`sidequest-server`, `mcp-server`, `websocket`) | SQLite WASM cleanup issue - needs test DB isolation or jobRepository mocking |
| LOG9 | TODO comments in `schema-enhancement-pipeline.js`, `grouping.py`, `extract_blocks.py` | Feature work (Layer 3 semantic equivalence), not cleanup |
| LOG11 | 14 deep relative imports in `api/` | Deferred to TS migration Phase 9 (`backlog/2.0/BACKLOG.md`) |
| LOG12 | `doppler-resilience.example.js` (290 lines) | Kept as reference documentation for circuit breaker pattern |

### Summary

| Priority | Count | Theme |
|----------|-------|-------|
| Medium | 0 | ~~Pruning performance (CL-M1), test coverage (CL-M2)~~ ✅ Complete |
| Low | 0 | ~~Logger consistency (CL-L1), deployment docs (CL-L2), observability (CL-L3)~~ ✅ Complete |
| Deferred | 4 | Blocked by SQLite WASM, TS migration, or feature scope |
| **Total** | **4** | Only deferred items remain |

---

## Bugfix Audit - Open Items (2026-02-15)

> **Source:** Bugfix audit pipeline scans across `~/dev/active/`
> **Plans:** `~/dev/active/bugfix-*/plan.md`

### integritystudio/reports (P3-P4)

> **Plan:** `~/dev/active/bugfix-reports-2026-02-15/plan.md`
> **Status:** P0-P2 items fixed (10/13), 3 deferred

| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| BF-R1 | Generic font stack across all base CSS files (`report-base.css`, `portal-base.css`, `competitor-base.css`) — introduce DM Sans / Source Serif Pro | P3 | Pending |
| BF-R2 | Hub layout monotony — 10 sections with mostly 1 card each, needs varied layouts | P4 | Pending |
| BF-R3 | 4 parallel CSS variable namespaces across `css/*.css` — consolidate | P4 | Pending |

### aledlie/tcad-scraper (P1-P3)

> **Plan:** `~/dev/active/bugfix-tcad-scraper-2026-02-13/plan.md`
> **Status:** Health check passed (617/617 tests), lint issues found

| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| BF-T1 | `isNaN()` vs `Number.isNaN()` bug in `src/utils/formatters.ts:41` — potential incorrect date formatting | P1 | Pending |
| BF-T2 | Biome format drift — 57+ files with formatting issues (auto-fixable: `npx @biomejs/biome check --write .`) | P2 | Pending |
| BF-T3 | Unused import in `server/src/lib/__tests__/redis-cache.service.test.ts` | P2 | Pending |
| BF-T4 | LoadingSkeleton a11y — WAI-ARIA role should use semantic HTML element | P3 | Pending |
| BF-T5 | Import organization drift in 3 files (auto-fixable) | P3 | Pending |

### aledlie/AnalyticsBot (P3)

> **Plan:** `~/dev/active/bugfix-analyticsbot-2026-02-10/plan.md`
> **Status:** Core fixes deployed (Redis, CSP, debug code), 3 low-priority remaining

| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| BF-A1 | React Router v6 deprecation warnings (v7 future flags) | P3 | Pending |
| BF-A2 | 4 TODOs in UserService.ts (cache/Redis features) | P3 | Pending |
| BF-A3 | Jest `--detectOpenHandles` warning (async teardown) | P3 | Pending |

---

## Server Stability (2026-02-15)

> **Source:** Integration test crash — disabled pipeline trigger causes unhandled rejection
> **Severity:** Critical (server crash)

| ID | Location | Description | Status |
|----|----------|-------------|--------|
| SRV-C1 | `api/utils/worker-registry.js:getWorker()` | Triggering a disabled pipeline creates an `initPromise` that rejects with no listener, causing an unhandled rejection that crashes the process. Fix: fast-fail before creating the promise. | ✅ Done |

### Summary

| Repo | Pending | Theme |
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
| PROD-H1 | `sidequest/core/server.js` / `sidequest/core/database.js` | **Multi-process sql.js isolation** — API server and PM2 worker each load independent in-memory SQLite databases. Worker writes (job creation, status updates) are invisible to the API server until restart. Root cause of production job population gap. Needs shared persistence layer (file-based SQLite WAL mode, Redis, or IPC). | Pending |
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
| PROD-L2 | `tests/unit/database.test.js` | **Pre-existing test isolation issue** — "should import summary.json files" fails when run alongside `job-repository-factory.test.js` due to shared in-memory SQLite state. Passes in isolation (60/60). Needs test DB isolation or `beforeEach` reset. | Pending |

### Summary

| Priority | Count | Theme |
|----------|-------|-------|
| High | 1 | Multi-process DB isolation (PROD-H1) |
| Medium | 0 | ~~DB init race condition~~ ✅ Complete |
| Low | 1 | Test isolation (PROD-L2) |
| **Total** | **2** | |

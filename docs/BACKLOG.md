# Backlog

Technical debt and planned improvements.

**Last Updated:** 2026-02-25 | **Last Session:** 2026-02-25 (DRY refactor items 1-3 + code review fixes)

---

## Deferred / Blocked Items

| ID | Description | Reason |
|----|-------------|--------|
| LOG8 | `mcp-server.test.js` skipped — binary (`mcp-servers/duplicate-detection/index.js`) not implemented | Blocked on MCP server binary |
| LOG9 | TODO comments in `schema-enhancement-pipeline.js`, `grouping.py`, `extract_blocks.py` | Feature work (Layer 3 semantic equivalence), not cleanup |

---

## tcad-scraper Test Suite — Remaining Items (2026-02-24)

> **Repo:** `aledlie/tcad-scraper`
> **Completed:** TST-C1..C4 (Critical), TST-H1..H12 (High) — see [CHANGELOG 1.9.0](CHANGELOG.md)

### Medium — Redundancy and Noise

| ID | Location | Description | Status |
|----|----------|-------------|--------|
| TST-M1 | `server/vitest.config.ts:68-70` | **`mockReset + clearMocks` redundant** — `mockReset: true` supersedes `clearMocks: true`. Drop `clearMocks`. | |
| TST-M2 | `server/src/__tests__/integration.test.ts:117-129` | **`if (!hasFrontend) return` instead of `test.skipIf`** — Tests silently pass with no assertion. 3 of 4 frontend tests use wrong pattern. (1 of 3 fixed in TST-H6.) | |
| TST-M3 | `server/src/__tests__/factories.ts:22-24` | **`resetFactoryCounter` exported but never called** — Counter accumulates across tests, latent isolation issue. Call in global `beforeEach` or use `crypto.randomUUID()`. | |
| TST-M4 | `server/src/__tests__/test-utils.ts:62-123` | **`skipIfRedisUnavailable` throws errors to "skip"** — Reports as failure, not skip. Functions unused — all tests use `isRedisAvailable` directly. Remove. | |
| TST-M5 | `server/src/__tests__/security.test.ts:196-199` | **Documentation-only test** — `expect(true).toBe(true)` with "This is a note" comment. Delete test case. | |
| TST-M6 | `src/__tests__/App.test.tsx:63-88` | **Two tests assert same thing** — Both render `<App>` and check `PropertySearchContainer`. Neither observes loading state. Collapse into one. | |
| TST-M7 | `src/utils/__tests__/formatters.test.ts:78-103` | **"Type safety" block duplicates "edge cases"** for null/undefined — Same calls, zero runtime value from TS annotations. Remove block. | |

### Low — Info

| ID | Location | Description | Status |
|----|----------|-------------|--------|
| TST-L1 | `server/src/lib/__tests__/tcad-scraper.test.ts:188-307` | **Weak assertions** — `humanDelay` tests assert `expect(true).toBe(true)`, user agent tests assert only `expect(scraper).toBeDefined()`. | |

### Summary

| Priority | Count | Theme |
|----------|-------|-------|
| Medium | 7 | Redundant tests, unused helpers, silent skips |
| Low | 1 | Weak assertions |
| **Total** | **8** | All in tcad-scraper (separate repo) |

---

## DRY Refactoring Opportunities — sidequest/ (2026-02-25)

> **Context:** Analyzed `repomix-output.xml` and identified high-impact code duplication across pipeline runners and workers. Items 1-3 implemented (BasePipeline, JobStats import, Job type unification). Items 4-10 deferred for future refactoring.

### Medium

| ID | Location | Description |
|----|----------|-------------|
| DRY-M1 | `sidequest/workers/*.ts` (5 files) | **Git workflow options duplicated** — All workers redefine `gitWorkflowEnabled`, `gitBranchPrefix`, `gitBaseBranch`, `gitDryRun` in their options interfaces. Extract `BaseWorkerOptions` interface in `sidequest/core/server.ts` for inheritance. — `bugfix-audit-worker.ts`, `claude-health-worker.ts`, `git-activity-worker.ts`, `schema-enhancement-worker.ts`, `repomix-worker.ts` |
| DRY-M2 | `sidequest/pipeline-runners/duplicate-detection-pipeline.ts:75-84`, `sidequest/workers/duplicate-detection-worker.ts`, `sidequest/types/duplicate-detection-types.ts` | **RetryInfo/RetryMetrics/ScanMetrics redeclared** — Pipeline and worker both locally re-declare types that exist in canonical `duplicate-detection-types.ts`. Remove local copies, import from types file. — ~60 lines of redundant interface definitions |
| DRY-M3 | `sidequest/pipeline-core/git/pr-creator.ts`, `sidequest/pipeline-core/git/migration-transformer.ts`, `sidequest/pipeline-core/reports/json-report-generator.ts` | **MigrationStep TS interface inconsistent** — Three files define `MigrationStep` locally with diverging fields (`automated`, `estimated_time` missing in some). Create single shared type in `pipeline-core/types/` and import everywhere. |
| DRY-M4 | `sidequest/pipeline-core/reports/html-report-generator.ts`, `sidequest/pipeline-core/reports/json-report-generator.ts`, `sidequest/pipeline-core/reports/markdown-report-generator.ts` | **saveReport boilerplate** — All 3 generators implement identical `saveReport()` + `ensureParentDir()` pattern (~15-20 lines each). Extract shared `saveGeneratedReport(path, content)` helper or provide abstract base class. |
| DRY-M5 | `sidequest/pipeline-runners/duplicate-detection-pipeline.ts:~5382-5392` and `sidequest/pipeline-runners/types/duplicate-detection-types.ts:~6441-6452` | **DuplicateDetectionWorkerOptions in two places** — Type defined in both pipeline runner and types file with minor inconsistency (`maxConcurrentScans` vs `maxConcurrent`). Use canonical types version only, reconcile field names. |

### Low-Medium

| ID | Location | Description |
|----|----------|-------------|
| DRY-L2 | `sidequest/pipeline-core/git/branch-manager.ts:~1889`, `sidequest/pipeline-core/git/pr-creator.ts:~2047` | **_runGitCommand private method duplicated** — Both classes implement identical `private async _runGitCommand(cwd, args)`. Extract to shared `runGitCommand()` util in `pipeline-core/utils/` or have `PRCreator` delegate to `BranchManager`. — ~15 lines of duplication |

### Low

| ID | Location | Description |
|----|----------|-------------|
| DRY-L1 | `sidequest/pipeline-core/annotators/test_semantic_annotator.py:~992-1002`, `sidequest/pipeline-core/similarity/test_grouping_layer3.py:~4201-4209` | **Python run_tests() runner duplicated** — Two test files re-implement identical manual test runner (~20 lines each). Extract to shared `pipeline-core/utils/test_runner.py:run_test_classes(classes)` utility. — Low impact on prod, but reduces test maintenance burden. |

---

## Code Review Findings — Pipeline Runners (2026-02-25)

> **Source:** code-reviewer audit of `BasePipeline` refactoring session. High #2, Medium #5, Low #9 fixed inline. Remaining findings deferred.

### High — Pre-existing (amplified by centralization)

| ID | Location | Description |
|----|----------|-------------|
| CR-H1 | `sidequest/pipeline-runners/base-pipeline.ts:24-34` | **`waitForCompletion()` race condition** — Poll can resolve before work drains if first tick fires when `active=0 && queued=0` between dequeue and execute in `SidequestServer.processQueue()`. Fix: event-based drain via `job:completed`/`job:failed` counts instead of polling. |
| CR-H3 | `bugfix-audit-pipeline.ts:115`, `claude-health-pipeline.ts:204`, `git-activity-pipeline.ts:117-122`, `schema-enhancement-pipeline.ts:200,239,243` | **Worker methods accessed via `as unknown as` casts** — Defeats `TWorker` generic typing; renames/signature changes won't be caught by TS. Fix: make worker methods `public` on their respective classes. |

### Medium — Pre-existing

| ID | Location | Description |
|----|----------|-------------|
| CR-M4 | All 5 pipeline `job:failed` handlers, `base-pipeline.ts:55` | **`job.error as Error` unsafe cast** — `Job.error` is `{ message, stack?, code?, cancelled? } \| null`, not an `Error` instance. Fix: update `logError` signature to accept error shape, or construct real `Error` from fields. |
| CR-M8 | `bugfix-audit-pipeline.ts:51-62`, `schema-enhancement-pipeline.ts:60-71` | **Trailing `...options` spread overrides validated defaults** — `...options` at end of worker constructor args silently overrides all explicit values above it. Fix: spread first, then set explicit values after. |

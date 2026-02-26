# Backlog

Technical debt and planned improvements.

**Last Updated:** 2026-02-26 | **Last Session:** 2026-02-26 (DRY-M1..M5, DRY-L1..L2, CR-H1, CR-H3, CR-M4, CR-M8 implemented)

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

> **Context:** Analyzed `repomix-output.xml` and identified high-impact code duplication across pipeline runners and workers. Items 1-3 implemented (BasePipeline, JobStats import, Job type unification). Items 4-10 implemented 2026-02-26.

### Medium

| ID | Location | Description | Status |
|----|----------|-------------|--------|
| DRY-M1 | `sidequest/workers/*.ts` (5 files) | **Git workflow options duplicated** — Worker options now extend `SidequestServerOptions`, removing ~40 lines of redeclared fields. | Done |
| DRY-M2 | `duplicate-detection-pipeline.ts`, `duplicate-detection-worker.ts`, `duplicate-detection-types.ts` | **RetryInfo/RetryMetrics/ScanMetrics redeclared** — Pipeline and worker now import from canonical `duplicate-detection-types.ts`. Removed ~60 lines. | Done |
| DRY-M3 | `pr-creator.ts`, `migration-transformer.ts`, `json-report-generator.ts` | **MigrationStep TS interface inconsistent** — Unified into `sidequest/pipeline-core/types/migration-types.ts` with all fields covered. | Done |
| DRY-M4 | `html-report-generator.ts`, `json-report-generator.ts`, `markdown-report-generator.ts` | **saveReport boilerplate** — Extracted `saveGeneratedReport(path, content)` to `fs-helpers.ts`. | Done |
| DRY-M5 | `duplicate-detection-pipeline.ts`, `duplicate-detection-worker.ts`, `duplicate-detection-types.ts` | **DuplicateDetectionWorkerOptions in two places** — Canonical version now extends `SidequestServerOptions`, reconciled `maxConcurrentScans` vs `maxConcurrent`. | Done |

### Low-Medium

| ID | Location | Description | Status |
|----|----------|-------------|--------|
| DRY-L2 | `branch-manager.ts`, `pr-creator.ts` | **_runGitCommand private method duplicated** — Extracted to shared `runGitCommand()` in `sidequest/pipeline-core/utils/process-helpers.ts`. | Done |

### Low

| ID | Location | Description | Status |
|----|----------|-------------|--------|
| DRY-L1 | `test_semantic_annotator.py`, `test_grouping_layer3.py` | **Python run_tests() runner duplicated** — Extracted to `pipeline-core/utils/test_runner.py:run_test_classes()`. | Done |

---

## Code Review Findings — Pipeline Runners (2026-02-25)

> **Source:** code-reviewer audit of `BasePipeline` refactoring session. High #2, Medium #5, Low #9 fixed inline. Remaining findings implemented 2026-02-26.

### High — Pre-existing (amplified by centralization)

| ID | Location | Description | Status |
|----|----------|-------------|--------|
| CR-H1 | `base-pipeline.ts` | **`waitForCompletion()` race condition** — Replaced polling with event-based drain via `job:completed`/`job:failed`. Listeners registered before immediate stats check to close TOCTOU window. | Done |
| CR-H3 | 5 pipeline runners | **Worker methods accessed via `as unknown as` casts** — All casts removed; worker methods called directly via typed `this.worker`. plugin-management-pipeline also fixed (missed in initial pass). | Done |

### Medium — Pre-existing

| ID | Location | Description | Status |
|----|----------|-------------|--------|
| CR-M4 | All 8 pipeline runners + base-pipeline.ts | **`job.error as Error` unsafe cast** — Removed all `as Error` and `as unknown as Error` casts in job:failed handlers and catch blocks. `logError` accepts `Error \| unknown`. | Done |
| CR-M8 | `bugfix-audit-pipeline.ts`, `schema-enhancement-pipeline.ts` | **Trailing `...options` spread overrides validated defaults** — Moved `...options` to first position so explicit values are not overridden. | Done |

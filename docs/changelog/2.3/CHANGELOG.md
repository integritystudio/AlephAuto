# Changelog — v2.3.x

All notable changes for the v2.3 release cycle.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [2.3.20] - 2026-03-09

### Summary

CX15 continued: extracted helpers from `test-error-classification-ui.ts` (2 more functions below threshold, 17 remaining). DRY improvements: replaced inline duration formatting across 5 files with shared `time-helpers.ts` utilities. Confirmed prefer-const violations already resolved.

### Changed

- **CX15** (partial) — Extracted helpers from `test-error-classification-ui.ts`:
  - `testErrorMessages` (67→13 lines): extracted `evaluateErrorScenario()` helper, `ErrorScenario` interface, and `ERROR_SCENARIOS` constant.
  - `testActivityFeed` (68→36 lines): extracted `validateActivityStructure()` helper.
  - CX15 progress: 5 of 22 fixed (17 remaining).

- **CS9** — Code Standards — Verified 0 `prefer-const` violations remain (previously reported 95). Already resolved in prior sessions.

- **DUP1** — DRY Refactor — Replaced inline duration formatting across the codebase with shared utilities from `sidequest/utils/time-helpers.ts`:
  - `report-generator.ts`: replaced inline `toFixed(2)` duration calc with `formatDuration()`.
  - `html-report-generator.ts`: replaced `duration.toFixed(2)s` with `formatDuration(duration)`.
  - `markdown-report-generator.ts`: replaced `duration_seconds?.toFixed(N)s` with `formatDuration()`.
  - `timing-helpers.ts`: replaced 5-line `elapsedFormatted` implementation with `formatDuration()`.
  - `activity-feed.ts`: replaced inline `instanceof Date` duration calc with `calculateDurationSeconds()`, and `toFixed(2)s` with `formatDuration()`. Removed unused `TIME_MS` import.

---

## [2.3.19] - 2026-03-09

### Summary

Addressed remaining complexity findings from full-repo analysis: reduced dashboard UI component complexity and extracted setup script step functions to meet threshold constraints (CX14, CX16). Also fixed partial progress on integration test runner length (CX15) with helper extraction in test orchestration.

### Changed

- **CX14** `frontend/src/hooks/useWebSocketConnection.ts` and `api/activity-feed.ts`:
  - Extracted `mapApiActivity()` helper function to isolate activity-to-store transformation logic.
  - Extracted `buildSystemStatus()` helper function to consolidate status object construction.
  - Extracted `applyActivityFeed()` helper function to decouple feed update logic from component lifecycle.
  - Reduced hook cyclomatic complexity from 24 → 12 (below 15 threshold).

- **CX15** `tests/integration/test-*.ts` — Partial progress (3 of 22 functions fixed):
  - `test-automated-pipeline.ts`: Extracted poll/wait helpers from `main()` (133 → 28 lines).
  - `test-gitignore-respect.ts`: Extracted setup/assertion helpers from `testGitignoreRespect()` (121 → 26 lines).
  - `test-report-generation.ts`: Extracted report-building helpers from `main()` (120 → 30 lines).
  - `test-single-job.ts`: Replaced hand-rolled poll loop with existing `waitForJobCompletion()` utility (DRY improvement).
  - Remaining 19 functions still exceed 50-line threshold; deferred for future sprint.

- **CX16** `docs/setup/configure-*.js` and `setup/sentry-to-discord.js`:
  - `setupDopplerSentry()`: Extracted validation/check/prompt/update/print helpers (136 → 21 lines).
  - `setupSentry()`: Extracted webhook-check and rule-update helpers (128 → 25 lines).
  - `configure-discord-alerts.js`:
    - Extracted webhook-action, environment validation, rule update, and summary-printing helpers.
    - Reduced `main()` from 73 → 19 lines.
    - Migrated from CommonJS to ESM.
    - Extracted `WEBHOOK_ACTION_ID` constant and `ruleHasWebhook()`, `validateEnvironment()`, `updateAllRules()`, `printSummary()` helpers.

### Validation

- `npm run typecheck` (pass)
- `npm test` — 1169/1169 pass
- Complexity thresholds met: cyclomatic ≤10, cognitive ≤15, length ≤50 lines

### Commits

```
47bd85e refactor(setup): fix CX16 — extract step functions from long setup scripts
403b75b refactor(tests): fix CX15 — extract helpers from long integration test runners
5bda198 refactor(dashboard): extract activity-feed and status helpers to fix CX14
22da0eb refactor(dashboard): share ACTIVITY_TYPE_MAP between hook and ws service
```

---

## [2.3.18] - 2026-03-09

### Summary

Addressed dashboard UI code review findings (M43–M44, L19–L22): log injection prevention, React key collision fix, type safety improvements, and minor correctness fixes.

### Fixed

- **M43** `api/routes/jobs.ts`: Added `sanitizeLogField()` helper; strips `\r\n\t` and caps at 200 chars. Applied to all 6 user-influenced fields in synthesized log output (`repositoryPath`, `retryCount`, `duration_seconds`, `summary`, `filesProcessed`, `error.message`)
- **M44** `frontend/src/hooks/useWebSocketConnection.ts`: Replaced `activity-${Date.now()}` fallback IDs with `crypto.randomUUID()` in both `loadInitialData` and `pollForUpdates` — prevents React key collisions when multiple activity items lack server-provided IDs in the same tick
- **L19** `frontend/src/App.tsx`: Replaced `'cancelled' as any` and `'queued' as any` with `JobStatus.CANCELLED` and `JobStatus.QUEUED` enum members; added `JobStatus` import
- **L20** `frontend/src/hooks/useWebSocketConnection.ts`: Added `ApiJob`, `ApiPipeline`, `ApiActivity`, `ApiStatusData` interfaces replacing all `any` parameters in `mapActiveJob`, `mapQueuedJob`, `mapPipeline`, `applyJobsToStore`, and `fetchStatus()`
- **L21** `frontend/src/hooks/useWebSocketConnection.ts`: Removed `isInitialized.current = false` from cleanup; guard now remains effective across component lifetime. Updated comment to reflect actual behavior
- **L22** `frontend/src/components/PipelineDetailPanel/PipelineDetailPanel.tsx`: Conditional ellipsis — only appended when `job.id.length > 20`

### Validation

- `npm run typecheck` (pass)
- `npm test` — 1169/1169 pass

---

## [2.3.17] - 2026-03-08

### Summary

Fixed semantic constant misuse (`CONST10`) where test constants aliased production policy values (`CONFIG_POLICY`, `RETRY`, `TIMEOUTS`) for coincidental numeric matches instead of declaring intent-specific values.

### Changed

- `tests/integration/error-recovery.integration.test.ts`: replaced 6 aliased production constants with test-local literals (`PORT_STEP`, `BROADCAST_FAILURE_COUNT`, `DOPPLER_FAILURE_COUNT`, `RECENT_ACTIVITY_FETCH_LIMIT`, `FALLBACK_RANGE_SIZE = 10`); removed `RETRY` import
- `tests/integration/port-manager.integration.test.ts`: replaced 7 aliased production constants with test-local literals (`PORT_STEP`, `PORT_STEP_TWO`, `PORT_STEP_THREE`, `SERVER_COUNT`, `FALLBACK_SMALL_RANGE_SIZE = 5`, `FALLBACK_STANDARD_RANGE_SIZE = 10`, `SHUTDOWN_FETCH_TIMEOUT_MS = 100`, `CUSTOM_SHUTDOWN_TIMEOUT_MS = 10_000`); removed `RETRY` and `TIMEOUTS` imports
- Added `tests/unit/const10-decoupling.test.ts`: 21-test regression guard (banned alias checks, import assertions, literal value verification, production drift detection)
- Closed and migrated `CONST10` in `docs/BACKLOG.md`

### Validation

- `npm run typecheck` (pass)
- `npm run test:integration` — 53/53 pass
- `npm test` — 1169/1169 pass (includes 21 new CONST10 regression guard tests)

---

## [2.3.16] - 2026-03-06

### Summary

Migrated completed backlog item `CONST9` into changelog tracking after eliminating `no-magic-numbers` violations in the highest-volume test hotspots.

### Changed

- Resolved `CONST9` in test hotspots by replacing inline numeric literals with shared constants and named local test constants:
  - `tests/unit/port-manager.test.ts`
  - `tests/unit/activity-feed.test.ts`
  - `tests/integration/port-manager.integration.test.ts`
  - `tests/integration/error-recovery.integration.test.ts`
- Closed and migrated `CONST9` in `docs/BACKLOG.md`.

### Validation

- `npx eslint tests/unit/port-manager.test.ts tests/unit/activity-feed.test.ts tests/integration/port-manager.integration.test.ts tests/integration/error-recovery.integration.test.ts -f json`
  - `no-magic-numbers` violations in these files: `156 -> 0`
- `npm run test:validate-backlog` (pass)

---

## [2.3.15] - 2026-03-06

### Summary

Migrated completed constants backlog items `CONST4`, `CONST6`, `CONST7`, and `CONST8` from `docs/BACKLOG.md` into changelog tracking.

### Changed

- `CONST4`: Consolidated repeated duration literals through shared internal duration tokens in:
  - `sidequest/core/constants.ts`
- `CONST6`: Scoped lint policy for constants-definition modules by disabling `no-magic-numbers` in:
  - `eslint.config.js`
- `CONST7`: Centralized runtime configuration defaults/bounds in:
  - `sidequest/core/constants.ts` (`CONFIG_POLICY`)
  - `sidequest/core/config.ts`
- `CONST8`: Centralized scan/report/rate-limit policy values in:
  - `sidequest/core/constants.ts` (`INTER_PROJECT_SCAN`, `MARKDOWN_REPORT`, expanded `RATE_LIMIT`)
  - `sidequest/pipeline-core/inter-project-scanner.ts`
  - `sidequest/pipeline-core/reports/markdown-report-generator.ts`
  - `api/middleware/rate-limit.ts`
- Backlog migration updates in:
  - `docs/BACKLOG.md`

### Validation

- `npm run test:validate-backlog` (pass)

---

## [2.3.14] - 2026-03-05

### Summary

Migrated completed backlog item `CONST5` into changelog tracking after implementing shared effort-tier modeling and regression/e2e coverage for affected pipelines.

### Changed

- Replaced duplicated effort-tier constants with a shared enum and unit-specific mapping tables:
  - `sidequest/pipeline-core/constants.py`
  - `sidequest/pipeline-core/models/consolidation_suggestion.py`
  - `sidequest/pipeline-core/extractors/extract_blocks.py`
- Added regression coverage for the new effort-tier mapping behavior:
  - `sidequest/pipeline-core/models/test_consolidation_suggestion_effort.py`
  - `sidequest/pipeline-core/extractors/test_extract_blocks.py`
- Added E2E/smoke coverage for touched pipeline entrypoints:
  - `sidequest/pipeline-core/extractors/test_extract_blocks.py` (`main()` stdin->JSON orchestration)
  - `sidequest/pipeline-runners/test_collect_git_activity.py` (`main()` weekly + monthly flows)
- Backlog `CONST5` migrated and closed in `docs/BACKLOG.md`.

### Validation

- `pytest -q sidequest/pipeline-core/models/test_consolidation_suggestion_effort.py sidequest/pipeline-core/extractors/test_extract_blocks.py sidequest/pipeline-runners/test_collect_git_activity.py` (pass)
- `npm run test:validate-backlog` (pass)

---

## [2.3.13] - 2026-03-04

### Summary

Re-aligned pipeline runner file-permission policy with the post-`37d2159` model (managed runners are non-executable), updated integration test expectations, and refreshed repomix/git-history artifacts.

### Changed

- Reverted unintended execute-bit flips introduced by `b0d0821` for managed pipeline runners:
  - `sidequest/pipeline-runners/{bugfix-audit,claude-health,dashboard-populate,duplicate-detection,git-activity,gitignore,plugin-management,repo-cleanup,schema-enhancement}-pipeline.ts`
  - Mode restored to `100644` for policy consistency with `scripts/validate-permissions.ts`.
- Updated `tests/integration/pipeline-execution.integration.test.ts`:
  - Scenario 2 now asserts managed runners are **not executable**.
  - Scenario 10 now validates only managed entrypoints against non-executable policy.
  - Scenario 4 now restores original file mode after temporary shebang execution test to avoid cross-test side effects.

### Documentation

- Regenerated repository analysis artifacts:
  - `docs/repomix/token-tree.txt`
  - `docs/repomix/repo-compressed.xml`
  - `docs/repomix/repomix.xml`
  - `docs/repomix/gitlog-top20.txt`
  - `sidequest/docs/gitlog-sidequest.txt`

### Validation

- `node --strip-types --test tests/integration/pipeline-execution.integration.test.ts` (pass)
- `node --strip-types --test sidequest/pipeline-runners/direct-execution-path-guard.test.ts` (pass)

---

## [2.3.12] - 2026-03-04

### Summary

Documentation sync release to align runbooks, deployment guides, API reference, and architecture/component docs with current TypeScript runtime paths, Node 22 execution model, and queue/job API behavior.

### Changed

- Updated execution/deployment docs to current runtime conventions:
  - TypeScript entrypoints (`*.ts`) with `node --strip-types`
  - PM2 config path `config/ecosystem.config.cjs`
  - Node requirement alignment to v22+
- Updated API docs to match current routes and behavior:
  - Removed stale scan endpoints (`/api/scans/recent`, `/api/scans/stats`, `DELETE /api/scans/:jobId`)
  - Added/updated jobs endpoints (`GET /api/jobs`, `GET /api/jobs/:jobId`, `POST /api/jobs/:jobId/cancel`, `POST /api/jobs/:jobId/retry`)
  - Clarified cancel semantics (queued/paused jobs only; running jobs not cancellable)
- Updated stale file/path references caused by JS→TS migrations and file moves:
  - `api/server.ts`, `api/*/*.ts`, `sidequest/workers/*.ts`, `sidequest/pipeline-runners/*.ts`
  - `sidequest/pipeline-core/types/duplicate-detection-types.ts` path adoption
- Updated Doppler resilience docs to remove deleted example-file references and point to active docs/source.
- Updated architecture/component documentation references and command snippets for current file layout.

### Documentation

- Refreshed docs across:
  - `docs/API_REFERENCE.md`
  - `docs/runbooks/PIPELINE_EXECUTION_FIX_SUMMARY.md`
  - `docs/deployment/*.md` (verification, CI/CD, traditional deployment, README, summary)
  - `docs/architecture/*` (including `README.md`, `CHEAT-SHEET.md`, `CACHE_TESTING.md`, `similarity-algorithm.md`, `DOPPLER_RESILIENCE_IMPLEMENTATION.md`)
  - `docs/components/*` (plugin manager, claude health, bugfix audit, dashboard populate)
  - `docs/quickstart/doppler-circuit-breaker.md`
  - `docs/runbooks/DOPPLER_CIRCUIT_BREAKER.md`, `docs/runbooks/doppler-monitoring-setup.md`, `docs/runbooks/fix-missing-types.md`
  - `docs/MCP_SERVERS.md`, `docs/MERMAID.md`, `docs/dashboard_ui/*`, `docs/INSTALL.md`

### Validation

- Performed targeted stale-reference scans across active docs and resolved all high-confidence non-historical findings.
- Remaining hits are limited to intentional historical/changelog context (e.g., legacy references in top-level `docs/CHANGELOG.md`).

---

## [2.3.11] - 2026-03-04

### Summary

Migrated completed code-review items from `docs/03-04-review.md` into changelog tracking.

### Changed

- Consolidated completed complexity review items in changelog tracking:
  - Completed: `CX1-CX11`
  - Retired: `CX12-CX13`
- Consolidated completed standards review items in changelog tracking:
  - Completed: `SV1-SV3`
- Consolidated completed code-smell review items in changelog tracking:
  - Completed: `CS5`, `CS7`, `CS8`
- Consolidated completed documentation review items in changelog tracking:
  - Completed: `DOC1-DOC8`
- Recorded the review-state completion snapshot from `docs/03-04-review.md`:
  - Active deferred/blocked items: `0`
  - Remaining active backlog from analyzer streams: `None`
  - Documentation sync baseline: `100.0%` (`913/913`, `0` undocumented, `0` stale)

### Documentation

- Updated `docs/03-04-review.md` changelog section reference to include this migration entry.

---

## [2.3.10] - 2026-03-04

### Summary

Resolved standards backlog item `SV1` by migrating remaining non-test `console.log` usage to structured logging/output helpers and closing the standards backlog.

### Changed

- Migrated remaining `console.log` usage in:
  - `sidequest/pipeline-runners/duplicate-detection-pipeline.ts`
  - `sidequest/pipeline-runners/claude-health-pipeline.ts`
  - `sidequest/pipeline-runners/plugin-management-pipeline.ts`
  - `sidequest/utils/refactor-test-suite.ts`
  - `api/server.ts`
  - `api/preload.ts`
  - `sidequest/pipeline-core/scanners/codebase-health-scanner.ts`
  - `sidequest/pipeline-core/reports/html-report-generator.ts`
- Replaced CLI usage `console.error` in `codebase-health-scanner.ts` with stderr writer helper (`printUsage`).
- Backlog `SV1` migrated and closed in `docs/BACKLOG.md`.

### Validation

- Production-scope `console.log` baseline (excluding tests/docs/scripts/frontend/etc.): `0`
- `npm run test:validate-backlog` (pass)

---

## [2.3.9] - 2026-03-04

### Summary

Resolved complexity backlog item `CX11` by refactoring `docs/setup/sentry-to-discord.js` into smaller formatting and dispatch helpers while preserving webhook behavior.

### Changed

- Refactored `docs/setup/sentry-to-discord.js`:
  - Split formatting flow into helper functions (`resolve*`, `buildEmbed*`) to reduce branch density in `formatSentryToDiscord`.
  - Split HTTP request handling into route/endpoint helpers (`handleHealthCheck`, `handleSentryWebhook`, `routeRequest`).
  - Centralized response writing helpers (`writeJson`, `writeText`) and request body collection.
  - Updated Discord payload size handling with `Buffer.byteLength(data)` for `Content-Length`.
- Backlog `CX11` migrated and closed in `docs/BACKLOG.md`.

### Validation

- `node --check docs/setup/sentry-to-discord.js` (pass)
- `npm run test:validate-backlog` (pass)

---

## [2.3.8] - 2026-03-04

### Summary

Backlog hygiene release for complexity items `CX11-CX13`: reclassified `CX11` as an active setup script (not archived) and retired `CX12-CX13` by removing archived one-time migration scripts.

### Removed

- `scripts/archive/migrate-db-to-render.js` (`CX12`)
- `scripts/archive/generate-retroactive-reports.js` (`CX13`)

### Changed

- Updated `docs/BACKLOG.md` complexity section:
  - Reclassified `CX11` (`docs/setup/sentry-to-discord.js`) from "Archive file" to "Active setup script (manual ops)".
  - Migrated and closed `CX12-CX13`.

### Validation

- `npm run test:validate-backlog` (pass)

---

## [2.3.7] - 2026-03-04

### Summary

Resolved documentation backlog items `DOC1-DOC7` by adding and normalizing JSDoc across API activity/event modules, middleware, and Sidequest core workflow/database/server modules.

### Changed

- Updated JSDoc coverage in API modules:
  - `api/activity-feed.ts` (public `ActivityFeedManager` API)
  - `api/event-broadcaster.ts` (all broadcaster public methods; removed malformed duplicate blocks)
  - `api/middleware/auth.ts`, `api/middleware/validation.ts`, `api/middleware/error-handler.ts`
- Updated JSDoc coverage in Sidequest core modules:
  - `sidequest/core/database.ts` (exported function params/returns)
  - `sidequest/core/server.ts` (base class + public lifecycle/queue/job methods)
  - `sidequest/core/git-workflow-manager.ts` (public workflow methods)
- Backlog `DOC1-DOC7` migrated and closed in `docs/BACKLOG.md`.

### Validation

- `node --strip-types --test tests/unit/activity-feed.test.ts tests/unit/event-broadcaster.test.ts tests/unit/database.test.ts tests/unit/sidequest-server.test.ts` (pass)
- `node --strip-types --test tests/unit/input-validation.test.ts tests/unit/validation.test.ts` (pass)
- `npm run test:validate-backlog` (pass)

---

## [2.3.6] - 2026-03-04

### Summary

Resolved documentation backlog item `DOC8` by adding JSDoc coverage for the `JobRepository` public API.

### Changed

- Updated `sidequest/core/job-repository.ts`:
  - Added method-level JSDoc for constructor and all public methods.
  - Documented repository lifecycle methods (`initialize`, `close`, `reset`) and query/import methods with params and return behavior.
  - Added JSDoc to `createJobRepository` factory function.
- Backlog `DOC8` migrated and closed in `docs/BACKLOG.md`.

### Validation

- `node --strip-types --test tests/unit/job-repository-factory.test.ts` (pass)

---

## [2.3.5] - 2026-03-04

### Summary

Resolved backlog code-smell item `CS8` by reducing `SchemaMCPTools` class complexity and method density through helper extraction with no public API changes.

### Changed

- Refactored `sidequest/utils/schema-mcp-tools.ts`:
  - Extracted schema type inference, schema assembly, description parsing, validation, impact scoring, and JSON-LD injection logic into file-level helpers.
  - Reduced class body to lightweight wrapper methods over pure helper functions.
  - Preserved existing method signatures and behavior used by schema-enhancement worker and unit tests.
- Backlog `CS8` migrated and closed in `docs/BACKLOG.md`.

### Validation

- `node --strip-types --test tests/unit/schema-mcp-tools.test.ts` (22 passed)
- `npm run typecheck -- --pretty false` (pass)

---

## [2.3.4] - 2026-03-04

### Summary

Resolved backlog code-smell item `CS7` by reducing `WorkerRegistry` class size through helper extraction while preserving worker initialization and shutdown behavior.

### Changed

- Refactored `api/utils/worker-registry.ts`:
  - Extracted circuit-breaker, worker initialization, stats aggregation, and shutdown coordination logic into file-level helpers.
  - Reduced `WorkerRegistry` class body from ~348 lines to ~165 lines.
  - Kept public API and initialization semantics unchanged.
- Backlog `CS7` migrated and closed in `docs/BACKLOG.md`.

---

## [2.3.3] - 2026-03-04

### Summary

Resolved complexity backlog item `CX7` by simplifying function-name extraction fallback logic in the accuracy test suite.

### Changed

- Refactored `tests/accuracy/accuracy-test.ts`:
  - Extracted `extractNameFromTags`, `extractNameFromSourceCode`, and `extractNameFromLocation` helpers.
  - Reduced `extractFunctionName` to a single fallback chain while preserving extraction order and output behavior.
- Backlog `CX7` migrated and closed in `docs/BACKLOG.md`.

---

## [2.3.2] - 2026-03-04

### Summary

Resolved complexity backlog item `CX6` by refactoring the inter-project integration scan script into focused helper functions and retiring the item from active backlog.

### Changed

- Refactored `tests/integration/test-inter-project-scan.ts`:
  - Extracted argument/path resolution, scanner setup, scan execution, report generation, and output-printing helpers from `main()`.
  - Reduced `main()` to orchestration flow while preserving behavior and logging.
- Backlog `CX6` migrated and closed in `docs/BACKLOG.md`.

---

## [2.3.1] - 2026-03-04

### Summary

Backlog hygiene release. Migrated completed backlog items to changelog, retired a non-runnable MCP integration test, and removed stale Layer 3 TODO markers that were already implemented.

### Removed

- `tests/integration/test-mcp-server.ts` (retired)
  - The test referenced deleted binary `mcp-servers/duplicate-detection/index.js` removed earlier in commit `170ca02`.

### Changed

- Backlog `LOG8` migrated and closed (test retired).
- Backlog `LOG9` migrated and closed (stale TODO references removed):
  - `sidequest/pipeline-core/similarity/grouping.py`
  - `sidequest/pipeline-core/extractors/extract_blocks.py`
- `docs/BACKLOG.md` reduced to active items in complexity/smell/standards sections.

---

## [2.3.0] - 2026-03-03

### Summary

Pipeline-core cleanup focused on magic-number reduction and constants consolidation in Python similarity/extractor/reporting modules, plus utility scripts for repomix artifact generation.

### Added

- Repomix generation helper scripts:
  - `scripts/generate-repomix.sh`
  - `scripts/generate-repo-compressed.sh`
  - `scripts/generate-token-tree.sh`
  - `scripts/repomix-regen.sh`
  (commit `f69a95c`)

### Changed

- Centralized and expanded constants in `sidequest/pipeline-core/constants.py` (`56d2c5a`, `d71098e`, `99f96d5`, `ffb9601`, `ce97a5f`)
- Reduced magic-number footprint in pipeline-core and runner modules (commit message notes: `126 -> 31`) (`ce97a5f`)
- Extracted chart color values into constants for `collect_git_activity.py` (`1a9ce69`)
- Reworded effort comments in consolidation model to avoid false positives from magic-number tooling (`964abc5`)
- Replaced numbered docstring lists with bullet style in:
  - `sidequest/pipeline-core/similarity/grouping.py` (`4690b4d`)
  - `sidequest/pipeline-core/similarity/structural.py` (`f6d1717`)

### Notes

- Commit `f69a95c` also included backup snapshots under `.ast-grep-backups/` and `sidequest/pipeline-core/similarity/.ast-grep-backups/` along with script additions.

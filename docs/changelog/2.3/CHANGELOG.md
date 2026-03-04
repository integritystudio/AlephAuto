# Changelog — v2.3.x

All notable changes for the v2.3 release cycle.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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

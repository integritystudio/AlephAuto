# Changelog — v2.1.0

All notable changes for the v2.1 release cycle.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [2.1.0] - 2026-02-26

### Summary

DRY refactoring and code review remediation across pipeline runners, workers, and shared utilities. BasePipeline centralization, type unification, duplicate elimination, and full resolution of all pipeline runner review findings.

### Added — DRY Refactoring (sidequest/)

- `sidequest/pipeline-runners/base-pipeline.ts` — `BasePipeline<TWorker>` shared base for class-based pipeline runners with `waitForCompletion()`, `scheduleCron()`, `getStats()` (DRY-M1..M5, DRY-L1..L2)
- `sidequest/pipeline-core/types/migration-types.ts` — Canonical `MigrationStep` interface unifying 3 inconsistent copies (DRY-M3)
- `sidequest/pipeline-core/utils/process-helpers.ts` — Shared `runGitCommand()` extracted from duplicated private methods (DRY-L2)
- `sidequest/pipeline-core/utils/test_runner.py` — `run_test_classes()` extracted from duplicated Python test runners (DRY-L1)
- `saveGeneratedReport()` helper in `fs-helpers.ts` — eliminates saveReport boilerplate across 3 report generators (DRY-M4)

### Changed — DRY Refactoring

- Worker options now extend `SidequestServerOptions`, removing ~40 lines of redeclared fields across 5 workers (DRY-M1)
- `RetryInfo`/`RetryMetrics`/`ScanMetrics` consolidated into canonical `duplicate-detection-types.ts` — removed ~60 duplicate lines (DRY-M2)
- `DuplicateDetectionWorkerOptions` reconciled to single canonical version extending `SidequestServerOptions` (DRY-M5)

### Fixed — Code Review: High Severity

- **CR-H1:** `waitForCompletion()` race condition — replaced polling with event-based drain via `job:completed`/`job:failed` listeners registered before immediate stats check to close TOCTOU window
- **CR-H2:** Local `Job` interface in `duplicate-detection-pipeline.ts` shadowed canonical type with incompatible error shape — consolidated to single canonical type
- **CR-H3:** All `as unknown as` worker method casts removed across 5 pipeline runners — worker methods called directly via typed `this.worker` (including plugin-management-pipeline)

### Fixed — Code Review: Medium Severity

- **CR-M1:** Removed duplicate `runCommand` re-export/import in `process-helpers.ts`
- **CR-M2:** Replaced `config as Record<string, unknown>` pattern with `config.propertyName as TargetType` across all 8 pipeline runners (CLAUDE.md violation)
- **CR-M3:** Standardized `job.retryCount` — removed inconsistent `job.retries` usage in `gitignore-pipeline.ts` and `repo-cleanup-pipeline.ts`
- **CR-M4:** Removed all `as Error` and `as unknown as Error` casts in job:failed handlers — `logError` accepts `Error | unknown`
- **CR-M5:** Removed unused `joinLines` export from `fs-helpers.ts`
- **CR-M8:** Fixed trailing `...options` spread overriding validated defaults in `bugfix-audit-pipeline.ts` and `schema-enhancement-pipeline.ts` — moved spread to first position

### Fixed — Code Review: Low Severity

- **CR-L1:** Standardized `node-cron` import style in `duplicate-detection-pipeline.ts` to match named import pattern
- **CR-L2:** Documented `runCommand` vs `runGitCommand` intent in `branch-manager.ts` — `runCommand` retained for non-git `gh` CLI calls
- **CR-L3:** Fixed bare relative import in `test_runner.py` — uses path insertion for working-directory independence
- **CR-L4:** Replaced direct `process.env` access with config object in `process-helpers.ts` and other pipeline runners (CLAUDE.md violation)

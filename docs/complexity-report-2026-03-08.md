# Complexity Analysis Report

**Project:** jobs
**Date:** 2026-03-08 | **Last Updated:** 2026-03-08 (post-CX14/CX15/CX16 fixes, CX15 fully complete v2.3.22)
**Tool:** ast-grep-mcp (analyze_complexity, enforce_standards, detect_security_issues, find_duplication, detect_orphans)
**Thresholds:** Cyclomatic > 10 | Cognitive > 15 | Nesting > 4 | Length > 50 lines

---

## Executive Summary

| Metric | Value |
|--------|-------|
| TypeScript files analyzed | 234 |
| Functions extracted | 165 |
| Functions exceeding thresholds | 24 → **0** (after CX15 complete) |
| Avg cyclomatic complexity | 3.68 |
| Avg cognitive complexity | 2.56 |
| Max cyclomatic | ~~19~~ **16** |
| Max cognitive | 15 |
| Standards violations | 95 (all `prefer-const`, info severity) |
| Security issues | 0 |
| Duplication groups | ~~1~~ **0** |

Overall health is excellent. No security vulnerabilities detected. All complexity hotspots resolved including all 22 long test functions (CX15 complete, v2.3.22).

---

## Complexity Violations

### Critical: Cyclomatic Complexity Exceeded

| Function | File | Lines | Cyc | Cog | Len | Violations | Status |
|----------|------|-------|-----|-----|-----|------------|--------|
| ~~`loadInitialData`~~ | `frontend/src/hooks/useWebSocketConnection.ts` | 112-161 | ~~19~~ ~5 | 15 | 50 | cyclomatic | **Fixed** (CX14, v2.3.19) |
| ~~`testActivityFeed`~~ | `tests/integration/test-error-classification-ui.ts` | 220-287 | ~~16~~ ~6 | 12 | ~~68~~ 36 | cyclomatic, length | **Fixed** (CX15, v2.3.20) |

### High: Length Exceeded (Production Code)

| Function | File | Lines | Cyc | Cog | Len | Status |
|----------|------|-------|-----|-----|-----|--------|
| ~~`setupSentry`~~ | `docs/setup/setup-sentry.js` | 22-149 | 12 | 7 | ~~128~~ 16 | **Fixed** (CX16, v2.3.19) |
| ~~`setupDopplerSentry`~~ | `docs/setup/setup-doppler-sentry.js` | 25-160 | 14 | 4 | ~~136~~ 18 | **Fixed** (CX16, v2.3.19) |
| ~~`main`~~ | `docs/setup/configure-discord-alerts.js` | 139-211 | 10 | 7 | ~~73~~ 14 | **Fixed** (CX16, v2.3.19) |

### Moderate: Length Exceeded (Test Code)

| Function | File | Lines | Cyc | Cog | Len | Status |
|----------|------|-------|-----|-----|-----|--------|
| ~~`runTests`~~ | `tests/integration/test-pr-creator.ts` | 414-489 | 10 | 13 | ~~76~~ ~32 | **Fixed** (CX15, v2.3.22) |
| ~~`runTests`~~ | `tests/integration/test-retry-metrics.ts` | 223-291 | 10 | 12 | ~~69~~ ~34 | **Fixed** (CX15, v2.3.22) |
| ~~`runTests`~~ | `tests/integration/test-gitignore-manager.ts` | 438-504 | 9 | 11 | ~~67~~ ~27 | **Fixed** (CX15, v2.3.22) |
| ~~`main`~~ | `tests/integration/test-automated-pipeline.ts` | 20-152 | 9 | 11 | ~~133~~ ~28 | **Fixed** (CX15, v2.3.19) |
| ~~`testDirectoryScanner`~~ | `tests/scripts/test-directory-scanner.ts` | 9-94 | 8 | 9 | ~~86~~ 30 | **Fixed** (CX15, v2.3.21) |
| ~~`testSkipExisting`~~ | `tests/integration/test-gitignore-manager.ts` | 209-282 | 6 | 9 | ~~74~~ ~33 | **Fixed** (CX15, v2.3.22) |
| ~~`testGitignoreRespect`~~ | `tests/scripts/test-gitignore-respect.ts` | 16-136 | 6 | 9 | ~~121~~ ~26 | **Fixed** (CX15, v2.3.19) |
| ~~`testDryRunMode`~~ | `tests/integration/test-gitignore-manager.ts` | 55-128 | 5 | 9 | ~~74~~ ~32 | **Fixed** (CX15, v2.3.22) |
| ~~`testErrorHandling`~~ | `tests/integration/test-gitignore-manager.ts` | 288-348 | 6 | 7 | ~~61~~ ~28 | **Fixed** (CX15, v2.3.22) |
| ~~`main`~~ | `tests/integration/test-report-generation.ts` | 23-142 | 7 | 5 | ~~120~~ ~30 | **Fixed** (CX15, v2.3.19) |
| ~~`testGitignoreAddition`~~ | `tests/integration/test-gitignore-manager.ts` | 134-203 | 5 | 7 | ~~70~~ ~27 | **Fixed** (CX15, v2.3.22) |
| ~~`testErrorMessages`~~ | `tests/integration/test-error-classification-ui.ts` | 148-214 | 7 | 4 | ~~67~~ 13 | **Fixed** (CX15, v2.3.20) |
| ~~`testSpecificRepositories`~~ | `tests/integration/test-gitignore-manager.ts` | 354-433 | 7 | 3 | ~~80~~ ~35 | **Fixed** (CX15, v2.3.22) |
| ~~`main`~~ (single-job) | `tests/scripts/test-single-job.ts` | 11-84 | 6 | 5 | ~~74~~ ~24 | **Fixed** (CX15, v2.3.22) |
| ~~`main`~~ (repo-cleanup) | `tests/scripts/test-repo-cleanup.ts` | 13-64 | 6 | 2 | ~~52~~ ~29 | **Fixed** (CX15, v2.3.22) |
| ~~`testDryRunMode`~~ (pr-creator) | `tests/integration/test-pr-creator.ts` | 110-169 | 4 | 4 | ~~60~~ ~35 | **Fixed** (CX15, v2.3.22) |
| ~~`main`~~ (repomix-fix) | `tests/scripts/test-repomix-fix.ts` | 12-71 | 6 | 2 | ~~60~~ ~27 | **Fixed** (CX15, v2.3.22) |
| ~~`testDiscordIntegration`~~ | `tests/scripts/test-discord-webhook.ts` | 60-152 | 5 | 1 | ~~93~~ ~30 | **Fixed** (CX15, v2.3.22) |
| ~~`testSentryConnection`~~ | `tests/scripts/test-sentry-connection.ts` | 16-78 | 4 | 2 | ~~63~~ ~19 | **Fixed** (CX15, v2.3.22) |
| ~~`testGitRepoScanner`~~ | `tests/integration/test-git-repo-scanner.ts` | 8-64 | 4 | 2 | ~~57~~ ~26 | **Fixed** (CX15, v2.3.22) |
| ~~`testScanCache`~~ | `tests/integration/test-cache-layer.ts` | 136-196 | 5 | 0 | ~~61~~ ~41 | **Fixed** (CX15, v2.3.22) |
| ~~`testCachedScanner`~~ | `tests/integration/test-cache-layer.ts` | 201-251 | 3 | 0 | ~~51~~ ~33 | **Fixed** (CX15, v2.3.22) |

---

## Standards Enforcement

**Rules checked:** 7 (prefer-const, no-console-log, no-var, no-fixme-comments, no-empty-catch, no-debugger, no-double-equals)

**Only `prefer-const` triggered** (95 violations, all info severity). Top offending files:

| File | Violations |
|------|-----------|
| `scripts/categorize-magic-numbers.ts` | 12 |
| `tests/scripts/validate-backlog.ts` | 8 |
| `tests/integration/activity-feed.integration.test.ts` | 8 |
| `scripts/verify-setup.ts` | 7 |
| `tests/integration/test-pr-creator.ts` | 5 |
| `sidequest/pipeline-core/reports/markdown-report-generator.ts` | 9 |

No `var` usage, no `debugger` statements, no empty catch blocks, no `==` comparisons, no FIXME comments.

---

## Security Scan

No security issues detected across the TypeScript codebase.

---

## Duplication Analysis

~~**1 duplication group found** (1.0 similarity):~~

~~- **File:** `sidequest/utils/report-generator.ts`~~
~~- **Lines:** 127-137 and 169-179 (identical destructuring block)~~
~~- **Savings:** 11 lines~~

**Resolved** in `2f1b2f6` — destructuring blocks collapsed and duration formatting extracted to shared `time-helpers.ts`.

---

## Recommendations

### ~~Priority 1: Refactor `loadInitialData` (cyclomatic = 19)~~ DONE

Resolved in CX14 (commit `5bda198`). Extracted `mapApiActivity`, `buildSystemStatus`, `applyActivityFeed`, `applyStatusToStore`. Cyclomatic 19 → ~5.

### ~~Priority 2: Break up long test runners (CX15)~~ DONE

All 22 test functions resolved across v2.3.19–v2.3.22. Each function reduced to ≤50 lines by extracting per-test helpers (setup factories, verification helpers, print utilities, constants).

### Priority 3: Replace `let` with `const` (95 occurrences)

All standards violations are low-severity `prefer-const` issues. These can be bulk-fixed with an auto-formatter or linting rule.

### ~~Priority 4: Deduplicate report-generator destructuring~~ DONE

Resolved in commit `2f1b2f6` — destructuring blocks collapsed, duration formatting extracted to `sidequest/utils/time-helpers.ts`.

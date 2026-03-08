# Complexity Analysis Report

**Project:** jobs
**Date:** 2026-03-08
**Tool:** ast-grep-mcp (analyze_complexity, enforce_standards, detect_security_issues, find_duplication, detect_orphans)
**Thresholds:** Cyclomatic > 10 | Cognitive > 15 | Nesting > 4 | Length > 50 lines

---

## Executive Summary

| Metric | Value |
|--------|-------|
| TypeScript files analyzed | 234 |
| Functions extracted | 165 |
| Functions exceeding thresholds | 24 (14.5%) |
| Avg cyclomatic complexity | 3.68 |
| Avg cognitive complexity | 2.56 |
| Max cyclomatic | 19 |
| Max cognitive | 15 |
| Standards violations | 95 (all `prefer-const`, info severity) |
| Security issues | 0 |
| Duplication groups | 1 (11 lines saveable) |

Overall health is good. No security vulnerabilities detected. The main concern is **long test functions** and one production-code cyclomatic complexity hotspot.

---

## Complexity Violations

### Critical: Cyclomatic Complexity Exceeded

| Function | File | Lines | Cyc | Cog | Len | Violations |
|----------|------|-------|-----|-----|-----|------------|
| `loadInitialData` | `frontend/src/hooks/useWebSocketConnection.ts` | 112-161 | **19** | 15 | 50 | cyclomatic |
| `testActivityFeed` | `tests/integration/test-error-classification-ui.ts` | 220-287 | **16** | 12 | 68 | cyclomatic, length |

### High: Length Exceeded (Production Code)

| Function | File | Lines | Cyc | Cog | Len |
|----------|------|-------|-----|-----|-----|
| `setupSentry` | `docs/setup/setup-sentry.js` | 22-149 | 12 | 7 | 128 |
| `setupDopplerSentry` | `docs/setup/setup-doppler-sentry.js` | 25-160 | 14 | 4 | 136 |
| `main` | `docs/setup/configure-discord-alerts.js` | 139-211 | 10 | 7 | 73 |

### Moderate: Length Exceeded (Test Code)

| Function | File | Lines | Cyc | Cog | Len |
|----------|------|-------|-----|-----|-----|
| `runTests` | `tests/integration/test-pr-creator.ts` | 414-489 | 10 | 13 | 76 |
| `runTests` | `tests/integration/test-retry-metrics.ts` | 223-291 | 10 | 12 | 69 |
| `runTests` | `tests/integration/test-gitignore-manager.ts` | 438-504 | 9 | 11 | 67 |
| `main` | `tests/integration/test-automated-pipeline.ts` | 20-152 | 9 | 11 | 133 |
| `testDirectoryScanner` | `tests/scripts/test-directory-scanner.ts` | 9-94 | 8 | 9 | 86 |
| `testSkipExisting` | `tests/integration/test-gitignore-manager.ts` | 209-282 | 6 | 9 | 74 |
| `testGitignoreRespect` | `tests/scripts/test-gitignore-respect.ts` | 16-136 | 6 | 9 | 121 |
| `testDryRunMode` | `tests/integration/test-gitignore-manager.ts` | 55-128 | 5 | 9 | 74 |
| `testErrorHandling` | `tests/integration/test-gitignore-manager.ts` | 288-348 | 6 | 7 | 61 |
| `main` | `tests/integration/test-report-generation.ts` | 23-142 | 7 | 5 | 120 |
| `testGitignoreAddition` | `tests/integration/test-gitignore-manager.ts` | 134-203 | 5 | 7 | 70 |
| `testErrorMessages` | `tests/integration/test-error-classification-ui.ts` | 148-214 | 7 | 4 | 67 |
| `testSpecificRepositories` | `tests/integration/test-gitignore-manager.ts` | 354-433 | 7 | 3 | 80 |
| `main` (single-job) | `tests/scripts/test-single-job.ts` | 11-84 | 6 | 5 | 74 |
| `main` (repo-cleanup) | `tests/scripts/test-repo-cleanup.ts` | 13-64 | 6 | 2 | 52 |
| `runTests` (pr-creator) | `tests/integration/test-pr-creator.ts` | 110-169 | 4 | 4 | 60 |
| `main` (repomix-fix) | `tests/scripts/test-repomix-fix.ts` | 12-71 | 6 | 2 | 60 |
| `main` (discord-webhook) | `tests/scripts/test-discord-webhook.ts` | 60-152 | 5 | 1 | 93 |
| `main` (sentry-connection) | `tests/scripts/test-sentry-connection.ts` | 16-78 | 4 | 2 | 63 |
| `main` (git-repo-scanner) | `tests/integration/test-git-repo-scanner.ts` | 8-64 | 4 | 2 | 57 |
| `testCachePersistence` | `tests/integration/test-cache-layer.ts` | 136-196 | 5 | 0 | 61 |
| `testCacheInvalidation` | `tests/integration/test-cache-layer.ts` | 201-251 | 3 | 0 | 51 |

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

**1 duplication group found** (1.0 similarity):

- **File:** `sidequest/utils/report-generator.ts`
- **Lines:** 127-137 and 169-179 (identical destructuring block)
- **Savings:** 11 lines
- **Recommendation:** Extract shared destructuring into a helper function

---

## Recommendations

### Priority 1: Refactor `loadInitialData` (cyclomatic = 19)

`frontend/src/hooks/useWebSocketConnection.ts:112-161`

This is the only production-code function exceeding cyclomatic complexity. The function handles initial data loading with deeply nested optional chaining and multiple data transformations. Consider:
- Extract activity feed mapping into a separate function
- Extract system status construction into a builder/factory

### Priority 2: Break up long test runners

Multiple `runTests`/`main` functions in integration tests exceed 60-130 lines. While test code is less critical, these monolithic test runners are harder to maintain. Consider:
- Splitting test setup, execution, and assertions into separate functions
- Using a test runner framework with proper `describe`/`it` blocks instead of manual orchestration

### Priority 3: Replace `let` with `const` (95 occurrences)

All standards violations are low-severity `prefer-const` issues. These can be bulk-fixed with an auto-formatter or linting rule.

### Priority 4: Deduplicate report-generator destructuring

Extract the repeated destructuring pattern in `report-generator.ts` (lines 127 and 169) into a shared helper.

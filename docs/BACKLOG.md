# Backlog

Technical debt and planned improvements.

**Last Updated:** 2026-03-08 | **Last Session:** 2026-03-08 (migrated CS9, DUP1 to v2.3.20)

> Tools: ast-grep MCP `analyze_complexity`, `detect_code_smells`, `detect_security_issues`, `enforce_standards`, `find_duplication`, `sync_documentation`

---

## Deferred / Blocked Items

No active deferred items.

Closed items migrated to changelog:
- [v2.3.20](changelog/2.3/CHANGELOG.md) (`CS9`, `DUP1`)
- [v2.3.19](changelog/2.3/CHANGELOG.md) (`CX14`, `CX15` partial, `CX16`)
- [v2.3.18](changelog/2.3/CHANGELOG.md) (`UI review: M43-M44, L19-L22`)
- [v2.3.17](changelog/2.3/CHANGELOG.md) (`CONST10`)
- [v2.3.16](changelog/2.3/CHANGELOG.md) (`CONST9`)
- [v2.3.15](changelog/2.3/CHANGELOG.md) (`CONST4`, `CONST6`, `CONST7`, `CONST8`)
- [v2.3.14](changelog/2.3/CHANGELOG.md) (`CONST5`)
- [v2.3.10](changelog/2.3/CHANGELOG.md) (`SV1`)
- [v2.3.9](changelog/2.3/CHANGELOG.md) (`CX11`)
- [v2.3.8](changelog/2.3/CHANGELOG.md) (`CX12`, `CX13`)
- [v2.3.7](changelog/2.3/CHANGELOG.md) (`DOC1-DOC7`)
- [v2.3.6](changelog/2.3/CHANGELOG.md) (`DOC8`)
- [v2.3.5](changelog/2.3/CHANGELOG.md) (`CS8`)
- [v2.3.4](changelog/2.3/CHANGELOG.md) (`CS7`)
- [v2.3.3](changelog/2.3/CHANGELOG.md) (`CX7`)
- [v2.3.2](changelog/2.3/CHANGELOG.md) (`CX6`)
- [v2.3.1](changelog/2.3/CHANGELOG.md) (`LOG8`, `LOG9`)
- [v2.2.0](changelog/2.2/CHANGELOG.md) (`CX1-CX5`, `CX8-CX10`, `CS5`, `SV2`, `SV3`)

---

## Open Findings — Constants Dedup Audit (2026-03-05)

No active constants-dedup backlog items.

---

## Open Findings — Remaining Magic Numbers (2026-03-06)

Current lint snapshot (`no-magic-numbers`):
- Total: `947`
- Production/runtime: `282`
- Tests: `665`

Priority backlog:
- No active magic-number hotspot backlog items.

Tracking artifacts:
- ESLint JSON snapshot: `/tmp/eslint_current.json`
- Grouping report: [docs/magic-number-categories.json](docs/magic-number-categories.json)

---

## DRY Refactoring Opportunities — sidequest/ (2026-02-25)

> All items completed and migrated to [v2.1 CHANGELOG](changelog/2.1/CHANGELOG.md).

---

## Code Review Findings — Pipeline Runners (2026-02-25)

> All items completed and migrated to [v2.1 CHANGELOG](changelog/2.1/CHANGELOG.md).

---

## ast-grep Code Review — Full Repo (2026-02-26)

### Critical Complexity (Cyclomatic/Cognitive/Length)

No active critical-complexity backlog items.

Thresholds: cyclomatic ≤10, cognitive ≤15, nesting ≤4, length ≤50 lines.

> CX11 completed in v2.3.9. CX12-CX13 retired in v2.3.8 (archived scripts removed).

### Large Classes (Code Smells)

No active large-class backlog items.

Thresholds: ≤300 lines, ≤20 methods.

### Standards Violations

No active standards backlog items.

### Documentation Coverage

No active documentation backlog items.

### Security

No issues found (SQL injection, XSS, command injection, hardcoded secrets, insecure crypto).

### Remaining Priority

No active backlog items.

---

## Code Review Findings — Dashboard UI (2026-03-08)

> All items completed and migrated to [v2.3.18](changelog/2.3/CHANGELOG.md).

---

## Complexity Analysis — Full Repo (2026-03-08)

Full report: [complexity-report-2026-03-08.md](complexity-report-2026-03-08.md)

**Scan:** 234 TS files, 165 functions extracted, 24 exceeding thresholds (14.5%). 0 security issues, 95 `prefer-const` info violations, 1 duplication group.

### Critical

No active critical-complexity backlog items.

> CX14 completed and migrated to [v2.3.19](changelog/2.3/CHANGELOG.md).

### Medium

#### CX15: Break up long integration test runners
**Priority**: P2 | **Source**: ast-grep `analyze_complexity` | **Status**: **Complete** (v2.3.22)
22 test functions exceeded 50-line length threshold. All 22 fixed across v2.3.19–v2.3.22:
- v2.3.19: `main` in `test-automated-pipeline.ts` (133→28), `testGitignoreRespect` in `test-gitignore-respect.ts` (121→26), `main` in `test-report-generation.ts` (120→30). Also replaced hand-rolled poll in `test-single-job.ts` with existing `waitForJobCompletion()` utility (DRY).
- v2.3.20: `testErrorMessages` in `test-error-classification-ui.ts` (67→13), `testActivityFeed` in `test-error-classification-ui.ts` (68→36). Extracted `evaluateErrorScenario()`, `validateActivityStructure()` helpers plus `ErrorScenario` interface and `ERROR_SCENARIOS` constant.
- v2.3.21: `testDirectoryScanner` in `test-directory-scanner.ts` (86→30). Extracted `createScanner()`, `logStats()`, `logTreePreview()` helpers plus `EXCLUDED_DIRS` and `TREE_PREVIEW_LINES` constants.
- v2.3.22: Remaining 16 functions across 9 files. Extracted per-file helpers (verifyDryRunBranches, printResult, checkApiHealth, printFinalMetrics, createTestRepos, createGitignoreWorker, countGitignoreMatches, readGitignoreContains, embed constants, resolveRelativePath, setupWorkerEventListeners, printRepoList, printScanStats, setupCleanupEventListeners, printCacheStats, printCacheStatus, printScannerStats, MOCK_SCAN_RESULT, CACHE_CONFIG, etc.).

### Low

No active low-priority backlog items.

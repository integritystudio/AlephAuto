# Backlog

Technical debt and planned improvements.

**Last Updated:** 2026-03-08 | **Last Session:** 2026-03-08 (added dashboard UI review findings)

> Tools: ast-grep MCP `analyze_complexity`, `detect_code_smells`, `detect_security_issues`, `enforce_standards`, `find_duplication`, `sync_documentation`

---

## Deferred / Blocked Items

No active deferred items.

Closed items migrated to changelog:
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

#### CX14: Refactor `loadInitialData` (cyclomatic = 19)
**Priority**: P1 | **Source**: ast-grep `analyze_complexity`
Highest cyclomatic complexity in the codebase (nearly 2x threshold). Extract activity-feed mapping and system-status construction into separate functions. -- `frontend/src/hooks/useWebSocketConnection.ts:112-161`

### Medium

#### CX15: Break up long integration test runners
**Priority**: P2 | **Source**: ast-grep `analyze_complexity`
22 test functions exceed 50-line length threshold. Worst offenders: `main` in `test-automated-pipeline.ts` (133 lines), `testGitignoreRespect` (121 lines), `main` in `test-report-generation.ts` (120 lines). Consider splitting into smaller focused functions or adopting a test framework with `describe`/`it` blocks.

#### CX16: Shorten setup scripts
**Priority**: P2 | **Source**: ast-grep `analyze_complexity`
`setupDopplerSentry` (136 lines, cyc=14), `setupSentry` (128 lines, cyc=12), and `main` in `configure-discord-alerts.js` (73 lines, cyc=10) exceed both length and cyclomatic thresholds. Extract step functions from these procedural setup scripts.

### Low

#### CS9: Replace 95 `let` declarations with `const`
**Priority**: P3 | **Source**: ast-grep `enforce_standards`
95 `prefer-const` violations across 30 files. Top offenders: `markdown-report-generator.ts` (9), `categorize-magic-numbers.ts` (12), `validate-backlog.ts` (8). Bulk-fixable with `eslint --fix`.

#### DUP1: Deduplicate destructuring in report-generator
**Priority**: P3 | **Source**: ast-grep `find_duplication`
Identical 11-line destructuring block at `sidequest/utils/report-generator.ts:127-137` and `169-179`. Extract into a shared helper.

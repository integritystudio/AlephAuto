# Backlog

Technical debt and planned improvements.

**Last Updated:** 2026-03-04 | **Last Session:** 2026-03-04 (CX6 completion + closed-item migration)

> Tools: ast-grep MCP `analyze_complexity`, `detect_code_smells`, `detect_security_issues`, `enforce_standards`, `find_duplication`, `sync_documentation`

---

## Deferred / Blocked Items

No active deferred/blocked items.

Closed items migrated to changelog:
- [v2.3.2](changelog/2.3/CHANGELOG.md) (`CX6`)
- [v2.3.1](changelog/2.3/CHANGELOG.md) (`LOG8`, `LOG9`)
- [v2.2.0](changelog/2.2/CHANGELOG.md) (`CX1-CX5`, `CX8-CX10`, `CS5`, `SV2`, `SV3`)

---

## DRY Refactoring Opportunities — sidequest/ (2026-02-25)

> All items completed and migrated to [v2.1 CHANGELOG](changelog/2.1/CHANGELOG.md).

---

## Code Review Findings — Pipeline Runners (2026-02-25)

> All items completed and migrated to [v2.1 CHANGELOG](changelog/2.1/CHANGELOG.md).

---

## ast-grep Code Review — Full Repo (2026-02-26)

### Critical Complexity (Cyclomatic/Cognitive/Length)

| ID | File | Lines | Cyclomatic | Cognitive | Length | Exceeds | Status |
|----|------|-------|-----------|-----------|--------|---------|--------|
| CX7 | `tests/accuracy/accuracy-test.ts` | 42-81 | 15 | 14 | 40 | cyclomatic | |
| CX11 | `docs/setup/sentry-to-discord.js` | 44-128 | **31** | 19 | 85 | cyclomatic, cognitive, length | Archive file |
| CX12 | `scripts/archive/migrate-db-to-render.js` | 184-259 | 13 | 18 | 76 | cyclomatic, cognitive, length | Archive file |
| CX13 | `scripts/archive/generate-retroactive-reports.js` | 76-176 | 11 | 14 | 101 | cyclomatic, length | Archive file |

Thresholds: cyclomatic ≤10, cognitive ≤15, nesting ≤4, length ≤50 lines.

> CX7: `extractFunctionName` — inherent fallback chain; hard to reduce without obscuring logic.
> CX11-CX13: archive/docs files — low priority.

### Large Classes (Code Smells)

| ID | File | Lines | Methods | Severity | Status |
|----|------|-------|---------|----------|--------|
| CS7 | `api/utils/worker-registry.ts:164` | 348 | 19 | low | |
| CS8 | `sidequest/utils/schema-mcp-tools.ts:54` | 259 | 27 | low | |

Thresholds: ≤300 lines, ≤20 methods.

### Standards Violations

| ID | Rule | Count | Severity | Details |
|----|------|-------|----------|---------|
| SV1 | `no-console-log` | 500+ | warning | Hit 500 cap; worst: `claude-health-pipeline.ts` (61), `test-automated-pipeline.ts` (50) |

### Documentation Coverage

| ID | Description | Metric |
|----|-------------|--------|
| DOC1 | Overall documentation coverage | **0%** (0/889 functions documented) |
| DOC2 | `api/activity-feed.ts` | 6 public methods undocumented |
| DOC3 | `api/event-broadcaster.ts` | 10 public methods undocumented |
| DOC4 | `api/middleware/*.ts` (auth, validation, error-handler) | All functions undocumented |
| DOC5 | `sidequest/core/database.ts` | 15+ exported functions undocumented |
| DOC6 | `sidequest/core/server.ts` | Core job queue base class undocumented |
| DOC7 | `sidequest/core/git-workflow-manager.ts` | All public methods undocumented |
| DOC8 | `sidequest/core/job-repository.ts` | All public methods undocumented |

### Security

No issues found (SQL injection, XSS, command injection, hardcoded secrets, insecure crypto).

### Remaining Priority

1. **SV1** — Replace `console.log` with structured logger in non-test code
2. **CS7/CS8** — Large classes (low severity, low priority)
3. **DOC1-8** — Add JSDoc starting with core modules

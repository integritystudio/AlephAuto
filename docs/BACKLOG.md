# Backlog

Technical debt and planned improvements.

**Last Updated:** 2026-02-27 | **Last Session:** 2026-02-27 (backlog-implementer run — CX1-CX10, CS5, SV2-SV3 addressed)

> Tools: ast-grep MCP `analyze_complexity`, `detect_code_smells`, `detect_security_issues`, `enforce_standards`, `find_duplication`, `sync_documentation`

---

## Deferred / Blocked Items

| ID | Description | Reason |
|----|-------------|--------|
| LOG8 | `mcp-server.test.js` skipped — binary (`mcp-servers/duplicate-detection/index.js`) not implemented | Blocked on MCP server binary |
| LOG9 | TODO comments in `schema-enhancement-pipeline.js`, `grouping.py`, `extract_blocks.py` | Feature work (Layer 3 semantic equivalence), not cleanup |

---

## DRY Refactoring Opportunities — sidequest/ (2026-02-25)

> All items completed and migrated to [v2.1 CHANGELOG](2.1/CHANGELOG.md).

---

## Code Review Findings — Pipeline Runners (2026-02-25)

> All items completed and migrated to [v2.1 CHANGELOG](2.1/CHANGELOG.md).

---

## ast-grep Code Review — Full Repo (2026-02-26)

### Critical Complexity (Cyclomatic/Cognitive/Length)

| ID | File | Lines | Cyclomatic | Cognitive | Length | Exceeds | Status |
|----|------|-------|-----------|-----------|--------|---------|--------|
| ~~CX1~~ | ~~`frontend/src/hooks/useWebSocketConnection.ts`~~ | — | — | — | — | — | Done 2026-02-27 |
| ~~CX2~~ | ~~`tests/integration/test-error-classification-ui.ts`~~ | — | — | — | — | — | Done 2026-02-27 |
| ~~CX3~~ | ~~`tests/integration/test-error-classification-ui.ts`~~ | — | — | — | — | — | Done 2026-02-27 |
| ~~CX4~~ | ~~`sidequest/utils/refactor-test-suite.ts`~~ | — | — | — | — | — | Done 2026-02-27 |
| ~~CX5~~ | ~~`tests/integration/test-scan-pipeline.ts`~~ | — | — | — | — | — | Done 2026-02-27 |
| CX6 | `tests/integration/test-inter-project-scan.ts` | 23-178 | 12 | 10 | 156 | cyclomatic, length | |
| CX7 | `tests/accuracy/accuracy-test.ts` | 42-81 | 15 | 14 | 40 | cyclomatic | |
| ~~CX8~~ | ~~`tests/accuracy/metrics.ts`~~ | — | — | — | — | — | Done 2026-02-27 |
| ~~CX9~~ | ~~`scripts/cleanup-error-logs.ts`~~ | — | — | — | — | — | Done 2026-02-27 |
| ~~CX10~~ | ~~`scripts/validate-permissions.ts`~~ | — | — | — | — | — | Done 2026-02-27 |
| CX11 | `docs/setup/sentry-to-discord.js` | 44-128 | **31** | 19 | 85 | cyclomatic, cognitive, length | Archive file |
| CX12 | `scripts/archive/migrate-db-to-render.js` | 184-259 | 13 | 18 | 76 | cyclomatic, cognitive, length | Archive file |
| CX13 | `scripts/archive/generate-retroactive-reports.js` | 76-176 | 11 | 14 | 101 | cyclomatic, length | Archive file |

Thresholds: cyclomatic ≤10, cognitive ≤15, nesting ≤4, length ≤50 lines.

> CX6: `test-inter-project-scan.ts` main function — consider extracting print helpers similar to CX5 approach.
> CX7: `extractFunctionName` — inherent fallback chain; hard to reduce without obscuring logic.
> CX11-CX13: archive/docs files — low priority.

### Large Classes (Code Smells)

| ID | File | Lines | Methods | Severity | Status |
|----|------|-------|---------|----------|--------|
| ~~CS5~~ | ~~`api/activity-feed.ts:38`~~ | — | — | — | Done 2026-02-27 |
| CS7 | `api/utils/worker-registry.ts:164` | 348 | 19 | low | |
| CS8 | `sidequest/utils/schema-mcp-tools.ts:54` | 259 | 27 | low | |

Thresholds: ≤300 lines, ≤20 methods.

### Standards Violations

| ID | Rule | Count | Severity | Details |
|----|------|-------|----------|---------|
| SV1 | `no-console-log` | 500+ | warning | Hit 500 cap; worst: `claude-health-pipeline.ts` (61), `test-automated-pipeline.ts` (50), `test-mcp-server.ts` (64) |
| ~~SV2~~ | ~~`prefer-const`~~ | ~~186~~ | ~~info~~ | ~~`let` declarations never reassigned~~ | Investigated 2026-02-27 — ESLint finds 0 violations; ast-grep count inflated by loop/destructured bindings. All `let` are legitimately mutable. |
| ~~SV3~~ | ~~`no-double-equals`~~ | ~~3~~ | ~~warning~~ | ~~`==` instead of `===` — correctness risk~~ | Done 2026-02-27 |

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

1. **CX6** — Extract helpers from `test-inter-project-scan.ts` (156-line main)
2. **SV1** — Replace `console.log` with structured logger in non-test code
3. **CS7/CS8** — Large classes (low severity, low priority)
4. **DOC1-8** — Add JSDoc starting with core modules

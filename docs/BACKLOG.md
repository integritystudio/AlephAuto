# Backlog

Technical debt and planned improvements.

**Last Updated:** 2026-02-26 | **Last Session:** 2026-02-26 (completed items migrated to [v2.1 CHANGELOG](2.1/CHANGELOG.md))

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

| ID | File | Lines | Cyclomatic | Cognitive | Length | Exceeds |
|----|------|-------|-----------|-----------|--------|---------|
| CX1 | `frontend/src/hooks/useWebSocketConnection.ts` | 42-215 | **38** | **38** | **174** | All thresholds |
| CX2 | `tests/integration/test-error-classification-ui.ts` | 234-301 | 16 | 12 | 68 | cyclomatic, length |
| CX3 | `tests/integration/test-error-classification-ui.ts` | 306-372 | 14 | 12 | 67 | cyclomatic, length |
| CX4 | `sidequest/utils/refactor-test-suite.ts` | 874-978 | 13 | 12 | 105 | cyclomatic, length |
| CX5 | `tests/integration/test-scan-pipeline.ts` | 16-110 | 11 | 13 | 95 | cyclomatic, length |
| CX6 | `tests/integration/test-inter-project-scan.ts` | 23-178 | 12 | 10 | 156 | cyclomatic, length |
| CX7 | `tests/accuracy/accuracy-test.ts` | 42-81 | 15 | 14 | 40 | cyclomatic |
| CX8 | `tests/accuracy/metrics.ts` | 245-279 | 13 | 0 | 35 | cyclomatic |
| CX9 | `scripts/cleanup-error-logs.ts` | 287-351 | 9 | 5 | 65 | length |
| CX10 | `scripts/validate-permissions.ts` | 92-159 | 10 | 11 | 68 | length |
| CX11 | `docs/setup/sentry-to-discord.js` | 44-128 | **31** | 19 | 85 | cyclomatic, cognitive, length |
| CX12 | `scripts/archive/migrate-db-to-render.js` | 184-259 | 13 | 18 | 76 | cyclomatic, cognitive, length |
| CX13 | `scripts/archive/generate-retroactive-reports.js` | 76-176 | 11 | 14 | 101 | cyclomatic, length |

Thresholds: cyclomatic ≤10, cognitive ≤15, nesting ≤4, length ≤50 lines.

### Large Classes (Code Smells)

| ID | File | Lines | Methods | Severity |
|----|------|-------|---------|----------|




| CS5 | `api/activity-feed.ts:38` | 460 | 16 | medium |

| CS7 | `api/utils/worker-registry.ts:164` | 348 | 19 | low |
| CS8 | `sidequest/utils/schema-mcp-tools.ts:54` | 259 | 27 | low |

Thresholds: ≤300 lines, ≤20 methods.

### Standards Violations

| ID | Rule | Count | Severity | Details |
|----|------|-------|----------|---------|
| SV1 | `no-console-log` | 500+ | warning | Hit 500 cap; worst: `claude-health-pipeline.ts` (61), `test-automated-pipeline.ts` (50), `test-mcp-server.ts` (64) |
| ~~SV2~~ | ~~`prefer-const`~~ | ~~186~~ | ~~info~~ | ~~`let` declarations never reassigned~~ | Investigated 2026-02-26 — ESLint finds 0 violations; ast-grep count inflated by loop/destructured bindings. All `let` are legitimately mutable. |
| ~~SV3~~ | ~~`no-double-equals`~~ | ~~3~~ | ~~warning~~ | ~~`==` instead of `===` — correctness risk~~ | Done 2026-02-26 |

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

### Recommended Priority

1. **CX1** — Refactor `useWebSocketConnection.ts` (4x over every threshold)
2. **SV3** — Fix 3 `==` to `===` (correctness risk)
3. **CS1** — Split `html-report-generator.ts` (693 lines)
4. **CS2** — Split `migration-transformer.ts` (564 lines, 44 methods)
5. **SV1** — Replace `console.log` with structured logger in non-test code
6. **SV2** — Convert 186 `let` to `const`
7. **DOC1-8** — Add JSDoc starting with core modules (`database.ts`, `server.ts`, `activity-feed.ts`)

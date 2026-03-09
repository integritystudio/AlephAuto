# Backlog

Technical debt and planned improvements.

**Last Updated:** 2026-03-09 | **Last Session:** 2026-03-09 (backlog-migrate: 61 items to v2.3.24)

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

## Test Coverage Gaps (2026-03-09)

Full implementation plan: [docs/TEST_COVERAGE_GAPS.md](TEST_COVERAGE_GAPS.md)

| ID | Priority | Title | File |
|----|----------|-------|------|
| ~~TC-C1~~ | ~~Critical~~ | ~~`_trySilentPersist` Sentry capture untested~~ | ~~Done (pre-existing in server-unit.test.ts)~~ |
| ~~TC-C2~~ | ~~Critical~~ | ~~`_queueDraining` re-entrancy guard untested~~ | ~~Done (pre-existing in server-unit.test.ts)~~ |
| ~~TC-H1~~ | ~~High~~ | ~~`createJob` ID validation + `_writeJobLog` sanitize untested~~ | ~~Done (pre-existing in server-unit.test.ts)~~ |
| ~~TC-H2~~ | ~~High~~ | ~~`timingSafeEqual` untested (needs extraction first)~~ | ~~Done (extracted + tested in input-validation.test.ts)~~ |
| ~~TC-H3~~ | ~~High~~ | ~~`filterReservedJobKeys` untested (needs extraction first)~~ | ~~Done (extracted + tested in input-validation.test.ts)~~ |
| ~~TC-M1~~ | ~~Medium~~ | ~~`getFileAgeDays` constant path untested~~ | ~~Done (pre-existing in cleanup-error-logs.test.ts)~~ |
| ~~TC-M2~~ | ~~Medium~~ | ~~`bulkImportJobs` `git` field edge case missing~~ | ~~Done (pre-existing in database.test.ts)~~ |
| ~~TC-M3~~ | ~~Medium~~ | ~~`scanErrorLogs` file-filter + recursion untested~~ | ~~Done (pre-existing in cleanup-error-logs.test.ts)~~ |
| ~~TC-M4~~ | ~~Medium~~ | ~~Pagination route wiring not unit-tested~~ | ~~Done (pre-existing in input-validation.test.ts)~~ |
| ~~TC-M5~~ | ~~Medium~~ | ~~TypeScript type annotations missing on helper functions~~ | ~~Done 43acd05~~ |

---

## Known Issues (2026-03-09)

<a id="known-issues"></a>

### PM2 6.x + Node `--strip-types` + `.ts` entry points

**Problem:** PM2 6.x loads `.ts` scripts via `import()` (ESM dynamic import), which causes
`process.argv[1]` to point to PM2's `ProcessContainerFork.js` instead of the actual script.
Pipeline runners using `isDirectExecution()` to guard `main()` will see a mismatch and never
start — the process exits immediately with code 0 and PM2 enters a crash-restart loop.

Additionally, `--strip-types` does not support TypeScript `enum` syntax — use `as const`
objects instead. Import paths must use `.ts` extensions (Node v24 does not rewrite `.js`).

**Solution:**
- Add `process.env.pm_id !== undefined` as a fallback condition alongside `isDirectExecution()`
- Convert `enum` declarations to `const ... as const` objects
- Use `.ts` import extensions, not `.js`
- Rebuild native modules (`npm rebuild better-sqlite3`) after Node version changes
- Disable `wait_ready` in PM2 config — PM2 6.x sends premature SIGINT with `.ts` files

**Affected versions:** Node v24.x, PM2 6.x. Not observed on Node v25.x.

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

## ast-grep Full Analysis (2026-03-09)

Full report: [ast-grep-analysis-2026-03-09.md](ast-grep-analysis-2026-03-09.md)

**Scan:** 239 TS files, 205 functions, 25 API routes. 6 tools: complexity, code smells, security, standards, duplication, API docs.

| ID | Priority | Title | File | Detail |
|----|----------|-------|------|--------|
| ~~AG-W1~~ | ~~Medium~~ | ~~Replace 14 `console.log` with structured logger~~ | ~~Done v2.3.25~~ | ~~`createLogger` factory; App.tsx + websocket.ts + useWebSocketConnection.ts~~ |
| ~~AG-CS1~~ | ~~Medium~~ | ~~Decompose `MigrationTransformer` (627 lines, 44 methods)~~ | ~~Done v2.3.25~~ | ~~Extracted `migration-ast-transformer.ts`, `migration-file-resolver.ts`, `migration-git-manager.ts`~~ |
| ~~AG-CS2~~ | ~~Low~~ | ~~Extract HTML templates from `HtmlReportGenerator` (607 lines)~~ | ~~Done v2.3.25~~ | ~~CSS extracted to `getScanReportStyles()` in html-report-utils.ts; 625→435 lines~~ |

---

## Complexity Analysis — Full Repo (2026-03-08)

Full report: [complexity-report-2026-03-08.md](complexity-report-2026-03-08.md)

**Scan:** 234 TS files, 165 functions extracted, 24 exceeding thresholds → **0** (all resolved). 0 security issues, 95 `prefer-const` info violations, ~~1~~ 0 duplication groups.

### Critical

No active critical-complexity backlog items.

> CX14 completed and migrated to [v2.3.19](changelog/2.3/CHANGELOG.md).

### Medium

No active medium-priority backlog items.

> CX15 completed and migrated to [v2.3.22](changelog/2.3/CHANGELOG.md).


### Low

No active low-priority backlog items.

> SV4-SV6 migrated to [v2.3.23](changelog/2.3/CHANGELOG.md#2323---2026-03-09).

---

## Consolidation / Deduplication Audit (2026-03-09)

Full codebase analysis using repomix token-tree + code-simplifier agent.

### Done

| ID | Area | Description | Savings |
|----|------|-------------|---------|
| CD1 | `isDirectExecution` x10 | Extracted to `sidequest/utils/execution-helpers.ts`, replaced 10 inline copies | ~900 tok |
| CD2 | HTML report CSS + `escapeHtml` | Extracted to `sidequest/utils/html-report-utils.ts`, shared by `report-generator.ts` and `html-report-generator.ts` | ~2700 tok |
| CD3 | `GitWorkflowManager` wrapper | Eliminated; `server.ts` and `bugfix-audit-worker.ts` now use `BranchManager` directly | ~1100 tok |
| CD4 | `setupEventListeners` boilerplate | Added `setupDefaultEventListeners` to `BasePipeline`; 5 subclasses consolidated | ~700 tok |
| CD5 | Scan result type shapes | Documented intentional divergence between `duplicate-detection-types.ts` (worker lifecycle) and `json-report-generator.ts` (Python output shape) | 0 (docs only) |

### Not actionable (confirmed no duplication)

- TS vs Python constants (`constants.ts` / `constants.py`) — different runtimes, no overlap
- `error-classifier.ts` vs `error-helpers.ts` — complementary, not duplicated
- `timing-helpers.ts` vs `time-helpers.ts` — already properly layered
- `sidequest/utils/time-helpers.ts` uses `TIME_MS` divisions instead of `SECONDS` constants from `units.ts` — minor (~100 tok), low priority

---

## Code Review Findings — sidequest/utils (2026-03-09)

**Scan:** 15 TS files (utility modules, helpers, managers, validators, reporters).

Migrated to [v2.3.24](changelog/2.3/CHANGELOG.md#2324---2026-03-09): All 18 core items (SU-C1, SU-M1-M3, SU-L1, SU-H1-H4, SU-M4-M9, SU-L3-L5) plus 1 H1 post-review fix.

### Open — Final Review Findings (2026-03-09)

| ID | Priority | File | Title | Description |
|----|----------|------|-------|-------------|
| ~~SU-FR-M1~~ | ~~Medium~~ | ~~`refactor-test-suite.ts:957`~~ | ~~`render-helpers.ts` always overwritten~~ | ~~Done fd8b213~~ |
| ~~SU-FR-M2~~ | ~~Medium~~ | ~~`refactor-test-suite.ts:694`~~ | ~~Empty `ALL_STRINGS` export when no strings extracted~~ | ~~Done fd8b213 (comment added)~~ |
| ~~SU-FR-M3~~ | ~~Medium~~ | ~~`html-report-utils.ts:86`~~ | ~~`section h2` padding-bottom silently halved~~ | ~~Done 7841f16 (restored to --space-sm / 8px)~~ |
| ~~SU-FR-M4~~ | ~~Low~~ | ~~`report-generator.ts:361`~~ | ~~Unnecessary `as readonly string[]` cast on `METRIC_KEYS`~~ | ~~Done 1160b0e~~ |
| ~~SU-FR-L1~~ | ~~Low~~ | ~~`crypto-helpers.ts:19`~~ | ~~Comment on `&&` short-circuit could be more precise~~ | ~~Done c398db3~~ |
| ~~SU-FR-L2~~ | ~~Low~~ | ~~`refactor-test-suite.ts:948`~~ | ~~TOCTOU in `fsPromises.access` existence checks~~ | ~~Done fd8b213 (TOCTOU note added; acceptable for single-threaded CLI)~~ |
| ~~SU-FR-L3~~ | ~~Low~~ | ~~`tests/unit/input-validation.test.ts:188`~~ | ~~Assertion removed without explanation~~ | ~~Done c398db3~~ |

### Deferred

| ID | File | Title | Reason |
|----|------|-------|--------|
| SU-L2 | `doppler-resilience.ts` | Class uses runtime throw instead of abstract method | `DopplerResilience` is instantiated directly in 16+ test files; making it `abstract` would require broad test refactoring. Deferred. |

---

## Code Review Findings — ast-grep Implementation Session (2026-03-09)

**Session:** Completed AG-W1 (console.log→logger), AG-CS1 (MigrationTransformer decomposition), AG-CS2 (HTML CSS extraction). Code review identified actionable items to carry forward.

| ID | Priority | File | Title | Description |
|----|----------|------|-------|-------------|
| ~~AG-W1-L1~~ | ~~Low~~ | ~~`frontend/src/services/websocket.ts`~~ | ~~Remove 3 duplicate JSDoc comment blocks~~ | ~~Done 175ba38~~ |
| ~~AG-CS1-M1~~ | ~~Medium~~ | ~~`sidequest/pipeline-core/git/migration-file-resolver.ts`~~ | ~~Decouple MigrationFileResolver from MigrationAstTransformer instantiation~~ | ~~Done ff6faee (optional injection, MigrationTransformer passes shared instance)~~ |

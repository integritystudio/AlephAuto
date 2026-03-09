# Backlog

Technical debt and planned improvements.

**Last Updated:** 2026-03-09 | **Last Session:** 2026-03-09 (backlog-implementer: SC-M7–M8, SC-L7–L9, SCR-M1–M4, SCR-L1–L4)

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
| TC-C1 | Critical | `_trySilentPersist` Sentry capture untested | `server.ts` |
| TC-C2 | Critical | `_queueDraining` re-entrancy guard untested | `server.ts` |
| TC-H1 | High | `createJob` ID validation + `_writeJobLog` sanitize untested | `server.ts` |
| TC-H2 | High | `timingSafeEqual` untested (needs extraction first) | `api/routes/jobs.ts` |
| TC-H3 | High | `filterReservedJobKeys` untested (needs extraction first) | `api/routes/jobs.ts` |
| TC-M1 | Medium | `getFileAgeDays` constant path untested | `scripts/cleanup-error-logs.ts` |
| TC-M2 | Medium | `bulkImportJobs` `git` field edge case missing | `sidequest/core/database.ts` |
| TC-M3 | Medium | `scanErrorLogs` file-filter + recursion untested | `scripts/cleanup-error-logs.ts` |
| TC-M4 | Medium | Pagination route wiring not unit-tested | `api/routes/jobs.ts` |
| TC-M5 | Medium | TypeScript type annotations missing on helper functions | `scripts/cleanup-error-logs.ts` (getFileAgeDays, compressFile, archiveOldLogs, deleteOldArchives, cleanup; see code-reviewer 6c80aff) |

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
| AG-W1 | Medium | Replace 14 `console.log` with structured logger | `frontend/src/services/websocket.ts`, `useWebSocketConnection.ts` | 9 + 5 occurrences |
| AG-CS1 | Medium | Decompose `MigrationTransformer` (627 lines, 44 methods) | `sidequest/pipeline-core/git/migration-transformer.ts:163` | Split by migration phase |
| AG-CS2 | Low | Extract HTML templates from `HtmlReportGenerator` (607 lines) | `sidequest/pipeline-core/reports/html-report-generator.ts:18` | 3 methods, large inline templates |

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

## Code Review Findings — API Routes (2026-03-09)

Full review: [code-reviewer agent findings](REMOVED_AFTER_SESSION)

**Scan:** 23 TS files (server, routes, middleware, utils, types). **Critical fixes applied:** C1 (CORS), C2 (directory traversal), C3 (scanId validation).

### Done

| ID | Title | Fix |
|----|-------|-----|
| H4 | `start-multi` accepts arbitrary filesystem paths | Added `StartMultiScanRequestSchema` with Zod validation; absolute path + null-byte + traversal checks in `scans.ts` |
| H5 | Retry endpoint re-executes unsanitized job parameters | Strip `RESERVED_JOB_KEYS` before spreading into new job in `jobs.ts` |
| H6 | Manual pipeline trigger bypasses parameter validation | Strip `RESERVED_PARAM_KEYS` before spreading into job in `pipelines.ts` |
| H7 | REPORTS_DIR hardcoded, violates config pattern | Use `config.scanReportsDir` + graceful empty response on missing dir in `reports.ts` |
| H8 | Auth key falls back to raw process.env | Added `apiKey` getter to config; `auth.ts` uses `config.apiKey` directly |
| H9 | timingSafeEqual leaks length | Padding approach in both `jobs.ts` and `auth.ts` prevents length oracle |
| M10 | Duplicate worker bypasses registry | `scans.ts` registers standalone worker with `workerRegistry.registerWorker()` after init |
| M11 | `/:scanId/status` returns aggregate stats | Now uses `jobRepository.getJob(scanId)` for scan-specific lookup, returns 404 for unknown |
| M12 | `hasMore` pagination off-by-one | Fixed to `(offset + result.jobs.length) < result.total` in `pipelines.ts` |
| M13 | Sentry captures raw headers | Redact `SENSITIVE_KEYS` headers before sending to Sentry in `error-handler.ts` |
| M14 | Shell injection in port-cleanup | Replaced `exec` with `execFile` + numeric PID validation in `port-manager.ts` |
| M15 | WebSocket unconstrained channels | Added `VALID_CHANNEL_PATTERN`, `MAX_CHANNEL_NAME_LENGTH`, `MAX_SUBSCRIPTIONS_PER_CLIENT` in `websocket.ts` |
| L16 | validateQuery double-cast | Express module augmentation for `req.validatedQuery` in `validation.ts` |
| L17 | 7 serial table reads | Replaced with `jobRepository.getJob(scanId)` direct lookup in `scans.ts` |
| L18 | retryCount from wrong location | Validate `retryCount` is non-negative number before use in `jobs.ts` |

---

## Code Review Findings — sidequest/core (2026-03-09)

**Scan:** 13 TS files (server, database, job-repository, config, constants, units, git-workflow, index).

### Done

| ID | File | Title | Fix |
|----|------|-------|-----|
| SC-H1 | `server.ts` | Silent persist-error swallow | Added `_trySilentPersist` helper with logging + Sentry; replaced 5 silent `catch {}` blocks |
| SC-H2 | `server.ts` | `processQueue` re-entrant overshoot | Added `_queueDraining` guard flag to prevent re-entrant calls |
| SC-M5 | `server.ts` | Log path traversal via unvalidated job ID | Added `VALIDATION.JOB_ID_PATTERN` check in `createJob`; replaced `path.basename` with regex sanitize in `_writeJobLog` |
| SC-M1 | `database.ts` | Filename-derived job ID exceeds 100-char max | Added `VALIDATION.JOB_ID_MAX_LENGTH`; truncate after sanitization in import functions |
| SC-M2 | `database.ts` | `bulkImportJobs` string bypass unparseable | Added `isValidJsonString` helper; reject records with invalid JSON string fields |
| SC-M3 | `index.ts` | Magic number `30 * 60` for `maxWaitMs` | Already resolved — uses `TIMEOUTS.SCAN_COMPLETION_WAIT_MS` |
| SC-M4 | `config.ts` | `codeBaseDir` uses `\|\|` not `??` | Changed to nullish coalescing `??` |
| SC-M6 | `job-repository.ts` | `close()`/`reset()` guard asymmetry | Removed redundant `_initialized = false` in `reset()` |
| SC-L1 | `constants.ts` | Timeout literals without unit derivation | Derived from `TIME_MS.MS` (100 * TIME_MS.MS, 10 * TIME_MS.MS) |
| SC-L2 | `server.ts` | `tracesSampleRate: 1.0` hardcoded | Added `config.sentryTracesSampleRate` (env: SENTRY_TRACES_SAMPLE_RATE, default 0.1) |
| SC-L3 | `index.ts` | Config cast to `Record<string, unknown>` | Removed `cfg` cast; access `config.xxx` properties directly |
| SC-L4 | `database.ts` | `degradedMode`/`persistFailureCount` vestigial | Removed from HealthStatus interface and getHealthStatus return |
| SC-L6 | `units.ts` | `DECIMAL_KB` coupled to `EXPORT_MAX_BATCH_SIZE_LIMIT` | Replaced with independent `1_000` literal |

### High

No active high-priority backlog items.

### Medium

No active medium-priority backlog items.

### Low

| ID | File | Title | Description |
|----|------|-------|-------------|
| SC-L5 | `server.ts` | `_generateCommitMessage`/`_generatePRContext` public | Should be `protected`; currently exposed on external API surface. Skipped — 6+ test call sites require public access. |

---

## Code Review Follow-up (2026-03-09)

> All items completed (2026-03-09). SC-M7–M8, SC-L7–L9 implemented by backlog-implementer.

### Done

| ID | File | Title | Fix |
|----|------|-------|-----|
| SC-M7 | `constants.ts` | `TIME_MS.MS` multiplication semantically inert | Added `TEN_MS`/`ONE_HUNDRED_MS` to `DURATION_MS` using `TIME_MS.SECOND / N` fractions |
| SC-M8 | `database.ts` | `saveJob` lacks JSON validation like `bulkImportJobs` | Added identical JSON string validation guard before insert |
| SC-L7 | `units.ts` | `EXPORT_MAX_BATCH_SIZE_LIMIT` is unused export | Removed dead export |
| SC-L8 | `database.ts` | `isValidJsonString` duplicates `safeJsonParse` logic | Extracted `tryParseJson` result-type helper; both functions delegate to it |
| SC-L9 | `database.ts` | Missing unit tests for SC-M1/SC-M2 data-integrity paths | Added 9 targeted unit tests in `tests/unit/database.test.ts` |

---

## Code Review Findings — scripts/ (2026-03-09)

Repomix-explorer analysis of 22 scripts (~42K tokens): shell (13), TypeScript (6), Python (1), JSON configs (2).

> All items completed (2026-03-09). SCR-M1–M4, SCR-L1–L4 implemented by backlog-implementer.

### Done

| ID | File | Title | Fix |
|----|------|-------|-----|
| SCR-M1 | `fix-types.ts` | Uses `npm` but project uses `pnpm` | Rewrote to use `pnpm install`, `pnpm store prune`, `pnpm run typecheck`; fixed shebang |
| SCR-M2 | `cleanup-error-logs.ts` | Magic number `1000 * 60 * 60 * 24` | Replaced with `TIMEOUTS.ONE_DAY_MS` |
| SCR-M3 | `run-python-tests.sh` | Hardcoded user-specific path | Removed `/Users/alyshialedlie/...` fallback from CANDIDATES |
| SCR-M4 | `generate-repomix-docs.sh`, `generate-repomix-git-ranked.sh` | Duplicated jq ignore-pattern extraction | Extracted to `scripts/repomix-lib.sh` `get_bundle_ignore_patterns()` |
| SCR-L1 | TS scripts | Inconsistent shebangs | Standardized 5 scripts to `#!/usr/bin/env -S node --strip-types` |
| SCR-L2 | `verify-bugfixes.sh` | Stale hardcoded file checks | Replaced past-bugfix file list with stable core architecture files |
| SCR-L3 | `verify-bugfixes.sh` | Runtime-generated rollback script | Added `scripts/rollback-bugfixes.sh` to `.gitignore` |
| SCR-L4 | `generate-diff-summary.sh` | Hardcoded `N=20`, `COMMITS=200` | Parameterized via `DIFF_SUMMARY_TOP_N` and `DIFF_SUMMARY_COMMITS` env vars |

---

## Document Updates — Staleness Audit (2026-03-09)

> All items completed (2026-03-09). See commits 6634551–8ea84c0.

Audit of docs/ against current codebase (v2.3.20). Source: repomix-docs.xml index.

---

## Code Review Findings — sidequest/utils (2026-03-09)

**Scan:** 15 TS files (utility modules, helpers, managers, validators, reporters).

### Done

| ID | File | Title | Fix |
|----|------|-------|-----|
| SU-C1 | `dependency-validator.ts` | Command injection via unsanitized pythonPath | Replaced all `execSync` string forms with `execFileSync` array form; removed `async` keywords from synchronous validators |
| SU-M1 | `dependency-validator.ts` | Unguarded `r.reason as Error` cast | Added `instanceof Error` check with `String()` fallback for unknown rejection types |
| SU-M2 | `dependency-validator.ts` | Missing `env: process.env` propagation | Added to all four `execFileSync` calls for NVM/pyenv environment variable inheritance |
| SU-M3 | `dependency-validator.ts` | `parseInt` without radix | Applied `NUMBER_BASE.DECIMAL` constant from `sidequest/core/constants.ts` |
| SU-L1 | `dependency-validator.ts` | Python version check rejects Python 4.x | Fixed logic to `major > 3 \|\| (major === 3 && minor >= 11)` |

### High

| ID | File | Title | Description |
|----|------|-------|-------------|
| SU-H1 | `plugin-manager.ts:67` | Direct `process.env.HOME` use | Violates config convention. Already has `os.homedir()` imported as fallback — remove the direct env read. |
| SU-H2 | `plugin-manager.ts:68-71` | Magic numbers for plugin thresholds | `maxPlugins: 30`, `warnPlugins: 20` should be constants. Create `PLUGIN_THRESHOLDS` in `sidequest/core/constants.ts` or read from config. |
| SU-H3 | `doppler-resilience.ts:73` | Magic number `successThreshold ?? 2` | `2` should be a constant in `RETRY` or new `CIRCUIT_BREAKER` group in `constants.ts`. |
| SU-H4 | `doppler-resilience.ts:100-101` | Non-null assertions on `nextAttemptTime` | Typed as `number \| null`. Replace `!` assertions with explicit `nextAttemptTime !== null` check. |

### Medium

| ID | File | Title | Description |
|----|------|-------|-------------|
| SU-M4 | `refactor-test-suite.ts` | Synchronous fs calls in async context | Uses `fs.readFileSync`, `fs.writeFileSync`, etc. in `main()` (async). Switch to `fs/promises` for non-blocking I/O. |
| SU-M5 | `refactor-test-suite.ts:1394-1404` | `\|\| 0` instead of `?? 0` for counts | Per project convention, `??` must be used for numeric options to preserve `0` values. |
| SU-M6 | `gitignore-repomix-updater.ts:780` | Duplicated hardcoded string | `**/repomix-output.xml` duplicates `this.gitignoreEntry`. Use `**/${this.gitignoreEntry}` or remove dead line. |
| SU-M7 | `gitignore-repomix-updater.ts:920` | Manual `import.meta.url` entrypoint check | Should use existing `isDirectExecution()` from `execution-helpers.ts` instead of inline pattern. |
| SU-M8 | `report-generator.ts:2307-2333` | Duplicated 16-element `metricKeys` array | Appears in both `extractMetrics` and `extractDetails`. Extract to module-level constant. |
| SU-M9 | `schema-mcp-tools.ts:2488-2491` | Derived magic numbers for description length | `DESCRIPTION_TRUNCATED_LENGTH = 197 = MAX_LENGTH - 3`. Derive from constant: `MAX_LENGTH - '...'.length`. |

### Low

| ID | File | Title | Description |
|----|------|-------|-------------|
| SU-L2 | `doppler-resilience.ts` | Class uses runtime throw instead of abstract method | Template-method pattern via `throw new Error()` should use `abstract class` + `abstract method` for compile-time safety. |
| SU-L3 | `pipeline-names.ts` | `\|\|` instead of `??` + unnecessary type cast | `getPipelineName` uses `as Record<string, string>` cast and `\|\|`. Apply `??` and avoid cast. |
| SU-L4 | `time-helpers.ts` | Repeated arithmetic on every call | `TIME_MS.MINUTE / TIME_MS.SECOND` (= 60) computed repeatedly in `formatDuration`. Move to module-level constant. |
| SU-L5 | `html-report-utils.ts` | Inline magic CSS values | All numeric CSS values (`1200px`, `20px`, `30px`, etc.) hardcoded in style template. Extract to CSS constants or custom properties. |

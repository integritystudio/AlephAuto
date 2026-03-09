# Backlog

Technical debt and planned improvements.

**Last Updated:** 2026-03-09 | **Last Session:** 2026-03-09 (backlog-implementer: SC-M1–M4, SC-M6, SC-L1–L4, SC-L6; follow-up: SC-M7–M8, SC-L7–L9)

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

Session code-reviewer findings from SC backlog implementation batch. Medium/Low items deferred for future refactoring.

### Medium

| ID | File | Title | Description |
|----|------|-------|-------------|
| SC-M7 | `constants.ts:32-33` | `TIME_MS.MS` multiplication semantically inert | `100 * TIME_MS.MS` and `10 * TIME_MS.MS` evaluate to plain numbers since `TIME_MS.MS = 1`. Looks like unit derivation but carries no semantic weight. Impacts readability and future refactorings. |
| SC-M8 | `database.ts:307` | `saveJob` lacks JSON validation like `bulkImportJobs` | `saveJob` uses same `typeof x === 'string' ? x : serialize` pattern as `bulkImportJobs`, but lacks the new JSON string validation guard. Inconsistent error handling for pre-serialized fields. |

### Low

| ID | File | Title | Description |
|----|------|-------|-------------|
| SC-L7 | `units.ts:42` | `EXPORT_MAX_BATCH_SIZE_LIMIT` is unused export | After SC-L6 decoupling, `EXPORT_MAX_BATCH_SIZE_LIMIT` has zero consumers (confirmed by grep). Should either be removed as dead export or documented as intentional public API constant. |
| SC-L8 | `database.ts:180-187` | `isValidJsonString` duplicates `safeJsonParse` logic | New helper duplicates try/catch pattern from existing `safeJsonParse`. Could refactor `safeJsonParse` to return boolean or extend with overload instead of duplicating implementation. |
| SC-L9 | `database.ts` | Missing unit tests for SC-M1/SC-M2 data-integrity paths | No dedicated unit tests for: (1) filename truncation to 100-char max + isValidJobId pass, (2) rejected record error messages for invalid JSON strings. Existing integration tests cover indirectly; targeted unit tests would harden regressions. |

---

## Code Review Findings — scripts/ (2026-03-09)

Repomix-explorer analysis of 22 scripts (~42K tokens): shell (13), TypeScript (6), Python (1), JSON configs (2).

### Medium

| ID | File | Title | Description |
|----|------|-------|-------------|
| SCR-M1 | `fix-types.ts` | Uses `npm` but project uses `pnpm` | Deletes `node_modules` + `package-lock.json` as first resort, calls `npm install`/`npm cache clean`. Inconsistent with pnpm-based project. Rewrite to use pnpm or remove if issue is resolved. |
| SCR-M2 | `cleanup-error-logs.ts:59` | Magic number `1000 * 60 * 60 * 24` | Should use `TIME` constants from `sidequest/core/constants.ts` (already imports `BYTES_PER_KB` from constants). |
| SCR-M3 | `run-python-tests.sh:32` | Hardcoded user-specific path | `/Users/alyshialedlie/code-env/python/pyenv/versions/3.13.7/bin/python` — breaks on other machines. Should rely solely on `PYTEST_PYTHON` env var and standard discovery. |
| SCR-M4 | `generate-repomix-docs.sh`, `generate-repomix-git-ranked.sh` | Duplicated jq ignore-pattern extraction | Both scripts contain identical jq expressions to extract bundle-ignore patterns from `repomix.config.json`. Extract to shared shell function. |

### Low

| ID | File | Title | Description |
|----|------|-------|-------------|
| SCR-L1 | TS scripts | Inconsistent shebangs | `categorize-magic-numbers.ts` uses `node --strip-types`, `cleanup-error-logs.ts` uses plain `node`. Plain `node` shebang fails on `.ts` without a loader. Standardize to `--strip-types`. |
| SCR-L2 | `verify-bugfixes.sh:66-77` | Stale hardcoded file checks | Pre-deployment checks verify specific files from a past bugfix deployment. Generalize or move file list to config. |
| SCR-L3 | `verify-bugfixes.sh` | Runtime-generated rollback script | `create_rollback_script()` writes `scripts/rollback-bugfixes.sh` dynamically — side-effect that leaves uncommitted files. Not in `.gitignore`. |
| SCR-L4 | `generate-diff-summary.sh` | Hardcoded `N=20`, `COMMITS=200` | Should be parameterized or extracted as constants for consistency with other generate scripts. |

---

## Document Updates — Staleness Audit (2026-03-09)

> All items completed (2026-03-09). See commits 6634551–8ea84c0.

Audit of docs/ against current codebase (v2.3.20). Source: repomix-docs.xml index.

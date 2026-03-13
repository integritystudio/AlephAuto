# Backlog

Technical debt and planned improvements.

**Last Updated:** 2026-03-13 | **Last Session:** 2026-03-13 (code-reviewer: 4 items from d088157 review — QF-M9/M10/L13/L14)

> Tools: ast-grep MCP `analyze_complexity`, `detect_code_smells`, `detect_security_issues`, `enforce_standards`, `find_duplication`, `sync_documentation`

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

## Complexity Analysis — Full Repo (2026-03-08)
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

### Done

| ID | File | Title | Fix |
|----|------|-------|-----|
| SC-M7 | `constants.ts:32-33` | `TIME_MS.MS` multiplication semantically inert | Resolved when DURATION_MS group introduced — uses `TIME_MS.SECOND / 100` semantic divisions |
| SC-M8 | `database.ts:307` | `saveJob` lacks JSON validation like `bulkImportJobs` | JSON validation guard already present (lines 318-324) |
| SC-L7 | `units.ts:42` | `EXPORT_MAX_BATCH_SIZE_LIMIT` is unused export | Removed from units.ts as part of SC-L6 |

### Low

| ID | File | Title | Description |
|----|------|-------|-------------|
| SC-L8 | `database.ts:180-187` | `isValidJsonString` duplicates `safeJsonParse` logic | New helper duplicates try/catch pattern from existing `safeJsonParse`. Could refactor `safeJsonParse` to return boolean or extend with overload instead of duplicating implementation. |
| SC-L9 | `database.ts` | Missing unit tests for SC-M1/SC-M2 data-integrity paths | No dedicated unit tests for: (1) filename truncation to 100-char max + isValidJobId pass, (2) rejected record error messages for invalid JSON strings. Existing integration tests cover indirectly; targeted unit tests would harden regressions. |

### Open — Final Review Findings (2026-03-09)

| ID | Priority | File | Title | Description |
|----|----------|------|-------|-------------|
| SU-FR-M4 | Low | `report-generator.ts:361` | Unnecessary `as readonly string[]` cast on `METRIC_KEYS` | Reverted by linter; cast required by project lint rules. Accepted as-is. |

---

## Dashboard Populate Pipeline Outage (2026-03-10)

<a id="dp-outage"></a>

Root cause investigation: relevance evaluations stopped on 2026-03-03. Session: bug-detective.

---

## Scan Configuration Findings (2026-03-11)

Code review (`config/scan-repositories.json`): Portability and validation issues.

### Done

| ID | Priority | File | Title | Commit |
|----|----------|------|-------|--------|
| SR-M1 | P2 | `config/scan-repositories.json` | Hardcoded absolute paths replaced with `~` | 1e5da1a |
| SR-L1 | P3 | `config/scan-repositories.schema.json` | `_comment` added to schema properties | ac47d15 |
| SR-L2 | P3 | `sidequest/pipeline-core/config/repository-config-loader.ts` | Warn on Redis provider unavailable at startup | aacc26f |

---

## Repomix Automation Pipeline — Refactor & Re-enable (2026-03-12)

Pipeline disabled in `worker-registry.ts` on 2026-03-12. 914 queued jobs accumulated from repeated cron triggers without draining. Needs refactor before re-enabling.

### Done

| ID | Priority | Title | Commit |
|----|----------|-------|--------|
| RP-H1 | P1 | Bulk-cancel stale queued repomix jobs on startup | a26f246 |
| RP-M2 | P2 | Root cause documented: in-memory queue not re-hydrated on restart | f8cb450 |
| RP-M3 | P2 | Queue depth guard added to pipeline trigger endpoint | e87ebb9 |
| RP-L4 | P3 | Repomix pipeline re-enabled | 4c50996 |

---

## Quality Fixes — Code Review Findings (2026-03-12)

Code review of merge commit `86fbc07` (main into feature/quality-fixes). 3 High items fixed in `53e5543`. Medium/Low items deferred.

### Done

| ID | Priority | File | Title | Commit |
|----|----------|------|-------|--------|
| QF-H1 | P1 | `api/utils/crypto-helpers.ts:15` | timingSafeEqual length oracle via short-circuit | 53e5543 |
| QF-H2 | P1 | `api/server.ts:471` | Hardcoded `'repomix'` in stale job cancel — now iterates all disabled pipelines | 53e5543 |
| QF-H3 | P1 | `sidequest/core/config.ts:1` | `dotenv/config` shadows Doppler in production — gated behind NODE_ENV | 53e5543 |

### Medium

| ID | Priority | File | Title | Description |
|----|----------|------|-------|-------------|
| QF-M4 | P2 | `api/routes/pipelines.ts:280` | Queue depth guard throws plain Error instead of 429 | Done — c00ef5f, 4c20f95 |
| QF-M5 | P2 | `sidequest/utils/doppler-resilience.ts:165` | getFallbackSecrets null guard reachable on non-stale path | Done — 9006bce |
| QF-M6 | P2 | `frontend/src/services/websocket.ts:87` | `handleMessage(message: any)` uses untyped any | Define discriminated union `WebSocketMessage` and use type guards instead of raw `any` access. |
| QF-M7 | P2 | `sidequest/utils/refactor-test-suite.ts:978` | render-helpers.ts missing existence guard — silently overwrites | Done — fd8b213 (already fixed) |
| QF-M8 | P2 | `frontend/vite.config.ts:8` | Vite proxy port hardcoded to 3002 | Done — 03d54bb, 34574d9 |
| QF-M9 | P2 | `sidequest/pipeline-core/reports/html-report-generator.ts:177,319-342` | HTML string interpolation without escaping XSS vectors | Done — 928ae85, 8517352 |
| QF-M10 | P2 | `sidequest/utils/html-report-utils.ts:11` | escapeHtml accepts string but callers pass JSON-sourced values | Done — 928ae85, 8517352 |

### Low

| ID | Priority | File | Title | Description |
|----|----------|------|-------|-------------|
| QF-L9 | P3 | `api/utils/worker-registry.ts:594` | getTotalCapacity recomputes on every /api/status request | Calls `cfg.getOptions()` for every enabled pipeline on every poll. Cache on registration and invalidate on enable/disable. |
| QF-L10 | P3 | `sidequest/pipeline-core/git/migration-ast-transformer.ts:200` | Import inserted before 'use strict' directive | `ast.program.body.unshift()` places new imports at position 0, before any `'use strict'` directive. Find first non-directive position. |
| QF-L11 | P3 | `sidequest/utils/html-report-utils.ts:49` | Scan-specific CSS uses hardcoded px values | `getScanReportStyles()` uses `gap: 15px`, `padding: 20px` etc. while `getBaseStyles()` uses CSS custom properties. Extend `--space-*` variables to cover scan styles. |
| QF-L12 | P3 | `frontend/src/utils/logger.ts:12` | error() logs unconditionally in production | `warn()` and `log()` are gated on `isDev` but `error()` always logs. Document or gate consistently. |
| QF-L13 | P3 | `sidequest/pipeline-core/git/migration-file-resolver.ts:64` | Redundant map lookup in condition | Condition `(resolved.get(step.index)?.length ?? 0) === 0` duplicates the map lookup on the next line. Consolidate into single lookup. |
| QF-L14 | P3 | `sidequest/pipeline-core/config/repository-config-loader.ts:17` | Double blank line after section header removal | Removal of `// === Type Definitions ===` left double blank line. Inconsistent with file style. |

---

## Documentation Audit — Pipeline Count Ambiguity (2026-03-12)

<a id="doc-audit-pipeline-count"></a>

Source: pipeline-core repomix analysis + README/CLAUDE.md cross-reference audit.

### Medium

| ID | Priority | File | Title | Description |
|----|----------|------|-------|-------------|
| DA-M1 | P2 | `sidequest/workers/repomix-worker.ts`, `sidequest/pipeline-runners/` | Repomix worker has no corresponding pipeline-runner | `repomix-worker.ts` exists (1 of 10 workers) but there is no `repomix-pipeline.ts` in `pipeline-runners/`. All other workers have a matching pipeline-runner file. Both README.md and CLAUDE.md claim "11 pipelines" — this count includes Repomix, but the Repomix pipeline may use a different execution pattern (direct worker instantiation via API/cron rather than a `BasePipeline` subclass or standalone runner script). **Investigate:** (1) How is repomix-worker triggered — API endpoint, cron, or manual? (2) Should a `repomix-pipeline.ts` runner be created for consistency? (3) If the current pattern is intentional, document why Repomix diverges and clarify whether "11 pipelines" means 11 pipeline-runners or 11 logical pipelines (10 runners + 1 API-only). Related: RP-H1/M2/M3/L4 items from the Repomix outage (2026-03-12) may inform this — the 914-job queue buildup suggests cron triggers without a proper pipeline-runner gate. |

---

## API Status Activity Feed — Post-Fix Review (2026-03-12)

Code review of commit 501e079 (`fix(api): restore activity feed from DB after server restart`).

### Done

| ID | Priority | File | Title | Commit |
|----|----------|------|-------|--------|
| AS-H1 | P1 | `api/server.ts:164-186` | Type mismatch on `id` field (number vs string) | 501e079 |
| AS-H2 | P1 | `api/server.ts:166-186` | Missing error boundary around DB fallback query | 501e079 |
| AS-M3 | P2 | `sidequest/core/constants.ts:16` | NINE_SECONDS constant pollutes production namespace | 501e079 |

### Done

| ID | Priority | File | Title | Commit |
|----|----------|------|-------|--------|
| AS-M4 | P2 | `tests/unit/api-status-activity-fallback.test.ts:77-104` | Duplicated status→event-type mapping in test cases | 43a633c |
| AS-M5 | P2 | `sidequest/core/database.ts:470` | Sort order divergence between in-memory and DB fallback | 43a633c |
| AS-L6 | P3 | `api/server.ts:174-177` | `event` field uses magic strings instead of constants | 43a633c |
| AS-L7 | P3 | `tests/unit/api-status-activity-fallback.test.ts` | Missing test coverage for `running` status branch | 43a633c |

### Done — Code Review Findings (Commit 43a633c)

| ID | Priority | File | Title | Commit |
|----|----------|------|-------|--------|
| AS-M6 | P2 | `api/utils/job-helpers.ts:4,12` | `status` parameter narrowed to `JobStatus` union type | 5b0ed9f |
| AS-M7 | P2 | `api/server.ts:171` | DB-fallback activity IDs use `-(index + 1)` to avoid collision | 4e87690 |
| AS-M8 | P2 | `sidequest/core/database.ts:472-474` | Defensive comment added to ORDER BY interpolation | a0ee6da |
| AS-L8 | P3 | `api/server.ts:217-218` | Fixed `||` → `??` for DB fallback queue stats | 6b78ed7 |
| AS-L9 | P3 | `api/server.ts:219` | Added comment clarifying `capacity` is raw count | 6b78ed7 |

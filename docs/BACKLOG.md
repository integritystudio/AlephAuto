# Backlog

Technical debt and planned improvements.

**Last Updated:** 2026-03-09 | **Last Session:** 2026-03-09 (consolidation fixes CD1-CD5)

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

### High Priority (Security/Correctness)

#### H4: `start-multi` accepts arbitrary filesystem paths
**Priority**: P1 | **Source**: code-review:2026-03-09
`POST /api/scans/start-multi` passes `repositoryPaths` array to `worker.scheduleScan()` without validation. Attacker can supply `/etc/passwd` or any host path. Apply allowlist against configured repositories or validate against known-safe prefix. -- `scans.ts:82-117`

#### H5: Retry endpoint re-executes unsanitized job parameters
**Priority**: P1 | **Source**: code-review:2026-03-09
`POST /api/jobs/:jobId/retry` merges full original `jobData` from database and spreads it as new job parameters without schema validation. If original data contained injected fields, they are re-executed on retry. -- `jobs.ts:384-390`

#### H6: Manual pipeline trigger bypasses parameter validation
**Priority**: P1 | **Source**: code-review:2026-03-09
`POST /:pipelineId/trigger` validates envelope only (`z.record(z.unknown())`) but not contents. Raw map spread into job with no per-pipeline validation. -- `pipelines.ts:290-294`

#### H7: REPORTS_DIR hardcoded, violates config pattern
**Priority**: P2 | **Source**: code-review:2026-03-09
`REPORTS_DIR` hardcoded as `path.join(process.cwd(), 'output', 'reports')` with no existence check. Violates CLAUDE.md critical pattern #2 (use config, not process.cwd). First GET may throw unhandled error if directory missing. -- `reports.ts:18`

#### H8: Auth key falls back to raw process.env
**Priority**: P2 | **Source**: code-review:2026-03-09
`getConfiguredApiKey()` falls back to `process.env.API_KEY` directly, violating project rule against direct env access. Config object cast suggests apiKey property may not be typed, causing fallback to always activate. -- `auth.ts:41-43`

#### H9: timingSafeEqual duplicate leaks length, bypasses timing defense
**Priority**: P2 | **Source**: code-review:2026-03-09
Local `timingSafeEqual` in `jobs.ts` has early-exit on length mismatch (line 37) which defeats timing safety. Also duplicates already-correct implementation in `auth.ts`. Consolidate or fix. -- `jobs.ts:27-43`

### Medium Priority

#### M10: Duplicate DuplicateDetectionWorker bypasses registry + shutdown
**Priority**: P2 | **Source**: code-review:2026-03-09
`scans.ts` creates independent `DuplicateDetectionWorker` at module load, outside `workerRegistry`. Has no activity feed integration, no circuit breaker, no graceful shutdown. Jobs visible to `POST /api/scans/start` are invisible to `GET /api/status`. -- `scans.ts:31-41`

#### M11: `/:scanId/status` returns aggregate worker stats regardless of scanId
**Priority**: P2 | **Source**: code-review:2026-03-09
Route ignores `scanId` parameter, returns entire worker's stats for any request. Caller cannot distinguish "scan not found" from "scan running". -- `scans.ts:123-142`

#### M12: `hasMore` pagination flag off-by-one in pipelines
**Priority**: P3 | **Source**: code-review:2026-03-09
`hasMore: result.jobs.length === limit` returns `true` when page is exactly limit-sized even if no more results exist. Use `(offset + length) < total` (correct in `jobs.ts:142`). -- `pipelines.ts:75`

#### M13: Sentry captures raw req.headers including Authorization
**Priority**: P2 | **Source**: code-review:2026-03-09
Error handler sends full `req.headers` to Sentry in custom contexts, exposing `authorization` and `x-api-key` headers unredacted. Apply `SENSITIVE_KEYS` set before passing to Sentry. -- `error-handler.ts:63-70`

#### M14: Shell command injection in port-cleanup utility
**Priority**: P2 | **Source**: code-review:2026-03-09
`killProcessOnPort()` uses template-string exec: `kill -9 ${pid}` where `pid` comes from `lsof` output string. Pathological output or locale issues could inject shell tokens. Use `execFile()` with args array. -- `port-manager.ts:111-124`

#### M15: WebSocket subscribe accepts unconstrained channel names
**Priority**: P3 | **Source**: code-review:2026-03-09
No validation on channel names, no subscription limit per client. Client can fill subscriptions with arbitrary large entries. `getClientInfo` exposes full subscription list over HTTP without auth. -- `websocket.ts:252-257`

### Low Priority

#### L16: validateQuery double-cast bypasses TypeScript type safety
**Priority**: P4 | **Source**: code-review:2026-03-09
Middleware stores validated data at non-standard property, routes retrieve via double-cast through `unknown`, completely bypassing type checking. Declare shared module augmentation for `express.Request` once. -- `validation.ts:85`, `pipelines.ts:52`

#### L17: `/:scanId/results` does 7 serial table reads instead of direct lookup
**Priority**: P3 | **Source**: code-review:2026-03-09
Fetches `MAX_LIMIT` jobs from 7 different pipelines serially looking for scan. `jobRepository.getJob(scanId)` already does direct primary-key lookup. -- `scans.ts:166-177`

#### L18: retryCount read from wrong location enables retry-limit bypass
**Priority**: P3 | **Source**: code-review:2026-03-09
`retryCount` read from `job.data` instead of top-level `job.retryCount`. Auto-retry mechanism may not store it in data, bypassing manual retry limit. -- `jobs.ts:364-367`

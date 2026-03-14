# Backlog

Technical debt and planned improvements.

**Last Updated:** 2026-03-14 | **Last Session:** 2026-03-14 (backlog-migrate: migrated CR-H2, CR-H4, CR-M8, CR-M9, CR-M10, CR-M11, CR-M12, CR-M13, CR-M14 to v2.3.29)

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

### SC-L5: `_generateCommitMessage`/`_generatePRContext` public on `server.ts`

Should be `protected`; currently exposed on external API surface. Skipped — 6+ test call sites require public access.

### SU-FR-M4: Unnecessary `as readonly string[]` cast on `METRIC_KEYS`

`report-generator.ts:361` — Reverted by linter; cast required by project lint rules. Accepted as-is.

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


## Dashboard Populate Pipeline Outage (2026-03-10)

<a id="dp-outage"></a>

Root cause investigation: relevance evaluations stopped on 2026-03-03. Session: bug-detective.

---


## BasePipeline Migration — Remaining Pipelines (2026-03-13)

Migrate the last 2 pipelines (Repomix, Duplicate Detection) to `BasePipeline`. Context: 9 of 11 pipelines already migrated in commit 42e2f18.

> **Implementation docs** — keep in sync with this section when items are completed or scope changes:
> - [MIGRATE_REPOMIX_TO_BASEPIPELINE.md](architecture/MIGRATE_REPOMIX_TO_BASEPIPELINE.md)
> - [MIGRATE_DUPLICATE_DETECTION_TO_BASEPIPELINE.md](architecture/MIGRATE_DUPLICATE_DETECTION_TO_BASEPIPELINE.md)

### Low

| ID | Priority | Description |
|----|----------|-------------|
| BP-L1 | P3 | Migrate `duplicate-detection-pipeline.ts` to `DuplicateDetectionPipeline extends BasePipeline<DuplicateDetectionWorker>`. Requires adding optional `async initialize()` hook to `BasePipeline` (for `worker.initialize()` + config stats logging). Benefits: `scheduleCron()` consistency, `setupDefaultEventListeners()`. Complexity: pipeline has `runOnStartup` early-exit mode (`process.exit(0)`) that doesn't fit `BasePipeline` lifecycle. ~35 lines saved. Post-DD-GW1: stale PRCreator type re-exports in comment can be cleaned regardless. Acceptable to leave functional. |

---

## Code Review Findings (2026-03-14)

Code review of codebase via `repomix-git-ranked.xml`. Issues #6 (pipelineId extraction) and #7 (default error classification) addressed in session. Remaining 15 findings documented below.

### High

| ID | Priority | Description |
|---|----------|-------------|
| CR-H1 | P1 | **Authentication bypass on read endpoints** — `api/middleware/auth.ts:17-29`. `PUBLIC_PATHS` exempts `/api/jobs`, `/api/pipelines`, `/api/scans`, `/api/reports` — all read endpoints are fully unauthenticated. If intentional for internal-only dashboard, document explicitly. Otherwise, restrict GET routes. |
| CR-H5 | P2 | **Migration API key in request body, not header** — `api/routes/jobs.ts:151,161`. Secrets in request bodies are logged in full by middleware stacks and appear in error traces. Accept key via header (e.g., `X-Migration-Key`) matching `authMiddleware` pattern. |

### Medium

| ID | Priority | Description |
|---|----------|-------------|

### Low

| ID | Priority | Description |
|---|----------|-------------|
| CR-L13 | P3 | **WebSocket subscription limit silently drops excess channels** — `api/websocket.ts:269-274`. Client sends 60 channels when at 50-subscription limit, last 10 silently dropped. `subscribed` response only reflects added channels. Add `dropped` count or warning field to notify client. |
| CR-L14 | P3 | **_resolveUniqueJobId has unbounded retry loop** — `sidequest/core/server.ts:229-247`. `while (this.jobs.has(candidateId))` has no upper bound. Pathological job ID patterns could loop extensively. Cap at reasonable limit (e.g., 100) and throw if exceeded. |
| CR-L15 | P3 | **validateApiKey padding logic is fragile** — `api/middleware/auth.ts:57-67`. Current padding-then-compare is correct but relies on `sameLength` guard. Simpler: hash both sides with `crypto.createHash('sha256')` to guarantee equal-length buffers, remove manual padding entirely. |
| CR-L16 | P3 | **config.ts reads process.env directly at module scope** — `sidequest/core/config.ts:88-152`. Values read synchronously before module completes export. Any code that imports config before dotenv loads sees undefined values. Wrap critical reads in getter or add explicit dotenv promise await. |
| CR-L17 | P3 | **Documentation mismatch: CLAUDE.md references jobsApiPort** — CLAUDE.md references `config.jobsApiPort` but code exports `config.apiPort`. Update CLAUDE.md or rename export to match docs. |
| CR-L18 | P3 | **createRequest parameter lacks type annotation** — `tests/unit/auth-middleware.test.ts:13`. `overrides = {}` is implicitly typed as `{}`. Should be `Partial<Pick<Request, 'path' | 'headers' | 'ip'>>` or similar to prevent unrelated objects. |
| CR-L19 | P3 | **createResponse type alias duplicated** — `tests/unit/auth-middleware.test.ts:22,34`. Intersection type `Response & { statusCode: number | null; body: ... }` appears in both signature and cast. Extract to module-scope `type MockResponse`. |
| CR-L20 | P3 | **JSDoc mismatch: getScanResults says Promise<any>** — `frontend/src/services/api.ts:346`. JSDoc says `@returns {Promise<any>}` but implementation returns `Promise<unknown>`. Update JSDoc to match. |

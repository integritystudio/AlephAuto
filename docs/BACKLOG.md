# Backlog

Technical debt and planned improvements.

**Last Updated:** 2026-03-14 | **Last Session:** 2026-03-14 (backlog-implementer: implemented CR-L13 through CR-L20, CR-L17; BP-L1 accepted as-is)

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

## ast-grep Analysis Findings (2026-03-09)

<a id="ast-grep-findings"></a>

Address the 2 high-severity large-class code smells and 14 standards warnings identified by ast-grep.

> **Source analysis** — keep in sync with this section when items are completed or scope changes:
> - [ast-grep-analysis-2026-03-09.md](ast-grep-analysis-2026-03-09.md)

### Medium

| ID | Priority | Description |
|---|----------|-------------|
| AG-M1 | P2 | **2 large-class code smells** — High-severity findings from ast-grep `detect_code_smells`. Reduce class size or extract collaborators. See `ast-grep-analysis-2026-03-09.md` §Code Smells for file locations. |

### Low

| ID | Priority | Description |
|---|----------|-------------|
| AG-L1 | P3 | **14 standards warnings** — `enforce_standards` found 14 warning-level violations (109 total, 95 info). Triage and fix warnings; info-level acceptable as-is. See `ast-grep-analysis-2026-03-09.md` §Standards. |

---

## Relocated Scripts — Dead Code / Staleness Audit (2026-03-15)

<a id="scripts-audit"></a>

8 setup scripts relocated from `docs/setup/` to `scripts/` in commit `30f0cde`. Audit for dead code, stale references, and continued relevance.

### Low

| ID | Priority | Description |
|---|----------|-------------|
| SC-L1 | P3 | **Audit `scripts/cron-setup.sh`** — Verify cron entries match current pipeline runner names and schedules. Remove references to deleted pipelines. |
| SC-L2 | P3 | **Audit `scripts/setup-sentry.js` / `scripts/setup-doppler-sentry.js`** — Check for hardcoded project slugs, stale DSN values, or deprecated Sentry SDK setup patterns. |
| SC-L3 | P3 | **Audit `scripts/configure-discord-alerts.js` / `scripts/sentry-to-discord.js`** — Verify webhook URLs and channel references are still valid. Check for dead import paths post-relocation. |
| SC-L4 | P3 | **Audit `scripts/log-cleanup.sh` / `scripts/weekly-log-summary.sh`** — Confirm log directory paths match current `logs/` structure. Check for references to removed log formats. |
| SC-L5 | P3 | **Audit `scripts/update-cron.sh`** — Verify it references current `ecosystem.config.cjs` and PM2 process names. |

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

No active low-priority backlog items.

> CR-L13 through CR-L20 migrated to [v2.3.29](changelog/2.3/CHANGELOG.md#2329---2026-03-14).

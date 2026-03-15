# Backlog

Technical debt and planned improvements.

**Last Updated:** 2026-03-15 | **Last Session:** 2026-03-15 (code-review: bd71f82 findings fixed in 8a45998)

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

#### AG-M1-T1: Add snapshot tests for html-report-sections generators

`sidequest/pipeline-core/reports/html-report-sections.ts` exports 7 section generators + `isInterProject` with no test coverage. Add snapshot tests covering both intra-project and inter-project `ScanResult` inputs, empty arrays, missing metadata fallbacks, and invalid timestamp strings.

#### AG-M1-T2: Empty chart section renders when no suggestions

`html-report-sections.ts:generateSummaryCharts` renders `<h2>` and empty `<div class="chart-bars">` containers when `total === 0`. Add early-return empty state matching the pattern used in `generateDuplicateGroups` and `generateSuggestions`.

#### AG-M1-T3: DRY `isInterProject` across all report generators

`json-report-generator.ts` and `markdown-report-generator.ts` still inline `const isInterProject = scanResult.scan_type === 'inter-project'`. Refactor to import the shared `isInterProject()` from `html-report-sections.ts` (or relocate it to a shared report utility).

> SV4-SV6 migrated to [v2.3.23](changelog/2.3/CHANGELOG.md#2323---2026-03-09).
> AG-M1 review fixes (items 1-5) landed in `8a45998`.

---


## Dashboard Populate Pipeline Outage (2026-03-10)

<a id="dp-outage"></a>

Root cause investigation: relevance evaluations stopped on 2026-03-03. Session: bug-detective.

---

## ast-grep Analysis Findings (2026-03-09)

<a id="ast-grep-findings"></a>

Address the 14 standards warnings identified by ast-grep.

> **Source analysis** — keep in sync with this section when items are completed or scope changes:
> - [ast-grep-analysis-2026-03-09.md](roadmap/ast-grep-analysis-2026-03-09.md)

### Medium

No active medium-priority backlog items.

> AG-M1 migrated to [v2.3.30](changelog/2.3/CHANGELOG.md#2330---2026-03-15).

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
| SC-L1 | P3 | **Audit `scripts/logs/cron-setup.sh`** — Verify cron entries match current pipeline runner names and schedules. Remove references to deleted pipelines. |
| SC-L2 | P3 | **Audit `scripts/setup/setup-sentry.js` / `scripts/setup/setup-doppler-sentry.js`** — Check for hardcoded project slugs, stale DSN values, or deprecated Sentry SDK setup patterns. |
| SC-L3 | P3 | **Audit `scripts/setup/configure-discord-alerts.js` / `scripts/setup/sentry-to-discord.js`** — Verify webhook URLs and channel references are still valid. Check for dead import paths post-relocation. |
| ~~SC-L4~~ | ~~P3~~ | ~~**Audit `scripts/logs/log-cleanup.sh` / `scripts/logs/weekly-log-summary.sh`** — Fixed: stale `setup-files/` usage comments updated to `scripts/logs/`; `weekly-log-summary.sh` called `docs/setup/log-cleanup.sh` (old path) — updated to `scripts/logs/log-cleanup.sh`. Log directory paths (`logs/`, `logs/archive/`, `logs/cleanup-logs/`) match current structure. No removed log formats referenced.~~ **Done** |
| ~~SC-L5~~ | ~~P3~~ | ~~**Audit `scripts/logs/update-cron.sh`** — Fixed: cron entries pointed to old `docs/setup/` paths; updated to `scripts/logs/`. No `ecosystem.config.cjs` references needed (script only manages log cleanup cron, not PM2).~~ **Done** |

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

---

## Frontend Code Review Findings (2026-03-15)

Code review of `frontend/src/hooks/useWebSocketConnection.ts`. Critical and high-severity issues (1-5) fixed in session; remaining medium/low findings documented below.

### Medium

| ID | Priority | Description |
|---|----------|-------------|
| ~~FE-M1~~ | ~~P2~~ | ~~**Activity feed deduplication gap** — `mapApiActivity()` generates new `crypto.randomUUID()` on every poll for items with missing `id`, causing duplicates to accumulate. Fixed: fallback ID is now a deterministic template literal derived from `type`, `timestamp`, `jobId`, `pipelineId`. Test: `tests/unit/activity-stable-id.test.ts`.~~ **Done** |
| FE-M3 | P2 | **Unknown pipeline IDs silently misclassified** — `PIPELINE_TYPE_MAP[p.id] ?? PipelineType.DUPLICATE_DETECTION` defaults unknown pipelines to DUPLICATE_DETECTION. Add `UNKNOWN` variant or validate map on startup with warning. -- `frontend/src/hooks/useWebSocketConnection.ts:141` |

> FE-M4, FE-M5, FE-L1 resolved in `e8c0fab` (type centralization refactor). Migrate to changelog with next version bump.

### Low

No active low-priority backlog items.

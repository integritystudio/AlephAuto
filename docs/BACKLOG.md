# Backlog

Technical debt and planned improvements.

**Last Updated:** 2026-03-17 | **Last Session:** 2026-03-17 (backlog fixes: VS-M1, AG-M1-T1, CR-H5, SC-L5, SU-FR-M4)

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

### SC-L5: `_generateCommitMessage`/`_generatePRContext` — Resolved

Changed from `public` to `protected` in base class and all 3 worker overrides. Test subclass exposes proxy methods. Commit `61e6a04`.

### SU-FR-M4: Unnecessary `as readonly string[]` cast on `METRIC_KEYS` — Resolved (won't-fix)

`report-generator.ts:361` — Cast required by TypeScript: `.includes()` on `readonly` tuple with literal types won't accept plain `string` without it. Accepted as-is.

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
### Low — Resolved

#### AG-M1-T1: Add snapshot tests for html-report-sections generators

24 tests covering all 7 exported section generators + `isInterProject` with intra-project, inter-project, and empty input fixtures. Commit `19bd662`.

> SV4-SV6 migrated to [v2.3.23](changelog/2.3/CHANGELOG.md#2323---2026-03-09).
> AG-M1 review fixes and refactoring items migrated to [v2.3.31](changelog/2.3/CHANGELOG.md#2331---2026-03-15).

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

## Code Review Findings (2026-03-14)

Code review of codebase via `repomix-git-ranked.xml`. Issues #6 (pipelineId extraction) and #7 (default error classification) addressed in session. Remaining 15 findings documented below.

### High

| ID | Priority | Description |
|---|----------|-------------|
| CR-H1 | P1 | **Authentication bypass on read endpoints** — `api/middleware/auth.ts:17-29`. `PUBLIC_PATHS` exempts `/api/jobs`, `/api/pipelines`, `/api/scans`, `/api/reports` — all read endpoints are fully unauthenticated. If intentional for internal-only dashboard, document explicitly. Otherwise, restrict GET routes. |

### High — Resolved

| ID | Description | Resolution |
|---|-------------|------------|
| CR-H5 | **Migration API key in request body, not header** | Moved to `X-Migration-Key` header. Commit `af8fdd2`. |

### Medium

No active medium-priority backlog items.

### Low

No active low-priority backlog items.

> CR-L13 through CR-L20 migrated to [v2.3.29](changelog/2.3/CHANGELOG.md#2329---2026-03-14).

---

## Fix-Types Script Code Review Findings (2026-03-17)

Code review of `scripts/setup/fix-types.ts`. All 5 findings fixed in session.

### Medium — Resolved

| ID | Description | Resolution |
|---|-------------|------------|
| FT-M1 | **Unsafe `as Error` cast on catch** — `(error as Error).message` drops failure details when thrown value is not an `Error`. | Replaced with `instanceof` check + `String()` fallback. |
| FT-M2 | **Silent swallowed typecheck errors** — Both typecheck `catch` blocks suppressed actual error, masking environmental failures. | Both blocks now capture and log the error message. |

### Low — Resolved

| ID | Description | Resolution |
|---|-------------|------------|
| FT-L1 | **Magic exit code** — Bare `process.exit(1)` in 3 locations. | Extracted `EXIT_FAILURE = 1` constant. |
| FT-L2 | **Fragile `../..` path traversal** — Hardcoded relative path breaks if script moves. | Replaced with `findProjectRoot()` that walks up searching for `package.json`. |
| FT-L3 | **Inconsistent `stdio` option** — `rm -rf node_modules` call lacked `stdio: 'inherit'` unlike all other `execSync` calls. | Added `stdio: 'inherit'`. |

---

## Setup Script Code Review Findings (2026-03-17)

Code review of `scripts/setup/verify-setup.ts`. High-severity type and error-handling issues (1-12) fixed across 12 commits; remaining medium/low findings documented below.

### Medium — Resolved

| ID | Description | Resolution |
|---|-------------|------------|
| VS-M1 | **`spawnSync` error state not fully checked** | Added `result.error` guard at all 5 call sites with error detail in thrown messages. |

### Low — Resolved

| ID | Description | Resolution |
|---|-------------|------------|
| VS-L1 | **`pkg.version` read from package.json is untyped** | Cast `JSON.parse()` result to `{ version?: string }` with `?? 'unknown'` fallback. |
| VS-L2 | **`result.stdout` trimmed without null guard on optional checks** | Added `(result.stdout ?? '').trim()` at all 4 call sites. |

---

## Frontend Code Review Findings (2026-03-15)

Code review of `frontend/src/hooks/useWebSocketConnection.ts`. Critical and high-severity issues (1-5) fixed in session; remaining medium/low findings documented below.

### Medium

No active medium-priority backlog items.

> FE-M1, FE-M3 migrated to [v2.3.31](changelog/2.3/CHANGELOG.md#2331---2026-03-15).
> FE-M4, FE-M5, FE-L1 resolved in `e8c0fab` (type centralization refactor). Migrate to changelog with next version bump.

### Low

No active low-priority backlog items.

---

## Git Activity Pipeline (2026-03-18)

<a id="git-activity"></a>

Investigation of production failures (`git-activity-weekly-1773018000380`, `git-activity-weekly-1773018000292`) — jobs hung for 9 days, marked failed on server restart with null error.

### GA-M1: Migrate getRepoStats from filesystem git to GitHub API

**Problem:** `getRepoStats` in `git-activity-collector.ts` runs local `git log` commands against `~/code` paths. This only works on the dev machine — the production Render server has no local repos, causing jobs to hang indefinitely.

**Solution:** Replace filesystem-based `git log` calls with GitHub API (`gh api` or Octokit) to fetch commit stats, file changes, and contributor activity. Remove dependency on local repo clones.

**Files:** `sidequest/workers/git-activity-collector.ts` (`getRepoStats`, `findGitRepos`)

### GA-M2: Add execution timeout to git-activity worker

**Problem:** No timeout on `runJobHandler` — a single slow or hanging git operation blocks the job forever. The two 3/9 jobs ran for 9 days before being killed by a server restart.

**Solution:** Wrap `runJobHandler` body (or individual `getRepoStats` calls) with `AbortSignal.timeout()` or `Promise.race` against a configurable timeout (e.g., `TIMEOUTS.GIT_ACTIVITY_MS`). Fail fast with a clear timeout error.

**Files:** `sidequest/workers/git-activity-worker.ts` (`runJobHandler`), `sidequest/core/constants.ts` (add timeout constant)

---

## Dashboard Populate Pipeline (2026-03-18)

<a id="dashboard-populate"></a>

7 failures across three distinct modes.

### DP-M1: Fix `spawn npm ENOENT` in child process execution

**Problem:** 4 failures (3/4) — `npm` not found when the worker spawns `npm run populate -- --seed`. PM2/cron environments don't inherit NVM-managed PATH, so `npm` resolves to nothing.

**Solution:** Use absolute path to `npm` (resolve via `which npm` at startup or use `process.execPath` to derive the node bin directory), or spawn `node` directly with the populate script instead of going through `npm run`.

**Files:** `sidequest/workers/dashboard-populate-worker.ts`

### DP-L1: Investigate populate script crash at line 68

**Problem:** 1 failure (3/11) — `npm run populate -- --seed` exited with code 1, stack trace points to `populate-dashboard.ts:68`. Error message truncated in DB.

**Solution:** Reproduce locally with `npm run populate -- --seed`, inspect the error at line 68, and add better error handling/logging so the full message persists.

**Files:** `~/.claude/mcp-servers/observability-toolkit/dashboard/scripts/populate-dashboard.ts`

---

## Duplicate Detection Pipeline (2026-03-18)

<a id="duplicate-detection"></a>

26 failures. All recent failures (3/9, 3/10) share the same root cause; older failures (2/16, 2/26) are null-error hung jobs killed by server restarts.

### DD-M1: Fix `ast-grep not available` in PM2/production PATH

**Problem:** Dependency validation fails because `ast-grep` CLI is not on PATH when the process is spawned by PM2. Same class of issue as DP-M1 — PM2 doesn't inherit NVM-managed or globally-installed binaries.

**Solution:** Resolve `ast-grep` binary path at worker startup (e.g., via `which` or known install location) and pass the absolute path to the scan orchestrator. Alternatively, ensure PM2 ecosystem config sets `env.PATH` to include the node bin directory.

**Files:** `sidequest/pipeline-core/scan-orchestrator.ts` (dependency validation), `config/ecosystem.config.cjs` (PM2 PATH)

---

## Job Pipeline (2026-03-18)

<a id="job-pipeline"></a>

35 failures. The `job` pipeline ID is used by duplicate-detection retries that lost their original pipeline ID. Same root causes as duplicate-detection.

### JB-L1: Audit `job` pipeline ID assignment on retries

**Problem:** Retry jobs created with generic `job` pipeline ID instead of `duplicate-detection`. This makes failure triage harder and skews per-pipeline stats.

**Solution:** Ensure retry jobs inherit `pipelineId` from the original job. Check `_finalizeJobFailure` retry path and the retry endpoint in `api/routes/jobs.ts`.

**Files:** `sidequest/core/server.ts` (`_finalizeJobFailure`), `api/routes/jobs.ts` (retry endpoint)

---

## Repomix Pipeline (2026-03-18)

<a id="repomix"></a>

10 failures — all from 2/15, all test fixture temp-dir jobs with null errors. Not real production failures.

### RX-L1: Clean up test fixture repomix jobs from production DB

**Problem:** Integration tests on 2/15 persisted 10 repomix jobs against `/var/folders/.../aleph-test-*` temp dirs to the production database. They failed with null errors (temp dirs cleaned up before jobs ran).

**Solution:** Delete these rows. Prevent test jobs from persisting to production DB by checking for test-pattern job IDs or a `NODE_ENV=test` guard in `_persistJob`.

**Files:** `sidequest/core/server.ts` (`_persistJob`)

# Backlog

Technical debt and planned improvements.

**Last Updated:** 2026-03-11 | **Last Session:** 2026-03-11 (code-review: 3 items added from scan-repositories.json review)

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


### Open — Final Review Findings (2026-03-09)

| ID | Priority | File | Title | Description |
|----|----------|------|-------|-------------|
| SU-FR-M4 | Low | `report-generator.ts:361` | Unnecessary `as readonly string[]` cast on `METRIC_KEYS` | Reverted by linter; cast required by project lint rules. Accepted as-is. |

---

## Dashboard Populate Pipeline Outage (2026-03-10)

<a id="dp-outage"></a>

Root cause investigation: relevance evaluations stopped on 2026-03-03. Session: bug-detective.

### Open

| ID | Priority | File | Title | Description |
|----|----------|------|-------|-------------|
| DP-H1 | P0 | `config/ecosystem.config.cjs` | Add `dashboard-populate-pipeline.ts` to PM2 ecosystem | The dashboard-populate cron (`0 6,18 * * *`) is built into `dashboard-populate-pipeline.ts --cron` but was **never registered** as a PM2 process. `aleph-worker` runs `duplicate-detection-pipeline.ts` instead. Add a third PM2 process (`aleph-populate`) or reassign `aleph-worker`. All 5,296 historical evaluations came from manual runs. |
| DP-H2 | P1 | PM2 | Restart PM2 processes | Both `aleph-dashboard` and `aleph-worker` are down. `aleph-dashboard` received SIGTERM at 2026-03-10 03:46; PM2 shows zero running processes. Restart via `cd ~/code/jobs && doppler run -- pm2 start config/ecosystem.config.cjs && pm2 save`. |
| DP-M1 | P2 | PM2 / Doppler | Refresh Doppler secrets on PM2 restart | Doppler cache is stale since 2026-03-08 05:52 UTC. `aleph-dashboard` uses static env vars from PM2 startup (no `doppler run` wrapper). Restarting with `doppler run --` injects fresh secrets. Monitor via `/api/health/doppler`. |
| DP-M2 | P2 | `config/ecosystem.config.cjs` | Remove orphaned `DASHBOARD_CRON_SCHEDULE` from `aleph-worker` env | `aleph-worker` env includes `DASHBOARD_CRON_SCHEDULE: '0 6,18 * * *'` but runs `duplicate-detection-pipeline.ts` which never reads it. Move to the new `aleph-populate` process env to avoid confusion. |

### Done

| ID | Priority | File | Title | Resolution |
|----|----------|------|-------|------------|
| DP-D1 | P1 | `sidequest/core/constants.ts` | `export enum SECONDS` broke `node --strip-types` | Fixed in commit 58e1d5e (2026-03-09). Enum replaced with `as const` object. Caused `aleph-worker` crash-loop from 2026-03-07 23:58 onward. |
| DP-D2 | — | `dashboard/scripts/.kv-sync-state.json` | Stale sync state (157K entries vs 22 KV keys) | Deleted state file and re-ran sync. Trend keys now written to KV. |

---

## Scan Configuration Findings (2026-03-11)

Code review (`config/scan-repositories.json`): Portability and validation issues.

### Open

| ID | Priority | File | Title | Description |
|----|----------|------|-------|-------------|
| SR-M1 | P2 | `config/scan-repositories.json:24,102,180` | Hardcoded absolute paths tied to user's machine | All `path` values use `/Users/alyshialedlie/code/jobs/...` (user-specific). If consumed outside this machine or in CI/CD, paths will fail. Solution: Use relative paths from a known root (e.g., `./sidequest`, `./sidequest/pipeline-core`) or resolve at runtime via env var like `$JOBS_ROOT`. |
| SR-L1 | P3 | `config/scan-repositories.json:189` | `_comment` field may fail schema validation | Non-standard JSON comment workaround on `tests` entry. If `scan-repositories.schema.json` uses `additionalProperties: false`, validation will fail. Solution: Either add `_comment` to allowed properties in schema or move comment to a separate `.comments.json` file. |
| SR-L2 | P3 | `sidequest/pipeline-core/config/repository-config-loader.ts` | Redis provider availability not validated at startup | `cacheConfig.provider: "redis"` set in config, but no runtime check confirms Redis is running. May silently fail or degrade if Redis is unavailable. Solution: Add provider validation in `RepositoryConfigLoader` constructor or `cacheConfig` getter. |


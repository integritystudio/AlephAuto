# Backlog

Technical debt and planned improvements.

**Last Updated:** 2026-03-13 | **Last Session:** 2026-03-13 (backlog-implementer: 9 items implemented — AS-M6/M7/M8/L8/L9, RP-H1/M2/M3/L4)

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


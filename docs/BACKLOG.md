# Backlog

Technical debt and planned improvements.

**Last Updated:** 2026-03-17 | **Last Session:** 2026-03-17 (code review + fix: scripts/setup/fix-types.ts, 5 findings)

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
| CR-H5 | P2 | **Migration API key in request body, not header** — `api/routes/jobs.ts:151,161`. Secrets in request bodies are logged in full by middleware stacks and appear in error traces. Accept key via header (e.g., `X-Migration-Key`) matching `authMiddleware` pattern. |

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

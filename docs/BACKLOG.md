# Backlog

Technical debt and planned improvements.

**Last Updated:** 2026-03-09 | **Last Session:** 2026-03-09 (backlog-migrate: 3 items to v2.3.25, 61 to v2.3.24)

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
| SU-L2 | Low | `doppler-resilience.ts` | Class uses runtime throw instead of abstract method | Done — class made `abstract`, `fetchFromDoppler` made `abstract`; `TestDopplerResilience` added to `tests/fixtures/` for the 3 test files. |


# Backlog

Technical debt and planned improvements.

**Last Updated:** 2026-03-08 | **Last Session:** 2026-03-08 (added dashboard UI review findings)

> Tools: ast-grep MCP `analyze_complexity`, `detect_code_smells`, `detect_security_issues`, `enforce_standards`, `find_duplication`, `sync_documentation`

---

## Deferred / Blocked Items

No active deferred items.

Closed items migrated to changelog:
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

### Medium Priority

#### M43: Sanitize log strings to prevent log injection
**Priority**: P2 | **Source**: `feat(dashboard)` code review
Unsanitized `repositoryPath`, `summary`, and `filesProcessed` fields from job data are embedded directly into synthesized log output. Strip newlines and limit field length to prevent log injection attacks. -- `api/routes/jobs.ts:431-437`

#### M44: Use crypto.randomUUID() instead of Date.now() for synthetic activity IDs
**Priority**: P2 | **Source**: `feat(dashboard)` code review
Activity items lacking server-provided IDs use `Date.now()` as fallback inside forEach loops, causing ID collisions if multiple items lack IDs in the same tick. React key collisions result in stale rendering. -- `frontend/src/hooks/useWebSocketConnection.ts:141, 195`

### Low Priority

#### L19: Verify JobStatus enum includes 'cancelled' instead of using `as any`
**Priority**: P3 | **Source**: `feat(dashboard)` code review
`updateJob(jobId, { status: 'cancelled' as any })` suppresses type error. Check if `Job.status` type includes `'cancelled'` — if not, add it instead of using type assertion. -- `frontend/src/App.tsx:122`

#### L20: Add type safety to activity map helper functions
**Priority**: P3 | **Source**: `feat(dashboard)` code review
`mapActiveJob(j: any)` and `mapQueuedJob(j: any)` accept untyped parameters. Define minimal interface for `/api/status` response shape to catch field name drift at compile time. -- `frontend/src/hooks/useWebSocketConnection.ts:45, 62`

#### L21: Fix misleading StrictMode comment on isInitialized ref
**Priority**: P4 | **Source**: `feat(dashboard)` code review
Comment says ref prevents double-init in StrictMode, but cleanup resets the flag, making the guard ineffective. Either remove the ref or don't reset it in cleanup. -- `frontend/src/hooks/useWebSocketConnection.ts:242`

#### L22: Conditionally append ellipsis in PipelineDetailPanel job IDs
**Priority**: P4 | **Source**: `feat(dashboard)` code review
`substring(0, 20) + '...'` always appends ellipsis even for IDs shorter than 20 characters. Use CSS `text-overflow: ellipsis` or conditional append. -- `frontend/src/components/PipelineDetailPanel/PipelineDetailPanel.tsx:124`

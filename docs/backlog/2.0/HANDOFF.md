# Phase 4-6 Migration Handoff

## Completed

8 JS files migrated to strict TypeScript with proper interfaces, 142/142 tests passing, 0 TS errors in `.ts` files. Code review findings addressed. Type declaration packages installed (`@types/better-sqlite3`, `@types/node-cron`, `@types/babel__traverse`, `@types/babel__generator`).

Commit: `34c7977` — 44 files changed, 887 insertions, 1638 deletions.

## Remaining Coherence Issues in `sidequest/core/server.ts`

### 1. Structural repetition in job actions (lines 615-772)

`cancelJob`, `pauseJob`, `resumeJob` share identical structure: lookup → guard → mutate → persist → emit → breadcrumb → log → return. ~160 lines of near-duplicate scaffolding. Extract a shared `_executeJobAction` helper that accepts a mutation callback and action metadata.

### 2. Inconsistent `_persistJob` error handling

| Call site | Line | Guarded? |
|-----------|------|----------|
| `createJob` | 177 | `try/catch // Non-critical` |
| `_prepareJobForExecution` | 282 | `try/catch // Non-critical` |
| `_finalizeJobSuccess` | 339 | **unguarded — throws** |
| `_finalizeJobFailure` | 432 | `try/catch // Guard` |
| `cancelJob` | 647 | `try/catch // Non-critical` |
| `pauseJob` | 701 | `try/catch // Non-critical` |
| `resumeJob` | 749 | `try/catch // Non-critical` |

Line 339 is the odd one out. A `_persistJob` failure in `_finalizeJobSuccess` throws through to `executeJob`'s catch, triggering `_finalizeJobFailure`, which could double-count the job in `jobHistory`. Either guard it or document the intentional escalation.

### 3. Guard ordering in `_handleGitWorkflowSuccess` (lines 449-457)

```typescript
// Line 452: async call happens BEFORE the guard
const hasChanges = await this.gitWorkflowManager.hasChanges(repositoryPath);

// Line 454: guard should come first
if (!job.git.branchName || !job.git.originalBranch) { return; }
```

Move the branch-info guard above the `hasChanges` call to avoid a pointless async git operation when branch info is missing.

### 4. Duplicate file-logging methods (lines 567-595)

`logJobCompletion` and `logJobFailure` are structurally identical — mkdir → sanitize → writeFile — differing only in filename suffix (`.json` vs `.error.json`) and error field inclusion. Extract a shared `_writeJobLog(job, suffix, extra?)` helper.

### 5. `_generatePRContext` template readability (line 541)

Single 200+ char line with embedded markdown template. Break into a multi-line template or extract a helper for readability.

## Pre-existing Test Issues (not caused by migration)

- `tests/unit/server-unit.test.js` — hangs due to SQLite `database is locked` error (confirmed same behavior pre-migration)
- `tests/unit/test-utilities.test.js` — 3 timeouts in lifecycle tests (job retry loop exceeds 15s test timeout)
- `tests/unit/sidequest-server.test.js` — 1 timeout in `should handle job failure` (retry loop)

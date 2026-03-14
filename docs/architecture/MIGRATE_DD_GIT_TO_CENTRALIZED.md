# Migrate Duplicate Detection Git Workflow to Centralized BranchManager

**Status:** Proposed
**Created:** 2026-03-13
**Backlog ID:** DD-GW1 (P2) -- keep in sync with [BACKLOG.md](../BACKLOG.md#duplicate-detection-centralized-git-workflow-2026-03-13)
**Prerequisite:** None (independent of BP-L1 BasePipeline migration)

## Problem Statement

Duplicate Detection is the only pipeline using a **custom Git workflow** (`PRCreator` class, 434 lines). Every other Git-enabled pipeline uses the centralized `BranchManager` + `SidequestServer._handleGitWorkflowSuccess()` pattern. This creates:

1. **Duplicate git plumbing** -- PRCreator reimplements branch create/checkout/pull/commit/push/PR creation that BranchManager already provides
2. **Inconsistent error handling** -- PRCreator has its own cleanup logic; centralized workflow has Sentry-instrumented spans, `cleanupBranch()`, and non-blocking error semantics
3. **Divergent configuration** -- PRCreator uses `baseBranch`, `branchPrefix`, `dryRun` options; centralized uses `gitWorkflowEnabled`, `gitBaseBranch`, `gitBranchPrefix`, `gitDryRun` from config.ts
4. **Missing observability** -- BranchManager emits Sentry spans (`git.create_branch`, `git.commit`, `git.push`, `git.create_pr`); PRCreator has no span instrumentation

## Current Architecture

```
DuplicateDetectionWorker.runJobHandler()
  ├── ScanOrchestrator.runScan()         # Detect duplicates (JS+Python)
  ├── ReportCoordinator.generateReports() # Generate HTML/JSON reports
  └── PRCreator.createPRsForSuggestions() # Custom git workflow
        ├── _batchSuggestions()           # Group by maxSuggestionsPerPR
        └── for each batch:
              ├── git checkout -b          # Branch (reimplements BranchManager)
              ├── _applySuggestions()       # Write code changes
              │     └── MigrationTransformer.applyMigrationSteps()
              ├── git add / commit          # Commit (reimplements BranchManager)
              ├── git push                  # Push (reimplements BranchManager)
              └── gh pr create              # PR (reimplements BranchManager)
```

**Key difference from centralized:** PRCreator creates **N batched PRs per job** (default batch size: `LIMITS.DEFAULT_MAX_SUGGESTIONS_PER_PR`). Centralized workflow creates **one PR per job**.

## Design Decisions

### 1. One PR per job (drop batching)

The centralized workflow's lifecycle is: one branch per job, one commit, one PR. PRCreator's batching splits suggestions into multiple PRs per job. This migration consolidates to **one PR per repository scan**.

**Why this is acceptable:**
- Batching was a PRCreator implementation detail, not a product requirement
- Reviewers see the full consolidation picture in one PR instead of fragmented batches
- If a specific repo needs smaller PRs, create multiple scan jobs with filtered configs
- `maxSuggestionsPerPR` config option becomes the per-job suggestion cap (skip if exceeded)

### 2. Separate concern: code transforms vs git operations

Extract `_applySuggestions()` + `MigrationTransformer` out of PRCreator into the worker's `runJobHandler`. The worker applies code changes; `SidequestServer` handles git.

```
BEFORE: runJobHandler() → scan → PRCreator (applies changes + git ops)
AFTER:  runJobHandler() → scan → apply suggestions → return result
        SidequestServer → branch → [runJobHandler] → commit → push → PR
```

### 3. Override `_generateCommitMessage` and `_generatePRContext`

SidequestServer provides generic commit/PR templates. Override both on `DuplicateDetectionWorker` to produce the current consolidation-specific messages (suggestion IDs, strategy rationale, migration notes, impact scores).

### 4. Gate suggestion application on `gitWorkflowEnabled`

Currently: suggestions are only applied when `enablePRCreation = true`.
After: suggestions are only applied when `this.gitWorkflowEnabled = true` (centralized flag).

When git workflow is disabled, the scan still runs and produces reports, but no code changes are written to disk. This preserves existing behavior.

### 5. Preserve `enablePRCreation` as the user-facing toggle

Map `ENABLE_PR_CREATION` env var to `gitWorkflowEnabled` in the worker constructor. The user interface doesn't change; the implementation routes through centralized config.

### 6. `MigrationTransformer` stays on the worker

`MigrationTransformer` is domain logic (AST transforms, backup management), not git plumbing. It moves from PRCreator dependency to direct worker dependency.

## Target Architecture

```
DuplicateDetectionWorker extends SidequestServer
  gitWorkflowEnabled: true  ←── mapped from ENABLE_PR_CREATION
  gitBranchPrefix: 'consolidate'
  gitBaseBranch: config.gitBaseBranch

  runJobHandler(job):
    ├── ScanOrchestrator.runScan()
    ├── ReportCoordinator.generateReports()
    └── if gitWorkflowEnabled && suggestions.length > 0:
          ├── filter automatable suggestions (impact >= MEDIUM_SCORE_MIN)
          └── applySuggestions(suggestions, repoPath)  ←── moved from PRCreator
                └── MigrationTransformer.applyMigrationSteps()

  _generateCommitMessage(job):    ←── override for consolidation format
  _generatePRContext(job):        ←── override for consolidation format

SidequestServer lifecycle (no changes):
  _setupGitBranchIfEnabled(job)   →  BranchManager.createJobBranch()
  runJobHandler(job)              →  [scan + apply suggestions]
  _handleGitWorkflowSuccess(job)  →  BranchManager.commitChanges()
                                  →  BranchManager.pushBranch()
                                  →  BranchManager.createPullRequest()
```

## File Changes

### Modified: `sidequest/workers/duplicate-detection-worker.ts`

1. **Constructor** -- pass git config to `super()`:
   ```typescript
   super({
     ...options,
     jobType: 'duplicate-detection',
     maxConcurrent: options.maxConcurrentScans ?? CONCURRENCY.DEFAULT_PIPELINE_CONCURRENCY,
     logDir: path.join(process.cwd(), 'logs', 'duplicate-detection'),
     gitWorkflowEnabled: options.enablePRCreation ?? config.enablePRCreation,
     gitBranchPrefix: options.branchPrefix ?? 'consolidate',
     gitBaseBranch: options.baseBranch ?? config.gitBaseBranch,
     gitDryRun: options.dryRun ?? config.gitDryRun,
   });
   ```

2. **Remove `prCreator` property** -- replaced by centralized workflow

3. **Add `migrationTransformer` property** -- moved from PRCreator:
   ```typescript
   private migrationTransformer: MigrationTransformer;
   ```

4. **Move `_applySuggestions()` from PRCreator** -- becomes a private method on the worker. Applies code changes to working directory (no git ops).

5. **Update `runJobHandler()`** -- replace `prCreator.createPRsForSuggestions()` call with direct suggestion application:
   ```typescript
   // Replace PRCreator call with direct application
   if (this.gitWorkflowEnabled && result.suggestions?.length > 0) {
     const automatable = result.suggestions.filter(
       s => s.automated_refactor_possible && s.impact_score >= MARKDOWN_REPORT.MEDIUM_SCORE_MIN
     );
     if (automatable.length > 0) {
       const filesModified = await this._applySuggestions(automatable, repoPath);
       result.filesModified = filesModified;
       result.suggestionsApplied = automatable.length;
     }
   }
   ```

6. **Override `_generateCommitMessage()`** -- produce consolidation-specific commit messages:
   ```typescript
   async _generateCommitMessage(job: Job): Promise<{ title: string; body: string }> {
     const result = job.result as ScanResult & { suggestionsApplied?: number };
     const count = result?.suggestionsApplied ?? 0;
     return {
       title: `refactor: consolidate ${count} duplicate code pattern${count !== 1 ? 's' : ''}`,
       body: [
         `Consolidates ${count} identified duplicate code patterns.`,
         '',
         ...result.suggestions
           ?.filter(s => s.automated_refactor_possible)
           .map((s, i) => `${i + 1}. ${s.target_name || s.suggestion_id}: ${s.strategy_rationale.substring(0, 80)}...`) ?? [],
         '',
         'Co-Authored-By: Claude <noreply@anthropic.com>'
       ].join('\n')
     };
   }
   ```

7. **Override `_generatePRContext()`** -- produce consolidation-specific PR descriptions with impact scores, strategies, migration notes (port from `PRCreator._generatePRDescription`).

8. **Remove options** -- drop `maxSuggestionsPerPR` from `DuplicateDetectionWorkerOptions`. If a suggestion cap is needed, enforce it as a filter in `runJobHandler`.

### Modified: `sidequest/workers/duplicate-detection-worker.ts` — Types

Update `DuplicateDetectionWorkerOptions`:
```typescript
interface DuplicateDetectionWorkerOptions extends SidequestServerOptions {
  // Remove:
  // - maxSuggestionsPerPR (batching removed)
  // Keep:
  enablePRCreation?: boolean;  // maps to gitWorkflowEnabled
  baseBranch?: string;         // maps to gitBaseBranch
  branchPrefix?: string;       // maps to gitBranchPrefix
  dryRun?: boolean;            // maps to gitDryRun
  // Unchanged:
  maxConcurrentScans?: number;
  configPath?: string;
}
```

### Deleted: `sidequest/pipeline-core/git/pr-creator.ts` (~434 lines)

Entire file deleted. Functionality distributed:
- Git operations → centralized `BranchManager` (already exists)
- `_applySuggestions()` → `DuplicateDetectionWorker` (moved)
- `_batchSuggestions()` → removed (no batching)
- `_generateBranchName()` → `BranchManager._generateBranchName()` (already exists)
- `_generateCommitMessage()` → `DuplicateDetectionWorker._generateCommitMessage()` override
- `_generatePRTitle/Description()` → `DuplicateDetectionWorker._generatePRContext()` override

### Modified: `sidequest/pipeline-runners/duplicate-detection-pipeline.ts`

Remove `PRCreatorOptions` and `PRCreationResults` re-exports if present.

### Modified: `docs/architecture/pipeline-data-flow.md`

Update catalog table row 1:
```
| 1 | Duplicate Detection | `duplicate-detection` | ... | BranchManager | ✅ Yes | TS + Python |
```

### Tests

1. **Unit: suggestion application** -- test `_applySuggestions()` writes files correctly (extract existing PRCreator tests)
2. **Unit: commit message override** -- test `_generateCommitMessage()` produces consolidation format
3. **Unit: PR context override** -- test `_generatePRContext()` includes impact scores, strategies, migration notes
4. **Integration: end-to-end with git** -- verify centralized workflow creates branch → applies changes → commits → creates PR for a scan with automatable suggestions
5. **Regression: scan-only mode** -- verify scan still works when `gitWorkflowEnabled = false` (no code changes applied)

## Migration Checklist

1. Move `_applySuggestions()` + `MigrationTransformer` dependency from PRCreator to worker
2. Update worker constructor to pass git config to `super()`
3. Replace `prCreator.createPRsForSuggestions()` with inline suggestion application in `runJobHandler()`
4. Override `_generateCommitMessage()` with consolidation-specific format
5. Override `_generatePRContext()` with consolidation-specific format
6. Remove `prCreator` property and `PRCreator` import
7. Delete `sidequest/pipeline-core/git/pr-creator.ts`
8. Update `DuplicateDetectionWorkerOptions` (remove `maxSuggestionsPerPR`)
9. Grep for `PRCreator` / `pr-creator` imports — update or remove
10. Update `pipeline-data-flow.md` catalog table (Git Workflow column → `✅ Yes`)
11. Port/update relevant tests from PRCreator
12. `npm run test:all:core && npm run typecheck`

## Risks

- **Behavioral change: single PR instead of batched** -- repositories with many suggestions will produce a single larger PR instead of multiple smaller ones. Monitor initial runs; if PRs are too large, add a suggestion count cap in `runJobHandler` that skips application when exceeded.
- **`job.data.repositoryPath` required** -- centralized workflow reads `job.data.repositoryPath` to know where to create branches. Verify DD worker sets this field when creating jobs via `scheduleScan()`.
- **MigrationTransformer errors** -- currently errors in `_applySuggestions` are caught per-suggestion and logged. This must be preserved; a single failed transform should not fail the entire job or block the git workflow.
- **`result` shape for commit message** -- `_generateCommitMessage` receives the job, which has `job.result`. The scan result must be stored on the job before the git workflow runs. Verify `_finalizeJobSuccess` sets `job.result` before calling `_handleGitWorkflowSuccess`.

## Line Impact

| File | Before | After | Saved |
|------|--------|-------|-------|
| `pr-creator.ts` (deleted) | 434 | 0 | 434 |
| `duplicate-detection-worker.ts` | ~688 | ~740 | -52 (gains `_applySuggestions` + overrides) |
| **Net** | **~1122** | **~740** | **~382** |

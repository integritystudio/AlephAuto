# Migrate Duplicate Detection to BasePipeline

> **Decision (2026-03-09):** BP-L1 accepted as-is per commit `26e100a`. Migration is not planned — the functional pattern works and the consistency benefit does not justify the effort. This document is retained as historical context.

**Status:** Accepted as-is (not planned)
**Created:** 2026-03-13
**Backlog ID:** BP-L1 (P3) -- keep in sync with [BACKLOG.md](../BACKLOG.md#basepipeline-migration--remaining-pipelines-2026-03-13)
**Prerequisite:** DD-GW1 (completed) -- PRCreator removed, worker uses centralized git workflow
**Priority justification:** Low -- ~35 lines saved, no behavioral improvement. Acceptable to leave functional.

## Current State

`duplicate-detection-pipeline.ts` is the only remaining **functional** pipeline runner (133 lines). It was explicitly left functional because:
1. **Async initialization** -- `worker.initialize()` loads config, validates, syncs retry settings
2. **Self-managed job creation** -- `worker.runNightlyScan()` internally calls `scheduleScan()` N times based on config-driven repository selection
3. **No BasePipeline methods used** -- no `waitForCompletion`, no `waitForJobTerminalStatus`, no `scheduleCron` (cron is manual but minimal)

**Post-DD-GW1 changes:** PRCreator is deleted. Worker now uses centralized `BranchManager` git workflow via `SidequestServer`. The pipeline file has a stale comment referencing `PRCreationResult` types (line 29) that should be cleaned up regardless of this migration. The `worker.enablePRCreation` check (line 108) still works — it maps to `gitWorkflowEnabled`.

## Analysis: What BasePipeline Would Provide

| BasePipeline Method | Current Usage | Benefit |
|---------------------|---------------|---------|
| `setupDefaultEventListeners()` | Not used -- worker emits custom events; pipeline doesn't listen | **Minor** (adds standard job:created/started/completed/failed logging) |
| `scheduleCron()` | Manual `cron.schedule()` (5 lines) | Saves ~3 lines, adds validation |
| `waitForCompletion()` | Not used -- `runNightlyScan()` is fire-and-forget | **None** |
| `waitForJobTerminalStatus()` | Not used | **None** |
| `getStats()` | Not used in pipeline | **None** |

## Design Decisions

1. **Add `initialize()` hook to BasePipeline** -- new optional `async initialize(): Promise<void>` method. Called in `start()` before cron setup. Default is no-op. This unblocks DuplicateDetection without changing other pipelines.
2. **`runNightlyScan()` stays on the worker** -- it's domain logic (config-driven repository selection, metrics tracking). The pipeline just calls it.
3. **Keep PM2 detection** -- `process.env.pm_id !== undefined` guard in `isDirectExecution` block must be preserved (PM2 loads via dynamic import, not direct execution).
4. **Preserve re-exports** -- `DuplicateDetectionWorker` and type re-exports from the pipeline file must remain for external consumers.
5. **Custom events** -- the worker emits `pipeline:status`, `scan:completed`, `high-impact:detected`, etc. These are internal to the worker. `setupDefaultEventListeners()` would add standard `job:created/started/completed/failed` logging — a minor observability improvement.
6. **Stale PRCreator comment** -- line 29 references `PRCreationResult` types removed in DD-GW1. Clean up regardless of migration.
7. **`runOnStartup` early-exit** -- the pipeline's `process.exit(0)` in startup mode doesn't fit BasePipeline's long-running lifecycle. Keep it as a standalone code path outside the class, or in a custom `runOnce()` method.

## File Changes

### Step 0: `sidequest/pipeline-runners/base-pipeline.ts`

Add optional async initialization hook:

```typescript
abstract class BasePipeline<TWorker extends SidequestServer> {
  // ... existing

  /** Override for async worker initialization (config loading, validation, etc.) */
  protected async initialize(): Promise<void> {
    // Default no-op. Subclasses override as needed.
  }
}
```

No existing pipelines need to change -- they don't override it.

### Step 1: `sidequest/pipeline-runners/duplicate-detection-pipeline.ts` (~90 lines)

```typescript
class DuplicateDetectionPipeline extends BasePipeline<DuplicateDetectionWorker> {
  private readonly logger: Logger = createComponentLogger('DuplicateDetectionPipeline');

  constructor() {
    const worker = new DuplicateDetectionWorker({ maxConcurrentScans: 3 });
    super(worker);
  }

  protected override async initialize(): Promise<void> {
    await this.worker.initialize();
    const stats = this.worker.configLoader.getStats();
    this.logger.info({
      totalRepositories: stats.totalRepositories,
      enabledRepositories: stats.enabledRepositories,
      repositoryGroups: stats.groups,
    }, 'Loaded duplicate-detection configuration');
  }

  start(cronSchedule: string): void {
    this.setupDefaultEventListeners(this.logger);
    this.scheduleCron(this.logger, 'nightly duplicate scans', cronSchedule, () =>
      this.worker.runNightlyScan()
    );
  }
}

// Standalone startup mode (not in class -- process.exit doesn't fit BasePipeline lifecycle)
async function runOnce(worker: DuplicateDetectionWorker, logger: Logger): Promise<void> {
  await worker.runNightlyScan();
  const metrics = worker.getScanMetrics();
  logger.info({
    totalScans: metrics.totalScans,
    duplicatesFound: metrics.totalDuplicatesFound,
    suggestionsGenerated: metrics.totalSuggestionsGenerated,
    highImpactDuplicates: metrics.highImpactDuplicates
  }, 'Startup scan completed');

  if (worker.enablePRCreation) {
    logger.info({ prsCreated: metrics.prsCreated, prCreationErrors: metrics.prCreationErrors }, 'PR creation metrics');
  }
  process.exit(0);
}

// Preserve re-exports for external consumers
export { DuplicateDetectionWorker };
export type { RetryInfo, RetryMetrics, WorkerScanMetrics, DuplicateDetectionWorkerOptions } from '...';
```

## Alternative: Don't Migrate

The migration saves ~35 lines but adds an `initialize()` hook to BasePipeline that only one pipeline uses. Arguments for leaving it functional:

**For migration:**
- Consistency -- 11/11 pipelines on BasePipeline (currently 10/11)
- `scheduleCron()` adds cron validation the functional version lacks
- `setupDefaultEventListeners()` adds standard job lifecycle logging
- Establishes the `initialize()` hook pattern for future pipelines with async setup

**Against migration:**
- Only saves ~35 lines
- Adds a hook to BasePipeline used by exactly one consumer
- Current functional code is clear and stable after DD-GW1 cleanup
- `runNightlyScan()` is fire-and-forget -- no BasePipeline completion methods used
- `runOnStartup` early-exit mode requires special handling outside BasePipeline

**Recommendation:** Migrate, but treat as **low priority**. The consistency benefit is real but the functional version works fine. The `initialize()` hook has value if future pipelines need async setup.

## Migration Checklist

1. Add `protected async initialize()` no-op to `BasePipeline`
2. Create `DuplicateDetectionPipeline` class with `logger`, `initialize()`, `start()`
3. Add `setupDefaultEventListeners()` call in `start()`
4. Replace manual `cron.schedule()` with `this.scheduleCron()`
5. Extract `runOnStartup` mode to standalone `runOnce()` function
6. Remove stale PRCreator type re-export comment (line 29)
7. Preserve `process.env.pm_id` detection in `isDirectExecution` block
8. Preserve re-exports (`DuplicateDetectionWorker`, types)
9. Preserve PM2 ready signal (`process.send('ready')`)
10. Preserve `setInterval` keep-alive heartbeat
11. Update `pipeline-data-flow.md` catalog table (base class → BasePipeline)
12. `npm run test:all:core && npm run typecheck`

## Risks

- **PM2 dynamic import** -- PM2 loads this file via `import()`, not direct execution. The `pm_id` guard must remain or PM2 won't start the worker.
- **Re-export breakage** -- `worker-registry.ts` imports `DuplicateDetectionWorker` from the worker file directly, not the pipeline. But other consumers may import from the pipeline file. Grep before changing exports.
- **`initialize()` failure** -- currently throws and `main().catch()` handles it with `process.exit(1)`. The class version must preserve this behavior.
- **`runOnStartup` mode** -- extracting this to a standalone function changes the code flow. Verify `process.exit(0)` is called after scan completes and metrics are logged.
- **`worker.configLoader` access** -- pipeline accesses `worker.configLoader.getStats()` directly. `configLoader` is `readonly` on the worker — safe but couples pipeline to worker internals.

## Line Impact

| File | Before | After | Saved |
|------|--------|-------|-------|
| base-pipeline.ts | 197 | ~203 | -6 (add initialize hook) |
| duplicate-detection-pipeline.ts | 133 | ~90 | 43 |
| **Net** | **330** | **~293** | **~37** |

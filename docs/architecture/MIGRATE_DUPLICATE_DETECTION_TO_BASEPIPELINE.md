# Migrate Duplicate Detection to BasePipeline

**Status:** Proposed
**Created:** 2026-03-13
**Backlog ID:** BP-L1 (P3) — keep in sync with [BACKLOG.md](../BACKLOG.md#basepipeline-migration--remaining-pipelines-2026-03-13)
**Complexity:** High -- most complex pipeline in the system

## Current State

`duplicate-detection-pipeline.ts` is the only remaining **functional** pipeline runner (129 lines). It was explicitly left functional because:
1. **Async initialization** -- `worker.initialize()` loads config, validates, syncs retry settings
2. **Self-managed job creation** -- `worker.runNightlyScan()` internally calls `scheduleScan()` N times based on config-driven repository selection
3. **No BasePipeline methods used** -- no `waitForCompletion`, no `waitForJobTerminalStatus`, no `scheduleCron` (cron is manual but minimal)

## Analysis: What BasePipeline Would Provide

| BasePipeline Method | Current Usage | Benefit |
|---------------------|---------------|---------|
| `setupDefaultEventListeners()` | Not applicable -- pipeline has zero event listeners | **None** (worker emits custom events; pipeline doesn't listen) |
| `scheduleCron()` | Manual `cron.schedule()` (5 lines) | Saves ~3 lines, adds validation |
| `waitForCompletion()` | Not used -- `runNightlyScan()` is fire-and-forget | **None** |
| `waitForJobTerminalStatus()` | Not used | **None** |
| `getStats()` | Not used in pipeline | **None** |

## Design Decisions

1. **Add `initialize()` hook to BasePipeline** -- new optional `async initialize(): Promise<void>` method. Called in `start()` before cron setup. Default is no-op. This unblocks DuplicateDetection without changing other pipelines.
2. **`runNightlyScan()` stays on the worker** -- it's domain logic (config-driven repository selection, metrics tracking). The pipeline just calls it.
3. **Keep PM2 detection** -- `process.env.pm_id !== undefined` guard in `isDirectExecution` block must be preserved (PM2 loads via dynamic import, not direct execution).
4. **Preserve re-exports** -- `DuplicateDetectionWorker` and type re-exports from the pipeline file must remain for external consumers.
5. **Custom events** -- the worker emits `pipeline:status`, `scan:completed`, `pr:created`, etc. These are internal to the worker and don't need pipeline-level listeners. No `setupDefaultEventListeners()` call needed.

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

### Step 1: `sidequest/pipeline-runners/duplicate-detection-pipeline.ts` (~80 lines)

```typescript
class DuplicateDetectionPipeline extends BasePipeline<DuplicateDetectionWorker> {
  constructor() {
    const worker = new DuplicateDetectionWorker({ maxConcurrentScans: 3 });
    super(worker);
    // No setupDefaultEventListeners -- worker manages its own events
  }

  protected async initialize(): Promise<void> {
    await this.worker.initialize();
    const stats = this.worker.configLoader.getStats();
    logger.info({
      totalRepositories: stats.totalRepositories,
      enabledRepositories: stats.enabledRepositories,
      repositoryGroups: stats.groups,
    }, 'Loaded duplicate-detection configuration');
  }

  async runNightlyScan(): Promise<void> {
    await this.worker.runNightlyScan();
    const metrics = this.worker.getScanMetrics();
    logger.info({ ... }, 'Scan completed');
  }

  async start(runOnStartup: boolean): Promise<void> {
    await this.initialize();
    logger.info('Duplicate detection pipeline initialized');

    if (runOnStartup) {
      await this.runNightlyScan();
      process.exit(0);
    }

    this.scheduleCron(logger, 'nightly duplicate scans', cronSchedule, () =>
      this.worker.runNightlyScan()
    );

    // PM2 ready signal
    if (process.send) {
      process.send('ready');
    }
  }
}

// Preserve re-exports for external consumers
export { DuplicateDetectionWorker };
export type { RetryInfo, RetryMetrics, ... } from '...';
```

## Alternative: Don't Migrate

The migration saves ~50 lines but adds an `initialize()` hook to BasePipeline that only one pipeline uses. Arguments for leaving it functional:

**For migration:**
- Consistency -- 10/11 pipelines on BasePipeline (currently 9/11)
- `scheduleCron()` adds cron validation the functional version lacks
- Establishes the `initialize()` hook pattern for future pipelines with async setup

**Against migration:**
- Only saves ~50 lines
- Adds a hook to BasePipeline used by exactly one consumer
- Current functional code is clear and stable
- `runNightlyScan()` is fire-and-forget -- no BasePipeline completion methods used

**Recommendation:** Migrate, but treat as **low priority**. The consistency benefit is real but the functional version works fine. The `initialize()` hook has value if future pipelines need async setup.

## Migration Checklist

1. Add `protected async initialize()` no-op to `BasePipeline`
2. Create `DuplicateDetectionPipeline` class
3. Move `main()` logic into `start()` method
4. Replace manual `cron.schedule()` with `this.scheduleCron()`
5. Preserve `process.env.pm_id` detection in `isDirectExecution` block
6. Preserve re-exports (`DuplicateDetectionWorker`, types)
7. Preserve PM2 ready signal (`process.send('ready')`)
8. Preserve `setInterval` keep-alive heartbeat
9. Update `pipeline-data-flow.md` catalog table
10. `npm run test:all:core && npm run typecheck`

## Risks

- **PM2 dynamic import** -- PM2 loads this file via `import()`, not direct execution. The `pm_id` guard must remain or PM2 won't start the worker.
- **Re-export breakage** -- `worker-registry.ts` imports `DuplicateDetectionWorker` from the worker file directly, not the pipeline. But other consumers may import from the pipeline file. Grep before changing exports.
- **`initialize()` failure** -- currently throws and `main().catch()` handles it with `process.exit(1)`. The class version must preserve this behavior.

## Line Impact

| File | Before | After | Saved |
|------|--------|-------|-------|
| base-pipeline.ts | 197 | ~203 | -6 (add initialize hook) |
| duplicate-detection-pipeline.ts | 129 | ~80 | 49 |
| **Net** | **326** | **~283** | **~43** |

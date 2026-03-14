# Migrate Repomix to BasePipeline

**Status:** Done
**Created:** 2026-03-13
**Backlog ID:** BP-M1 (P2) — keep in sync with [BACKLOG.md](../BACKLOG.md#basepipeline-migration--remaining-pipelines-2026-03-13)
**Prerequisite:** Repomix pipeline re-enabled (RP-L4 done) and stable

## Current State

Repomix is the only pipeline with **no `*-pipeline.ts` runner file**. It uses:
- `RepomixCronApp` class in `sidequest/core/index.ts` (lines 53-239)
- Direct worker registration in `api/utils/worker-registry.ts` (disabled: `true`)
- No PM2 entry in `config/ecosystem.config.cjs`

`RepomixCronApp` duplicates patterns already in `BasePipeline`:
- Manual event listeners (lines 78-107) vs `setupDefaultEventListeners()`
- Polling-based `waitForCompletion()` (lines 160-177) vs event-driven `BasePipeline.waitForCompletion(timeoutMs?)`
- Manual `cron.schedule()` (lines 190-203) vs `scheduleCron()`

## Design Decisions

1. **Create `repomix-pipeline.ts`** in `pipeline-runners/` to match all other pipelines.
2. **Move `RepomixCronApp` logic** into `RepomixPipeline extends BasePipeline<RepomixWorker>`.
3. **`DirectoryScanner` stays in the pipeline** (not the worker) -- scanning is orchestration, not job execution. This matches test-refactor-pipeline which also owns its `DirectoryScanner`.
4. **`saveRunSummary()`** becomes a private method on `RepomixPipeline` (pipeline-level bookkeeping).
5. **`runRepomixOnAllDirectories()`** becomes a public `runAll()` method.
6. **Delete `RepomixCronApp`** from `sidequest/core/index.ts`. Move the direct-execution entrypoint to the new pipeline runner.
7. **Worker registry** entry stays as-is (disabled flag is independent of runner pattern).
8. **PM2 entry** -- out of scope for this migration. Add separately when re-enabling.

## File Changes

### New: `sidequest/pipeline-runners/repomix-pipeline.ts` (~90 lines)

```typescript
class RepomixPipeline extends BasePipeline<RepomixWorker> {
  private scanner: DirectoryScanner;

  constructor() {
    const worker = new RepomixWorker({ ... });  // same opts as RepomixCronApp
    super(worker);
    this.scanner = new DirectoryScanner({ ... });
    this.setupDefaultEventListeners(logger, {
      onStarted: (job) => ({ relativePath: job.data.relativePath }),
      onCompleted: (job) => ({ relativePath: job.data.relativePath }),
      onFailed: (job) => ({ relativePath: job.data.relativePath }),
    });
  }

  async runAll(): Promise<void> {
    const directories = await this.scanner.scanDirectories();
    // save scan results (existing logic)
    for (const dir of directories) {
      this.worker.createRepomixJob(dir.fullPath, dir.relativePath);
    }
    await this.waitForCompletion(TIMEOUTS.SCAN_COMPLETION_WAIT_MS);
    // save run summary (existing logic)
  }

  async start(): Promise<void> {
    this.scheduleCron(logger, 'repomix', config.repomixSchedule, () => this.runAll());
    if (config.runOnStartup) {
      await this.runAll();
    }
  }
}
```

### Modified: `sidequest/core/index.ts`

- Remove `RepomixCronApp` class (lines 53-224) and `isDirectExecution` + entrypoint (lines 226-239).
- Keep only re-exports if any consumers import from this module.

### Tests

- Verify `repomix-pipeline.ts` can be imported without side effects (same pattern as `test-refactor-pipeline.test.ts`).
- `startup-once-mode.test.ts` -- add repomix `--run-now` test if startup-once behavior is desired.
- Existing unit tests in `tests/unit/` that import from `sidequest/core/index.ts` -- check for breakage from `RepomixCronApp` removal.

## Migration Checklist

1. Create `repomix-pipeline.ts` with `RepomixPipeline` class
2. Move `saveRunSummary`, `runRepomixOnAllDirectories`, event listeners into class
3. Replace polling `waitForCompletion` with `this.waitForCompletion(TIMEOUTS.SCAN_COMPLETION_WAIT_MS)`
4. Replace manual `cron.schedule` with `this.scheduleCron()`
5. Replace manual event listeners with `setupDefaultEventListeners()`
6. Delete `RepomixCronApp` from `sidequest/core/index.ts`
7. Update imports in any file that referenced `RepomixCronApp`
8. Update `pipeline-data-flow.md` catalog table (Runner File column)
9. Update CLAUDE.md ("no pipeline-runner file" note)
10. `npm run test:all:core && npm run typecheck`

## Risks

- **Import consumers**: `sidequest/core/index.ts` may be imported elsewhere. Grep for `from '../core/index.ts'` and `from './core/index.ts'` before deleting.
- **Worker registry interaction**: The registry creates workers independently. The pipeline runner creates its own worker instance. These are separate paths -- no conflict, but document the distinction.
- **SCAN_COMPLETION_WAIT_MS timeout**: The current polling-based approach uses `TIMEOUTS.SCAN_COMPLETION_WAIT_MS`. Verify this constant exists and is appropriate for the event-driven version.

## Line Impact

| File | Before | After | Saved |
|------|--------|-------|-------|
| sidequest/core/index.ts | ~240 | ~10 (re-exports only) | ~230 |
| repomix-pipeline.ts (new) | 0 | ~90 | -90 |
| **Net** | **~240** | **~100** | **~140** |

# Phase 0-1: Pair Cleanup & Infrastructure — ✅ COMPLETE

## Phase 0: JS+TS Pair Cleanup — ✅ COMPLETE

### Status

All 12/12 pairs resolved across 5 commits (`43151ae`, `a688970`, `744fad2`, `f71f777`, `d6bab33`).

### Pre-Deletion Verification

For each pair, confirm no runtime references to the `.js` file:

```bash
# Run for each file (example: validation)
grep -r "from.*validation\.js" --include='*.ts' --include='*.js' -l
grep -r "require.*validation\.js" --include='*.ts' --include='*.js' -l
```

### Deletion Order

Delete in dependency order — types first, then middleware, then routes:

**Batch 1: Type schemas** (no downstream .js importers within batch)

| # | Delete | Importers to Update |
|---|--------|---------------------|
| 1 | `api/types/job-status.js` | 6 files: routes/jobs.js, routes/pipelines.js, routes/scans.js, routes/repositories.js, routes/reports.js, middleware/error-handler.js |
| 2 | `api/types/pipeline-requests.js` | 1 file: routes/pipelines.js |
| 3 | `api/types/scan-requests.js` | 1 file: routes/scans.js |
| 4 | `api/types/repository-requests.js` | 1 file: routes/repositories.js |
| 5 | `api/types/report-requests.js` | 1 file: routes/reports.js |

**Batch 2: Middleware**

| # | Delete | Importers to Update |
|---|--------|---------------------|
| 6 | `api/middleware/validation.js` | 2 files: routes/pipelines.js, routes/scans.js |

**Batch 3: Routes**

| # | Delete | Importers to Update |
|---|--------|---------------------|
| 7 | `api/routes/pipelines.js` | 1 file: api/server.js |
| 8 | `api/routes/scans.js` | 1 file: api/server.js |

**Batch 4: Pipeline core**

| # | Delete | Importers to Update |
|---|--------|---------------------|
| 9 | `sidequest/pipeline-core/scan-orchestrator.js` | 1 file: workers/duplicate-detection.js |
| 10 | `sidequest/pipeline-runners/duplicate-detection-pipeline.js` | 1 file: workers/duplicate-detection.js |

Also delete stale `.d.ts` for pairs that have them:
- `api/types/pipeline-requests.d.ts`
- `sidequest/pipeline-core/scan-orchestrator.d.ts`

### Import Path Updates

When deleting `foo.js` where `foo.ts` exists, update all importers to use `.ts` extension:

```typescript
// Before (current .js convention)
import { validateRequest } from './middleware/validation.js';

// After (--strip-types convention)
import { validateRequest } from './middleware/validation.ts';
```

**Constraint:** This requires `--strip-types` to be enabled (Phase 1). Execute Phase 0 Batch 1-4 after Phase 1 infrastructure is in place.

### Per-Batch Checklist

For each batch:
1. Delete the `.js` files: `git rm <files>`
2. Update all importers: change `.js` → `.ts` in import paths
3. Run: `npx tsc --noEmit`
4. Run: `npm test`
5. Commit batch

---

## Phase 1: Infrastructure — ✅ COMPLETE

**Commit:** `b98784f feat(ts-migration): Phase 1 infrastructure — strict mode, node16 resolution, --strip-types`

### Applied Changes

1. **`tsconfig.json`**: `strict: true`, `moduleResolution: "node16"`, `allowImportingTsExtensions: true`
2. **`tests/tsconfig.json`**: `checkJs: true`, `moduleResolution: "node16"`
3. **`config/ecosystem.config.cjs`**: added `--strip-types` to `node_args`
4. **`package.json`**: added `--strip-types` to all `node` invocations
5. **`scripts/deploy-traditional-server.sh`**: Node.js v25+, updated targets

### Follow-up Fixes

- `62e57c6` — resolved strict-mode TS errors in already-migrated `.ts` files (pipelines.ts, scans.ts, scan-orchestrator.ts, duplicate-detection-pipeline.ts)
- `2ccd876` — resolved strict-mode errors in test-refactor-pipeline.ts

### Actual Commit History

1. `b98784f` — Phase 1 infrastructure
2. `a688970` — Phase 0 Batch 1: delete 5 type `.js` files, update importers
3. `744fad2` — Phase 0 Batch 2: delete validation.js, update importers
4. `f71f777` — Phase 0 Batch 3: delete route `.js` files, update importers
5. `d6bab33` — Phase 0 Batch 4: delete pipeline-core `.js` and `.d.ts` files
6. `62e57c6` — fix strict-mode TS errors in migrated files
7. `2ccd876` — fix strict-mode errors in test-refactor-pipeline.ts

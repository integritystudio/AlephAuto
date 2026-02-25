# AlephAuto 2.0: TypeScript Migration Design Doc

**Status:** ✅ COMPLETE (All Phases 0-10 done)
**Date:** 2026-02-10
**Last Updated:** 2026-02-24
**Scope:** Full migration of all JS source/test files to TypeScript
**Runtime:** Node.js v25 `--strip-types` (native TS stripping, no build step)
**Strictness:** `strict: true` in root tsconfig

---

## 1. Current State

### File Inventory

| Type       | Files | Lines  | Notes                                 |
|------------|------:|-------:|---------------------------------------|
| `.js`      |   187 | 57,584 | Source + tests + scripts              |
| `.ts`      |    34 |  7,877 | Partial migration (api/, sidequest/)  |
| `.tsx`     |    12 |  2,288 | Frontend (fully migrated)             |
| `.d.ts`    |     9 |      - | Hand-written type definitions         |
| **Total**  |   242 | 67,749 |                                       |

### JS Files by Directory

| Directory              | Files | Lines  |
|------------------------|------:|-------:|
| `api/`                 |    23 |  5,539 |
| `sidequest/core/`      |     7 |  2,919 |
| `sidequest/pipeline-core/` | 24 | 11,626 |
| `sidequest/workers/`   |     8 |  4,008 |
| `sidequest/pipeline-runners/` | 8 | 1,929 |
| `sidequest/utils/`     |    11 |  2,800 |
| `sidequest/types/`     |     1 |     69 |
| `tests/`               |    90 | 29,385 |
| `scripts/`             |     9 |  1,762 |
| `packages/`            |     3 |    257 |
| `config/`              |     1 |    158 |

### TS Files by Directory (already migrated)

| Directory              | Files | Lines  |
|------------------------|------:|-------:|
| `api/types/`           |     5 |    579 |
| `api/middleware/`       |     1 |    136 |
| `api/routes/`          |     2 |    526 |
| `sidequest/types/`     |     1 |    436 |
| `sidequest/pipeline-core/types/` | 1 | 288 |
| `sidequest/pipeline-core/` | 1 |    829 |
| `sidequest/utils/`     |     1 |    980 |
| `sidequest/workers/`   |     1 |    811 |
| `sidequest/pipeline-runners/` | 2 | 1,236 |
| `tests/`               |     1 |    150 |
| `cloudflare-workers/`  |     1 |    282 |
| `frontend/` (17 .ts + 12 .tsx) | 29 | 3,912 |

### TypeScript Infrastructure

**3 tsconfig files:**
- **Root** (`tsconfig.json`): `strict: false`, `allowJs: true`, `checkJs: true`, `noEmit: true`, target ES2022, moduleResolution `node`
- **Frontend** (`frontend/tsconfig.json`): `strict: true`, moduleResolution `bundler`, JSX react-jsx
- **Tests** (`tests/tsconfig.json`): `strict: true`, `allowJs: true`, `checkJs: false`, moduleResolution `bundler`

**Import convention:** All imports use explicit `.js` extensions (ESM requirement). `package.json` has `"type": "module"`.

**Existing patterns:**
- Zod schemas in `api/types/` with `z.infer<typeof Schema>` for type derivation
- `SidequestServer` base class extended by all workers
- `@shared/logging` and `@shared/process-io` workspace packages

### 9 Hand-Written `.d.ts` Files

| File | Provides Types For | Status |
|------|--------------------|--------|
| `api/types/pipeline-requests.d.ts` | Pipeline request/response types | ✅ Deleted (Phase 0) |
| `sidequest/core/server.d.ts` | SidequestServer class | ✅ Deleted (Phase 6) |
| `sidequest/pipeline-core/scan-orchestrator.d.ts` | ScanOrchestrator class | ✅ Deleted (Phase 0) |
| `sidequest/pipeline-core/errors/error-types.d.ts` | Error classification types | ✅ Deleted (Phase 3) |
| `sidequest/pipeline-core/errors/types.d.ts` | Error handling types | ✅ Deleted (Phase 3) |
| `sidequest/utils/logger.d.ts` | Logger utilities | ✅ Deleted (Phase 2) |
| `packages/shared-logging/src/index.d.ts` | @shared/logging exports | ✅ Deleted (Phase 2) |
| `packages/shared-process-io/src/index.d.ts` | @shared/process-io exports | ✅ Deleted (Phase 2) |
| `frontend/src/vite-env.d.ts` | Vite client types (keep as-is) | N/A |

**8/8 deleted.** All hand-written `.d.ts` files removed (except `vite-env.d.ts`).

### 12 JS+TS Pairs (Stale Duplicates) — ✅ ALL RESOLVED

All 12 stale `.js` files deleted. Importers updated to `.ts` extensions.

| # | Base Path | Resolved In |
|---|-----------|-------------|
| 1 | `api/middleware/validation` | Phase 0 Batch 2 (`744fad2`) |
| 2 | `api/types/job-status` | Phase 0 Batch 1 (`a688970`) |
| 3 | `api/types/pipeline-requests` | Phase 0 Batch 1 (`a688970`) |
| 4 | `api/types/scan-requests` | Phase 0 Batch 1 (`a688970`) |
| 5 | `api/types/repository-requests` | Phase 0 Batch 1 (`a688970`) |
| 6 | `api/types/report-requests` | Phase 0 Batch 1 (`a688970`) |
| 7 | `api/routes/pipelines` | Phase 0 Batch 3 (`f71f777`) |
| 8 | `api/routes/scans` | Phase 0 Batch 3 (`f71f777`) |
| 9 | `sidequest/types/duplicate-detection-types` | Phase 0 pre (`43151ae`) |
| 10 | `sidequest/pipeline-core/types/scan-orchestrator-types` | Phase 0 pre (`43151ae`) |
| 11 | `sidequest/pipeline-core/scan-orchestrator` | Phase 0 Batch 4 (`d6bab33`) |
| 12 | `sidequest/pipeline-runners/duplicate-detection-pipeline` | Phase 0 Batch 4 (`d6bab33`) |

---

## 2. Architecture Decisions

### AD-1: Node.js `--strip-types` Runtime

Node.js v25 supports native TypeScript execution via `--strip-types`. This strips type annotations at load time with zero build step.

**What changes:**
- `ecosystem.config.cjs`: Add `--strip-types` to `node_args` for both processes
- `package.json` scripts: Add `--strip-types` to all `node` invocations
- `deploy-traditional-server.sh`: Update `chmod +x` targets from `*.js` to `*.ts`, update Node.js version requirement to v25+
- CI: Ensure Node.js v25+ is installed

**Current PM2 config:**
```javascript
// Before
node_args: '--require ./api/preload.js --max-old-space-size=512',
script: 'api/server.js',

// After
node_args: '--strip-types --require ./api/preload.ts --max-old-space-size=512',
script: 'api/server.ts',
```

**Constraints of `--strip-types`:**
- No `enum` (use `as const` objects instead)
- No `namespace` merging
- No `const enum`
- No parameter properties in constructors
- Import paths must use `.ts` extension (not `.js`)

### AD-2: `strict: true` Progressive Enablement

Root tsconfig currently has `strict: false`. Migration enables `strict: true` progressively:

- **Phase 1:** Set `strict: true` in root tsconfig
- **Phase 1-2:** Foundation files are strict-clean (they're simple)
- **Phase 3-6:** Fix strict errors per-file as each file is renamed
- **Phase 10:** All files strict-clean, remove any per-file `@ts-expect-error` overrides

`strict: true` enables: `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `noImplicitThis`, `alwaysStrict`.

### AD-3: Import Extensions `.ts`

With `--strip-types`, all relative imports must use `.ts` extensions:

```typescript
// Before (current convention)
import { config } from '../sidequest/core/config.js';

// After
import { config } from '../sidequest/core/config.ts';
```

This is a breaking change from the current `.js` extension convention. Each phase updates imports in the files being migrated AND in their importers.

### AD-4: Zod Inference as Standard Pattern

All type definitions follow the existing pattern:

```typescript
export const MySchema = z.object({ ... });
export type MyType = z.infer<typeof MySchema>;
```

No manual `interface` or `type` definitions that duplicate Zod schemas.

### AD-5: Delete `.d.ts` as Source Becomes `.ts`

When a `.js` file is renamed to `.ts`, its corresponding `.d.ts` (if any) is deleted. The `.ts` source file IS the type definition.

### AD-6: `config/ecosystem.config.cjs` Remains CommonJS

PM2 requires CommonJS config files. This file stays as `.cjs` and is excluded from the TypeScript migration scope.

---

## 3. Migration Phases

### Phase 0: JS+TS Pair Cleanup (Pre-Migration) — ✅ COMPLETE

**Goal:** Remove 12 stale `.js` files that have `.ts` replacements.

**Status:** All 12/12 pairs resolved. Stale `.js` and `.d.ts` files deleted, importers updated to `.ts` extensions.

**Commits:**
- `43151ae` — Batch 0: deleted `duplicate-detection-types.js`, `scan-orchestrator-types.js` (zero importers)
- `a688970` — Batch 1: deleted 5 type `.js` files (`job-status`, `pipeline-requests`, `scan-requests`, `repository-requests`, `report-requests`), updated importers
- `744fad2` — Batch 2: deleted `validation.js`, updated importers
- `f71f777` — Batch 3: deleted `pipelines.js`, `scans.js` route files, updated `api/server.js`
- `d6bab33` — Batch 4: deleted `scan-orchestrator.js`, `duplicate-detection-pipeline.js`, `pipeline-requests.d.ts`, `scan-orchestrator.d.ts`

---

### Phase 1: Infrastructure — ✅ COMPLETE

**Goal:** Configure tooling for TypeScript-first execution.

**Commit:** `b98784f` — strict mode, node16 resolution, --strip-types

**Changes applied:**
1. `tsconfig.json`: `strict: true`, `moduleResolution: "node16"`, `allowImportingTsExtensions: true`
2. `tests/tsconfig.json`: `checkJs: true`, aligned with root
3. `config/ecosystem.config.cjs`: added `--strip-types` to `node_args`
4. `package.json`: added `--strip-types` to all `node` invocations
5. `scripts/deploy-traditional-server.sh`: updated Node.js version requirement to v25+

**Follow-up fixes:**
- `62e57c6` — resolved strict-mode TS errors in already-migrated `.ts` files (pipelines, scans, scan-orchestrator, duplicate-detection-pipeline)
- `2ccd876` — resolved strict-mode errors in test-refactor-pipeline.ts

---

### Phase 2: Foundation (0 Dependencies, High Fan-In) — ✅ COMPLETE

**Goal:** Migrate the most-imported, least-dependent files first.

**Status:** All 13 files migrated `.js` → `.ts`. 3 stale `.d.ts` files deleted. Import paths updated across ~70 downstream files. *(uncommitted — pending commit)*

**Files migrated:**
- `sidequest/core/constants.ts`, `sidequest/core/config.ts`
- `sidequest/utils/logger.ts`, `sidequest/utils/time-helpers.ts`, `sidequest/utils/pipeline-names.ts`
- `sidequest/pipeline-core/utils/error-helpers.ts`, `fs-helpers.ts`, `timing-helpers.ts`, `process-helpers.ts`, `index.ts`
- `packages/shared-logging/src/logger.ts`, `packages/shared-logging/src/index.ts`
- `packages/shared-process-io/src/index.ts`

**Deleted `.d.ts`:** `logger.d.ts`, `shared-logging/src/index.d.ts`, `shared-process-io/src/index.d.ts`

---

### Phase 3: Types & Errors — ✅ COMPLETE

**Goal:** Migrate type definitions and error handling.

**Status:** All 3 files migrated. 2 stale `.d.ts` files deleted (`pipeline-requests.d.ts` already deleted in Phase 0 Batch 4). *(uncommitted — pending commit)*

**Files migrated:**
- `sidequest/pipeline-core/errors/error-classifier.ts`
- `api/utils/api-error.ts`
- `api/preload.ts`

**Deleted `.d.ts`:** `error-types.d.ts`, `types.d.ts`

**Note:** `ecosystem.config.cjs` updated: `--require ./api/preload.ts`

---

### Phase 4: Data Layer — ✅ COMPLETE

**Goal:** Migrate database access and job persistence.

**Status:** 2 files migrated. Strict interfaces added (`JobRow`, `ParsedJob`, `JobQueryOptions`, `SaveJobInput`, `BulkImportJob`, etc.). All query functions return typed results.

**Commits:** `34c7977`, `d38e7e2`

| File | Lines | Dependencies |
|------|------:|--------------|
| `sidequest/core/database.ts` | 718 | config, constants, job-status, logger |
| `sidequest/core/job-repository.ts` | 137 | database, logger |

---

### Phase 5: Git & Workflow — ✅ COMPLETE

**Goal:** Migrate git operations layer.

**Status:** 4 files migrated with proper interfaces (`BranchManagerOptions`, `CommitMessage`, `GitInfo`, `WorkflowResult`, etc.).

**Commit:** `34c7977`

| File | Lines | Dependencies |
|------|------:|--------------|
| `sidequest/pipeline-core/git/branch-manager.ts` | 488 | @shared/process-io, logger |
| `sidequest/pipeline-core/git/pr-creator.ts` | 491 | branch-manager, config, logger |
| `sidequest/pipeline-core/git/migration-transformer.ts` | 798 | logger, fs-helpers |
| `sidequest/core/git-workflow-manager.ts` | 186 | branch-manager, logger |

---

### Phase 6: Core Server — ✅ COMPLETE

**Goal:** Migrate the `SidequestServer` base class.

**Status:** 2 files migrated. `server.d.ts` deleted. Interfaces: `Job`, `JobGitMetadata`, `JobStats`, `SidequestServerOptions`. Refactored: extracted `_executeJobAction` and `_writeJobLog` helpers, added repositoryPath guards, waitForCompletion timeout, typed interfaces for JS-based imports in index.ts.

**Commits:** `34c7977`, `b897b38`, `d38e7e2`

| File | Lines | Dependencies | Blocks |
|------|------:|--------------|--------|
| `sidequest/core/server.ts` | 711 | config, constants, job-repository, git-workflow-manager, error-classifier, job-status, logger | All 8+ workers |
| `sidequest/core/index.ts` | 179 | config, constants, logger, workers, directory-scanner | Cron scheduler |

**Deferred findings:** 10 Medium + 5 Low severity items tracked in `docs/BACKLOG.md` (TS46-M1 through TS46-L5).

**Verification:** 0 TS errors, 12/12 unit tests, 12/12 integration tests.

---

### Phase 7: Pipeline Core — ✅ COMPLETE

**Goal:** Migrate scanners, caches, reports, and config loaders.

**Status:** All 15 files migrated. Zero JS files remain in `sidequest/pipeline-core/`.

| Subdir | Files | Lines | Key Files |
|--------|------:|------:|-----------|
| `scanners/` | 5 | 1,807 | repository-scanner, ast-grep-detector, timeout-pattern-detector, codebase-health-scanner, root-directory-analyzer |
| `cache/` | 3 | 1,092 | git-tracker, scan-cache, cached-scanner |
| `reports/` | 4 | 1,807 | json-report-generator, html-report-generator, markdown-report-generator, report-coordinator |
| `config/` | 1 | 406 | repository-config-loader |
| Root | 2 | 737 | inter-project-scanner, doppler-health-monitor |

**Total:** 15 files, ~5,849 lines

---

### Phase 8: Workers & Runners — ✅ COMPLETE

**Goal:** Migrate all worker implementations and pipeline runners.

**Status:** All workers and runners migrated. Zero JS files remain in `sidequest/workers/` and `sidequest/pipeline-runners/`.

**Workers (8 files, ~4,008 lines):**

| Worker | Lines | Special Dependencies |
|--------|------:|----------------------|
| `duplicate-detection-worker.ts` | ~600 | scan-orchestrator, report-coordinator, pr-creator |
| `schema-enhancement-worker.ts` | ~500 | config-loader |
| `gitignore-worker.ts` | ~400 | gitignore-repomix-updater |
| `repo-cleanup-worker.ts` | ~500 | directory-scanner |
| `git-activity-worker.ts` | ~500 | @shared/process-io |
| `repomix-worker.ts` | ~500 | directory-scanner |
| `claude-health-worker.ts` | ~500 | @shared/process-io |
| `bugfix-audit-worker.ts` | ~508 | error-classifier |

**Runners (all `.ts`):**
- `schema-enhancement-pipeline.ts`, `gitignore-pipeline.ts`, `repo-cleanup-pipeline.ts`
- `git-activity-pipeline.ts`, `claude-health-pipeline.ts`, `plugin-management-pipeline.ts`
- `bugfix-audit-pipeline.ts`, `duplicate-detection-pipeline.ts`, `test-refactor-pipeline.ts`

**Total:** ~15 files, ~5,937 lines

---

### Phase 9: API Layer — ✅ COMPLETE

**Goal:** Migrate routes, middleware, server, and utilities.

**Status:** All 12 files migrated. Zero JS files remain in `api/`. `ecosystem.config.cjs` updated to point to `api/server.ts`.

| File | Lines | Notes |
|------|------:|-------|
| `api/middleware/auth.ts` | 96 | |
| `api/middleware/rate-limit.ts` | 113 | |
| `api/middleware/error-handler.ts` | 62 | |
| `api/routes/jobs.ts` | 439 | Largest route file |
| `api/routes/repositories.ts` | 301 | |
| `api/routes/reports.ts` | 271 | |
| `api/utils/worker-registry.ts` | 524 | High complexity |
| `api/utils/port-manager.ts` | 264 | |
| `api/server.ts` | 440 | Entry point |
| `api/event-broadcaster.ts` | 214 | WebSocket events |
| `api/activity-feed.ts` | 498 | |
| `api/websocket.ts` | 261 | |

**Total:** 12 files, ~3,483 lines

---

### Phase 10: Tests, Scripts, Packages — ✅ COMPLETE

**Goal:** Migrate remaining test files, scripts, and utilities.

**Status:** All files migrated. Zero JS files remain in tests/ or scripts/. `package.json` scripts updated to use `--strip-types` with `.ts` extensions. Typecheck: 0 errors.

| Category | Files | Extensions | Notes |
|----------|------:|-----------|-------|
| `tests/unit/` | 44 | `.test.ts` | All 44 unit tests migrated |
| `tests/integration/` | 24 | `.test.ts` / `.ts` | All integration tests migrated |
| `tests/utils/` | 1 | `.ts` | `test-utilities.ts` |
| `tests/accuracy/` | 2 | `.ts` | `accuracy-test.ts`, `metrics.ts` |
| `tests/scripts/` | 9 | `.ts` | All test scripts migrated |
| `tests/fixtures/` | 1 | `.ts` | `test-helpers.ts` with typed interfaces |
| `scripts/` | 4 | `.ts` | `cleanup-error-logs.ts`, `fix-types.ts`, `validate-permissions.ts`, `verify-setup.ts` |

**Not migrated (intentional):**
- `tests/fixtures/test-repo/src/index.js` — fake repo fixture for scanner tests
- `tests/accuracy/fixtures/src/*.js` — fake source files for accuracy testing
- `tests/integration/lib/errors/error-classifier.js` — test-only copy
- `sidequest/utils/doppler-resilience.example.js` — deferred (LOG12)

**Verification:** `npx tsc --noEmit` → 0 errors (2026-02-24)

---

### Phase Summary

| Phase | Description | Files | Lines | Risk | Status |
|------:|-------------|------:|------:|------|--------|
| 0 | JS+TS pair cleanup | 12 deleted | -3,100 | Low | ✅ Done |
| 1 | Infrastructure | 4-5 configs | - | Medium | ✅ Done |
| 2 | Foundation | ~13 | 1,475 | Low | ✅ Done |
| 3 | Types & Errors | ~3 | 586 | Low | ✅ Done |
| 4 | Data Layer | 2 | 1,171 | Medium | ✅ Done |
| 5 | Git & Workflow | 4 | 2,046 | Low | ✅ Done |
| 6 | Core Server | 2 | 1,012 | **High** | ✅ Done |
| 7 | Pipeline Core | 15 | 5,849 | Medium | ✅ Done |
| 8 | Workers & Runners | ~15 | 5,937 | Low | ✅ Done |
| 9 | API Layer | 12 | 3,483 | Medium | ✅ Done |
| 10 | Tests, Scripts, Packages | ~102 | 32,978 | Low | ✅ Done |

---

## 4. Per-File Migration Checklist

Standard steps for each `.js` -> `.ts` conversion:

1. **Rename** `foo.js` -> `foo.ts`
2. **Add type annotations** to all function parameters and return types
3. **Update imports** in this file: change `.js` extensions to `.ts` for already-migrated dependencies
4. **Fix strict mode errors:**
   - `noImplicitAny`: Add explicit types where inferred as `any`
   - `strictNullChecks`: Add null guards or optional chaining
   - `strictPropertyInitialization`: Initialize or mark class properties
5. **Delete corresponding `.d.ts`** if one exists for this file
6. **Update all importers** that reference this file: change their imports from `.js` to `.ts`
7. **Run verification:** `npx tsc --noEmit`

### Import Update Strategy

When a file is renamed, ALL files that import it must be updated in the same commit. Use grep to find importers:

```bash
grep -r "from.*'/path/to/module\.js'" --include='*.ts' --include='*.js' -l
```

---

## 5. Risk Assessment

### High Fan-In Files (Cascade Risk)

These files are imported by many others. Errors in migration break widespread consumers:

| File | Importers | Mitigation |
|------|----------:|------------|
| `logger.js` | 85+ | Migrate early (Phase 2), minimal type surface |
| `constants.js` | 34 | Migrate early (Phase 2), pure data |
| `config.js` | 26 | Migrate early (Phase 2), pure data |
| `server.js` (core) | 17 | Careful Phase 6, extensive testing |
| `job-repository.js` | 5 | Phase 4, straightforward |

### Breaking Change Vectors

1. **Import extensions:** Changing `.js` -> `.ts` in imports is a breaking change if any file is missed. Automated grep is required.
2. **`strict: true` cascade:** Enabling strict mode will surface implicit-any errors across the entire checked codebase at once. Phase 1 should expect and track these.
3. **`--strip-types` limitations:** Any code using `enum`, `namespace`, or `const enum` must be refactored. Grep for these patterns before Phase 1.
4. **PM2 restart:** Changing entry point paths requires coordinated deploy. Update `ecosystem.config.cjs` and restart PM2 in the same deployment.

### Rollback Strategy

Each phase is a single PR merged to `main`. To roll back:

1. `git revert <merge-commit>` for the phase PR
2. Restore the `.js` files from git history
3. Revert `ecosystem.config.cjs` if entry points changed
4. `pm2 restart all`

Phase 0 (pair cleanup) and Phase 1 (infrastructure) should be tested in staging before merging.

### Pre-Migration Validation

Before starting Phase 1, verify:

```bash
# No enums in codebase (incompatible with --strip-types)
grep -r "^\s*enum " --include='*.ts' --include='*.js' -l

# No namespaces
grep -r "^\s*namespace " --include='*.ts' --include='*.js' -l

# No const enums
grep -r "const enum" --include='*.ts' --include='*.js' -l

# No constructor parameter properties
grep -r "constructor.*private\|constructor.*public\|constructor.*protected\|constructor.*readonly" --include='*.ts' -l
```

---

## 6. Verification Protocol

### Per-Phase Gate

Every phase must pass before merging:

```bash
npm run typecheck          # tsc --noEmit (strict: true)
npm test                   # Unit tests
npm run test:integration   # Integration tests
```

### Post-Migration (All Phases Complete)

```bash
# Full verification
npm run typecheck && npm test && npm run test:integration

# Confirm no .js source files remain (except config, .cjs, fixtures)
find . -name '*.js' -not -path './node_modules/*' -not -path './frontend/dist/*' \
  -not -path './config/*' -not -path './.git/*' -not -name '*.cjs' | sort

# Confirm no stale .d.ts files remain (except vite-env.d.ts)
find . -name '*.d.ts' -not -path './node_modules/*' -not -name 'vite-env.d.ts' | sort

# Confirm --strip-types works for entry points
node --strip-types api/server.ts --help 2>&1 | head -1
node --strip-types sidequest/pipeline-runners/duplicate-detection-pipeline.ts --help 2>&1 | head -1
```

### Production Smoke Test

After deploying each phase:
1. `pm2 restart all && sleep 5`
2. `curl -f http://localhost:8080/health`
3. `pm2 logs --nostream --lines 20` (check for import/type errors)

---

## 7. Dependency Graph

```
Layer 0: External packages (zod, express, pino, sql.js, node-cron, @sentry/node)

Layer 1: Foundation (Phase 2) ✅
├── constants.ts          ← 34 importers
├── config.ts             ← 26 importers
├── @shared/logging       ← 85+ importers
├── @shared/process-io    ← ~10 importers
└── utils (error-helpers, fs-helpers, timing-helpers, logger)

Layer 2: Types & Errors (Phase 3) ✅
├── api/types/*.ts        ← already migrated
├── error-classifier.ts   → constants
└── api-error.ts          → (standalone)

Layer 3: Data (Phase 4)
├── database.ts           → config, constants, job-status, logger
└── job-repository.ts     → database, logger

Layer 4: Git (Phase 5)
├── branch-manager.ts     → @shared/process-io, logger
├── pr-creator.ts         → branch-manager, config, logger
├── migration-transformer.ts → logger, fs-helpers
└── git-workflow-manager.ts → branch-manager, logger

Layer 5: Server (Phase 6)
├── server.ts             → config, constants, job-repository, git-workflow-manager,
│                            error-classifier, job-status, logger
└── index.ts              → config, constants, logger, workers

Layer 6: Pipeline Core (Phase 7)
├── scanners/*.ts         → logger, constants, @shared/process-io
├── cache/*.ts            → scanners, logger, config
├── reports/*.ts          → logger, types
└── config-loader.ts      → logger

Layer 7: Workers (Phase 8)
├── *-worker.ts           → server.ts, pipeline-core modules, logger, config
└── *-pipeline.ts         → corresponding worker, logger, config

Layer 8: API (Phase 9)
├── middleware/*.ts        → logger, config, constants
├── routes/*.ts           → middleware, types, job-repository, worker-registry
├── utils/*.ts            → logger, config, constants, workers
└── server.ts (api)       → routes, middleware, utils, websocket

Layer 9: Tests & Scripts (Phase 10)
├── tests/**/*.ts         → source modules under test
└── scripts/*.ts          → various utilities
```

No circular dependencies detected. The graph is a strict DAG.

---

## Appendix: Files Not Migrated

These files remain as-is:

| File | Reason |
|------|--------|
| `config/ecosystem.config.cjs` | PM2 requires CommonJS |
| `frontend/src/vite-env.d.ts` | Vite ambient type declaration |
| `tests/fixtures/test-repo/src/index.js` | Test fixture (fake repo file) |
| `cloudflare-workers/n0ai-proxy/src/index.ts` | Already TypeScript, separate deploy |
| Python files (`*.py`) | Separate language, out of scope |

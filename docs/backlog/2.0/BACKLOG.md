# AlephAuto 2.0: TypeScript Migration Design Doc

**Status:** Draft
**Date:** 2026-02-10
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

| File | Provides Types For |
|------|--------------------|
| `api/types/pipeline-requests.d.ts` | Pipeline request/response types |
| `sidequest/core/server.d.ts` | SidequestServer class |
| `sidequest/pipeline-core/scan-orchestrator.d.ts` | ScanOrchestrator class |
| `sidequest/pipeline-core/errors/error-types.d.ts` | Error classification types |
| `sidequest/pipeline-core/errors/types.d.ts` | Error handling types |
| `sidequest/utils/logger.d.ts` | Logger utilities |
| `packages/shared-logging/src/index.d.ts` | @shared/logging exports |
| `packages/shared-process-io/src/index.d.ts` | @shared/process-io exports |
| `frontend/src/vite-env.d.ts` | Vite client types (keep as-is) |

All `.d.ts` files except `vite-env.d.ts` will be deleted as their corresponding `.js` sources become `.ts`.

### 12 JS+TS Pairs (Stale Duplicates)

Files where both `.js` and `.ts` exist, indicating incomplete migration:

| # | Base Path | Status |
|---|-----------|--------|
| 1 | `api/middleware/validation` | `.ts` is canonical (has Zod validation) |
| 2 | `api/types/job-status` | `.ts` is canonical (Zod schema source) |
| 3 | `api/types/pipeline-requests` | `.ts` is canonical (Zod schema source) |
| 4 | `api/types/scan-requests` | `.ts` is canonical (Zod schema source) |
| 5 | `api/types/repository-requests` | `.ts` is canonical (Zod schema source) |
| 6 | `api/types/report-requests` | `.ts` is canonical (Zod schema source) |
| 7 | `api/routes/pipelines` | `.ts` is canonical (uses typed middleware) |
| 8 | `api/routes/scans` | `.ts` is canonical (uses typed middleware) |
| 9 | `sidequest/types/duplicate-detection-types` | ✅ `.js` deleted (Phase 0) |
| 10 | `sidequest/pipeline-core/types/scan-orchestrator-types` | ✅ `.js` deleted (Phase 0) |
| 11 | `sidequest/pipeline-core/scan-orchestrator` | `.ts` is canonical (829 lines vs 458 lines .js) |
| 12 | `sidequest/pipeline-runners/duplicate-detection-pipeline` | `.ts` is canonical (1,011 lines vs .js stub) |

**Resolution:** For all 12 pairs, the `.ts` file is canonical. The `.js` file should be deleted after verifying no runtime references remain.

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

### Phase 0: JS+TS Pair Cleanup (Pre-Migration) — Partial ✅

**Goal:** Remove 12 stale `.js` files that have `.ts` replacements.

**Status:** 2/12 deleted. Remaining 10 have active runtime importers using `.js` extensions — blocked on Phase 1 (`--strip-types` enablement) to update import paths from `.js` to `.ts`.

**Deleted (2):**
- ~~`sidequest/types/duplicate-detection-types.js`~~ — zero importers, deleted
- ~~`sidequest/pipeline-core/types/scan-orchestrator-types.js`~~ — zero importers, deleted

**Blocked on Phase 1 (10):**
- `api/middleware/validation.js` — imported by `api/routes/pipelines.js`, `api/routes/scans.js`
- `api/types/job-status.js` — imported by 6 route/middleware files
- `api/types/pipeline-requests.js` — imported by `api/routes/pipelines.js`
- `api/types/scan-requests.js` — imported by `api/routes/scans.js`
- `api/types/repository-requests.js` — imported by `api/routes/repositories.js`
- `api/types/report-requests.js` — imported by `api/routes/reports.js`
- `api/routes/pipelines.js` — imported by `api/server.js`
- `api/routes/scans.js` — imported by `api/server.js`
- `sidequest/pipeline-core/scan-orchestrator.js` — imported by `sidequest/workers/duplicate-detection.js`
- `sidequest/pipeline-runners/duplicate-detection-pipeline.js` — imported by `sidequest/workers/duplicate-detection.js`

**Pre-check:** Verify no runtime `require()` or dynamic `import()` references the `.js` file directly. Grep for each filename across the codebase.

**Verification:** `npm run typecheck && npm test && npm run test:integration`

---

### Phase 1: Infrastructure

**Goal:** Configure tooling for TypeScript-first execution.

**Changes:**

1. **`tsconfig.json`** (root):
   - Set `strict: true`
   - Change `moduleResolution` from `node` to `node16` (supports `.ts` imports)
   - Remove `"**/*.js"` from `include` (after all files migrated, progressive)
   - Add `"allowImportingTsExtensions": true`

2. **`tests/tsconfig.json`**:
   - Set `checkJs: true` (currently `false`)
   - Align settings with root

3. **`config/ecosystem.config.cjs`**:
   - Add `--strip-types` to `node_args`
   - Update `script` paths from `.js` to `.ts` (done incrementally as files migrate)

4. **`package.json`** scripts:
   - Add `--strip-types` flag to all `node` invocations
   - Update entry point references as files migrate

5. **`scripts/deploy-traditional-server.sh`**:
   - Update Node.js version requirement to v25+
   - Update `chmod +x` targets to include `.ts` files
   - Update `brew install node@20` to `brew install node@25`

6. **CI/pre-commit hooks:**
   - Ensure `npm run typecheck` runs with `strict: true`

**Files modified:** 4-5 config files
**Verification:** `npm run typecheck` passes (may have new strict errors that later phases fix)

---

### Phase 2: Foundation (0 Dependencies, High Fan-In)

**Goal:** Migrate the most-imported, least-dependent files first.

| File | Lines | Fan-In | Dependencies |
|------|------:|-------:|--------------|
| `sidequest/core/constants.js` | 228 | 34 | None |
| `sidequest/core/config.js` | 239 | 26 | None |
| `sidequest/utils/logger.js` | 142 | 85+ | None (wraps @shared/logging) |
| `sidequest/utils/time-helpers.js` | 78 | ~5 | None |
| `sidequest/utils/pipeline-names.js` | 62 | ~5 | None |
| `sidequest/pipeline-core/utils/error-helpers.js` | 258 | ~10 | None |
| `sidequest/pipeline-core/utils/fs-helpers.js` | 104 | ~5 | None |
| `sidequest/pipeline-core/utils/timing-helpers.js` | 80 | ~5 | None |
| `sidequest/pipeline-core/utils/process-helpers.js` | 15 | ~3 | None |
| `sidequest/pipeline-core/utils/index.js` | 12 | ~10 | Above utils |
| `packages/shared-logging/src/logger.js` | 95 | ~85 | None (pino) |
| `packages/shared-logging/src/index.js` | 1 | ~85 | logger.js |
| `packages/shared-process-io/src/index.js` | 161 | ~10 | None |

**Total:** ~13 files, ~1,475 lines

**After this phase:** Delete `sidequest/utils/logger.d.ts`, `packages/shared-logging/src/index.d.ts`, `packages/shared-process-io/src/index.d.ts` (3 `.d.ts` files).

**Verification:** `npm run typecheck && npm test`

---

### Phase 3: Types & Errors

**Goal:** Migrate type definitions and error handling.

| File | Lines | Notes |
|------|------:|-------|
| `sidequest/pipeline-core/errors/error-classifier.js` | 433 | Depends on: constants |
| `api/utils/api-error.js` | 144 | Express error utilities |
| `api/preload.js` | 9 | EventEmitter setup |

**Type files already migrated:** `api/types/*.ts`, `sidequest/types/*.ts`, `sidequest/pipeline-core/types/*.ts` (cleaned up in Phase 0).

**After this phase:** Delete `sidequest/pipeline-core/errors/error-types.d.ts`, `sidequest/pipeline-core/errors/types.d.ts`, `api/types/pipeline-requests.d.ts` (3 `.d.ts` files).

**Total:** ~3 files, ~586 lines

**Verification:** `npm run typecheck && npm test`

---

### Phase 4: Data Layer

**Goal:** Migrate database access and job persistence.

| File | Lines | Dependencies |
|------|------:|--------------|
| `sidequest/core/database.js` | 961 | config, constants, job-status, logger |
| `sidequest/core/job-repository.js` | 210 | database, logger |

**Total:** 2 files, 1,171 lines

**Note:** `database.js` is the largest core file (961 lines). Expect significant strict mode fixes around sql.js return types and null handling.

**Verification:** `npm run typecheck && npm test && npm run test:integration`

---

### Phase 5: Git & Workflow

**Goal:** Migrate git operations layer.

| File | Lines | Dependencies |
|------|------:|--------------|
| `sidequest/pipeline-core/git/branch-manager.js` | 488 | @shared/process-io, logger |
| `sidequest/pipeline-core/git/pr-creator.js` | 491 | branch-manager, config, logger |
| `sidequest/pipeline-core/git/migration-transformer.js` | 798 | logger, fs-helpers |
| `sidequest/core/git-workflow-manager.js` | 269 | branch-manager, logger |

**Total:** 4 files, 2,046 lines

**Verification:** `npm run typecheck && npm test`

---

### Phase 6: Core Server

**Goal:** Migrate the `SidequestServer` base class.

| File | Lines | Dependencies | Blocks |
|------|------:|--------------|--------|
| `sidequest/core/server.js` | 815 | config, constants, job-repository, git-workflow-manager, error-classifier, job-status, logger | All 8+ workers |
| `sidequest/core/index.js` | 197 | config, constants, logger, workers, directory-scanner | Cron scheduler |

**Total:** 2 files, 1,012 lines

**Critical:** This is the highest-risk phase. `server.js` is the base class for all workers. Type errors here cascade to every worker.

**After this phase:** Delete `sidequest/core/server.d.ts` (1 `.d.ts` file).

**Verification:** `npm run typecheck && npm test && npm run test:integration`

---

### Phase 7: Pipeline Core

**Goal:** Migrate scanners, caches, reports, and config loaders.

| Subdir | Files | Lines | Key Files |
|--------|------:|------:|-----------|
| `scanners/` | 5 | 1,807 | repository-scanner, ast-grep-detector, timeout-pattern-detector, codebase-health-scanner, root-directory-analyzer |
| `cache/` | 3 | 1,092 | git-tracker, scan-cache, cached-scanner |
| `reports/` | 4 | 1,807 | json-report-generator, html-report-generator, markdown-report-generator, report-coordinator |
| `config/` | 1 | 406 | repository-config-loader |
| Root | 2 | 737 | inter-project-scanner, doppler-health-monitor |

**Total:** 15 files, ~5,849 lines

**After this phase:** Delete `sidequest/pipeline-core/scan-orchestrator.d.ts` (already `.ts`, but verify `.d.ts` is gone).

**Verification:** `npm run typecheck && npm test`

---

### Phase 8: Workers & Runners (Parallelizable)

**Goal:** Migrate all worker implementations and pipeline runners.

**Workers (8 files, ~4,008 lines):**

| Worker | Lines | Special Dependencies |
|--------|------:|----------------------|
| `duplicate-detection-worker.js` | ~600 | scan-orchestrator, report-coordinator, pr-creator |
| `schema-enhancement-worker.js` | ~500 | config-loader |
| `gitignore-worker.js` | ~400 | gitignore-repomix-updater |
| `repo-cleanup-worker.js` | ~500 | directory-scanner |
| `git-activity-worker.js` | ~500 | @shared/process-io |
| `repomix-worker.js` | ~500 | directory-scanner |
| `claude-health-worker.js` | ~500 | @shared/process-io |
| `bugfix-audit-worker.js` | ~508 | error-classifier |

**Runners (6 JS files remaining, ~1,929 lines):**
- `schema-enhancement-pipeline.js`
- `gitignore-pipeline.js`
- `repo-cleanup-pipeline.js`
- `git-activity-pipeline.js`
- `claude-health-pipeline.js`
- `plugin-management-pipeline.js`
- `bugfix-audit-pipeline.js`

(`duplicate-detection-pipeline.ts` and `test-refactor-pipeline.ts` already migrated.)

**Total:** ~15 files, ~5,937 lines

**Note:** Workers and runners within this phase are independent of each other and can be migrated in parallel by multiple contributors.

**Verification:** `npm run typecheck && npm test`

---

### Phase 9: API Layer

**Goal:** Migrate routes, middleware, server, and utilities.

| File | Lines | Notes |
|------|------:|-------|
| `api/middleware/auth.js` | 96 | |
| `api/middleware/rate-limit.js` | 113 | |
| `api/middleware/error-handler.js` | 62 | |
| `api/routes/jobs.js` | 439 | Largest route file |
| `api/routes/repositories.js` | 301 | |
| `api/routes/reports.js` | 271 | |
| `api/utils/worker-registry.js` | 524 | High complexity |
| `api/utils/port-manager.js` | 264 | |
| `api/server.js` | 440 | Entry point |
| `api/event-broadcaster.js` | 214 | WebSocket events |
| `api/activity-feed.js` | 498 | |
| `api/websocket.js` | 261 | |

**Total:** 12 files, ~3,483 lines

**Note:** `api/server.js` is the PM2 entry point. After migrating it to `.ts`, update `ecosystem.config.cjs` to point to `api/server.ts`.

**Verification:** `npm run typecheck && npm test && npm run test:integration`

---

### Phase 10: Tests, Scripts, Packages

**Goal:** Migrate remaining test files, scripts, and utilities.

| Category | Files | Lines |
|----------|------:|------:|
| `tests/unit/` | 46 | 18,876 |
| `tests/integration/` | 22 | 6,818 |
| `tests/utils/` | 1 | 550 |
| `tests/accuracy/` | 7 | 1,269 |
| `tests/scripts/` | 8 | 1,179 |
| `tests/fixtures/test-helpers.js` | 1 | 324 |
| `scripts/` | 9 | 1,762 |
| `sidequest/utils/` (remaining) | ~8 | ~2,200 |

**Total:** ~102 files, ~32,978 lines

**Note:** This is the largest phase by file count but lowest risk. Test files are leaf nodes with no downstream consumers. Can be parallelized heavily.

**Sidequest utils to migrate:**
- `report-generator.js` (593), `directory-scanner.js` (277), `dependency-validator.js` (158)
- `doppler-resilience.js` (372), `plugin-manager.js` (243), `schema-mcp-tools.js` (293)
- `gitignore-repomix-updater.js` (293), `doppler-resilience.example.js` (289)

**Verification:** `npm run typecheck && npm test && npm run test:integration`

---

### Phase Summary

| Phase | Description | Files | Lines | Risk |
|------:|-------------|------:|------:|------|
| 0 | JS+TS pair cleanup | 12 deleted | -3,100 | Low |
| 1 | Infrastructure | 4-5 configs | - | Medium |
| 2 | Foundation | ~13 | 1,475 | Low |
| 3 | Types & Errors | ~3 | 586 | Low |
| 4 | Data Layer | 2 | 1,171 | Medium |
| 5 | Git & Workflow | 4 | 2,046 | Low |
| 6 | Core Server | 2 | 1,012 | **High** |
| 7 | Pipeline Core | 15 | 5,849 | Medium |
| 8 | Workers & Runners | ~15 | 5,937 | Low |
| 9 | API Layer | 12 | 3,483 | Medium |
| 10 | Tests, Scripts, Packages | ~102 | 32,978 | Low |

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

Layer 1: Foundation (Phase 2)
├── constants.ts          ← 34 importers
├── config.ts             ← 26 importers
├── @shared/logging       ← 85+ importers
├── @shared/process-io    ← ~10 importers
└── utils (error-helpers, fs-helpers, timing-helpers, logger)

Layer 2: Types & Errors (Phase 3)
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

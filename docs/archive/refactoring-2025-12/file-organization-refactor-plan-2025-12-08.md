# AlephAuto File Organization Refactoring Plan

**Date:** 2025-12-08
**Status:** Analysis Complete
**Priority:** High
**Risk Level:** Medium (requires careful import path updates)

---

## Executive Summary

The AlephAuto repository has accumulated significant file duplication and structural issues during TypeScript migration. This analysis identifies **5 critical issues**, **11 duplicate file pairs**, and recommends a phased cleanup approach that will:

- Remove ~30 unnecessary files
- Consolidate 4 duplicated directories
- Clean up 349 log files (1.5MB)
- Remove 5 empty test artifact directories

**Estimated cleanup:** ~40% reduction in file count (excluding node_modules/logs)

---

## 1. Current State Analysis

### 1.1 Repository Structure Overview

```
AlephAuto/
├── api/                    # API layer (PRIMARY LOCATION)
│   ├── routes/             # Route handlers
│   │   ├── routes/         # DUPLICATE - nested routes directory
│   │   ├── middleware/     # DUPLICATE - validation.js copy
│   │   └── types/          # DUPLICATE - pipeline-requests.js copy
│   ├── middleware/         # Canonical middleware
│   ├── types/              # Canonical type definitions
│   └── utils/              # Utilities (worker-registry, port-manager)
├── middleware/             # ROOT DUPLICATE - orphaned middleware
├── routes/                 # ROOT DUPLICATE - orphaned routes
├── types/                  # ROOT DUPLICATE - orphaned types
├── condense/               # TEST ARTIFACTS - empty directories
├── logs/                   # 349 files, needs rotation policy
├── sidequest/              # Job queue framework (well-organized)
├── frontend/               # React dashboard (well-organized)
└── tests/                  # Test files
```

### 1.2 Duplication Categories

| Category | Count | Severity | Location |
|----------|-------|----------|----------|
| Validation Middleware | 5 files | CRITICAL | 4 directories |
| Pipeline Types | 6 files | CRITICAL | 3 directories |
| Pipeline Routes | 4 files | CRITICAL | 3 directories |
| JS+TS Pairs | 11 pairs | HIGH | api/, sidequest/ |
| Empty Directories | 5 dirs | LOW | condense/ |
| Stale Logs | 349 files | MEDIUM | logs/ |

---

## 2. Detailed Duplication Analysis

### 2.1 CRITICAL: Validation Middleware (5 copies)

| File | Size | Canonical? | Import Path |
|------|------|------------|-------------|
| `api/middleware/validation.ts` | 3.2KB | **YES** | Proper TS with types |
| `api/middleware/validation.js` | 3.0KB | NO | Compiled from .ts, uses `req.validatedQuery` |
| `api/routes/middleware/validation.js` | 3.0KB | NO | Copy with different relative path |
| `middleware/validation.js` | 3.4KB | NO | Root copy, compiled format |
| `middleware/validation.d.ts` | 0.7KB | NO | Orphaned declaration file |

**Canonical Version:** `/api/middleware/validation.ts`

**Key Differences:**
- `.ts` version has proper TypeScript types and interfaces
- `.js` versions are nearly identical except for:
  - `api/middleware/validation.js` uses `req.validatedQuery` (correct)
  - `api/middleware/validation.ts` assigns directly to `req.query` (bug - read-only)

**IMPORTANT:** The `.js` version has a bug fix (`req.validatedQuery`) not in the `.ts` version. Before removal, merge this fix into the TypeScript source.

**Files to Remove (after consolidation):**
- `/middleware/validation.js`
- `/middleware/validation.d.ts`
- `/api/routes/middleware/validation.js`
- `/api/middleware/validation.js` (after TypeScript is the source of truth)

**Import References to Update:**
```javascript
// Current (various patterns)
import { validateQuery } from '../middleware/validation.js';
import { validateQuery } from '../../../middleware/validation.js';

// Target (unified)
import { validateQuery } from '../../api/middleware/validation.js';
```

### 2.2 CRITICAL: Pipeline Types (6 files in 3 locations)

| File | Size | Canonical? | Features |
|------|------|------------|----------|
| `api/types/pipeline-requests.ts` | 8.0KB | **YES** | Full schemas, GitInfo, JobError, passthrough |
| `api/types/pipeline-requests.js` | 7.8KB | NO | Compiled from .ts |
| `api/types/pipeline-requests.d.ts` | 11.7KB | NO | Generated declaration |
| `types/pipeline-requests.js` | 4.3KB | NO | OUTDATED - missing GitInfo, JobError, passthrough |
| `types/pipeline-requests.d.ts` | 11.7KB | NO | Outdated declaration |
| `api/routes/types/pipeline-requests.js` | 5.3KB | NO | Partial copy, includes PipelineDocs but strict() |

**Canonical Version:** `/api/types/pipeline-requests.ts`

**Critical Differences:**

1. **`api/types/pipeline-requests.ts`** (CANONICAL):
   - Has `GitInfoSchema`, `JobErrorSchema`
   - Uses `.passthrough()` for extensibility
   - Has `PipelineDocsParamsSchema`, `PipelineHtmlParamsSchema`
   - 261 lines, most complete

2. **`types/pipeline-requests.js`** (OUTDATED):
   - Missing `GitInfo`, `JobError` schemas
   - Uses `.strict()` instead of `.passthrough()` - BREAKING
   - Missing `PipelineDocs*` schemas
   - 149 lines

3. **`api/routes/types/pipeline-requests.js`** (PARTIAL):
   - Has `PipelineDocs*` schemas
   - Uses `.strict()` - BREAKING
   - 173 lines

**Files to Remove:**
- `/types/pipeline-requests.js`
- `/types/pipeline-requests.d.ts`
- `/api/routes/types/pipeline-requests.js`
- `/api/types/pipeline-requests.js` (keep .ts source)
- `/api/types/pipeline-requests.d.ts` (regenerate from .ts)

**Import References to Update:**
```javascript
// routes/pipelines.js (line 11) - BROKEN IMPORT
import { ... } from '../types/pipeline-requests.js';
// Should be:
import { ... } from '../../api/types/pipeline-requests.js';

// api/routes/routes/pipelines.js (line 11)
import { ... } from '../../types/pipeline-requests.js';
// Should be:
import { ... } from '../../types/pipeline-requests.js'; // (after moving)
```

### 2.3 CRITICAL: Pipeline Routes (4 files in 3 locations)

| File | Size | Canonical? | Features |
|------|------|------------|----------|
| `api/routes/pipelines.ts` | N/A | **SOURCE** | TypeScript source |
| `api/routes/pipelines.js` | 29KB | YES (runtime) | Compiled, full features |
| `api/routes/routes/pipelines.js` | 29KB | NO | Copy with wrong import paths |
| `routes/pipelines.js` | 8.3KB | NO | OUTDATED - simpler version |
| `routes/pipelines.d.ts` | 0.3KB | NO | Orphaned declaration |

**Canonical Version:** `/api/routes/pipelines.ts` (source) / `/api/routes/pipelines.js` (runtime)

**Key Differences:**

1. **`api/routes/pipelines.js`** (29KB - CANONICAL runtime):
   - Full features: pause/resume, docs, html, worker registry
   - Imports from `../types/pipeline-requests.js`
   - Uses `result = await fetchJobsForPipeline()` returning `{jobs, total}`

2. **`api/routes/routes/pipelines.js`** (29KB - COPY):
   - Nearly identical but WRONG import paths:
     - `from '../middleware/validation.js'` (resolves to api/routes/middleware/)
     - `from '../../types/pipeline-requests.js'` (wrong relative path)
     - `from '../../../sidequest/...` (extra nesting level)
   - This file should NOT exist

3. **`routes/pipelines.js`** (8.3KB - OUTDATED):
   - Missing: pause/resume, docs, html endpoints
   - Returns `jobs` directly instead of `{jobs, total}` object
   - Much simpler, likely early version

**Files to Remove:**
- `/api/routes/routes/pipelines.js` (accidental nested directory)
- `/routes/pipelines.js`
- `/routes/pipelines.d.ts`
- `/api/routes/pipelines.js` (keep .ts source)

**Critical:** The entire `/api/routes/routes/` directory should not exist - it's an accidental nested duplication.

### 2.4 HIGH: JS + TS Coexistence Pattern (11 pairs)

Files with both `.ts` and `.js` versions (excluding generated `.d.ts`):

| TypeScript Source | Compiled JS | Action |
|-------------------|-------------|--------|
| `api/middleware/validation.ts` | `api/middleware/validation.js` | Keep .ts, remove .js |
| `api/types/scan-requests.ts` | `api/types/scan-requests.js` | Keep .ts, remove .js |
| `api/types/repository-requests.ts` | `api/types/repository-requests.js` | Keep .ts, remove .js |
| `api/types/report-requests.ts` | `api/types/report-requests.js` | Keep .ts, remove .js |
| `api/types/pipeline-requests.ts` | `api/types/pipeline-requests.js` | Keep .ts, remove .js |
| `api/routes/pipelines.ts` | `api/routes/pipelines.js` | Keep .ts, remove .js |
| `api/routes/scans.ts` | `api/routes/scans.js` | Keep .ts, remove .js |
| `sidequest/types/duplicate-detection-types.ts` | `.js` | Keep .ts, remove .js |
| `sidequest/pipeline-core/types/scan-orchestrator-types.ts` | `.js` | Keep .ts, remove .js |
| `sidequest/pipeline-core/scan-orchestrator.ts` | `.js` | Keep .ts, remove .js |
| `sidequest/pipeline-runners/duplicate-detection-pipeline.ts` | `.js` | Keep .ts, remove .js |

**Recommendation:** Configure TypeScript to output to a `dist/` directory and update imports to use source `.ts` files with ts-node/tsx, OR maintain the pattern but ensure build process regenerates .js files.

---

## 3. File Removal Candidates

### 3.1 Empty Directories (5)

```bash
rm -rf condense/dir1
rm -rf condense/dir2
rm -rf condense/dir3
rm -rf condense/project/subdir
rm -rf condense/test-dir
# Consider: rm -rf condense/  (entire directory appears to be test artifacts)
```

### 3.2 Orphaned Root-Level Directories (3)

| Directory | Files | Action |
|-----------|-------|--------|
| `/middleware/` | 2 files | Remove after consolidation |
| `/routes/` | 2 files | Remove after consolidation |
| `/types/` | 2 files | Remove after consolidation |

### 3.3 Duplicate/Outdated Files (Summary)

**Immediate Removal (no dependencies):**
- `/condense/` - entire directory (test artifacts)
- `/middleware/validation.d.ts` - orphaned
- `/types/pipeline-requests.d.ts` - orphaned
- `/routes/pipelines.d.ts` - orphaned

**Remove After Import Updates:**
- `/middleware/validation.js`
- `/types/pipeline-requests.js`
- `/routes/pipelines.js`
- `/api/routes/routes/pipelines.js`
- `/api/routes/middleware/validation.js`
- `/api/routes/types/pipeline-requests.js`
- All `.js` files where `.ts` source exists (11 files)

### 3.4 Log Files (349 files, 1.5MB)

**Current State:**
- `logs/` - 235+ files including test outputs
- `logs/duplicate-detection/` - 117 scan result files with timestamps

**Recommendation:** Implement log rotation:
```bash
# Add to .gitignore
logs/*.json
logs/duplicate-detection/*.json

# Keep in git
logs/.gitkeep
logs/ANALYSIS.md
```

**Cleanup Script:**
```bash
# Remove logs older than 7 days
find logs/ -name "*.json" -mtime +7 -delete
find logs/duplicate-detection/ -name "*.json" -mtime +7 -delete
```

---

## 4. Import Dependency Map

### 4.1 Validation Middleware Importers

| File | Current Import | Target Import |
|------|---------------|---------------|
| `api/routes/pipelines.js` | `../middleware/validation.js` | `../middleware/validation.js` (unchanged) |
| `api/routes/pipelines.ts` | `../middleware/validation.js` | `../middleware/validation.js` (unchanged) |
| `api/routes/scans.js` | `../middleware/validation.js` | `../middleware/validation.js` (unchanged) |
| `api/routes/scans.ts` | `../middleware/validation.js` | `../middleware/validation.js` (unchanged) |
| `api/routes/repositories.js` | `../middleware/validation.js` | `../middleware/validation.js` (unchanged) |
| `api/routes/reports.js` | `../middleware/validation.js` | `../middleware/validation.js` (unchanged) |
| `routes/pipelines.js` | `../middleware/validation.js` | **FILE SHOULD BE REMOVED** |
| `api/routes/routes/pipelines.js` | `../middleware/validation.js` | **FILE SHOULD BE REMOVED** |

### 4.2 Pipeline Types Importers

| File | Current Import | Target Import |
|------|---------------|---------------|
| `api/routes/pipelines.js` | `../types/pipeline-requests.js` | `../types/pipeline-requests.js` |
| `api/routes/pipelines.ts` | `../types/pipeline-requests.js` | `../types/pipeline-requests.js` |
| `routes/pipelines.js` | `../types/pipeline-requests.js` | **FILE SHOULD BE REMOVED** |
| `api/routes/routes/pipelines.js` | `../../types/pipeline-requests.js` | **FILE SHOULD BE REMOVED** |
| `tests/unit/pipeline-types.test.js` | `../../api/types/pipeline-requests.js` | No change needed |

### 4.3 Server Route Registration

| File | Import |
|------|--------|
| `api/server.js` | `./routes/pipelines.js` |

This is the canonical import - no change needed.

---

## 5. Migration Plan

### Phase 1: Safe Removals (No Dependencies) - Immediate

**Risk: None**

```bash
# Remove empty test directories
rm -rf /path/to/AlephAuto/condense

# Remove orphaned declaration files
rm middleware/validation.d.ts
rm types/pipeline-requests.d.ts
rm routes/pipelines.d.ts
```

**Files Removed:** 8
**Directories Removed:** 6

### Phase 2: Remove Nested Duplicates - Day 1

**Risk: Low (files have wrong import paths anyway)**

```bash
# Remove the accidental nested routes directory
rm -rf api/routes/routes/
rm -rf api/routes/middleware/
rm -rf api/routes/types/
```

**Verification:**
```bash
# Ensure server still starts
npm run typecheck
doppler run -- npm start
```

**Files Removed:** 3
**Directories Removed:** 3

### Phase 3: Fix TypeScript Source Bug - Day 1

**Risk: Low**

Before removing root-level duplicates, merge the `req.validatedQuery` fix from `.js` to `.ts`:

**Edit:** `api/middleware/validation.ts` line 78-79
```typescript
// BEFORE (bug - req.query is read-only)
const validated = schema.parse(req.query);
req.query = validated;

// AFTER (correct pattern)
const validated = schema.parse(req.query);
// Store in custom property since req.query is read-only
(req as any).validatedQuery = validated;
```

### Phase 4: Remove Root-Level Duplicates - Day 2

**Risk: Medium (verify no external references)**

```bash
# Search for any imports
grep -r "from ['\"]\.\.\/middleware" --include="*.js" --include="*.ts"
grep -r "from ['\"]\.\.\/types" --include="*.js" --include="*.ts"
grep -r "from ['\"]\.\.\/routes" --include="*.js" --include="*.ts"
```

If no external references found:
```bash
rm -rf middleware/
rm -rf routes/
rm -rf types/
```

**Files Removed:** 6
**Directories Removed:** 3

### Phase 5: TypeScript Migration Cleanup - Day 3

**Risk: Medium (requires build process verification)**

Decision needed:
1. **Option A:** Keep .js files as build output
   - Configure `outDir: "dist"` in tsconfig.json
   - Update imports to reference `dist/`

2. **Option B:** Use ts-node/tsx for runtime
   - Remove all compiled .js files
   - Update package.json scripts to use tsx
   - Faster development, but requires tsx in production

**Recommendation:** Option B for development, Option A for production builds.

### Phase 6: Log Cleanup - Day 3

**Risk: None**

```bash
# One-time cleanup
find logs/ -name "*.json" -mtime +7 -delete

# Add to .gitignore
echo "logs/*.json" >> .gitignore
echo "logs/**/*.json" >> .gitignore
echo "!logs/.gitkeep" >> .gitignore
```

---

## 6. Reorganization Recommendations

### 6.1 Target Directory Structure

```
AlephAuto/
├── api/
│   ├── middleware/           # CANONICAL middleware
│   │   └── validation.ts     # Single source
│   ├── routes/               # CANONICAL routes
│   │   ├── jobs.js
│   │   ├── pipelines.ts      # TypeScript source
│   │   ├── reports.js
│   │   ├── repositories.js
│   │   └── scans.ts
│   ├── types/                # CANONICAL types
│   │   ├── pipeline-requests.ts
│   │   ├── report-requests.ts
│   │   ├── repository-requests.ts
│   │   └── scan-requests.ts
│   └── utils/
│       ├── port-manager.js
│       └── worker-registry.js
├── sidequest/                # Job queue (keep as-is)
├── frontend/                 # React app (keep as-is)
├── tests/                    # Tests (keep as-is)
├── logs/                     # Runtime logs (gitignored)
│   └── .gitkeep
└── dist/                     # Compiled output (gitignored)
```

### 6.2 TypeScript Configuration Update

```json
// tsconfig.json additions
{
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./",
    "declaration": true,
    "declarationDir": "./dist/types"
  },
  "include": ["api/**/*.ts", "sidequest/**/*.ts"],
  "exclude": ["node_modules", "dist", "frontend"]
}
```

### 6.3 Package.json Script Updates

```json
{
  "scripts": {
    "build": "tsc",
    "start": "doppler run -- node dist/api/server.js",
    "dev": "doppler run -- tsx watch api/server.ts",
    "typecheck": "tsc --noEmit"
  }
}
```

---

## 7. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Broken imports after removal | Medium | High | Run tests after each phase |
| Missing functionality in canonical files | Low | High | Diff files before removal |
| Build process breaks | Medium | Medium | Test in dev environment first |
| Production deployment fails | Low | High | Deploy to staging first |

---

## 8. Success Metrics

| Metric | Before | Target | Achieved |
|--------|--------|--------|----------|
| Duplicate files | 30+ | 0 | |
| Root-level orphan directories | 3 | 0 | |
| Empty directories | 5 | 0 | |
| Log files in git | 349 | 0 | |
| JS/TS duplicate pairs | 11 | 0 | |
| TypeScript coverage | ~40% | 80%+ | |

---

## 9. Testing Checklist

After each phase:

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] `npm run test:integration` passes
- [ ] Server starts: `doppler run -- npm start`
- [ ] Dashboard loads: http://localhost:8080
- [ ] API endpoints respond correctly
- [ ] No broken import errors in console

---

## 10. Rollback Plan

Before starting, create a backup branch:

```bash
git checkout -b backup/pre-refactor-2025-12-08
git push origin backup/pre-refactor-2025-12-08
git checkout main
git checkout -b refactor/file-cleanup
```

If issues arise:
```bash
git checkout main
git branch -D refactor/file-cleanup
```

---

## Appendix A: Complete File Removal List

```bash
# Phase 1: Immediate (no dependencies)
rm -rf condense/
rm middleware/validation.d.ts
rm types/pipeline-requests.d.ts
rm routes/pipelines.d.ts

# Phase 2: Nested duplicates
rm -rf api/routes/routes/
rm -rf api/routes/middleware/
rm -rf api/routes/types/

# Phase 4: Root duplicates
rm -rf middleware/
rm -rf routes/
rm -rf types/

# Phase 5: Compiled JS (after build setup)
rm api/middleware/validation.js
rm api/types/*.js
rm api/routes/pipelines.js
rm api/routes/scans.js
rm sidequest/types/duplicate-detection-types.js
rm sidequest/pipeline-core/types/scan-orchestrator-types.js
rm sidequest/pipeline-core/scan-orchestrator.js
rm sidequest/pipeline-runners/duplicate-detection-pipeline.js
```

---

## Appendix B: Import Update Script

```bash
#!/bin/bash
# update-imports.sh

# Fix any remaining references to root-level directories
find . -name "*.js" -o -name "*.ts" | xargs sed -i '' \
  "s|from '\.\./middleware/validation|from '../../api/middleware/validation|g"

find . -name "*.js" -o -name "*.ts" | xargs sed -i '' \
  "s|from '\.\./types/pipeline-requests|from '../../api/types/pipeline-requests|g"
```

---

**Document Version:** 1.0
**Last Updated:** 2025-12-08
**Author:** Claude Code (Opus 4.5)

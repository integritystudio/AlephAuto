# Phase 7-10: Pipeline Core, Workers, API, Tests

## Phase 7: Pipeline Core (15 files, ~6,043 lines)

### Migration Readiness Assessment

All 15 files are class-based (except 1 CLI function). Zero enums, zero namespaces. JSDoc coverage varies — scanners have excellent coverage, reports/cache have minimal.

#### Scanners (5 files, 1,801 lines)

| File | Lines | Difficulty | Notes |
|------|------:|------------|-------|
| `scanners/repository-scanner.js` | 350 | Low | 10 async methods, 31+ JSDoc blocks |
| `scanners/root-directory-analyzer.js` | 530 | Low-Med | 5 async methods, object properties |
| `scanners/timeout-pattern-detector.js` | 459 | Low | `export const TIMEOUT = {...}` (not enum, safe) |
| `scanners/ast-grep-detector.js` | 230 | Low | @typedef imports, custom errors |
| `scanners/codebase-health-scanner.js` | 232 | Low | CLI entry point, no class exported |

**Pattern:** All scanners follow read → analyze → return-results pattern. Types are straightforward: file paths in, scan results out.

#### Cache (3 files, 1,092 lines)

| File | Lines | Difficulty | Notes |
|------|------:|------------|-------|
| `cache/scan-cache.js` | 403 | Low | Redis integration |
| `cache/git-tracker.js` | 348 | Low | `@ts-nocheck`, promisified exec |
| `cache/cached-scanner.js` | 341 | Low | Caching strategy wrapper |

**Key fix:** `git-tracker.js` has `@ts-nocheck` + `@ts-ignore` on promisified exec. Replace with:
```typescript
import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);
```

#### Reports (4 files, 1,807 lines)

| File | Lines | Difficulty | Notes |
|------|------:|------------|-------|
| `reports/html-report-generator.js` | 710 | Low | Static methods, string templates |
| `reports/json-report-generator.js` | 403 | Low | Static methods, JSON building |
| `reports/markdown-report-generator.js` | 406 | Low | Static methods, markdown building |
| `reports/report-coordinator.js` | 288 | Low | Orchestrates generators |

**Pattern:** HTML/JSON/Markdown generators are static-only classes. All methods return strings. Options use `options = {}` pattern — add interfaces.

#### Config + Root (3 files, 1,143 lines)

| File | Lines | Difficulty | Notes |
|------|------:|------------|-------|
| `config/repository-config-loader.js` | 406 | Low | JSON file I/O |
| `inter-project-scanner.js` | 480 | Low-Med | Orchestrator, scan result accumulation |
| `doppler-health-monitor.js` | 257 | Low | Health status object |

### Migration Order

```
Batch 1: scanners/ (5 files) — most documented, clear patterns
Batch 2: cache/ (3 files) — simple classes, isolated
Batch 3: reports/ (4 files) — static methods, string returns
Batch 4: config/ + root (3 files) — orchestrators
```

### Reference: Already Migrated

`scan-orchestrator.ts` (1,011 lines) — use as reference for scanner typing patterns.

### Verification

```bash
npx tsc --noEmit
npm test
```

---

## Phase 8: Workers & Runners (16 files, ~5,818 lines)

### Migration Readiness Assessment

**Key advantage:** Highly consistent patterns. All workers extend `SidequestServer`. Two reference files already migrated to TypeScript.

#### Workers (9 JS files, 3,636 lines)

| File | Lines | `@ts-nocheck` | Difficulty |
|------|------:|:---:|------------|
| `duplicate-detection-worker.js` | 763 | No | Low |
| `claude-health-worker.js` | 763 | Yes | Low |
| `schema-enhancement-worker.js` | 400 | No | Low |
| `git-activity-worker.js` | 379 | Yes | Low |
| `bugfix-audit-worker.js` | 344 | No | Low |
| `repo-cleanup-worker.js` | 324 | Yes | Low |
| `repomix-worker.js` | 272 | Yes | Low |
| `gitignore-worker.js` | 222 | Yes | Low |
| `dashboard-populate-worker.js` | 169 | Yes | Low |

**Already migrated:** `test-refactor-worker.ts` (811 lines) — use as template.

#### Template Pattern (from test-refactor-worker.ts)

```typescript
import { SidequestServer } from '../core/server.ts';
import type { Job } from '../core/server.ts';

interface MyWorkerOptions {
  maxConcurrent?: number;
  enableGitWorkflow?: boolean;
  // worker-specific options
}

interface MyJobData {
  repositoryPath: string;
  // pipeline-specific fields
}

export class MyWorker extends SidequestServer<MyJobData> {
  constructor(options: MyWorkerOptions = {}) {
    super({
      ...options,
      jobType: 'my-pipeline',
      maxConcurrent: options.maxConcurrent ?? 3,
    });
  }

  async runJobHandler(job: Job<MyJobData>): Promise<void> {
    const { repositoryPath } = job.data;
    // implementation
  }
}
```

**Per-worker migration:** ~2-3 hours each. Define `Options` + `JobData` interfaces, add parameter types, remove `@ts-nocheck`.

#### Pipeline Runners (7 JS files, 2,182 lines)

| File | Lines | `@ts-nocheck` | Difficulty |
|------|------:|:---:|------------|
| `claude-health-pipeline.js` | 392 | Yes | Very Low |
| `schema-enhancement-pipeline.js` | 306 | No | Very Low |
| `duplicate-detection-pipeline.js` | 288 | No | Very Low |
| `bugfix-audit-pipeline.js` | 233 | Yes | Very Low |
| `git-activity-pipeline.js` | 229 | No | Very Low |
| `plugin-management-pipeline.js` | 212 | Yes | Very Low |
| `repo-cleanup-pipeline.js` | 188 | Yes | Very Low |
| `gitignore-pipeline.js` | 184 | Yes | Very Low |
| `dashboard-populate-pipeline.js` | 150 | No | Very Low |

**Already migrated:** `duplicate-detection-pipeline.ts` (1,011 lines), `test-refactor-pipeline.ts` (225 lines) — use as templates.

#### Template Pattern (from duplicate-detection-pipeline.ts)

```typescript
import cron from 'node-cron';
import { MyWorker } from '../workers/my-worker.ts';

class MyPipeline {
  private worker: MyWorker;

  constructor(options = {}) {
    this.worker = new MyWorker(options);
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.worker.on('job:created', (job) => { /* log */ });
    this.worker.on('job:completed', (job) => { /* log */ });
    this.worker.on('job:failed', (job) => { /* log */ });
  }

  async main(): Promise<void> {
    // parse CLI args, schedule cron, start worker
  }
}
```

### Known Issue

`test-refactor-worker.ts` has a `require()` call — convert to `import` during this phase.

### Migration Order

Workers and runners are independent of each other. Migrate in parallel or by complexity:

```
Batch 1: Small workers — dashboard-populate, gitignore, repomix (simplest)
Batch 2: Medium workers — repo-cleanup, git-activity, schema-enhancement
Batch 3: Large workers — bugfix-audit, claude-health, duplicate-detection
Batch 4: All 7 pipeline runners (template-driven, ~2 hours each)
```

### Verification

```bash
npx tsc --noEmit
npm test
```

---

## Phase 9: API Layer (12 files, ~3,483 lines)

### Migration Readiness Assessment

| File | Lines | Difficulty | Notes |
|------|------:|------------|-------|
| `api/server.js` | 458 | Medium | Entry point, Express app setup |
| `api/utils/worker-registry.js` | 550 | **High** | Concurrency + circuit breaker |
| `api/activity-feed.js` | 498 | Medium | Activity tracking, WebSocket |
| `api/routes/jobs.js` | 404 | Low | CRUD route handlers |
| `api/routes/repositories.js` | 301 | Low | CRUD route handlers |
| `api/routes/reports.js` | 271 | Low | Report endpoints |
| `api/utils/port-manager.js` | 264 | Medium | Port fallback, graceful shutdown |
| `api/websocket.js` | 261 | Medium | WebSocket server |
| `api/event-broadcaster.js` | 214 | Low | Event broadcasting |
| `api/middleware/rate-limit.js` | 113 | Low | express-rate-limit wrapper |
| `api/middleware/auth.js` | 96 | Low | API key check |
| `api/middleware/error-handler.js` | 62 | Low | Global error handler |

### High-Complexity: worker-registry.js → worker-registry.ts

This file has concurrency limiting, circuit breaker, and lazy initialization.

```typescript
interface PipelineConfig {
  id: string;
  workerClass: new (options: any) => SidequestServer;
  description: string;
  disabled?: string;  // reason for disabling
}

interface CircuitBreakerState {
  count: number;
  lastAttempt: number;
  cooldownAttempts: number;
}

interface WorkerStats {
  active: number;
  queued: number;
  byPipeline: Record<string, { active: number; queued: number }>;
}

class WorkerRegistry {
  private _workers: Map<string, SidequestServer>;
  private _initializing: Map<string, Promise<SidequestServer>>;
  private _failures: Map<string, CircuitBreakerState>;
  private _activeInits: number;
  private _initQueue: Array<() => void>;

  async getWorker(pipelineId: string): Promise<SidequestServer>;
  getAllStats(): WorkerStats;
  getSupportedPipelines(): string[];
}
```

**Strict mode challenges:**
- `PIPELINE_CONFIGS` values reference worker classes — needs conditional imports or dynamic imports
- Race condition protection (synchronous Promise storage) — typing the Map correctly
- Circuit breaker exponential backoff — numeric types

### Entry Point: api/server.js → api/server.ts

After migration, update `ecosystem.config.cjs`:
```javascript
script: 'api/server.ts',  // was: api/server.js
```

Express types:
```typescript
import express, { Request, Response, NextFunction } from 'express';
```

### Route Files Pattern

All route files follow the same Express pattern:

```typescript
import { Router, Request, Response } from 'express';
import { validateRequest } from '../middleware/validation.ts';
import { sendError, sendNotFoundError } from '../utils/api-error.ts';

const router = Router();

router.get('/path', validateRequest(schema), async (req: Request, res: Response) => {
  // handler
});

export default router;
```

### Migration Order

```
Batch 1: Middleware — auth, rate-limit, error-handler (leaf nodes)
Batch 2: Utilities — port-manager, api-error (already Phase 3)
Batch 3: WebSocket — websocket, event-broadcaster, activity-feed
Batch 4: Routes — jobs, repositories, reports (use typed middleware)
Batch 5: worker-registry (high complexity, depends on worker types)
Batch 6: api/server.ts (entry point, last — update ecosystem.config.cjs)
```

### Verification

```bash
npx tsc --noEmit
npm test
npm run test:integration
# After server.ts migration:
node --strip-types api/server.ts --help 2>&1 | head -1
```

---

## Phase 10: Tests, Scripts, Packages (~102 files, ~32,978 lines)

### Scope

Lowest risk phase. Test files are leaf nodes — no downstream consumers.

#### Test Files (89 files)

| Directory | Files | Lines | Notes |
|-----------|------:|------:|-------|
| `tests/unit/` | 44 | 18,876 | Core unit tests |
| `tests/integration/` | 25 | 6,818 | E2E pipeline tests |
| `tests/scripts/` | 9 | 1,179 | Manual test runners |
| `tests/accuracy/` | 8 | 1,269 | Duplicate detection accuracy |
| `tests/fixtures/test-helpers.js` | 1 | 324 | Shared test utilities |

#### Scripts (4 files, ~107 lines)

| File | Purpose |
|------|---------|
| `scripts/validate-permissions.js` | File permission checks |
| `scripts/fix-types.js` | TypeScript type fixes |
| `scripts/cleanup-error-logs.js` | Log rotation |
| `scripts/verify-setup.js` | Environment validation |

#### Remaining sidequest/utils/ (8 files, ~2,200 lines)

| File | Lines | Notes |
|------|------:|-------|
| `report-generator.js` | 638 | Markdown/HTML generation |
| `doppler-resilience.js` | 372 | Fallback secret caching |
| `schema-mcp-tools.js` | 293 | Schema.org detection |
| `gitignore-repomix-updater.js` | 293 | .gitignore sync |
| `directory-scanner.js` | 277 | File tree walking |
| `plugin-manager.js` | 243 | `@ts-nocheck`, needs review |
| `dependency-validator.js` | 158 | Package.json validation |
| `doppler-resilience.example.js` | 289 | Example file (consider deleting) |

### Strategy

**Parallelize heavily.** Test files are independent — assign batches to separate commits:

```
Batch 1: tests/fixtures/test-helpers.ts (shared utils, migrate first)
Batch 2: sidequest/utils/ remaining (8 files)
Batch 3: tests/unit/ (44 files — split into 4 sub-batches of ~11)
Batch 4: tests/integration/ (25 files — split into 3 sub-batches)
Batch 5: tests/accuracy/ + tests/scripts/ (17 files)
Batch 6: scripts/ (4 files)
```

### Test File Migration Pattern

Vitest test files:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTempRepository } from '../fixtures/test-helpers.ts';

describe('MyModule', () => {
  it('should do something', async () => {
    const { repoPath, cleanup } = await createTempRepository('test');
    try {
      // test logic
    } finally {
      await cleanup();
    }
  });
});
```

Strict mode fixes in tests:
- Mock return types: `vi.fn().mockReturnValue(...)` — add generic types
- Test fixtures: `any` casts for partial mocks — use `Partial<T>` or `as unknown as T`
- Dynamic property access in assertions — use bracket notation with string literals

### Post-Migration Verification (All Phases Complete)

```bash
# Full verification
npx tsc --noEmit && npm test && npm run test:integration

# Confirm no .js source files remain (except config, .cjs, fixtures)
find . -name '*.js' -not -path './node_modules/*' -not -path './frontend/dist/*' \
  -not -path './config/*' -not -path './.git/*' -not -name '*.cjs' \
  -not -path './tests/fixtures/test-repo/*' | sort

# Confirm no stale .d.ts files remain (except vite-env.d.ts)
find . -name '*.d.ts' -not -path './node_modules/*' -not -name 'vite-env.d.ts' | sort

# Confirm --strip-types works for entry points
node --strip-types api/server.ts --help 2>&1 | head -1

# Production smoke test
doppler run -- node --strip-types api/server.ts &
sleep 3
curl -f http://localhost:8080/health
kill %1
```

### Phase 7-10 Commit Strategy

**Phase 7** (4 commits):
1. scanners/ (5 files)
2. cache/ (3 files)
3. reports/ (4 files)
4. config/ + root (3 files)

**Phase 8** (4 commits):
5. Small workers (3 files)
6. Medium workers (3 files)
7. Large workers (3 files)
8. All pipeline runners (7 files)

**Phase 9** (3 commits):
9. Middleware (3 files)
10. WebSocket + utilities (3-4 files)
11. Routes + worker-registry + api/server.ts (5 files)

**Phase 10** (6 commits):
12. test-helpers + sidequest/utils (9 files)
13. tests/unit batch 1-2 (~22 files)
14. tests/unit batch 3-4 (~22 files)
15. tests/integration (~25 files)
16. tests/accuracy + tests/scripts (~17 files)
17. scripts/ (4 files)

Each commit: `npx tsc --noEmit && npm test`

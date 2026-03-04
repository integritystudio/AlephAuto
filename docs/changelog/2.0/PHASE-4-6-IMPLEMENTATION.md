# Phase 4-6: Data Layer, Git & Workflow, Core Server

## Phase 4: Data Layer (2 files, 1,171 lines)

### Migration Readiness Assessment

| File | Lines | JSDoc | Difficulty | Notes |
|------|------:|-------|------------|-------|
| `sidequest/core/database.js` | 961 | Good | Hard | better-sqlite3 types, 961 lines |
| `sidequest/core/job-repository.js` | 210 | Good | Medium | Thin wrapper over database |

### Per-File Instructions

#### database.js → database.ts

Largest core file. Uses better-sqlite3 (migrated from sql.js).

**Key interfaces to define:**

```typescript
import Database from 'better-sqlite3';

interface JobRow {
  id: string;
  pipeline_id: string;
  status: string;
  data: string;        // JSON string
  result: string | null;
  error: string | null;
  git: string | null;   // JSON string
  retry_count: number;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface ParsedJob {
  id: string;
  pipelineId: string;
  status: string;
  data: unknown;        // parsed JSON
  result: unknown;
  error: unknown;
  git: unknown;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface JobQueryOptions {
  status?: string;
  pipelineId?: string;
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDir?: 'ASC' | 'DESC';
}
```

**Strict mode fixes:**
- better-sqlite3 `Statement.get()` returns `unknown` — needs type assertions or generics
- JSON.parse calls: wrap with validation or cast to specific types
- Null handling: `completedAt`, `startedAt`, `result`, `error`, `git` are all nullable
- `db` instance: may be null before `initialize()` — use definite assignment assertion or lazy init pattern

**Strategy:** Use `Statement.get<T>()` generic from better-sqlite3 types:

```typescript
const stmt = db.prepare<[string], JobRow>('SELECT * FROM jobs WHERE id = ?');
const row: JobRow | undefined = stmt.get(jobId);
```

#### job-repository.js → job-repository.ts

Thin facade over database. Returns camelCase parsed objects.

```typescript
import { database } from './database.ts';
import type { ParsedJob, JobQueryOptions } from './database.ts';

class JobRepository {
  saveJob(job: ParsedJob): void { ... }
  getJob(id: string): ParsedJob | null { ... }
  getJobs(options?: JobQueryOptions): ParsedJob[] { ... }
  getJobCount(options?: { status?: string }): number { ... }
  deleteJob(id: string): boolean { ... }
}

export const jobRepository: JobRepository;
```

### Verification

```bash
npx tsc --noEmit
npm test
npm run test:integration   # database tests critical
```

---

## Phase 5: Git & Workflow (4 files, 2,046 lines)

### Migration Readiness Assessment

| File | Lines | JSDoc | Difficulty | Notes |
|------|------:|-------|------------|-------|
| `sidequest/core/git-workflow-manager.js` | 270 | Excellent | Easy | Thin wrapper over BranchManager |
| `sidequest/pipeline-core/git/branch-manager.js` | 489 | Excellent | Easy | Clear class, good JSDoc |
| `sidequest/pipeline-core/git/pr-creator.js` | 492 | Very Good | Medium | scanResult shape needs typing |
| `sidequest/pipeline-core/git/migration-transformer.js` | 799 | Excellent | Hard | Babel AST, @ts-ignore to remove |

### Migration Order

```
1. branch-manager.js      (no local deps)
2. git-workflow-manager.js (depends on branch-manager)
3. migration-transformer.js (standalone, Babel AST)
4. pr-creator.js           (depends on migration-transformer + branch-manager)
```

### Per-File Instructions

#### branch-manager.js → branch-manager.ts

```typescript
interface BranchManagerOptions {
  enablePrCreation?: boolean;
  maxBranchNameLength?: number;
  branchPrefix?: string;
}

interface JobBranchInfo {
  pipelineId: string;
  jobId: string;
  repositoryName?: string;
}

interface BranchResult {
  branchName: string;
  originalBranch: string;
  created: boolean;
}

export class BranchManager {
  constructor(options?: Partial<BranchManagerOptions>);
  async createJobBranch(repoPath: string, jobInfo: JobBranchInfo): Promise<BranchResult>;
  async commitChanges(repoPath: string, message: string, files?: string[]): Promise<void>;
  async pushBranch(repoPath: string, branchName: string): Promise<void>;
  async createPullRequest(repoPath: string, options: PROptions): Promise<string | null>;
  async cleanupBranch(repoPath: string, branchName: string): Promise<void>;
  async getCurrentBranch(repoPath: string): Promise<string>;
}
```

Strict mode fixes:
- `options = {}` → `options: Partial<BranchManagerOptions> = {}`
- Sentry span nullable: already safe with `?.`

#### git-workflow-manager.js → git-workflow-manager.ts

Thin delegation layer over BranchManager.

```typescript
interface MessageGenerator {
  generateCommitMessage(): string;
  generatePRContext(): PRContext;
}

interface GitInfo {
  branchName: string;
  originalBranch: string;
}

export class GitWorkflowManager {
  constructor(branchManager: BranchManager);
  async createJobBranch(repoPath: string, jobInfo: JobBranchInfo): Promise<BranchResult>;
  async executeWorkflow(
    repoPath: string,
    gitInfo: GitInfo,
    messageGenerator: MessageGenerator
  ): Promise<void>;
}
```

Delete `sidequest/core/server.d.ts` reference to GitWorkflowManager (deferred to Phase 6).

#### migration-transformer.js → migration-transformer.ts

**Hardest file in Phase 5.** Babel AST manipulation.

**Known issues:**
- Lines 25-26: ESM/CJS interop for Babel packages
  ```typescript
  // Fix: Use proper ESM imports with type assertions
  import * as _traverse from '@babel/traverse';
  import * as _generate from '@babel/generator';
  const traverse = (_traverse as any).default ?? _traverse;
  const generate = (_generate as any).default ?? _generate;
  // Or use: import traverse from '@babel/traverse';
  // (if esModuleInterop is enabled)
  ```

- Lines 462-466: `@ts-ignore` for Babel AST node mutations
  ```typescript
  // Replace @ts-ignore with proper Babel types:
  import type { NodePath, Node } from '@babel/traverse';
  import * as t from '@babel/types';

  // Use t.memberExpression() builder instead of manual construction:
  const newNode = t.memberExpression(
    t.identifier(objectName),
    t.identifier(propertyName)
  );
  path.replaceWith(newNode);
  ```

- `parseMigrationStep()` returns untyped object — needs discriminated union:
  ```typescript
  type MigrationStep =
    | { type: 'rename'; from: string; to: string }
    | { type: 'extract'; source: string; target: string }
    | { type: 'inline'; source: string }
    | { type: 'replace'; pattern: string; replacement: string };
  ```

**Dependencies:** Install `@types/babel__traverse`, `@types/babel__generator` if not present.

#### pr-creator.js → pr-creator.ts

```typescript
interface Suggestion {
  automated_refactor_possible: boolean;
  impact_score: number;
  target_location: string;
  migration_steps: MigrationStep[];
  // ... other fields from scan result
}

interface ScanResult {
  suggestions: Suggestion[];
  repositoryPath: string;
  scanId: string;
}

interface PRCreatorOptions {
  enablePrCreation?: boolean;
  maxPRsPerScan?: number;
  dryRun?: boolean;
}
```

Strict mode fixes:
- `scanResult.suggestions?.length` — add null guard
- Suggestion properties are snake_case (from DB/Python) — keep as-is or add camelCase interface

### Verification

```bash
npx tsc --noEmit
npm test
```

---

## Phase 6: Core Server (2 files, 1,012 lines) — HIGHEST RISK

### Migration Readiness Assessment

| File | Lines | JSDoc | Difficulty | Notes |
|------|------:|-------|------------|-------|
| `sidequest/core/server.js` | 847 | Good | **Hard** | Base class for ALL workers |
| `sidequest/core/index.js` | 198 | Good | Medium | Cron scheduler, optional |

### Risk Factors

- `server.js` is the base class for 10+ workers
- Type errors cascade to every worker in Phase 8
- Complex state machine: 5 job statuses, retry logic, event lifecycle
- Untyped `jobData` flows through entire system

### server.js → server.ts

**Core interfaces to define:**

```typescript
import { EventEmitter } from 'events';

// Job status lifecycle
type JobStatus = 'created' | 'queued' | 'running' | 'completed' | 'failed';

// Generic job data — workers specify their own
interface Job<TData = unknown, TResult = unknown> {
  id: string;
  pipelineId: string;
  status: JobStatus;
  data: TData;
  result: TResult | null;
  error: { message: string; stack?: string; code?: string } | null;
  git: GitJobInfo | null;
  retryCount: number;
  maxRetries: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  pausedAt?: string;
  cancelled?: boolean;
}

interface GitJobInfo {
  branchName: string;
  originalBranch: string;
  prUrl?: string;
}

// Constructor options
interface SidequestServerOptions {
  jobType: string;
  maxConcurrent?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  enableGitWorkflow?: boolean;
  enablePrCreation?: boolean;
  jobTimeoutMs?: number;
  processExistingOnStart?: boolean;
  autoCleanupMs?: number;
  description?: string;
  version?: string;
}

// Event map for typed EventEmitter
interface SidequestServerEvents {
  'job:created': (job: Job) => void;
  'job:started': (job: Job) => void;
  'job:completed': (job: Job) => void;
  'job:failed': (job: Job) => void;
  'retry:created': (job: Job) => void;
}
```

**Strict mode fixes (priority order):**

1. **Constructor `options`:** Type as `SidequestServerOptions`
   ```typescript
   constructor(options: SidequestServerOptions) {
     super();
     this.jobType = options.jobType;
     this.maxConcurrent = options.maxConcurrent ?? CONCURRENCY.DEFAULT_MAX_JOBS;
     // ...
   }
   ```

2. **`jobData` parameter:** Use generic `TData`
   ```typescript
   createJob(jobId: string, jobData: TData): Job<TData> { ... }
   ```

3. **`runJobHandler` abstract method:**
   ```typescript
   // Base class declares it, workers override:
   async runJobHandler(job: Job<TData>): Promise<TResult> {
     throw new Error('runJobHandler must be implemented by subclass');
   }
   ```

4. **`delete job.pausedAt`:** Mark `pausedAt` as optional in Job interface

5. **Error handling:** Cancelled job error needs discriminated type
   ```typescript
   interface CancelledError extends Error {
     cancelled: true;
   }
   ```

6. **EventEmitter typing:** Consider typed-emitter pattern
   ```typescript
   // Option A: Use declaration merging
   declare interface SidequestServer {
     on<K extends keyof SidequestServerEvents>(
       event: K, listener: SidequestServerEvents[K]
     ): this;
     emit<K extends keyof SidequestServerEvents>(
       event: K, ...args: Parameters<SidequestServerEvents[K]>
     ): boolean;
   }
   ```

**After migration:** Delete `sidequest/core/server.d.ts`.

### index.js → index.ts

Cron scheduler application entry point.

```typescript
import cron from 'node-cron';

interface CronConfig {
  schedule: string;
  enabled: boolean;
}

class RepomixCronApp {
  private worker: RepomixWorker;
  private scanner: DirectoryScanner;

  constructor();
  async runRepomixOnAllDirectories(): Promise<void>;
  private async waitForCompletion(jobIds: string[], timeoutMs: number): Promise<void>;
  start(): void;
}
```

Strict mode fixes:
- `job` type in event listeners — depends on `Job<T>` from server.ts
- `config` object property access — typed by Phase 2

### Verification (Critical)

```bash
npx tsc --noEmit            # All phases 1-6 should be clean
npm test                     # Unit tests
npm run test:integration     # Integration tests (database + server)
```

### Phase 4-6 Commit Strategy

1. **Commit 1:** Phase 4 — database.ts + job-repository.ts + types
2. **Commit 2:** Phase 5.1 — branch-manager.ts + git-workflow-manager.ts
3. **Commit 3:** Phase 5.2 — migration-transformer.ts (Babel AST, standalone)
4. **Commit 4:** Phase 5.3 — pr-creator.ts
5. **Commit 5:** Phase 6.1 — server.ts + delete server.d.ts (high risk — full test suite)
6. **Commit 6:** Phase 6.2 — index.ts (cron app)

Each commit: `npx tsc --noEmit && npm test`
Phase 4 and 6 also: `npm run test:integration`

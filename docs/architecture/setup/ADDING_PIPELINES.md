# Adding New Pipelines

Registers a new worker with the REST API, dashboard, git workflow, retry logic, and Sentry.

## Overview

Every pipeline needs three files plus an npm script:

```
sidequest/workers/<name>-worker.ts             # Worker (business logic)
sidequest/pipeline-runners/<name>-pipeline.ts  # Runner (CLI + scheduling)
api/utils/worker-registry.ts                   # Registry entry (API integration)
```

## Step 1: Create the Worker

**File:** `sidequest/workers/<name>-worker.ts` -- extend `SidequestServer`, implement `runJobHandler(job)`.

```typescript
import { SidequestServer } from '../core/server.ts';
import { createComponentLogger } from '../utils/logger.ts';
import { config } from '../core/config.ts';

const logger = createComponentLogger('MyNewWorker');

export class MyNewWorker extends SidequestServer {
  constructor(options = {}) {
    super({ ...options, jobType: 'my-new-pipeline' });
  }

  async runJobHandler(job) {
    const { someParam } = job.data;
    // ... do work ...
    return { status: 'completed', /* results */ };
  }

  createMyJob(params) {
    return this.createJob(`my-new-pipeline-${Date.now()}`, params);
  }
}
```

### Key Rules

| Rule | Correct | Wrong |
|------|---------|-------|
| Pass `jobType` to `super()` | `super({ ...options, jobType: 'x' })` | `super(options)` (defaults to `'job'`) |
| `createJob` takes 2 args | `this.createJob(jobId, data)` | `this.createJob({ data })` |
| Use config, not `process.env` | `config.homeDir` | `process.env.HOME` |
| Use `@shared/process-io` | `execCommand('cmd', args, { cwd })` | `spawn('cmd', args)` |
| Nullish coalescing for numerics | `options.limit ?? 10` | `options.limit \|\| 10` |
| Entry point guard | `isDirectExecution(import.meta.url)` | `` import.meta.url === `file://${process.argv[1]}` `` (fails under PM2) |

### Git Workflow

**Option A -- Single-commit (most pipelines):** Pass git options to `super()`. Base class handles branch/commit/push/PR automatically.

```typescript
super({
  ...options,
  jobType: 'my-pipeline',
  gitWorkflowEnabled: options.gitWorkflowEnabled ?? config.enableGitWorkflow,
  gitBranchPrefix: 'feat',
  gitBaseBranch: config.gitBaseBranch,
  gitDryRun: options.gitDryRun ?? config.gitDryRun,
});
```

Override `_generateCommitMessage(job)` and `_generatePRContext(job)` for custom messages. See `schema-enhancement-worker.ts`.

**Option B -- Multi-commit (advanced):** Disable base-class flow, use `BranchManager` directly. See `bugfix-audit-worker.ts`.

```typescript
import { BranchManager } from '../pipeline-core/git/branch-manager.ts';

constructor(options = {}) {
  super({ ...options, jobType: 'my-pipeline', gitWorkflowEnabled: false });
  this.branchManager = new BranchManager({
    baseBranch: config.gitBaseBranch,
    branchPrefix: 'my-prefix',
    dryRun: options.gitDryRun ?? config.gitDryRun,
  });
}

async runJobHandler(job) {
  const branchInfo = await this.branchManager.createJobBranch(repoPath, {
    jobId: job.id, jobType: 'my-pipeline',
  });
  // ... work + intermediate commits via this.branchManager.commitChanges() ...
  await this.branchManager.pushBranch(repoPath, branchInfo.branchName);
  await this.branchManager.createPullRequest(repoPath, { branchName: branchInfo.branchName, title: '...', body: '...' });
}
```

## Step 2: Create the Pipeline Runner

**File:** `sidequest/pipeline-runners/<name>-pipeline.ts` -- extend `BasePipeline` (10 of 11 pipelines use this).

Provides: `waitForCompletion()`, `scheduleCron()`, `setupDefaultEventListeners()`, `getStats()`.

```typescript
#!/usr/bin/env -S node --strip-types
import { MyNewWorker } from '../workers/my-new-worker.ts';
import { config } from '../core/config.ts';
import { CONCURRENCY, PROCESS } from '../core/constants.ts';
import { createComponentLogger, logStart } from '../utils/logger.ts';
import { BasePipeline } from './base-pipeline.ts';
import { isDirectExecution } from '../utils/execution-helpers.ts';

const logger = createComponentLogger('MyNewPipeline');

class MyNewPipeline extends BasePipeline<MyNewWorker> {
  constructor(options: Record<string, unknown> = {}) {
    super(new MyNewWorker({
      maxConcurrent: config.maxConcurrent ?? CONCURRENCY.DEFAULT_IO_BOUND,
      logDir: config.logDir,
      sentryDsn: config.sentryDsn,
      ...options,
    }));
    this.setupDefaultEventListeners(logger);
  }

  async run() {
    logStart(logger, 'my-new pipeline');
    // ... scan for targets, create jobs ...
    await this.waitForCompletion();
  }

  schedule(cronSchedule = '0 2 * * *') {
    return this.scheduleCron(logger, 'my-new pipeline', cronSchedule, () => this.run());
  }
}

if (isDirectExecution(import.meta.url)) {
  const args = process.argv.slice(PROCESS.ARGV_START);
  const pipeline = new MyNewPipeline();
  if (args.includes('--run-now')) {
    pipeline.run().then(() => process.exit(0)).catch(() => process.exit(1));
  } else {
    pipeline.schedule(args[args.indexOf('--schedule') + 1] ?? '0 2 * * *');
  }
}

export { MyNewPipeline };
```

**Reference runners:** `schema-enhancement-pipeline.ts` (Option A), `bugfix-audit-pipeline.ts` (Option B), `git-activity-pipeline.ts` (no git), `repo-cleanup-pipeline.ts` (dry-run).

## Step 3: Register in Worker Registry

**File:** `api/utils/worker-registry.ts`

```typescript
import { MyNewWorker } from '#sidequest/workers/my-new-worker.ts';

// Add to PIPELINE_CONFIGS:
'my-new-pipeline': {
  WorkerClass: MyNewWorker,
  getOptions: () => ({
    maxConcurrent: config.maxConcurrent ?? 3,
    logDir: config.logDir,
    sentryDsn: config.sentryDsn,
  })
},
```

This enables `GET /api/pipelines`, `POST /api/pipelines/my-new-pipeline/trigger`, `GET /api/pipelines/my-new-pipeline/jobs`, and dashboard visibility.

## Step 4: Add npm Scripts

**File:** `package.json` -- prefix all commands with `doppler run --`:

```json
"mypipeline:once": "doppler run -- node --strip-types sidequest/pipeline-runners/my-new-pipeline.ts --run-now",
"mypipeline:schedule": "doppler run -- node --strip-types sidequest/pipeline-runners/my-new-pipeline.ts --recurring"
```

For execution methods, shebangs, Doppler integration, and PM2 config, see [Pipeline Execution Runbook](../pipeline-execution.md).

## Step 5: Verify

```bash
npm run typecheck
npm test
doppler run -- npm run dashboard &
curl -s http://localhost:8080/api/pipelines | jq '.pipelines[]'
npm run mypipeline:once
```

## Checklist

- [ ] Worker extends `SidequestServer` with `jobType`; `createJob(jobId, data)` with 2 args
- [ ] No `process.env` (use `config.*`); no raw `spawn()` (use `@shared/process-io`)
- [ ] Runner extends `BasePipeline`; uses `scheduleCron()` and `waitForCompletion()`
- [ ] CLI entry point uses `isDirectExecution(import.meta.url)` guard
- [ ] Registered in `PIPELINE_CONFIGS`; npm scripts with `doppler run --` prefix
- [ ] `npm run typecheck` and `npm test` pass

## What You Get for Free

Registered pipelines automatically get: **Sentry** error tracking, **SQLite** job persistence (`GET /api/pipelines/:id/jobs`), **Dashboard** real-time status via WebSocket (with SQLite fallback after restart), **Pino** structured logging, **retry with circuit breaker** (retryable: ETIMEDOUT/5xx; non-retryable: ENOENT/4xx).

For error classification, retry logic, circuit breaker, and worker registry details, see [Error Handling](../ERROR_HANDLING.md).

## Reference

| Resource | Path |
|----------|------|
| Worker base class | `sidequest/core/server.ts` |
| Pipeline base class | `sidequest/pipeline-runners/base-pipeline.ts` |
| Branch manager | `sidequest/pipeline-core/git/branch-manager.ts` |
| Worker registry | `api/utils/worker-registry.ts` |
| Constants | `sidequest/core/constants.ts` |
| Config | `sidequest/core/config.ts` |
| Process IO | `packages/shared-process-io/src/index.ts` |
| Logger | `sidequest/utils/logger.ts` |
| Error classifier | `sidequest/pipeline-core/errors/error-classifier.ts` |
| Error handling & worker registry | `docs/architecture/ERROR_HANDLING.md` |

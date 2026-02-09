# Adding New Pipelines

Step-by-step guide for integrating a new job type into the AlephAuto framework. Following this process registers the worker with the REST API, makes it visible on the dashboard, and gives it git workflow support, retry logic, and Sentry reporting for free.

## Prerequisites

Familiarity with:
- `sidequest/core/server.js` — `SidequestServer` base class
- `sidequest/core/git-workflow-manager.js` — `GitWorkflowManager`
- `api/utils/worker-registry.js` — `PIPELINE_CONFIGS`

## Overview

Every pipeline consists of three files:

```
sidequest/workers/<name>-worker.js        # 1. Worker (business logic)
sidequest/pipeline-runners/<name>-pipeline.js  # 2. Pipeline runner (CLI + scheduling)
api/utils/worker-registry.js              # 3. Registry entry (API integration)
```

Plus an npm script entry in `package.json`.

## Step 1: Create the Worker

**File:** `sidequest/workers/<name>-worker.js`

Extend `SidequestServer` and implement `runJobHandler(job)`.

```javascript
import { SidequestServer } from '../core/server.js';
import { createComponentLogger, logError } from '../utils/logger.js';
import { config } from '../core/config.js';

const logger = createComponentLogger('MyNewWorker');

export class MyNewWorker extends SidequestServer {
  constructor(options = {}) {
    super({
      ...options,
      jobType: 'my-new-pipeline',   // Used in branch names and job IDs
    });
  }

  async runJobHandler(job) {
    const { someParam } = job.data;
    // ... do work ...
    return { status: 'completed', /* results */ };
  }

  createMyJob(params) {
    const jobId = `my-new-pipeline-${Date.now()}`;
    return this.createJob(jobId, params);
  }
}
```

### Key Rules

| Rule | Correct | Wrong |
|------|---------|-------|
| Pass `jobType` to `super()` | `super({ ...options, jobType: 'x' })` | `super(options)` (defaults to `'job'`) |
| `createJob` takes 2 args | `this.createJob(jobId, data)` | `this.createJob({ data })` |
| Use config, not `process.env` | `config.homeDir` | `process.env.HOME` |
| Use `@shared/process-io` for child processes | `execCommand('cmd', args, { cwd })` | `spawn('cmd', args)` |
| Use `??` for numeric defaults | `options.limit ?? 10` | `options.limit \|\| 10` |

### Choosing a Git Workflow Strategy

**Option A — Base-class single-commit (most pipelines):**
The base class creates a branch, runs `runJobHandler`, commits all changes, pushes, and creates a PR automatically.

```javascript
super({
  ...options,
  jobType: 'my-pipeline',
  gitWorkflowEnabled: options.gitWorkflowEnabled ?? config.enableGitWorkflow,
  gitBranchPrefix: 'feat',
  gitBaseBranch: config.gitBaseBranch,
  gitDryRun: options.gitDryRun ?? config.gitDryRun,
});
```

Override `_generateCommitMessage(job)` and `_generatePRContext(job)` to customise messages. See `schema-enhancement-worker.js` for an example.

**Option B — Manual multi-commit (advanced):**
Disable the base-class flow and instantiate `GitWorkflowManager` yourself. Use this when your pipeline makes multiple intermediate commits.

```javascript
import { GitWorkflowManager } from '../core/git-workflow-manager.js';

constructor(options = {}) {
  super({ ...options, jobType: 'my-pipeline', gitWorkflowEnabled: false });

  this.gitWorkflowManager = new GitWorkflowManager({
    baseBranch: config.gitBaseBranch,
    branchPrefix: 'my-prefix',
    dryRun: options.gitDryRun ?? config.gitDryRun,
  });
}

async runJobHandler(job) {
  const branchInfo = await this.gitWorkflowManager.createJobBranch(repoPath, {
    jobId: job.id, jobType: 'my-pipeline',
  });

  // ... stage 1 work ...
  await this.gitWorkflowManager.commitChanges(repoPath, {
    message: 'chore: stage 1 complete', jobId: job.id,
  });

  // ... stage 2 work ...
  await this.gitWorkflowManager.commitChanges(repoPath, {
    message: 'feat: stage 2 complete', jobId: job.id,
  });

  await this.gitWorkflowManager.pushBranch(repoPath, branchInfo.branchName);
  await this.gitWorkflowManager.createPullRequest(repoPath, {
    branchName: branchInfo.branchName,
    title: 'My PR title',
    body: 'PR body',
  });
}
```

See `bugfix-audit-worker.js` for a full example of Option B.

## Step 2: Create the Pipeline Runner

**File:** `sidequest/pipeline-runners/<name>-pipeline.js`

The pipeline runner wraps the worker with event logging, polling, cron scheduling, and a CLI entry point.

```javascript
#!/usr/bin/env node
import { MyNewWorker } from '../workers/my-new-worker.js';
import { config } from '../core/config.js';
import { TIMEOUTS } from '../core/constants.js';
import { createComponentLogger, logError, logStart } from '../utils/logger.js';
import cron from 'node-cron';

const logger = createComponentLogger('MyNewPipeline');

class MyNewPipeline {
  constructor(options = {}) {
    this.worker = new MyNewWorker({
      maxConcurrent: options.maxConcurrent ?? 3,
      logDir: config.logDir,
      sentryDsn: config.sentryDsn,
      ...options,
    });
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.worker.on('job:created', (job) => {
      logger.info({ jobId: job.id }, 'Job created');
    });
    this.worker.on('job:completed', (job) => {
      logger.info({ jobId: job.id }, 'Job completed');
    });
    this.worker.on('job:failed', (job) => {
      logError(logger, /** @type {Error} */ (job.error), 'Job failed', { jobId: job.id });
    });
  }

  async run() {
    logStart(logger, 'my-new pipeline');
    // ... scan for targets, create jobs via this.worker.createMyJob() ...
    await this.waitForCompletion();
  }

  async waitForCompletion() {
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        const stats = this.worker.getStats();
        if (stats.active === 0 && stats.queued === 0) {
          clearInterval(interval);
          resolve();
        }
      }, TIMEOUTS.POLL_INTERVAL_MS);
    });
  }

  schedule(cronSchedule = '0 2 * * *') {
    if (!cron.validate(cronSchedule)) {
      throw new Error(`Invalid cron schedule: ${cronSchedule}`);
    }
    cron.schedule(cronSchedule, () => this.run().catch(e => logError(logger, e, 'Scheduled run failed')));
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const pipeline = new MyNewPipeline();

  if (args.includes('--run-now')) {
    pipeline.run()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  } else {
    const schedule = args[args.indexOf('--schedule') + 1] ?? '0 2 * * *';
    pipeline.schedule(schedule);
  }
}

export { MyNewPipeline };
```

### Existing pipeline runners for reference

| Pipeline | Runner | Notes |
|----------|--------|-------|
| schema-enhancement | `schema-enhancement-pipeline.js` | Single-commit git workflow (Option A) |
| bugfix-audit | `bugfix-audit-pipeline.js` | Multi-commit git workflow (Option B) |
| git-activity | `git-activity-pipeline.js` | No git workflow |
| repo-cleanup | `repo-cleanup-pipeline.js` | Dry-run support |

## Step 3: Register in Worker Registry

**File:** `api/utils/worker-registry.js`

1. Add the import at the top of the file:

```javascript
import { MyNewWorker } from '../../sidequest/workers/my-new-worker.js';
```

2. Add an entry to `PIPELINE_CONFIGS` (before `'test-refactor'`):

```javascript
'my-new-pipeline': {
  WorkerClass: MyNewWorker,
  getOptions: () => ({
    maxConcurrent: config.maxConcurrent || 3,
    logDir: config.logDir,
    sentryDsn: config.sentryDsn,
  })
},
```

This enables:
- `GET /api/pipelines` — lists your pipeline
- `POST /api/pipelines/my-new-pipeline/trigger` — creates a job via API
- `GET /api/pipelines/my-new-pipeline/jobs` — query job history
- Dashboard visibility via the activity feed

## Step 4: Add npm Scripts

**File:** `package.json`

Follow the existing naming convention (`namespace:action`):

```json
"mypipeline:once": "doppler run -- node sidequest/pipeline-runners/my-new-pipeline.js --run-now",
"mypipeline:schedule": "doppler run -- node sidequest/pipeline-runners/my-new-pipeline.js --recurring"
```

All commands must be prefixed with `doppler run --` to inject secrets.

## Step 5: Verify

```bash
# Type checking — must pass clean
npm run typecheck

# Unit tests — all existing tests must still pass
npm test

# Confirm registry recognition (start API, then query)
doppler run -- npm run dashboard &
curl -s http://localhost:8080/api/pipelines | jq '.pipelines[]'
# Should include "my-new-pipeline"

# Run your pipeline
npm run mypipeline:once
```

## Checklist

- [ ] Worker extends `SidequestServer` with `jobType` set
- [ ] `createJob()` called with 2 args: `(jobId, data)`
- [ ] No direct `process.env` access — use `config.*`
- [ ] No raw `spawn()` — use `execCommand` from `@shared/process-io`
- [ ] Pipeline runner has CLI entry point with `import.meta.url` guard
- [ ] Cron scheduling validates with `cron.validate()`
- [ ] `waitForCompletion()` uses `TIMEOUTS.POLL_INTERVAL_MS`
- [ ] Registered in `PIPELINE_CONFIGS` in `worker-registry.js`
- [ ] npm scripts added to `package.json` with `doppler run --` prefix
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes (0 failures)

## Observability

Pipelines registered in the worker registry automatically get:

- **Sentry** — error tracking, breadcrumbs on branch/PR creation, job lifecycle events
- **SQLite persistence** — job history queryable via `GET /api/pipelines/:id/jobs`
- **Dashboard** — real-time status via WebSocket activity feed
- **Structured logging** — Pino logger with component context (`createComponentLogger`)
- **Retry with circuit breaker** — retryable errors (ETIMEDOUT, 5xx) auto-retry; non-retryable (ENOENT, 4xx) fail immediately

If OpenTelemetry is configured, traces and metrics export to the configured collector (see `sidequest/core/config.js` for endpoint settings).

## Reference

| Resource | Path |
|----------|------|
| Base class | `sidequest/core/server.js` |
| Git workflow manager | `sidequest/core/git-workflow-manager.js` |
| Worker registry | `api/utils/worker-registry.js` |
| Constants | `sidequest/core/constants.js` |
| Config | `sidequest/core/config.js` |
| Process IO | `packages/shared-process-io/src/index.js` |
| Logger | `sidequest/utils/logger.js` |
| Error classifier | `sidequest/pipeline-core/errors/error-classifier.js` |
| Worker registry architecture | `docs/architecture/WORKER_REGISTRY.md` |
| Error handling architecture | `docs/architecture/ERROR_HANDLING.md` |

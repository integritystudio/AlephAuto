# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**AlephAuto** - Job queue framework with real-time dashboard for automation pipelines.

11 pipelines: Duplicate Detection (JS+Python), Schema Enhancement, Git Activity Reporter, Repository Cleanup, Repomix, Codebase Health, Dashboard Populate, Bugfix Audit, Gitignore Update, Plugin Management, Test Refactor.

## Quick Reference

```bash
# Development
doppler run -- npm start                   # Server
npm run dashboard                          # Dashboard UI → http://localhost:8080
npm run build:frontend                     # Build React dashboard

# Testing
npm test                                   # Unit tests
npm run test:integration                   # Integration tests
npm run typecheck                          # TypeScript checks

# Production
doppler run -c prd -- pm2 start config/ecosystem.config.cjs
./scripts/deploy-traditional-server.sh --update
```

## Code Quality Standards

- Cyclomatic Complexity: ≤10 | Cognitive Complexity: ≤15 | Function Length: ≤50 lines | Nesting Depth: ≤4
- **NEVER** use `eval()` or `new Function()` with dynamic input
- Use `createTempRepository()` from test fixtures (never hardcode `/tmp/` paths)
- Run `npm test && npm run test:integration && npm run typecheck` before PRs

## Critical Patterns

### 1. Doppler Required for ALL Commands
```bash
doppler run -- node api/server.js        # Correct
node api/server.js                        # Wrong - secrets won't load
```

### 2. Configuration: NEVER use process.env directly
```typescript
import { config } from './sidequest/core/config.ts';
const port = config.jobsApiPort;          // Correct
const port = process.env.JOBS_API_PORT;   // Wrong
```

### 3. Type Validation: Zod + TypeScript inference
```typescript
export const MySchema = z.object({ ... });
export type MyType = z.infer<typeof MySchema>;  // Correct - no duplication
```

### 4. Nullish Coalescing for Numeric Options
```javascript
const limit = options.limit ?? 10;        // Correct - preserves 0
const limit = options.limit || 10;        // Wrong - 0 becomes 10
```

### 5. Error Handling: Always Use Optional Chaining
```javascript
const errorCode = error?.code ?? 'UNKNOWN';     // Correct
const errorCode = error.code;                   // Wrong - throws if null
```

### 6. Port Conflicts: Use Port Manager
```javascript
import { setupServerWithPortFallback } from './api/utils/port-manager.js';
```

### 7. Database Access: Use JobRepository
```javascript
import { jobRepository } from './sidequest/core/job-repository.js';
await jobRepository.saveJob(job);           // Correct - never import from database.js directly
const job = jobRepository.getJob(id);       // Returns parsed camelCase: { pipelineId, createdAt, ... }
const count = jobRepository.getJobCount({ status });  // Efficient COUNT(*) query
```
**Important:** Repository methods return **camelCase** objects with parsed JSON fields (`data`, `result`, `error`, `git`). Never access `job.pipeline_id` or `job.created_at` — use `job.pipelineId`, `job.createdAt`.

### 8. Constants: No Magic Numbers
```typescript
import { TIMEOUTS, RETRY, CONCURRENCY, TIME, CACHE } from './sidequest/core/constants.ts';
const timeout = TIMEOUTS.PYTHON_PIPELINE_MS;     // Correct
const oneDay = TIME.DAY;                          // Correct
```

Available groups: `TIMEOUTS`, `RETRY`, `CONCURRENCY`, `PAGINATION`, `VALIDATION`, `PORT`, `CACHE`, `WEBSOCKET`, `WORKER_COOLDOWN`, `RATE_LIMIT`, `LIMITS`, `TIME`

### 9. Git Operations: Use GitWorkflowManager
```javascript
this.gitWorkflowManager.createJobBranch(repoPath, jobInfo);  // Correct
this.branchManager.createJobBranch(repoPath, jobInfo);       // Wrong
```

### 10. API Error Responses: Use ApiError Utilities
```javascript
import { sendError, sendNotFoundError } from '../utils/api-error.js';
sendError(res, 'INVALID_REQUEST', 'Missing field', 400);     // Correct
res.status(400).json({ error: 'Missing field' });            // Wrong
```

### 11. Input Validation: Validate Job IDs and Pagination
```javascript
import { VALIDATION, PAGINATION } from './sidequest/core/constants.js';
if (!VALIDATION.JOB_ID_PATTERN.test(jobId)) { ... }
const limit = Math.min(limit, PAGINATION.MAX_LIMIT);         // max 1000
```

## Architecture

### Multi-Language Pipeline (JS ↔ Python)
```
JavaScript (Stages 1-2)          Python (Stages 3-7)
├── Repository scanning          ├── Code block extraction
├── Pattern detection            ├── Semantic annotation
└── candidates.json → stdout     ├── Similarity calculation
         │                       ├── Duplicate grouping
         └─── JSON stdin/stdout ─┘── Report generation
```

### Job Queue Framework
```
SidequestServer (Base — sidequest/core/server.ts)
├── Event-driven lifecycle: created → queued → running → completed/failed
├── Concurrency control (default: 5, via CONCURRENCY.DEFAULT_MAX_JOBS)
├── Auto-retry with error classification (retryable: ETIMEDOUT, 5xx; non-retryable: ENOENT, 4xx)
├── Sentry integration
├── GitWorkflowManager for branch/commit/PR operations
├── JobRepository for SQLite persistence
└── Centralized config via sidequest/core/config.ts

BasePipeline<TWorker> (sidequest/pipeline-runners/base-pipeline.ts)
├── Shared base for class-based pipeline runners (5 of 11 pipelines)
├── waitForCompletion() — polls worker stats until queue drains
├── scheduleCron() — validate + schedule + log + error-wrap
└── getStats() — delegates to worker.getStats(): JobStats
```

### Type System Flow
```
api/types/*.ts (Zod schemas) → api/middleware/validation.js → api/routes/*.ts (type-safe handlers)
```

## Environment Variables (Doppler)

**Project:** `bottleneck` | **Environments:** `dev`, `prd`

Key variables: `JOBS_API_PORT` (8080), `SENTRY_DSN`, `ENABLE_GIT_WORKFLOW`, `ENABLE_PR_CREATION`

## Directory Structure

```
├── api/                    # REST API + WebSocket (36 endpoints)
│   ├── routes/            # jobs, scans, pipelines, reports, repositories
│   ├── types/             # Zod schemas
│   ├── middleware/        # Auth, validation, rate-limit
│   └── utils/             # Port manager, worker registry, API error helpers
├── frontend/              # React dashboard (Vite + TypeScript)
├── sidequest/             # Job queue framework
│   ├── core/              # server.ts, job-repository, git-workflow, constants, config
│   ├── pipeline-core/     # Scan orchestrator, similarity (Python)
│   ├── pipeline-runners/  # 11 pipeline entry points + base-pipeline.ts
│   └── workers/           # 10 worker implementations (all extend SidequestServer)
├── packages/              # pnpm workspace packages
│   ├── shared-logging/    # @shared/logging (Pino)
│   └── shared-process-io/ # @shared/process-io (child process utils)
├── tests/                 # Unit, integration, accuracy tests
├── scripts/               # Deploy, config monitoring, health checks
├── config/                # PM2 ecosystem config (.cjs)
├── cloudflare-workers/    # Edge worker (n0ai-proxy)
├── data/                  # SQLite database (runtime)
└── logs/                  # Runtime logs (gzipped)
```

## Key Files

| Purpose | File |
|---------|------|
| Pipeline coordinator | `sidequest/pipeline-core/scan-orchestrator.ts` |
| Feature extraction | `sidequest/pipeline-core/similarity/structural.py:29` |
| Base job queue | `sidequest/core/server.ts` |
| Base pipeline runner | `sidequest/pipeline-runners/base-pipeline.ts` |
| Job repository | `sidequest/core/job-repository.js` |
| Git workflow manager | `sidequest/core/git-workflow-manager.js` |
| Constants | `sidequest/core/constants.ts` |
| Job status types | `api/types/job-status.ts` |
| Error classifier | `sidequest/pipeline-core/errors/error-classifier.js` |
| Worker registry | `api/utils/worker-registry.js` |
| Port manager | `api/utils/port-manager.js` |
| API error utilities | `api/utils/api-error.js` |
| Test helpers | `tests/fixtures/test-helpers.js` |

## Shared Packages

- **@shared/process-io** - `captureProcessOutput(proc)`, `execCommand(cmd, args, opts)`, `runCommand(cwd, cmd, args)`
- **@shared/logging** - Pino-based logging

---

**Version:** 1.10.0 | **Updated:** 2026-02-25 | **Status:** Production Ready

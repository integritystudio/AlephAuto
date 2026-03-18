# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**AlephAuto** - Job queue framework with real-time dashboard for automation pipelines.

11 logical pipelines: Duplicate Detection (pure TS), Schema Enhancement, Git Activity Reporter (pure TS), Repository Cleanup, Repomix, Claude Health, Dashboard Populate, Bugfix Audit, Gitignore Update, Plugin Management, Test Refactor.

All 11 pipelines have `*-pipeline.ts` runner scripts in `pipeline-runners/`. Repomix also uses direct worker registration via `worker-registry.ts` (independent of the runner).

## Efficient read operations
[file tree w/ token count](docs/repomix/token-tree.txt)
lossless codebase packed at docs/repomix/repomix.xml
compressed, loss-y codebase packed at docs/repomix/repo-compressed.xml


## Quick Reference

file tree with token count at docs/

```bash
# Development
npm start                                  # Server (reads .env in dev)
npm run dashboard                          # Dashboard UI → http://localhost:8080
npm run build:frontend                     # Build React dashboard

# Testing
npm test                                   # Unit tests
npm run test:integration                   # Integration tests
npm run test:all:core                      # Core Node suites (SKIP_ENV_SENSITIVE_TESTS=1)
npm run test:all:env                       # Env-sensitive suites requiring host capabilities
npm run test:all:full                      # Core + env-sensitive suites
npm run typecheck                          # TypeScript checks

# Utilities (pass flags directly)
npm run logs:cleanup                       # Flags: --dry-run, --verbose
npm run verify:bugfixes                    # Flags: --pre, --post, --health, --smoke

# Production
doppler run -c prd -- pm2 start config/ecosystem.config.cjs
./scripts/deploy/deploy-traditional-server.sh --update
```

## Code Quality Standards

- Cyclomatic Complexity: ≤10 | Cognitive Complexity: ≤15 | Function Length: ≤50 lines | Nesting Depth: ≤4
- **NEVER** use `eval()` or `new Function()` with dynamic input
- Use `createTempRepository()` from test fixtures (never hardcode `/tmp/` paths)
- Run `npm run test:all:core && npm run typecheck` before PRs; on host-capable environments, also run `npm run test:all:full`

## Critical Patterns

### 1. Environment Configuration
- **Dev**: Use `.env` file directly — `npm start` loads it automatically
- **Production**: Use Doppler — `doppler run -- node --strip-types api/server.ts`
```bash
npm start                                          # Dev - reads .env
doppler run -- node --strip-types api/server.ts    # Production - reads Doppler
```

### 2. Configuration: NEVER use process.env directly
```typescript
import { config } from './sidequest/core/config.ts';
const port = config.apiPort;              // Correct
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
import { setupServerWithPortFallback } from './api/utils/port-manager.ts';
```

### 7. Database Access: Use JobRepository
```javascript
import { jobRepository } from './sidequest/core/job-repository.ts';
await jobRepository.saveJob(job);           // Correct - never import from database.ts directly
const job = jobRepository.getJob(id);       // Returns parsed camelCase: { pipelineId, createdAt, ... }
const count = jobRepository.getJobCount({ status });  // Efficient COUNT(*) query
```
**Important:** Repository methods return **camelCase** objects with parsed JSON fields (`data`, `result`, `error`, `git`). Never access `job.pipeline_id` or `job.created_at` — use `job.pipelineId`, `job.createdAt`.

### 8. Constants: No Magic Numbers
```typescript
import { TIMEOUTS, RETRY, CONCURRENCY, DURATION_MS, CACHE } from './sidequest/core/constants.ts';
const timeout = TIMEOUTS.REPOMIX_MS;              // Correct
const oneDay = DURATION_MS.DAY;                   // Correct
```

Available groups: `TIMEOUTS`, `RETRY`, `CONCURRENCY`, `PAGINATION`, `VALIDATION`, `PORT`, `CACHE`, `WEBSOCKET`, `WORKER_COOLDOWN`, `RATE_LIMIT`, `LIMITS`, `DURATION_MS`

### 9. Git Operations: Use BranchManager
```javascript
this.branchManager.createJobBranch(repoPath, jobInfo);  // Correct
```

### 10. API Error Responses: Use ApiError Utilities
```javascript
import { sendError, sendNotFoundError } from '../utils/api-error.ts';
sendError(res, 'INVALID_REQUEST', 'Missing field', 400);     // Correct
res.status(400).json({ error: 'Missing field' });            // Wrong
```

### 11. Input Validation: Validate Job IDs and Pagination
```javascript
import { VALIDATION, PAGINATION } from './sidequest/core/constants.ts';
if (!VALIDATION.JOB_ID_PATTERN.test(jobId)) { ... }
const limit = Math.min(limit, PAGINATION.MAX_LIMIT);         // max 1000
```

## Architecture

### Duplicate Detection Pipeline (pure TypeScript)
```
TypeScript (Stages 1-2)          TypeScript (Stages 3-6)        TypeScript (Stage 7)
├── Repository scanning          ├── Code block extraction      └── Report generation
├── Pattern detection            ├── Semantic annotation            (HTML/JSON/Markdown
└── candidates → in-process      ├── Similarity calculation          via ReportCoordinator)
                                 └── Duplicate grouping
```

### Job Queue Framework
```
SidequestServer extends EventEmitter (sidequest/core/server.ts)
├── Event-driven lifecycle: created → queued → running → completed/failed
├── Concurrency control (default: 5, via CONCURRENCY.DEFAULT_MAX_JOBS)
├── Auto-retry with error classification (retryable: ETIMEDOUT, 5xx; non-retryable: ENOENT, 4xx)
├── Sentry tracing wraps every executeJob
├── Git branch setup before execution, commit/PR on success (non-blocking)
├── JobRepository for PostgreSQL persistence (lazy-init singleton)
└── Centralized config via sidequest/core/config.ts

BasePipeline<TWorker> (sidequest/pipeline-runners/base-pipeline.ts)
├── Shared base for class-based pipeline runners (5 of 11 pipelines)
├── waitForCompletion() — polls worker stats until queue drains
├── scheduleCron() — validate + schedule + log + error-wrap
└── getStats() — delegates to worker.getStats(): JobStats
```

### Constants Hierarchy
```
units.ts (primitives: TIME_MS, SECONDS, BYTES, PERCENTILE)
  └→ constants.ts (domain: TIMEOUTS, RETRY, CONCURRENCY, VALIDATION, DATABASE, JOB_EVENTS, ...)
       └→ config.ts (runtime: env parsing with safeParseInt clamping, validateConfig() at startup)
```

### Core Dependency Flow
```
units.ts → constants.ts → config.ts ← server.ts → job-repository.ts → database.ts (pg)
                                          ↓
                                   BranchManager (pipeline-core/git/branch-manager.ts)
```

### Type System Flow
```
api/types/*.ts (Zod schemas) → api/middleware/validation.ts → api/routes/*.ts (type-safe handlers)
```

## Environment Variables (Doppler)

**Project:** `integrity-studio` | **Environments:** `dev`, `prd`

Key variables: `JOBS_API_PORT` (8080), `SENTRY_DSN`, `ENABLE_GIT_WORKFLOW`, `ENABLE_PR_CREATION`

## Directory Structure

```
├── api/                    # REST API + WebSocket (23 endpoints)
│   ├── routes/            # jobs, scans, pipelines, reports, repositories
│   ├── types/             # Zod schemas
│   ├── middleware/        # Auth, validation, rate-limit
│   └── utils/             # Port manager, worker registry, API error helpers
├── frontend/              # React dashboard (Vite + TypeScript)
├── sidequest/             # Job queue framework
│   ├── core/              # server.ts, database, job-repository, config, constants, units
│   ├── pipeline-core/     # Scan orchestrator, similarity, extractors, reports
│   ├── pipeline-runners/  # 11 pipeline entry points + base-pipeline.ts
│   └── workers/           # 10 worker implementations (Plugin Management worker lives in utils/)
├── packages/              # pnpm workspace packages
│   ├── shared-logging/    # @shared/logging (Pino)
│   └── shared-process-io/ # @shared/process-io (child process utils)
├── tests/                 # Unit, integration, accuracy tests
├── scripts/               # Deploy, config monitoring, health checks
├── config/                # PM2 ecosystem config (.cjs)
├── cloudflare-workers/    # Edge worker (n0ai-proxy)
├── data/                  # Runtime data
└── logs/                  # Runtime logs (gzipped)
```

## Key Files

| Purpose | File |
|---------|------|
| Pipeline coordinator | `sidequest/pipeline-core/scan-orchestrator.ts` |
| Structural similarity | `sidequest/pipeline-core/similarity/structural.ts` |
| Base job queue | `sidequest/core/server.ts` |
| Base pipeline runner | `sidequest/pipeline-runners/base-pipeline.ts` |
| PostgreSQL persistence | `sidequest/core/database.ts` |
| Job repository (facade) | `sidequest/core/job-repository.ts` |
| Centralized config | `sidequest/core/config.ts` |
| Domain constants | `sidequest/core/constants.ts` |
| Primitive units | `sidequest/core/units.ts` |
| Score thresholds | `sidequest/core/score-thresholds.ts` |
| Branch manager | `sidequest/pipeline-core/git/branch-manager.ts` |
| Job status types | `api/types/job-status.ts` |
| Error classifier | `sidequest/pipeline-core/errors/error-classifier.ts` |
| Worker registry | `api/utils/worker-registry.ts` |
| Port manager | `api/utils/port-manager.ts` |
| API error utilities | `api/utils/api-error.ts` |
| Test helpers | `tests/fixtures/test-helpers.ts` |

## Shared Packages

- **@shared/process-io** - `captureProcessOutput(proc)`, `execCommand(cmd, args, opts)`, `runCommand(cwd, cmd, args)`
- **@shared/logging** - Pino-based logging

---

**Version:** 2.3.29 | **Updated:** 2026-03-15 | **Status:** Production Ready

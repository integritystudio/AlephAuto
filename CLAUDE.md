# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**AlephAuto** - Job queue framework with real-time dashboard for automation pipelines:

1. **Duplicate Detection** - 7-stage pipeline (JS stages 1-2, Python stages 3-7)
2. **Doc Enhancement** - Schema.org structured data injection
3. **Git Activity Reporter** - Weekly/monthly reports
4. **Repository Cleanup** - Automated cleanup of venvs, build artifacts
5. **Dashboard UI** - Real-time monitoring (WebSocket + REST API)

## Quick Reference

| Task | Command |
|------|---------|
| Run duplicate detection | `doppler run -- RUN_ON_STARTUP=true node sidequest/pipeline-runners/duplicate-detection-pipeline.js` |
| Test routes | `npm run test:integration` |
| Dashboard | `npm run dashboard` → http://localhost:8080 |
| Deploy | `./scripts/deploy-traditional-server.sh --update` |
| Type check | `npm run typecheck` |

## Code Quality Standards

### Complexity Limits (Enforced by CI)
- Cyclomatic Complexity: ≤10
- Cognitive Complexity: ≤15
- Function Length: ≤50 lines
- Nesting Depth: ≤4 levels

### Security (Blocked by pre-commit)
- **NEVER** use `eval()` or `new Function()` with dynamic input
- Validate all user input at system boundaries
- Use parameterized queries for database access

### Testing
- Use `createTempRepository()` from test fixtures (never hardcode `/tmp/` paths)
- Run `npm run test:integration` before PRs
- All new features require unit tests

## Critical Patterns

### 1. Doppler Required for ALL Commands
```bash
doppler run -- node api/server.js        # Correct
node api/server.js                        # Wrong - secrets won't load
```

### 2. Configuration: NEVER use process.env directly
```javascript
import { config } from './sidequest/config.js';
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
const actualPort = await setupServerWithPortFallback(httpServer, { preferredPort: 8080 });
```

### 7. Database Access: Use JobRepository
```javascript
import { jobRepository } from './sidequest/core/job-repository.js';
await jobRepository.saveJob(job);           // Correct
import { saveJob } from './sidequest/core/database.js';  // Wrong - use repository
```

### 8. Constants: No Magic Numbers
```javascript
import { TIMEOUTS, RETRY, CONCURRENCY } from './sidequest/core/constants.js';
const timeout = TIMEOUTS.PYTHON_PIPELINE_MS;     // Correct (600000ms)
const timeout = 600000;                           // Wrong - magic number
```

### 9. Git Operations: Use GitWorkflowManager
```javascript
// In SidequestServer subclasses:
this.gitWorkflowManager.createJobBranch(repoPath, jobInfo);  // Correct
this.branchManager.createJobBranch(repoPath, jobInfo);       // Wrong - use wrapper
```

### 10. API Error Responses: Use ApiError Utilities
```javascript
import { sendError, sendNotFoundError } from '../utils/api-error.js';
sendError(res, 'INVALID_REQUEST', 'Missing field', 400);     // Correct
res.status(400).json({ error: 'Missing field' });            // Wrong - inconsistent format
```

### 11. Input Validation: Validate Job IDs and Pagination
```javascript
import { VALIDATION, PAGINATION } from './sidequest/core/constants.js';
if (!VALIDATION.JOB_ID_PATTERN.test(jobId)) { ... }          // Correct
const limit = Math.min(limit, PAGINATION.MAX_LIMIT);         // Correct (max 1000)
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

**Key Files:**
- `sidequest/pipeline-core/scan-orchestrator.ts` - Pipeline coordinator
- `sidequest/pipeline-core/similarity/structural.py:231` - Feature extraction (critical)

### Job Queue Framework
```
SidequestServer (Base)
├── Event-driven lifecycle: created → queued → running → completed/failed
├── Concurrency control (default: 5, via CONCURRENCY.DEFAULT_MAX_JOBS)
├── Sentry integration
├── Auto-retry with circuit breaker (retryable: ETIMEDOUT, 5xx; non-retryable: ENOENT, 4xx)
├── GitWorkflowManager for branch/commit/PR operations
├── JobRepository for database persistence
└── Centralized config via sidequest/core/config.js
```

### Type System Flow
```
api/types/*.ts (Zod schemas) → api/middleware/validation.js → api/routes/*.ts (type-safe handlers)
```

## Commands

```bash
# Development
doppler run -- npm start        # Server
npm run dashboard               # Dashboard UI

# Testing
npm test                        # Unit tests
npm run test:integration        # Integration tests
npm run typecheck               # TypeScript checks

# Production
doppler run -c prd -- pm2 start config/ecosystem.config.cjs
./scripts/deploy-traditional-server.sh --update
```

## Environment Variables (Doppler)

**Project:** `bottleneck` | **Environments:** `dev`, `prd`

```bash
doppler setup --project bottleneck --config dev   # Development
doppler setup --project bottleneck --config prd   # Production
```

**Key variables:** `JOBS_API_PORT` (8080), `SENTRY_DSN`, `ENABLE_GIT_WORKFLOW`, `ENABLE_PR_CREATION`

## Directory Structure

```
├── api/                    # REST API + WebSocket
│   ├── routes/            # Endpoint handlers
│   ├── types/             # Zod schemas (job-status.ts, etc.)
│   ├── utils/             # Worker registry, port manager
│   └── middleware/        # Validation
├── sidequest/             # Job queue framework
│   ├── core/              # server.js, job-repository.js, git-workflow-manager.js, constants.js
│   ├── workers/           # Worker implementations
│   └── pipeline-core/     # Business logic, scan orchestrator
├── public/                # Dashboard UI
├── tests/                 # Unit, integration, accuracy tests
└── config/                # PM2, ecosystem configs
```

## Key Files

| Purpose | File |
|---------|------|
| Pipeline coordinator | `sidequest/pipeline-core/scan-orchestrator.ts` |
| Base job queue | `sidequest/core/server.js` |
| Job repository | `sidequest/core/job-repository.js` |
| Git workflow manager | `sidequest/core/git-workflow-manager.js` |
| Constants | `sidequest/core/constants.js` |
| Job status types | `api/types/job-status.ts` |
| Error classifier | `sidequest/pipeline-core/errors/error-classifier.js` |
| Worker registry | `api/utils/worker-registry.js` |
| Port manager | `api/utils/port-manager.js` |
| API error utilities | `api/utils/api-error.js` |
| Test helpers | `tests/fixtures/test-helpers.js` |

## Documentation

- `docs/API_REFERENCE.md` - REST API (22 endpoints)
- `docs/MCP_SERVERS.md` - MCP server configuration (Sentry, Redis, etc.)
- `docs/architecture/SYSTEM-DATA-FLOW.md` - Complete system architecture and data flow
- `docs/architecture/ERROR_HANDLING.md` - Retry logic, circuit breaker
- `docs/architecture/TYPE_SYSTEM.md` - Zod + TypeScript patterns
- `docs/runbooks/pipeline-execution.md` - Pipeline execution patterns, PM2/Doppler
- `docs/runbooks/troubleshooting.md` - Debugging guide

## Contributing

1. Create feature branch from `main`
2. Follow code quality standards (complexity ≤10, no eval())
3. Run tests: `npm test && npm run test:integration && npm run typecheck`
4. Submit PR with clear description

---

**Version:** 1.8.1 | **Updated:** 2026-01-30 | **Status:** Production Ready

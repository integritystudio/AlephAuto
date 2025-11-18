# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Automation pipelines built on **AlephAuto** job queue framework with real-time dashboard:

1. **Duplicate Detection** - 7-stage pipeline (JS stages 1-2, Python stages 3-7) using ast-grep + structural similarity
2. **Doc Enhancement** - Schema.org structured data injection
3. **Git Activity Reporter** - Weekly/monthly reports with visualizations
4. **Gitignore Manager** - Batch `.gitignore` updates
5. **Repomix Automation** - Automated repomix file generation
6. **Plugin Manager** - Claude Code plugin audit
7. **Claude Health Monitor** - Environment health checks
8. **Dashboard UI** - Real-time monitoring (WebSocket + REST API)

## Quick Reference

| Task | Solution |
|------|----------|
| Run duplicate detection | `doppler run -- RUN_ON_STARTUP=true node pipelines/duplicate-detection-pipeline.js` |
| Test routes | `npm run test:integration` - See tests/README.md |
| Fix type errors | Use TypeScript Type Validator skill (auto-activates) |
| Debug issues | Check Sentry dashboard + `logs/` directory |
| Type validation | Zod schemas in `api/types/` - See docs/TYPE_SYSTEM.md |
| Error handling | See docs/ERROR_HANDLING.md (auto-retry with circuit breaker) |
| Deploy | `./scripts/deploy-traditional-server.sh --update` (PM2 + Doppler) |
| Dashboard | `npm run dashboard` → http://localhost:8080 |

## Critical Patterns & Gotchas

### 1. Doppler Required for ALL Commands
```bash
# ✅ Correct
doppler run -- node api/server.js

# ❌ Wrong - secrets won't load
node api/server.js
```

### 2. Configuration: NEVER use process.env directly
```javascript
// ✅ Correct
import { config } from './sidequest/config.js';
const port = config.jobsApiPort;

// ❌ Wrong
const port = process.env.JOBS_API_PORT;
```

### 3. Test Fixtures: NEVER hardcode /tmp/ paths
```javascript
// ✅ Correct
import { createTempRepository } from '../tests/fixtures/test-helpers.js';
const testRepo = await createTempRepository({ name: 'test-repo' });
const repoPath = testRepo.path; // Use this

// ❌ Wrong - blocked by pre-commit hook
const repoPath = '/tmp/test-repo';
```

### 4. Nullish Coalescing for Numeric Options
```javascript
// ✅ Correct - preserves 0 as valid value
const limit = options.limit ?? 10;

// ❌ Wrong - 0 becomes 10
const limit = options.limit || 10;
```

### 5. Field Names: CodeBlock uses `tags`, NOT `semantic_tags`
```python
# ✅ Correct
block = CodeBlock(tags=["database"], ...)

# ❌ Wrong
block = CodeBlock(semantic_tags=["database"], ...)
```

### 6. Two-Phase Similarity: Extract features BEFORE normalization
See `lib/similarity/structural.py:231` - feature extraction must happen on original code.

### 7. Port: Use JOBS_API_PORT (8080), NOT API_PORT
Migration complete but docs may reference old `API_PORT` variable.

### 8. Type Validation: Use Zod + TypeScript inference
```typescript
// ✅ Correct
export const MySchema = z.object({ ... });
export type MyType = z.infer<typeof MySchema>;

// ❌ Wrong - manual duplication
export const MySchema = z.object({ ... });
export type MyType = { ... }; // Duplicates schema
```

## Architecture: Big Picture

### Multi-Language Pipeline (JavaScript ↔ Python)

The duplicate detection pipeline crosses language boundaries via stdin/stdout:

```
┌─────────────────────────────────────────────────────────┐
│ JavaScript (Stages 1-2)                                 │
│  - Repository scanning (repomix)                        │
│  - Pattern detection (ast-grep)                         │
│  - Output: candidates.json → stdout                     │
└───────────────────┬─────────────────────────────────────┘
                    │ JSON via stdin/stdout
┌───────────────────▼─────────────────────────────────────┐
│ Python (Stages 3-7)                                     │
│  - Code block extraction (Pydantic models)              │
│  - Semantic annotation                                  │
│  - 2-phase similarity (Levenshtein + structural)        │
│  - Duplicate grouping                                   │
│  - Consolidation suggestions                            │
│  - Report generation                                    │
└─────────────────────────────────────────────────────────┘
```

**Key Files:**
- `lib/scan-orchestrator.js` - Coordinates entire pipeline
- `lib/extractors/extract_blocks.py` - Python entry point
- `lib/similarity/structural.py` - Similarity algorithm (line 231 critical)

### AlephAuto Job Queue Framework

All pipelines extend `SidequestServer` base class:

```
SidequestServer (Base)
├── Event-driven job lifecycle: created → queued → running → completed/failed
├── Concurrency control (default: 3 concurrent jobs)
├── Sentry integration (error tracking + performance)
├── Automatic retry with circuit breaker
│   ├── Retryable: ETIMEDOUT, 5xx, network issues
│   ├── Non-retryable: ENOENT, 4xx, permission errors
│   └── Max 2 attempts (configurable), exponential backoff
└── Centralized config via sidequest/config.js

Workers (extend SidequestServer):
├── RepomixWorker
├── SchemaEnhancementWorker
├── GitActivityWorker
├── GitignoreWorker
├── PluginManagerWorker
└── DuplicateDetectionWorker
```

**Why this matters:**
- All workers share retry logic - understand `SidequestServer` to understand error handling everywhere
- Event emitters enable real-time dashboard updates
- Sentry captures errors at 3 severity levels (see docs/ERROR_HANDLING.md)

### Type System: Zod → TypeScript Flow

```
┌──────────────────────────────────────┐
│ api/types/*.ts                       │
│ - Define Zod schemas                 │
│ - Infer TypeScript types             │
│ - Export both                        │
└────────────┬─────────────────────────┘
             │
             ▼
┌──────────────────────────────────────┐
│ api/middleware/validation.js         │
│ - validateRequest(schema)            │
│ - Returns 400 on validation error    │
│ - Attaches validated data to req.*   │
└────────────┬─────────────────────────┘
             │
             ▼
┌──────────────────────────────────────┐
│ api/routes/*.ts                      │
│ - Type-safe handlers                 │
│ - req.validatedQuery, req.body       │
│ - No manual validation needed        │
└──────────────────────────────────────┘
```

**Pattern:**
1. Define schema once in `api/types/`
2. Use `z.infer<>` to get TypeScript type (no duplication)
3. Middleware validates automatically
4. Route handlers get type-safe data

### Dashboard: WebSocket + REST API

```
┌──────────────────────────────────────┐
│ Client (public/dashboard.js)         │
└────────┬──────────────┬──────────────┘
         │              │
         │ WebSocket    │ REST API
         │ (real-time)  │ (polling/actions)
         │              │
┌────────▼──────────────▼──────────────┐
│ api/server.js                        │
│ - Express routes (REST)              │
│ - WebSocket server (real-time)       │
│ - Broadcasts job events              │
└────────┬─────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│ Workers (emit events)                │
│ - job:created, job:completed, etc.   │
│ - Server broadcasts to all clients   │
└──────────────────────────────────────┘
```

**Why WebSocket + REST?**
- WebSocket: Real-time job updates without polling
- REST: Initial data fetch, manual actions (trigger pipeline)

## Commands

### Development
```bash
doppler run -- npm start        # Repomix cron server
npm run dev                     # Dev with auto-restart
npm run dashboard               # Dashboard UI (port 8080)

# Pipelines (on-demand)
npm run docs:enhance            # Doc enhancement
npm run git:weekly              # Git activity
npm run plugin:audit            # Plugin audit
npm run claude:health           # Health check
npm run gitignore:update        # Gitignore updates
```

### Testing
```bash
npm test                        # Unit tests
npm run test:integration        # Integration tests
npm run test:validate-paths     # Validate no hardcoded /tmp/ paths
npm run typecheck               # TypeScript checks
```

### Production Deployment
```bash
# Using PM2 + Doppler
doppler run -- pm2 start ecosystem.config.cjs
pm2 save
pm2 status

# Using deployment script
./scripts/deploy-traditional-server.sh --setup    # Initial
./scripts/deploy-traditional-server.sh --update   # Updates
./scripts/deploy-traditional-server.sh --rollback # Rollback
```

## Environment Variables (Doppler)

**Project:** `bottleneck`

**Switch environments:**
```bash
doppler setup --project bottleneck --config dev   # Development
doppler setup --project bottleneck --config prd   # Production
```

**Key variables:**
- `NODE_ENV` - development/production
- `JOBS_API_PORT` - API server port (8080)
- `REDIS_HOST` / `REDIS_PORT` - Redis connection
- `SENTRY_DSN` / `SENTRY_ENVIRONMENT` - Error tracking
- `CRON_SCHEDULE` - Duplicate detection (default: 0 2 * * *)
- `ENABLE_PR_CREATION` - Auto-PR for duplicates (false by default)

See ecosystem.config.cjs for full list with defaults.

## Directory Structure (Key Paths)

```
jobs/
├── api/                    # REST API + WebSocket + Static files
│   ├── server.js          # Main server entry point
│   ├── routes/            # API route handlers
│   ├── types/             # Zod schemas + TypeScript types
│   └── middleware/        # Validation, auth, etc.
├── lib/                   # Core business logic
│   ├── scan-orchestrator.js    # 7-stage pipeline coordinator
│   ├── similarity/        # Duplicate detection algorithms (Python)
│   ├── git/              # PR creation
│   └── caching/          # Redis caching
├── sidequest/            # AlephAuto framework
│   ├── server.js        # Base job queue (ALL workers extend this)
│   ├── config.js        # Centralized configuration
│   └── *-worker.js      # Specific worker implementations
├── pipelines/            # Pipeline entry points
├── public/               # Dashboard UI (HTML/CSS/JS)
├── tests/                # Tests (unit, integration, accuracy)
│   ├── fixtures/        # Test helpers (createTempRepository)
│   └── README.md        # Test infrastructure guide
├── docs/                 # Documentation
│   ├── ERROR_HANDLING.md  # Retry logic (837 lines)
│   ├── TYPE_SYSTEM.md     # Type validation (600+ lines)
│   └── SESSION_HISTORY.md # Development log
└── ecosystem.config.cjs  # PM2 production config
```

## Key Implementation Files

**Pipeline Coordination:**
- `lib/scan-orchestrator.js` - Orchestrates 7-stage duplicate detection
- `lib/similarity/structural.py:231` - Critical feature extraction point

**Type Safety:**
- `api/types/scan-requests.ts` - Scan endpoint schemas
- `api/types/pipeline-requests.ts` - Pipeline endpoint schemas
- `api/middleware/validation.js` - Request validation middleware

**Job Queue:**
- `sidequest/server.js` - Base job queue (retry logic, events)
- `sidequest/config.js` - Centralized configuration
- `lib/errors/error-classifier.js` - Auto-classify retryable errors

**Dashboard:**
- `public/dashboard.js` - Client-side controller
- `api/websocket.js` - WebSocket event broadcasting
- `public/index.html` - UI with pipeline details panel

**Testing:**
- `tests/fixtures/test-helpers.js` - createTempRepository() and utilities
- `tests/README.md` - Test infrastructure guide
- `.husky/pre-commit` - Validates no hardcoded /tmp/ paths

**Deployment:**
- `ecosystem.config.cjs` - PM2 configuration (2 apps)
- `scripts/deploy-traditional-server.sh` - Deployment automation

## Breaking Changes & Migrations

**v1.2.0 - Test Path Migration**
- **Old:** Hardcoded `/tmp/test-repo` paths
- **New:** Use `createTempRepository()` from `tests/fixtures/test-helpers.js`
- **Enforcement:** Pre-commit hook blocks `/tmp/` in tests

**v1.1.0 - Port Migration**
- **Old:** `API_PORT` env variable
- **New:** `JOBS_API_PORT` (default: 8080)
- **Impact:** Update all environment configurations

## Documentation

**Comprehensive guides:**
- `docs/ERROR_HANDLING.md` - Retry logic, circuit breaker, Sentry integration
- `docs/TYPE_SYSTEM.md` - Zod + TypeScript validation patterns
- `tests/README.md` - Test infrastructure, fixtures, pre-commit hooks
- `docs/DEPLOYMENT.md` - Deployment options
- `docs/TRADITIONAL_SERVER_DEPLOYMENT.md` - PM2 + Nginx setup
- `docs/DASHBOARD.md` - Dashboard features and API
- `docs/SESSION_HISTORY.md` - Development changelog

**Quick references:**
- `docs/CHEAT_SHEET.md` - Command reference
- `docs/DATAFLOW_DIAGRAMS.md` - Mermaid architecture diagrams

## Recent Major Changes

**v1.4.0 (Current) - Pipeline Details Panel**
- Interactive job details panel with WebSocket updates
- Type-safe API endpoints (`GET /api/pipelines/:id/jobs`)
- WCAG 2.1 Level AA compliant UI
- 19/19 type validation tests passing

**v1.3.0 - Production Deployment**
- PM2 ecosystem configuration (2 apps: dashboard + worker)
- Doppler `prd` environment configured
- Traditional server deployment (no Docker/Railway)
- GitHub Actions CI/CD

**v1.2.0 - Retry Logic & Test Infrastructure**
- Intelligent retry with circuit breaker
- Test fixtures system (createTempRepository)
- Pre-commit path validation
- Auto-PR creation for duplicates

---

**Version:** 1.4.0
**Last Updated:** 2025-11-18
**Status:** Production Ready (PM2 + Doppler deployment)
**Environment:** macOS with traditional server stack

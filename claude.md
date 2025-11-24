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
| Enable auto PRs | Set `ENABLE_GIT_WORKFLOW=true` in Doppler - See Git Workflow section |

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
├── SchemaEnhancementWorker (✓ Git workflow enabled)
├── GitActivityWorker
├── GitignoreWorker (⚠️ Git workflow not supported - batch operations)
├── PluginManagerWorker
└── DuplicateDetectionWorker (✓ Has custom PR creator)
```

**Why this matters:**
- All workers share retry logic - understand `SidequestServer` to understand error handling everywhere
- Event emitters enable real-time dashboard updates
- Sentry captures errors at 3 severity levels (see docs/ERROR_HANDLING.md)

### Git Workflow Automation

The AlephAuto framework supports automated branch creation and PR generation for workers that modify code:

```
Job Execution with Git Workflow:

1. Job Created (queued)
2. Job Started (running)
   ↓
3. Create Branch (automated/<job-type>/<description>-<timestamp>)
   ↓
4. Execute Job Handler (worker-specific logic)
   ↓
5. Detect Changes (git status)
   ├─ No changes → Cleanup branch, complete job
   └─ Changes detected ↓
6. Commit Changes (with job context)
   ↓
7. Push Branch (to origin)
   ↓
8. Create Pull Request (with detailed description)
   ↓
9. Job Completed (PR URL in job.git.prUrl)

On Error: Cleanup branch, return to original branch
```

**Configuration:**

```bash
# Enable git workflow (default: false)
ENABLE_GIT_WORKFLOW=true

# Base branch for PRs (default: main)
GIT_BASE_BRANCH=main

# Branch prefix (default: automated)
GIT_BRANCH_PREFIX=automated

# Dry run mode - create branches but skip push/PR (default: false)
GIT_DRY_RUN=true
```

**Implementation Pattern:**

```javascript
// Enable git workflow in worker constructor
export class MyWorker extends SidequestServer {
  constructor(options = {}) {
    super({
      ...options,
      jobType: 'my-worker',
      gitWorkflowEnabled: config.enableGitWorkflow,
      gitBranchPrefix: 'feature',
      gitBaseBranch: config.gitBaseBranch,
      gitDryRun: config.gitDryRun
    });
  }

  // Customize commit message (optional)
  async _generateCommitMessage(job) {
    return {
      title: 'feat: automated improvements',
      body: 'Detailed description of changes'
    };
  }

  // Customize PR description (optional)
  async _generatePRContext(job) {
    return {
      branchName: job.git.branchName,
      title: 'PR title',
      body: '## Summary\n\nDetailed PR description',
      labels: ['automated', 'enhancement']
    };
  }
}
```

**Job Metadata (job.git):**

```javascript
{
  branchName: 'automated/schema-enhancement-README-1234567890',
  originalBranch: 'main',
  commitSha: 'abc123...',
  prUrl: 'https://github.com/user/repo/pull/42',
  changedFiles: ['README.md', 'package.json']
}
```

**Workers with Git Workflow:**

1. **SchemaEnhancementWorker** ✓
   - Branch prefix: `docs`
   - Commits: Schema.org structured data additions
   - PR labels: `documentation`, `seo`, `schema-org`, `automated`
   - Includes impact analysis in PR description

2. **DuplicateDetectionWorker** ⚠️
   - Has custom `PRCreator` (lib/git/pr-creator.js)
   - Uses `ENABLE_PR_CREATION` env variable
   - Creates PRs for consolidation suggestions
   - Not using base class git workflow (legacy implementation)

3. **GitignoreWorker** ⚠️
   - Not supported - processes multiple repositories per job
   - Each repository would need individual PRs
   - Consider refactoring to one-repo-per-job pattern

**Customization:**

Override these methods in your worker:

```javascript
// Commit message generation
async _generateCommitMessage(job) {
  return {
    title: 'commit title',
    body: 'commit description'
  };
}

// PR context generation
async _generatePRContext(job) {
  return {
    branchName: job.git.branchName,
    title: 'PR title',
    body: 'PR description (supports markdown)',
    labels: ['label1', 'label2']
  };
}
```

**Key Files:**

- `lib/git/branch-manager.js` - Git operations (branch, commit, push, PR)
- `sidequest/server.js` - Base class with git workflow integration
- `sidequest/config.js` - Git workflow configuration

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

**Git Workflow variables:**
- `ENABLE_GIT_WORKFLOW` - Enable automated branch/PR creation (false by default)
- `GIT_BASE_BRANCH` - Base branch for PRs (default: main)
- `GIT_BRANCH_PREFIX` - Branch prefix (default: automated)
- `GIT_DRY_RUN` - Skip push/PR creation (false by default)

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
- `sidequest/server.js` - Base job queue (retry logic, events, git workflow)
- `sidequest/config.js` - Centralized configuration
- `lib/errors/error-classifier.js` - Auto-classify retryable errors

**Git Workflow:**
- `lib/git/branch-manager.js` - Branch creation, commit, push, PR creation
- `lib/git/pr-creator.js` - Legacy PR creator for duplicate detection
- `sidequest/doc-enhancement/schema-enhancement-worker.js` - Example with git workflow

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

**v1.5.0 (Current) - Git Workflow Automation**
- Automated branch creation and PR generation for workers
- BranchManager utility for git operations (branch, commit, push, PR)
- Integrated into SidequestServer base class
- SchemaEnhancementWorker enabled with custom commit/PR messages
- Configuration via `ENABLE_GIT_WORKFLOW`, `GIT_BASE_BRANCH`, `GIT_BRANCH_PREFIX`
- Job metadata tracking (branchName, commitSha, prUrl, changedFiles)
- Dry run mode for testing without push/PR

**v1.4.0 - Pipeline Details Panel**
- Interactive job details panel with WebSocket updates
- Type-safe API endpoints (`GET /api/pipelines/:id/jobs`)
- WCAG 2.1 Level AA compliant UI (focus return, aria-live on job lists)
- 19/19 type validation tests passing
- Sentry v8 span.setStatus() API compatibility fixes

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

**Version:** 1.5.1
**Last Updated:** 2025-11-23
**Status:** Production Ready (PM2 + Doppler deployment)
**Environment:** macOS with traditional server stack

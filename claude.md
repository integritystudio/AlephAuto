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
8. **Test Refactor Pipeline** - Automated test suite modularization and utility generation
9. **Repository Cleanup** - Automated cleanup of Python venvs, build artifacts, temp files
10. **Dashboard UI** - Real-time monitoring (WebSocket + REST API)

## Quick Reference

| Task | Solution |
|------|----------|
| Run duplicate detection | `doppler run -- RUN_ON_STARTUP=true node sidequest/pipeline-runners/duplicate-detection-pipeline.js` |
| Test routes | `npm run test:integration` - See tests/README.md |
| Fix type errors | Use TypeScript Type Validator skill (auto-activates) |
| Debug issues | Check Sentry dashboard + `logs/` directory |
| Type validation | Zod schemas in `api/types/` - See docs/architecture/TYPE_SYSTEM.md |
| Error handling | See docs/architecture/ERROR_HANDLING.md (auto-retry with circuit breaker) |
| Deploy | `./scripts/deploy-traditional-server.sh --update` (PM2 + Doppler) |
| Verify deployment | `npm run verify:bugfixes` - See docs/deployment/BUGFIX_VERIFICATION.md |
| Dashboard | `npm run dashboard` → http://localhost:8080 |
| Enable auto PRs | Set `ENABLE_GIT_WORKFLOW=true` in Doppler - See Git Workflow section |
| API Reference | See `docs/API_REFERENCE.md` for complete endpoint documentation |
| Pipeline docs | Dashboard → "Pipeline Data Flow" tab for architecture diagrams |
| Cleanup repository | `npm run cleanup:once` (run now), `npm run cleanup:dryrun` (preview) |

## Critical Patterns & Gotchas

### 1. Cloudflare Tunnel: Automated File Sync
```
IMPORTANT: The api/routes/ subdirectory contains files for a Cloudflare secure tunnel into another application.

Files that are automatically synced:
- api/middleware/validation.js ↔ api/routes/middleware/validation.js
- api/routes/pipelines.js ↔ api/routes/routes/pipelines.js

Automation:
- Pre-commit hook: Automatically checks files are in sync before commit
- Manual sync: npm run sync:cloudflare
- Check sync: npm run sync:cloudflare:check
- Script: scripts/sync-cloudflare-tunnel-files.js

The sync script automatically adjusts import paths:
- Adds extra '../' level for sidequest imports
- Adjusts relative imports (./scans.js → ../scans.js)
- Ensures TypeScript type checking passes

When editing source files (api/middleware/, api/routes/pipelines.js):
1. Make changes to source file
2. Pre-commit hook will verify sync before allowing commit
3. If out of sync, run: npm run sync:cloudflare
```

### 2. Doppler Required for ALL Commands
```bash
# ✅ Correct
doppler run -- node api/server.js

# ❌ Wrong - secrets won't load
node api/server.js
```

### 3. Configuration: NEVER use process.env directly
```javascript
// ✅ Correct
import { config } from './sidequest/config.js';
const port = config.jobsApiPort;

// ❌ Wrong
const port = process.env.JOBS_API_PORT;
```

### 4. Test Fixtures: NEVER hardcode /tmp/ paths
```javascript
// ✅ Correct
import { createTempRepository } from '../tests/fixtures/test-helpers.js';
const testRepo = await createTempRepository({ name: 'test-repo' });
const repoPath = testRepo.path; // Use this

// ❌ Wrong - blocked by pre-commit hook
const repoPath = '/tmp/test-repo';
```

### 5. Nullish Coalescing for Numeric Options
```javascript
// ✅ Correct - preserves 0 as valid value
const limit = options.limit ?? 10;

// ❌ Wrong - 0 becomes 10
const limit = options.limit || 10;
```

### 6. Field Names: CodeBlock uses `tags`, NOT `semantic_tags`
```python
# ✅ Correct
block = CodeBlock(tags=["database"], ...)

# ❌ Wrong
block = CodeBlock(semantic_tags=["database"], ...)
```

### 7. Two-Phase Similarity: Extract features BEFORE normalization
See `sidequest/pipeline-core/similarity/structural.py:231` - feature extraction must happen on original code.

### 8. Port: Use JOBS_API_PORT (8080), NOT API_PORT
Migration complete but docs may reference old `API_PORT` variable.

### 9. Type Validation: Use Zod + TypeScript inference
```typescript
// ✅ Correct
export const MySchema = z.object({ ... });
export type MyType = z.infer<typeof MySchema>;

// ❌ Wrong - manual duplication
export const MySchema = z.object({ ... });
export type MyType = { ... }; // Duplicates schema
```

### 10. Pipeline Execution: Doppler + Explicit Node.js Interpreter
```bash
# ✅ Correct - explicit interpreter prevents "fork/exec permission denied"
doppler run -- node sidequest/pipeline-runners/duplicate-detection-pipeline.js

# ✅ Correct - PM2 with interpreter: 'node' in ecosystem.config.cjs
doppler run -- pm2 start ecosystem.config.cjs

# ❌ Wrong - Doppler cannot execute JS files directly (permission denied)
doppler run -- sidequest/pipeline-runners/duplicate-detection-pipeline.js

# ❌ Wrong - missing secrets, will fail
node sidequest/pipeline-runners/duplicate-detection-pipeline.js
```
**Critical:** Always use `doppler run -- node <script>` NOT `doppler run -- <script>`.
See `docs/runbooks/pipeline-execution.md` for troubleshooting guide.

### 11. Port Conflicts: Use Port Manager Utility
```javascript
// ✅ Correct - automatic fallback to 8081-8090
import { setupServerWithPortFallback } from './api/utils/port-manager.js';
const actualPort = await setupServerWithPortFallback(httpServer, {
  preferredPort: 8080,
  maxPort: 8090
});

// ❌ Wrong - crashes on EADDRINUSE
httpServer.listen(8080);
```

### 12. Null-Safe Error Handling: Always Use Optional Chaining
```javascript
// ✅ Correct - safe against null/undefined
const errorCode = error?.code ?? 'UNKNOWN';
const errorMessage = error?.message || 'Unknown error';

// ❌ Wrong - throws TypeError if error is null
const errorCode = error.code;
const errorMessage = error.message;
```

### 13. Activity Feed: Nested Try-Catch for Error Handlers
```javascript
// ✅ Correct - error handler failures are caught
worker.on('job:failed', (job, error) => {
  try {
    this.addActivity({ ... });
  } catch (activityError) {
    logger.error({ activityError }, 'Failed to handle job:failed');
    Sentry.captureException(activityError);
  }
});

// ❌ Wrong - error handler failure crashes application
worker.on('job:failed', (job, error) => {
  this.addActivity({ ... }); // If this throws, event handler fails
});
```

### 14. Job Details Modal: Always Return Schema-Compliant Fields
```javascript
// ✅ Correct - only return fields defined in JobDetailsSchema
function formatJobFromDb(job) {
  const formatted = {
    id: job.id,
    pipelineId: job.pipelineId,
    status: job.status,
    startTime: job.startedAt || job.createdAt
  };

  // Add optional fields conditionally
  if (job.completedAt) formatted.endTime = job.completedAt;
  if (job.data) formatted.parameters = job.data;

  return formatted;
}

// ❌ Wrong - includes extra fields that violate strict schema
function formatJobFromDb(job) {
  return {
    ...job,
    createdAt: job.createdAt,  // Not in schema
    error: job.error,          // Not in schema (should be in result.error)
    git: job.git               // Not in schema
  };
}
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
- `sidequest/pipeline-core/scan-orchestrator.ts` - Coordinates entire pipeline
- `sidequest/pipeline-core/extractors/extract_blocks.py` - Python entry point
- `sidequest/pipeline-core/similarity/structural.py` - Similarity algorithm (line 231 critical)

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
- Sentry captures errors at 3 severity levels (see docs/architecture/ERROR_HANDLING.md)

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
   - Has custom `PRCreator` (sidequest/pipeline-core/git/pr-creator.js)
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

- `sidequest/pipeline-core/git/branch-manager.js` - Git operations (branch, commit, push, PR)
- `sidequest/core/server.js` - Base class with git workflow integration
- `sidequest/core/config.js` - Git workflow configuration

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
npm run cleanup:once            # Repository cleanup (run now)
npm run cleanup:dryrun          # Repository cleanup preview
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

### Deployment Verification
```bash
# Full verification suite (all checks)
npm run verify:bugfixes

# Individual check suites
npm run verify:bugfixes:pre      # Pre-deployment checks (before deploy)
npm run verify:bugfixes:post     # Post-deployment verification (after deploy)
npm run verify:bugfixes:health   # Health checks (endpoints, dependencies)
npm run verify:bugfixes:smoke    # Smoke tests (end-to-end)

# Create rollback script
./scripts/verify-bugfixes.sh --rollback

# See full guide
# docs/deployment/BUGFIX_VERIFICATION.md
# docs/deployment/VERIFICATION_QUICK_REFERENCE.md
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

**Repository Cleanup variables:**
- `CLEANUP_CRON_SCHEDULE` - Cleanup schedule (default: "0 3 * * 0" - Weekly Sunday 3 AM)
- `CLEANUP_TARGET_DIR` - Directory to clean (default: ~/code)
- `CLEANUP_DRY_RUN` - Preview mode without actual deletion (false by default)

See ecosystem.config.cjs for full list with defaults.

## Directory Structure (Key Paths)

```
jobs/
├── api/                    # REST API + WebSocket + Static files
│   ├── server.js          # Main server entry point
│   ├── routes/            # API route handlers
│   │   ├── pipelines.js   # Pipeline job history (SQLite-backed)
│   │   └── inventory.js   # Code inventory endpoints (NEW in v1.6.5)
│   ├── types/             # Zod schemas + TypeScript types
│   └── middleware/        # Validation, auth, etc.
├── sidequest/            # AlephAuto framework + pipeline core
│   ├── core/            # Framework core (server.js, config.js, index.js)
│   ├── workers/         # Worker implementations (*-worker.js)
│   ├── utils/           # Utilities (logger, directory-scanner, plugin-manager)
│   ├── pipeline-runners/  # Pipeline entry points
│   ├── doc-enhancement/ # Schema.org enhancement worker
│   └── pipeline-core/   # Core business logic
│       ├── scan-orchestrator.ts  # 7-stage pipeline coordinator
│       ├── similarity/    # Duplicate detection algorithms (Python)
│       ├── git/          # PR creation, branch management
│       └── cache/        # Redis caching
├── public/               # Dashboard UI (HTML/CSS/JS)
│   ├── dashboard.js     # Client-side controller (NEW: report links)
│   ├── dashboard.css    # Styling (NEW: improved modal UX)
│   └── index.html       # UI with pipeline details + docs tab (NEW)
├── tests/                # Tests (unit, integration, accuracy)
│   ├── fixtures/        # Test helpers (createTempRepository)
│   └── README.md        # Test infrastructure guide
├── docs/                 # Documentation
│   ├── architecture/     # Architecture docs
│   │   └── pipeline-data-flow.md  # Comprehensive workflow diagrams (UPDATED)
│   ├── dashboard_ui/     # Dashboard docs
│   ├── deployment/       # Deployment guides
│   │   ├── CI_CD_UPDATES.md         # CI/CD enhancements (NEW)
│   │   └── CI_CD_CROSS_PLATFORM_AUDIT.md  # Cross-platform audit (NEW)
│   └── runbooks/         # Operational runbooks
└── ecosystem.config.cjs  # PM2 production config
```

## Key Implementation Files

**Pipeline Coordination:**
- `sidequest/pipeline-core/scan-orchestrator.ts` - Orchestrates 7-stage duplicate detection
- `sidequest/pipeline-core/similarity/structural.py:231` - Critical feature extraction point

**Type Safety:**
- `api/types/scan-requests.ts` - Scan endpoint schemas
- `api/types/pipeline-requests.ts` - Pipeline endpoint schemas
- `api/middleware/validation.js` - Request validation middleware

**Job Queue:**
- `sidequest/core/server.js` - Base job queue (retry logic, events, git workflow)
- `sidequest/core/config.js` - Centralized configuration
- `sidequest/pipeline-core/errors/error-classifier.js` - Auto-classify retryable errors

**Error Handling & Resilience:**
- `sidequest/pipeline-core/doppler-health-monitor.js` - Circuit breaker for Doppler cache staleness
- `api/utils/port-manager.js` - Port conflict resolution and graceful shutdown
- `api/activity-feed.js` - Null-safe error handling in event handlers

**Git Workflow:**
- `sidequest/pipeline-core/git/branch-manager.js` - Branch creation, commit, push, PR creation
- `sidequest/pipeline-core/git/pr-creator.js` - Legacy PR creator for duplicate detection
- `sidequest/doc-enhancement/schema-enhancement-worker.js` - Example with git workflow

**Dashboard:**
- `public/dashboard.js` - Client-side controller (updated v1.6.5)
- `api/websocket.js` - WebSocket event broadcasting
- `public/index.html` - UI with pipeline details panel + documentation tab (updated v1.6.5)

**Testing:**
- `tests/fixtures/test-helpers.js` - createTempRepository() and utilities
- `tests/README.md` - Test infrastructure guide
- `.husky/pre-commit` - Validates no hardcoded /tmp/ paths

**Deployment:**
- `ecosystem.config.cjs` - PM2 configuration (2 apps)
- `scripts/deploy-traditional-server.sh` - Deployment automation

## Breaking Changes & Migrations

**v1.6.5 - Pipeline API Schema Enforcement**
- **Old:** API returned extra fields (createdAt, error, git) in job responses
- **New:** Strict schema validation - only JobDetailsSchema fields returned
- **Impact:** Frontend should not rely on undocumented fields
- **Migration:** Update any code expecting `createdAt`, top-level `error`, or `git` fields

**v1.2.0 - Test Path Migration**
- **Old:** Hardcoded `/tmp/test-repo` paths
- **New:** Use `createTempRepository()` from `tests/fixtures/test-helpers.js`
- **Enforcement:** Pre-commit hook blocks `/tmp/` in tests

**v1.1.0 - Port Migration**
- **Old:** `API_PORT` env variable
- **New:** `JOBS_API_PORT` (default: 8080)
- **Impact:** Update all environment configurations

## Documentation

**Architecture guides:**
- `docs/architecture/ERROR_HANDLING.md` - Retry logic, circuit breaker, Sentry integration, Doppler monitoring, port management, null-safe patterns
- `docs/architecture/TYPE_SYSTEM.md` - Zod + TypeScript validation patterns
- `docs/architecture/pipeline-data-flow.md` - **UPDATED v1.6.5** - Comprehensive workflow diagrams for all 9 pipelines
- `docs/architecture/CACHE_TESTING.md` - Redis cache testing

**API Documentation:**
- `docs/API_REFERENCE.md` - Complete REST API reference (22 endpoints)

**Dashboard documentation:**
- `docs/dashboard_ui/DASHBOARD.md` - Dashboard features and API
- `docs/dashboard_ui/DATAFLOW_DIAGRAMS.md` - Mermaid architecture diagrams

**Deployment & Operations:**
- `docs/deployment/TRADITIONAL_SERVER_DEPLOYMENT.md` - PM2 + Nginx setup
- `docs/deployment/CI_CD_UPDATES.md` - **NEW v1.6.5** - CI/CD deployment enhancements
- `docs/deployment/CI_CD_CROSS_PLATFORM_AUDIT.md` - **NEW v1.6.5** - Cross-platform compatibility
- `docs/runbooks/troubleshooting.md` - Doppler failures, port conflicts, Activity Feed errors, WebSocket issues
- `docs/runbooks/pipeline-execution.md` - Pipeline patterns, Doppler integration, permission troubleshooting
- `docs/runbooks/DOPPLER_OUTAGE.md` - Doppler API outage response
- `tests/README.md` - Test infrastructure, fixtures, pre-commit hooks

## Recent Major Changes

**v1.6.5 (Current) - Dashboard UI Improvements & API Fixes**
- **Pipeline Job Details Modal** - Fixed data integrity issues
  - Replaced mock data with real SQLite database queries
  - Fixed `formatJobFromDb()` to return only schema-compliant fields (removed createdAt, error, git)
  - Updated `fetchJobsForPipeline()` to use `getJobs()` from database module
  - Location: `api/routes/pipelines.js`, `api/routes/pipelines.ts`
- **Job Modal UX Enhancement** - Improved report access
  - Replaced "Copy ID" button with "View Report →" link for all jobs
  - Updated `getHtmlReportPath()` to always return valid path (constructs from job ID if needed)
  - Improved HTML report path construction (strips `-summary` suffix correctly)
  - Location: `public/dashboard.js`
- **Dashboard Documentation Tab** - Pipeline architecture visibility
  - Added new "Pipeline Data Flow" documentation tab to dashboard UI
  - New API endpoint: `GET /api/pipeline-data-flow` (serves comprehensive workflow diagrams)
  - Expanded `pipeline-data-flow.md` to cover all 9 workflows (+1618 lines)
  - Location: `public/index.html`, `api/server.js`, `docs/architecture/pipeline-data-flow.md`
- **Code Inventory API** - New endpoints added
  - `GET /api/inventory/stats` - Code inventory statistics
  - `GET /api/inventory/projects` - Code inventory project list
  - Updated auth middleware to allow public access to inventory and documentation endpoints
  - Location: `api/routes/inventory.js`, `api/middleware/auth.js`
- **Documentation Cleanup**
  - Removed obsolete `docs/architecture/CHEAT_SHEET.md` (351 lines removed)
  - Added comprehensive CI/CD deployment documentation
  - Updated `docs/deployment/CI_CD_UPDATES.md` and `CI_CD_CROSS_PLATFORM_AUDIT.md`

**v1.6.4 - Production Error Handling Improvements**
- **Doppler Health Monitor** - Circuit breaker pattern for stale cache detection
  - Monitors fallback cache age every 15 minutes
  - Warning threshold: 12 hours, critical threshold: 24 hours
  - Health endpoint: `/api/health/doppler`
  - Location: `sidequest/pipeline-core/doppler-health-monitor.js`
- **Port Manager Utility** - Automatic port conflict resolution
  - Port availability checking before binding
  - Automatic fallback ports (8080 → 8081 → 8082 → ...)
  - Process cleanup utilities (killProcessOnPort)
  - Graceful shutdown handling (SIGTERM/SIGINT/SIGHUP)
  - Location: `api/utils/port-manager.js`
- **Null-Safe Error Handling** - Activity Feed error resilience
  - Safe error message extraction (handles null/undefined/string/Error)
  - Optional chaining for all error property access
  - Nested try-catch in event handlers
  - Comprehensive Sentry context with fallbacks
  - Location: `api/activity-feed.js`
- **Documentation Updates**
  - Enhanced `docs/architecture/ERROR_HANDLING.md` with new patterns
  - New `docs/runbooks/troubleshooting.md` with Doppler/port/Activity Feed debugging
  - Enhanced `docs/runbooks/pipeline-execution.md` already comprehensive

**v1.6.3 - Repository Cleanup Pipeline**
- New repository cleanup pipeline integrated into AlephAuto framework
- RepoCleanupWorker for automated cleanup of Python venvs, build artifacts, temp files
- Moved universal-repo-cleanup.sh to pipeline-runners/
- Added npm scripts: `cleanup:once`, `cleanup:dryrun`, `cleanup:schedule`
- Scheduled weekly cleanup (Sunday 3 AM by default)

**v1.6.2 - API Documentation & n0ai-proxy Worker**
- Added comprehensive API documentation (`docs/API_REFERENCE.md`) with 22 endpoints
- New Cloudflare Worker `n0ai-proxy` for sidequest integration
- Compiled scan-orchestrator.ts to .js/.d.ts for runtime
- Cleaned up obsolete documentation and build artifacts
- Removed readme-scanner module and data-discovery pipeline

**v1.6.1 - Pipeline Core Reorganization & TypeScript Migrations**
- Moved `lib/` to `sidequest/pipeline-core/` for better organization
- Migrated test-refactor-pipeline.js and test-refactor-worker.js to TypeScript with full type definitions
- Extended frontend types for test-refactor job results (patterns, recommendations, generated files)
- Updated JobItem component to render test-refactor metrics and analysis
- Fixed TypeScript errors across dashboard.js, BugfixAuditWorker, DirectoryScanner

**v1.6.0 - Test Refactor Pipeline & Documentation Reorganization**
- New test refactoring pipeline for automated test suite modularization
- Reorganized documentation into categorical directories (architecture/, dashboard_ui/, deployment/, runbooks/)
- Updated condense output directory to sidequest/output/condense/
- Added pnpm lockfile support
- Added multi-channel Discord integration test

**v1.5.0 - Git Workflow Automation**
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

**Version:** 1.6.5
**Last Updated:** 2025-11-24
**Status:** Production Ready (PM2 + Doppler deployment)
**Environment:** macOS with traditional server stack

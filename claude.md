# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Automation pipelines built on **AlephAuto** job queue framework with real-time dashboard:

1. **Code Consolidation** - Duplicate detection (ast-grep, pydantic, multi-layer similarity)
2. **Doc Enhancement** - Schema.org structured data injection
3. **Git Activity Reporter** - Weekly/monthly reports with visualizations
4. **Gitignore Manager** - Batch `.gitignore` updates ✨ INTEGRATED
5. **Repomix Automation** - Automated repomix file generation
6. **Plugin Manager** - Claude Code plugin audit and cleanup
7. **Claude Health Monitor** - Environment health checks
8. **Dashboard UI** - Real-time monitoring interface

All systems use AlephAuto job queue with Sentry logging, centralized config, event-driven architecture, and WebSocket updates.

## Quick Reference

| Task | Solution |
|------|----------|
| Duplicate detection | See Patterns #2, #3, #5 (structural.py, extract_blocks.py:231) |
| New pipeline | Extend SidequestServer |
| Configuration | Always `import { config }` from './sidequest/config.js' |
| Tests | `npm test` (unit), `npm run test:integration` - See tests/README.md |
| Test fixtures | ALWAYS use `createTempRepository()`, NEVER `/tmp/` paths |
| Debugging | Sentry + logs/, `createComponentLogger` - See docs/ERROR_HANDLING.md |
| Retry logic | Pattern #8, docs/ERROR_HANDLING.md |
| **Type validation** | **Zod + TypeScript - See docs/TYPE_SYSTEM.md** ✨ **NEW** |
| **Fix type errors** | **Use TypeScript Type Validator skill (auto-activates)** ✨ **NEW** |
| Deploy | doppler + PM2 (see Production Deployment) |
| Dashboard | `npm run dashboard` → http://localhost:8080 |
| **Phase 4 Plan** | **See docs/PHASE_4_IMPLEMENTATION.md (700+ lines)** ✨ **NEW** |

## Critical Patterns

1. **Nullish Coalescing:** Use `??` not `||` for numeric options
2. **Field Name:** CodeBlock uses `tags`, NOT `semantic_tags`
3. **Configuration:** Always `import { config }`, NEVER `process.env`
4. **Doppler Required:** All commands need `doppler run --`
5. **Two-Phase Similarity:** Extract features BEFORE normalization
6. **Port:** Use `JOBS_API_PORT` (8080), NOT `API_PORT`
7. **Test Fixtures:** Use `createTempRepository()`, NEVER hardcode `/tmp/`
8. **Error Classification:** Auto-classified as retryable/non-retryable
9. **Type Validation:** Use Zod schemas + TypeScript inference (`z.infer<>`), NEVER manual type checking ✨ **NEW**

## Commands

### Development
```bash
doppler run -- npm start        # Repomix cron server
npm run dev                     # Dev with auto-restart
npm run dashboard               # Dashboard (http://localhost:8080)

# Pipelines
npm run docs:enhance            # Enhance docs
npm run git:weekly              # Git activity
npm run plugin:audit            # Plugin audit
npm run claude:health           # Health check
npm run gitignore:update        # Update .gitignore ✨ NEW
npm run gitignore:update:dry    # Dry run ✨ NEW

# Duplicate detection + Auto-PR
doppler run -- RUN_ON_STARTUP=true node pipelines/duplicate-detection-pipeline.js
ENABLE_PR_CREATION=true doppler run -- RUN_ON_STARTUP=true node pipelines/duplicate-detection-pipeline.js
```

### Testing
```bash
npm test                        # Unit tests
npm run test:integration        # Integration tests
npm run test:validate-paths     # Validate test paths
npm run typecheck               # TypeScript
```

## Architecture

### Duplicate Detection (7 stages)
```
Stage 1-2 (JS): Repository Scanner → AST-Grep Detector
      ↓ JSON via stdin/stdout
Stage 3-7 (Python): Block Extraction → Semantic → Grouping → Suggestions → Reports
```

### AlephAuto Framework
```
SidequestServer (Base) - Job queue, concurrency, events, Sentry
  ▲ extends
  ├── RepomixWorker
  ├── SchemaEnhancementWorker
  ├── GitActivityWorker
  ├── GitignoreWorker ✨ NEW
  └── PluginManagerWorker
```

### Error Handling ✨ NEW
- **Auto-classification**: Retryable (ETIMEDOUT, 5xx) vs non-retryable (ENOENT, 4xx)
- **Circuit Breaker**: Max 2 attempts (configurable), absolute max 5
- **Exponential Backoff**: Progressive delay between retries
- **Sentry Integration**: 3 alert levels
- **See**: docs/ERROR_HANDLING.md (837 lines)

### Dashboard
- **Real-time**: WebSocket updates for pipelines/jobs/retries
- **Retry Metrics**: Distribution bars, circuit breaker warnings
- **API**: `/health`, `/api/status` (includes retry metrics)
- **See**: public/README.md, docs/DASHBOARD.md

## Environment Variables

**Managed via Doppler** (Project: `bottleneck`)

**Development** (`dev` environment):
```bash
NODE_ENV=development
JOBS_API_PORT=8080
REDIS_HOST=localhost
REDIS_PORT=6379
SENTRY_DSN=https://...
SENTRY_ENVIRONMENT=development
```

**Production** (`prd` environment) ✨ **CONFIGURED**:
```bash
NODE_ENV=production
JOBS_API_PORT=8080
REDIS_HOST=localhost
REDIS_PORT=6379
SENTRY_DSN=https://...
SENTRY_ENVIRONMENT=production
BOTTLENECK_TOKEN=dp.st.dev.***  # Doppler dev token
PROD_TOKEN=dp.st.prd.***         # Doppler prd token

# Cron Schedules
CRON_SCHEDULE="0 2 * * *"                # Duplicate Detection
DOC_CRON_SCHEDULE="0 3 * * *"            # Doc Enhancement
GIT_CRON_SCHEDULE="0 20 * * 0"           # Git Activity
PLUGIN_CRON_SCHEDULE="0 9 * * 1"         # Plugin Audit
CLAUDE_HEALTH_CRON_SCHEDULE="0 8 * * *"  # Claude Health
GITIGNORE_CRON_SCHEDULE="0 4 * * *"      # Gitignore

# Auto-PR
ENABLE_PR_CREATION=false
PR_DRY_RUN=false
PR_BASE_BRANCH=main
```

**Switch Environments**:
```bash
doppler setup --project bottleneck --config dev   # Development
doppler setup --project bottleneck --config prd   # Production
```

## Production Deployment ✨ **DEPLOYED**

**Traditional Server** with PM2 + Doppler + macOS/Linux support.

### PM2 Ecosystem Configuration
```bash
# Use ecosystem.config.cjs for production
doppler run -- pm2 start ecosystem.config.cjs
pm2 save
pm2 status
```

**Two PM2 Apps**:
1. **aleph-dashboard** - API + WebSocket + Static files (cluster mode, 2 instances)
2. **aleph-worker** - Duplicate detection pipeline (fork mode, cron: 2 AM daily)

### Deployment Commands
```bash
# Initial setup
./scripts/deploy-traditional-server.sh --setup

# Updates (creates backup, pulls code, restarts)
./scripts/deploy-traditional-server.sh --update

# Status check
./scripts/deploy-traditional-server.sh --status

# Rollback
./scripts/deploy-traditional-server.sh --rollback

# Manual PM2 control
pm2 start ecosystem.config.cjs   # Start all services
pm2 restart all                   # Restart all services
pm2 stop all                      # Stop all services
pm2 logs                          # View logs
pm2 monit                         # Monitor resources
```

### GitHub Actions CI/CD
- **CI**: `.github/workflows/ci.yml` - Tests on PRs/pushes
- **CD**: `.github/workflows/deploy.yml` - SSH deployment to production

**Production Ready**: ✅
- Doppler `prd` environment configured (16 secrets)
- PM2 ecosystem configuration created
- Deployment script tested and working
- Health checks passing
- Services deployed and verified

**See**:
- `ecosystem.config.cjs` - PM2 process configuration
- `scripts/deploy-traditional-server.sh` - 590-line deployment script
- `docs/DEPLOYMENT.md` - General deployment guide
- `docs/TRADITIONAL_SERVER_DEPLOYMENT.md` - PM2 + Nginx setup

## Directory Structure

```
jobs/
├── api/                    # API + WebSocket + Static files
├── lib/                    # Core business logic
│   ├── scan-orchestrator.js
│   ├── similarity/         # Duplicate detection algorithms
│   ├── git/               # PR creation ✨ NEW
│   └── caching/           # Redis caching
├── sidequest/             # AlephAuto framework
│   ├── server.js         # Base job queue
│   ├── gitignore-worker.js  # ✨ NEW
│   └── config.js         # Centralized config
├── public/                # Dashboard UI
├── pipelines/             # Pipeline entry points
│   └── gitignore-pipeline.js  # ✨ NEW
├── tests/                 # Tests (unit, integration, accuracy)
│   ├── fixtures/         # Test helpers ✨ NEW
│   └── scripts/          # Validation ✨ NEW
├── .husky/               # Git hooks (pre-commit path validation)
├── docs/                 # Documentation
│   ├── ERROR_HANDLING.md    # Retry logic (837 lines) ✨ NEW
│   ├── DASHBOARD.md         # Dashboard guide
│   └── DEPLOYMENT.md        # Deployment guide
└── .github/workflows/    # CI/CD
```

## Key Files
- `ecosystem.config.cjs` - PM2 production configuration ✨ **PRODUCTION**
- `lib/scan-orchestrator.js` - Pipeline coordinator
- `lib/similarity/structural.py` - Similarity algorithm
- `lib/git/pr-creator.js` - Auto-PR creation
- `sidequest/server.js` - AlephAuto base (with retry)
- `sidequest/gitignore-worker.js` - Gitignore worker
- `pipelines/gitignore-pipeline.js` - Gitignore pipeline
- `api/types/scan-requests.ts` - Zod schemas + TypeScript types
- `api/middleware/validation.ts` - Validation middleware
- `api/routes/scans.ts` - Type-safe route handlers
- `scripts/deploy-traditional-server.sh` - Deployment automation (590 lines)
- `docs/ERROR_HANDLING.md` - Retry documentation (837 lines)
- `docs/TYPE_SYSTEM.md` - Type system guide (600+ lines)
- `docs/PHASE_4_IMPLEMENTATION.md` - Phase 4 plan (700+ lines)
- `docs/PHASE_4_4_COMPLETION.md` - Performance optimization (700+ lines)
- `docs/PHASE_4_5_COMPLETION.md` - Deployment readiness (35KB)
- `tests/README.md` - Test infrastructure (612 lines)
- `tests/scripts/validate-test-paths.js` - Path validation

## Recent Updates (2025-11-18)

### v1.3.0 - Production Deployment Release (CURRENT) ✨ **DEPLOYED**
**Traditional server deployment with PM2 + Doppler on macOS.**

**Phase 4 Completion**:
- ✅ **Phase 4.3**: High-priority accessibility fixes (WCAG AA compliance, ARIA labels)
- ✅ **Phase 4.4**: Performance optimization (CLS improvement, Lighthouse audit)
- ✅ **Phase 4.5**: Production deployment readiness certification

**Production Infrastructure**:
- **PM2 Configuration**: `ecosystem.config.cjs` created (2 apps: dashboard + worker)
- **Doppler `prd` Environment**: 16 secrets configured, switched from `dev`
- **Deployment Script**: `scripts/deploy-traditional-server.sh` tested and working
- **GitHub Actions**: Updated `.github/workflows/deploy.yml` to use `aleph-worker`
- **Health Checks**: All endpoints passing, services verified

**Deployment Features**:
- Automated backup before updates (timestamped tar.gz)
- PM2 cluster mode for dashboard (2 instances)
- PM2 fork mode for worker (cron: 2 AM daily)
- Doppler integration via PM2 interpreter
- Health check validation
- Rollback capability

**Accessibility & Performance** (Phase 4.3-4.4):
- WCAG AA compliance: 6.8:1 contrast ratios (was <4.5:1)
- ARIA labels added to all status indicators
- CLS improved 6% (0.323 → 0.303, target <0.1 in roadmap)
- Min-heights added to 4 dynamic containers

**Documentation** (3 completion reports, 36KB+):
- `docs/PHASE_4_4_COMPLETION.md` - Performance optimization (700+ lines)
- `docs/PHASE_4_5_COMPLETION.md` - Deployment readiness (35KB)
- `ecosystem.config.cjs` - PM2 configuration (90 lines)

**Repository Cleanup**:
- Removed platform-specific configs: `railway.json`, `render.yaml`, `Procfile`, `Dockerfile`, `docker-compose.yml`
- Retained traditional server focus: PM2, deployment script, CI/CD workflows

**Production Status**: ✅ Deployed and Verified
- Services: Both PM2 apps running successfully
- Dashboard: Accessible at http://localhost:8080
- Health: All checks passing
- Logs: Clean, no errors since deployment

### v1.2.2 - Phase 4 Testing & Type System
**Phase 4.1.1-4.1.2 Complete: Retry Metrics & Error Classification Validation**

- Test suite expansion (19 new tests, 432+ lines)
- Type safety infrastructure (Zod + TypeScript)
- Universal TypeScript Type Validator skill created (600+ lines)
- API improvements (type validation, error handling)

### v1.2.1 - Gitignore Manager Integration
- Integrated GitignoreRepomixUpdater into AlephAuto
- Created `GitignoreWorker` and `gitignore-pipeline.js`
- Added npm scripts: `gitignore:update`, `gitignore:update:dry`
- Test: 29 repos scanned, 1 would update, 0 errors

### v1.2.0 - Retry Logic & Test Infrastructure
- Intelligent retry with circuit breaker (docs/ERROR_HANDLING.md)
- Test fixtures system (tests/fixtures/test-helpers.js)
- Pre-commit path validation (.husky/pre-commit)
- Retry metrics dashboard (retry queue visualization)
- Auto-PR creation for consolidation suggestions

### v1.1.0 - Dashboard & Deployment
- Real-time dashboard UI (public/)
- 5 deployment methods documented
- CI/CD workflows (GitHub Actions)
- Port migration: API_PORT → JOBS_API_PORT (8080)

**See**: Full changelog in git history, docs/ERROR_HANDLING.md, tests/README.md, docs/TYPE_SYSTEM.md

## Important Notes

**Breaking Changes**:
- Port: 3000 → 8080 (v1.1.0)
- Environment: `API_PORT` → `JOBS_API_PORT` (v1.1.0)
- Test paths: Hardcoded `/tmp/` BLOCKED by pre-commit (v1.2.0)

**Migration**:
- Update port references to 8080
- Use `JOBS_API_PORT` in env configs
- Replace `/tmp/test-repo` → `testRepo.path` from fixtures
- Run `npm run test:validate-paths` to scan for issues

**Documentation**:
- Deployment: docs/DEPLOYMENT.md, docs/TRADITIONAL_SERVER_DEPLOYMENT.md
- Error handling: docs/ERROR_HANDLING.md (837 lines)
- Type system: docs/TYPE_SYSTEM.md (600+ lines) ✨ **NEW**
- Testing: tests/README.md (612 lines)
- Dashboard: docs/DASHBOARD.md
- Port migration: docs/PORT_MIGRATION.md
- Phase 4 plan: docs/PHASE_4_IMPLEMENTATION.md (700+ lines)

---

**Version**: 1.3.0 - Production Deployment Release
**Last Updated**: 2025-11-18
**Status**: ✅ **DEPLOYED TO PRODUCTION**
**Environment**: macOS with PM2 + Doppler (`prd` environment configured)
**Latest**: Phase 4.3-4.5 Complete - Accessibility, Performance, Production Deployment

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Automation pipelines built on the **AlephAuto** job queue framework with **real-time dashboard UI**:

1. **Code Consolidation System** - Duplicate code detection using ast-grep, pydantic, multi-layer similarity
2. **Documentation Enhancement** - Schema.org structured data injection for README files
3. **Git Activity Reporter** - Weekly/monthly git activity reports with visualizations
4. **Gitignore Manager** - Batch `.gitignore` updates across git repositories
5. **Repomix Automation** - Automated repomix file generation for git repository roots only
6. **Plugin Manager** - Claude Code plugin audit, duplicate detection, and cleanup recommendations
7. **Claude Health Monitor** - Comprehensive Claude Code environment health checks, monitoring, and optimization
8. **Dashboard UI** - Real-time web interface for monitoring pipelines, job queues, and system status ✨ NEW

All systems use AlephAuto job queue with Sentry error logging, centralized configuration, event-driven architecture, and WebSocket-based real-time updates.

## 🔍 Quick Decision Guide

**Working on duplicate detection?** → See Critical Patterns #2, #3, #5 (structural.py:29-482, extract_blocks.py:231)
**Adding a new pipeline?** → Extend SidequestServer (see AlephAuto Job Queue Framework pattern)
**Configuration changes?** → Always use `import { config } from './sidequest/config.js'` (Critical Pattern #4)
**Running tests?** → `npm test` (unit) or `npm run test:integration` (integration)
**Debugging errors?** → Check Sentry dashboard + logs/, use `createComponentLogger`
**Production deployment?** → Use doppler + PM2 (see Production Deployment section)
**View dashboard?** → `npm run dashboard` then visit http://localhost:8080 ✨ NEW

## ⚠️ Critical Patterns

**Before making changes:**

1. **Nullish Coalescing:** Use `??` not `||` for numeric options: `maxConcurrent ?? 5` (sidequest/server.js:18)
2. **Field Name:** CodeBlock uses `tags` field, NOT `semantic_tags` (extract_blocks.py:231)
3. **Configuration:** Always use `import { config } from './sidequest/config.js'`, NEVER `process.env` directly
4. **Doppler Required:** All commands must run with `doppler run --` for environment variables
5. **Two-Phase Similarity:** Extract semantic features BEFORE normalization (structural.py:29-93, 422-482)
6. **Port Configuration:** Use `JOBS_API_PORT` (default: 8080), NOT `API_PORT` ✨ NEW

## Key Commands

### Development
```bash
# Start systems
doppler run -- npm start        # Repomix cron server
npm run dev                     # Development mode with auto-restart
npm run dashboard               # Start dashboard UI (http://localhost:8080) ✨ UPDATED

# Documentation enhancement
npm run docs:enhance            # Enhance Inventory directory
npm run docs:enhance:dry        # Dry run (no modifications)

# Git activity reports
npm run git:weekly              # Weekly report (last 7 days)
RUN_ON_STARTUP=true npm run git:weekly  # Run immediately

# Plugin management
npm run plugin:audit                    # Run audit immediately
npm run plugin:audit:detailed           # Run detailed audit
npm run plugin:schedule                 # Cron mode (Monday 9 AM)
doppler run -- pm2 start pipelines/plugin-management-pipeline.js --name plugin-auditor  # PM2 deployment
./sidequest/plugin-management-audit.sh --detailed  # Manual shell script audit

# Claude environment health
npm run claude:health                   # Run comprehensive health check
npm run claude:health:detailed          # Run detailed health check
npm run claude:health:quick             # Quick check (skip performance/plugins)
npm run claude:health:schedule          # Cron mode (daily 8 AM)
doppler run -- pm2 start pipelines/claude-health-pipeline.js --name claude-health  # PM2 deployment

# Duplicate detection
doppler run -- node lib/scan-orchestrator.js <repo-path>
doppler run -- RUN_ON_STARTUP=true node pipelines/duplicate-detection-pipeline.js
```

### Testing
```bash
# Run all tests (organized by type)
npm test                                        # Unit tests only (10 files)
npm run test:integration                        # Integration tests only (8 files)
npm run test:all                                # All tests (unit + integration)

# Run specific test suites
node --test tests/unit/directory-scanner.test.js      # Individual test file
node --test tests/unit/sidequest-server.test.js       # Job queue tests
node --test tests/unit/api-routes.test.js             # REST API tests (16)
node --test tests/unit/websocket.test.js              # WebSocket tests (15)

# Integration tests (includes Redis caching tests)
node tests/integration/test-automated-pipeline.js     # Full pipeline test
node tests/integration/test-cache-layer.js            # Redis cache integration
node tests/integration/test-inter-project-scan.js     # Multi-repo scanning

# Duplicate detection accuracy tests
node tests/accuracy/accuracy-test.js --verbose --save-results

# Type checking
npm run typecheck
```

**Test Coverage:** 106 tests, ~90+ passing (85%+)
- Sidequest Server: 12/12 ✅
- REST API: 16/16 ✅
- WebSocket: 15/15 ✅
- Filepath Imports: 14/14 ✅
- READMEScanner: 11/11 ✅
- DirectoryScanner: 12/13 ⚠️
- Accuracy: Precision 100%, Recall 87.50%, F1 93.33%
- Note: Removed 23 obsolete caching tests (file-based → Redis-backed migration)

**Test Organization:**
- `tests/unit/` - Unit tests for individual components (*.test.js)
- `tests/integration/` - Integration tests for full workflows (test-*.js)
- `tests/accuracy/` - Duplicate detection accuracy suite
- `tests/scripts/` - Test utility scripts

## Architecture

### Code Consolidation Pipeline (7 stages)

```
Stage 1-2 (JavaScript): Repository Scanner → AST-Grep Detector
      ↓ JSON via stdin/stdout
Stage 3-7 (Python): Block Extraction → Semantic Annotation → Duplicate Grouping → Suggestions → Reports
```

**Key Components:**
- `lib/scan-orchestrator.js` - Coordinates entire pipeline, bridges JS/Python
- `lib/scanners/repository-scanner.js` - Repository validation, Git info, repomix integration
- `lib/scanners/ast-grep-detector.js` - Pattern detection using ast-grep
- `lib/extractors/extract_blocks.py` - Python pipeline (stages 3-7)
- `lib/similarity/structural.py` - Multi-layer similarity algorithm
- `.ast-grep/rules/` - 18 pattern detection rules (utilities, api, database, config, async, logging)

### AlephAuto Job Queue Framework

```
┌─────────────────────────────────────┐
│     SidequestServer (Base)          │
│  - Job queue management             │
│  - Concurrency control              │
│  - Event emission                   │
│  - Sentry integration               │
└─────────────────────────────────────┘
              ▲ extends
    ┌─────────┴──────────┬──────────────┬──────────────┬──────────────┐
    │                    │              │              │              │
RepomixWorker    SchemaEnhancement  GitActivity   Gitignore     PluginManager
                      Worker          Worker       Manager          Worker
```

**Core Pattern:**
```javascript
import { SidequestServer } from './sidequest/server.js';

class MyWorker extends SidequestServer {
  constructor(options) {
    super({ maxConcurrent: 3, ...options });
  }

  async runJobHandler(job) {
    // Job implementation
    return result;
  }
}

// Job lifecycle events
worker.on('job:created', (job) => { /* ... */ });
worker.on('job:completed', (job) => { /* ... */ });
worker.on('job:failed', (job) => { /* ... */ });
```

### RepomixWorker .gitignore Support

**By default, RepomixWorker respects .gitignore files** - any directories or files listed in .gitignore are automatically excluded from processing.

```javascript
import { RepomixWorker } from './sidequest/repomix-worker.js';

// Default behavior - respects .gitignore automatically
const worker = new RepomixWorker({
  outputBaseDir: './condense',
  maxConcurrent: 5
});

// With additional ignore patterns
const workerWithPatterns = new RepomixWorker({
  outputBaseDir: './condense',
  additionalIgnorePatterns: [
    '*.log',           // Ignore all log files
    'temp/**',         // Ignore temp directory
    'dist/',           // Ignore dist directory
    '**/.env.*'        // Ignore all .env files
  ]
});

// Disable .gitignore (NOT recommended)
const workerNoGitignore = new RepomixWorker({
  respectGitignore: false  // ⚠️ Not recommended
});
```

**What gets excluded by default:**
- All files/directories in `.gitignore`
- `node_modules/`, `.git/`, `.venv/`, `venv/`
- Common build artifacts: `dist/`, `build/`, `coverage/`
- IDE directories: `.idea/`, `.vscode/`

### Dashboard UI

Real-time web-based monitoring dashboard for pipeline status and job queue management.

**Quick Start:**
```bash
npm run dashboard               # Start at http://localhost:8080
```

**Features:**
- **Real-time Updates**: WebSocket connection for live pipeline and job status
- **Pipeline Monitoring**: Status cards for all 4 pipelines (Duplicate Detection, Doc Enhancement, Git Activity, Plugin Manager)
- **Job Queue**: Active/queued job tracking with capacity monitoring
- **Activity Feed**: Chronological event log (job starts, completions, failures)
- **Built-in Documentation**: Tabs for getting started, pipelines, API reference, and architecture
- **Responsive Design**: Works on desktop, tablet, and mobile
- **No Build Step**: Vanilla JavaScript with modern CSS

**Architecture:**
```
public/
├── index.html      # Dashboard structure (12 KB)
├── dashboard.css   # Modern CSS with variables (13 KB)
├── dashboard.js    # WebSocket client + API integration (17 KB)
└── README.md       # Complete documentation
```

**WebSocket Events:**
- `job:created`, `job:started`, `job:completed`, `job:failed`
- `pipeline:status`, `queue:update`

**API Endpoints:**
- `GET /health` - Health check
- `GET /api/status` - System status with pipeline/queue/activity data
- `POST /api/scans` - Trigger repository scan
- `GET /ws/status` - WebSocket client count

**See:** `public/README.md` for complete dashboard documentation

## Critical Patterns

### 1. Nullish Coalescing for Numeric Options

```javascript
// ✅ CORRECT - Allows 0 as valid value
this.maxConcurrent = options.maxConcurrent ?? 5;

// ❌ INCORRECT - Treats 0 as falsy, defaults to 5
this.maxConcurrent = options.maxConcurrent || 5;
```

**Bug:** `sidequest/server.js:18` - Using `||` broke tests with `maxConcurrent: 0`
**Pattern:** Use `??` for numeric values, booleans, empty strings

### 2. Function Name Extraction

**CRITICAL:** Use `tags` field, NOT `semantic_tags`:

```python
# ✅ CORRECT
tags=[f"function:{function_name}"] if function_name else []

# ❌ INCORRECT
semantic_tags=[f"function:{function_name}"]  # WRONG FIELD
```

Function extraction searches **BACKWARDS** to find closest function (extract_blocks.py:80-98).

### 3. Two-Phase Structural Similarity

**Architecture** (lib/similarity/structural.py):

```python
def calculate_structural_similarity(code1, code2, threshold=0.90):
    # Phase 1: Extract semantic features from ORIGINAL code (BEFORE normalization)
    features1 = extract_semantic_features(code1)  # HTTP codes, operators, methods
    features2 = extract_semantic_features(code2)

    # Phase 2: Normalize and calculate base similarity
    normalized1 = normalize_code(code1)
    normalized2 = normalize_code(code2)
    base_similarity = calculate_levenshtein_similarity(normalized1, normalized2)

    # Phase 3: Apply semantic penalties using ORIGINAL features
    penalty = calculate_semantic_penalty(features1, features2)
    return base_similarity * penalty
```

**Penalties:**
- HTTP status codes (200 vs 201): 0.70x (30% penalty)
- Logical operators (=== vs !==): 0.80x (20% penalty)
- Semantic methods (Math.max vs Math.min): 0.75x (25% penalty)

### 4. Configuration Access

```javascript
import { config } from './sidequest/config.js';

// ✅ Correct
const dsn = config.sentryDsn;

// ❌ Incorrect - NEVER use process.env directly
const dsn = process.env.SENTRY_DSN;
```

### 5. Logging with Sentry

```javascript
import { createComponentLogger } from './sidequest/logger.js';

const logger = createComponentLogger('ComponentName');
logger.info('Message');
logger.error({ err: error, context }, 'Error message');
```

## Production Deployment

### Duplicate Detection Pipeline

**Configuration:** `config/scan-repositories.json`

```bash
# Production deployment with PM2
doppler run -- pm2 start pipelines/duplicate-detection-pipeline.js --name duplicate-scanner

# Test immediately
doppler run -- RUN_ON_STARTUP=true node pipelines/duplicate-detection-pipeline.js

# Monitor
pm2 status duplicate-scanner
pm2 logs duplicate-scanner
```

**Features:**
- Cron scheduling (2 AM daily by default)
- Repository prioritization (critical, high, medium, low)
- Inter-project and intra-project scanning
- Retry logic with exponential backoff
- **Redis Caching** (`ScanResultCache`):
  - Git commit-based cache keys (repo path hash + commit hash)
  - 30-day TTL (configurable)
  - Automatic cache invalidation on repo changes
  - Tracks uncommitted changes to prevent stale caches
  - Cache statistics and metadata (age, duplicate counts)
  - Integrated with `CachedScanner` for transparent cache hits
- Sentry error tracking

### REST API & WebSocket Server

```bash
# Start API server (default port 8080)
doppler run -- node api/server.js
# Or use npm script
npm run dashboard

# Test endpoints
curl http://localhost:8080/health
curl http://localhost:8080/api/scan -X POST -H "Content-Type: application/json" \
  -d '{"repositoryPath": "/path/to/repo"}'
```

**Endpoints:**
- `GET /health` - Health check
- `GET /api/status` - System status
- `POST /api/scans` - Trigger repository scan
- `GET /api/scans/:scanId` - Get scan results
- `GET /ws/status` - WebSocket client count
- `WebSocket /ws` - Real-time scan updates

### Dashboard Deployment ✨ NEW

The dashboard UI can be deployed using multiple strategies (following environment-setup-analyzer framework):

**Option 1: Platform as a Service (Recommended)**
```bash
# Railway
railway up

# Render
# Push to main branch - auto-deploys via render.yaml

# Heroku
git push heroku main
```

**Option 2: Traditional Server with PM2**
```bash
# Start dashboard with PM2
doppler run -- pm2 start api/server.js --name aleph-dashboard
pm2 save
pm2 startup
```

**Option 3: Docker**
```bash
# Local development
docker-compose up -d

# Production
docker build -t aleph-dashboard .
docker run -p 8080:8080 aleph-dashboard
```

**CI/CD Workflows:** ✨ NEW
- `.github/workflows/ci.yml` - Runs tests on PRs and pushes
- `.github/workflows/deploy.yml` - Deploys to production server (SSH)
- `.github/workflows/deploy-platform.yml` - Validates for platform deployment

**Configuration Files:** ✨ NEW
- `Procfile` - Heroku deployment
- `railway.json` - Railway deployment
- `render.yaml` - Render deployment (with Redis)
- `Dockerfile` - Multi-stage production build
- `docker-compose.yml` - Local development
- `ecosystem.config.template.js` - PM2 configuration template

**Deployment Scripts:** ✨ NEW
- `scripts/deploy-traditional-server.sh` - Automated VPS deployment

**See:** `docs/DEPLOYMENT.md` for complete deployment guide
**See:** `docs/TRADITIONAL_SERVER_DEPLOYMENT.md` for PM2 + Nginx setup

## Python Environment

```bash
# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run Python scripts
doppler run -- venv/bin/python3 lib/extractors/extract_blocks.py < input.json
```

**Required:** pydantic>=2.12

## Troubleshooting

### Common Issues

```bash
# Dependencies missing (including repomix)
npm install                       # Installs all dependencies including repomix
npm run verify                    # Verify all dependencies are available

# Redis connection errors
redis-cli ping                    # Should return PONG
brew services start redis         # Start Redis if needed

# Python pipeline errors
which python3
source venv/bin/activate
```

### Cron Scheduling

Environment variables:
- `CRON_SCHEDULE` - Repomix (default: `0 2 * * *` - 2 AM daily)
- `DOC_CRON_SCHEDULE` - Doc enhancement (default: `0 3 * * *` - 3 AM daily)
- `GIT_CRON_SCHEDULE` - Git activity (default: `0 20 * * 0` - Sunday 8 PM)
- `PLUGIN_CRON_SCHEDULE` - Plugin audit (default: `0 9 * * 1` - Monday 9 AM)
- `CLAUDE_HEALTH_CRON_SCHEDULE` - Claude health check (default: `0 8 * * *` - Daily 8 AM)
- `RUN_ON_STARTUP=true` - Run immediately on startup
- `DETAILED=true` - Include detailed component listing (Plugin Manager and Claude Health)

## MCP Servers

- **Sentry MCP** (HTTP Remote) - Error tracking, OAuth required
- **Redis MCP** (STDIO) - Queue management, localhost:6379
- **TaskQueue MCP** (STDIO) - AI task management
- **Filesystem MCP** (STDIO) - Limited to `/Users/alyshialedlie/code/jobs`

```bash
claude mcp list                    # List all servers
claude mcp tools <server-name>     # View available tools
```

## Directory Structure

The project is organized by architectural layer (aligned with dataflow diagrams):

```
jobs/
├── api/                    # API Gateway Layer ✨ UPDATED
│   ├── server.js          # Express app + WebSocket server + Static file serving
│   ├── routes/            # Scan, repository, report endpoints
│   ├── middleware/        # Auth, rate limiting, error handling
│   └── websocket.js       # Real-time event broadcasting
│
├── lib/                    # Processing Layer (Core Business Logic)
│   ├── scan-orchestrator.js              # 7-stage pipeline coordinator
│   ├── scanners/                         # Stage 1-2: Repository & pattern scanning
│   ├── extractors/                       # Stage 3-7: Python data processing
│   ├── similarity/                       # Duplicate detection algorithms
│   ├── reports/                          # Report generation (HTML/JSON/MD)
│   ├── caching/                          # Redis caching (ScanResultCache, CachedScanner)
│   ├── models/                           # Pydantic data models
│   └── config/                           # Configuration loaders
│
├── sidequest/              # Job Queue Framework (AlephAuto)
│   ├── server.js          # Base job queue (extends EventEmitter)
│   ├── config.js          # Centralized configuration
│   ├── logger.js          # Sentry-integrated logging
│   └── doc-enhancement/   # Documentation enhancement workers
│
├── public/                 # Dashboard UI (Static Files) ✨ NEW
│   ├── index.html         # Dashboard HTML (12 KB)
│   ├── dashboard.css      # Modern CSS with variables (13 KB)
│   ├── dashboard.js       # WebSocket client + API integration (17 KB)
│   └── README.md          # Complete dashboard documentation
│
├── .github/                # CI/CD Workflows ✨ NEW
│   └── workflows/
│       ├── ci.yml         # Tests on PRs and pushes
│       ├── deploy.yml     # SSH deployment to production
│       └── deploy-platform.yml  # Platform deployment validation
│
├── config/                 # Configuration Files
│   └── scan-repositories.json
│
├── .ast-grep/              # AST-Grep Pattern Rules
│   └── rules/             # 18 detection rules (database, api, async, etc.)
│
├── tests/                  # All Tests (Organized by Type)
│   ├── unit/              # Unit tests (9 files, *.test.js)
│   ├── integration/       # Integration tests (8 files, test-*.js)
│   ├── accuracy/          # Accuracy test suite
│   └── scripts/           # Test utility scripts
│
├── scripts/                # Utility & Setup Scripts ✨ UPDATED
│   └── deploy-traditional-server.sh  # Automated VPS deployment
│
├── docs/                   # Documentation ✨ EXPANDED
│   ├── CHEAT_SHEET.md
│   ├── DATAFLOW_DIAGRAMS.md
│   ├── DEPLOYMENT.md           # Complete deployment overview
│   ├── TRADITIONAL_SERVER_DEPLOYMENT.md  # PM2 + Nginx guide
│   ├── PORT_MIGRATION.md       # API_PORT → JOBS_API_PORT migration
│   ├── DASHBOARD_*.md          # 6 dashboard design docs
│   ├── architecture/
│   ├── components/
│   └── deployment/             # Deployment documentation hub
│
├── pipelines/              # Pipeline Entry Points
│   ├── duplicate-detection-pipeline.js
│   ├── git-activity-pipeline.js
│   ├── plugin-management-pipeline.js
│   └── claude-health-pipeline.js
│
├── Dockerfile              # Multi-stage production build ✨ NEW
├── docker-compose.yml      # Local development setup ✨ NEW
├── Procfile                # Heroku deployment ✨ NEW
├── railway.json            # Railway configuration ✨ NEW
├── render.yaml             # Render blueprint ✨ NEW
└── ecosystem.config.template.js  # PM2 template ✨ NEW
```

**Key Files Reference:**
- `pipelines/duplicate-detection-pipeline.js` - Main duplicate detection entry point
- `pipelines/git-activity-pipeline.js` - Git activity report pipeline
- `pipelines/plugin-management-pipeline.js` - Plugin audit pipeline
- `pipelines/claude-health-pipeline.js` - Claude health monitor pipeline
- `lib/scan-orchestrator.js` - 7-stage pipeline coordinator
- `lib/similarity/structural.py` - 2-phase similarity algorithm
- `sidequest/server.js` - AlephAuto job queue base class
- `config/scan-repositories.json` - Repository scan configuration
- `docs/DATAFLOW_DIAGRAMS.md` - Complete architecture diagrams
- `docs/components/` - Component documentation (Plugin Manager, Claude Health, AlephAuto)
- `public/index.html` - Dashboard UI entry point ✨ NEW
- `api/server.js` - API server + dashboard serving ✨ NEW

## Environment Variables ✨ UPDATED

**Port Configuration Change:**
- **Old:** `API_PORT` (default: 3000)
- **New:** `JOBS_API_PORT` (default: 8080) - Managed via Doppler

**Required:**
```bash
NODE_ENV=production
JOBS_API_PORT=8080          # ✨ CHANGED from API_PORT
REDIS_HOST=localhost
REDIS_PORT=6379
```

**Optional:**
```bash
SENTRY_DSN=https://...
CRON_SCHEDULE="0 2 * * *"
DOC_CRON_SCHEDULE="0 3 * * *"
GIT_CRON_SCHEDULE="0 20 * * 0"
PLUGIN_CRON_SCHEDULE="0 9 * * 1"
CLAUDE_HEALTH_CRON_SCHEDULE="0 8 * * *"
```

**Setting in Doppler:**
```bash
doppler secrets set JOBS_API_PORT=8080
doppler secrets get JOBS_API_PORT
```

**See:** `docs/PORT_MIGRATION.md` for complete migration guide

## Recent Updates (Updated: 2025-11-17)

### 🎨 Dashboard UI Implementation (NEW)
- Created real-time web dashboard with vanilla JavaScript (no build step)
- WebSocket integration for live pipeline and job status updates
- Built-in documentation with tabbed interface
- Responsive design for desktop/tablet/mobile
- Files: `public/index.html`, `public/dashboard.css`, `public/dashboard.js`
- **Access:** `npm run dashboard` → http://localhost:8080

### 🚀 Deployment Infrastructure (NEW)
- Complete deployment guides for 5 deployment methods:
  - Platform as a Service (Railway, Render, Heroku)
  - Traditional Server (PM2 + Doppler + Nginx)
  - Docker/docker-compose
- CI/CD workflows with GitHub Actions
- Automated deployment script for VPS
- PM2 ecosystem configuration template
- Nginx reverse proxy configurations with SSL
- Files: `docs/DEPLOYMENT.md`, `docs/TRADITIONAL_SERVER_DEPLOYMENT.md`, `.github/workflows/*`, `Dockerfile`, `docker-compose.yml`

### 🔧 Port Migration (BREAKING CHANGE)
- Changed environment variable from `API_PORT` to `JOBS_API_PORT`
- Changed default port from `3000` to `8080`
- Integrated with Doppler secrets management
- Updated all configuration files and documentation
- Files: `sidequest/config.js`, `api/server.js`, deployment configs
- **See:** `docs/PORT_MIGRATION.md` for migration steps

### 📚 Documentation Expansion
- Added 6 comprehensive dashboard design documents (`docs/DASHBOARD_*.md`)
- Created deployment documentation hub (`docs/deployment/`)
- Added port migration guide
- Expanded deployment options documentation
- Total: 15+ new documentation files

### 🐛 Bug Fixes & Improvements
- Fixed TypeScript type coverage issues
- Improved test organization (moved `test/` → `tests/`)
- Removed 23 obsolete caching tests (file-based → Redis migration)
- Added verification script (`scripts/verify-setup.js`)
- Fixed import paths for relocated pipeline files

### 🏗️ Repository Reorganization
- Moved pipeline files to `pipelines/` directory
- Consolidated test structure under `tests/` (unit, integration, accuracy, scripts)
- Cleaned up outdated research and progress documentation
- Removed ~6,000 lines of obsolete documentation
- Added `.github/workflows/` for CI/CD

### 📦 Dependency Updates
- Added `repomix` as npm dependency (no longer requires global install)
- Updated npm scripts for better organization
- Added deployment-related dependencies

## Important Notes

### For Developers

1. **Dashboard Access:** Run `npm run dashboard` to start the UI at http://localhost:8080
2. **Port Change:** All references to port 3000 have been updated to 8080
3. **Environment Variables:** Use `JOBS_API_PORT` instead of `API_PORT`
4. **Deployment:** Multiple options available - see `docs/DEPLOYMENT.md`
5. **Tests:** Organized by type - unit tests, integration tests, accuracy tests
6. **Doppler Required:** All production commands need Doppler for secrets

### For Production Deployment

1. **Choose Deployment Method:**
   - **Fastest:** Railway (5 minutes) - `railway up`
   - **Managed:** Render (10 minutes) - push to main, auto-deploys
   - **Control:** Traditional Server (1-2 hours) - PM2 + Nginx setup

2. **Required Environment Variables:**
   - `NODE_ENV=production`
   - `JOBS_API_PORT=8080`
   - `REDIS_HOST` and `REDIS_PORT`
   - Optional: `SENTRY_DSN`

3. **Deployment Scripts:**
   - `scripts/deploy-traditional-server.sh` for VPS deployment
   - `.github/workflows/deploy.yml` for CI/CD

4. **Documentation:**
   - General overview: `docs/DEPLOYMENT.md`
   - Traditional server: `docs/TRADITIONAL_SERVER_DEPLOYMENT.md`
   - Port migration: `docs/PORT_MIGRATION.md`
   - Dashboard: `public/README.md`

### Breaking Changes

- **Port:** Changed from 3000 to 8080
- **Environment Variable:** `API_PORT` → `JOBS_API_PORT`
- **File Paths:** Pipelines moved to `pipelines/` directory
- **Test Organization:** Tests moved to `tests/` with subdirectories

### Next Steps

1. Deploy dashboard to production (choose deployment method from docs)
2. Configure domain and SSL (if using traditional server)
3. Set up monitoring and alerts
4. Configure automated backups
5. Review security checklist in deployment docs

---

**Last Updated:** 2025-11-17
**Version:** 1.1.0 (Dashboard Release)
**Documentation Status:** Complete
**Deployment Ready:** ✅ Yes

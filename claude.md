# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Automation pipelines built on the **AlephAuto** job queue framework:

1. **Code Consolidation System** - Duplicate code detection using ast-grep, pydantic, multi-layer similarity
2. **Documentation Enhancement** - Schema.org structured data injection for README files
3. **Git Activity Reporter** - Weekly/monthly git activity reports with visualizations
4. **Gitignore Manager** - Batch `.gitignore` updates across git repositories
5. **Repomix Automation** - Automated repomix file generation for git repository roots only
6. **Plugin Manager** - Claude Code plugin audit, duplicate detection, and cleanup recommendations
7. **Claude Health Monitor** - Comprehensive Claude Code environment health checks, monitoring, and optimization

All systems use AlephAuto job queue with Sentry error logging, centralized configuration, and event-driven architecture.

## ⚠️ Critical Patterns

**Before making changes:**

1. **Nullish Coalescing:** Use `??` not `||` for numeric options: `maxConcurrent ?? 5` (sidequest/server.js:18)
2. **Field Name:** CodeBlock uses `tags` field, NOT `semantic_tags` (extract_blocks.py:231)
3. **Configuration:** Always use `import { config } from './sidequest/config.js'`, NEVER `process.env` directly
4. **Doppler Required:** All commands must run with `doppler run --` for environment variables
5. **Two-Phase Similarity:** Extract semantic features BEFORE normalization (structural.py:29-93, 422-482)

## Key Commands

### Development
```bash
# Start systems
doppler run -- npm start        # Repomix cron server
npm run dev                     # Development mode with auto-restart

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
doppler run -- pm2 start plugin-management-pipeline.js --name plugin-auditor  # PM2 deployment
./sidequest/plugin-management-audit.sh --detailed  # Manual shell script audit

# Claude environment health
npm run claude:health                   # Run comprehensive health check
npm run claude:health:detailed          # Run detailed health check
npm run claude:health:quick             # Quick check (skip performance/plugins)
npm run claude:health:schedule          # Cron mode (daily 8 AM)
doppler run -- pm2 start claude-health-pipeline.js --name claude-health  # PM2 deployment

# Duplicate detection
doppler run -- node lib/scan-orchestrator.js <repo-path>
doppler run -- RUN_ON_STARTUP=true node duplicate-detection-pipeline.js
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
node --test tests/unit/caching.test.js                # Caching tests (23, requires Redis)

# Integration tests
node tests/integration/test-automated-pipeline.js     # Full pipeline test
node tests/integration/test-cache-layer.js            # Cache integration
node tests/integration/test-inter-project-scan.js     # Multi-repo scanning

# Duplicate detection accuracy tests
node tests/accuracy/accuracy-test.js --verbose --save-results

# Type checking
npm run typecheck
```

**Test Coverage:** 132 tests, 129 passing (97.7%)
- Sidequest Server: 12/12 ✅
- REST API: 16/16 ✅
- WebSocket: 15/15 ✅
- Accuracy: Precision 100%, Recall 87.50%, F1 93.33%

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
doppler run -- pm2 start duplicate-detection-pipeline.js --name duplicate-scanner

# Test immediately
doppler run -- RUN_ON_STARTUP=true node duplicate-detection-pipeline.js

# Monitor
pm2 status duplicate-scanner
pm2 logs duplicate-scanner
```

**Features:**
- Cron scheduling (2 AM daily by default)
- Repository prioritization (critical, high, medium, low)
- Inter-project and intra-project scanning
- Retry logic with exponential backoff
- Redis caching (30-day TTL)
- Sentry error tracking

### REST API & WebSocket Server

```bash
# Start API server (default port 3000)
doppler run -- node duplicate-detection-pipeline.js

# Test endpoints
curl http://localhost:3000/health
curl http://localhost:3000/api/scan -X POST -H "Content-Type: application/json" \
  -d '{"repositoryPath": "/path/to/repo"}'
```

**Endpoints:**
- `GET /health` - Health check
- `GET /api/status` - System status
- `POST /api/scan` - Trigger repository scan
- `GET /api/scan/:scanId` - Get scan results
- `WebSocket /` - Real-time scan updates

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
# repomix not found
npm install -g repomix

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
├── api/                    # API Gateway Layer
│   ├── server.js          # Express app + WebSocket server
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
│   ├── caching/                          # Redis-backed caching
│   ├── models/                           # Pydantic data models
│   └── config/                           # Configuration loaders
│
├── sidequest/              # Job Queue Framework (AlephAuto)
│   ├── server.js          # Base job queue (extends EventEmitter)
│   ├── config.js          # Centralized configuration
│   ├── logger.js          # Sentry-integrated logging
│   └── doc-enhancement/   # Documentation enhancement workers
│
├── config/                 # Configuration Files
│   └── scan-repositories.json
│
├── .ast-grep/              # AST-Grep Pattern Rules
│   └── rules/             # 18 detection rules (database, api, async, etc.)
│
├── tests/                  # All Tests (Organized by Type)
│   ├── unit/              # Unit tests (10 files, *.test.js)
│   ├── integration/       # Integration tests (8 files, test-*.js)
│   ├── accuracy/          # Accuracy test suite
│   └── scripts/           # Test utility scripts
│
├── scripts/                # Utility & Setup Scripts
├── docs/                   # Documentation
│   ├── CHEAT_SHEET.md
│   ├── DATAFLOW_DIAGRAMS.md
│   └── architecture/
│
└── duplicate-detection-pipeline.js  # Main entry point (root)
```

**Key Files Reference:**
- `duplicate-detection-pipeline.js` - Main duplicate detection entry point
- `lib/scan-orchestrator.js` - 7-stage pipeline coordinator
- `lib/similarity/structural.py` - 2-phase similarity algorithm
- `sidequest/server.js` - AlephAuto job queue base class
- `config/scan-repositories.json` - Repository scan configuration
- `docs/DATAFLOW_DIAGRAMS.md` - Complete architecture diagrams

## Recent Updates (2025-11-17)

### New Features
1. ✅ **Plugin Management System** - Automated Claude Code plugin auditing and cleanup recommendations
   - Worker: `sidequest/plugin-manager.js` (extends SidequestServer)
   - Pipeline: `plugin-management-pipeline.js` (cron scheduling + CLI)
   - Audit script: `sidequest/plugin-management-audit.sh` (bash analysis)
   - Commands: `npm run plugin:audit`, `npm run plugin:audit:detailed`, `npm run plugin:schedule`
   - Features: Duplicate detection, threshold monitoring, actionable recommendations
   - Schedule: Monday 9 AM (configurable via `PLUGIN_CRON_SCHEDULE`)

2. ✅ **Claude Health Monitor** - Comprehensive Claude Code environment monitoring and health checks
   - Worker: `sidequest/claude-health-worker.js` (extends SidequestServer)
   - Pipeline: `claude-health-pipeline.js` (cron scheduling + CLI)
   - Integration: Works with existing `~/.claude/scripts/health.sh`
   - Commands: `npm run claude:health`, `npm run claude:health:detailed`, `npm run claude:health:schedule`
   - Features: Environment validation, config checking, hook analysis, plugin monitoring, performance tracking
   - Health scoring: 0-100 score with actionable recommendations
   - Schedule: Daily 8 AM (configurable via `CLAUDE_HEALTH_CRON_SCHEDULE`)

### Critical Bug Fixes
1. ✅ **Falsy value handling** - Changed `||` to `??` for numeric options (server.js:18)
2. ✅ **Field name mismatch** - Changed `semantic_tags` → `tags` (extract_blocks.py:231)
3. ✅ **Function-based deduplication** - Deduplicate by `file:function_name`, not line (extract_blocks.py:108-163)
4. ✅ **Unified penalty system** - Two-phase architecture: extract features BEFORE normalization (structural.py:16-482)

**Results:** Precision: 100%, Recall: 87.50%, F1: 93.33%, FP Rate: 0%

### Project Organization Improvements
1. ✅ **Test reorganization** - Separated unit tests (`tests/unit/`) from integration tests (`tests/integration/`)
2. ✅ **Scripts directory** - Centralized utility scripts in `scripts/`
3. ✅ **Documentation consolidation** - Moved technical docs to `docs/` (CHEAT_SHEET.md, DATAFLOW_DIAGRAMS.md)
4. ✅ **Architecture alignment** - Directory structure now matches architectural layers from dataflow diagrams
5. ✅ **Updated all references** - package.json, .claude/settings.local.json, test imports

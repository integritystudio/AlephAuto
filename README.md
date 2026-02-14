# Automated Code & Documentation Pipeline

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "Automated Code & Documentation Pipeline",
  "description": "Six automated systems built on the **AlephAuto** job queue framework with Sentry error logging:",
  "dateModified": "2026-01-19T02:09:57.570Z",
  "inLanguage": "en-US"
}
</script>


Six automated systems built on the **AlephAuto** job queue framework with Sentry error logging:

1. **Repomix Pipeline**: Recursively processes all directories in `~/code` with repomix and stores outputs in a matching directory structure
2. **Documentation Enhancement Pipeline**: Automatically adds Schema.org structured data to README files for improved SEO and rich search results
3. **Git Activity Reporter**: Automated weekly/monthly git activity reports with visualizations (fully integrated with AlephAuto)
4. **Gitignore Manager**: Batch updates `.gitignore` files across all git repositories
5. **Codebase Health Scanners**: Detect timeout patterns and analyze root directory clutter for code quality improvements
6. **Dashboard Populate Pipeline**: Populates quality-metrics-dashboard with 7 metrics from Claude Code telemetry (rule-based + LLM-as-Judge → Cloudflare KV)

## Quick Start

### Installation

```bash
# 1. Install dependencies
pnpm install

# 2. Build frontend (React dashboard)
npm run build:frontend

# 3. Configure environment (Doppler recommended, see docs/setup/)
cp .env.example .env
# Edit .env and add your Sentry DSN

# 4. Verify setup
npm run verify
```

**Note**: `repomix` is included as an npm dependency - no global installation required.

### Run Your First Pipeline

```bash
# Repomix - Process all ~/code directories
RUN_ON_STARTUP=true npm start

# Documentation Enhancement - Add Schema.org markup to READMEs
npm run docs:enhance

# Git Activity - Generate weekly development report
npm run git:weekly

# Health Scanners - Detect code quality issues
./lib/scanners/codebase-health-scanner.js ~/code/myproject --scan all
```

## Features Overview

### Core Infrastructure (AlephAuto)
- Job queue system with configurable concurrency (default: 3)
- Event-driven monitoring with real-time status updates
- Sentry integration for error tracking and performance monitoring
- Cron scheduling for automated execution
- Safe dry-run mode for testing
- Structured JSON logging

### Pipeline Summary

| Pipeline | Key Features | Output |
|----------|--------------|--------|
| **Duplicate Detection** | 7-stage multi-language pipeline, semantic analysis, PR creation | HTML/Markdown reports + PRs |
| **Docs Enhancement** | Schema.org injection, SEO measurement, rich results tracking | `./document-enhancement-impact-measurement/` |
| **Git Activity** | Commit analytics, SVG visualizations, JSON export | `~/code/PersonalSite/_reports/` |
| **Repo Cleanup** | Python venvs, temp files, build artifacts removal | Cleanup summary logs |
| **Repomix** | Recursive scanning, .gitignore respect, parallel processing | `./condense/` |
| **Health Scanners** | Timeout detection, AST analysis, migration plans | Markdown/JSON reports |
| **Dashboard Populate** | Rule-based + LLM-as-Judge metrics, KV sync | Cloudflare KV + HTML/JSON reports |

For detailed feature explanations, see [dev/archive/FEATURES.md](dev/archive/FEATURES.md).

---

## Pipeline Documentation

### 1. Duplicate Detection Pipeline

**Purpose:** Automatically detects code duplication across single repositories (intra-project) and multiple repositories (inter-project), generates consolidation suggestions, and optionally creates pull requests for refactoring.

**7-Stage Multi-Language Architecture:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        JAVASCRIPT (Stages 1-2)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  Stage 1: Repository Scanning (repomix)                                     │
│  └── Collects repository metadata, file list, language statistics           │
│                                                                             │
│  Stage 2: Pattern Detection (ast-grep)                                      │
│  └── Applies 18+ AST patterns to identify potential duplicates              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ JSON stdin/stdout
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PYTHON (Stages 3-7)                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  Stage 3: Code Block Extraction                                             │
│  └── Extracts code blocks with Pydantic models, calculates complexity       │
│                                                                             │
│  Stage 4: Semantic Annotation                                               │
│  └── Categorizes code (auth, database, logging, error-handling, etc.)       │
│                                                                             │
│  Stage 5: Similarity Calculation                                            │
│  └── Structural + semantic similarity scoring (exact, near, semantic)       │
│                                                                             │
│  Stage 6: Duplicate Grouping                                                │
│  └── Groups similar code blocks, calculates impact scores                   │
│                                                                             │
│  Stage 7: Report Generation                                                 │
│  └── HTML, Markdown, JSON reports with consolidation suggestions            │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Scan Types:**
- **Intra-project:** Scans a single repository for internal duplicates
- **Inter-project:** Scans multiple repositories to find cross-repo duplicates

**Key Features:**
- Intelligent retry logic with exponential backoff and circuit breaker (max 5 retries)
- Error classification: retryable errors (network, timeout) vs non-retryable (missing files)
- High-impact duplicate detection with configurable threshold alerts
- Auto-PR creation for consolidation suggestions (when `ENABLE_PR_CREATION=true`)
- Repository configuration management (scan frequency, priority, grouping)

**Usage:**
```bash
# Run immediately
doppler run -- RUN_ON_STARTUP=true node sidequest/pipeline-runners/duplicate-detection-pipeline.js

# Start cron server (default: 2 AM daily)
doppler run -- node sidequest/pipeline-runners/duplicate-detection-pipeline.js

# With PR creation enabled
ENABLE_PR_CREATION=true doppler run -- RUN_ON_STARTUP=true node sidequest/pipeline-runners/duplicate-detection-pipeline.js
```

**Output:** `output/reports/` (HTML, Markdown, JSON) + optional GitHub PRs

---

### 2. Schema Enhancement Pipeline

**Purpose:** Automatically injects Schema.org structured data into README files to improve SEO and enable rich search results in Google.

**How It Works:**

```
┌──────────────────────────────────────────────────────────────────┐
│  1. Directory Scanning                                           │
│  └── Recursively finds README.md files (skips node_modules, etc)│
├──────────────────────────────────────────────────────────────────┤
│  2. Content Analysis                                             │
│  └── Analyzes README structure, detects project type             │
├──────────────────────────────────────────────────────────────────┤
│  3. Schema Selection                                             │
│  └── Chooses appropriate Schema.org type (SoftwareApplication,   │
│      TechArticle, HowTo, etc.)                                   │
├──────────────────────────────────────────────────────────────────┤
│  4. JSON-LD Injection                                            │
│  └── Adds invisible structured data to README                    │
├──────────────────────────────────────────────────────────────────┤
│  5. Impact Measurement                                           │
│  └── Tracks SEO improvements and generates reports               │
└──────────────────────────────────────────────────────────────────┘
```

**Schema Types Applied:**
- `SoftwareApplication` - For projects with package.json
- `TechArticle` - For documentation-heavy READMEs
- `HowTo` - For tutorial-style READMEs
- `FAQPage` - For Q&A style documentation

**Usage:**
```bash
# Enhance all READMEs in ~/code
npm run docs:enhance

# Dry run (preview without changes)
npm run docs:enhance:dry

# Test single file
npm run docs:test README.md

# Custom directory
node sidequest/pipeline-runners/schema-enhancement-pipeline.js --dir ~/projects
```

**Output:** `./document-enhancement-impact-measurement/` (JSON reports + modified READMEs)

---

### 3. Git Activity Pipeline

**Purpose:** Generates comprehensive git activity reports with commit analytics, contributor statistics, and SVG visualizations.

**Report Types:**
- **Weekly:** Last 7 days of activity
- **Monthly:** Last 30 days of activity
- **Custom:** Arbitrary date ranges

**Data Collected:**
```
┌──────────────────────────────────────────────────────────────────┐
│  Per Repository:                                                 │
│  ├── Commits (messages, authors, timestamps)                     │
│  ├── Lines changed (additions, deletions)                        │
│  ├── Files modified                                              │
│  └── Branch activity                                             │
├──────────────────────────────────────────────────────────────────┤
│  Aggregated Statistics:                                          │
│  ├── Total commits across all repos                              │
│  ├── Top contributors                                            │
│  ├── Most active repositories                                    │
│  ├── Commit frequency patterns                                   │
│  └── Language breakdown                                          │
└──────────────────────────────────────────────────────────────────┘
```

**Usage:**
```bash
# Weekly report (last 7 days)
npm run git:weekly

# Monthly report (last 30 days)
npm run git:monthly

# Custom date range
node sidequest/pipeline-runners/git-activity-pipeline.js --since 2025-01-01 --until 2025-01-15

# Start scheduled mode (Sunday 8 PM by default)
npm run git:schedule
```

**Output:** `~/code/PersonalSite/_reports/{date}-git-activity-report.md` (Jekyll-formatted) + SVG visualizations in `~/code/PersonalSite/assets/images/git-activity-{year}/`

---

### 4. Repository Cleanup Pipeline

**Purpose:** Automatically removes bloat files and directories across repositories to reclaim disk space.

**What Gets Cleaned:**

| Category | Items Removed |
|----------|---------------|
| **Python Venvs** | `venv/`, `.venv/`, `__pycache__/` |
| **macOS Files** | `.DS_Store`, `._*` files |
| **Build Artifacts** | `dist/`, `build/`, `coverage/`, `.next/`, `.nuxt/` |
| **Temp Files** | `*.log`, `*.tmp`, `.cache/` |
| **Output Files** | Stale repomix output, old reports |

**Safety Features:**
- Dry-run mode for previewing changes
- Respects `.gitignore` patterns
- Skips actively tracked files
- Detailed logging of all deletions

**Usage:**
```bash
# Preview what would be cleaned (dry run)
CLEANUP_DRY_RUN=true doppler run -- npm run cleanup:once

# Run cleanup immediately
RUN_ON_STARTUP=true doppler run -- node sidequest/pipeline-runners/repo-cleanup-pipeline.js

# Start scheduled cleanup (Sunday 3 AM by default)
doppler run -- node sidequest/pipeline-runners/repo-cleanup-pipeline.js
```

**Output:** Cleanup summary logs with disk space reclaimed

---

### 5. Repomix Pipeline

**Purpose:** Recursively processes all directories with repomix and stores outputs in a matching directory structure for AI consumption.

**How It Works:**
1. Scans `~/code` (or configured directory) for repositories
2. Runs repomix on each repository to generate condensed code summaries
3. Stores output in `./condense/` mirroring the source structure

**Usage:**
```bash
# Start scheduled cron (2 AM daily by default)
npm start

# Run immediately
RUN_ON_STARTUP=true npm start

# Development mode (auto-restart)
npm run dev
```

**Output:** `./condense/{repo-name}.txt` files

---

### 6. Codebase Health Scanners

**Purpose:** Detect code quality issues including timeout anti-patterns, root directory clutter, and structural problems.

**Scanner Types:**

| Scanner | What It Detects |
|---------|-----------------|
| **Timeout Detector** | Hardcoded timeouts, missing timeout handling, anti-patterns |
| **Root Directory Analyzer** | File clutter, configuration sprawl, organization issues |
| **AST-Grep Detector** | Pattern-based code issues using 18+ rules |

**Usage:**
```bash
# Run all scanners
./lib/scanners/codebase-health-scanner.js ~/code/myproject --scan all

# Timeout patterns only
./lib/scanners/codebase-health-scanner.js ~/code/myproject --scan timeout

# Root directory analysis
./lib/scanners/codebase-health-scanner.js ~/code/myproject --scan root

# Python timeout scanner (alternative)
python3 lib/scanners/timeout_detector.py ~/code/myproject
```

**Output:** Markdown/JSON reports with migration plans

### 7. Dashboard Populate Pipeline

**Purpose:** Populates the quality-metrics-dashboard with 7 quality metrics derived from Claude Code session telemetry. Runs twice daily via cron.

**3-Step Pipeline:**
1. **derive-evaluations** — Rule-based metrics (tool_correctness, evaluation_latency, task_completion)
2. **judge-evaluations** — LLM-as-Judge metrics (relevance, coherence, faithfulness, hallucination)
3. **sync-to-kv** — Aggregate + upload to Cloudflare Workers KV

**Usage:**
```bash
npm run dashboard:populate             # Run once with --seed (offline)
npm run dashboard:populate:full        # Run once with real LLM judge
npm run dashboard:populate:dry         # Dry run preview
npm run dashboard:populate:schedule    # Start cron scheduler (6 AM/6 PM)
```

**Output:** Cloudflare KV entries + HTML/JSON reports in `output/reports/`

---

## Architecture

### High-Level Overview

```
┌─────────────────────────────────────┐
│     SidequestServer (Base)          │
│  - Job queue management             │
│  - Concurrency control              │
│  - Event emission                   │
│  - Sentry integration               │
└─────────────────────────────────────┘
              ▲
              │ extends
    ┌─────────┴──────────┬──────────────┬──────────────┐
    │                    │              │              │
┌───────────────┐  ┌─────────────────────┐  ┌────────────────┐  ┌────────────────┐
│ RepomixWorker │  │ SchemaEnhancement   │  │ GitActivity    │  │ Gitignore      │
│               │  │ Worker              │  │ Worker         │  │ Manager        │
└───────────────┘  └─────────────────────┘  └────────────────┘  └────────────────┘
```

### Directory Structure

```
jobs/
├── api/                    # REST API & WebSocket Server
│   ├── server.js          # Express app + WebSocket (serves frontend/dist/)
│   ├── routes/            # API endpoints (scans, repositories, reports, jobs)
│   └── middleware/        # Express middleware
│
├── frontend/              # React Dashboard (Vite + TypeScript)
│   ├── src/               # Components, services, store, types
│   └── dist/              # Vite build output (served by Express)
│
├── sidequest/             # AlephAuto Job Queue Framework
│   ├── server.js         # Base job queue manager
│   ├── config.js         # Centralized configuration
│   ├── logger.js         # Sentry-integrated logging
│   ├── *-worker.js       # Job workers (repomix, git-activity, etc.)
│   └── doc-enhancement/  # Documentation enhancement tools
│
├── lib/                   # Processing Layer (Business Logic)
│   ├── scanners/         # Code analysis (repository, AST-grep, health)
│   ├── extractors/       # Python data processing
│   ├── similarity/       # Duplicate detection algorithms
│   ├── reports/          # Report generation
│   └── caching/          # Redis-backed caching (30-day TTL)
│
├── tests/                 # All Tests (unit, integration, accuracy)
├── docs/                  # Documentation
├── config/                # Configuration files
└── .ast-grep/            # AST-Grep pattern rules (18 rules)
```

See [docs/architecture/](docs/architecture/) for detailed architecture documentation and data flow diagrams.

## Configuration

### Environment Variables

```bash
# Core
CODE_BASE_DIR=/Users/username/code    # Base directory for operations
MAX_CONCURRENT=5                      # Max concurrent jobs
LOG_LEVEL=info                        # Logging level

# Cron schedules
CRON_SCHEDULE="0 2 * * *"            # Repomix (2 AM daily)
DOC_CRON_SCHEDULE="0 3 * * *"        # Docs (3 AM daily)
GIT_CRON_SCHEDULE="0 20 * * 0"       # Git Activity (Sunday 8 PM)
DASHBOARD_CRON_SCHEDULE="0 6,18 * * *"  # Dashboard Populate (6 AM/6 PM)
RUN_ON_STARTUP=true                  # Run immediately on startup

# Sentry monitoring
SENTRY_DSN=https://...               # Sentry DSN for error tracking

# Documentation enhancement
FORCE_ENHANCEMENT=true               # Re-enhance files with existing schemas
```

### Cron Schedule Examples

- `*/5 * * * *` - Every 5 minutes (testing)
- `0 2 * * *` - Daily at 2 AM (default)
- `0 0 * * 0` - Weekly on Sunday at midnight

## Usage

### All Pipelines Quick Reference

```bash
# Repomix Automation
npm start                              # Start scheduled cron
npm run dev                            # Development mode (auto-restart)
RUN_ON_STARTUP=true npm start          # Run immediately

# Documentation Enhancement
npm run docs:enhance                   # Enhance all READMEs
npm run docs:enhance:dry              # Dry run (no modifications)
npm run docs:test README.md           # Test single file
node doc-enhancement-pipeline.js --target-dir ~/code/myprojects

# Git Activity Reporter
npm run git:weekly                     # Weekly report (last 7 days)
npm run git:monthly                    # Monthly report (last 30 days)
npm run git:schedule                   # Start scheduled mode
node git-activity-pipeline.js --since 2025-07-07 --until 2025-11-16

# Gitignore Manager
node sidequest/gitignore-repomix-updater.js ~/code --dry-run    # Preview
node sidequest/gitignore-repomix-updater.js ~/code              # Apply

# Health Scanners
./lib/scanners/codebase-health-scanner.js ~/code/myproject --scan timeout
./lib/scanners/codebase-health-scanner.js ~/code/myproject --scan root
./lib/scanners/codebase-health-scanner.js ~/code/myproject --scan all --output report.md

# Python timeout scanner (no ast-grep required)
python3 lib/scanners/timeout_detector.py ~/code/myproject

# Dashboard Populate Pipeline
npm run dashboard:populate             # Run once with --seed (offline)
npm run dashboard:populate:full        # Run once with real LLM judge
npm run dashboard:populate:dry         # Dry run preview
npm run dashboard:populate:schedule    # Start cron (6 AM/6 PM daily)
```

## API Reference

### REST API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/jobs` | GET | Query jobs across all pipelines (filter by status, pagination) |
| `/api/scans` | GET | List all scans |
| `/api/scans/:id` | GET | Get scan details |
| `/api/repositories` | GET | List repositories |
| `/api/reports/:scanId` | GET | Get scan report |
| `/api/pipeline-data-flow` | GET | Pipeline documentation (markdown) |

See [docs/API_REFERENCE.md](docs/API_REFERENCE.md) for complete API documentation.

### WebSocket Events

Real-time job monitoring:

```javascript
const socket = io('http://localhost:3000');

socket.on('job:created', (job) => console.log('Job created:', job.id));
socket.on('job:started', (job) => console.log('Job started:', job.id));
socket.on('job:completed', (job) => console.log('Job completed:', job.id));
socket.on('job:failed', (job) => console.log('Job failed:', job.id));
```

## MCP (Model Context Protocol) Servers

This project uses 4 MCP servers for enhanced AI capabilities:

| Server | Status | Purpose | Transport |
|--------|--------|---------|-----------|
| **Sentry MCP** | ⚠️ Needs Auth | Error tracking, performance monitoring, root cause analysis | HTTP |
| **Redis MCP** | ✓ Connected | Queue management, scan result caching (30-day TTL) | STDIO |
| **TaskQueue MCP** | ✓ Connected | AI task management, workflow structuring | STDIO |
| **Filesystem MCP** | ✓ Connected | Log file access, report analysis | STDIO |

See [docs/MCP_SERVERS.md](docs/MCP_SERVERS.md) for detailed MCP server documentation, setup instructions, and troubleshooting.

## Testing

### Run Tests

```bash
# All unit tests
npm test

# Integration tests
npm run test:integration

# Validate test paths (pre-commit check)
npm run test:validate-paths

# Type checking
npm run typecheck
```

### Test Statistics

- **Unit Tests**: 24+ tests across 2 suites
- **Integration Tests**: Available in `tests/integration/`
- **Accuracy Tests**: Available in `tests/accuracy/`
- **Test Infrastructure**: Using test fixtures with automatic cleanup
- **Path Validation**: Pre-commit hook prevents hardcoded paths

See [dev/archive/TESTING.md](dev/archive/TESTING.md) for complete testing documentation.

## Monitoring & Logging

### Job Logs

- **Completed jobs**: `logs/repomix-{path}-{timestamp}.json`
- **Failed jobs**: `logs/repomix-{path}-{timestamp}.error.json`
- **Run summaries**: `logs/run-summary-{timestamp}.json`

### Sentry Dashboard

Monitor at your Sentry dashboard:
- Job failures with full context
- Performance metrics per job
- Breadcrumb trail for debugging

### Configuration Monitoring

New scripts in `scripts/config-monitoring/`:

```bash
./doppler-setup.sh                    # Interactive Doppler setup
./monitoring-script.sh                # One-time verification
./health-check.sh                     # Live monitoring dashboard (30s refresh)
./verify-analyticsbot-cors.sh         # AnalyticsBot CORS verification
./verify-tcad-status.sh               # TCAD Scraper API verification
```

See `scripts/config-monitoring/README.md` for complete guide.

## Deployment

### Production with PM2

```bash
# Install PM2
npm install -g pm2

# Start with Doppler (recommended - uses production config)
doppler run -c prd -- pm2 start config/ecosystem.config.cjs
pm2 save
pm2 status

# Or start individual pipelines manually
pm2 start index.js --name repomix-cron
pm2 start doc-enhancement-pipeline.js --name doc-enhancement
pm2 start git-activity-pipeline.js --name git-activity

# Save and enable startup
pm2 save
pm2 startup
```

### Production with systemd

See [docs/deployment/](docs/deployment/) for systemd service configurations.

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| **Repomix not found** | `npm install` (included as dependency) |
| **Permission errors** | Check read access: `ls -la ~/code` |
| **Jobs failing** | Check `logs/` directory and Sentry dashboard |
| **No jobs created** | Verify directories exist: `ls ~/code` |
| **Redis connection errors** | Ensure Redis is running: `redis-cli ping` |
| **MCP servers not connecting** | Check server health: `claude mcp list` |

### Excluded Directories

The scanner automatically skips:
- `node_modules`, `.git`, `dist`, `build`, `coverage`
- `.next`, `.nuxt`, `vendor`
- `__pycache__`, `.venv`, `venv`, `target`
- `.idea`, `.vscode`
- All hidden directories (starting with `.`)

Edit `sidequest/directory-scanner.js` to customize exclusions.

## Documentation Links

### Framework & Components
- [AlephAuto Framework](sidequest/README.md)
- [Gitignore Updater](sidequest/GITIGNORE_UPDATER_README.md)
- [Git Activity Reporter](sidequest/GIT-ACTIVITY-REPORTER-README.md)
- [Installation Guide](sidequest/INSTALL.md)
- [Health Scanners](lib/scanners/README.md)

### Architecture & Development
- [Architecture Documentation](docs/architecture/)
- [Component Documentation](docs/components/)
- [Pipeline Data Flow](docs/architecture/pipeline-data-flow.md)
- [API Reference](docs/API_REFERENCE.md)

### Testing & Deployment
- [Testing Guide](dev/archive/TESTING.md)
- [Deployment Guide](docs/deployment/)
- [Configuration Monitoring](scripts/config-monitoring/README.md)

### Historical & Detailed Information
- [Feature Details](dev/archive/FEATURES.md)
- [Changelog](dev/archive/CHANGELOG.md)
- [MCP Server Details](docs/MCP_SERVERS.md)

## Recent Updates

See [dev/archive/CHANGELOG.md](dev/archive/CHANGELOG.md) for complete version history.

### Latest (Version 1.6.8 - 2025-11-30)
- Deployment configuration consistency improvements
- PM2 ecosystem configs now use relative paths (portable across environments)
- All `doppler run` commands use explicit `-c prd` flag for production
- Template alignment between ecosystem.config.js and .cjs

### Version 1.7.0 (2025-11-27)
- Dashboard improvements with error handling and loading states
- Jobs API endpoint for cross-pipeline queries
- Pipeline data flow documentation panel
- Git hooks for documentation maintenance
- Test infrastructure improvements (fixtures migration complete)

### Version 1.6.7 (2025-11-26)
- All production bugs fixed (Doppler, TypeScript, pagination)
- Circuit breaker for Doppler API resilience
- Configuration monitoring scripts added
- Sentry configuration complete across all projects

## License

MIT

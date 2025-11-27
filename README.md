# Automated Code & Documentation Pipeline

Five automated systems built on the **AlephAuto** job queue framework with Sentry error logging:

1. **Repomix Pipeline**: Recursively processes all directories in `~/code` with repomix and stores outputs in a matching directory structure
2. **Documentation Enhancement Pipeline**: Automatically adds Schema.org structured data to README files for improved SEO and rich search results
3. **Git Activity Reporter**: Automated weekly/monthly git activity reports with visualizations (fully integrated with AlephAuto)
4. **Gitignore Manager**: Batch updates `.gitignore` files across all git repositories
5. **Codebase Health Scanners**: Detect timeout patterns and analyze root directory clutter for code quality improvements

## Quick Start

### Installation

```bash
# 1. Install dependencies
npm install

# 2. Configure environment (Doppler recommended, see docs/setup/)
cp .env.example .env
# Edit .env and add your Sentry DSN

# 3. Verify setup
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

### Pipeline Capabilities

| Pipeline | Key Features | Output |
|----------|--------------|--------|
| **Repomix** | Recursive scanning, .gitignore respect, parallel processing | `./condense/` |
| **Docs Enhancement** | Schema.org injection, SEO measurement, rich results tracking | `./document-enhancement-impact-measurement/` |
| **Git Activity** | Commit analytics, SVG visualizations, JSON export | `/tmp/git_activity_*.json` + SVGs |
| **Gitignore Manager** | Batch updates, duplicate detection, dry-run support | `./sidequest/gitignore-update-report-*.json` |
| **Health Scanners** | Timeout detection, AST analysis, migration plans | Markdown/JSON reports |

For detailed feature explanations, see [dev/archive/FEATURES.md](dev/archive/FEATURES.md).

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
│   ├── server.js          # Express app + WebSocket
│   ├── routes/            # API endpoints (scans, repositories, reports, jobs)
│   └── middleware/        # Express middleware
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

# Start all pipelines
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

### Latest (Version 1.7.0 - 2025-11-27)
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

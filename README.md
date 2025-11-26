# Automated Code & Documentation Pipeline

Five automated systems built on the **AlephAuto** job queue framework with Sentry error logging:

1. **Repomix Pipeline**: Recursively processes all directories in `~/code` with repomix and stores outputs in a matching directory structure
2. **Documentation Enhancement Pipeline**: Automatically adds Schema.org structured data to README files for improved SEO and rich search results
3. **Git Activity Reporter**: Automated weekly/monthly git activity reports with visualizations (fully integrated with AlephAuto)
4. **Gitignore Manager**: Batch updates `.gitignore` files across all git repositories
5. **Codebase Health Scanners**: Detect timeout patterns and analyze root directory clutter for code quality improvements

## Features

### Core Infrastructure (AlephAuto)
- **Job Queue System**: Process multiple repositories concurrently with configurable limits
- **Event-Driven Monitoring**: Real-time job status updates and progress tracking
- **Sentry Integration**: Error tracking and performance monitoring
- **Cron Scheduling**: Automated execution at scheduled times
- **Safe Operations**: Dry-run mode for testing before applying changes
- **Structured Logging**: JSON-formatted logs with multiple severity levels

### Repomix Automation
- Recursive directory scanning of `~/code`
- **Respects .gitignore files** - automatically excludes ignored directories and files
- Parallel job processing with configurable concurrency
- Job queue management with status tracking
- Organized output in `sidequest/output/condense/` matching source structure
- Cron-based scheduling (default: 2 AM daily)
- Supports additional ignore patterns beyond .gitignore

### Documentation Enhancement
- Automatic README.md scanning and enhancement
- Schema.org structured data injection (JSON-LD)
- Smart schema type detection (SoftwareApplication, HowTo, APIReference, etc.)
- SEO impact measurement and reporting
- Dry run mode for testing
- Rich search results eligibility tracking

### Gitignore Manager
- Batch `.gitignore` updates across all git repositories
- Adds `repomix-output.xml` to ignore lists
- Detects existing entries to avoid duplicates
- Creates `.gitignore` if it doesn't exist
- Detailed JSON reporting

### Git Activity Reporter
- **AlephAuto Integration**: Fully integrated job queue with event tracking
- Automated weekly/monthly git activity reports
- Visualizations (SVG charts) for commit history
- JSON data export for further analysis
- Configurable date ranges
- Cron scheduling support
- Sentry error tracking and performance monitoring

### Codebase Health Scanners
- **Timeout Pattern Detection**: Find `Promise.race()` without timeout, missing `finally` blocks
- **Root Directory Analysis**: Identify clutter and generate zero-breakage migration plans
- **AST-Grep Integration**: Uses structural code analysis for accurate detection
- **Python Alternative**: Regex-based scanner for environments without ast-grep
- CLI and programmatic usage supported

## Directory Structure

```
jobs/
├── duplicate-detection-pipeline.js             # Main duplicate detection entry point
├── git-activity-pipeline.js                    # Git activity report server
├── package.json                                # Dependencies
├── README.md                                   # This file
├── claude.md                                   # AI assistant context
├── .env                                        # Environment configuration
│
├── api/                                        # REST API & WebSocket Server
│   ├── server.js                              # Express app + WebSocket server
│   ├── routes/                                # API routes
│   │   ├── scans.js                           # Scan endpoints
│   │   ├── repositories.js                    # Repository endpoints
│   │   └── reports.js                         # Report endpoints
│   ├── middleware/                            # Express middleware
│   └── websocket.js                           # WebSocket event broadcasting
│
├── lib/                                        # Processing Layer (Core Business Logic)
│   ├── scan-orchestrator.js                   # 7-stage duplicate detection pipeline
│   ├── inter-project-scanner.js               # Multi-repository scanning
│   ├── scanners/                              # Stage 1-2: Repository & Pattern scanning
│   │   ├── repository-scanner.js              # Repository validation & repomix
│   │   ├── ast-grep-detector.js               # AST-Grep pattern detection (18 rules)
│   │   ├── codebase-health-scanner.js         # CLI wrapper for health scanners
│   │   ├── timeout-pattern-detector.js        # Detect infinite loading bugs
│   │   ├── root-directory-analyzer.js         # Analyze root directory clutter
│   │   └── timeout_detector.py                # Python timeout scanner (no ast-grep)
│   ├── extractors/                            # Stage 3-7: Python data processing
│   │   ├── extract_blocks.py                  # Code block extraction & annotation
│   │   └── semantic_annotator.py              # Semantic categorization
│   ├── similarity/                            # Duplicate detection algorithms
│   │   └── structural.py                      # 2-phase similarity (Levenshtein + penalties)
│   ├── reports/                               # Report generation
│   │   └── report-coordinator.js              # HTML/Markdown/JSON reports
│   ├── caching/                               # Cache layer
│   │   └── cached-scanner.js                  # Redis-backed scan caching (30-day TTL)
│   ├── models/                                # Pydantic data models
│   │   ├── code_block.py                      # CodeBlock model
│   │   ├── duplicate_group.py                 # DuplicateGroup model
│   │   └── consolidation_suggestion.py        # ConsolidationSuggestion model
│   └── config/                                # Configuration management
│       └── repository-config-loader.js        # Load scan-repositories.json
│
├── sidequest/                                  # AlephAuto Job Queue Framework
│   ├── server.js                              # Base job queue manager (extends EventEmitter)
│   ├── config.js                              # Centralized configuration
│   ├── logger.js                              # Sentry-integrated logging
│   ├── repomix-worker.js                      # Repomix job worker
│   ├── git-activity-worker.js                 # Git activity job worker
│   ├── directory-scanner.js                   # Directory scanning utility
│   ├── doc-enhancement/                       # Documentation enhancement
│   │   ├── schema-mcp-tools.js                # Schema.org MCP integration
│   │   └── schema-enhancement-worker.js       # Enhancement job worker
│   └── collect_git_activity.py                # Git activity data collection (Python)
│
├── config/                                     # Configuration Files
│   └── scan-repositories.json                 # Repository scan configuration
│
├── .ast-grep/                                  # AST-Grep Pattern Rules
│   └── rules/                                 # 18 pattern detection rules
│       ├── database-operations.yml
│       ├── express-route-handlers.yml
│       ├── async-patterns.yml
│       └── ... (15 more)
│
├── tests/                                      # All Tests
│   ├── unit/                                  # Unit tests (9 files)
│   │   ├── api-routes.test.js
│   │   ├── sidequest-server.test.js
│   │   ├── filepath-imports.test.js
│   │   └── ... (6 more)
│   ├── integration/                           # Integration tests (8 files)
│   │   ├── test-automated-pipeline.js
│   │   ├── test-cache-layer.js
│   │   ├── test-inter-project-scan.js
│   │   └── ... (5 more)
│   ├── accuracy/                              # Accuracy test suite
│   │   ├── accuracy-test.js
│   │   ├── expected-results.json
│   │   └── fixtures/
│   └── scripts/                               # Test utility scripts
│       ├── test-single-job.js
│       ├── test-sentry-connection.js
│       └── ... (3 more)
│
├── scripts/                                    # Utility & Setup Scripts
│   └── setup-github-pages-dns.js
│
├── docs/                                       # Documentation
│   ├── CHEAT_SHEET.md                         # Quick reference guide
│   ├── DATAFLOW_DIAGRAMS.md                   # Mermaid architecture diagrams
│   ├── architecture/                          # Architecture documentation
│   ├── components/                            # Component documentation
│   └── setup/                                 # Setup guides
│
├── logs/                                       # Runtime logs (gitignored)
├── output/                                     # Generated reports (gitignored)
│   └── reports/                               # Scan reports (HTML/JSON/Markdown)
└── venv/                                       # Python virtual environment
```

## Installation

1. Install dependencies:
```bash
npm install
```

2. Configure environment:
```bash
cp .env.example .env
# Edit .env and add your Sentry DSN
```

3. Verify setup (checks all required dependencies):
```bash
npm run verify
```

**Note**: `repomix` is now included as an npm dependency and will be installed automatically with `npm install`. No global installation is required.

## MCP Servers

This project has the following Model Context Protocol (MCP) servers configured for enhanced AI capabilities:

### Installed MCP Servers

#### 1. Sentry MCP (Remote HTTP) ⚠️ Needs Authentication
- **URL**: https://mcp.sentry.dev/mcp
- **Transport**: HTTP (Remote)
- **Purpose**: Error tracking and performance monitoring integration
- **Features**:
  - OAuth authentication via Sentry organization
  - 16+ tool calls for error analysis
  - Automated root cause analysis with Seer AI
  - Real-time error monitoring and debugging
- **Status**: Configured, requires OAuth authentication
- **Documentation**: https://docs.sentry.io/product/sentry-mcp/

#### 2. Redis MCP ✓ Connected
- **Command**: `uvx --from redis-mcp-server@latest redis-mcp-server --url redis://localhost:6379/0`
- **Transport**: STDIO (Python/uvx)
- **Purpose**: Queue management and data operations
- **Features**:
  - List operations for queues and message brokers
  - Sorted sets for priority queues
  - Redis Streams for event management
  - Full Redis data structure support (strings, hashes, JSON, etc.)
- **Status**: Connected to local Redis instance
- **Prerequisites**: Redis server running on localhost:6379
- **Documentation**: https://github.com/redis/mcp-redis

#### 3. TaskQueue MCP ✓ Connected
- **Command**: `npx -y taskqueue-mcp`
- **Transport**: STDIO (Node.js)
- **Purpose**: AI task management and workflow structuring
- **Features**:
  - Structured task queue for multi-step workflows
  - User approval checkpoints
  - Task state management
  - AI agent workflow guidance
- **Status**: Connected
- **Use Case**: Managing complex AI-driven tasks with approval gates
- **Documentation**: https://www.npmjs.com/package/taskqueue-mcp

#### 4. Filesystem MCP ✓ Connected
- **Command**: `npx -y @modelcontextprotocol/server-filesystem /Users/alyshialedlie/code/jobs`
- **Transport**: STDIO (Node.js)
- **Purpose**: Log file access and filesystem operations
- **Features**:
  - Read/write access to project directory
  - Log file analysis
  - Directory traversal
- **Status**: Connected
- **Scope**: Limited to `/Users/alyshialedlie/code/jobs` directory
- **Use Case**: Accessing and analyzing job logs and outputs

### Managing MCP Servers

#### List All MCP Servers
```bash
claude mcp list
```

#### View Available Tools
```bash
claude mcp tools <server-name>
```

#### Add New MCP Server
```bash
# STDIO transport
claude mcp add --transport stdio <name> -- <command> [args]

# HTTP transport
claude mcp add --transport http <name> <url>
```

#### Remove MCP Server
```bash
claude mcp remove <name>
```

### MCP Integration Points

**Sentry MCP** integrates with:
- Error tracking in `index.js` and `doc-enhancement-pipeline.js`
- Sentry transactions for performance monitoring
- Error breadcrumbs for debugging

**Redis MCP** enables:
- **Scan Result Caching**: Git commit-based caching via `ScanResultCache` class
  - Automatic cache key generation using repository path + commit hash
  - 30-day TTL (configurable)
  - Cache invalidation on repository changes
  - Metadata tracking (cached date, duplicate counts, scan type)
  - Integrated with `CachedScanner` for automatic cache hits/misses
- Queue management for task processing
- Session data management

**TaskQueue MCP** provides:
- Structured workflow for complex job processing
- Approval gates for critical operations
- Multi-step task coordination

**Filesystem MCP** allows:
- AI-driven log analysis
- Automated report generation
- Output file inspection and validation

### Configuration Files

MCP server configurations are stored in:
- **Global**: `~/.claude.json`
- **Project**: `/Users/alyshialedlie/code/jobs/.claude/settings.local.json`

### Troubleshooting MCP Servers

#### Server Not Connecting
```bash
# Check server health
claude mcp list

# View server logs
# Logs are typically in ~/.claude/logs/
```

#### Authentication Issues (Sentry)
The Sentry MCP requires OAuth authentication. You'll be prompted to authenticate when first using Sentry tools.

#### Redis Connection Errors
Ensure Redis is running:
```bash
redis-cli ping  # Should return PONG
```

Start Redis if needed:
```bash
brew services start redis  # macOS with Homebrew
```

## Configuration

### Environment Variables

Edit `.env` file:

**Shared:**
- `SENTRY_DSN`: Your Sentry DSN for error tracking
- `NODE_ENV`: Environment (production/development)
- `RUN_ON_STARTUP`: Set to `true` to run immediately on startup

**Repomix Cron:**
- `CRON_SCHEDULE`: Cron expression for repomix scheduling (default: `0 2 * * *` - 2 AM daily)

**Documentation Enhancement:**
- `DOC_CRON_SCHEDULE`: Cron expression for doc enhancement (default: `0 3 * * *` - 3 AM daily)
- `SCHEMA_MCP_URL`: Optional MCP server URL for schema tools
- `FORCE_ENHANCEMENT`: Set to `true` to re-enhance files with existing schemas

### Cron Schedule Examples

- `*/5 * * * *` - Every 5 minutes (for testing)
- `0 */6 * * *` - Every 6 hours
- `0 2 * * *` - Daily at 2 AM (default)
- `0 0 * * 0` - Weekly on Sunday at midnight
- `0 3 * * 1-5` - Weekdays at 3 AM

## Usage

### Repomix Automation

#### Start the Server

```bash
npm start
```

The server will:
1. Start and wait for the scheduled cron time
2. When triggered, scan all directories in `~/code`
3. Create a job for each directory
4. Process jobs with 3 concurrent workers
5. Save outputs to `condense/` with matching structure
6. Log all results to `logs/`

#### Development Mode

```bash
npm run dev
```

Uses `--watch` flag for auto-restart on file changes.

#### Run Immediately (One-time)

```bash
RUN_ON_STARTUP=true npm start
```

#### Test with Frequent Runs

```bash
CRON_SCHEDULE="*/5 * * * *" npm start
```

## Output Structure

If you have:
```
~/code/
├── project-a/
├── project-b/
└── folder/
    └── project-c/
```

Outputs will be:
```
./condense/
├── project-a/
│   └── repomix-output.txt
├── project-b/
│   └── repomix-output.txt
└── folder/
    └── project-c/
        └── repomix-output.txt
```

## Logging

### Job Logs

Each job creates a log file in `logs/`:
- `logs/repomix-{path}-{timestamp}.json` - Completed jobs
- `logs/repomix-{path}-{timestamp}.error.json` - Failed jobs

### Run Summaries

After each complete run:
- `logs/run-summary-{timestamp}.json` - Statistics and duration

### Sentry Integration

All errors and performance metrics are automatically sent to Sentry:
- Job failures with full context
- Performance transactions for each job
- Breadcrumbs for debugging

## Job Management & Architecture

### AlephAuto Framework

All pipelines are built on the **AlephAuto** job queue framework (in `sidequest/`), providing:

- **Job queuing** with configurable concurrency (default: 3)
- **Job status tracking** (queued, running, completed, failed)
- **Event emitters** for monitoring
- **Automatic retry logic** (can be extended)
- **Job history** and statistics
- **Sentry integration** for error tracking
- **Centralized configuration** via `sidequest/config.js`
- **Structured logging** via `sidequest/logger.js`

### Architecture Pattern

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
│               │  │ Worker              │  │ Worker ⭐      │  │ Manager        │
└───────────────┘  └─────────────────────┘  └────────────────┘  └────────────────┘
```

### Component Roles

**`sidequest/server.js`** - Base job execution engine
- Event-driven job lifecycle: `created` → `queued` → `running` → `completed/failed`
- Configurable concurrency limits
- Sentry error tracking and performance monitoring
- JSON logging to `./logs/` directory

**`sidequest/config.js`** - Centralized configuration
- Environment variable management
- Default values and validation
- Used by all pipelines

**`sidequest/logger.js`** - Sentry-integrated logging
- Structured JSON logging with Pino
- Automatic Sentry error capture
- Component-specific loggers

**`sidequest/repomix-worker.js`** - Repomix job executor
- Executes repomix CLI securely (command injection protected)
- Manages output directory structure
- 10-minute timeout, 50MB buffer for large outputs

**`sidequest/directory-scanner.js`** - Directory traversal
- Recursive scanning with depth limits
- Configurable exclusion patterns
- Statistical reporting

**`sidequest/data-discovery-report-pipeline.js`** - Documentation enhancement pipeline
- README file discovery via `READMEScanner`
- Schema.org markup generation via `SchemaMCPTools`
- Cron scheduling support

**`sidequest/gitignore-repomix-updater.js`** - Batch gitignore management
- Git repository detection
- Safe file modification with dry-run support
- Detailed reporting

**`sidequest/git-activity-worker.js`** - Git activity report job executor ⭐ NEW
- Executes Python git activity script with job queue management
- Manages report generation (weekly, monthly, custom date ranges)
- Tracks output files (JSON data and SVG visualizations)
- 5-minute timeout for large repository scans
- Real-time statistics parsing and reporting

**`sidequest/collect_git_activity.py`** - Git activity data collection (Python backend)
- Python script for git log parsing
- Generates JSON data and SVG visualizations
- Configurable project categories
- Called by GitActivityWorker

### Job Events

All workers emit standard job lifecycle events:

```javascript
worker.on('job:created', (job) => { /* ... */ });
worker.on('job:started', (job) => { /* ... */ });
worker.on('job:completed', (job) => { /* ... */ });
worker.on('job:failed', (job) => { /* ... */ });
```

### Configuration

All pipelines use the centralized configuration system:

```javascript
import { config } from './sidequest/config.js';

// ✅ Correct - Use centralized config
const maxConcurrent = config.maxConcurrent;
const sentryDsn = config.sentryDsn;

// ❌ Incorrect - Don't use process.env directly
const dsn = process.env.SENTRY_DSN;  // WRONG
```

## Excluded Directories

The scanner automatically skips:
- `node_modules`
- `.git`
- `dist`, `build`, `coverage`
- `.next`, `.nuxt`
- `vendor`
- `__pycache__`, `.venv`, `venv`
- `target`
- `.idea`, `.vscode`
- All hidden directories (starting with `.`)

Edit `sidequest/directory-scanner.js` to customize exclusions.

## Monitoring

### View Job Statistics

Jobs are tracked in real-time. Check console output or view `logs/` for details.

### Sentry Dashboard

Monitor errors and performance at your Sentry dashboard:
- Job failures and errors
- Performance metrics per job
- Breadcrumb trail for debugging

## Troubleshooting

### Repomix not found

Ensure repomix is installed:
```bash
npm install -g repomix
```

### Permission errors

Ensure the script has read access to `~/code`:
```bash
ls -la ~/code
```

### Jobs failing

Check:
1. `logs/` directory for error logs
2. Sentry dashboard for detailed error traces
3. Ensure repomix can run in each directory manually

### No jobs created

Verify directories exist:
```bash
ls ~/code
```

Check console for scanner warnings.

## Customization

### Change Concurrency

Edit `index.js`:
```javascript
this.worker = new RepomixWorker({
  maxConcurrent: 5, // Change from 3 to 5
  // ...
});
```

### Change Base Directory

Edit `index.js`:
```javascript
this.scanner = new DirectoryScanner({
  baseDir: '/path/to/other/directory',
  // ...
});
```

### Add Custom Exclusions

Edit `index.js` or `sidequest/directory-scanner.js`:
```javascript
excludeDirs: [
  'node_modules',
  'custom_exclude',
  // ...
],
```

---

## Documentation Enhancement Pipeline

Automatically enhances README files with Schema.org structured data for improved SEO and rich search results.

### Quick Start

#### Run on Inventory Directory (Default)

```bash
npm run docs:enhance
```

This will:
1. Scan `~/code/Inventory` for README files
2. Enhance each README with Schema.org markup
3. Save impact reports
4. Generate summary statistics

#### Dry Run (No File Modifications)

```bash
npm run docs:enhance:dry
```

Preview changes without modifying files.

#### Test Single README

```bash
npm run docs:test README.md --dry-run
```

Or specify a path:

```bash
node test/test-single-enhancement.js ~/code/myproject/README.md
```

#### Custom Target Directory

```bash
node doc-enhancement-pipeline.js --target-dir ~/code/myprojects
```

#### Run with Cron Scheduling

```bash
RUN_ON_STARTUP=true node doc-enhancement-pipeline.js
```

Server will run immediately, then schedule daily runs at 3 AM.

### Schema Types

The pipeline automatically detects and applies appropriate Schema.org types:

| Content Type | Schema Type | Rich Results |
|-------------|-------------|--------------|
| Test documentation | `HowTo` | How-to guides |
| API documentation | `APIReference` | Technical articles |
| Software projects | `SoftwareApplication` | Software apps |
| Code repositories | `SoftwareSourceCode` | Code repositories |
| Tutorials/guides | `HowTo` | How-to guides |
| General docs | `TechArticle` | Technical articles |

### Schema Detection Logic

The pipeline uses intelligent heuristics:

1. **Path Analysis**: Checks directory and file names
2. **Content Analysis**: Scans README content for keywords
3. **Context Analysis**: Detects languages, project type, git info
4. **Type Selection**: Chooses most appropriate Schema.org type

### Generated Schema Properties

Common properties added:

- `@context`: "https://schema.org"
- `@type`: Detected schema type
- `name`: Extracted from first heading
- `description`: First paragraph or auto-generated
- `programmingLanguage`: Detected languages
- `codeRepository`: Git remote URL (if available)
- `applicationCategory`: For software applications
- `operatingSystem`: For software applications

### Impact Measurement

Each enhancement generates an impact report with:

**Metrics:**
- Original content size
- Enhanced content size
- Number of schema properties
- SEO improvements count
- Rich results eligibility

**SEO Improvements Tracked:**
- Structured name/title
- Structured description
- Code repository linking
- Programming language specification

**Impact Score (0-100):**
- **80-100**: Excellent
- **60-79**: Good
- **40-59**: Fair
- **0-39**: Needs Improvement

### Output Files

#### Enhanced READMEs
Location: `document-enhancement-impact-measurement/enhanced-readmes/`

Copies of enhanced README files with Schema.org markup injected after the first heading.

#### Impact Reports
Location: `document-enhancement-impact-measurement/impact-reports/`

JSON files with detailed analysis:
```json
{
  "relativePath": "README.md",
  "schema": { ... },
  "impact": {
    "impactScore": 85,
    "rating": "Excellent",
    "seoImprovements": [...],
    "richResultsEligibility": [...],
    "metrics": { ... }
  },
  "timestamp": "2025-11-09T01:28:52.766Z"
}
```

#### Enhancement Summary
Location: `document-enhancement-impact-measurement/enhancement-summary-*.json`

Overall run statistics:
```json
{
  "timestamp": "2025-11-09T01:30:00.000Z",
  "enhancement": {
    "enhanced": 15,
    "skipped": 3,
    "failed": 0,
    "total": 18,
    "successRate": "100.00"
  },
  "jobs": {
    "total": 18,
    "completed": 18,
    "failed": 0
  }
}
```

### Example Enhancement

**Before:**
```markdown
# My Project

This is a cool project that does amazing things.

## Features
...
```

**After:**
```markdown
# My Project

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "My Project",
  "description": "This is a cool project that does amazing things.",
  "programmingLanguage": [
    {
      "@type": "ComputerLanguage",
      "name": "JavaScript"
    }
  ],
  "applicationCategory": "DeveloperApplication",
  "operatingSystem": "Cross-platform"
}
</script>

This is a cool project that does amazing things.

## Features
...
```

### MCP Tool Integration

The pipeline integrates with Schema.org MCP tools:

- **`getSchemaType`**: Determines the best Schema.org type for content
- **`generateSchema`**: Creates JSON-LD markup with appropriate properties
- **`validateSchema`**: Validates schema structure and required fields
- **`analyzeSchemaImpact`**: Measures SEO improvements and rich results eligibility

### Validation

Each schema is validated for:
- Required `@context` and `@type` fields
- Valid JSON-LD structure
- Recommended properties presence

Warnings are logged for missing recommended properties.

### Advanced Usage

#### Force Re-enhancement

Re-enhance files that already have schemas:

```bash
FORCE_ENHANCEMENT=true npm run docs:enhance
```

#### Custom Schema Logic

Edit `sidequest/doc-enhancement/schema-mcp-tools.js` to customize:
- Schema type detection
- Property generation
- Impact scoring

### Performance

- **Concurrency**: 2 concurrent jobs (configurable)
- **Average time**: 0.5-2s per README
- **Memory usage**: Minimal (<50MB for 100 files)

Adjust concurrency in `doc-enhancement-pipeline.js`:
```javascript
maxConcurrent: 5, // Increase for faster processing
```

### Documentation Enhancement Troubleshooting

#### No READMEs found
Check that target directory exists and contains README files:
```bash
ls -R ~/code/Inventory | grep -i readme
```

#### Schema validation errors
Check logs for validation details:
```bash
ls -lht logs/*.error.json | head -5
```

#### Jobs failing
1. Check Sentry dashboard for errors
2. Review log files in `logs/`
3. Run single file test to isolate issue

---

## Gitignore Manager

Batch update `.gitignore` files across all git repositories to exclude repomix output files.

### Quick Start

#### Preview Changes (Dry Run)

```bash
node sidequest/gitignore-repomix-updater.js ~/code --dry-run
```

#### Apply Changes

```bash
node sidequest/gitignore-repomix-updater.js ~/code
```

### What It Does

- Recursively finds all git repositories in a directory tree
- Checks if `repomix-output.xml` is already in `.gitignore`
- Adds the entry with a descriptive comment if not present
- Creates `.gitignore` if it doesn't exist
- Generates detailed JSON report of all changes

### Output

The script generates:

1. **Console output** - Progress and actions taken
2. **Summary statistics** - Total repos, added, skipped, errors
3. **JSON report** - `sidequest/gitignore-update-report-{timestamp}.json`

### Example Output

```
Scanning for git repositories in: /Users/username/code
Dry run mode: NO

Found 15 git repositories

Processing: /Users/username/code/project1
  -> added: Entry added successfully

Processing: /Users/username/code/project2
  -> skipped: Entry already exists

=== SUMMARY ===
Total repositories found: 15
Added: 10
Skipped (already exists): 4
Errors: 1

Results saved to: gitignore-update-report-1234567890.json
```

### Programmatic Usage

```javascript
import { GitignoreRepomixUpdater } from './sidequest/gitignore-repomix-updater.js';

const updater = new GitignoreRepomixUpdater({
  baseDir: '/path/to/projects',
  dryRun: true,
  maxDepth: 10,
});

const results = await updater.processRepositories();
console.log(results.summary);
```

See [sidequest/GITIGNORE_UPDATER_README.md](sidequest/GITIGNORE_UPDATER_README.md) for detailed documentation.

---

## Git Activity Reporter

Automated weekly/monthly git activity reporting with visualizations, **fully integrated with AlephAuto** job queue framework.

### Quick Start

#### Weekly Report (Last 7 Days)

```bash
# Using npm script
npm run git:weekly

# Or directly
node git-activity-pipeline.js --weekly

# Run immediately with RUN_ON_STARTUP
RUN_ON_STARTUP=true npm run git:weekly
```

#### Monthly Report (Last 30 Days)

```bash
npm run git:monthly

# Or directly
node git-activity-pipeline.js --monthly
```

#### Custom Date Range

```bash
node git-activity-pipeline.js --since 2025-07-07 --until 2025-11-16
```

#### Scheduled Mode (Cron)

```bash
# Start scheduled weekly reports (Sunday 8 PM by default)
npm run git:schedule

# Or with custom schedule
GIT_CRON_SCHEDULE="0 20 * * 0" npm run git:schedule
```

### Features

- **AlephAuto Integration**: Full job queue with event tracking, concurrency control, and error handling
- **Sentry Monitoring**: Automatic error tracking and performance monitoring
- **Data Collection**: Scans all git repositories for commits, additions, deletions
- **Visualizations**: Generates SVG charts (commit timeline, language breakdown, repository activity)
- **JSON Export**: Structured data for further analysis
- **Event-Driven**: Real-time job status updates via event emitters
- **Configurable**: Project categories, scan depth, date ranges

### Output Files

- **Visualizations**: `~/code/PersonalSite/assets/images/git-activity-{year}/*.svg`
- **JSON Data**: `/tmp/git_activity_weekly_*.json` or `/tmp/git_activity_monthly_*.json`
- **Logs**: Job logs in `./logs/` directory (JSON format)

### AlephAuto Job Events

Monitor report generation in real-time:

```javascript
import { GitActivityPipeline } from './git-activity-pipeline.js';

const pipeline = new GitActivityPipeline();

pipeline.worker.on('job:created', (job) => {
  console.log(`Report job created: ${job.id}`);
});

pipeline.worker.on('job:completed', (job) => {
  console.log(`Report completed!`);
  console.log(`Total commits: ${job.result.stats.totalCommits}`);
  console.log(`Repositories scanned: ${job.result.stats.totalRepositories}`);
  console.log(`Files generated: ${job.result.outputFiles.length}`);
});

await pipeline.runReport({ reportType: 'weekly' });
```

### Programmatic Usage

```javascript
import { GitActivityWorker } from './sidequest/git-activity-worker.js';

const worker = new GitActivityWorker({
  maxConcurrent: 2,
  codeBaseDir: '/path/to/code',
});

// Create and run weekly report
const job = worker.createWeeklyReportJob();
await worker.waitForCompletion();

// Or custom report
const customJob = worker.createReportJob({
  reportType: 'custom',
  sinceDate: '2025-07-07',
  untilDate: '2025-11-16',
  generateVisualizations: true,
});
```

### Claude Code Integration

A skill is available for the git activity reporter. Just ask Claude:

```
"Create a weekly git activity report"
"Generate my development summary"
```

See [sidequest/GIT-ACTIVITY-REPORTER-README.md](sidequest/GIT-ACTIVITY-REPORTER-README.md) for detailed documentation.

---

## Testing

Comprehensive test suite covering all major features with proper test fixtures and infrastructure.

### Test Statistics

```
Unit Tests: 24+ tests across 2 suites
- repomix-worker.test.js: 8/8 passing ✅
- mcp-server.test.js: 10-13/16 passing (intermittent MCP server issues)

Integration Tests: Available in tests/integration/
Accuracy Tests: Available in tests/accuracy/

Test Infrastructure: Using test fixtures (createTempRepository)
Path Validation: Pre-commit hook prevents hardcoded paths ✅
```

### Running Tests

```bash
# Run all unit tests
npm test

# Run integration tests
npm run test:integration

# Validate test paths (pre-commit check)
npm run test:validate-paths

# Run specific test file
doppler run -- node --test tests/unit/repomix-worker.test.js
doppler run -- node --test tests/unit/mcp-server.test.js

# Run with verbose output
npm test -- --reporter=spec

# Type checking
npm run typecheck
```

### Test Infrastructure

All tests use the test fixtures system from `tests/fixtures/test-helpers.js`:

```javascript
import { createTempRepository, createMultipleTempRepositories, cleanupRepositories } from '../fixtures/test-helpers.js';

// Create temporary test repository
const testRepo = await createTempRepository('test');
console.log(testRepo.path); // /var/folders/.../alephauto-test-test-abc123

// Cleanup after tests
await testRepo.cleanup();
```

**Key Features:**
- Automatic cleanup in `afterEach` hooks
- Real git repository structure
- No hardcoded `/tmp/` paths
- Pre-commit validation prevents hardcoded paths

See [tests/README.md](tests/README.md) for complete test infrastructure guide.

### Test Suites

#### 1. RepomixWorker Tests (8 tests) ✅
**All passing** - Tests repomix job worker functionality with test fixtures.

**Coverage:**
- Job creation with correct structure
- Unique job ID generation
- Output directory structure creation
- Multiple job queuing
- SidequestServer inheritance
- Event emission
- Custom worker options
- Concurrent job processing

**Migration Status:** ✅ Migrated to use `createTempRepository()` fixtures

#### 2. MCP Server Tests (16 tests) ⚠️
10-13/16 passing - Tests Model Context Protocol server integration.

**Coverage:**
- Server initialization and handshake
- Tools discovery (list available tools)
- Resources discovery
- JSONRPC protocol compliance
- Tool execution and validation
- Error handling
- Capability negotiation

**Known Issues:** Intermittent failures due to MCP server response timing

**Migration Status:** ✅ Already using test fixtures (no migration needed)

#### 3. Additional Test Suites

The following test suites are available in the codebase:

- **DirectoryScanner Tests** - Directory scanning and traversal
- **READMEScanner Tests** - README file discovery and analysis
- **SchemaMCPTools Tests** - Schema.org structured data generation
- **SidequestServer Tests** - Base job queue management
- **Integration Tests** - End-to-end pipeline testing
- **Accuracy Tests** - Duplicate detection accuracy validation

See [tests/README.md](tests/README.md) for complete test documentation.

### Test Quality Metrics

**Infrastructure Quality:**
- ✅ Test fixtures system with automatic cleanup
- ✅ Pre-commit hooks prevent hardcoded paths
- ✅ Real git repository structures in tests
- ✅ Proper async/await patterns
- ✅ Comprehensive error handling coverage

**Execution Characteristics:**
- **Isolation**: Each test uses unique temporary directories
- **Cleanup**: Automatic cleanup in `afterEach` hooks
- **Speed**: Fast execution with minimal overhead
- **Reliability**: Deterministic results (except MCP server timing issues)

**Best Practices:**
- No hardcoded `/tmp/` paths
- No shared state between tests
- Proper use of `beforeEach`/`afterEach`
- Clear, descriptive test names
- Comprehensive assertions

---

## Quick Reference

### All Available Pipelines

| Pipeline | Command | Schedule | Output |
|----------|---------|----------|--------|
| **Repomix** | `npm start` | 2 AM daily | `./condense/` |
| **Docs Enhancement** | `npm run docs:enhance` | 3 AM daily | `./document-enhancement-impact-measurement/` |
| **Git Activity** ⭐ | `npm run git:weekly` | Sunday 8 PM | `/tmp/git_activity_*.json` + SVGs |
| **Gitignore Manager** | `node sidequest/gitignore-repomix-updater.js ~/code` | On-demand | `./sidequest/gitignore-update-report-*.json` |
| **Health Scanners** | `./lib/scanners/codebase-health-scanner.js <path>` | On-demand | Markdown/JSON reports |

### Quick Commands

```bash
# Repomix - Run immediately
RUN_ON_STARTUP=true npm start

# Documentation - Enhance all READMEs
npm run docs:enhance

# Documentation - Dry run first
npm run docs:enhance:dry

# Documentation - Test single file
npm run docs:test path/to/README.md

# Gitignore - Preview changes
node sidequest/gitignore-repomix-updater.js ~/code --dry-run

# Gitignore - Apply changes
node sidequest/gitignore-repomix-updater.js ~/code

# Git Activity - Weekly report (AlephAuto integrated) ⭐
npm run git:weekly
RUN_ON_STARTUP=true npm run git:weekly  # Run immediately

# Git Activity - Monthly report
npm run git:monthly

# Git Activity - Custom date range
node git-activity-pipeline.js --since 2025-07-07 --until 2025-11-16

# Git Activity - Scheduled mode (cron)
npm run git:schedule
GIT_CRON_SCHEDULE="0 20 * * 0" npm run git:schedule  # Custom schedule

# Health Scanners - Timeout patterns
./lib/scanners/codebase-health-scanner.js ~/code/myproject --scan timeout

# Health Scanners - Root directory analysis
./lib/scanners/codebase-health-scanner.js ~/code/myproject --scan root

# Health Scanners - All scans
./lib/scanners/codebase-health-scanner.js ~/code/myproject --scan all --output report.md

# View all test results
npm test

# Type checking
npm run typecheck
```

### Environment Variables

```bash
# Core configuration
CODE_BASE_DIR=/Users/username/code    # Base directory for all operations
MAX_CONCURRENT=5                      # Max concurrent jobs
LOG_LEVEL=info                        # Logging level (debug, info, warn, error)

# Cron schedules
CRON_SCHEDULE="0 2 * * *"            # Repomix (2 AM daily)
DOC_CRON_SCHEDULE="0 3 * * *"        # Docs (3 AM daily)
GIT_CRON_SCHEDULE="0 20 * * 0"       # Git Activity (Sunday 8 PM) ⭐
RUN_ON_STARTUP=true                  # Run immediately on startup

# Sentry monitoring
SENTRY_DSN=https://...               # Sentry DSN for error tracking

# Documentation enhancement
FORCE_ENHANCEMENT=true               # Re-enhance files with existing schemas
```

### Documentation Links

- **AlephAuto Framework**: [sidequest/README.md](sidequest/README.md)
- **Gitignore Updater**: [sidequest/GITIGNORE_UPDATER_README.md](sidequest/GITIGNORE_UPDATER_README.md)
- **Git Activity Reporter**: [sidequest/GIT-ACTIVITY-REPORTER-README.md](sidequest/GIT-ACTIVITY-REPORTER-README.md)
- **Installation Guide**: [sidequest/INSTALL.md](sidequest/INSTALL.md)

---

## Production Deployment

### Using PM2

Run all scheduled pipelines:

```bash
# Install PM2 globally
npm install -g pm2

# Start all pipelines
pm2 start index.js --name repomix-cron
pm2 start doc-enhancement-pipeline.js --name doc-enhancement
pm2 start git-activity-pipeline.js --name git-activity  # ⭐ NEW

# Start AlephAuto main server (if using sidequest/index.js)
pm2 start sidequest/index.js --name alephauto

# Save PM2 configuration
pm2 save

# Enable PM2 startup on boot
pm2 startup
```

**Note**: The Git Activity pipeline runs in scheduled mode via PM2, no need for separate cron configuration.

### Using systemd

Create `/etc/systemd/system/repomix-cron.service`:
```ini
[Unit]
Description=Repomix Cron Sidequest Server
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/Users/alyshialedlie/code/jobs
ExecStart=/usr/bin/node index.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Create `/etc/systemd/system/doc-enhancement.service`:
```ini
[Unit]
Description=Documentation Enhancement Pipeline
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/Users/alyshialedlie/code/jobs
ExecStart=/usr/bin/node doc-enhancement-pipeline.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Create `/etc/systemd/system/git-activity.service`:
```ini
[Unit]
Description=Git Activity Report Pipeline
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/Users/alyshialedlie/code/jobs
ExecStart=/usr/bin/node git-activity-pipeline.js
Restart=always
Environment=NODE_ENV=production
Environment=GIT_CRON_SCHEDULE="0 20 * * 0"

[Install]
WantedBy=multi-user.target
```

Enable and start all services:
```bash
sudo systemctl enable repomix-cron doc-enhancement git-activity
sudo systemctl start repomix-cron doc-enhancement git-activity
sudo systemctl status repomix-cron
sudo systemctl status doc-enhancement
sudo systemctl status git-activity
```

**Note**: Gitignore Manager is an on-demand tool and doesn't require a systemd service.

---

## Codebase Health Scanners

Detect infinite loading bugs and analyze root directory clutter for code quality improvements.

### Quick Start

```bash
# Install ast-grep (required for JS scanners)
npm install -g @ast-grep/cli

# Run timeout pattern scan
./lib/scanners/codebase-health-scanner.js ~/code/myproject --scan timeout

# Run root directory analysis
./lib/scanners/codebase-health-scanner.js ~/code/myproject --scan root

# Run all scans with report output
./lib/scanners/codebase-health-scanner.js ~/code/myproject --scan all --output report.md

# Python version (no ast-grep required)
python3 lib/scanners/timeout_detector.py ~/code/myproject
```

### Patterns Detected

**Timeout Issues (HIGH severity):**
- `Promise.race()` without timeout wrapper
- `setLoading(true)` without `finally` block
- Async functions without error handling

**Root Directory Clutter:**
- Excessive files in project root
- Categorizes by type (Python, JS, configs, data)
- Generates migration plan with exact import updates

### Integration Options

**Pre-commit hook:**
```bash
node ~/code/jobs/lib/scanners/codebase-health-scanner.js . --scan timeout --json
```

**PM2 scheduled job:**
```javascript
{
  name: 'health-scanner',
  script: './lib/scanners/codebase-health-scanner.js',
  args: '~/code/myproject --scan all --output output/health.md',
  cron_restart: '0 2 * * *',
  autorestart: false
}
```

See `lib/scanners/README.md` for detailed documentation.

## License

MIT

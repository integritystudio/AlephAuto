# AlephAuto

Node.js automation toolkit for managing code repositories at scale.

## Overview

AlephAuto provides eleven production-ready automation pipelines for managing multiple code repositories:

1. **Duplicate Detection** - 7-stage multi-language pipeline (JS + Python) for code duplication detection
2. **Schema Enhancement** - Schema.org markup injection for better SEO
3. **Git Activity Reporter** - Weekly/monthly reports with commit analytics
4. **Repository Cleanup** - Automated repo maintenance and cleanup
5. **Repomix** - Automated code condensation across all repositories
6. **Codebase Health** - Code quality scanning and health metrics
7. **Dashboard Populate** - Quality metrics pipeline (rule-based + LLM-as-Judge → Cloudflare KV)
8. **Bugfix Audit** - 5-stage bug detection, security audit, and fix implementation
9. **Gitignore Update** - Batch `.gitignore` updates across multiple repos
10. **Plugin Management** - Plugin audit and management automation
11. **Test Refactor** - Automated test suite modularization and utility generation

Built on a robust job queue architecture with Sentry error tracking, event-driven monitoring, and configurable concurrency.

## Features

- 🔄 **Job Queue System** - Process multiple repositories concurrently with configurable limits
- 📊 **Event-Driven Monitoring** - Real-time job status updates and progress tracking
- 🐛 **Sentry Integration** - Error tracking and performance monitoring
- ⏰ **Cron Scheduling** - Automated execution at scheduled times
- 🔒 **Safe Operations** - Dry-run mode for testing before applying changes
- 📝 **Structured Logging** - JSON-formatted logs with multiple severity levels
- 🎯 **Flexible Configuration** - Environment variable based configuration

## Prerequisites

- **Node.js** >= 22.0.0
- **repomix** CLI tool - [Installation guide](https://github.com/yamadashy/repomix)
- **Sentry account** (optional) - For error tracking

## Installation

```bash
# Clone the repository
git clone git@github.com:aledlie/AlephAuto.git
cd AlephAuto

# Install dependencies
npm install

# Install repomix globally
npm install -g repomix
# OR
brew install repomix

# Configure environment
cp .env.example .env
# Edit .env with your settings
```

## Configuration

All configuration is managed through environment variables. See `.env.example` for complete documentation.

### Key Configuration Options

```bash
# Base directory containing repositories
CODE_BASE_DIR=/Users/username/code

# Maximum concurrent jobs
MAX_CONCURRENT=5

# Cron schedules
CRON_SCHEDULE="0 2 * * *"  # 2 AM daily
DOC_CRON_SCHEDULE="0 3 * * *"  # 3 AM daily

# Sentry error tracking
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id

# Logging
LOG_LEVEL=info
```

## Usage

### Repomix Pipeline (Automated Code Condensation)

Scans all repositories in your code directory and generates condensed versions using repomix.

```bash
# Run once immediately
node --strip-types sidequest/core/index.ts

# Run on schedule (configured via CRON_SCHEDULE)
RUN_ON_STARTUP=false node --strip-types sidequest/core/index.ts

# Run with custom configuration
CODE_BASE_DIR=/custom/path MAX_CONCURRENT=3 node --strip-types sidequest/core/index.ts
```

**Scheduled execution**: By default, runs at 2 AM daily. Configure via `CRON_SCHEDULE` environment variable.

**Output location**: `./sidequest/output/condense/` (configurable via `OUTPUT_BASE_DIR`)

### Documentation Enhancement Pipeline

Scans README files and adds Schema.org JSON-LD markup for better SEO.

```bash
# Run the documentation enhancement pipeline
node --strip-types sidequest/pipeline-runners/schema-enhancement-pipeline.ts

# Run with custom target directory
CODE_BASE_DIR=/path/to/repos node --strip-types sidequest/pipeline-runners/schema-enhancement-pipeline.ts
```

**Scheduled execution**: By default, runs at 3 AM daily. Configure via `DOC_CRON_SCHEDULE`.

**Features**:
- Automatic schema type detection (HowTo, APIReference, SoftwareApplication, etc.)
- Extracts metadata from package.json, git repositories
- Dry-run mode for testing

### Gitignore Manager

Batch update `.gitignore` files across all git repositories.

```bash
# Preview changes (dry-run mode)
node --strip-types sidequest/utils/gitignore-repomix-updater.ts ~/code --dry-run

# Apply changes
node --strip-types sidequest/utils/gitignore-repomix-updater.ts ~/code

# Custom path
node --strip-types sidequest/utils/gitignore-repomix-updater.ts /path/to/repos
```

**What it does**:
- Recursively finds all git repositories
- Adds `repomix-output.xml` to `.gitignore` with descriptive comment
- Detects existing entries to avoid duplicates
- Generates detailed JSON report

**Reports**: Saved as `gitignore-update-report-{timestamp}.json`

See [GITIGNORE_UPDATER_README.md](./GITIGNORE_UPDATER_README.md) for detailed documentation.

### Test Refactor Pipeline

Analyzes test suites for duplication patterns and generates modular utility files.

```bash
# Refactor all test suites in your code directory
node --strip-types sidequest/pipeline-runners/test-refactor-pipeline.ts

# Refactor a single project
node --strip-types sidequest/pipeline-runners/test-refactor-pipeline.ts /path/to/project

# Analysis only (dry-run mode)
DRY_RUN=true node --strip-types sidequest/pipeline-runners/test-refactor-pipeline.ts
```

**Scheduled execution**: By default, runs at 4 AM every Sunday. Configure via `TEST_REFACTOR_CRON`.

**What it generates**:
- `assertions.ts` - Link validation helpers (expectExternalLink, expectMailtoLink, etc.)
- `semantic-validators.ts` - HTML structure validators (expectSectionWithId, expectHeadingLevel, etc.)
- `form-helpers.ts` - Form testing utilities (fillContactForm, expectFormAccessibility, etc.)
- `test-constants.ts` - Extracted hardcoded strings
- `e2e/fixtures/navigation.ts` - Playwright helpers

**Features**:
- Automatic framework detection (Vitest, Jest, Playwright)
- Pattern analysis for refactoring recommendations
- Optional Git workflow with automatic PR creation

## Architecture

### Job Queue Pattern

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
    ┌─────────┴──────────┐
    │                    │
┌───────────────┐  ┌─────────────────────┐  ┌──────────────────┐
│ RepomixWorker │  │ SchemaEnhancement   │  │ TestRefactor     │
│               │  │ Worker              │  │ Worker           │
└───────────────┘  └─────────────────────┘  └──────────────────┘
```

### BasePipeline Pattern

Five pipeline runners extend `BasePipeline<TWorker>` (`sidequest/pipeline-runners/base-pipeline.ts`) for shared scheduling and stats:

```typescript
import { BasePipeline } from './base-pipeline.ts';
import { RepomixWorker } from '../workers/repomix-worker.ts';

class RepomixPipeline extends BasePipeline<RepomixWorker> {
  constructor() {
    super(new RepomixWorker());
  }
}
```

`BasePipeline` provides:
- `scheduleCron(schedule, handler)` — validate + schedule + error-wrap
- `waitForCompletion()` — polls `worker.getStats()` until queue drains
- `getStats()` — delegates to `worker.getStats(): JobStats`

### JobRepository

All database access goes through `jobRepository` (singleton facade), never `database.ts` directly:

```typescript
// Root-relative (from project root)
import { jobRepository } from './sidequest/core/job-repository.ts';

await jobRepository.saveJob(job);                      // persist
const job = jobRepository.getJob(id);                  // returns camelCase
const count = jobRepository.getJobCount({ status });   // COUNT(*) query
```

Returns camelCase objects (`job.pipelineId`, `job.createdAt`). Never access `job.pipeline_id`.

### Constants Hierarchy

```
units.ts (primitives: TIME_MS, SECONDS, BYTES, PERCENTILE)
  └→ constants.ts (domain: TIMEOUTS, RETRY, CONCURRENCY, VALIDATION, ...)
       └→ config.ts (runtime: env parsing, validateConfig() at startup)
```

Import from `constants.ts` for all timeout/limit/retry values:

```typescript
// Root-relative (from project root)
import { TIMEOUTS, RETRY, CONCURRENCY } from './sidequest/core/constants.ts';
const timeout = TIMEOUTS.PYTHON_PIPELINE_BASE_MS;
```

### Component Overview

**`sidequest/core/server.ts`** - Base job execution engine
- Event-driven job lifecycle: `created` → `queued` → `running` → `completed/failed`
- Configurable concurrency limits
- Sentry error tracking and performance monitoring
- JSON logging to `./logs/` directory

**`sidequest/workers/repomix-worker.ts`** - Repomix job executor
- Executes repomix CLI securely (command injection protected)
- Manages output directory structure
- 10-minute timeout, 50MB buffer for large outputs

**`sidequest/utils/directory-scanner.ts`** - Directory traversal
- Recursive scanning with depth limits
- Configurable exclusion patterns
- Statistical reporting

**`sidequest/core/index.ts`** - Main repomix pipeline application
- Cron scheduling for automated execution
- Scans and processes all repositories
- Event-driven console logging

**`sidequest/pipeline-runners/schema-enhancement-pipeline.ts`** - Documentation enhancement
- README file discovery
- Schema.org markup generation
- MCP tools integration

**`sidequest/utils/gitignore-repomix-updater.ts`** - Batch gitignore management
- Git repository detection
- Safe file modification
- Detailed reporting

**`sidequest/workers/test-refactor-worker.ts`** - Test suite refactoring
- Pattern detection for duplication
- Utility file generation
- Framework auto-detection (Vitest/Jest/Playwright)
- Metrics tracking

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run integration tests
npm run test:integration

# Generate coverage report
npm run test:coverage
```

### Linting

```bash
# Check for issues
npm run lint

# Auto-fix issues
npm run lint:fix
```

### Type Checking

```bash
# Run TypeScript type checking
npm run typecheck
```

### Logging

AlephAuto uses structured logging with Pino. Logs are JSON-formatted and written to both console and files.

**Log levels**: `debug`, `info`, `warn`, `error`

```bash
# Enable debug logging
LOG_LEVEL=debug node --strip-types sidequest/core/index.ts

# Log to custom location
LOG_DIR=/var/log/alephauto node --strip-types sidequest/core/index.ts
```

## Monitoring

### Sentry Integration

Set up Sentry for error tracking:

1. Create a Sentry project at [sentry.io](https://sentry.io)
2. Copy your DSN
3. Set environment variable: `SENTRY_DSN=your-dsn-here`

**What's tracked**:
- All job failures with full context
- Performance metrics for each job
- Breadcrumb trail for debugging
- Environment and version information

### Event Monitoring

Listen to job events programmatically:

```javascript
import { RepomixWorker } from './sidequest/workers/repomix-worker.ts';

const worker = new RepomixWorker();

worker.on('job:created', (job) => {
  console.log(`Job ${job.id} created`);
});

worker.on('job:completed', (job) => {
  console.log(`Job ${job.id} completed in ${job.completedAt - job.startedAt}ms`);
});

worker.on('job:failed', (job) => {
  console.error(`Job ${job.id} failed:`, job.error);
});
```

## Troubleshooting

### Common Issues

**"repomix: command not found"**
```bash
# Install repomix globally
npm install -g repomix
# OR
brew install repomix
```

**"EACCES: permission denied"**
- Check file permissions on target directories
- Ensure `OUTPUT_BASE_DIR` and `LOG_DIR` are writable

**"Maximum buffer size exceeded"**
- Increase `REPOMIX_MAX_BUFFER` in `.env`
- Default is 50MB (`52428800` bytes)

**Jobs timing out**
- Increase `REPOMIX_TIMEOUT` in `.env`
- Default is 10 minutes (`600000` milliseconds)

**Cron schedule not working**
- Validate cron expression: [crontab.guru](https://crontab.guru)
- Check `CRON_SCHEDULE` format: `"minute hour day month weekday"`
- Ensure process stays running (use PM2 or systemd)

## Security

### Command Injection Protection

Version 1.0.0+ uses `spawn()` instead of `exec()` to prevent command injection vulnerabilities when executing repomix.

### Secrets Management

Never commit `.env` files to version control. Use environment variables or secret management services in production.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT

## Author

Alyshia Ledlie

## Repository

[github.com/aledlie/AlephAuto](https://github.com/aledlie/AlephAuto)

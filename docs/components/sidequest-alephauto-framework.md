# AlephAuto

Node.js automation toolkit for managing code repositories at scale.

## Overview

AlephAuto provides three production-ready automation pipelines for managing multiple code repositories:

1. **Repomix Pipeline** - Automated code condensation across all repositories
2. **Documentation Enhancement Pipeline** - Schema.org markup injection for better SEO
3. **Gitignore Manager** - Batch `.gitignore` updates across multiple repos

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

- **Node.js** >= 18.0.0
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
node index.js

# Run on schedule (configured via CRON_SCHEDULE)
RUN_ON_STARTUP=false node index.js

# Run with custom configuration
CODE_BASE_DIR=/custom/path MAX_CONCURRENT=3 node index.js
```

**Scheduled execution**: By default, runs at 2 AM daily. Configure via `CRON_SCHEDULE` environment variable.

**Output location**: `./output/condense/` (configurable via `OUTPUT_BASE_DIR`)

### Documentation Enhancement Pipeline

Scans README files and adds Schema.org JSON-LD markup for better SEO.

```bash
# Run the documentation enhancement pipeline
node data-discovery-report-pipeline.js

# Run with custom target directory
CODE_BASE_DIR=/path/to/repos node data-discovery-report-pipeline.js
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
node gitignore-repomix-updater.js ~/code --dry-run

# Apply changes
node gitignore-repomix-updater.js ~/code

# Custom path
node gitignore-repomix-updater.js /path/to/repos
```

**What it does**:
- Recursively finds all git repositories
- Adds `repomix-output.xml` to `.gitignore` with descriptive comment
- Detects existing entries to avoid duplicates
- Generates detailed JSON report

**Reports**: Saved as `gitignore-update-report-{timestamp}.json`

See [GITIGNORE_UPDATER_README.md](./GITIGNORE_UPDATER_README.md) for detailed documentation.

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
┌───────────────┐  ┌─────────────────────┐
│ RepomixWorker │  │ SchemaEnhancement   │
│               │  │ Worker              │
└───────────────┘  └─────────────────────┘
```

### Component Overview

**`server.js`** - Base job execution engine
- Event-driven job lifecycle: `created` → `queued` → `running` → `completed/failed`
- Configurable concurrency limits
- Sentry error tracking and performance monitoring
- JSON logging to `./logs/` directory

**`repomix-worker.js`** - Repomix job executor
- Executes repomix CLI securely (command injection protected)
- Manages output directory structure
- 10-minute timeout, 50MB buffer for large outputs

**`directory-scanner.js`** - Directory traversal
- Recursive scanning with depth limits
- Configurable exclusion patterns
- Statistical reporting

**`index.js`** - Main repomix pipeline application
- Cron scheduling for automated execution
- Scans and processes all repositories
- Event-driven console logging

**`data-discovery-report-pipeline.js`** - Documentation enhancement
- README file discovery
- Schema.org markup generation
- MCP tools integration

**`gitignore-repomix-updater.js`** - Batch gitignore management
- Git repository detection
- Safe file modification
- Detailed reporting

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run with UI
npm run test:ui

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
npm run type-check
```

### Logging

AlephAuto uses structured logging with Pino. Logs are JSON-formatted and written to both console and files.

**Log levels**: `debug`, `info`, `warn`, `error`

```bash
# Enable debug logging
LOG_LEVEL=debug node index.js

# Log to custom location
LOG_DIR=/var/log/alephauto node index.js
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
import { RepomixWorker } from './repomix-worker.js';

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

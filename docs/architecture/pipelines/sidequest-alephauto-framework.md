# AlephAuto

Node.js automation toolkit for managing code repositories at scale.

## Overview

AlephAuto provides 11 production-ready automation pipelines. See [CLAUDE.md](../../../CLAUDE.md) for the full pipeline list, critical patterns, and architecture overview. See [Install Guide](../INSTALL.md) for setup and configuration.

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

For system architecture, job queue patterns, and component interactions, see [System Data Flow](../SYSTEM-DATA-FLOW.md). For error handling and retry logic, see [Error Handling](../ERROR_HANDLING.md). For adding new pipelines, see [Adding Pipelines](../setup/ADDING_PIPELINES.md).

## Development

See [CLAUDE.md](../../../CLAUDE.md#quick-reference) for test, build, and lint commands. See [Pipeline Execution](../pipeline-execution.md) for Node execution methods and Doppler integration.

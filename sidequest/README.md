# Sidequest - Job Queue Framework

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "APIReference",
  "name": "Sidequest - Job Queue Framework",
  "description": "The **sidequest** directory contains the core job queue framework for AlephAuto automation pipelines. It provides event-driven job management with PostgreSQL persistence, Sentry integration, and Git wo...",
  "additionalType": "https://schema.org/TechArticle"
}
</script>


The **sidequest** directory contains the core job queue framework for AlephAuto automation pipelines. It provides event-driven job management with PostgreSQL persistence, Sentry integration, and Git workflow automation.

## Architecture

```
sidequest/
├── core/               # Base framework components
│   ├── server.ts       # SidequestServer base class (job queue engine)
│   ├── database.ts     # PostgreSQL persistence layer
│   ├── config.ts       # Centralized configuration
│   └── index.ts        # Module exports
│
├── pipeline-core/      # Business logic for pipelines
│   ├── cache/          # Git-aware caching (Redis integration)
│   ├── config/         # Repository configuration loader
│   ├── errors/         # Error classification & retry logic
│   ├── annotators/     # Semantic annotation (TypeScript)
│   ├── extractors/     # Code block extraction (TypeScript)
│   ├── git/            # Branch management, PR creation, AST migration
│   ├── models/         # TypeScript data models (CodeBlock, DuplicateGroup)
│   ├── reports/        # HTML/JSON/Markdown report generators
│   ├── scanners/       # AST pattern detection, repository scanning
│   ├── similarity/     # Multi-layer similarity algorithm (TypeScript)
│   ├── types/          # TypeScript type definitions (Zod schemas)
│   ├── utils/          # Error, FS, process, and timing helpers
│   ├── inter-project-scanner.ts  # Cross-repository scanning
│   └── doppler-health-monitor.ts # Doppler fallback cache health
│
├── pipeline-runners/   # Pipeline entry points
│   ├── duplicate-detection-pipeline.ts   # 7-stage duplicate detection
│   ├── claude-health-pipeline.ts         # Claude Code health checks
│   ├── git-activity-pipeline.ts          # Git activity reports
│   ├── gitignore-pipeline.ts             # .gitignore management
│   ├── repo-cleanup-pipeline.ts          # Repository cleanup
│   ├── schema-enhancement-pipeline.ts    # Schema.org injection
│   ├── plugin-management-pipeline.ts     # Plugin management
│   ├── bugfix-audit-pipeline.ts          # Bugfix audit workflow
│   ├── dashboard-populate-pipeline.ts    # Dashboard data population
│   └── test-refactor-pipeline.ts         # Test suite refactoring
│
├── workers/            # Worker implementations (extend SidequestServer)
│   ├── duplicate-detection-worker.ts     # Duplicate detection jobs
│   ├── claude-health-worker.ts           # Health check jobs
│   ├── git-activity-worker.ts            # Git activity jobs
│   ├── git-activity-collector.ts         # Git activity data collection (pure TS)
│   ├── gitignore-worker.ts               # .gitignore jobs
│   ├── repo-cleanup-worker.ts            # Cleanup jobs
│   ├── repomix-worker.ts                 # Repomix jobs
│   ├── schema-enhancement-worker.ts      # Schema jobs
│   ├── bugfix-audit-worker.ts            # Bugfix audit jobs
│   ├── dashboard-populate-worker.ts      # Dashboard populate jobs
│   └── test-refactor-worker.ts           # Test refactor jobs
│
├── utils/              # Utility modules
│   ├── logger.ts                         # Pino component logger
│   ├── doppler-resilience.ts             # Doppler fallback handling
│   ├── directory-scanner.ts              # Directory scanning
│   ├── pipeline-names.ts                 # Pipeline name constants
│   ├── plugin-manager.ts                 # Plugin management
│   ├── report-generator.ts               # Report utilities
│   ├── gitignore-repomix-updater.ts      # Gitignore sync
│   ├── schema-mcp-tools.ts               # Schema MCP tools
│   └── refactor-test-suite.ts            # Test refactoring utility
│
└── config files
    ├── .env.example                      # Environment template
    ├── .gitignore                        # Git ignore rules
    ├── git-report-config.json            # Git report config
    └── repomix.config.json               # Repomix configuration
```

## Core Framework

### SidequestServer (core/server.ts)

The base class for all workers with:

- **Event-driven lifecycle**: `created → queued → running → completed/failed`
- **Concurrency control**: Configurable max concurrent jobs (default: 5)
- **PostgreSQL persistence**: Job history stored via `DATABASE_URL`
- **Sentry integration**: Error tracking and performance monitoring
- **Git workflow**: Optional branch creation, commits, and PR automation
- **Auto-retry with error classification**: Classifies errors as retryable/non-retryable

```typescript
import { SidequestServer } from './core/server.ts';

class MyWorker extends SidequestServer {
  constructor(options) {
    super({ ...options, jobType: 'my-job-type' });
  }

  async runJobHandler(job) {
    // Implement job logic
    return { success: true };
  }
}
```

### Error Classification (pipeline-core/errors/error-classifier.ts)

Intelligent error handling with retry logic:

- **Retryable**: ETIMEDOUT, ECONNRESET, 5xx HTTP errors, rate limits
- **Non-retryable**: ENOENT, EACCES, 4xx HTTP errors, validation errors
- **Suggested delays**: Rate limits (60s), timeouts (10s), connection errors (5s)

## Pipelines

### 1. Duplicate Detection Pipeline

7-stage pure TypeScript pipeline:

```bash
doppler run -- RUN_ON_STARTUP=true node --strip-types pipeline-runners/duplicate-detection-pipeline.ts
```

**Stages:**
1. Repository scanning (TS)
2. AST pattern detection with ast-grep (TS)
3. Code block extraction (TS)
4. Semantic annotation (TS)
5. Multi-layer similarity calculation (TS)
6. Duplicate grouping (TS)
7. Report generation (HTML/JSON/Markdown)

**Similarity Algorithm Layers:**
- Layer 0: Complexity filtering (trivial code exclusion)
- Layer 1: Exact matching (hash-based, O(n))
- Layer 2: Structural similarity (AST-based, configurable threshold)
- Layer 3: Semantic validation (category, tags, method chains)
- Layer 4: Quality filtering (group quality score)

### 2. Claude Health Pipeline

Health checks for Claude Code configuration:

```bash
npm run claude:health              # Immediate check
npm run claude:health:detailed     # With component details
npm run claude:health:schedule     # Cron scheduler (daily 8 AM)
```

**Checks:**
- Configuration validation (settings.json, skill-rules.json)
- Component inventory (skills, agents, hooks, plugins)
- Hook permissions and executability
- Performance log analysis (slow hooks, failures)
- Plugin duplicate detection

### 3. Git Activity Pipeline

Weekly/monthly git activity reports:

```bash
node --strip-types pipeline-runners/git-activity-pipeline.ts --run --weekly
node --strip-types pipeline-runners/git-activity-pipeline.ts --run --monthly
```

**Features:**
- Multi-repository scanning
- Language distribution analysis
- Commit frequency metrics
- Jekyll-formatted markdown output

**`git-report-config.json` defaults:**
- Scans `~/code`, `~/reports`, plus `~/schema-org-file-system`, `~/claude-tool-use`, and `~/dotfiles`
- Includes dotfiles, uses max depth `2`, and excludes common build/dependency folders (`node_modules`, `.git`, `dist`, `build`, etc.)
- Report schedules: weekly `Sunday 20:00`, monthly `1st of month 08:00`, quarterly disabled
- Outputs reports into `~/code/PersonalSite/_work` with SVG visualizations under `assets/images/git-activity-{year}`
- Weekly and monthly report generation are enabled; both default to markdown output and no auto-commit/push

### 4. Repository Cleanup Pipeline

Automated cleanup of build artifacts and virtual environments:

```bash
npm run cleanup:dryrun    # Preview changes
npm run cleanup:once      # Execute cleanup
```

**Targets:**
- Python venvs (.venv, __pycache__, *.pyc)
- Node modules (node_modules, .npm-cache)
- Build artifacts (dist, build, *.log)
- Temporary files (temp, tmp, *.swp)

### 5. Schema Enhancement Pipeline

Inject Schema.org structured data into HTML documents.

### 6. GitIgnore Pipeline

Sync and validate .gitignore files across repositories.

## Pipeline Core Components (Duplicate Detection)

Located in `pipeline-core/` — all TypeScript:

### Models (pipeline-core/models/)

TypeScript types with Zod validation in `types.ts` and `validation.ts`.

### Similarity Module (pipeline-core/similarity/)

```typescript
import { calculateStructuralSimilarity, normalizeCode } from './similarity/structural.ts';
import { groupBySimilarity } from './similarity/grouping.ts';
import { areSemanticallySimilar } from './similarity/semantic.ts';
```

**Configuration** (via `pipeline-core/similarity/config.ts`):
- `STRUCTURAL_THRESHOLD`: Minimum similarity (default: 0.90)
- `MIN_GROUP_QUALITY`: Group quality threshold (default: 0.70)
- `MIN_LINE_COUNT`: Minimum lines (default: 1)
- `MIN_UNIQUE_TOKENS`: Minimum tokens (default: 3)

## Configuration

### Environment Variables

Managed via Doppler (`integrity-studio` project):

```bash
doppler setup --project integrity-studio --config dev
doppler run -- npx tsx pipeline-runners/duplicate-detection-pipeline.ts
```

**Key variables:**
- `JOBS_API_PORT`: API server port (default: 8080)
- `SENTRY_DSN`: Sentry error tracking
- `ENABLE_GIT_WORKFLOW`: Enable branch/PR creation
- `ENABLE_PR_CREATION`: Auto-create PRs for changes
- `PIPELINE_DEBUG`: Enable verbose debug output (Duplicate Detection pipeline)

### Repository Configuration (config/scan-repositories.json)

```json
{
  "repositories": [
    {
      "name": "my-repo",
      "path": "/path/to/repo",
      "enabled": true,
      "priority": "high",
      "scanFrequency": "daily"
    }
  ],
  "groups": [
    {
      "name": "web-projects",
      "repositories": ["repo1", "repo2"],
      "scanType": "inter-project"
    }
  ]
}
```

## Reports

Generated in multiple formats:

### HTML Reports
Interactive dashboards with:
- Metrics cards (code blocks, duplicate groups, LOC reduction)
- Distribution charts (by strategy, complexity)
- Duplicate group details with impact scores
- Consolidation suggestions with ROI scores

### JSON Reports
Machine-readable output for integration:
```json
{
  "scan_type": "intra-project",
  "scan_metadata": { ... },
  "metrics": { ... },
  "duplicate_groups": [ ... ],
  "suggestions": [ ... ]
}
```

### Markdown Reports
Human-readable summaries for documentation.

## Development

### Adding a New Worker

1. Create worker in `workers/`:
```typescript
import { SidequestServer } from '../core/server.ts';

export class MyWorker extends SidequestServer {
  constructor(options = {}) {
    super({ ...options, jobType: 'my-worker' });
  }

  async runJobHandler(job) {
    // Job implementation
    return { status: 'completed' };
  }
}
```

2. Create pipeline in `pipeline-runners/`:
```typescript
import { MyWorker } from '../workers/my-worker.ts';

const worker = new MyWorker({ maxConcurrent: 1 });
worker.addJob({ data: 'example' });
```

### Type Definitions

Use Zod schemas with TypeScript inference:
```typescript
import { z } from 'zod';

export const MyJobDataSchema = z.object({
  type: z.literal('my-job'),
  target: z.string()
}).strict();

export type MyJobData = z.infer<typeof MyJobDataSchema>;
```

## Testing

```bash
npm test                    # Unit tests
npm run test:integration    # Integration tests
npm run typecheck           # TypeScript checks
```

## Related Documentation

- `../docs/API_REFERENCE.md` - REST API endpoints
- `../docs/architecture/ERROR_HANDLING.md` - Retry logic details
- `../docs/architecture/TYPE_SYSTEM.md` - Type patterns
- `../docs/runbooks/troubleshooting.md` - Debugging guide

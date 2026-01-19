# Sidequest - Job Queue Framework

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "APIReference",
  "name": "Sidequest - Job Queue Framework",
  "description": "The **sidequest** directory contains the core job queue framework for AlephAuto automation pipelines. It provides event-driven job management with SQLite persistence, Sentry integration, and Git wo...",
  "additionalType": "https://schema.org/TechArticle"
}
</script>


The **sidequest** directory contains the core job queue framework for AlephAuto automation pipelines. It provides event-driven job management with SQLite persistence, Sentry integration, and Git workflow automation.

## Architecture

```
sidequest/
├── core/               # Base framework components
│   ├── server.js       # SidequestServer base class (job queue engine)
│   ├── database.js     # SQLite persistence layer
│   ├── config.js       # Centralized configuration
│   └── index.js        # Module exports
│
├── pipeline-core/      # Business logic for pipelines
│   ├── cache/          # Git-aware caching (Redis integration)
│   ├── config/         # Repository configuration loader
│   ├── errors/         # Error classification & retry logic
│   ├── extractors/     # Python code block extraction
│   ├── git/            # Branch management, PR creation
│   ├── models/         # Python Pydantic models (CodeBlock, DuplicateGroup)
│   ├── reports/        # HTML/JSON/Markdown report generators
│   ├── scanners/       # AST pattern detection, repository scanning
│   ├── similarity/     # Multi-layer similarity algorithm (Python)
│   ├── types/          # TypeScript type definitions
│   └── utils/          # Error helpers
│
├── pipeline-runners/   # Pipeline entry points
│   ├── duplicate-detection-pipeline.js   # 7-stage duplicate detection
│   ├── claude-health-pipeline.js         # Claude Code health checks
│   ├── git-activity-pipeline.js          # Git activity reports
│   ├── gitignore-pipeline.js             # .gitignore management
│   ├── repo-cleanup-pipeline.js          # Repository cleanup
│   ├── schema-enhancement-pipeline.js    # Schema.org injection
│   ├── plugin-management-pipeline.js     # Plugin management
│   └── test-refactor-pipeline.ts         # Test suite refactoring
│
├── workers/            # Worker implementations (extend SidequestServer)
│   ├── duplicate-detection-worker.js     # Duplicate detection jobs
│   ├── claude-health-worker.js           # Health check jobs
│   ├── git-activity-worker.js            # Git activity jobs
│   ├── gitignore-worker.js               # .gitignore jobs
│   ├── repo-cleanup-worker.js            # Cleanup jobs
│   ├── repomix-worker.js                 # Repomix jobs
│   ├── schema-enhancement-worker.js      # Schema jobs
│   └── test-refactor-worker.ts           # Test refactor jobs
│
├── bug-fixes/          # Automated bug fixing workflow
│   ├── bugfix-audit-worker.js            # Multi-stage bug fix orchestrator
│   ├── launch-tonight.sh                 # Launch script
│   └── index.js                          # Module exports
│
├── types/              # TypeScript type definitions
│   └── duplicate-detection-types.ts      # Zod schemas + types
│
├── utils/              # Utility modules
│   ├── logger.js                         # Pino component logger
│   ├── doppler-resilience.js             # Doppler fallback handling
│   ├── directory-scanner.js              # Directory scanning
│   ├── pipeline-names.js                 # Pipeline name constants
│   ├── plugin-manager.js                 # Plugin management
│   ├── report-generator.js               # Report utilities
│   ├── gitignore-repomix-updater.js      # Gitignore sync
│   ├── schema-mcp-tools.js               # Schema MCP tools
│   └── refactor-test-suite.ts            # Test refactoring utility
│
└── config files
    ├── .env.example                      # Environment template
    ├── .gitignore                        # Git ignore rules
    ├── git-report-config.json            # Git report config
    └── repomix.config.json               # Repomix configuration
```

## Core Framework

### SidequestServer (core/server.js)

The base class for all workers with:

- **Event-driven lifecycle**: `created → queued → running → completed/failed`
- **Concurrency control**: Configurable max concurrent jobs (default: 3)
- **SQLite persistence**: Job history stored in `data/jobs.db`
- **Sentry integration**: Error tracking and performance monitoring
- **Git workflow**: Optional branch creation, commits, and PR automation
- **Auto-retry with circuit breaker**: Classifies errors as retryable/non-retryable

```javascript
import { SidequestServer } from './core/server.js';

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

### Error Classification (pipeline-core/errors/error-classifier.js)

Intelligent error handling with retry logic:

- **Retryable**: ETIMEDOUT, ECONNRESET, 5xx HTTP errors, rate limits
- **Non-retryable**: ENOENT, EACCES, 4xx HTTP errors, validation errors
- **Suggested delays**: Rate limits (60s), timeouts (10s), connection errors (5s)

## Pipelines

### 1. Duplicate Detection Pipeline

7-stage pipeline combining JavaScript (stages 1-2) and Python (stages 3-7):

```bash
doppler run -- RUN_ON_STARTUP=true node sidequest/pipeline-runners/duplicate-detection-pipeline.js
```

**Stages:**
1. Repository scanning (JS)
2. AST pattern detection with ast-grep (JS)
3. Code block extraction (Python)
4. Semantic annotation (Python)
5. Multi-layer similarity calculation (Python)
6. Duplicate grouping (Python)
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
python3 sidequest/pipeline-runners/collect_git_activity.py --weekly
python3 sidequest/pipeline-runners/collect_git_activity.py --days 30
```

**Features:**
- Multi-repository scanning
- Language distribution analysis
- Commit frequency metrics
- Jekyll-formatted markdown output

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

## Python Components

Located in `pipeline-core/` with dependencies on:
- **Pydantic**: Data models (CodeBlock, DuplicateGroup, ScanReport)
- **Standard library**: hashlib, re, json, sys

### Models (pipeline-core/models/)

```python
from code_block import CodeBlock, SourceLocation
from duplicate_group import DuplicateGroup
from consolidation_suggestion import ConsolidationSuggestion
from scan_report import ScanReport, ScanMetrics
```

### Similarity Module (pipeline-core/similarity/)

```python
from similarity.structural import calculate_structural_similarity, normalize_code
from similarity.grouping import group_by_similarity
from similarity.semantic import are_semantically_compatible, validate_duplicate_group
```

**Configuration** (via environment variables):
- `STRUCTURAL_THRESHOLD`: Minimum similarity (default: 0.90)
- `MIN_GROUP_QUALITY`: Group quality threshold (default: 0.70)
- `MIN_LINE_COUNT`: Minimum lines (default: 1)
- `MIN_UNIQUE_TOKENS`: Minimum tokens (default: 3)

## Configuration

### Environment Variables

Managed via Doppler (`bottleneck` project):

```bash
doppler setup --project bottleneck --config dev
doppler run -- node sidequest/pipeline-runners/duplicate-detection-pipeline.js
```

**Key variables:**
- `JOBS_API_PORT`: API server port (default: 8080)
- `SENTRY_DSN`: Sentry error tracking
- `ENABLE_GIT_WORKFLOW`: Enable branch/PR creation
- `ENABLE_PR_CREATION`: Auto-create PRs for changes
- `PIPELINE_DEBUG`: Enable verbose Python debug output

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
```javascript
import { SidequestServer } from '../core/server.js';

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
```javascript
import { MyWorker } from '../workers/my-worker.js';

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

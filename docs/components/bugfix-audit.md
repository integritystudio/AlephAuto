# Bugfix Audit - AlephAuto Integration

Automated 5-stage bug detection, security audit, and fix implementation pipeline. Scans `~/dev/active/` for markdown context files, resolves the corresponding repository, then orchestrates Claude Code agents and plugins to analyze and fix issues — committing after each phase and opening a PR when complete.

## Features

- **5-Stage Workflow** - Planner, detective, audit, quality control, refactor
- **Multi-Commit Git** - Intermediate commits after audit, QC, and fix stages
- **Automatic PRs** - Branch creation, push, and PR via GitWorkflowManager
- **Markdown-Driven** - Discovers work items from `~/dev/active/<project>/*.md`
- **Repository Resolution** - Maps project names to `~/code/` repo paths
- **Scheduling** - Immediate, one-time tonight, or recurring cron
- **Dashboard Visibility** - Registered in WorkerRegistry, visible via REST API and WebSocket

## Quick Start

```bash
# Run immediately on all active projects
npm run bugfix:once

# Schedule for tonight at 1 AM
npm run bugfix:tonight

# Recurring daily at 1 AM
npm run bugfix:schedule
```

All commands require Doppler (`doppler run --` is baked into the npm scripts).

## Architecture

### Components

```
Bugfix Audit System
├── bugfix-audit-worker.js              # AlephAuto worker (Node.js)
│   ├── Extends SidequestServer (jobType: 'bugfix-audit')
│   ├── Manual GitWorkflowManager (multi-commit)
│   ├── 5-stage orchestration
│   ├── execCommand() for Claude CLI calls
│   └── Sentry integration
│
├── bugfix-audit-pipeline.js            # Pipeline orchestrator
│   ├── CLI interface (--run-now, --once, --recurring, --schedule)
│   ├── Markdown file scanning
│   ├── Repository resolution
│   ├── Event listeners
│   └── Run summary persistence
│
└── Integration Points
    ├── ~/dev/active/<project>/*.md      # Input: context files
    ├── ~/code/<project>/                # Target: repositories
    ├── sidequest/bug-fixes/output/      # Output: stage reports
    └── sidequest/bug-fixes/logs/        # Logs: run summaries
```

### Worker Integration

The `BugfixAuditWorker` extends `SidequestServer` with `gitWorkflowEnabled: false` and manages git operations directly:

```javascript
import { BugfixAuditWorker } from './sidequest/workers/bugfix-audit-worker.js';

const worker = new BugfixAuditWorker({
  maxConcurrent: 3,
  activeDocsDir: '~/dev/active',
  gitBaseBranch: 'main',
  gitDryRun: false,
});

worker.on('job:completed', (job) => {
  console.log(`PR: ${job.result.pullRequestUrl}`);
});
```

### Why Multi-Commit (Option B)?

Most AlephAuto workers use the base class's single-commit-at-end flow (`gitWorkflowEnabled: true`). Bugfix audit makes **3 intermediate commits** — after the audit stages, after quality control, and after implementing fixes — so the PR history shows the progression from analysis to implementation. This requires managing `GitWorkflowManager` directly rather than relying on the base class lifecycle.

See [Adding New Pipelines - Git Workflow Strategies](../ADDING_PIPELINES.md) for full documentation of both approaches.

## Workflow Stages

### Stage 1: bugfix-planner Agent

- **Tool:** `claude --agent bugfix-planner`
- **Input:** Markdown file content from `~/dev/active/<project>/`
- **Output:** `01-bugfix-plan.md` — comprehensive bug fix plan
- **Action:** Analysis only, no code changes

### Stage 2: bug-detective Plugin

- **Tool:** `claude --command /bug-detective:bug-detective`
- **Input:** Repository path
- **Output:** `02-bug-detective-report.md` — systematic debugging report
- **Action:** Analysis only, no code changes

### Stage 3: audit Plugin

- **Tool:** `claude --command /audit:audit`
- **Input:** Repository path
- **Output:** `03-security-audit.md` — security audit findings
- **Commit:** `chore(audit): automated bugfix plan, detective report, security audit`

### Stage 4: ceo-quality-controller Agent

- **Tool:** `claude --agent ceo-quality-controller-agent`
- **Input:** Repository path (with audit reports present)
- **Output:** `04-quality-control.md` — quality validation
- **Commit:** `chore(audit): quality control validation complete`

### Stage 5: refractor Plugin

- **Tool:** `claude --command /refractor:refractor`
- **Input:** Repository path
- **Output:** `05-refactor-implementation.md` — implementation log
- **Commit:** `fix: automated refactoring and bug fixes implemented`
- **Push + PR:** Branch pushed, PR created against base branch

## Repository Resolution

The worker maps markdown file paths to repository paths:

```
~/dev/active/my-project/context.md
             ^^^^^^^^^^
             project name extracted

Lookup order:
  1. ~/code/my-project
  2. ~/code/jobs/my-project
  3. ~/code/<stripped-prefix>  (removes bugfix- prefix and date suffix)
```

A project is skipped if:
- No project name can be extracted from the path
- No matching repository directory exists
- The directory is not a git repository (no `.git/`)

## Configuration

### Constructor Options

| Option | Default | Description |
|--------|---------|-------------|
| `maxConcurrent` | 3 | Parallel jobs |
| `activeDocsDir` | `~/dev/active` | Markdown scan directory |
| `outputBaseDir` | `~/code/jobs/sidequest/bug-fixes/output` | Stage report output |
| `gitBaseBranch` | `main` (from config) | PR base branch |
| `gitBranchPrefix` | `bugfix` | Branch prefix |
| `gitDryRun` | `false` (from config) | Skip push/PR if true |

### CLI Flags

| Flag | Description |
|------|-------------|
| `--run-now`, `--now` | Run immediately, exit on completion |
| `--once`, `--one-time` | Schedule for tonight at 1 AM |
| `--recurring`, `--cron` | Recurring daily at 1 AM |
| `--schedule <cron>` | Custom cron expression (with `--recurring`) |

### npm Scripts

```bash
npm run bugfix:once       # doppler run -- node .../bugfix-audit-pipeline.js --run-now
npm run bugfix:tonight    # doppler run -- node .../bugfix-audit-pipeline.js --once
npm run bugfix:schedule   # doppler run -- node .../bugfix-audit-pipeline.js --recurring
```

## Output Structure

```
sidequest/bug-fixes/
├── output/
│   └── <project>/
│       └── <YYYY-MM-DD>/
│           ├── 01-bugfix-plan.md
│           ├── 02-bug-detective-report.md
│           ├── 03-security-audit.md
│           ├── 04-quality-control.md
│           ├── 05-refactor-implementation.md
│           ├── workflow-summary.json      # on success
│           └── workflow-error.json        # on failure
│
└── logs/
    └── run-summary-<timestamp>.json       # per-run aggregate
```

### Job Result Format

```javascript
{
  markdownFile: "~/dev/active/my-project/context.md",
  projectName: "my-project",
  repoPath: "~/code/my-project",
  branchName: "bugfix/bugfix-audit-my-project-1707500000",
  stages: [
    { name: "bugfix-planner", status: "completed" },
    { name: "bug-detective", status: "completed" },
    { name: "audit", status: "completed" },
    { name: "ceo-quality-controller", status: "completed" },
    { name: "refractor", status: "completed" }
  ],
  pullRequestUrl: "https://github.com/user/my-project/pull/42",
  timestamp: "2026-02-09T01:00:00.000Z"
}
```

## API Integration

Registered in the WorkerRegistry as `bugfix-audit`. Available via the REST API once the dashboard server is running:

```bash
# List all pipelines (includes bugfix-audit)
curl http://localhost:8080/api/pipelines

# Trigger a bugfix audit job
curl -X POST http://localhost:8080/api/pipelines/bugfix-audit/trigger \
  -H "Content-Type: application/json" \
  -d '{"parameters": {}}'

# Query job history
curl http://localhost:8080/api/pipelines/bugfix-audit/jobs?limit=10
```

## Error Handling

- **Stage failure:** If any stage throws, the error is captured in `workflow-error.json` with partial results, then the job is marked failed
- **Branch creation failure:** Job fails immediately (cannot proceed without a branch)
- **Push/PR failure:** GitWorkflowManager logs the error but does not throw — commits are preserved locally
- **Retryable errors:** Inherits SidequestServer retry logic (ETIMEDOUT, ECONNRESET auto-retry; ENOENT, EACCES fail fast)

## Convenience Methods

### Create a Single Job

```javascript
const worker = new BugfixAuditWorker();
const job = worker.createBugfixJob(
  '/path/to/context.md',
  'my-project',
  '/path/to/repo'
);
```

### Scan and Create All Jobs

```javascript
const worker = new BugfixAuditWorker();
const jobs = await worker.createJobsForAllMarkdownFiles();
// Returns array of created jobs (skips projects without valid repos)
```

## Troubleshooting

### No Projects Found

Verify markdown files exist in the active docs directory:

```bash
ls ~/dev/active/*/
```

Verify corresponding repos exist:

```bash
ls ~/code/<project-name>/
ls ~/code/<project-name>/.git
```

### Claude CLI Not Found

The worker calls `claude` via `execCommand`. Ensure Claude Code CLI is on your PATH:

```bash
which claude
claude --version
```

### Git Branch Already Exists

GitWorkflowManager generates timestamped branch names (`bugfix/bugfix-audit-<project>-<timestamp>`) so collisions are unlikely. If a branch does exist, `createJobBranch` returns null and the job fails with a descriptive error.

### Dry Run Mode

Set `GIT_DRY_RUN=true` in Doppler (or pass `gitDryRun: true`) to run the full workflow without pushing or creating PRs. Commits are still made locally.

## File Locations

| Component | Path |
|-----------|------|
| Worker | `sidequest/workers/bugfix-audit-worker.js` |
| Pipeline runner | `sidequest/pipeline-runners/bugfix-audit-pipeline.js` |
| Registry entry | `api/utils/worker-registry.js` |
| Output | `sidequest/bug-fixes/output/` |
| Logs | `sidequest/bug-fixes/logs/` |

## Related Documentation

- [Adding New Pipelines](../ADDING_PIPELINES.md) - How this pipeline was built
- [Pipeline Data Flow](../architecture/pipeline-data-flow.md#10-bugfix-audit-pipeline) - Data flow diagram
- [Worker Registry](../architecture/WORKER_REGISTRY.md) - Registry architecture
- [Error Handling](../architecture/ERROR_HANDLING.md) - Retry and circuit breaker
- [Pipeline Execution Runbook](../runbooks/pipeline-execution.md) - Operations guide

---

**Last Updated:** 2026-02-09

# BugfixAudit - Automated Bug Detection & Fixing

Automated bug detection and fixing pipeline using Claude Code agents and plugins, built on the AlephAuto job queue framework.

## Overview

This automation script:

1. **Scans** `~/dev/active` for markdown files (plan.md, context.md, tasks.md)
2. **Analyzes** each project using:
   - `bugfix-planner` agent - Creates comprehensive bug fix plans
   - `bug-detective` plugin - Systematic debugging
   - `audit` plugin - Security audit
   - `ceo-quality-controller-agent` - Quality validation
3. **Implements** fixes using `refractor` plugin
4. **Git workflow**:
   - Creates feature branch before changes
   - Commits after each stage
   - Creates PR to main when complete

## Installation

```bash
cd ~/code/jobs/sidequest/bug-fixes
npm install
```

## Usage

### Run Once Tonight at 1 AM (Default)

```bash
npm run start:once
```

This will:
- Schedule execution for tonight at 1 AM
- Keep the process running until then
- Exit after completion

### Run Immediately

```bash
npm run start:now
```

### Run Recurring (Daily at 1 AM)

```bash
npm run start:recurring
```

### Custom Schedule

```bash
doppler run -- node index.js --recurring --schedule "0 3 * * *"  # 3 AM daily
doppler run -- node index.js --recurring --schedule "0 */6 * * *"  # Every 6 hours
```

## Cron Schedule Format

```
* * * * *
│ │ │ │ │
│ │ │ │ └─── Day of week (0-7, 0 and 7 are Sunday)
│ │ │ └───── Month (1-12)
│ │ └─────── Day of month (1-31)
│ └───────── Hour (0-23)
└─────────── Minute (0-59)
```

Examples:
- `0 1 * * *` - 1 AM daily
- `0 */6 * * *` - Every 6 hours
- `0 9 * * 1` - 9 AM every Monday

## Architecture

### AlephAuto Framework Integration

Extends `SidequestServer` base class for:
- Event-driven job lifecycle
- Concurrent processing (3 projects in parallel)
- Sentry error tracking
- Automatic retry with circuit breaker

### Workflow Stages

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Scan ~/dev/active for .md files                         │
│    - Find all plan.md, context.md, tasks.md                │
│    - Identify corresponding repositories                    │
└────────────────┬────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────┐
│ 2. Create Git Branch                                        │
│    - Branch: bugfix/automated-audit-{timestamp}            │
└────────────────┬────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────┐
│ 3. Analysis Phase (Parallel)                                │
│    - bugfix-planner: Create bug fix plan                   │
│    - bug-detective: Systematic debugging                   │
│    - audit: Security audit                                 │
│    - Commit: "🔍 Automated audit complete"                 │
└────────────────┬────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────┐
│ 4. Quality Control                                          │
│    - ceo-quality-controller-agent: Validate standards      │
│    - Commit: "✅ Quality control validation complete"      │
└────────────────┬────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────┐
│ 5. Implementation                                           │
│    - refractor: Implement fixes                            │
│    - Commit: "♻️ Automated refactoring implemented"        │
└────────────────┬────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────┐
│ 6. Pull Request                                             │
│    - Create PR to main                                     │
│    - Include all reports and summaries                     │
└─────────────────────────────────────────────────────────────┘
```

## Output

Results saved to: `~/code/jobs/sidequest/bug-fixes/output/{project-name}/{date}/`

```
output/
├── bugfix-project-name/
│   └── 2025-11-19/
│       ├── 01-bugfix-plan.md
│       ├── 02-bug-detective-report.md
│       ├── 03-security-audit.md
│       ├── 04-quality-control.md
│       ├── 05-refactor-implementation.md
│       └── workflow-summary.json
└── logs/
    └── run-summary-{timestamp}.json
```

## Configuration

Uses AlephAuto centralized config (`../config.js`):

- **Active Docs Dir**: `~/dev/active`
- **Max Concurrent Jobs**: 3
- **Output Base Dir**: `~/code/jobs/sidequest/bug-fixes/output`
- **Sentry DSN**: From Doppler
- **Log Level**: From `config.logLevel`

## Environment Variables (Doppler)

Required:
- `SENTRY_DSN` - Error tracking
- `NODE_ENV` - development/production

Optional:
- `LOG_LEVEL` - info/debug/error (default: info)

## Logging

Structured JSON logs using Pino:

```bash
# View logs in real-time
tail -f ~/code/jobs/sidequest/logs/*.log

# View run summaries
cat ~/code/jobs/sidequest/bug-fixes/logs/run-summary-*.json | jq
```

## Error Handling

- **Automatic Retry**: Transient errors (network, timeouts)
- **Circuit Breaker**: Prevents cascading failures
- **Sentry Integration**: All errors tracked
- **Partial Results**: Saved even on failure

## Git Requirements

- `git` CLI installed
- `gh` CLI installed and authenticated
- Repositories must be git-initialized
- Write access to create branches and PRs

## Troubleshooting

### "Could not find repository"

The script looks for repos in:
1. `~/code/{project-name}`
2. `~/code/jobs/{project-name}`
3. `~/code/{project-name-without-bugfix-prefix}`

Ensure your repo is in one of these locations.

### "Not a git repository"

Initialize git in the project:
```bash
cd ~/code/your-project
git init
git remote add origin <url>
```

### "gh pr create failed"

Authenticate GitHub CLI:
```bash
gh auth login
```

### Jobs not running

Check logs:
```bash
tail -f ~/code/jobs/sidequest/logs/bugfix-audit.log
```

## Development

```bash
# Run with auto-restart on changes
npm run dev

# View component logs
export LOG_LEVEL=debug
npm run start:now
```

## Integration with AlephAuto

This script is part of the AlephAuto job queue framework:

- Extends `SidequestServer` base class
- Uses centralized `config.js`
- Uses shared `logger.js`
- Follows event-driven architecture
- Compatible with dashboard monitoring

## License

MIT

## Author

Alyshia Ledlie - Generated with Claude Code AlephAuto

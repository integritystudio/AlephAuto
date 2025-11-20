# BugfixAudit - Quick Start Guide

## ✅ Status: RUNNING

**Current Status**: Scheduled to run tonight at **1:00 AM**
**Process ID**: 14063
**Time Until Execution**: ~1h 21m

## What It Does

Automatically scans `~/dev/active` for markdown files and:

1. Creates git branches for each project
2. Runs comprehensive analysis:
   - `bugfix-planner` - Bug fix plans
   - `bug-detective` - Systematic debugging
   - `audit` - Security audit
   - `ceo-quality-controller-agent` - Quality validation
3. Implements fixes with `refractor` plugin
4. Commits after each stage
5. Creates pull requests to main

## Monitor Progress

```bash
# Watch live logs
tail -f ~/code/jobs/sidequest/bug-fixes/logs/bugfix-audit-*.log

# Check process status
ps aux | grep 14063

# View output
ls -la ~/code/jobs/sidequest/bug-fixes/output/
```

## Stop Execution

```bash
kill 14063
```

## Run Again

```bash
# Run immediately
cd ~/code/jobs/sidequest/bug-fixes
npm run start:now

# Schedule for tonight at 1 AM
./launch-tonight.sh

# Run recurring (daily at 1 AM)
npm run start:recurring
```

## Output Location

```
~/code/jobs/sidequest/bug-fixes/output/
├── {project-name}/
│   └── {date}/
│       ├── 01-bugfix-plan.md
│       ├── 02-bug-detective-report.md
│       ├── 03-security-audit.md
│       ├── 04-quality-control.md
│       ├── 05-refactor-implementation.md
│       └── workflow-summary.json
└── logs/
    └── run-summary-{timestamp}.json
```

## Expected Projects to Process

Based on current `~/dev/active`:
- bugfix-integritystudio-errors-2025-11-17
- bugfix-aledlie-github-io-errors-2025-11-17
- bugfix-eventstream-tests
- bugfix-doppler-and-test-errors
- ast-grep-mcp-sentry-migration-20251117

## Architecture

Built on **AlephAuto** framework:
- Extends `SidequestServer` base class
- 3 concurrent jobs
- Event-driven architecture
- Sentry error tracking
- Automatic retry with circuit breaker

## Key Files

```
bug-fixes/
├── bugfix-audit-worker.js    # Worker class (extends SidequestServer)
├── index.js                   # Main application entry point
├── package.json               # Dependencies and scripts
├── launch-tonight.sh          # Launch script (executable)
├── README.md                  # Full documentation
├── QUICKSTART.md             # This file
├── logs/                     # Execution logs
└── output/                   # Analysis reports and results
```

## Troubleshooting

### Check if it's running
```bash
ps aux | grep bugfix-audit
```

### View logs
```bash
tail -f logs/bugfix-audit-*.log
```

### Restart
```bash
kill 14063
./launch-tonight.sh
```

## What Happens at 1 AM

1. Scans all .md files in ~/dev/active
2. Identifies corresponding repositories
3. Creates feature branches
4. Runs analysis pipeline
5. Implements fixes
6. Creates PRs
7. Saves reports
8. Exits

Process will automatically exit after completion.

---

**Created**: 2025-11-19 00:39
**Framework**: AlephAuto v1.5.0
**Next Execution**: Tonight at 1:00 AM

# Git Activity Reporter

Automated weekly/monthly git activity reporting with visualizations, **fully integrated with AlephAuto**.

## Quick Start

```bash
# Weekly report (last 7 days) - from project root
node --strip-types sidequest/pipeline-runners/git-activity-pipeline.ts --run --weekly

# Monthly report (last 30 days)
node --strip-types sidequest/pipeline-runners/git-activity-pipeline.ts --run --monthly

# Custom date range
node --strip-types sidequest/pipeline-runners/git-activity-pipeline.ts --run --start-date 2026-02-01 --end-date 2026-02-28

# Run immediately
RUN_ON_STARTUP=true node --strip-types sidequest/pipeline-runners/git-activity-pipeline.ts --weekly

# Start scheduled mode (weekly + monthly cron jobs)
node --strip-types sidequest/pipeline-runners/git-activity-pipeline.ts
```

## Files

- `sidequest/pipeline-runners/git-activity-pipeline.ts` - Pipeline orchestrator
- `sidequest/workers/git-activity-worker.ts` - Job worker
- `sidequest/pipeline-runners/collect_git_activity.py` - Python data collector
- `sidequest/git-report-config.json` - Collector configuration
- `GIT-ACTIVITY-REPORTER-README.md` - This file
- `docs/INSTALL.md` - Installation guide
- `logs/` - Job/event logs directory

## Installation

See [INSTALL.md](../INSTALL.md) for complete setup instructions.

Quick install:
```bash
# From project root
npm install

# Make Python script executable
chmod +x sidequest/pipeline-runners/collect_git_activity.py

# Test the integration
node --strip-types sidequest/pipeline-runners/git-activity-pipeline.ts --run --weekly
```

## Scheduled Mode

### Using Node (Recommended)

Run in scheduled mode (weekly + monthly):
```bash
node --strip-types sidequest/pipeline-runners/git-activity-pipeline.ts

# Custom schedules
GIT_CRON_SCHEDULE="0 20 * * 0" \
GIT_MONTHLY_CRON_SCHEDULE="0 8 1 * *" \
node --strip-types sidequest/pipeline-runners/git-activity-pipeline.ts
```

### Using PM2 (Production)

```bash
doppler run -- pm2 start sidequest/pipeline-runners/git-activity-pipeline.ts \
  --name git-activity \
  --interpreter node \
  --node-args="--strip-types"
pm2 save
pm2 startup
```

## Output

- **Visualizations**: `~/code/PersonalSite/assets/images/git-activity-{year}/*.svg`
- **JSON Data**: `/tmp/git_activity_weekly_*.json`
- **Logs**: `~/code/jobs/logs/*.json`

## Claude Code Integration

A skill is available at:
`~/code/PersonalSite/.claude/skills/git-activity-reporter.md`

Just ask Claude:
```
"Create a weekly git activity report"
"Generate my development summary"
```

## Support

- Full documentation: See `docs/INSTALL.md`
- Logs: `~/code/jobs/logs/`
- Ask Claude: "Help me debug the git activity reporter"

---

Part of the AlephAuto automation suite.

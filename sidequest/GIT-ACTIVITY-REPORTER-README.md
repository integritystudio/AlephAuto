# Git Activity Reporter

Automated weekly/monthly git activity reporting with visualizations, **fully integrated with AlephAuto**.

## Quick Start

```bash
# Weekly report (last 7 days) - from project root
npm run git:weekly

# Monthly report (last 30 days)
npm run git:monthly

# Custom date range
node git-activity-pipeline.js --since 2025-07-07 --until 2025-11-16

# Run immediately
RUN_ON_STARTUP=true npm run git:weekly

# Start scheduled mode (Sunday 8 PM)
npm run git:schedule
```

## Files

- `../git-activity-pipeline.js` - AlephAuto pipeline orchestrator (project root)
- `git-activity-worker.js` - AlephAuto job worker
- `collect_git_activity.py` - Python data collection script (backend)
- `git-report-config.json` - Configuration file
- `GIT-ACTIVITY-REPORTER-README.md` - This file
- `INSTALL.md` - Installation guide
- `logs/` - Log directory

## Installation

See [INSTALL.md](INSTALL.md) for complete setup instructions.

Quick install:
```bash
# From project root
npm install

# Make Python script executable
chmod +x sidequest/collect_git_activity.py

# Test the integration
npm run git:weekly
```

## Scheduled Mode

### Using npm (Recommended)

Run in scheduled mode (Sunday 8 PM by default):
```bash
npm run git:schedule

# Custom schedule
GIT_CRON_SCHEDULE="0 20 * * 0" npm run git:schedule
```

### Using PM2 (Production)

```bash
pm2 start git-activity-pipeline.js --name git-activity
pm2 save
pm2 startup
```

## Output

- **Visualizations**: `~/code/PersonalSite/assets/images/git-activity-{year}/*.svg`
- **JSON Data**: `/tmp/git_activity_weekly_*.json`
- **Logs**: `~/code/jobs/sidequest/logs/git-report-*.log`

## Claude Code Integration

A skill is available at:
`~/code/PersonalSite/.claude/skills/git-activity-reporter.md`

Just ask Claude:
```
"Create a weekly git activity report"
"Generate my development summary"
```

## Support

- Full documentation: See INSTALL.md
- Logs: `~/code/jobs/sidequest/logs/`
- Ask Claude: "Help me debug the git activity reporter"

---

Part of the AlephAuto automation suite.

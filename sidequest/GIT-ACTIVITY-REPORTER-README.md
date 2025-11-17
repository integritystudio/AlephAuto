# Git Activity Reporter

Automated weekly/monthly git activity reporting with visualizations.

## Quick Start

```bash
# Weekly report (last 7 days)
./weekly-git-report.sh

# Monthly report (last 30 days)
./weekly-git-report.sh --monthly

# Custom date range
./weekly-git-report.sh --since 2025-07-07 --until 2025-11-16
```

## Files

- `collect_git_activity.py` - Python data collection script
- `weekly-git-report.sh` - Shell automation wrapper
- `git-report-config.json` - Configuration file
- `GIT-ACTIVITY-REPORTER-README.md` - This file
- `INSTALL.md` - Installation guide
- `logs/` - Log directory

## Installation

See [INSTALL.md](INSTALL.md) for complete setup instructions.

Quick install:
```bash
chmod +x collect_git_activity.py weekly-git-report.sh
./weekly-git-report.sh --help
```

## Cron Setup

Weekly reports every Sunday at 8 PM:
```cron
0 20 * * 0 ~/code/jobs/sidequest/weekly-git-report.sh >> ~/code/jobs/sidequest/logs/git-report.log 2>&1
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

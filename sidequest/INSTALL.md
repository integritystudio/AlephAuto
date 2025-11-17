# Installation Guide

Quick setup guide for the automated git activity reporting system.

## Prerequisites

- Python 3.7+
- Git installed and configured
- Bash shell (macOS/Linux)
- Jekyll site at `~/code/PersonalSite` (or customize paths)

## Installation Steps

### 1. Verify Files

Check that all files are in place:
```bash
ls -la ~/code/jobs/sidequest/
```

Expected files:
- `collect_git_activity.py` (executable)
- `weekly-git-report.sh` (executable)
- `git-report-config.json`
- `README.md`
- `INSTALL.md`

### 2. Set Permissions

Make scripts executable:
```bash
chmod +x ~/code/jobs/sidequest/collect_git_activity.py
chmod +x ~/code/jobs/sidequest/weekly-git-report.sh
```

### 3. Test Manual Run

Test the Python script:
```bash
cd ~/code/jobs/sidequest
python3 collect_git_activity.py --days 7
```

Test the shell wrapper:
```bash
./weekly-git-report.sh --help
./weekly-git-report.sh --since 2025-11-10 --until 2025-11-17
```

### 4. Configure Paths (Optional)

Edit `collect_git_activity.py` if your code directory is different:
```python
CODE_DIR = Path.home() / 'code'  # Change this if needed
```

Edit `weekly-git-report.sh` if your PersonalSite is elsewhere:
```bash
PERSONALSITE_DIR="$HOME/code/PersonalSite"  # Change this if needed
```

### 5. Set Up Cron (Optional)

Edit your crontab:
```bash
crontab -e
```

Add weekly report (every Sunday at 8 PM):
```cron
0 20 * * 0 ~/code/jobs/sidequest/weekly-git-report.sh >> ~/code/jobs/sidequest/logs/git-report.log 2>&1
```

Save and exit. Verify:
```bash
crontab -l
```

### 6. Test Cron Job

Wait for scheduled time, or manually trigger to test:
```bash
~/code/jobs/sidequest/weekly-git-report.sh >> ~/code/jobs/sidequest/logs/test.log 2>&1
cat ~/code/jobs/sidequest/logs/test.log
```

## Verification

After setup, verify:

1. **Python script runs**: `python3 collect_git_activity.py --days 1`
2. **Shell script runs**: `./weekly-git-report.sh --help`
3. **Logs directory exists**: `ls ~/code/jobs/sidequest/logs/`
4. **Visualizations generate**: `ls ~/code/PersonalSite/assets/images/git-activity-2025/`
5. **JSON data creates**: `ls /tmp/git_activity_*.json`

## Usage

### Daily
```bash
python3 collect_git_activity.py --days 1
```

### Weekly
```bash
./weekly-git-report.sh
```

### Monthly
```bash
./weekly-git-report.sh --monthly
```

### Custom
```bash
./weekly-git-report.sh --since 2025-07-07 --until 2025-11-16
```

### With Claude Code

Just ask:
```
"Create a weekly git activity report"
"Generate my development summary"
```

## Troubleshooting

### Scripts won't run
```bash
chmod +x ~/code/jobs/sidequest/*.sh
chmod +x ~/code/jobs/sidequest/*.py
```

### No repositories found
```bash
# Increase scan depth
python3 collect_git_activity.py --days 7 --max-depth 3
```

### Cron not working
```bash
# Use absolute paths in crontab:
0 20 * * 0 /usr/bin/python3 /Users/alyshialedlie/code/jobs/sidequest/collect_git_activity.py --weekly
```

## Next Steps

1. Run a test report: `./weekly-git-report.sh`
2. Review JSON output: `cat /tmp/git_activity_*.json | jq .`
3. Check visualizations: Open SVG files in browser
4. Ask Claude to create markdown report from data
5. Set up weekly cron job
6. Customize project categories in config

## Support

For help, check:
- README.md for detailed documentation
- Logs in `~/code/jobs/sidequest/logs/`
- Ask Claude: "Help me debug the git activity reporter"

---

Installation complete! 🎉

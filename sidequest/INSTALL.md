# Installation Guide

Quick setup guide for the automated git activity reporting system with **AlephAuto integration**.

## Prerequisites

- Node.js >= 18.0.0
- Python 3.7+
- Git installed and configured
- npm (comes with Node.js)
- Jekyll site at `~/code/PersonalSite` (or customize paths in config)

## Installation Steps

### 1. Install Dependencies

From the project root:
```bash
cd ~/code/jobs
npm install
```

### 2. Verify Files

Check that all files are in place:
```bash
ls -la ~/code/jobs/
ls -la ~/code/jobs/sidequest/
```

Expected files:
- `git-activity-pipeline.js` (project root)
- `sidequest/git-activity-worker.js`
- `sidequest/collect_git_activity.py` (Python backend)
- `sidequest/git-report-config.json`

### 3. Set Permissions

Make Python script executable:
```bash
chmod +x ~/code/jobs/sidequest/collect_git_activity.py
```

### 4. Test Manual Run

Test the AlephAuto integration:
```bash
cd ~/code/jobs

# Test weekly report
npm run git:weekly

# Test with immediate execution
RUN_ON_STARTUP=true npm run git:weekly

# Test custom date range
node git-activity-pipeline.js --since 2025-11-10 --until 2025-11-17
```

Test the Python script directly (optional):
```bash
cd ~/code/jobs/sidequest
python3 collect_git_activity.py --days 7
```

### 5. Configure Paths (Optional)

Edit `sidequest/collect_git_activity.py` if your code directory is different:
```python
CODE_DIR = Path.home() / 'code'  # Change this if needed
```

Or set environment variables (recommended):
```bash
# In .env file or environment
CODE_BASE_DIR=/path/to/your/code
GIT_CRON_SCHEDULE="0 20 * * 0"  # Sunday 8 PM (default)
```

### 6. Set Up Scheduled Mode (Optional)

#### Option A: Using npm (Simple)

Run in scheduled mode:
```bash
cd ~/code/jobs
npm run git:schedule
```

#### Option B: Using PM2 (Production)

```bash
cd ~/code/jobs
pm2 start git-activity-pipeline.js --name git-activity
pm2 save
pm2 startup
```

Verify:
```bash
pm2 status
pm2 logs git-activity
```

#### Option C: Using systemd (Linux)

Create `/etc/systemd/system/git-activity.service`:
```ini
[Unit]
Description=Git Activity Report Pipeline
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/Users/alyshialedlie/code/jobs
ExecStart=/usr/bin/node git-activity-pipeline.js
Restart=always
Environment=NODE_ENV=production
Environment=GIT_CRON_SCHEDULE="0 20 * * 0"

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable git-activity
sudo systemctl start git-activity
sudo systemctl status git-activity
```

## Verification

After setup, verify:

1. **Dependencies installed**: `npm list` (from project root)
2. **AlephAuto pipeline runs**: `npm run git:weekly`
3. **Logs directory exists**: `ls ~/code/jobs/logs/`
4. **Visualizations generate**: `ls ~/code/PersonalSite/assets/images/git-activity-2025/`
5. **JSON data creates**: `ls /tmp/git_activity_*.json`

Check job completion logs:
```bash
cat logs/*.json | grep "git-activity"
```

## Usage

### Weekly Report
```bash
npm run git:weekly
```

### Monthly Report
```bash
npm run git:monthly
```

### Custom Date Range
```bash
node git-activity-pipeline.js --since 2025-07-07 --until 2025-11-16
```

### Scheduled Mode
```bash
npm run git:schedule
```

### Run Immediately
```bash
RUN_ON_STARTUP=true npm run git:weekly
```

### With Claude Code

Just ask:
```
"Create a weekly git activity report"
"Generate my development summary"
```

## Troubleshooting

### npm scripts not found
```bash
cd ~/code/jobs
npm install  # Ensure dependencies are installed
```

### Python script won't execute
```bash
chmod +x ~/code/jobs/sidequest/collect_git_activity.py
which python3  # Verify Python is installed
```

### No repositories found
```bash
# Check CODE_BASE_DIR environment variable
echo $CODE_BASE_DIR

# Or edit collect_git_activity.py directly
```

### Jobs not completing
```bash
# Check logs
cat logs/*.json | tail -50

# Or use PM2 logs
pm2 logs git-activity

# Check Sentry dashboard for errors
```

### Scheduled mode not working
```bash
# Verify cron schedule syntax
GIT_CRON_SCHEDULE="0 20 * * 0" npm run git:schedule

# Check if process is running
ps aux | grep git-activity-pipeline

# Or use PM2
pm2 status
```

## Next Steps

1. Run a test report: `npm run git:weekly`
2. Review JSON output: `cat /tmp/git_activity_*.json | jq .`
3. Check visualizations: Open SVG files in browser
4. Ask Claude to create markdown report from data
5. Set up scheduled mode: `npm run git:schedule` or use PM2
6. Customize project categories in `git-report-config.json`
7. Monitor with Sentry dashboard

## Support

For help, check:
- README.md for detailed documentation
- Logs in `~/code/jobs/sidequest/logs/`
- Ask Claude: "Help me debug the git activity reporter"

---

Installation complete! 🎉

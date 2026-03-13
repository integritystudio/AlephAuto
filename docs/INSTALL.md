# Installation Guide

> **Note:** This guide covers setup for the **Git Activity Reporter** pipeline. For the full AlephAuto framework setup, see [README.md](../README.md) and [CLAUDE.md](../CLAUDE.md). For Doppler (required for all pipelines), see [docs/setup/DOPPLER_SENTRY_SETUP.md](setup/DOPPLER_SENTRY_SETUP.md).

Quick setup guide for the Git Activity Reporter pipeline.

## Prerequisites

- Node.js >= 22.0.0
- Python 3.8+
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
- `sidequest/pipeline-runners/git-activity-pipeline.ts`
- `sidequest/workers/git-activity-worker.ts`
- `sidequest/pipeline-runners/collect_git_activity.py` (Python backend)
- `sidequest/git-report-config.json`

### 3. Set Permissions

Make Python script executable:
```bash
chmod +x ~/code/jobs/sidequest/pipeline-runners/collect_git_activity.py
```

### 4. Test Manual Run

Test the AlephAuto integration:
```bash
cd ~/code/jobs

# Test weekly report
node --strip-types sidequest/pipeline-runners/git-activity-pipeline.ts --run --weekly

# Test with immediate execution
RUN_ON_STARTUP=true node --strip-types sidequest/pipeline-runners/git-activity-pipeline.ts --weekly

# Test custom date range
node --strip-types sidequest/pipeline-runners/git-activity-pipeline.ts --run --start-date 2026-02-01 --end-date 2026-02-28
```

Test the Python script directly (optional):
```bash
cd ~/code/jobs/sidequest/pipeline-runners
python3 collect_git_activity.py --days 7
```

### 5. Configure Paths (Optional)

Edit `sidequest/pipeline-runners/collect_git_activity.py` if your code directory is different:
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

#### Option A: Using Node (Simple)

Run in scheduled mode:
```bash
cd ~/code/jobs
node --strip-types sidequest/pipeline-runners/git-activity-pipeline.ts
```

#### Option B: Using PM2 (Production)

```bash
cd ~/code/jobs
doppler run -- pm2 start sidequest/pipeline-runners/git-activity-pipeline.ts \
  --name git-activity \
  --interpreter node \
  --node-args="--strip-types"
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
ExecStart=/usr/bin/node --strip-types /Users/alyshialedlie/code/jobs/sidequest/pipeline-runners/git-activity-pipeline.ts
Restart=always
Environment=NODE_ENV=production
Environment=GIT_CRON_SCHEDULE="0 20 * * 0"
Environment=GIT_MONTHLY_CRON_SCHEDULE="0 8 1 * *"

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
2. **AlephAuto pipeline runs**: `node --strip-types sidequest/pipeline-runners/git-activity-pipeline.ts --run --weekly`
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
node --strip-types sidequest/pipeline-runners/git-activity-pipeline.ts --run --weekly
```

### Monthly Report
```bash
node --strip-types sidequest/pipeline-runners/git-activity-pipeline.ts --run --monthly
```

### Custom Date Range
```bash
node --strip-types sidequest/pipeline-runners/git-activity-pipeline.ts --run --start-date 2026-02-01 --end-date 2026-02-28
```

### Scheduled Mode
```bash
node --strip-types sidequest/pipeline-runners/git-activity-pipeline.ts
```

### Run Immediately
```bash
RUN_ON_STARTUP=true node --strip-types sidequest/pipeline-runners/git-activity-pipeline.ts --weekly
```

### With Claude Code

Just ask:
```
"Create a weekly git activity report"
"Generate my development summary"
```

## Troubleshooting

### TypeScript entrypoint fails to start
```bash
cd ~/code/jobs
npm install  # Ensure dependencies are installed
node --version
node --strip-types --version
```

### Python script won't execute
```bash
chmod +x ~/code/jobs/sidequest/pipeline-runners/collect_git_activity.py
which python3  # Verify Python is installed
```

### No repositories found
```bash
# Check CODE_BASE_DIR environment variable
echo $CODE_BASE_DIR

# Or edit pipeline-runners/collect_git_activity.py directly
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
GIT_CRON_SCHEDULE="0 20 * * 0" GIT_MONTHLY_CRON_SCHEDULE="0 8 1 * *" \
node --strip-types sidequest/pipeline-runners/git-activity-pipeline.ts

# Check if process is running
ps aux | grep git-activity-pipeline

# Or use PM2
pm2 status
```

## Next Steps

1. Run a test report: `node --strip-types sidequest/pipeline-runners/git-activity-pipeline.ts --run --weekly`
2. Review JSON output: `cat /tmp/git_activity_*.json | jq .`
3. Check visualizations: Open SVG files in browser
4. Ask Claude to create markdown report from data
5. Set up scheduled mode: `node --strip-types sidequest/pipeline-runners/git-activity-pipeline.ts` or use PM2
6. Customize project categories in `git-report-config.json`
7. Monitor with Sentry dashboard

## Support

For help, check:
- README.md for detailed documentation
- Logs in `~/code/jobs/logs/`
- Ask Claude: "Help me debug the git activity reporter"

---

Installation complete.

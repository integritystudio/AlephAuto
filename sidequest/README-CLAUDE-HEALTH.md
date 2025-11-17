# Claude Health Check - AlephAuto Integration

Comprehensive automated monitoring and health checking system for Claude Code environment, integrated with the AlephAuto job queue framework.

## Features

- **Comprehensive Health Checks** - Environment, configuration, hooks, plugins, performance
- **Automated Monitoring** - Scheduled daily health checks (8 AM by default)
- **Health Scoring** - 0-100 score based on critical issues and warnings
- **Detailed Analysis** - Component inventory, duplicate detection, performance analysis
- **Actionable Recommendations** - Prioritized recommendations with specific actions
- **Event-Driven** - Emits lifecycle events for monitoring and integration
- **Sentry Integration** - Error tracking and performance monitoring

## Quick Start

### Run Immediate Health Check

```bash
# Simple health check
cd ~/code/jobs
npm run claude:health

# Detailed health check with full component listing
npm run claude:health:detailed

# Quick check (skip performance and plugin analysis)
npm run claude:health:quick
```

### Run from ~/.claude Directory

```bash
cd ~/.claude

# Local health check (bash script)
npm run health

# Comprehensive health check (AlephAuto integration)
npm run health:comprehensive

# Detailed comprehensive check
npm run health:detailed

# Quick check
npm run health:quick
```

### Schedule Automatic Health Checks

```bash
# Start cron scheduler (runs daily 8 AM)
cd ~/code/jobs
npm run claude:health:schedule

# Custom schedule
CLAUDE_HEALTH_CRON_SCHEDULE="0 10 * * *" npm run claude:health:schedule  # Daily 10 AM

# Deploy with PM2
doppler run -- pm2 start claude-health-pipeline.js --name claude-health
```

## Installation Requirements

### Dependencies

The health check system is already integrated with your existing setup. No additional installation required.

### Doppler (Optional)

For production deployment with PM2:

```bash
# Verify Doppler is configured
doppler --version
doppler run -- node --version
```

## Architecture

### Components

```
Claude Health Check System
├── claude-health-worker.js           # AlephAuto worker (Node.js)
│   ├── Extends SidequestServer
│   ├── Job queue management
│   ├── Cron scheduling
│   ├── Event emission
│   └── Sentry integration
│
├── claude-health-pipeline.js         # Pipeline orchestrator
│   ├── CLI interface
│   ├── Cron scheduling
│   ├── Output formatting
│   └── Event handling
│
└── Integration Points
    ├── ~/.claude/settings.json       # Configuration
    ├── ~/.claude/skills/             # Skills inventory
    ├── ~/.claude/hooks/              # Hooks analysis
    ├── ~/.claude/logs/               # Performance logs
    └── ~/dev/active/                 # Active tasks
```

### Worker Integration

The `ClaudeHealthWorker` extends `SidequestServer` and follows AlephAuto patterns:

```javascript
import { ClaudeHealthWorker } from './sidequest/claude-health-worker.js';

const worker = new ClaudeHealthWorker({
  maxConcurrent: 1,
  cronSchedule: '0 8 * * *',  // Daily 8 AM
  cronEnabled: true
});

// Event listeners
worker.on('job:created', (job) => { /* ... */ });
worker.on('job:completed', (job) => { /* ... */ });
worker.on('job:failed', (job) => { /* ... */ });

worker.start();
```

## Health Checks Performed

### 1. Environment Check

- **direnv** installation and configuration
- **Node.js** and **npm** versions
- Environment variables (CLAUDE_CONFIG_DIR, CLAUDE_PROJECT_DIR, etc.)
- Shell configuration (direnv hook in ~/.zshrc)

### 2. Directory Structure

Verifies existence of required directories:
- `~/.claude/` and subdirectories (skills, hooks, agents, commands, scripts, logs)
- `~/dev/` structure (active, archive, templates)

### 3. Configuration Validation

Validates JSON syntax and structure:
- `settings.json` - Hook registration, plugin configuration
- `skill-rules.json` - Skill trigger patterns
- `package.json` - Script definitions
- `.envrc` - Environment variable definitions

### 4. Hook Analysis

- Total hook count
- Executable permissions
- Registered hooks in settings.json
- Hook file integrity

### 5. Plugin Analysis

- Total enabled plugins
- Duplicate category detection
- Threshold monitoring (warning: 20, critical: 30)
- Overlap identification

### 6. Component Inventory

- Skills count
- Agents count
- Commands count
- Active tasks
- Archived tasks
- Templates count

### 7. Performance Analysis

- Hook execution times
- Slow hook detection (>1000ms)
- Failure count
- Log file size

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_HEALTH_CRON_SCHEDULE` | `0 8 * * *` | Cron schedule (daily 8 AM) |
| `RUN_ON_STARTUP` | `false` | Run immediately on startup |
| `DETAILED` | `false` | Include detailed component listing |
| `SKIP_VALIDATION` | `false` | Skip configuration validation |
| `SKIP_PERFORMANCE` | `false` | Skip performance log analysis |
| `SKIP_PLUGINS` | `false` | Skip plugin analysis |

### Thresholds

Default thresholds (customizable in worker):

```javascript
const worker = new ClaudeHealthWorker({
  thresholds: {
    maxPlugins: 30,          // Error threshold
    warnPlugins: 20,         // Warning threshold
    maxHookExecutionTime: 1000,  // ms
    minDiskSpace: 104857600,     // 100MB
    maxLogSize: 10485760         // 10MB
  }
});
```

## Output Examples

### Summary Format

```
╔════════════════════════════════════════════════════════════════╗
║          Claude Code Health Check Summary                     ║
╚════════════════════════════════════════════════════════════════╝

Health Score: 92/100
Status:       ✅ Claude environment is healthy

Component Inventory:
  Skills:        34
  Agents:        12
  Commands:      3
  Hooks:         7/10 executable
  Registered:    3 hook types
  Plugins:       40
  Active Tasks:  0
  Archived:      0

Environment:
  Node.js:       v25.1.0
  npm:           11.6.2
  direnv:        ✓ installed

Summary:
  Critical Issues: 0
  Warnings:        2
  Duration:        342ms
```

### Recommendations Format

```
╔════════════════════════════════════════════════════════════════╗
║          Recommendations                                       ║
╚════════════════════════════════════════════════════════════════╝

🟡 [MEDIUM] plugins
   High plugin count (40)
   Action: Consider reviewing plugin usage

🟡 [MEDIUM] hooks
   No hooks registered in settings.json
   Action: Review recommended

✅ [INFO] healthy
   Claude environment is healthy (Score: 92/100)
   Action: No action needed
```

### Detailed Format

Includes:
- Configuration file status
- Individual hook details
- Duplicate plugin categories
- Performance metrics
- Slowest hook executions

## Usage Patterns

### One-Time Health Check

```bash
# Quick check
cd ~/code/jobs
npm run claude:health

# Review recommendations
# Fix issues
# Run again to verify
npm run claude:health
```

### Continuous Monitoring

```bash
# Start scheduled health checks
npm run claude:health:schedule

# Monitor with PM2
doppler run -- pm2 start claude-health-pipeline.js --name claude-health
pm2 logs claude-health
pm2 monit
```

### Integration with Existing System

```bash
# Local quick check (bash)
cd ~/.claude && npm run health

# Comprehensive check (AlephAuto)
cd ~/.claude && npm run health:comprehensive

# Detailed analysis
cd ~/.claude && npm run health:detailed
```

### CI/CD Integration

```bash
# In your CI pipeline
npm run claude:health || exit 1  # Fail on critical issues
```

## Integration with Other Workers

```javascript
// Monitor Claude health alongside other systems
import { ClaudeHealthWorker } from './sidequest/claude-health-worker.js';
import { PluginManagerWorker } from './sidequest/plugin-manager.js';
import { GitActivityWorker } from './sidequest/git-activity-worker.js';

const healthWorker = new ClaudeHealthWorker();
const pluginWorker = new PluginManagerWorker();
const gitWorker = new GitActivityWorker();

// Cross-system event handling
healthWorker.on('job:completed', (job) => {
  if (job.result.summary.healthScore < 70) {
    console.warn('Low health score detected!');
    // Trigger notification, log to Sentry, etc.
  }
});

healthWorker.start();
pluginWorker.start();
gitWorker.start();
```

## Health Score Calculation

The health score is calculated as:

```
Base Score: 100
Deductions:
  - Critical Issues: -20 points each
  - Warnings: -5 points each
Additions:
  - Successful checks: +10 points per check / total checks

Final Score: max(0, min(100, calculated score))
```

**Status Levels:**
- **90-100**: Healthy (✅)
- **70-89**: Warning (⚠️)
- **0-69**: Critical (🔴)

## Troubleshooting

### Worker Not Starting

Check Doppler configuration:

```bash
# Verify Doppler is configured
doppler --version
doppler run -- env | grep CLAUDE_HEALTH_CRON_SCHEDULE
```

### No Recommendations Shown

If no recommendations appear, your configuration is healthy:

```
✅ Claude environment is healthy (Score: 100/100)
   No action needed
```

### Low Health Score

1. Review critical issues first (red 🔴)
2. Address warnings next (yellow 🟡)
3. Re-run health check to verify fixes
4. Check detailed output for specific issues

### Missing Dependencies

```bash
# Reinstall dependencies
cd ~/code/jobs
npm install

# Verify AlephAuto framework
npm test
```

## Best Practices

1. **Daily Health Checks** - Schedule daily checks to catch issues early
2. **Monitor Health Score** - Set up alerts for scores below 80
3. **Fix Critical Issues First** - Prioritize by priority level
4. **Review Detailed Output** - Use detailed mode to understand issues
5. **Backup Before Fixes** - Always backup before making changes: `npm run backup`
6. **Version Control** - Keep settings.json in version control (if safe)
7. **Sentry Monitoring** - Use Sentry to track health check failures

## Integration with Existing Systems

The Claude Health Check integrates seamlessly with:

- **AlephAuto Job Queue** - Same base class as other workers
- **Plugin Manager** - Shares plugin analysis logic
- **Sentry Error Tracking** - All errors logged to Sentry
- **Cron Scheduling** - Consistent scheduling pattern
- **Event System** - Standard lifecycle events
- **PM2 Process Manager** - Production deployment support
- **Existing ~/.claude scripts** - Extends existing health.sh

## Comparison: Local vs Comprehensive

| Feature | Local (`npm run health`) | Comprehensive (`npm run health:comprehensive`) |
|---------|-------------------------|----------------------------------------------|
| **Runtime** | Bash | Node.js (AlephAuto) |
| **Configuration** | Basic checks | Full validation |
| **Plugin Analysis** | Count only | Duplicate detection |
| **Performance** | Not analyzed | Full analysis |
| **Sentry Integration** | No | Yes |
| **Event Emission** | No | Yes |
| **Scheduling** | Manual | Cron support |
| **Output** | Simple | Detailed + JSON |
| **Health Score** | No | Yes (0-100) |

**Recommendation:** Use local for quick checks, comprehensive for deep analysis.

## Future Enhancements

Potential features for future versions:

- [ ] Auto-fix for common issues (with confirmation)
- [ ] Historical health score tracking
- [ ] Trend analysis and predictions
- [ ] Integration with Claude Code's built-in health checks
- [ ] Notification system (email, Slack, etc.)
- [ ] Custom health check plugins
- [ ] Performance benchmarking
- [ ] Automated optimization suggestions

## Related Documentation

- [AlephAuto Job Queue Framework](../CLAUDE.md#alephauto-job-queue-framework)
- [Plugin Manager](./README-PLUGIN-MANAGER.md)
- [Cron Scheduling](../CLAUDE.md#cron-scheduling)
- [Sentry Integration](../CLAUDE.md#logging-with-sentry)
- [PM2 Deployment](../CLAUDE.md#production-deployment)
- [~/.claude Health Scripts](~/.claude/CLAUDE.md#commands)

## Examples

### Example 1: Daily Monitoring

```bash
# Deploy with PM2 for continuous monitoring
cd ~/code/jobs
doppler run -- pm2 start claude-health-pipeline.js --name claude-health --cron-restart="0 8 * * *"

# Monitor
pm2 logs claude-health --lines 100
```

### Example 2: Pre-Deployment Check

```bash
# Before deploying changes
cd ~/code/jobs
npm run claude:health || (echo "Health check failed!" && exit 1)

# If passing, proceed with deployment
git push
```

### Example 3: Development Workflow

```bash
# Morning routine
cd ~/.claude
npm run health:quick  # Fast check

# After making changes
npm run health:comprehensive  # Full analysis

# Before committing
npm run backup && npm run health:detailed
```

---

**Last Updated:** 2025-11-17

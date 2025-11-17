# Plugin Manager - AlephAuto Integration

Automated monitoring and auditing system for Claude Code plugin configurations, integrated with the AlephAuto job queue framework.

## Features

- **Automated Audits** - Weekly scheduled plugin audits (Monday 9 AM by default)
- **Duplicate Detection** - Identifies plugins with overlapping functionality
- **Usage Analytics** - Tracks plugin count and identifies potential overhead
- **Cleanup Recommendations** - Provides actionable suggestions for optimization
- **Event-Driven** - Emits lifecycle events for monitoring and integration
- **Sentry Integration** - Error tracking and performance monitoring

## Quick Start

### Run Immediate Audit

```bash
# Simple audit
cd ~/code/jobs
npm run plugin:audit

# Detailed audit with full plugin listing
npm run plugin:audit:detailed
```

### Schedule Automatic Audits

```bash
# Start cron scheduler (runs Monday 9 AM)
npm run plugin:schedule

# Custom schedule
PLUGIN_CRON_SCHEDULE="0 10 * * 2" npm run plugin:schedule  # Tuesday 10 AM

# Deploy with PM2
doppler run -- pm2 start sidequest/plugin-manager.js --name plugin-auditor
```

### Manual Shell Script Audit

```bash
# Human-readable output
./sidequest/plugin-management-audit.sh

# Detailed listing
./sidequest/plugin-management-audit.sh --detailed

# JSON output
./sidequest/plugin-management-audit.sh --json
```

## Installation Requirements

### Bash 4+ (macOS Only)

The shell script requires bash 4+ for associative arrays. macOS ships with bash 3.x by default.

```bash
# Install modern bash
brew install bash

# Verify version (should be 4.x or 5.x)
/opt/homebrew/bin/bash --version
```

The npm scripts automatically handle this requirement.

## Architecture

### Components

```
Plugin Manager System
├── plugin-manager.js          # AlephAuto worker (Node.js)
│   ├── Extends SidequestServer
│   ├── Job queue management
│   ├── Cron scheduling
│   ├── Event emission
│   └── Sentry integration
│
├── plugin-management-audit.sh # Audit script (Bash)
│   ├── Config file parsing
│   ├── Category detection
│   ├── Duplicate identification
│   └── Report generation
│
└── Claude Config
    └── ~/.claude/settings.json
```

### Worker Integration

The `PluginManagerWorker` extends `SidequestServer` and follows AlephAuto patterns:

```javascript
import { PluginManagerWorker } from './sidequest/plugin-manager.js';

const worker = new PluginManagerWorker({
  maxConcurrent: 1,
  cronSchedule: '0 9 * * 1',  // Monday 9 AM
  cronEnabled: true
});

// Event listeners
worker.on('job:created', (job) => { /* ... */ });
worker.on('job:completed', (job) => { /* ... */ });
worker.on('job:failed', (job) => { /* ... */ });

worker.start();
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PLUGIN_CRON_SCHEDULE` | `0 9 * * 1` | Cron schedule (Monday 9 AM) |
| `RUN_ON_STARTUP` | `false` | Run immediately on startup |
| `DETAILED` | `false` | Include detailed plugin listing |

### Thresholds

Default thresholds can be customized:

```javascript
const worker = new PluginManagerWorker({
  // Custom thresholds
  thresholds: {
    maxPlugins: 30,   // Error threshold
    warnPlugins: 20   // Warning threshold
  }
});
```

## Output Examples

### Human-Readable Format

```
╔════════════════════════════════════════════════════════════════╗
║          Claude Code Plugin Management Audit                   ║
╚════════════════════════════════════════════════════════════════╝

Total Enabled Plugins: 32

⚠️  Potential Duplicate Categories:
────────────────────────────────────────────────────────────────

  Category: documentation (5 plugins)
    • document-skills-docx@awesome-claude-skills
    • document-skills-pdf@awesome-claude-skills
    • document-skills-xlsx@awesome-claude-skills
    • document-skills@anthropic-agent-skills
    • documentation-generator@claude-code-templates

💡 Consider reviewing these categories for consolidation.

Recommendations:
────────────────────────────────────────────────────────────────
  • High plugin count (32). Consider disabling unused plugins.
  • Review duplicate categories above.
  • Keep only the plugins you actively use in each category.
```

### JSON Format

```json
{
  "total_enabled": 32,
  "enabled_plugins": [
    "plugin-name-1@source",
    "plugin-name-2@source"
  ],
  "potential_duplicates": {
    "documentation": [
      "document-skills-docx@awesome-claude-skills",
      "document-skills-pdf@awesome-claude-skills",
      "document-skills@anthropic-agent-skills"
    ]
  }
}
```

### Recommendations Output

```
╔════════════════════════════════════════════════════════════════╗
║          Plugin Audit Recommendations                          ║
╚════════════════════════════════════════════════════════════════╝

🔴 [HIGH] plugin_count
   You have 32 enabled plugins (threshold: 30)
   Action: Review and disable unused plugins to reduce overhead

🟡 [MEDIUM] duplicate_categories
   Found 2 categories with multiple plugins
   Action: Review duplicate categories and consolidate
   Details:
     • documentation: document-skills-docx@awesome-claude-skills, ...
       → Keep only the plugin you actively use in documentation
     • git: git-workflow@claude-code-templates, git@fradser-dotagent
       → Keep only the plugin you actively use in git
```

## Usage Patterns

### One-Time Audit

```bash
# Quick check
npm run plugin:audit

# Review recommendations
# Manually disable plugins in Claude Code settings
# Run again to verify
npm run plugin:audit
```

### Continuous Monitoring

```bash
# Start scheduled audits
npm run plugin:schedule

# Monitor with PM2
pm2 start sidequest/plugin-manager.js --name plugin-auditor
pm2 logs plugin-auditor
pm2 monit
```

### Integration with Other Workers

```javascript
// Monitor plugin changes alongside other systems
import { PluginManagerWorker } from './sidequest/plugin-manager.js';
import { GitActivityWorker } from './sidequest/git-activity-worker.js';

const pluginWorker = new PluginManagerWorker();
const gitWorker = new GitActivityWorker();

// Cross-system event handling
pluginWorker.on('job:completed', (job) => {
  if (job.result.exceededThresholds.maxPlugins) {
    console.warn('High plugin count detected!');
    // Trigger notification, log to Sentry, etc.
  }
});

pluginWorker.start();
gitWorker.start();
```

## Detected Categories

The audit script identifies plugins in these categories:

- **documentation** - Document generation, PDF/DOCX/XLSX tools
- **git** - Git workflows, GitHub integration
- **testing** - Test runners, test utilities
- **deployment** - Deployment tools, CD/CI
- **linting** - Code linters, formatters
- **containers** - Docker, container tools
- **api** - REST API, GraphQL tools
- **database** - Database clients, SQL tools

## Troubleshooting

### Script Fails with "invalid option"

This means you're using bash 3.x (macOS default):

```bash
# Install modern bash
brew install bash

# Run with explicit path
/opt/homebrew/bin/bash ./sidequest/plugin-management-audit.sh

# Or use npm scripts (they handle this automatically)
npm run plugin:audit
```

### No Recommendations Shown

If no recommendations appear, your configuration is healthy:

```
✅ Plugin configuration looks healthy (18 plugins)
   No action needed
```

### Worker Not Starting

Check Doppler configuration:

```bash
# Verify Doppler is configured
doppler --version
doppler run -- node --version

# Check environment variables
doppler run -- env | grep PLUGIN_CRON_SCHEDULE
```

## Best Practices

1. **Regular Audits** - Run weekly audits to catch configuration drift
2. **Backup First** - Always backup before making plugin changes: `npm run backup`
3. **Test Changes** - After disabling plugins, test your workflows
4. **Monitor Logs** - Use Sentry to track audit failures and performance
5. **Version Control** - Keep settings.json in version control (if safe)

## Integration with Existing Systems

The Plugin Manager integrates seamlessly with:

- **AlephAuto Job Queue** - Same base class as other workers
- **Sentry Error Tracking** - All errors logged to Sentry
- **Cron Scheduling** - Consistent scheduling pattern
- **Event System** - Standard lifecycle events
- **PM2 Process Manager** - Production deployment support

## Future Enhancements

Potential features for future versions:

- [ ] Automatic plugin disabling (with confirmation)
- [ ] Plugin usage analytics (track which plugins are actually used)
- [ ] Integration with Claude Code's built-in plugin manager
- [ ] Historical tracking of plugin changes
- [ ] Recommendations based on project type
- [ ] Notification system (email, Slack, etc.)

## Related Documentation

- [AlephAuto Job Queue Framework](../CLAUDE.md#alephauto-job-queue-framework)
- [Cron Scheduling](../CLAUDE.md#cron-scheduling)
- [Sentry Integration](../CLAUDE.md#logging-with-sentry)
- [PM2 Deployment](../CLAUDE.md#production-deployment)

---

**Last Updated:** 2025-11-17

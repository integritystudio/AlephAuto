# Sentry Error Monitoring Setup

## Quick Setup

This project uses **Doppler** for all secrets. Never write secrets to `.env` files.

```bash
# Add SENTRY_DSN to Doppler
doppler secrets set SENTRY_DSN="your_actual_dsn_here" \
  --project integrity-studio --config dev

# Verify
doppler secrets get SENTRY_DSN --project integrity-studio --config dev

# Run with Doppler
doppler run -- node --strip-types api/server.ts
```

Access in code via centralized config:

```typescript
import { config } from './sidequest/core/config.ts';
const dsn = config.sentryDsn;  // Never use process.env.SENTRY_DSN
```

### Manual Project Creation

If you need a new Sentry project:

1. Visit https://sentry.io/signup/ (free tier available)
2. Create Project: Platform **Node.js**, alert on every new issue
3. Copy DSN from Settings > Projects > Client Keys (DSN)
4. Add to Doppler (command above)
5. Test: `doppler run -- node --strip-types api/server.ts`

## What Gets Monitored

**Automatic error tracking** across all pipelines: command failures, permission errors, file system issues, process timeouts, schema validation failures, MCP tool errors.

**Performance monitoring**: job execution time, queue processing, file operations, schema generation.

**Error context** included with each event: job ID/type, file paths, environment, breadcrumbs, stack traces.

## Alert Configuration

**Org**: `o4510332694495232` | **Project**: `4510332704260096` | **Region**: US

### Recommended Alert Rules

Create at https://sentry.io/organizations/o4510332694495232/alerts/rules/

| Alert | Type | Condition | Severity |
|-------|------|-----------|----------|
| High Error Rate | Issue | Error count > 100 in 1 hour | Critical |
| New Error Pattern | Issue | New issue created | Warning |
| Error Spike | Metric | Error count +50% vs baseline (15min window) | High |
| Repomix Failures | Issue | `tags[component]:repomix-worker AND level:error` | High |

### Threshold Tuning

| Alert Type | Threshold | Frequency | Priority |
|------------|-----------|-----------|----------|
| Error Rate | > 60% | 1 hour | Critical |
| Error Spike | +50% baseline | 15 min | High |
| New Error | First occurrence | Immediate | Medium |
| Repomix Failures | > 10/hour | 1 hour | High |
| Doc Enhancement Failures | > 5/hour | 1 hour | Medium |

### Custom Alert Queries

```
event.type:error AND event.level:error                          # High error rate
tags[component]:repomix-worker AND event.level:error            # Repomix specific
event.type:transaction AND transaction.duration:>5000           # Performance
```

### Programmatic Alert Creation (Optional)

```bash
export SENTRY_AUTH_TOKEN="your-auth-token"

curl -X POST \
  https://sentry.io/api/0/projects/o4510332694495232/4510332704260096/rules/ \
  -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "High Error Rate Alert",
    "conditions": [{
      "id": "sentry.rules.conditions.event_frequency.EventFrequencyCondition",
      "value": 100, "interval": "1h"
    }],
    "actions": [{"id": "sentry.rules.actions.notify_event.NotifyEventAction"}],
    "actionMatch": "any"
  }'
```

## Slack Integration

1. Settings > Integrations > Slack > "Add to Slack"
2. Choose a dedicated channel (e.g., `#sentry-alerts`)
3. Edit each alert rule to add "Send Slack notification" action
4. Test: `node test/test-sentry-connection.js`

## Best Practices

- **Environments**: use `NODE_ENV=production` for production alerts; dev is less noisy
- **Inbound filters** (Settings > Inbound Filters): ignore `node_modules`, `.git`, test runs
- **Release tracking**: set `SENTRY_RELEASE="jobs@x.y.z"` at deploy time
- **Sampling**: `SENTRY_TRACES_SAMPLE_RATE` in Doppler (default `0.1` = 10%)
- **Weekly review**: check alert frequency, false positive rate, muted alerts

## Testing

```bash
# Trigger test error
node test/test-sentry-connection.js

# Run a job and check Performance tab
npm run test:single
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| No errors appearing | Verify DSN: `doppler secrets get SENTRY_DSN --project integrity-studio --config dev` |
| Network issues | Ensure outbound HTTPS to `sentry.io` is allowed |
| Too many alerts | Increase thresholds, add filters, snooze repetitive issues |
| Alerts not firing | Check rule is enabled, conditions are met, notification channel is configured |
| Missing alerts | Lower thresholds, verify events reaching Sentry via event stream |

## Cost

Free tier: 5,000 errors/month, 10,000 perf units, 1 user, 30-day retention. Typical usage (~100-500 errors/month) is well within limits. If exceeded: filter noisy errors, upgrade ($26/month), or increase sampling.

## Quick Reference

```bash
doppler secrets set SENTRY_DSN="your_dsn" --project integrity-studio --config dev
doppler run -- node --strip-types api/server.ts
node test/test-sentry-connection.js
open https://sentry.io/organizations/o4510332694495232/alerts/rules/
```

## Resources

- [Sentry Node.js Docs](https://docs.sentry.io/platforms/node/)
- [Alert Types](https://docs.sentry.io/product/alerts/alert-types/)
- [Slack Integration](https://docs.sentry.io/product/integrations/notification-incidents/slack/)
- [Dashboard](https://sentry.io/organizations/o4510332694495232/projects/4510332704260096/)

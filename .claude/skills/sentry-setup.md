---
name: sentry-setup
description: Set up comprehensive Sentry error monitoring and alerts for any Integrity Studio site. Configures DSN, creates standardized alert rules via API, tests connection, and documents the setup. Use when adding Sentry to a new project or enhancing existing Sentry configuration.
triggers:
  - keyword: sentry
  - keyword: error monitoring
  - keyword: error tracking
  - intent: "set up error monitoring"
  - intent: "configure sentry alerts"
  - intent: "add error tracking"
tags:
  - monitoring
  - devops
  - sentry
  - alerts
location: user
---

# Sentry Setup Skill

This skill implements comprehensive Sentry error monitoring and alerting for Integrity Studio projects.

## What This Skill Does

1. ✅ Retrieves Sentry credentials from Doppler
2. ✅ Identifies correct Sentry organization and project
3. ✅ Creates 4 standardized alert rules via API
4. ✅ Tests the Sentry connection
5. ✅ Documents the configuration

## Prerequisites Check

Before starting, verify:

```bash
# Check for Sentry DSN in environment
doppler secrets get SENTRY_DSN --plain 2>/dev/null

# Check for Sentry auth token (may be in different Doppler projects)
# Common locations:
doppler secrets get SENTRY_TOKEN -p analyticsbot -c dev --plain
doppler secrets get SENTRY_AUTH_TOKEN --plain
```

## Pattern: Sentry Setup Process

### Step 1: Get Sentry Credentials

**Pattern**: Sentry tokens may be in different Doppler projects/configs.

```bash
# Try common locations
SENTRY_TOKEN=$(doppler secrets get SENTRY_TOKEN -p analyticsbot -c dev --plain 2>/dev/null)
if [ -z "$SENTRY_TOKEN" ]; then
  SENTRY_TOKEN=$(doppler secrets get SENTRY_AUTH_TOKEN --plain 2>/dev/null)
fi
```

**Learning**: Always ask the user where the token is stored if not found in standard locations.

### Step 2: Identify Organization and Project

**Pattern**: Use Sentry API to discover organization slug and project details.

```bash
# Get organization details
curl -s "https://sentry.io/api/0/organizations/" \
  -H "Authorization: Bearer $SENTRY_TOKEN" | python3 -m json.tool

# Get projects in organization
curl -s "https://sentry.io/api/0/organizations/{org-slug}/projects/" \
  -H "Authorization: Bearer $SENTRY_TOKEN" | python3 -m json.tool
```

**Key Discovery**:
- Organization slug ≠ Organization ID (use slug for API)
- Project slug ≠ Project ID (use slug for API)
- DSN contains numeric IDs, but API uses slugs

**Example from this session**:
- DSN: `https://...@o4510332694495232.ingest.us.sentry.io/4510346321657856`
- Organization ID: `4510332694495232` → Org slug: `integrity-studio`
- Project ID: `4510346321657856` → Project slug: `node`

### Step 3: Create Standardized Alert Rules

**Pattern**: Create 4 core alert rules for comprehensive monitoring.

#### Alert 1: High Error Rate (Critical)

**Purpose**: Detect sustained high error rates indicating system-wide issues.

```bash
curl -X POST \
  "https://sentry.io/api/0/projects/{org-slug}/{project-slug}/rules/" \
  -H "Authorization: Bearer $SENTRY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "High Error Rate - Log Processing",
    "environment": null,
    "actionMatch": "any",
    "filterMatch": "all",
    "conditions": [
      {
        "id": "sentry.rules.conditions.event_frequency.EventFrequencyCondition",
        "value": 100,
        "comparisonType": "count",
        "interval": "1h"
      }
    ],
    "actions": [
      {
        "id": "sentry.mail.actions.NotifyEmailAction",
        "targetType": "IssueOwners",
        "targetIdentifier": ""
      }
    ],
    "frequency": 60
  }'
```

**Configuration**:
- Threshold: 100 errors/hour
- Priority: Critical
- Frequency: Alert once per hour
- Action: Email notification

#### Alert 2: New Error Pattern (Medium)

**Purpose**: Get notified immediately when new error types appear.

```bash
curl -X POST \
  "https://sentry.io/api/0/projects/{org-slug}/{project-slug}/rules/" \
  -H "Authorization: Bearer $SENTRY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "New Error Pattern Detected",
    "environment": null,
    "actionMatch": "any",
    "filterMatch": "all",
    "conditions": [
      {
        "id": "sentry.rules.conditions.first_seen_event.FirstSeenEventCondition"
      }
    ],
    "actions": [
      {
        "id": "sentry.mail.actions.NotifyEmailAction",
        "targetType": "IssueOwners",
        "targetIdentifier": ""
      }
    ],
    "frequency": 30
  }'
```

**Configuration**:
- Threshold: First occurrence
- Priority: Medium
- Frequency: Alert every 30 minutes
- Action: Email notification

#### Alert 3: Error Spike (High)

**Purpose**: Detect sudden increases in error rates.

```bash
curl -X POST \
  "https://sentry.io/api/0/projects/{org-slug}/{project-slug}/rules/" \
  -H "Authorization: Bearer $SENTRY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Error Spike Detected",
    "environment": null,
    "actionMatch": "any",
    "filterMatch": "all",
    "conditions": [
      {
        "id": "sentry.rules.conditions.event_frequency.EventFrequencyCondition",
        "value": 50,
        "comparisonType": "count",
        "interval": "15m"
      }
    ],
    "actions": [
      {
        "id": "sentry.mail.actions.NotifyEmailAction",
        "targetType": "IssueOwners",
        "targetIdentifier": ""
      }
    ],
    "frequency": 30
  }'
```

**Configuration**:
- Threshold: 50 errors/15 minutes
- Priority: High
- Frequency: Alert every 30 minutes
- Action: Email notification

**Learning**: EventFrequencyPercentCondition (percentage-based) may not work; use count-based instead.

#### Alert 4: Component-Specific Failures (High)

**Purpose**: Monitor failures in specific components/workers.

```bash
curl -X POST \
  "https://sentry.io/api/0/projects/{org-slug}/{project-slug}/rules/" \
  -H "Authorization: Bearer $SENTRY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "[Component] Job Failures",
    "environment": null,
    "actionMatch": "all",
    "filterMatch": "all",
    "conditions": [
      {
        "id": "sentry.rules.conditions.event_frequency.EventFrequencyCondition",
        "value": 10,
        "comparisonType": "count",
        "interval": "1h"
      }
    ],
    "filters": [
      {
        "id": "sentry.rules.filters.tagged_event.TaggedEventFilter",
        "key": "component",
        "match": "eq",
        "value": "worker-name"
      }
    ],
    "actions": [
      {
        "id": "sentry.mail.actions.NotifyEmailAction",
        "targetType": "IssueOwners",
        "targetIdentifier": ""
      }
    ],
    "frequency": 60
  }'
```

**Configuration**:
- Threshold: 10 errors/hour with specific tag
- Priority: High
- Frequency: Alert once per hour
- Filter: component tag
- Action: Email notification

**Pattern**: Customize the `value` field in filters for each component.

### Step 4: Verify Alert Creation

**Pattern**: List all rules to confirm creation.

```bash
curl -s "https://sentry.io/api/0/projects/{org-slug}/{project-slug}/rules/" \
  -H "Authorization: Bearer $SENTRY_TOKEN" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print('\n📋 Configured Alert Rules:')
print('=' * 60)
for i, rule in enumerate(data, 1):
    print(f'{i}. {rule[\"name\"]} (ID: {rule[\"id\"]})')
    print(f'   Status: {\"✅ Active\" if rule.get(\"status\") == \"active\" else rule.get(\"status\", \"active\")}')
print('=' * 60)
print(f'Total: {len(data)} alert rules')
"
```

### Step 5: Test Sentry Connection

**Pattern**: Send test events to verify setup.

Create a test script (`test/test-sentry-connection.js`):

```javascript
const Sentry = require('@sentry/node');

// Initialize Sentry
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  tracesSampleRate: 1.0,
});

console.log('🧪 Testing Sentry Connection...\n');

// Test 1: Send info message
const messageId = Sentry.captureMessage(
  'Sentry connection test successful! 🎉',
  'info'
);
console.log(`✅ Test message sent! Event ID: ${messageId}\n`);

// Test 2: Send error
const errorId = Sentry.captureException(
  new Error('Test error - This is a test error to verify Sentry is working')
);
console.log(`✅ Test error sent! Error ID: ${errorId}\n`);

// Flush events
await Sentry.flush(2000);
console.log('✅ Events flushed to Sentry\n');
```

Run test:
```bash
node test/test-sentry-connection.js
```

### Step 6: Document the Setup

**Pattern**: Create comprehensive documentation.

Document in `setup-files/SENTRY_SETUP.md`:

```markdown
# Sentry Setup - {Project Name}

**Setup Date**: {Date}
**Organization**: {org-slug}
**Project**: {project-slug}

## Configuration

- **DSN**: `{masked-dsn}`
- **Environment**: {environment}
- **Region**: {region}

## Alert Rules Configured

1. **High Error Rate** (ID: {id}) - >100 errors/hour
2. **New Error Pattern** (ID: {id}) - First occurrence
3. **Error Spike** (ID: {id}) - >50 errors/15min
4. **Component Failures** (ID: {id}) - >10 errors/hour

## Quick Links

- Dashboard: https://sentry.io/organizations/{org-slug}/projects/{project-slug}/
- Alerts: https://sentry.io/organizations/{org-slug}/alerts/rules/

## Testing

```bash
node test/test-sentry-connection.js
```
```

## Threshold Recommendations

**Pattern**: Adjust thresholds based on current error rates.

| Current Error Rate | High Rate Alert | Spike Alert | Component Alert |
|-------------------|-----------------|-------------|-----------------|
| < 5% | 50/hour | 20/15min | 5/hour |
| 5-20% | 100/hour | 50/15min | 10/hour |
| 20-50% | 200/hour | 100/15min | 20/hour |
| > 50% | 300/hour | 150/15min | 30/hour |

**Learning**: Start with higher thresholds to avoid alert fatigue, then decrease as error rate improves.

## Integration Patterns

### Pattern 1: Centralized Config

**Never use `process.env` directly**. Always use centralized config:

```javascript
// config.js
export const config = {
  sentryDsn: process.env.SENTRY_DSN,
  sentryEnvironment: process.env.NODE_ENV || 'development',
};

// app.js
import { config } from './config.js';
Sentry.init({ dsn: config.sentryDsn });
```

### Pattern 2: Component Tagging

**Always tag errors with component name**:

```javascript
Sentry.setTag('component', 'repomix-worker');
Sentry.captureException(error);
```

This enables component-specific alerts.

### Pattern 3: Context Enrichment

**Add useful context to errors**:

```javascript
Sentry.setContext('job', {
  jobId: job.id,
  repository: job.repository,
  startTime: job.startTime,
});
```

## Common Issues and Solutions

### Issue 1: 404 Error on API Calls

**Problem**: Using numeric IDs instead of slugs.

**Solution**:
```bash
# ❌ Wrong
curl https://sentry.io/api/0/projects/4510332694495232/4510346321657856/rules/

# ✅ Correct
curl https://sentry.io/api/0/projects/integrity-studio/node/rules/
```

### Issue 2: Alert Not Firing

**Problem**: Threshold too high or wrong condition type.

**Solution**:
- Check current error volume
- Adjust thresholds
- Use count-based conditions instead of percentage

### Issue 3: Too Many Alerts

**Problem**: Alert fatigue from too many notifications.

**Solution**:
- Increase thresholds
- Add filters (environment, component)
- Increase frequency interval
- Use "actionMatch": "all" instead of "any"

## Skill Execution Checklist

When using this skill, follow this checklist:

- [ ] Get Sentry token from Doppler (check multiple projects if needed)
- [ ] Discover organization slug via API
- [ ] Discover project slug via API
- [ ] Verify DSN matches project ID
- [ ] Create 4 core alert rules
- [ ] Verify all alerts created successfully
- [ ] Test with sample events
- [ ] Document configuration
- [ ] Set up component tagging in code
- [ ] Monitor for first 24 hours and adjust thresholds

## Success Criteria

✅ **Setup Complete** when:
- All 4 alert rules created and active
- Test events successfully sent to Sentry
- Test events visible in dashboard
- Documentation created
- Component tagging implemented

✅ **Working Correctly** when:
- Alerts fire appropriately (not too often, not missed)
- False positive rate < 20%
- Critical errors trigger notifications
- Dashboard shows recent events

## Optional Enhancements

### Slack Integration

1. Add Slack integration in Sentry UI:
   ```
   https://sentry.io/settings/{org-slug}/integrations/slack/
   ```

2. Update alert actions to include Slack:
   ```json
   "actions": [
     {
       "id": "sentry.mail.actions.NotifyEmailAction",
       "targetType": "IssueOwners",
       "targetIdentifier": ""
     },
     {
       "id": "sentry.integrations.slack.notify_action.SlackNotifyServiceAction",
       "workspace": "{workspace-id}",
       "channel": "#sentry-alerts"
     }
   ]
   ```

### Custom Metrics

Track custom metrics with Sentry:

```javascript
Sentry.metrics.increment('job.completed', 1, {
  tags: { component: 'repomix-worker' }
});

Sentry.metrics.distribution('job.duration', duration, {
  unit: 'millisecond',
  tags: { component: 'repomix-worker' }
});
```

## Template Scripts

### Quick Setup Script

```bash
#!/bin/bash
# sentry-quick-setup.sh

set -euo pipefail

echo "🔧 Sentry Quick Setup"
echo "===================="

# Get credentials
SENTRY_TOKEN="${1:-$(doppler secrets get SENTRY_TOKEN -p analyticsbot -c dev --plain)}"
ORG_SLUG="${2:-integrity-studio}"
PROJECT_SLUG="${3:-node}"

# Create alerts
echo "Creating alert rules..."

# High Error Rate
curl -s -X POST \
  "https://sentry.io/api/0/projects/$ORG_SLUG/$PROJECT_SLUG/rules/" \
  -H "Authorization: Bearer $SENTRY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "High Error Rate",
    "conditions": [{"id": "sentry.rules.conditions.event_frequency.EventFrequencyCondition", "value": 100, "interval": "1h"}],
    "actions": [{"id": "sentry.mail.actions.NotifyEmailAction", "targetType": "IssueOwners"}],
    "frequency": 60
  }' | python3 -c "import sys,json; print('✅ Created:', json.load(sys.stdin)['name'])"

# New Error Pattern
curl -s -X POST \
  "https://sentry.io/api/0/projects/$ORG_SLUG/$PROJECT_SLUG/rules/" \
  -H "Authorization: Bearer $SENTRY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "New Error Pattern",
    "conditions": [{"id": "sentry.rules.conditions.first_seen_event.FirstSeenEventCondition"}],
    "actions": [{"id": "sentry.mail.actions.NotifyEmailAction", "targetType": "IssueOwners"}],
    "frequency": 30
  }' | python3 -c "import sys,json; print('✅ Created:', json.load(sys.stdin)['name'])"

echo ""
echo "✅ Sentry setup complete!"
echo "Visit: https://sentry.io/organizations/$ORG_SLUG/alerts/rules/"
```

## References

### Sentry API Documentation
- [Alert Rules API](https://docs.sentry.io/api/alerts/create-a-rule-for-an-organization/)
- [Conditions Reference](https://docs.sentry.io/product/alerts/alert-types/)
- [Actions Reference](https://docs.sentry.io/product/alerts/notifications/)

### Key Learnings from This Session
1. Organization/project slugs ≠ numeric IDs (use slugs for API)
2. Sentry tokens may be in different Doppler projects
3. Start with higher alert thresholds, then decrease
4. Count-based conditions more reliable than percentage-based
5. Component tagging enables granular monitoring
6. Test with sample events before relying on production errors

## Example: Complete Setup for New Project

```bash
# 1. Get token
export SENTRY_TOKEN=$(doppler secrets get SENTRY_TOKEN -p analyticsbot -c dev --plain)

# 2. Discover org/project
curl -s "https://sentry.io/api/0/organizations/" \
  -H "Authorization: Bearer $SENTRY_TOKEN" | jq '.[0].slug'

# 3. Create alerts (use template script)
./sentry-quick-setup.sh "$SENTRY_TOKEN" "org-slug" "project-slug"

# 4. Test
node test/test-sentry-connection.js

# 5. Verify
open "https://sentry.io/organizations/org-slug/alerts/rules/"
```

---

**Remember**: Always prioritize comprehensive error tracking over perfect alert tuning. Start conservative (fewer alerts) and iterate based on actual error patterns.

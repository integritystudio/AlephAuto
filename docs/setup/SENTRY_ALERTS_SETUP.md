# Sentry Error Rate Alerts Setup Guide

**Purpose**: Configure automated alerts in Sentry to monitor error rates and system health
**Last Updated**: 2025-11-12

## Overview

This guide helps you set up error rate alerts in Sentry to get notified when:
- Error rates exceed acceptable thresholds
- Specific error patterns occur repeatedly
- System performance degrades
- New error types appear

## Prerequisites

- ✅ Sentry account with access to the project
- ✅ Sentry DSN configured in `.env`
- ✅ Organization: `o4510332694495232`
- ✅ Project: `4510332704260096`
- ✅ Region: US (`ingest.us.sentry.io`)

## Recommended Alert Rules

### 1. High Error Rate Alert

**Alert Name**: High Error Rate - Log Processing
**Condition**: Error count > 100 in 1 hour
**Severity**: Critical

**Setup Steps**:
1. Go to https://sentry.io/organizations/o4510332694495232/alerts/rules/
2. Click "Create Alert"
3. Select "Issues" alert type
4. Configure:
   - **When**: An event is seen
   - **If**: matches "error"
   - **Then**: Send notification
   - **Frequency**: Alert once per hour when condition is met
   - **Action**: Send notification to Email/Slack

### 2. New Error Type Alert

**Alert Name**: New Error Pattern Detected
**Condition**: New issue is created (first time error)
**Severity**: Warning

**Setup Steps**:
1. Go to https://sentry.io/organizations/o4510332694495232/alerts/rules/
2. Click "Create Alert"
3. Select "Issues" alert type
4. Configure:
   - **When**: A new issue is created
   - **If**: all conditions (no filters)
   - **Then**: Send notification
   - **Action**: Send notification to Email/Slack

### 3. Error Spike Alert

**Alert Name**: Error Spike Detected
**Condition**: Error count increases by 50% compared to baseline
**Severity**: Warning

**Setup Steps**:
1. Go to https://sentry.io/organizations/o4510332694495232/alerts/metric-alerts/
2. Click "Create Alert"
3. Select "Errors" metric
4. Configure:
   - **Metric**: Number of Errors
   - **Function**: count()
   - **Time Window**: 15 minutes
   - **Trigger**: Above 150% of baseline
   - **Action**: Send notification to Email/Slack

### 4. Specific Component Error Alert

**Alert Name**: Repomix Job Failures
**Condition**: Errors in repomix-worker component
**Severity**: High

**Setup Steps**:
1. Go to https://sentry.io/organizations/o4510332694495232/alerts/rules/
2. Click "Create Alert"
3. Select "Issues" alert type
4. Configure:
   - **When**: An event is seen
   - **If**: event.tags.component equals "repomix-worker"
   - **And**: event.level equals "error"
   - **Then**: Send notification
   - **Action**: Send notification to Email/Slack

## Alert Configuration via Sentry Web UI

### Step-by-Step: Creating an Alert Rule

1. **Navigate to Alerts**:
   ```
   https://sentry.io/organizations/o4510332694495232/alerts/
   ```

2. **Choose Alert Type**:
   - **Issue Alerts**: Trigger when specific issues/errors occur
   - **Metric Alerts**: Trigger based on performance or volume metrics

3. **Configure Conditions**:
   - Set thresholds (e.g., > 100 errors/hour)
   - Filter by tags, environment, or release
   - Set time windows (5min, 15min, 1hour, etc.)

4. **Set Actions**:
   - Email notification
   - Slack notification
   - PagerDuty integration
   - Custom webhooks

5. **Save and Test**:
   - Save the rule
   - Trigger a test error to verify alerts work

## Integration with Slack (Recommended)

### Setup Slack Integration

1. **Add Sentry to Slack**:
   ```
   https://sentry.io/settings/o4510332694495232/integrations/slack/
   ```

2. **Configure Channel**:
   - Choose a dedicated channel (e.g., `#sentry-alerts`)
   - Set notification preferences

3. **Update Alert Rules**:
   - Edit each alert rule
   - Add "Send Slack notification" action
   - Select the channel

4. **Test Integration**:
   ```bash
   node test/test-sentry-connection.js
   ```

## Custom Alert Queries

### High Error Rate Query
```
event.type:error AND event.level:error
```

### Repomix Specific Errors
```
tags[component]:repomix-worker AND event.level:error
```

### Performance Issues
```
event.type:transaction AND transaction.duration:>5000
```

## Alert Thresholds (Recommended)

Based on current log analysis showing 55.8% error rate:

| Alert Type | Threshold | Frequency | Priority |
|------------|-----------|-----------|----------|
| Error Rate | > 60% | 1 hour | Critical |
| Error Spike | +50% baseline | 15 min | High |
| New Error | First occurrence | Immediate | Medium |
| Repomix Failures | > 10/hour | 1 hour | High |
| Doc Enhancement Failures | > 5/hour | 1 hour | Medium |

## Programmatic Alert Configuration (Optional)

While Sentry's Web UI is the recommended approach, you can also use the Sentry API:

### Example: Create Alert via API

```bash
# Set your Sentry auth token
export SENTRY_AUTH_TOKEN="your-auth-token"

# Create alert rule via API
curl -X POST \
  https://sentry.io/api/0/projects/o4510332694495232/4510332704260096/rules/ \
  -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "High Error Rate Alert",
    "conditions": [
      {
        "id": "sentry.rules.conditions.event_frequency.EventFrequencyCondition",
        "value": 100,
        "interval": "1h"
      }
    ],
    "actions": [
      {
        "id": "sentry.rules.actions.notify_event.NotifyEventAction"
      }
    ],
    "actionMatch": "any"
  }'
```

## Testing Alerts

### Trigger Test Alerts

1. **Via Test Script**:
   ```bash
   node test/test-sentry-connection.js
   ```

2. **Via Code**:
   ```javascript
   const Sentry = require('@sentry/node');
   Sentry.captureException(new Error('Test alert'));
   ```

3. **Via Repomix Job**:
   ```bash
   # Force an error in a repomix job
   repomix /nonexistent/path
   ```

### Verify Alerts

1. Check Sentry dashboard for events
2. Check email/Slack for notifications
3. Review alert rule firing logs

## Monitoring Alert Effectiveness

### Weekly Review Checklist

- [ ] Review alert frequency (too many = alert fatigue)
- [ ] Check false positive rate
- [ ] Verify critical alerts are being acted upon
- [ ] Adjust thresholds based on patterns
- [ ] Review muted alerts and reactivate if needed

### Alert Metrics to Track

- **Alert Volume**: Number of alerts per day/week
- **Response Time**: Time from alert to resolution
- **False Positive Rate**: Percentage of alerts that don't require action
- **Coverage**: Percentage of real issues caught by alerts

## Current Project Context

### Error Patterns to Monitor

Based on recent log analysis:

1. **Repomix Errors** (55.8% error rate):
   - Dependency directory processing
   - Configuration issues
   - Missing exclusion patterns

2. **Documentation Enhancement Errors**:
   - Schema generation failures
   - README parsing issues

3. **Performance Issues**:
   - Slow repomix processing
   - Large file handling

### Recommended Alert Priority

1. ✅ **Critical**: Error rate > 60% (immediate action needed)
2. ✅ **High**: Repomix failures > 10/hour
3. ✅ **Medium**: New error patterns
4. ✅ **Low**: Performance degradation

## Next Steps

1. ✅ Log into Sentry: https://sentry.io/
2. ✅ Navigate to Alerts: https://sentry.io/organizations/o4510332694495232/alerts/
3. ✅ Create the 4 recommended alert rules above
4. ✅ Set up Slack integration
5. ✅ Test alerts with `node test/test-sentry-connection.js`
6. ✅ Monitor alert effectiveness over 1 week
7. ✅ Adjust thresholds based on patterns

## Resources

### Sentry Documentation
- [Alert Rules](https://docs.sentry.io/product/alerts/alert-types/)
- [Metric Alerts](https://docs.sentry.io/product/alerts/alert-types/#metric-alerts)
- [Issue Alerts](https://docs.sentry.io/product/alerts/alert-types/#issue-alerts)
- [Slack Integration](https://docs.sentry.io/product/integrations/notification-incidents/slack/)

### Quick Links
- **Sentry Dashboard**: https://sentry.io/organizations/o4510332694495232/projects/4510332704260096/
- **Alert Rules**: https://sentry.io/organizations/o4510332694495232/alerts/rules/
- **Metric Alerts**: https://sentry.io/organizations/o4510332694495232/alerts/metric-alerts/
- **Integrations**: https://sentry.io/settings/o4510332694495232/integrations/

## Troubleshooting

### Alerts Not Firing

1. Check alert rule is enabled
2. Verify conditions are being met
3. Check notification channel configuration
4. Review Sentry event stream

### Too Many Alerts

1. Increase thresholds
2. Add filters to reduce noise
3. Use "rate limit" to throttle alerts
4. Consider muting during known maintenance

### Missing Alerts

1. Lower thresholds temporarily
2. Review alert conditions
3. Check Sentry SDK integration
4. Verify events are reaching Sentry

## Summary

This guide provides a comprehensive approach to setting up error rate alerts in Sentry. The recommended configuration includes:

- ✅ 4 core alert rules (error rate, new errors, spikes, component-specific)
- ✅ Slack integration for team notifications
- ✅ Reasonable thresholds based on current error rates
- ✅ Testing procedures to verify alerts work
- ✅ Monitoring guidelines to maintain alert effectiveness

**Action Required**: Log into Sentry and create the 4 recommended alert rules using the Web UI.

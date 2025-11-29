# Doppler Health Monitoring Setup

**Created:** 2025-11-29
**Purpose:** External monitoring for Doppler cache health to detect outages before they become critical

---

## Overview

The AlephAuto dashboard includes a built-in Doppler health endpoint that monitors the age of cached secrets. When Doppler's API is unavailable, the system falls back to cached secrets. This runbook explains how to set up external monitoring to alert operators when the cache becomes stale.

## Health Endpoint

**URL:** `GET /api/health/doppler`

**Example Response (Healthy):**
```json
{
  "status": "healthy",
  "cacheAgeHours": 2,
  "cacheAgeMinutes": 30,
  "maxCacheAgeHours": 24,
  "warningThresholdHours": 12,
  "usingFallback": true,
  "severity": "healthy",
  "lastModified": "2025-11-29T00:00:00.000Z",
  "timestamp": "2025-11-29T02:30:00.000Z"
}
```

**Example Response (Warning - Cache >12 hours):**
```json
{
  "status": "degraded",
  "cacheAgeHours": 14,
  "cacheAgeMinutes": 20,
  "maxCacheAgeHours": 24,
  "warningThresholdHours": 12,
  "usingFallback": true,
  "severity": "warning",
  "lastModified": "2025-11-28T12:00:00.000Z",
  "timestamp": "2025-11-29T02:20:00.000Z"
}
```

**Example Response (Critical - Cache >24 hours):**
```json
{
  "status": "degraded",
  "cacheAgeHours": 26,
  "cacheAgeMinutes": 15,
  "maxCacheAgeHours": 24,
  "warningThresholdHours": 12,
  "usingFallback": true,
  "severity": "critical",
  "lastModified": "2025-11-27T00:00:00.000Z",
  "timestamp": "2025-11-29T02:15:00.000Z"
}
```

## Severity Levels

| Severity | Cache Age | Status | Action Required |
|----------|-----------|--------|-----------------|
| `healthy` | <12 hours | `healthy` | None |
| `warning` | 12-24 hours | `degraded` | Monitor closely, check Doppler status |
| `critical` | >24 hours | `degraded` | Immediate action required |

---

## UptimeRobot Setup

### Step 1: Create Account
1. Go to [UptimeRobot](https://uptimerobot.com)
2. Create free account (50 monitors included)

### Step 2: Add Monitor

**Monitor Type:** HTTP(s)

**Settings:**
- **Friendly Name:** `AlephAuto - Doppler Health`
- **URL:** `https://your-domain.com/api/health/doppler`
  - Or for local: `http://localhost:8080/api/health/doppler` (requires UptimeRobot Pro for internal URLs)
- **Monitoring Interval:** 5 minutes
- **Monitor Timeout:** 30 seconds

### Step 3: Configure Keyword Monitoring

**Type:** Keyword exists

**Keyword:** `"status":"healthy"`

This ensures alerts trigger when:
- The endpoint returns `"status":"degraded"` (cache stale)
- The endpoint is unreachable
- The endpoint returns an error

### Step 4: Set Up Alert Contacts

1. Go to **My Settings** → **Alert Contacts**
2. Add contact:
   - **Type:** Email (or Slack webhook, PagerDuty, etc.)
   - **Email:** ops-team@your-domain.com
3. Configure alert preferences:
   - **Down alert:** Immediately
   - **Up alert:** After 5 minutes of recovery

### Step 5: Advanced Configuration (Optional)

**HTTP Headers (if authentication required):**
```
Authorization: Bearer <your-api-key>
```

**Custom Status Codes:**
- Treat 200 as UP
- Treat 4xx, 5xx as DOWN

---

## Alternative: Pingdom Setup

### Quick Setup
1. Create HTTP check
2. URL: `https://your-domain.com/api/health/doppler`
3. Check interval: 5 minutes
4. Content check: Contains `"status":"healthy"`
5. Alert policy: Immediate for DOWN

---

## Alternative: AWS CloudWatch

For AWS deployments:

```yaml
# CloudWatch Synthetics Canary
Resources:
  DopplerHealthCanary:
    Type: AWS::Synthetics::Canary
    Properties:
      Name: doppler-health-check
      RuntimeVersion: syn-nodejs-puppeteer-6.0
      Schedule:
        Expression: rate(5 minutes)
      Code:
        Handler: index.handler
        Script: |
          const https = require('https');
          exports.handler = async () => {
            const response = await fetch('https://your-domain.com/api/health/doppler');
            const data = await response.json();
            if (data.status !== 'healthy') {
              throw new Error(`Doppler unhealthy: ${data.severity}`);
            }
            return 'OK';
          };
```

---

## Manual Verification

### Test Endpoint Locally
```bash
# Basic health check
curl http://localhost:8080/api/health/doppler | jq

# Check for healthy status
curl -s http://localhost:8080/api/health/doppler | jq -e '.status == "healthy"'
```

### Verify Cache Age
```bash
# Get cache age in hours
curl -s http://localhost:8080/api/health/doppler | jq '.cacheAgeHours'
```

### Force Cache Refresh
```bash
# Trigger Doppler cache warm
doppler run -- node scripts/warm-doppler-cache.js

# Or simply restart with Doppler
doppler run -- pm2 restart aleph-dashboard --update-env
```

---

## Troubleshooting

### Alert: "Keyword not found"

**Cause:** Endpoint returning `"status":"degraded"` instead of `"status":"healthy"`

**Steps:**
1. Check Doppler status: https://status.doppler.com
2. Check cache age: `curl http://localhost:8080/api/health/doppler | jq '.cacheAgeHours'`
3. If cache >24h, refresh: `doppler run -- pm2 restart aleph-dashboard --update-env`

### Alert: "Monitor DOWN"

**Cause:** Endpoint unreachable

**Steps:**
1. Check if dashboard is running: `pm2 status`
2. Check dashboard logs: `pm2 logs aleph-dashboard --lines 50`
3. Restart if needed: `doppler run -- pm2 restart aleph-dashboard`

### Sentry Integration

The DopplerHealthMonitor automatically sends to Sentry when:
- Cache age >12 hours (warning)
- Cache age >24 hours (error)

Check Sentry for alerts tagged with:
- `component: doppler-health-monitor`
- `severity: warning` or `severity: critical`

---

## Response Playbook

### Warning Alert (12-24h cache age)

1. **Check Doppler Status**
   - Visit: https://status.doppler.com
   - Look for outage reports

2. **Monitor Closely**
   - Check again in 1 hour
   - If still degraded, prepare for manual intervention

3. **If Outage Confirmed**
   - Document start time
   - Monitor application behavior
   - Prepare backup secrets if needed

### Critical Alert (>24h cache age)

1. **Immediate Actions**
   - Acknowledge alert
   - Check Doppler status
   - Verify application still functioning

2. **Refresh Cache**
   ```bash
   doppler run -- pm2 restart aleph-dashboard --update-env
   doppler run -- pm2 restart aleph-worker --update-env
   ```

3. **Escalation**
   - If refresh fails, check Doppler CLI: `doppler secrets`
   - If Doppler API down, consider hardcoded fallback (emergency only)

4. **Post-Incident**
   - Document timeline
   - Review monitoring thresholds
   - Consider shorter refresh intervals

---

## Related Documentation

- [DOPPLER_OUTAGE.md](./DOPPLER_OUTAGE.md) - Doppler outage response procedures
- [DOPPLER_CIRCUIT_BREAKER.md](./DOPPLER_CIRCUIT_BREAKER.md) - Circuit breaker implementation details
- [troubleshooting.md](./troubleshooting.md) - General troubleshooting guide

---

**Last Updated:** 2025-11-29

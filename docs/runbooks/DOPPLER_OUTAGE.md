# Doppler Outage Response Runbook

## Overview

This runbook provides procedures for responding to Doppler API outages and managing stale secret caches.

**Last Updated**: 2025-11-18
**Maintained By**: AlephAuto Operations Team

---

## 🚨 Alert Triggers

### Sentry Alerts
- **Warning**: Doppler cache > 12 hours old
- **Critical**: Doppler cache > 24 hours old

### Dashboard Indicators
- **Yellow**: Cache 12-24 hours (warning threshold)
- **Red**: Cache > 24 hours (critical threshold)
- **Green**: Live Doppler API or fresh cache (< 12 hours)

### Health Endpoint
```bash
curl http://localhost:8080/api/health/doppler
```

Expected response:
```json
{
  "status": "healthy" | "degraded",
  "cacheAgeHours": 0,
  "usingFallback": false,
  "severity": "healthy" | "warning" | "critical"
}
```

---

## 📋 Response Procedures

### Phase 1: Assess Situation (5 minutes)

1. **Check Doppler Status**:
   ```bash
   doppler --version
   doppler configure  # Verify project/config
   doppler secrets get --plain NODE_ENV  # Test API connectivity
   ```

2. **Check Dashboard**:
   - Navigate to http://localhost:8080
   - Look for Doppler health indicator color
   - Note cache age from indicator

3. **Check Logs**:
   ```bash
   # PM2 Dashboard logs
   pm2 logs aleph-dashboard --lines 50 | grep -i doppler

   # PM2 Worker logs
   pm2 logs aleph-worker --lines 50 | grep -i doppler
   ```

### Phase 2: Verify Impact (5 minutes)

**Questions to Answer**:
- Is the Doppler API responding?
- How old is the cache?
- Are services running normally?
- Have any secrets been rotated recently?

**Cache Age Impact Matrix**:
| Cache Age | Severity | Action Required |
|-----------|----------|-----------------|
| 0-12h | Low | Monitor only |
| 12-24h | Medium | Plan cache refresh |
| 24-48h | High | Refresh cache soon |
| > 48h | Critical | Immediate action |

### Phase 3: Take Action

#### Option A: Doppler API is Available (Normal Recovery)

**Recommended**: Wait for automatic refresh or trigger manual refresh.

```bash
# 1. Verify Doppler API is accessible
doppler secrets get --plain NODE_ENV

# 2. Check current configuration
doppler configure

# 3. Restart services to fetch fresh secrets
cd /Users/alyshialedlie/code/jobs
doppler run -- pm2 restart all

# 4. Verify cache was refreshed
curl http://localhost:8080/api/health/doppler | jq '.cacheAgeHours'
# Should show 0 or very low number
```

**Time Required**: 5 minutes
**Risk**: Low - Standard restart procedure

---

#### Option B: Doppler API is Down (Extended Outage)

**When to Use**: Doppler API returning HTTP 500 errors consistently

```bash
# 1. Verify fallback cache exists
ls -la ~/.doppler/.fallback.json
stat ~/.doppler/.fallback.json  # Check modification time

# 2. Check if critical secrets have been rotated
# (Check team communication, Slack, etc.)

# 3. If secrets NOT rotated: Continue running on cache
# Services will use cached secrets safely

# 4. Monitor Doppler status
# https://status.doppler.com (check uptime/incidents)

# 5. Set up monitoring alert
echo "*/15 * * * * curl -sf http://localhost:8080/api/health/doppler | jq '.severity' | grep -q 'critical' && echo 'Doppler cache critical!' | mail -s 'Doppler Alert' ops@example.com" | crontab -
```

**Time Required**: 10 minutes
**Risk**: Medium - Running on stale cache

---

#### Option C: Critical Secrets Rotated (Emergency)

**When to Use**: Cache > 24h AND secrets have been rotated in production

🚨 **WARNING**: Services may fail if critical secrets (DB passwords, API keys) have changed

```bash
# 1. STOP services immediately
pm2 stop all

# 2. Manually download fresh secrets (if API available)
doppler secrets download --no-file --format env > /tmp/doppler-secrets-emergency.env

# 3. Verify critical secrets
cat /tmp/doppler-secrets-emergency.env | grep -E "DB_PASSWORD|API_KEY|SENTRY_DSN"

# 4. Re-inject secrets and restart
doppler run -- pm2 start config/ecosystem.config.cjs

# 5. Verify services started successfully
pm2 status
pm2 logs --lines 20
```

**Time Required**: 15-20 minutes
**Risk**: High - Service downtime required

---

## 🛠️ Manual Cache Refresh

### Standard Refresh (Doppler API Available)

```bash
#!/bin/bash
# Refresh Doppler cache manually

cd /Users/alyshialedlie/code/jobs

# 1. Save current PM2 state
pm2 save

# 2. Test Doppler connectivity
if ! doppler secrets get --plain NODE_ENV > /dev/null 2>&1; then
  echo "ERROR: Doppler API not accessible"
  exit 1
fi

# 3. Restart with fresh secrets
doppler run -- pm2 restart all

# 4. Wait for services to stabilize
sleep 5

# 5. Verify health
curl http://localhost:8080/health
curl http://localhost:8080/api/health/doppler

echo "✅ Doppler cache refreshed successfully"
```

### Emergency Manual Secret Injection

```bash
# Only use if Doppler API is completely unavailable
# and you have secrets from another source (1Password, etc.)

# 1. Create temporary env file with current secrets
cat > /tmp/emergency-secrets.env << 'EOF'
NODE_ENV=production
JOBS_API_PORT=8080
# ... other critical secrets ...
EOF

# 2. Stop services
pm2 stop all

# 3. Load secrets and restart
set -a
source /tmp/emergency-secrets.env
set +a
pm2 start config/ecosystem.config.cjs

# 4. Cleanup
rm /tmp/emergency-secrets.env

# 5. Document this emergency procedure
echo "$(date): Emergency manual secret injection performed" >> ~/doppler-incidents.log
```

---

## 📊 Post-Incident Review

After resolving the outage:

1. **Document Timeline**:
   - When did cache go stale?
   - When was issue detected?
   - What actions were taken?
   - When was service restored?

2. **Update Runbook** (if needed):
   - Were any steps unclear?
   - Did we encounter unexpected issues?
   - Should we adjust thresholds?

3. **Review Sentry Alerts**:
   - Did alerts fire appropriately?
   - Were severity levels correct?
   - Should we adjust alert thresholds?

4. **Check for Root Cause**:
   - Was this a Doppler upstream issue?
   - Network connectivity problem?
   - Rate limiting?
   - Configuration issue?

---

## 🔗 Related Resources

- **Doppler Status Page**: https://status.doppler.com
- **Doppler Docs**: https://docs.doppler.com/docs/fallback-file
- **AlephAuto Health Dashboard**: http://localhost:8080
- **Sentry Dashboard**: (Add your Sentry URL)
- **PM2 Management**: `pm2 status`, `pm2 logs`, `pm2 restart`

---

## 📞 Escalation Contacts

| Role | Contact | When to Escalate |
|------|---------|-----------------|
| On-Call Engineer | (Slack/PagerDuty) | Cache > 24h, services failing |
| DevOps Lead | (Email/Slack) | Extended outages > 4 hours |
| Security Team | (Email) | If secrets may have been compromised |

---

## 🧪 Testing This Runbook

To test the monitoring and response procedures:

```bash
# 1. Simulate stale cache (for testing only!)
touch -t 202511161200 ~/.doppler/.fallback.json  # Set to 2 days ago

# 2. Verify dashboard indicator shows critical
curl http://localhost:8080/api/health/doppler

# 3. Check Sentry alert (should trigger)
# Look in Sentry dashboard for "Doppler cache critically stale"

# 4. Restore normal operation
doppler run -- pm2 restart all

# 5. Verify cache is fresh
curl http://localhost:8080/api/health/doppler
```

**Test Frequency**: Quarterly (every 3 months)

---

## 📝 Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2025-11-18 | AlephAuto Team | Initial runbook creation |

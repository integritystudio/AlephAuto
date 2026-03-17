# Runbooks

Production troubleshooting and incident response for AlephAuto. PM2 process name: `aleph-dashboard`. Logs: `logs/*.json` (Pino structured JSON).

**Last Updated:** 2026-03-14
**Version:** 2.3.20

---

## Doppler API Failures

**Symptoms:** Env vars not loading, "Missing required environment variable", Sentry alerts for stale cache.

### Diagnose

```bash
doppler run -- echo "Doppler is working"    # Test connectivity
doppler configure                            # Check project/config
curl http://localhost:8080/api/health/doppler # severity: healthy | warning (12-24h) | critical (24h+)
```

Health endpoint response:
```json
{
  "status": "healthy | degraded",
  "cacheAgeHours": 0,
  "severity": "healthy | warning | critical",
  "usingFallback": false
}
```

### Fix

| Scenario | Steps |
|----------|-------|
| Not configured | `doppler setup --project integrity-studio --config dev` |
| Stale cache | `rm ~/.doppler/.fallback.json && doppler run -- echo "refreshed"` then `pm2 restart aleph-dashboard` |
| API outage | App uses fallback cache automatically. Monitor via `/api/health/doppler`. Check https://status.doppler.com |
| Wrong config | `doppler setup --project integrity-studio --config prd` |

### Severity Levels

| Severity | Cache Age | Action |
|----------|-----------|--------|
| `healthy` | <12h | Monitor only |
| `warning` | 12-24h | Plan cache refresh, check Doppler status |
| `critical` | >24h | Immediate action required |

**Prevention:** Monitor `/api/health/doppler` in uptime checker. Schedule daily `doppler run -- echo "refresh"`. Separate dev/prd configs.

See also: [Error Handling](../architecture/ERROR_HANDLING.md#doppler-circuit-breaker) — circuit breaker states, config, and incident response

---

## Doppler Outage Response

### Phase 1: Assess (5 min)

```bash
doppler secrets get --plain NODE_ENV          # Test API
pm2 logs aleph-dashboard --lines 50 | grep -i doppler
```

### Phase 2: Take Action

**Option A — Doppler API available (normal recovery):**
```bash
doppler run -- pm2 restart all
curl http://localhost:8080/api/health/doppler | jq '.cacheAgeHours'  # Should be ~0
```

**Option B — Doppler API down (extended outage):**
```bash
ls -la ~/.doppler/.fallback.json              # Verify fallback cache exists
stat ~/.doppler/.fallback.json                # Check modification time
# Services continue on cached secrets. Monitor https://status.doppler.com
```

**Option C — Critical secrets rotated (emergency):**
```bash
pm2 stop all
doppler secrets download --no-file --format env > /tmp/doppler-secrets-emergency.env
doppler run -- pm2 start config/ecosystem.config.cjs
rm /tmp/doppler-secrets-emergency.env
```

---

## Doppler Health Monitoring Setup

### UptimeRobot

1. **Monitor Type:** HTTP(s)
2. **URL:** `https://your-domain.com/api/health/doppler`
3. **Interval:** 5 minutes
4. **Keyword monitoring:** `"status":"healthy"` (keyword exists)
5. **Alert contacts:** Email/Slack/PagerDuty, down alert immediately, up alert after 5 min recovery

### Manual Verification

```bash
curl http://localhost:8080/api/health/doppler | jq
curl -s http://localhost:8080/api/health/doppler | jq '.cacheAgeHours'
```

### Force Cache Refresh

```bash
doppler run -- bash scripts/deploy/warm-doppler-cache.sh
# Or: doppler run -- pm2 restart aleph-dashboard --update-env
```

---

## Pipeline Execution

Quick reference for running pipeline scripts with Doppler and PM2.

### Common Error

```
Error: fork/exec .../duplicate-detection-pipeline.ts: permission denied
```

**Cause:** Executing TypeScript entrypoint directly without `--strip-types`.

**Fix:** Always use `node --strip-types` or run via PM2 ecosystem config.

### Development

```bash
doppler run -- node --strip-types sidequest/pipeline-runners/duplicate-detection-pipeline.ts
# With startup flag:
doppler run -- RUN_ON_STARTUP=true node --strip-types sidequest/pipeline-runners/duplicate-detection-pipeline.ts
```

### Production (PM2)

```bash
doppler run -- pm2 start config/ecosystem.config.cjs
doppler run -- pm2 start config/ecosystem.config.cjs --only aleph-worker
pm2 logs aleph-worker --lines 50
```

### Requirements for Pipeline Files

1. **Shebang:** `#!/usr/bin/env -S node --strip-types`
2. **Non-executable file mode** (`644`): `node --strip-types scripts/setup/validate-permissions.ts --check-only`
3. **PM2 config** must use `interpreter: 'node'`

See also: [Pipeline Execution](../architecture/pipeline-execution.md)

---

## Port Binding Conflicts

**Symptoms:** `EADDRINUSE` on port 8080, app starts on unexpected port, PM2 crashed status.

```bash
lsof -i:8080
pm2 list | grep aleph-dashboard
```

| Scenario | Steps |
|----------|-------|
| Kill process | `lsof -ti:8080 \| xargs kill -9` then `pm2 restart aleph-dashboard` |
| Use different port | `doppler secrets set JOBS_API_PORT=8081` |
| Port fallback | Port manager auto-tries 8080-8090. Check: `grep -i "fallback port" logs/*.json` |
| Clean PM2 | `pm2 stop all && pm2 delete all && pm2 flush` then restart |

See also: [Port Conflict Resolution](../architecture/ERROR_HANDLING.md#port-conflict-resolution-strategy), [port-manager.ts](../../api/utils/port-manager.ts)

---

## Activity Feed Errors

**Symptoms:** Empty activity feed, TypeError on `getRecentActivities`, missing job events.

```bash
grep -i "activity feed" logs/*.json
curl http://localhost:8080/api/status | jq '.recentActivity'
```

| Scenario | Steps |
|----------|-------|
| Not initialized | Verify `api/server.ts` calls `new ActivityFeedManager(...)` and `activityFeed.listenToWorker(worker)` |
| Null errors | Check Sentry for `component:ActivityFeed`. Ensure optional chaining in error handlers. |
| General | `pm2 restart aleph-dashboard` then `pm2 logs aleph-dashboard \| grep ActivityFeed` |

See also: [activity-feed.ts](../../api/activity-feed.ts)

---

## WebSocket Connection Issues

**Symptoms:** "WebSocket disconnected", no real-time updates, polling fallback.

```bash
curl http://localhost:8080/ws/status
wscat -c ws://localhost:8080/ws
```

---

## Job Queue Issues

**Symptoms:** Jobs stuck in queued, not processing, retry loops.

```bash
curl http://localhost:8080/api/status | jq '.queue'
curl http://localhost:8080/api/status | jq '.retryMetrics'
```

See [Error Handling](../architecture/ERROR_HANDLING.md) for retry logic.

---

## Emergency Response

```bash
# 1. Health check
curl http://localhost:8080/health
curl http://localhost:8080/api/health/doppler

# 2. Recent errors
pm2 logs aleph-dashboard --lines 100 --err

# 3. Restart
pm2 restart aleph-dashboard

# 4. Escalate: document issue, check runbooks, contact on-call
```

---

## Quick Reference

```bash
# Service
pm2 restart|reload|stop|logs aleph-dashboard

# Doppler
doppler run -- echo "test"
doppler secrets get JOBS_API_PORT

# Ports
lsof -ti:8080
lsof -i:8080

# Logs (Pino JSON)
tail -f logs/*.json
grep -i "error\|doppler\|eaddrinuse\|activityfeed" logs/*.json

# Health
curl http://localhost:8080/health
curl http://localhost:8080/api/health/doppler
curl http://localhost:8080/api/status
curl http://localhost:8080/ws/status

# Database (columns are snake_case)
psql "$DATABASE_URL" -c "SELECT * FROM jobs ORDER BY created_at DESC LIMIT 10;"
```

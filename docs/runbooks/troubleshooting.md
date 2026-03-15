# Troubleshooting Guide

Production troubleshooting for AlephAuto. PM2 process name: `aleph-dashboard`. Logs: `logs/*.json` (Pino structured JSON).

## Doppler API Failures

**Symptoms:** Env vars not loading, "Missing required environment variable", Sentry alerts for stale cache.

**Diagnose:**

```bash
doppler run -- echo "Doppler is working"    # Test connectivity
doppler configure                            # Check project/config
curl http://localhost:8080/api/health/doppler # severity: healthy | warning (12-24h) | critical (24h+)
```

**Fix:**

| Scenario | Steps |
|----------|-------|
| Not configured | `doppler setup --project integrity-studio --config dev` |
| Stale cache | `rm ~/.doppler/.fallback.json && doppler run -- echo "refreshed"` then `pm2 restart aleph-dashboard` |
| API outage | App uses fallback cache automatically. Monitor via `/api/health/doppler`. Check https://status.doppler.com |
| Wrong config | `doppler setup --project integrity-studio --config prd` or `doppler run --config prd -- npm run dashboard` |

**Prevention:** Monitor `/api/health/doppler` in uptime checker. Schedule daily `doppler run -- echo "refresh"`. Separate dev/prd configs.

See also: [Doppler Circuit Breaker](../architecture/ERROR_HANDLING.md#doppler-circuit-breaker-pattern), [DOPPLER_OUTAGE.md](./DOPPLER_OUTAGE.md)

---

## Port Binding Conflicts

**Symptoms:** `EADDRINUSE` on port 8080, app starts on unexpected port, PM2 crashed status.

**Diagnose:**

```bash
lsof -i:8080                                # Find process using port
pm2 list | grep aleph-dashboard             # Check for duplicates
grep -i "eaddrinuse" logs/*.json            # Search logs
```

**Fix:**

| Scenario | Steps |
|----------|-------|
| Kill process | `lsof -ti:8080 \| xargs kill -9` then `pm2 restart aleph-dashboard` |
| Use different port | `doppler secrets set JOBS_API_PORT=8081` or `JOBS_API_PORT=8081 doppler run -- npm run dashboard` |
| Port fallback | Port manager auto-tries 8080-8090. Check: `grep -i "fallback port" logs/*.json` |
| Clean PM2 | `pm2 stop all && pm2 delete all && pm2 flush` then `doppler run -c prd -- pm2 start config/ecosystem.config.cjs && pm2 save` |

**Prevention:** Use `setupServerWithPortFallback` and `setupGracefulShutdown` from port-manager. Use `pm2 reload` for zero-downtime. Set `max_restarts` and `kill_timeout` in ecosystem.config.cjs.

See also: [Port Conflict Resolution](../architecture/ERROR_HANDLING.md#port-conflict-resolution-strategy), [port-manager.ts](../../api/utils/port-manager.ts)

---

## Activity Feed Errors

**Symptoms:** Empty activity feed, TypeError on `getRecentActivities`, missing job events, Sentry `component:ActivityFeed` errors.

**Diagnose:**

```bash
grep -i "activity feed" logs/*.json                    # Check initialization
curl http://localhost:8080/api/status | jq '.recentActivity'  # Test endpoint (falls back to SQLite after restart)
pm2 logs aleph-dashboard | grep "job:created\|job:completed"  # Verify events
```

**Fix:**

| Scenario | Steps |
|----------|-------|
| Not initialized | Verify `api/server.ts` calls `new ActivityFeedManager(broadcaster, ...)`, `activityFeed.listenToWorker(worker)`, `app.set('activityFeed', activityFeed)` |
| Null errors | Check Sentry for `component:ActivityFeed`. Ensure `api/activity-feed.ts` wraps error handlers in try-catch with optional chaining. |
| General | `pm2 restart aleph-dashboard` then monitor with `pm2 logs aleph-dashboard \| grep ActivityFeed` |

See also: [Null-Safe Error Handling](../architecture/ERROR_HANDLING.md#null-safe-error-handling-patterns), [activity-feed.ts](../../api/activity-feed.ts)

---

## WebSocket Connection Issues

**Symptoms:** "WebSocket disconnected", no real-time updates, polling fallback.

```bash
curl http://localhost:8080/ws/status
wscat -c ws://localhost:8080/ws
grep -A 10 "location /ws" /etc/nginx/sites-enabled/jobs  # If using reverse proxy
```

See [Dashboard Documentation](../dashboard_ui/DASHBOARD.md#websocket-connection-issues) for details.

---

## Job Queue Issues

**Symptoms:** Jobs stuck in queued, not processing, retry loops.

```bash
curl http://localhost:8080/api/status | jq '.queue'
curl http://localhost:8080/api/status | jq '.retryMetrics'
curl "http://localhost:8080/api/pipelines/duplicate-detection/jobs?status=running"
```

See [Error Handling Documentation](../architecture/ERROR_HANDLING.md) for retry logic.

---

## Performance Problems

**Symptoms:** Slow API, high CPU, memory leaks.

```bash
pm2 monit          # Real-time metrics
pm2 list           # Memory usage
```

Fix: restart services, set PM2 memory limit, review Sentry performance, increase PM2 instances.

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
sqlite3 data/jobs.db "SELECT * FROM jobs ORDER BY created_at DESC LIMIT 10;"
```

---

**Last Updated:** 2026-03-14
**Version:** 2.3.20

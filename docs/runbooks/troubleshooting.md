# Troubleshooting Guide

Comprehensive troubleshooting guide for common production issues in the AlephAuto job queue system.

## Table of Contents

- [Doppler API Failures](#doppler-api-failures)
- [Port Binding Conflicts](#port-binding-conflicts)
- [Activity Feed Errors](#activity-feed-errors)
- [WebSocket Connection Issues](#websocket-connection-issues)
- [Job Queue Issues](#job-queue-issues)
- [Performance Problems](#performance-problems)

---

## Doppler API Failures

### Symptoms

- Environment variables not loading
- API keys/tokens missing or outdated
- Application fails to start with "Missing required environment variable" errors
- Sentry alerts: "Doppler cache critically stale" or "Doppler cache aging"

### Root Causes

1. **Doppler CLI not configured**
   - Project not setup (`doppler setup` not run)
   - Wrong config selected (dev vs prd)

2. **Doppler API outage**
   - Service degradation
   - Network connectivity issues
   - Authentication failures

3. **Stale fallback cache**
   - Cache file older than 24 hours
   - Secrets rotated but cache not refreshed
   - Fallback mode running too long

### Diagnostic Steps

#### 1. Check Doppler Health

```bash
# Test Doppler connectivity
doppler run -- echo "Doppler is working"

# Check current project/config
doppler configure

# View cache file age
ls -la ~/.doppler/.fallback.json
stat ~/.doppler/.fallback.json
```

#### 2. Check Application Health Endpoint

```bash
# Check Doppler health via API
curl http://localhost:8080/api/health/doppler

# Expected response (healthy):
{
  "status": "healthy",
  "cacheAgeHours": 2,
  "cacheAgeMinutes": 30,
  "maxCacheAgeHours": 24,
  "warningThresholdHours": 12,
  "usingFallback": true,
  "severity": "healthy",
  "lastModified": "2025-11-24T08:30:00Z",
  "timestamp": "2025-11-24T11:00:00Z"
}

# Warning response (12-24 hours):
{
  "status": "healthy",
  "severity": "warning",
  "cacheAgeHours": 18,
  ...
}

# Critical response (24+ hours):
{
  "status": "degraded",
  "severity": "critical",
  "cacheAgeHours": 30,
  ...
}
```

#### 3. Check Sentry Alerts

```
# Search Sentry for Doppler alerts
level:error "Doppler cache critically stale"
level:warning "Doppler cache aging"
tags.component:doppler-health-monitor
```

#### 4. Verify Environment Variables

```bash
# Check if specific variables are loaded
doppler run -- printenv | grep JOBS_API_PORT
doppler run -- printenv | grep REDIS_HOST
doppler run -- printenv | grep SENTRY_DSN

# Test in application context
doppler run -- node -e "console.log(process.env.JOBS_API_PORT)"
```

### Resolution Steps

#### Scenario 1: Doppler Not Configured

```bash
# Setup Doppler project
cd /path/to/jobs
doppler setup --project bottleneck --config dev

# Verify setup
doppler configure

# Test run
doppler run -- npm run dashboard
```

#### Scenario 2: Stale Fallback Cache

```bash
# Force refresh cache
rm ~/.doppler/.fallback.json
doppler run -- echo "Cache refreshed"

# Verify cache is fresh
ls -la ~/.doppler/.fallback.json

# Restart application
pm2 restart jobs-dashboard
```

#### Scenario 3: Doppler API Outage

**If Doppler API is down:**

1. Application will use fallback cache automatically
2. Monitor cache age via `/api/health/doppler` endpoint
3. Doppler health monitor will alert when cache exceeds thresholds
4. Manual intervention required if cache exceeds 24 hours

**Check Doppler status:**
- https://status.doppler.com
- Check network connectivity to Doppler API
- Verify API token is valid

**Temporary workaround (emergency only):**

```bash
# Extract secrets from fallback cache (read-only)
cat ~/.doppler/.fallback.json | jq .

# If cache is too stale, manually set critical env vars
export JOBS_API_PORT=8080
export REDIS_HOST=localhost
export REDIS_PORT=6379
# ... other critical vars

# Start application (not recommended for production)
npm run dashboard
```

#### Scenario 4: Wrong Config Selected

```bash
# Check current config
doppler configure

# Switch to production config
doppler setup --project bottleneck --config prd

# Or use inline config override
doppler run --config prd -- npm run dashboard
```

### Prevention

1. **Monitor Doppler health proactively**
   - Enable `/api/health/doppler` monitoring in uptime checker
   - Set alerts for warning/critical thresholds
   - Review Sentry alerts regularly

2. **Refresh cache regularly**
   - Schedule daily `doppler run -- echo "refresh"` to update cache
   - Monitor cache age in application logs

3. **Document environment variables**
   - Keep list of critical variables in runbook
   - Document expected values and formats
   - Test variable loading in CI/CD

4. **Use multiple config environments**
   - Separate dev/staging/prd configs
   - Never share tokens between environments
   - Test config switching regularly

### Related Documentation

- [Doppler Circuit Breaker Pattern](../architecture/ERROR_HANDLING.md#doppler-circuit-breaker-pattern)
- [DOPPLER_OUTAGE.md runbook](./DOPPLER_OUTAGE.md)

---

## Port Binding Conflicts

### Symptoms

- Server fails to start with `EADDRINUSE` error
- Error message: "listen EADDRINUSE: address already in use :::8080"
- Application starts on unexpected port (8081, 8082, etc.)
- PM2 shows crashed status

### Root Causes

1. **Previous process still running**
   - Graceful shutdown failed
   - Zombie process holding port
   - PM2 duplicate process

2. **Port already in use by another service**
   - Another application bound to same port
   - Dev server still running
   - Multiple instances started accidentally

3. **Port forwarding/proxy conflicts**
   - nginx/Apache using same port
   - SSH tunnel on port
   - Docker container port mapping

### Diagnostic Steps

#### 1. Find Process Using Port

```bash
# macOS/Linux - find process on port 8080
lsof -ti:8080

# Show detailed process info
lsof -i:8080

# Example output:
# COMMAND   PID     USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
# node    12345  username   20u  IPv6 0x1234567890      0t0  TCP *:8080 (LISTEN)
```

#### 2. Check Server Logs

```bash
# Check application logs
tail -100 logs/api-server.log

# Look for port-related errors
grep -i "eaddrinuse\|port.*use\|bind.*failed" logs/api-server.log

# Check PM2 logs
pm2 logs jobs-dashboard --lines 100
```

#### 3. Check PM2 Status

```bash
# List all PM2 processes
pm2 list

# Check for duplicate processes
pm2 list | grep jobs-dashboard

# View detailed process info
pm2 describe jobs-dashboard
```

#### 4. Test Port Availability

```bash
# Using nc (netcat)
nc -zv localhost 8080

# Using telnet
telnet localhost 8080

# Using curl
curl http://localhost:8080/health
```

### Resolution Steps

#### Scenario 1: Kill Process on Port

```bash
# Find and kill process (automatic)
lsof -ti:8080 | xargs kill -9

# Or use port-manager utility
doppler run -- node -e "
  import { killProcessOnPort } from './api/utils/port-manager.js';
  await killProcessOnPort(8080);
"

# Verify port is free
lsof -ti:8080
# (should return nothing)

# Restart application
pm2 restart jobs-dashboard
```

#### Scenario 2: Use Different Port

```bash
# Update Doppler config
doppler secrets set JOBS_API_PORT=8081

# Or use environment variable override
JOBS_API_PORT=8081 doppler run -- npm run dashboard

# Update nginx config if applicable
sudo vim /etc/nginx/sites-enabled/jobs
# Update proxy_pass to new port
sudo nginx -t
sudo systemctl reload nginx
```

#### Scenario 3: Enable Port Fallback

The port manager automatically tries fallback ports (8080 → 8081 → 8082 → ...).

**Check if fallback was used:**

```bash
# Check logs for port fallback messages
grep -i "fallback port" logs/api-server.log

# Example output:
# [WARN] Port 8080 is already in use
# [INFO] Found available port 8081
# [WARN] Using fallback port 8081
# [INFO] Server listening on fallback port 8081
```

**If you want to force specific port:**

```javascript
// Disable automatic fallback in api/server.js
httpServer.listen(PORT, () => {
  logger.info({ port: PORT }, 'Server listening on preferred port');
});

// Instead of:
// await setupServerWithPortFallback(httpServer, { preferredPort: PORT });
```

#### Scenario 4: Clean PM2 State

```bash
# Stop all PM2 processes
pm2 stop all

# Delete PM2 processes
pm2 delete all

# Clear PM2 logs
pm2 flush

# Restart from fresh state
doppler run -- pm2 start config/ecosystem.config.cjs

# Save PM2 state
pm2 save
```

### Prevention

1. **Use port manager utility**
   - Import `setupServerWithPortFallback` in server.js
   - Enable automatic port fallback (ports +1 to +10)
   - Log port conflicts for visibility

2. **Implement graceful shutdown**
   - Use `setupGracefulShutdown` from port-manager
   - Handle SIGTERM/SIGINT signals
   - Close server before process exit

3. **Monitor port usage**
   - Document which ports are used by which services
   - Reserve port ranges for specific applications
   - Use high ports (>8000) to avoid conflicts with system services

4. **PM2 best practices**
   - Use `pm2 reload` instead of `restart` for zero-downtime
   - Set `max_restarts` in config/ecosystem.config.cjs
   - Enable `kill_timeout` for graceful shutdown

### Related Documentation

- [Port Conflict Resolution Strategy](../architecture/ERROR_HANDLING.md#port-conflict-resolution-strategy)
- [Port Manager Utility](../../api/utils/port-manager.js)

---

## Activity Feed Errors

### Symptoms

- Dashboard shows empty activity feed
- TypeError: "Cannot read property 'getRecentActivities' of undefined"
- Activity feed not updating in real-time
- Missing job events in activity stream
- Sentry alerts: "Failed to add activity to feed"

### Root Causes

1. **Activity Feed not initialized**
   - ActivityFeedManager not created
   - Worker events not connected
   - App context not set

2. **Null/undefined error objects**
   - Worker emits error without proper format
   - Missing error properties (code, message)
   - Error is null or undefined

3. **Event handler failures**
   - TypeError in event handler
   - Unhandled exception in addActivity
   - Missing null checks

### Diagnostic Steps

#### 1. Check Activity Feed Initialization

```bash
# Check server startup logs
grep -i "activity feed" logs/api-server.log

# Expected output:
# [INFO] Activity feed manager initialized
# [INFO] Activity feed connected to worker events
```

#### 2. Check for Null Reference Errors

```bash
# Search logs for activity feed errors
grep -i "activityfeed\|getrecentactivities" logs/api-server.log

# Check Sentry for activity feed errors
# tags.component:ActivityFeed
# event:job:failed:activity-error
```

#### 3. Test Activity Feed Endpoint

```bash
# Get recent activities via API
curl http://localhost:8080/api/status | jq '.recentActivity'

# Expected response:
{
  "recentActivity": [
    {
      "id": "act_123",
      "type": "job:created",
      "event": "Job Created",
      "message": "Job scan-abc123 created",
      "timestamp": "2025-11-24T10:00:00Z",
      "icon": "📝"
    },
    ...
  ]
}

# If empty or null:
{
  "recentActivity": null  // or []
}
```

#### 4. Verify Worker Event Emissions

```bash
# Enable debug logging
export LOG_LEVEL=debug
doppler run -- npm run dashboard

# Watch for event emissions
tail -f logs/api-server.log | grep "job:created\|job:completed\|job:failed"
```

### Resolution Steps

#### Scenario 1: Activity Feed Not Initialized

**Check api/server.js:**

```javascript
// Ensure ActivityFeedManager is created
import { ActivityFeedManager } from './activity-feed.js';

const activityFeed = new ActivityFeedManager(broadcaster, {
  maxActivities: 50
});

// Connect to worker events
activityFeed.listenToWorker(worker);

// Make available to routes
app.set('activityFeed', activityFeed);

// Export for access in other modules
export { activityFeed };
```

**Verify in logs:**

```bash
grep "Activity feed manager initialized" logs/api-server.log
```

#### Scenario 2: Null Error Objects

**Apply null-safe error handling:**

```javascript
// In api/activity-feed.js
worker.on('job:failed', (job, error) => {
  try {
    // Safe error extraction
    const errorMessage = safeErrorMessage(error);

    const errorObj = error instanceof Error
      ? { message: error.message, type: error.constructor.name }
      : { message: errorMessage, type: 'GenericError' };

    this.addActivity({
      type: 'job:failed',
      message: `Job ${job.id} failed: ${errorObj.message}`,
      error: {
        message: errorObj.message,
        code: error?.code,           // Optional chaining
        retryable: error?.retryable ?? false  // Nullish coalescing
      }
    });

    // Safe Sentry capture
    Sentry.captureException(error || new Error(errorObj.message), {
      tags: { component: 'ActivityFeed' },
      extra: {
        errorCode: error?.code ?? 'UNKNOWN',
        errorMessage: errorObj.message
      }
    });
  } catch (activityError) {
    // Nested error handling
    logger.error({ error: activityError, job }, 'Failed to add job:failed activity');
    Sentry.captureException(activityError, {
      tags: { component: 'ActivityFeed', event: 'job:failed:activity-error' },
      extra: { jobId: job.id, originalError: safeErrorMessage(error) }
    });
  }
});
```

**Add safeErrorMessage helper:**

```javascript
function safeErrorMessage(error) {
  if (!error) return 'Unknown error (null or undefined)';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object') {
    return error.message || error.error || JSON.stringify(error);
  }
  return String(error);
}
```

#### Scenario 3: Route Handler Null Check

**Add null check in /api/status endpoint:**

```javascript
app.get('/api/status', (req, res) => {
  try {
    const scanMetrics = worker.getScanMetrics();
    const queueStats = worker.getStats();

    // Null-safe activity feed access
    const activityFeed = req.app.get('activityFeed');
    const recentActivity = activityFeed
      ? activityFeed.getRecentActivities(20)
      : [];  // Return empty array if not initialized

    res.json({
      timestamp: new Date().toISOString(),
      pipelines: [...],
      queue: { ... },
      retryMetrics: scanMetrics.retryMetrics || null,
      recentActivity: recentActivity  // Safe array
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get system status');
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve system status'
    });
  }
});
```

#### Scenario 4: Restart Services

```bash
# Restart API server
pm2 restart jobs-dashboard

# Clear activity feed (if needed)
curl -X DELETE http://localhost:8080/api/activity/clear

# Monitor logs for activity feed events
tail -f logs/api-server.log | grep ActivityFeed
```

### Prevention

1. **Implement null-safe error handling**
   - Use optional chaining: `error?.code`
   - Use nullish coalescing: `error?.message ?? 'Unknown'`
   - Add safeErrorMessage() helper
   - Wrap all error handlers in try-catch

2. **Initialize activity feed early**
   - Create ActivityFeedManager before starting server
   - Connect to worker events immediately
   - Export for access in other modules

3. **Add comprehensive logging**
   - Log activity feed initialization
   - Log event emissions (debug level)
   - Log errors with full context

4. **Monitor Sentry for activity feed errors**
   - Set up alerts for `component:ActivityFeed` errors
   - Track `event:job:failed:activity-error` separately
   - Review failed event handlers weekly

### Related Documentation

- [Null-Safe Error Handling Patterns](../architecture/ERROR_HANDLING.md#null-safe-error-handling-patterns)
- [Activity Feed Manager](../../api/activity-feed.js)

---

## WebSocket Connection Issues

### Symptoms

- Dashboard shows "WebSocket disconnected" message
- Real-time updates not working
- Console errors: "WebSocket connection failed"
- Polling fallback activated

### Diagnostic Steps

```bash
# Check WebSocket status
curl http://localhost:8080/ws/status

# Test WebSocket connection
wscat -c ws://localhost:8080/ws

# Check nginx WebSocket config (if using reverse proxy)
grep -A 10 "location /ws" /etc/nginx/sites-enabled/jobs
```

### Resolution Steps

See [Dashboard Documentation](../dashboard_ui/DASHBOARD.md#websocket-connection-issues) for detailed troubleshooting.

---

## Job Queue Issues

### Symptoms

- Jobs stuck in queued state
- Jobs not processing
- High queue capacity
- Retry loops

### Diagnostic Steps

```bash
# Check queue stats
curl http://localhost:8080/api/status | jq '.queue'

# Check retry metrics
curl http://localhost:8080/api/status | jq '.retryMetrics'

# View active jobs
curl http://localhost:8080/api/pipelines/duplicate-detection/jobs?status=running
```

### Resolution Steps

See [Error Handling Documentation](../architecture/ERROR_HANDLING.md) for retry logic troubleshooting.

---

## Performance Problems

### Symptoms

- Slow API responses
- High CPU usage
- Memory leaks
- Database timeouts

### Diagnostic Steps

```bash
# Check PM2 metrics
pm2 monit

# Check memory usage
pm2 list

# Check database connection pool
# (Add specific monitoring based on your database)

# Check Sentry performance metrics
# https://sentry.io/organizations/your-org/projects/jobs/performance/
```

### Resolution Steps

1. **Restart services**
2. **Check for memory leaks** (use PM2 memory limit)
3. **Review slow queries** in database logs
4. **Scale horizontally** (increase PM2 instances)
5. **Optimize hot paths** identified in Sentry

---

## Emergency Response

### Critical Production Issues

1. **Check health endpoints**
   ```bash
   curl http://localhost:8080/health
   curl http://localhost:8080/api/health/doppler
   ```

2. **Review recent logs**
   ```bash
   pm2 logs jobs-dashboard --lines 100 --err
   ```

3. **Check Sentry for errors**
   - https://sentry.io/organizations/your-org/projects/jobs/issues/

4. **Restart services if needed**
   ```bash
   pm2 restart jobs-dashboard
   ```

5. **Escalate if unresolved**
   - Document issue (logs, error messages, reproduction steps)
   - Check runbooks for similar issues
   - Contact on-call engineer

### Useful Commands Cheatsheet

```bash
# Service control
pm2 restart jobs-dashboard
pm2 reload jobs-dashboard
pm2 stop jobs-dashboard
pm2 logs jobs-dashboard

# Doppler
doppler run -- echo "test"
doppler secrets get JOBS_API_PORT

# Port management
lsof -ti:8080
lsof -i:8080
netstat -an | grep 8080

# Logs
tail -f logs/api-server.log
grep -i "error" logs/api-server.log
grep -i "doppler\|eaddrinuse\|activityfeed" logs/api-server.log

# Health checks
curl http://localhost:8080/health
curl http://localhost:8080/api/health/doppler
curl http://localhost:8080/api/status
curl http://localhost:8080/ws/status

# Database
sqlite3 data/jobs.db "SELECT * FROM jobs ORDER BY createdAt DESC LIMIT 10;"
```

---

**Last Updated:** 2025-11-24
**Version:** 1.6.4

# Error Handling & Resilience

> **Hub document.** Authoritative source for error classification, retry logic, circuit breakers, and worker registry patterns. Referenced by [System Data Flow](./SYSTEM-DATA-FLOW.md) and [Adding Pipelines](./setup/ADDING_PIPELINES.md).

**Last Updated:** 2026-03-15

## Overview

Three independent circuit breakers protect the system at different layers:

| Circuit Breaker | Location | Trigger | Effect |
|----------------|----------|---------|--------|
| **Retry CB** | `server.ts` | 5 total attempts for any single job | Stops retries, fails job |
| **Doppler CB** | `doppler-resilience.ts` | 3 consecutive API failures | Falls back to cached secrets |
| **Worker Init CB** | `worker-registry.ts` | 3 consecutive init failures per pipeline | Rejects `getWorker()` immediately |

**Key files:** `error-classifier.ts`, `server.ts`, `doppler-resilience.ts`, `worker-registry.ts`

---

## Error Classification

**File:** `sidequest/pipeline-core/errors/error-classifier.ts`

The classifier checks in order: error codes, HTTP status codes, then message patterns.

### Non-Retryable Errors (permanent failures)

| Code | Reason |
|------|--------|
| `ENOENT` | File not found -- won't appear on retry |
| `ENOTDIR`, `EISDIR` | Wrong path type |
| `EACCES`, `EPERM` | Permission denied -- needs manual fix |
| `EINVAL` | Invalid argument -- same input will fail again |
| `EEXIST` | File already exists |
| `ENOTFOUND`, `ECONNREFUSED` | DNS/connection failure -- immediate retry unlikely to help |
| `ERR_MODULE_NOT_FOUND` | Missing module |
| HTTP 400-404 | Client errors (bad input, not found, auth) |

### Retryable Errors (transient failures)

| Code | Suggested Delay |
|------|----------------|
| `ETIMEDOUT` | 5s |
| `ECONNRESET` | 3s |
| `EHOSTUNREACH`, `ENETUNREACH` | 5s |
| `EPIPE`, `EAGAIN` | 5s |
| `EBUSY` | 2s |
| HTTP 429 | 60s (rate limit) |
| HTTP 5xx | 10s |

### Usage

```javascript
import { isRetryable, getErrorInfo } from '../sidequest/pipeline-core/errors/error-classifier.ts';

const errorInfo = getErrorInfo(error);
// { category, retryable, reason, suggestedDelay, code, statusCode }

if (errorInfo.retryable) {
  setTimeout(() => retry(), errorInfo.suggestedDelay ?? 5000);
}
```

---

## Retry Logic & Backoff

**Location:** `sidequest/core/server.ts` (retry orchestration owned by SidequestServer)

### Configuration

- Default max retries: **2** (configurable per job)
- Circuit breaker: **5** (absolute max, cannot be overridden)
- Base delay: **5s** (uses `errorInfo.suggestedDelay` when available)

### Flow

1. Error occurs -- classify via `getErrorInfo(error)`
2. Non-retryable? Fail immediately
3. Strip retry suffixes to get original job ID: `jobId.replace(/-retry\d+/g, '')`
4. Check circuit breaker (5 attempts) -- fail if exceeded
5. Check configured max retries -- fail if exceeded
6. Calculate delay: `suggestedDelay * 2^(attempt-1)` (exponential backoff)
7. Schedule retry with ID `${originalJobId}-retry${attempt}`

### Backoff Schedule (5s base)

```
Attempt 1:  5s    Attempt 2: 10s    Attempt 3: 20s
Attempt 4: 40s    Attempt 5: 80s (circuit breaker)
```

Rate limit (60s base): 60s, 120s, 240s

---

## Circuit Breakers

### Retry Circuit Breaker

**Location:** `sidequest/core/server.ts`

Prevents runaway retries. Without it, `maxRetries: 100` with ENOENT wastes 85 minutes. With it, stops at 5 attempts (2.6 minutes).

Hierarchy: Circuit Breaker (5) > Configured Max (2) > Per-Job Override

### Doppler Circuit Breaker

**Location:** `sidequest/utils/doppler-resilience.ts`

Protects against cascading failures when the Doppler API returns HTTP 500. Falls back to cached secrets with exponential backoff.

**States:**

```
CLOSED (normal) → OPEN (fallback) → HALF_OPEN (testing) → CLOSED
```

- **CLOSED**: Normal operation, Doppler API accessible
- **OPEN**: API failures detected, using cached secrets exclusively
- **HALF_OPEN**: Testing if API has recovered after timeout

**Backoff:**

```
Failure 1: 1s    Failure 2: 2s    Failure 3: 4s
Failure 4: 8s    Failure 5: 10s (capped at max)
```

**Configuration** (all optional, defaults provided):

| Variable | Default | Range |
|----------|---------|-------|
| `DOPPLER_FAILURE_THRESHOLD` | 3 | 1-10 |
| `DOPPLER_SUCCESS_THRESHOLD` | 2 | 1-10 |
| `DOPPLER_TIMEOUT` | 5000ms | >= 1000ms |
| `DOPPLER_BASE_DELAY_MS` | 1000 | >= 100ms |
| `DOPPLER_MAX_BACKOFF_MS` | 10000 | >= 1000ms |

**Usage:**

```javascript
import { DopplerResilience } from './sidequest/utils/doppler-resilience.ts';

class AppDopplerResilience extends DopplerResilience {
  async fetchFromDoppler() { return process.env; }
}

const doppler = new AppDopplerResilience(config.doppler);
const secrets = await doppler.getSecrets();
```

### Worker Init Circuit Breaker

**Location:** `api/utils/worker-registry.ts`

After 3 consecutive init failures for a pipeline, `getWorker()` rejects immediately. Prevents repeated expensive initialization attempts.

Additional safety: `MAX_WORKER_INITS = 3` concurrent initializations max. Race condition fix (v1.8.1): atomic check-and-set after init prevents duplicate worker instances.

---

## Worker Registry

**Location:** `api/utils/worker-registry.ts` (centralized singleton)

Manages worker instances for all 11 pipelines. Provides lazy initialization, instance caching, and graceful shutdown.

### Initialization Flow

1. `getWorker(pipelineId)` called
2. Check `_workers` cache -- return if exists
3. Check `_initializing` -- await if in progress (prevents duplicates)
4. Check circuit breaker -- reject if 3+ consecutive init failures
5. Look up `PIPELINE_CONFIGS.get(pipelineId)` and call `createWorker()`
6. Atomic check-and-set: if another concurrent call stored a worker, shut down duplicate
7. Cache and return

### Supported Pipelines

| Pipeline ID | Worker Class | Git Workflow |
|------------|--------------|--------------|
| `duplicate-detection` | DuplicateDetectionWorker | BranchManager |
| `schema-enhancement` | SchemaEnhancementWorker | BranchManager |
| `git-activity` | GitActivityWorker | N/A |
| `gitignore-manager` | GitignoreWorker | N/A |
| `repo-cleanup` | RepoCleanupWorker | N/A |
| `claude-health` | ClaudeHealthWorker | N/A |
| `bugfix-audit` | BugfixAuditWorker | N/A |
| `dashboard-populate` | DashboardPopulateWorker | N/A |
| `plugin-manager` | PluginManagerWorker | N/A |
| `repomix` | RepomixWorker | N/A |
| `test-refactor` | TestRefactorWorker | N/A |

### Event System

Workers emit events consumed by `ActivityFeedManager` for real-time dashboard:

| Event | Dashboard Action |
|-------|------------------|
| `job:created` | Add to job list |
| `job:started` | Update status |
| `job:progress` | Update progress bar |
| `job:completed` | Mark complete |
| `job:failed` | Show error |

Shutdown is wired into `setupGracefulShutdown()` in `api/server.ts`.

---

## Doppler Resilience

### Cache Health Monitoring

**Location:** `sidequest/pipeline-core/doppler-health-monitor.ts`

Monitors Doppler fallback cache age. Checks every 15 minutes.

| Severity | Cache Age | Alert |
|----------|-----------|-------|
| Healthy | 0-12h | None |
| Warning | 12-24h | Sentry warning |
| Critical | 24h+ | Sentry error -- **action required** |

### Health Endpoint

`GET /api/health/doppler` returns:

```json
{
  "status": "healthy",
  "circuitState": "CLOSED",
  "metrics": {
    "successRate": "100.00%",
    "totalRequests": 42,
    "failureCount": 0
  }
}
```

Degraded response (503) includes `recovery.waitTimeMs` and `recovery.nextAttemptTime`.

---

## Sentry Integration

### Retry Logic Alerts

| Level | Trigger | Action |
|-------|---------|--------|
| **error** | Circuit breaker (5+ attempts) | Investigate immediately -- systemic issue |
| **warning** | Max retries reached | Review error classification |
| **warning** | 3+ attempts (approaching limit) | Monitor for patterns |

All alerts include: `tags.component: 'retry-logic'`, `tags.jobId`, `extra.attempts`, `extra.errorClassification`

### Doppler Circuit Breaker Alerts

| Alert | Severity | Trigger |
|-------|----------|---------|
| Circuit Opened | error | `failureCount >= failureThreshold` |
| Circuit Recovered | info | Transition to CLOSED |
| Circuit Reopened | warning | Failure in HALF_OPEN state |

Tags: `component: doppler-resilience`, `circuitState: <state>`

### Sentry Queries

```
level:error "Circuit breaker triggered"
level:warning "Approaching retry limit"
tags.errorType:ETIMEDOUT
tags.jobId:scan-abc123
```

---

## Health Endpoints

| Endpoint | Source | Returns |
|----------|--------|---------|
| `GET /health` | Basic health | `{ status }` |
| `GET /api/health/doppler` | `doppler-resilience.ts` | `{ status, circuitState, metrics }` |

### Database Health

**Location:** `sidequest/core/database.ts`

`getHealthStatus()` returns `{ initialized, persistenceWorking, status, message }`. Persistence failures surface via `_trySilentPersist` in `server.ts` -- logged to Pino, captured to Sentry, non-blocking.

> **Note:** `degradedMode` and `persistFailureCount` removed in commit `624f617` (SC-L4).

### Port Manager

**Location:** `api/utils/port-manager.ts`

- `isPortAvailable(port)` -- TCP probe
- `setupServerWithPortFallback(server, { preferredPort, maxPort })` -- tries range
- `killProcessOnPort(port)` -- `lsof` + SIGKILL (use with caution)
- `setupGracefulShutdown(server, { onShutdown, timeout })` -- handles SIGTERM/SIGINT/SIGHUP

---

## API Error Responses

**Location:** `api/utils/api-error.ts`

Standard format for all endpoints:

```javascript
{ "success": false, "error": { "code": "...", "message": "...", "details": {} }, "timestamp": "..." }
```

| Code | HTTP | Description |
|------|------|-------------|
| `INVALID_REQUEST` | 400 | Validation failed |
| `NOT_FOUND` | 404 | Resource not found |
| `UNAUTHORIZED` | 401 | Auth required |
| `INTERNAL_ERROR` | 500 | Server error |
| `WORKER_NOT_FOUND` | 404 | Pipeline worker unavailable |
| `CANCEL_FAILED` | 400 | Cancellation failed |

```javascript
import { sendError, sendNotFoundError, ApiError } from '../utils/api-error.ts';
sendError(res, 'INVALID_REQUEST', 'Missing required field', 400);
```

---

## Operational Procedures

### Monitoring

**Dashboard Indicator:**
- **Green**: Circuit CLOSED, API healthy
- **Yellow**: Circuit HALF_OPEN, testing recovery
- **Red**: Circuit OPEN, using fallback cache

**Check health:** `curl http://localhost:8080/api/health/doppler | jq`

### Incident Response

**Circuit Opens (Doppler API Down):**

1. Verify: `curl http://localhost:8080/api/health/doppler`
2. Check Doppler: https://status.doppler.com
3. Verify cache: `ls -la ~/.doppler/.fallback.json`
4. Decision: Cache < 24h → continue on cache. Cache > 24h + secrets rotated → emergency procedure
5. Monitor: circuit auto-recovers after timeout (default 5s)

**High Failure Rate:**

1. Check: `curl http://localhost:8080/api/health/doppler | jq '.metrics'`
2. Symptoms: `successRate < 80%`, circuit flapping
3. Actions: check network, review rate limits, consider increasing `DOPPLER_FAILURE_THRESHOLD`

**Manual Recovery:**

```bash
curl -X POST http://localhost:8080/api/health/doppler/reset
# Or restart:
pm2 restart aleph-dashboard && pm2 restart aleph-worker
```

---

## Troubleshooting

### Circuit Won't Close

```bash
doppler secrets get --plain NODE_ENV   # Check API accessibility
curl http://localhost:8080/api/health/doppler
```

Solutions: verify Doppler API, check network, review CLI config (`doppler configure`), manual reset.

### Cache Not Loading

Error: "Doppler API unavailable and no fallback cache"

```bash
ls -la ~/.doppler/.fallback.json
```

Solutions: ensure `doppler run` has been executed once, check `DOPPLER_CACHE_FILE`, verify permissions (`chmod 600`).

### High Backoff Delays

`currentBackoffMs` approaching `maxBackoffMs`. Reduce `DOPPLER_BASE_DELAY_MS` or increase `DOPPLER_FAILURE_THRESHOLD`.

---

## Testing

### Error Classification

```bash
npm test tests/unit/error-classifier.test.ts
```

### Doppler Resilience

```bash
npm test tests/unit/doppler-resilience.test.ts
```

21 tests covering: state transitions, exponential backoff, fallback, health status, manual reset, edge cases.

### Worker Registry

```bash
# Manual trigger test
curl -X POST http://localhost:8080/api/pipelines/schema-enhancement/trigger \
  -H "Content-Type: application/json" \
  -d '{"parameters": {"dryRun": true}}'
```

---

## Best Practices

1. Always classify errors before retrying -- use `getErrorInfo(error)`
2. Use `errorInfo.suggestedDelay` (not fixed delays)
3. Log classification: `{ code, category, retryable, reason }`
4. Use optional chaining: `error?.code ?? 'UNKNOWN'`
5. Wrap error handlers in try-catch
6. Include context: `new Error(\`Failed to scan: ${repoPath}\`)`
7. Clean up resources in `finally` blocks

---

## References

| Component | File |
|-----------|------|
| Error classifier | `sidequest/pipeline-core/errors/error-classifier.ts` |
| Retry logic | `sidequest/core/server.ts` |
| Doppler resilience | `sidequest/utils/doppler-resilience.ts` |
| Doppler health monitor | `sidequest/pipeline-core/doppler-health-monitor.ts` |
| Worker registry | `api/utils/worker-registry.ts` |
| Port manager | `api/utils/port-manager.ts` |
| API errors | `api/utils/api-error.ts` |
| Config | `sidequest/core/config.ts` |

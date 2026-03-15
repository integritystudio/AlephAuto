# Error Handling Documentation

**Last Updated:** 2026-03-14

## Overview

Three components: **error classification** (retryable vs non-retryable), **retry logic** (exponential backoff + circuit breaker), and **Sentry integration** (3-level alerting).

**Key file:** `sidequest/pipeline-core/errors/error-classifier.ts`

---

## Error Classification

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

## Retry Logic

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

### Circuit Breaker

Prevents runaway retries. Without it, `maxRetries: 100` with ENOENT wastes 85 minutes. With it, stops at 5 attempts (2.6 minutes).

Hierarchy: Circuit Breaker (5) > Configured Max (2) > Per-Job Override

---

## Sentry Integration

Three alert levels from retry logic:

| Level | Trigger | Action |
|-------|---------|--------|
| **error** | Circuit breaker (5+ attempts) | Investigate immediately -- systemic issue |
| **warning** | Max retries reached | Review error classification |
| **warning** | 3+ attempts (approaching limit) | Monitor for patterns |

All alerts include: `tags.component: 'retry-logic'`, `tags.jobId`, `extra.attempts`, `extra.errorClassification`

### Sentry Queries

```
level:error "Circuit breaker triggered"
level:warning "Approaching retry limit"
tags.errorType:ETIMEDOUT
tags.jobId:scan-abc123
```

---

## Doppler Cache Health

**Location:** `sidequest/pipeline-core/doppler-health-monitor.ts`

Monitors Doppler fallback cache age to prevent stale-secret failures. Checks every 15 minutes.

| Severity | Cache Age | Alert |
|----------|-----------|-------|
| Healthy | 0-12h | None |
| Warning | 12-24h | Sentry warning |
| Critical | 24h+ | Sentry error -- **action required** |

Endpoint: `GET /api/health/doppler` returns `{ status, cacheAgeHours, severity }`

---

## Database Health

**Location:** `sidequest/core/database.ts`

> **Note:** `degradedMode` and `persistFailureCount` removed in commit `624f617` (SC-L4).

`getHealthStatus()` returns `{ initialized, persistenceWorking, status, message }`. Persistence failures surface via `_trySilentPersist` in `server.ts` -- logged to Pino, captured to Sentry, non-blocking.

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

## Port Conflict Resolution

**Location:** `api/utils/port-manager.ts`

- `isPortAvailable(port)` -- TCP probe
- `setupServerWithPortFallback(server, { preferredPort, maxPort })` -- tries range
- `killProcessOnPort(port)` -- `lsof` + SIGKILL (use with caution)
- `setupGracefulShutdown(server, { onShutdown, timeout })` -- handles SIGTERM/SIGINT/SIGHUP

---

## Best Practices

1. Always classify errors before retrying -- use `getErrorInfo(error)`
2. Use `errorInfo.suggestedDelay` (not fixed delays)
3. Log classification: `{ code, category, retryable, reason }`
4. Use optional chaining for error properties: `error?.code ?? 'UNKNOWN'`
5. Wrap error handlers in try-catch to prevent handler failures
6. Include context: `new Error(\`Failed to scan: ${repoPath}\`)`
7. Clean up resources in `finally` blocks

---

## References

- Error classifier: `sidequest/pipeline-core/errors/error-classifier.ts`
- Retry logic: `sidequest/core/server.ts`
- Doppler monitor: `sidequest/pipeline-core/doppler-health-monitor.ts`
- Port manager: `api/utils/port-manager.ts`
- API errors: `api/utils/api-error.ts`
- Activity feed: `api/activity-feed.ts`

# Doppler Circuit Breaker Implementation

## Overview

The Doppler Circuit Breaker pattern protects the application from cascading failures when the Doppler API experiences HTTP 500 errors. It automatically falls back to cached secrets and implements exponential backoff to prevent overwhelming the API during recovery.

**Status**: ✅ Implemented
**Version**: 1.0.0
**Last Updated**: 2025-11-24

---

## Architecture

### Circuit Breaker States

```
┌──────────┐
│  CLOSED  │ ◄──────────────────────────┐
│ (Normal) │                            │
└────┬─────┘                            │
     │                                  │
     │ Failures ≥ threshold             │ Successes ≥ threshold
     │                                  │
     ▼                                  │
┌──────────┐    Timeout elapsed    ┌────┴──────┐
│   OPEN   │ ──────────────────► │ HALF_OPEN │
│(Fallback)│                      │ (Testing) │
└────▲─────┘                      └───────────┘
     │                                  │
     │                                  │
     └──────────────────────────────────┘
           Failure in HALF_OPEN
```

**States:**
- **CLOSED**: Normal operation, Doppler API is accessible
- **OPEN**: API failures detected, using cached secrets exclusively
- **HALF_OPEN**: Testing if API has recovered after timeout

### Exponential Backoff

```
Failure 1: 1s   (base delay)
Failure 2: 2s   (base × 2¹)
Failure 3: 4s   (base × 2²)
Failure 4: 8s   (base × 2³)
Failure 5: 10s  (capped at max)
```

---

## Configuration

### Environment Variables

Add to Doppler configuration (optional - defaults provided):

```bash
# Circuit breaker thresholds
DOPPLER_FAILURE_THRESHOLD=3      # Open circuit after N failures
DOPPLER_SUCCESS_THRESHOLD=2      # Close circuit after N successes
DOPPLER_TIMEOUT=5000             # Time (ms) before attempting recovery

# Exponential backoff
DOPPLER_BASE_DELAY_MS=1000       # Initial backoff delay (1s)
DOPPLER_BACKOFF_MULTIPLIER=2.0   # Backoff growth factor
DOPPLER_MAX_BACKOFF_MS=10000     # Maximum backoff delay (10s)

# Cache location
DOPPLER_CACHE_FILE=~/.doppler/.fallback.json
```

### Configuration Validation

The system validates configuration on startup:

```javascript
import { config } from './sidequest/core/config.js';

// Access Doppler circuit breaker configuration
const {
  failureThreshold,    // 1-10
  successThreshold,    // 1-10
  timeout,            // ≥1000ms
  baseDelayMs,        // ≥100ms
  backoffMultiplier,  // 1.0-5.0
  maxBackoffMs,       // ≥1000ms
  cacheFile          // Path to fallback cache
} = config.doppler;
```

---

## Usage

### Basic Integration

```javascript
import { DopplerResilience } from './sidequest/utils/doppler-resilience.js';
import { config } from './sidequest/core/config.js';

// Create instance with configuration
const doppler = new DopplerResilience(config.doppler);

// Override fetchFromDoppler to use your Doppler integration
doppler.fetchFromDoppler = async () => {
  // Your Doppler API call here
  // Typically: return process.env (when using `doppler run`)
  return process.env;
};

// Get secrets with circuit breaker protection
try {
  const secrets = await doppler.getSecrets();
  console.log('Secrets loaded:', Object.keys(secrets));
} catch (error) {
  console.error('Failed to load secrets:', error.message);
}
```

### Health Monitoring

```javascript
// Get health status
const health = doppler.getHealth();

console.log({
  healthy: health.healthy,              // true/false
  circuitState: health.circuitState,    // CLOSED/OPEN/HALF_OPEN
  failureCount: health.failureCount,    // Number of failures
  successRate: health.metrics.successRate, // Success percentage
  usingFallback: health.usingFallback   // true if using cache
});

// Check if circuit is open
if (health.circuitState === 'OPEN') {
  console.warn(`Circuit open, retry in ${health.waitTimeMs}ms`);
}
```

### Express Health Endpoint

```javascript
import express from 'express';
import { DopplerResilience } from './sidequest/utils/doppler-resilience.js';

const app = express();
const doppler = new DopplerResilience(config.doppler);

app.get('/api/health/doppler', (req, res) => {
  const health = doppler.getHealth();

  const statusCode = health.healthy ? 200 : 503;

  res.status(statusCode).json({
    status: health.healthy ? 'healthy' : 'degraded',
    circuitState: health.circuitState,
    metrics: {
      successRate: health.metrics.successRate,
      totalRequests: health.metrics.totalRequests,
      failureCount: health.failureCount
    },
    recovery: health.circuitState === 'OPEN' ? {
      waitTimeMs: health.waitTimeMs,
      nextAttemptTime: health.nextAttemptTime
    } : null
  });
});
```

### Manual Recovery

```javascript
// Reset circuit breaker manually (for operational use)
doppler.reset();
console.log('Circuit breaker reset to CLOSED state');

// Attempt to fetch fresh secrets
try {
  const secrets = await doppler.getSecrets();
  console.log('Successfully recovered and loaded secrets');
} catch (error) {
  console.error('Recovery failed:', error.message);
}
```

---

## Operational Procedures

### Monitoring

**Dashboard Indicator:**
- **Green**: Circuit CLOSED, API healthy
- **Yellow**: Circuit HALF_OPEN, testing recovery
- **Red**: Circuit OPEN, using fallback cache

**Check health status:**
```bash
curl http://localhost:8080/api/health/doppler | jq
```

**Expected response (healthy):**
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

**Expected response (degraded):**
```json
{
  "status": "degraded",
  "circuitState": "OPEN",
  "metrics": {
    "successRate": "40.00%",
    "totalRequests": 50,
    "failureCount": 3
  },
  "recovery": {
    "waitTimeMs": 3421,
    "nextAttemptTime": "2025-11-24T18:30:15.234Z"
  }
}
```

### Alerts

**Sentry Alerts:**

1. **Circuit Opened** (Error severity)
   - Trigger: `failureCount ≥ failureThreshold`
   - Message: "Doppler circuit breaker OPEN - failure threshold exceeded"
   - Tags: `component: doppler-resilience`, `circuitState: OPEN`

2. **Circuit Recovered** (Info severity)
   - Trigger: Circuit transitions to CLOSED
   - Message: "Doppler circuit breaker recovered"
   - Tags: `component: doppler-resilience`, `circuitState: CLOSED`

3. **Circuit Reopened** (Warning severity)
   - Trigger: Failure in HALF_OPEN state
   - Message: "Doppler circuit breaker reopened"
   - Tags: `component: doppler-resilience`, `circuitState: OPEN`

### Incident Response

**Scenario 1: Circuit Opens (Doppler API Down)**

1. **Verify circuit status:**
   ```bash
   curl http://localhost:8080/api/health/doppler
   ```

2. **Check Doppler status:**
   - Visit https://status.doppler.com
   - Check for ongoing incidents

3. **Verify fallback cache:**
   ```bash
   ls -la ~/.doppler/.fallback.json
   stat ~/.doppler/.fallback.json  # Check modification time
   ```

4. **Decision tree:**
   - **Cache < 24h old**: Continue running on cache, monitor for recovery
   - **Cache > 24h old**: Check if secrets rotated
     - **Not rotated**: Safe to continue
     - **Rotated**: Follow emergency procedure (see DOPPLER_OUTAGE.md)

5. **Monitor recovery:**
   - Circuit automatically attempts recovery after timeout (default: 5s)
   - Watch health endpoint for state transitions

**Scenario 2: High Failure Rate (Intermittent Issues)**

1. **Check metrics:**
   ```bash
   curl http://localhost:8080/api/health/doppler | jq '.metrics'
   ```

2. **Symptoms:**
   - `successRate < 80%`
   - `failureCount` increasing but below threshold
   - Circuit flapping between CLOSED and OPEN

3. **Actions:**
   - Check network connectivity to Doppler API
   - Review Doppler API rate limits
   - Consider increasing `DOPPLER_FAILURE_THRESHOLD` if transient
   - Review Sentry for error patterns

**Scenario 3: Manual Recovery**

```bash
# Use HTTP endpoint to trigger reset (if implemented)
curl -X POST http://localhost:8080/api/health/doppler/reset

# Or restart application
pm2 restart aleph-dashboard
pm2 restart aleph-worker
```

---

## Testing

### Unit Tests

```bash
npm test tests/unit/doppler-resilience.test.js
```

**Test coverage:**
- ✅ Circuit breaker state transitions (5 tests)
- ✅ Exponential backoff calculation (3 tests)
- ✅ Fallback mechanism (4 tests)
- ✅ Health status reporting (5 tests)
- ✅ Manual reset (1 test)
- ✅ Edge cases (3 tests)

**Total: 21 tests, 100% passing**

### Integration Testing

```javascript
// Simulate Doppler API failure
import { DopplerResilience } from './sidequest/utils/doppler-resilience.js';

const doppler = new DopplerResilience({
  failureThreshold: 3,
  timeout: 5000
});

// Simulate HTTP 500 errors
doppler.fetchFromDoppler = async () => {
  throw new Error('Doppler API HTTP 500');
};

// Test circuit breaker behavior
async function testCircuitBreaker() {
  // Trigger failures
  await doppler.getSecrets(); // Failure 1
  await doppler.getSecrets(); // Failure 2
  await doppler.getSecrets(); // Failure 3 - opens circuit

  console.log('Circuit state:', doppler.getState()); // 'OPEN'

  // Wait for timeout
  await new Promise(resolve => setTimeout(resolve, 5500));

  // Next call transitions to HALF_OPEN
  await doppler.getSecrets();
  console.log('Circuit state:', doppler.getState()); // 'HALF_OPEN'
}
```

---

## Metrics & Observability

### Key Metrics

1. **Circuit State Distribution**
   - % time in CLOSED state (target: >99%)
   - % time in OPEN state (target: <1%)
   - % time in HALF_OPEN state (minimal)

2. **Failure Rate**
   - `totalFailures / totalRequests`
   - Target: <1%

3. **Recovery Time**
   - Time from OPEN → CLOSED
   - Target: <10s for transient failures

4. **Cache Age**
   - Time since cache last updated
   - Warning: >12h, Critical: >24h

### Sentry Integration

All circuit breaker events are tracked in Sentry:

```javascript
// Circuit opened
Sentry.captureException(error, {
  level: 'error',
  tags: {
    component: 'doppler-resilience',
    circuitState: 'OPEN'
  },
  extra: {
    failureCount: 3,
    failureThreshold: 3,
    consecutiveFailures: 3,
    backoffMs: 4000
  }
});

// Circuit recovered
Sentry.captureMessage('Doppler circuit breaker recovered', {
  level: 'info',
  tags: {
    component: 'doppler-resilience',
    circuitState: 'CLOSED'
  }
});
```

---

## Performance Impact

### Overhead

- **Circuit CLOSED**: Minimal overhead (<1ms per request)
- **Circuit OPEN**: No API calls, fast fallback to cache
- **Circuit HALF_OPEN**: Single API call to test recovery

### Memory Footprint

- Circuit breaker state: ~1KB
- Cached secrets: Varies (typically 5-50KB)
- Total overhead: <100KB

### Recommendations

1. **Failure Threshold**: Keep at 3 for balance between sensitivity and stability
2. **Timeout**: 5s is appropriate for most scenarios
3. **Max Backoff**: 10s prevents excessive delays while avoiding API spam
4. **Cache Refresh**: Monitor cache age, alert if >12h

---

## Troubleshooting

### Circuit Won't Close

**Symptoms:**
- Circuit stuck in OPEN state
- Continuous failures in HALF_OPEN

**Diagnosis:**
```bash
# Check Doppler API accessibility
doppler secrets get --plain NODE_ENV

# Check health endpoint
curl http://localhost:8080/api/health/doppler

# Review Sentry errors
# Look for "Doppler circuit breaker reopened" messages
```

**Solutions:**
1. Verify Doppler API is actually accessible
2. Check network connectivity
3. Review Doppler CLI configuration: `doppler configure`
4. Manual reset if API confirmed healthy: `doppler.reset()`

### High Backoff Delays

**Symptoms:**
- `currentBackoffMs` approaching `maxBackoffMs`
- Slow recovery after transient failures

**Solutions:**
1. Reduce `DOPPLER_BASE_DELAY_MS` if failures are consistently transient
2. Increase `DOPPLER_FAILURE_THRESHOLD` to tolerate more transient errors
3. Check if Doppler API is truly unstable or if there's a persistent issue

### Cache Not Loading

**Symptoms:**
- Error: "Doppler API unavailable and no fallback cache"

**Diagnosis:**
```bash
# Check if cache file exists
ls -la ~/.doppler/.fallback.json

# Verify cache file contents
cat ~/.doppler/.fallback.json | jq
```

**Solutions:**
1. Ensure `doppler run` command has been executed at least once
2. Check `DOPPLER_CACHE_FILE` environment variable
3. Verify file permissions: `chmod 600 ~/.doppler/.fallback.json`

---

## Migration Guide

### From Direct process.env Usage

**Before:**
```javascript
const apiKey = process.env.API_KEY;
const dbPassword = process.env.DB_PASSWORD;
```

**After:**
```javascript
import { DopplerResilience } from './sidequest/utils/doppler-resilience.js';

const doppler = new DopplerResilience(config.doppler);
doppler.fetchFromDoppler = async () => process.env;

const secrets = await doppler.getSecrets();
const apiKey = secrets.API_KEY;
const dbPassword = secrets.DB_PASSWORD;
```

### From DopplerHealthMonitor

The new `DopplerResilience` class complements the existing `DopplerHealthMonitor`:

- **DopplerHealthMonitor**: Monitors cache age, alerts on stale cache
- **DopplerResilience**: Handles API failures with circuit breaker

Use both together for comprehensive monitoring.

---

## References

- **Implementation**: `/Users/alyshialedlie/code/jobs/sidequest/utils/doppler-resilience.js`
- **Tests**: `/Users/alyshialedlie/code/jobs/tests/unit/doppler-resilience.test.js`
- **Configuration**: `/Users/alyshialedlie/code/jobs/sidequest/core/config.js`
- **Examples**: `/Users/alyshialedlie/code/jobs/sidequest/utils/doppler-resilience.example.js`
- **Outage Runbook**: `/Users/alyshialedlie/code/jobs/docs/runbooks/DOPPLER_OUTAGE.md`

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-11-24 | Initial implementation with circuit breaker, exponential backoff, and fallback cache |

---

**Maintained By**: AlephAuto Operations Team
**Questions?** Review examples in `doppler-resilience.example.js` or consult the test suite for detailed usage patterns.

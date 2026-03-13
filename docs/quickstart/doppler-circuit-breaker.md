# Doppler Circuit Breaker Pattern

Reference implementation for resilient Doppler secret management with circuit breaker protection.

**Source:** `sidequest/utils/doppler-resilience.ts`

---

## Overview

The `DopplerResilience` class provides circuit breaker protection for Doppler API calls. When Doppler is unreachable, the circuit opens and falls back to cached secrets, preventing cascading failures.

## Quick Start

```javascript
import { DopplerResilience } from './sidequest/utils/doppler-resilience.ts';
import { config } from './sidequest/core/config.ts';

class DopplerConfigManager extends DopplerResilience {
  constructor(options = {}) {
    super({ ...config.doppler, ...options });
  }

  async fetchFromDoppler() {
    // process.env is populated by `doppler run --` before the process starts.
    // Access individual secrets via config (sidequest/core/config.ts), not process.env directly.
    // This fetchFromDoppler is only called by DopplerResilience internals.
    if (!process.env.NODE_ENV) {
      throw new Error('Doppler secrets not available - NODE_ENV missing');
    }
    return process.env;
  }

  async getSecret(key, defaultValue = null) {
    try {
      const secrets = await this.getSecrets();
      return secrets[key] ?? defaultValue;
    } catch (error) {
      return defaultValue;
    }
  }
}
```

## Usage

```javascript
const dopplerConfig = new DopplerConfigManager();

// Get secrets with circuit breaker protection
const apiKey = await dopplerConfig.getSecret('API_KEY', 'fallback-key');

// Check health status
const health = dopplerConfig.getHealth();
// health.circuitState: 'CLOSED' | 'OPEN' | 'HALF_OPEN'
// health.healthy: boolean
// health.usingFallback: boolean
```

## Express Health Middleware

```javascript
export function createDopplerHealthMiddleware(dopplerConfig) {
  return async (req, res) => {
    const health = dopplerConfig.getHealth();
    res.status(health.healthy ? 200 : 503).json({
      status: health.circuitState === 'CLOSED' ? 'healthy' : 'degraded',
      circuitState: health.circuitState,
      healthy: health.healthy,
      usingFallback: health.usingFallback,
      metrics: {
        successRate: health.metrics.successRate,
        totalRequests: health.metrics.totalRequests,
        totalFailures: health.metrics.totalFailures
      },
      recovery: health.circuitState === 'OPEN' ? {
        waitTimeMs: health.waitTimeMs,
        nextAttemptTime: health.nextAttemptTime
      } : null
    });
  };
}
```

## Health Monitoring

Use `DopplerResilience#getHealth()` for monitoring and alerts:

| Condition | Severity | Action |
|-----------|----------|--------|
| Circuit OPEN | Critical | Check [Doppler Status](https://status.doppler.com) |
| Using cached secrets | Warning | Verify no secrets rotated |
| Cache > 24h old | Critical | Restart with `doppler run` |
| Success rate < 50% | Warning | Investigate connectivity |

## Periodic Monitoring

```javascript
const dopplerConfig = new DopplerConfigManager();

setInterval(() => {
  const health = dopplerConfig.getHealth();
  console.log('Doppler circuit state:', health.circuitState);
  console.log('Using fallback:', health.usingFallback);
}, 60000);
```

## Circuit States

```
CLOSED ──[failures > threshold]──> OPEN ──[cooldown expires]──> HALF_OPEN
  ^                                                                │
  └───────────────[success]────────────────────────────────────────┘
  └───────────────[failure]──> OPEN (reset cooldown)
```

## Manual Recovery

```javascript
const health = dopplerConfig.getHealth();
if (!health.healthy) {
  // Trigger your app-specific recovery flow here
  console.warn('Doppler degraded, running fallback mode');
}
```

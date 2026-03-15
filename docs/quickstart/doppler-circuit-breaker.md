# Doppler Circuit Breaker Pattern

Reference implementation for resilient Doppler secret management with circuit breaker protection.

**Source:** `sidequest/utils/doppler-resilience.ts`

---

## Overview

The abstract `DopplerResilience` class provides circuit breaker protection for Doppler API calls. When Doppler is unreachable, the circuit opens and falls back to cached secrets, preventing cascading failures. Subclasses **must** implement `fetchFromDoppler()` to supply the secret-fetching logic.

```
CLOSED ──[failures > threshold]──> OPEN ──[cooldown expires]──> HALF_OPEN
  ^                                                                │
  └───────────────[success]────────────────────────────────────────┘
  └───────────────[failure]──> OPEN (reset cooldown)
```

## Quick Start

```typescript
import { DopplerResilience } from './sidequest/utils/doppler-resilience.ts';
import { config } from './sidequest/core/config.ts';

class DopplerConfigManager extends DopplerResilience {
  constructor(options = {}) {
    super({ ...config.doppler, ...options });
  }

  async fetchFromDoppler() {
    // process.env is populated by `doppler run --` before the process starts.
    // Access individual secrets via config (sidequest/core/config.ts), not process.env directly.
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

```typescript
const dopplerConfig = new DopplerConfigManager();

// Get secrets with circuit breaker protection
const apiKey = await dopplerConfig.getSecret('API_KEY', 'fallback-key');

// Lightweight circuit state check
const state = dopplerConfig.getState(); // 'CLOSED' | 'OPEN' | 'HALF_OPEN'

// Full health object (see Monitoring section)
const health = dopplerConfig.getHealth();

// Force circuit back to CLOSED after confirming Doppler is healthy
dopplerConfig.reset();
```

## Monitoring

Use `getHealth()` for dashboards, alerts, and periodic checks:

```typescript
setInterval(() => {
  const health = dopplerConfig.getHealth();
  // health.healthy, health.circuitState, health.usingFallback
  // health.metrics.successRate, health.metrics.totalRequests, health.metrics.totalFailures
  if (!health.healthy) {
    console.warn('Doppler degraded:', health.circuitState);
  }
}, 60000);
```

| Condition | Severity | Action |
|-----------|----------|--------|
| Circuit OPEN | Critical | Check [Doppler Status](https://status.doppler.com) |
| Using cached secrets | Warning | Verify no secrets rotated |
| Cache > 24h old | Critical | Restart with `doppler run` |
| Success rate < 50% | Warning | Investigate connectivity |

## Express Health Middleware

```typescript
export function createDopplerHealthMiddleware(dopplerConfig) {
  return async (req, res) => {
    const health = dopplerConfig.getHealth();
    res.status(health.healthy ? 200 : 503).json({
      status: health.circuitState === 'CLOSED' ? 'healthy' : 'degraded',
      circuitState: health.circuitState,
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

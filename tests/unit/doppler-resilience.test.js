/**
 * Tests for Doppler Resilience Circuit Breaker
 *
 * Coverage:
 * - Circuit breaker state transitions (CLOSED → OPEN → HALF_OPEN → CLOSED)
 * - Exponential backoff calculation
 * - Fallback mechanism to cached secrets
 * - Success/failure counting
 * - Health status reporting
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DopplerResilience } from '../../sidequest/utils/doppler-resilience.ts';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('DopplerResilience', () => {
  let doppler;
  let testCacheDir;
  let testCacheFile;

  beforeEach(async () => {
    // Create temporary cache directory and file
    testCacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'doppler-test-'));
    testCacheFile = path.join(testCacheDir, '.fallback.json');

    // Write test cache file
    const testSecrets = {
      NODE_ENV: 'test',
      API_KEY: 'test-key-123',
      DB_PASSWORD: 'test-password'
    };
    await fs.writeFile(testCacheFile, JSON.stringify(testSecrets, null, 2));

    // Create DopplerResilience instance with test configuration
    doppler = new DopplerResilience({
      cacheFile: testCacheFile,
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 100, // 100ms for faster tests
      baseDelayMs: 100, // 100ms base delay
      maxBackoffMs: 1000 // 1s max backoff
    });
  });

  afterEach(async () => {
    // Cleanup test cache directory
    try {
      await fs.rm(testCacheDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Circuit Breaker State Transitions', () => {
    it('should start in CLOSED state', () => {
      const health = doppler.getHealth();
      assert.equal(health.circuitState, 'CLOSED');
      assert.equal(health.healthy, true);
    });

    it('should open circuit after failure threshold', async () => {
      // Override fetchFromDoppler to always fail
      doppler.fetchFromDoppler = async () => {
        throw new Error('Doppler API HTTP 500');
      };

      // Trigger failures (threshold = 3)
      await doppler.getSecrets(); // Failure 1
      assert.equal(doppler.getState(), 'CLOSED');

      await doppler.getSecrets(); // Failure 2
      assert.equal(doppler.getState(), 'CLOSED');

      await doppler.getSecrets(); // Failure 3 - should open circuit
      assert.equal(doppler.getState(), 'OPEN');

      const health = doppler.getHealth();
      assert.equal(health.circuitState, 'OPEN');
      assert.equal(health.healthy, false);
      assert.equal(health.failureCount, 3);
      assert.equal(health.consecutiveFailures, 3);
    });

    it('should transition to HALF_OPEN after timeout', async () => {
      let attemptedInHalfOpen = false;

      // Override fetchFromDoppler: fail 3 times to open circuit, then succeed on HALF_OPEN
      doppler.fetchFromDoppler = async () => {
        if (doppler.getState() === 'HALF_OPEN') {
          attemptedInHalfOpen = true;
          return { NODE_ENV: 'production', API_KEY: 'live-key' };
        }
        throw new Error('Doppler API HTTP 500');
      };

      // Open circuit
      await doppler.getSecrets(); // Failure 1
      await doppler.getSecrets(); // Failure 2
      await doppler.getSecrets(); // Failure 3 - opens circuit

      assert.equal(doppler.getState(), 'OPEN');

      // Wait for timeout (100ms)
      await new Promise(resolve => setTimeout(resolve, 150));

      // Next request should transition to HALF_OPEN and succeed
      const secrets = await doppler.getSecrets();
      assert.ok(attemptedInHalfOpen, 'Should have attempted fetch in HALF_OPEN state');
      assert.equal(secrets.NODE_ENV, 'production');
      assert.equal(doppler.getState(), 'HALF_OPEN'); // Still in HALF_OPEN after 1 success
    });

    it('should close circuit after success threshold in HALF_OPEN', async () => {
      let callCount = 0;

      // Override fetchFromDoppler: fail 3 times, then succeed
      doppler.fetchFromDoppler = async () => {
        callCount++;
        if (callCount <= 3) {
          throw new Error('Doppler API HTTP 500');
        }
        return { NODE_ENV: 'production', API_KEY: 'live-key' };
      };

      // Open circuit (3 failures)
      await doppler.getSecrets(); // Failure 1
      await doppler.getSecrets(); // Failure 2
      await doppler.getSecrets(); // Failure 3 - opens circuit

      assert.equal(doppler.getState(), 'OPEN');

      // Wait for timeout to transition to HALF_OPEN
      await new Promise(resolve => setTimeout(resolve, 150));

      // First success in HALF_OPEN
      const secrets1 = await doppler.getSecrets();
      assert.equal(doppler.getState(), 'HALF_OPEN');
      assert.equal(secrets1.NODE_ENV, 'production');

      // Second success in HALF_OPEN - should close circuit (threshold = 2)
      const secrets2 = await doppler.getSecrets();
      assert.equal(doppler.getState(), 'CLOSED');
      assert.equal(secrets2.NODE_ENV, 'production');

      const health = doppler.getHealth();
      assert.equal(health.circuitState, 'CLOSED');
      assert.equal(health.healthy, true);
      assert.equal(health.failureCount, 0);
    });

    it('should reopen circuit if failure occurs in HALF_OPEN', async () => {
      let callCount = 0;

      // Override fetchFromDoppler: fail 3 times, succeed once, then fail again
      doppler.fetchFromDoppler = async () => {
        callCount++;
        if (callCount <= 3 || callCount === 5) {
          throw new Error('Doppler API HTTP 500');
        }
        return { NODE_ENV: 'production' };
      };

      // Open circuit (3 failures)
      await doppler.getSecrets(); // Failure 1
      await doppler.getSecrets(); // Failure 2
      await doppler.getSecrets(); // Failure 3 - opens circuit

      assert.equal(doppler.getState(), 'OPEN');

      // Wait for timeout to transition to HALF_OPEN
      await new Promise(resolve => setTimeout(resolve, 150));

      // Success in HALF_OPEN
      await doppler.getSecrets();
      assert.equal(doppler.getState(), 'HALF_OPEN');

      // Failure in HALF_OPEN - should reopen circuit
      await doppler.getSecrets();
      assert.equal(doppler.getState(), 'OPEN');

      const health = doppler.getHealth();
      assert.equal(health.circuitState, 'OPEN');
      assert.equal(health.healthy, false);
    });
  });

  describe('Exponential Backoff', () => {
    it('should calculate exponential backoff correctly', async () => {
      // Increase threshold so circuit doesn't open during backoff testing
      doppler = new DopplerResilience({
        cacheFile: testCacheFile,
        failureThreshold: 10, // Higher threshold
        baseDelayMs: 100,
        maxBackoffMs: 1000
      });

      doppler.fetchFromDoppler = async () => {
        throw new Error('Doppler API HTTP 500');
      };

      // Failure 1: 100ms (base delay * 2^0)
      await doppler.getSecrets();
      let health = doppler.getHealth();
      assert.equal(health.currentBackoffMs, 100);
      assert.equal(doppler.getState(), 'CLOSED');

      // Failure 2: 200ms (100 * 2^1)
      await doppler.getSecrets();
      health = doppler.getHealth();
      assert.equal(health.currentBackoffMs, 200);
      assert.equal(doppler.getState(), 'CLOSED');

      // Failure 3: 400ms (100 * 2^2)
      await doppler.getSecrets();
      health = doppler.getHealth();
      assert.equal(health.currentBackoffMs, 400);
      assert.equal(doppler.getState(), 'CLOSED');

      // Failure 4: 800ms (100 * 2^3)
      await doppler.getSecrets();
      health = doppler.getHealth();
      assert.equal(health.currentBackoffMs, 800);
      assert.equal(doppler.getState(), 'CLOSED');

      // Failure 5: 1000ms (max backoff reached: 100 * 2^4 = 1600, capped at 1000)
      await doppler.getSecrets();
      health = doppler.getHealth();
      assert.equal(health.currentBackoffMs, 1000);
      assert.equal(doppler.getState(), 'CLOSED');
    });

    it('should respect max backoff limit', async () => {
      doppler.fetchFromDoppler = async () => {
        throw new Error('Doppler API HTTP 500');
      };

      // Trigger many failures to exceed max backoff
      for (let i = 0; i < 10; i++) {
        await doppler.getSecrets();
      }

      const health = doppler.getHealth();
      assert.ok(health.currentBackoffMs <= 1000, 'Backoff should not exceed max');
    });

    it('should reset backoff on success', async () => {
      let callCount = 0;

      doppler.fetchFromDoppler = async () => {
        callCount++;
        if (callCount <= 2) {
          throw new Error('Doppler API HTTP 500');
        }
        return { NODE_ENV: 'production' };
      };

      // Trigger failures to build up backoff
      await doppler.getSecrets(); // Failure 1: 100ms
      await doppler.getSecrets(); // Failure 2: 200ms

      let health = doppler.getHealth();
      assert.equal(health.currentBackoffMs, 200);

      // Success should reset backoff
      await doppler.getSecrets();
      health = doppler.getHealth();
      assert.equal(health.currentBackoffMs, 0);
      assert.equal(health.consecutiveFailures, 0);
    });
  });

  describe('Fallback Mechanism', () => {
    it('should load cached secrets on Doppler failure', async () => {
      doppler.fetchFromDoppler = async () => {
        throw new Error('Doppler API HTTP 500');
      };

      const secrets = await doppler.getSecrets();

      assert.equal(secrets.NODE_ENV, 'test');
      assert.equal(secrets.API_KEY, 'test-key-123');
      assert.equal(secrets.DB_PASSWORD, 'test-password');

      const health = doppler.getHealth();
      assert.ok(health.cacheLoadedAt);
    });

    it('should throw error if no cache file exists', async () => {
      // Create instance with non-existent cache file
      const dopplerNoCache = new DopplerResilience({
        cacheFile: '/nonexistent/path/.fallback.json',
        failureThreshold: 3
      });

      dopplerNoCache.fetchFromDoppler = async () => {
        throw new Error('Doppler API HTTP 500');
      };

      await assert.rejects(
        async () => await dopplerNoCache.getSecrets(),
        /Doppler API unavailable and no fallback cache/
      );
    });

    it('should reload cache if stale', async () => {
      doppler.fetchFromDoppler = async () => {
        throw new Error('Doppler API HTTP 500');
      };

      // First load
      const secrets1 = await doppler.getSecrets();
      assert.equal(secrets1.NODE_ENV, 'test');

      // Update cache file
      const updatedSecrets = {
        NODE_ENV: 'updated',
        API_KEY: 'updated-key'
      };
      await fs.writeFile(testCacheFile, JSON.stringify(updatedSecrets));

      // Force cache to be considered stale (5+ minutes old)
      doppler.cacheLoadedAt = Date.now() - (6 * 60 * 1000);

      // Should reload cache
      const secrets2 = await doppler.getSecrets();
      assert.equal(secrets2.NODE_ENV, 'updated');
      assert.equal(secrets2.API_KEY, 'updated-key');
    });

    it('should use cached secrets when circuit is OPEN', async () => {
      doppler.fetchFromDoppler = async () => {
        throw new Error('Doppler API HTTP 500');
      };

      // Open circuit (3 failures)
      await doppler.getSecrets(); // Failure 1
      await doppler.getSecrets(); // Failure 2
      await doppler.getSecrets(); // Failure 3 - opens circuit

      assert.equal(doppler.getState(), 'OPEN');

      // Should use cache without attempting Doppler API
      const secrets = await doppler.getSecrets();
      assert.equal(secrets.NODE_ENV, 'test');

      const health = doppler.getHealth();
      assert.equal(health.usingFallback, true);
    });
  });

  describe('Health Status', () => {
    it('should report healthy status in CLOSED state', () => {
      const health = doppler.getHealth();

      assert.equal(health.healthy, true);
      assert.equal(health.circuitState, 'CLOSED');
      assert.equal(health.failureCount, 0);
      assert.equal(health.consecutiveFailures, 0);
      assert.equal(health.usingFallback, false);
    });

    it('should report degraded status in OPEN state', async () => {
      doppler.fetchFromDoppler = async () => {
        throw new Error('Doppler API HTTP 500');
      };

      // Open circuit
      await doppler.getSecrets(); // Failure 1
      await doppler.getSecrets(); // Failure 2
      await doppler.getSecrets(); // Failure 3 - opens circuit

      const health = doppler.getHealth();

      assert.equal(health.healthy, false);
      assert.equal(health.circuitState, 'OPEN');
      assert.equal(health.failureCount, 3);
      assert.equal(health.consecutiveFailures, 3);
      assert.equal(health.usingFallback, true);
      assert.ok(health.nextAttemptTime);
      assert.ok(health.lastFailureTime);
    });

    it('should track success rate metrics', async () => {
      let callCount = 0;

      doppler.fetchFromDoppler = async () => {
        callCount++;
        if (callCount <= 2) {
          throw new Error('Doppler API HTTP 500');
        }
        return { NODE_ENV: 'production' };
      };

      // 2 failures, 2 successes
      await doppler.getSecrets(); // Failure 1
      await doppler.getSecrets(); // Failure 2
      await doppler.getSecrets(); // Success 1
      await doppler.getSecrets(); // Success 2

      const health = doppler.getHealth();
      assert.equal(health.metrics.totalRequests, 4);
      assert.equal(health.metrics.totalFailures, 2);
      assert.equal(health.metrics.totalSuccesses, 2);
      assert.equal(health.metrics.successRate, '50.00%');
    });

    it('should include last error in health status', async () => {
      doppler.fetchFromDoppler = async () => {
        throw new Error('Doppler API HTTP 500');
      };

      await doppler.getSecrets();

      const health = doppler.getHealth();
      assert.ok(health.metrics.lastError);
      assert.equal(health.metrics.lastError.message, 'Doppler API HTTP 500');
      assert.ok(health.metrics.lastError.timestamp);
    });

    it('should calculate wait time for next attempt', async () => {
      doppler.fetchFromDoppler = async () => {
        throw new Error('Doppler API HTTP 500');
      };

      // Open circuit
      await doppler.getSecrets(); // Failure 1
      await doppler.getSecrets(); // Failure 2
      await doppler.getSecrets(); // Failure 3 - opens circuit

      const health = doppler.getHealth();
      assert.ok(health.waitTimeMs > 0);
      assert.ok(health.waitTimeMs <= 100); // Should be <= timeout (100ms)
    });
  });

  describe('Manual Reset', () => {
    it('should reset circuit breaker state', async () => {
      doppler.fetchFromDoppler = async () => {
        throw new Error('Doppler API HTTP 500');
      };

      // Open circuit
      await doppler.getSecrets(); // Failure 1
      await doppler.getSecrets(); // Failure 2
      await doppler.getSecrets(); // Failure 3 - opens circuit

      assert.equal(doppler.getState(), 'OPEN');

      // Manual reset
      doppler.reset();

      const health = doppler.getHealth();
      assert.equal(health.circuitState, 'CLOSED');
      assert.equal(health.healthy, true);
      assert.equal(health.failureCount, 0);
      assert.equal(health.consecutiveFailures, 0);
      assert.equal(health.successCount, 0);
      assert.equal(health.currentBackoffMs, 0);
      assert.equal(health.lastFailureTime, null);
      assert.equal(health.nextAttemptTime, null);
    });
  });

  describe('Edge Cases', () => {
    it('should handle JSON parse errors in cache file', async () => {
      // Write invalid JSON to cache file
      await fs.writeFile(testCacheFile, 'invalid json {{{');

      doppler.fetchFromDoppler = async () => {
        throw new Error('Doppler API HTTP 500');
      };

      await assert.rejects(
        async () => await doppler.getSecrets(),
        /Doppler API unavailable and no fallback cache/
      );
    });

    it('should handle concurrent requests during circuit open', async () => {
      doppler.fetchFromDoppler = async () => {
        throw new Error('Doppler API HTTP 500');
      };

      // Open circuit
      await doppler.getSecrets(); // Failure 1
      await doppler.getSecrets(); // Failure 2
      await doppler.getSecrets(); // Failure 3 - opens circuit

      // Make concurrent requests while circuit is open
      const promises = [
        doppler.getSecrets(),
        doppler.getSecrets(),
        doppler.getSecrets()
      ];

      const results = await Promise.all(promises);

      // All should return cached secrets
      results.forEach(secrets => {
        assert.equal(secrets.NODE_ENV, 'test');
      });
    });

    it('should handle success rate calculation with zero requests', () => {
      const health = doppler.getHealth();
      assert.equal(health.metrics.totalRequests, 0);
      assert.equal(health.metrics.successRate, 'N/A');
    });
  });
});

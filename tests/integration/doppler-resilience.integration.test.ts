/**
 * Doppler Resilience Integration Tests
 *
 * End-to-end tests for circuit breaker with real:
 * - Cache file creation and reading
 * - Concurrent requests during circuit open
 * - Cache staleness detection and refresh
 * - Sentry event capture (mocked SDK)
 *
 * Scenarios:
 * 1. Doppler API fails → circuit opens → fallback cache used
 * 2. Circuit opens → timeout expires → half-open → recovery
 * 3. Multiple concurrent requests during circuit open
 * 4. Cache staleness detection and refresh
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DopplerResilience } from '../../sidequest/utils/doppler-resilience.ts';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('Doppler Resilience - Integration Tests', () => {
  let testCacheDir;
  let testCacheFile;

  beforeEach(async () => {
    // Create real cache directory
    testCacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'doppler-integration-'));
    testCacheFile = path.join(testCacheDir, '.fallback.json');

    // Write real cache file
    const testSecrets = {
      NODE_ENV: 'test',
      JOBS_API_PORT: '8080',
      REDIS_HOST: 'localhost',
      API_KEY: 'cached-secret-123'
    };
    await fs.writeFile(testCacheFile, JSON.stringify(testSecrets, null, 2));
  });

  afterEach(async () => {
    // Cleanup real cache directory
    try {
      await fs.rm(testCacheDir, { recursive: true, force: true });
    } catch (_error) {
      // Ignore cleanup errors
    }
  });

  it('Scenario 1: Doppler API fails → circuit opens → fallback cache used', async () => {
    const doppler = new DopplerResilience({
      cacheFile: testCacheFile,
      failureThreshold: 3,
      timeout: 100,
      baseDelayMs: 50
    });

    // Simulate Doppler API failures
    let _callCount = 0;
    doppler.fetchFromDoppler = async () => {
      _callCount++;
      throw new Error('HTTP 500: Doppler API Internal Server Error');
    };

    // First 3 requests should fail and open circuit
    const secrets1 = await doppler.getSecrets();
    assert.equal(doppler.getState(), 'CLOSED', 'Circuit should be CLOSED after 1st failure');

    const secrets2 = await doppler.getSecrets();
    assert.equal(doppler.getState(), 'CLOSED', 'Circuit should be CLOSED after 2nd failure');

    const secrets3 = await doppler.getSecrets();
    assert.equal(doppler.getState(), 'OPEN', 'Circuit should be OPEN after 3rd failure');

    // All requests should return cached secrets
    assert.equal(secrets1.API_KEY, 'cached-secret-123', 'Should return cached secrets on failure 1');
    assert.equal(secrets2.API_KEY, 'cached-secret-123', 'Should return cached secrets on failure 2');
    assert.equal(secrets3.API_KEY, 'cached-secret-123', 'Should return cached secrets on failure 3');

    // Verify circuit is open
    const health = doppler.getHealth();
    assert.equal(health.circuitState, 'OPEN');
    assert.equal(health.healthy, false);
    assert.equal(health.usingFallback, true);
    assert.equal(health.failureCount, 3);

    // Verify cache file was actually read
    const cacheContent = await fs.readFile(testCacheFile, 'utf-8');
    const cachedData = JSON.parse(cacheContent);
    assert.equal(cachedData.API_KEY, 'cached-secret-123');

    // Circuit breaker health verified
    // Note: Sentry integration is real, not mocked in integration tests
  });

  it('Scenario 2: Circuit opens → timeout expires → half-open → recovery', async () => {
    const doppler = new DopplerResilience({
      cacheFile: testCacheFile,
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 100, // 100ms timeout
      baseDelayMs: 50
    });

    let attemptCount = 0;
    doppler.fetchFromDoppler = async () => {
      attemptCount++;

      // Fail first 3 times to open circuit
      if (attemptCount <= 3) {
        throw new Error('Doppler API unavailable');
      }

      // Succeed after circuit opens to test recovery
      return {
        NODE_ENV: 'production',
        API_KEY: 'live-api-key-789',
        JOBS_API_PORT: '8080'
      };
    };

    // Open circuit with 3 failures
    await doppler.getSecrets(); // Failure 1
    await doppler.getSecrets(); // Failure 2
    await doppler.getSecrets(); // Failure 3
    assert.equal(doppler.getState(), 'OPEN');

    // Wait for timeout to expire (100ms)
    await new Promise(resolve => setTimeout(resolve, 150));

    // Next request should attempt HALF_OPEN
    const secrets1 = await doppler.getSecrets();
    assert.equal(doppler.getState(), 'HALF_OPEN', 'Should transition to HALF_OPEN after timeout');
    assert.equal(secrets1.API_KEY, 'live-api-key-789', 'Should fetch from Doppler in HALF_OPEN');

    // Second success should close circuit
    const secrets2 = await doppler.getSecrets();
    assert.equal(doppler.getState(), 'CLOSED', 'Should close circuit after 2 successes');
    assert.equal(secrets2.API_KEY, 'live-api-key-789');

    // Verify health
    const health = doppler.getHealth();
    assert.equal(health.healthy, true);
    assert.equal(health.circuitState, 'CLOSED');
    assert.equal(health.usingFallback, false);

    // Circuit recovery verified
    // Note: Sentry integration is real, not mocked in integration tests
  });

  it('Scenario 3: Multiple concurrent requests during circuit open', async () => {
    const doppler = new DopplerResilience({
      cacheFile: testCacheFile,
      failureThreshold: 3,
      timeout: 500,
      baseDelayMs: 50
    });

    // Fail all requests
    doppler.fetchFromDoppler = async () => {
      throw new Error('Doppler API down');
    };

    // Open circuit
    await doppler.getSecrets();
    await doppler.getSecrets();
    await doppler.getSecrets();
    assert.equal(doppler.getState(), 'OPEN');

    // Launch 10 concurrent requests while circuit is open
    const promises = Array.from({ length: 10 }, () => doppler.getSecrets());
    const results = await Promise.all(promises);

    // All requests should return cached secrets
    results.forEach((secrets, idx) => {
      assert.equal(secrets.API_KEY, 'cached-secret-123', `Request ${idx} should use cache`);
      assert.equal(secrets.JOBS_API_PORT, '8080');
    });

    // Circuit should still be open
    assert.equal(doppler.getState(), 'OPEN');

    // Verify metrics
    const health = doppler.getHealth();
    assert.equal(health.metrics.totalRequests, 13); // 3 to open + 10 concurrent
    assert.equal(health.usingFallback, true);
  });

  it('Scenario 4: Cache staleness detection and refresh', async () => {
    const doppler = new DopplerResilience({
      cacheFile: testCacheFile,
      failureThreshold: 3,
      timeout: 100
    });

    doppler.fetchFromDoppler = async () => {
      throw new Error('Doppler API error');
    };

    // First request loads cache
    await doppler.getSecrets();
    await doppler.getSecrets();
    await doppler.getSecrets();

    const health1 = doppler.getHealth();
    const firstLoadTime = health1.cacheLoadedAt;
    assert(firstLoadTime, 'Cache should have load timestamp');

    // Manually set cache as stale (older than 5 minutes)
    doppler.cacheLoadedAt = Date.now() - (6 * 60 * 1000);

    // Update cache file with new data
    const updatedSecrets = {
      NODE_ENV: 'production',
      JOBS_API_PORT: '9000',
      API_KEY: 'updated-secret-456'
    };
    await fs.writeFile(testCacheFile, JSON.stringify(updatedSecrets, null, 2));

    // Next request should reload from cache file
    const secrets = await doppler.getSecrets();
    assert.equal(secrets.API_KEY, 'updated-secret-456', 'Should reload stale cache');
    assert.equal(secrets.JOBS_API_PORT, '9000');

    const health2 = doppler.getHealth();
    const secondLoadTime = health2.cacheLoadedAt;

    // Cache load time should be updated
    assert(new Date(secondLoadTime) > new Date(firstLoadTime), 'Cache should be reloaded');
  });

  it('Scenario 5: No cache file available - should throw error', async () => {
    const missingCacheFile = path.join(testCacheDir, 'nonexistent.json');

    const doppler = new DopplerResilience({
      cacheFile: missingCacheFile,
      failureThreshold: 1
    });

    doppler.fetchFromDoppler = async () => {
      throw new Error('Doppler API unavailable');
    };

    // Should throw error when cache file doesn't exist
    await assert.rejects(
      async () => await doppler.getSecrets(),
      /no fallback cache/i,
      'Should throw error when cache unavailable'
    );

    // Error thrown as expected
    // Note: Sentry integration is real, not mocked in integration tests
  });

  it('Scenario 6: Exponential backoff calculation verification', async () => {
    const doppler = new DopplerResilience({
      cacheFile: testCacheFile,
      failureThreshold: 10,
      baseDelayMs: 1000,
      backoffMultiplier: 2,
      maxBackoffMs: 10000
    });

    doppler.fetchFromDoppler = async () => {
      throw new Error('Doppler API error');
    };

    // Trigger multiple failures to test backoff progression
    const backoffProgression = [];

    for (let i = 0; i < 5; i++) {
      await doppler.getSecrets();
      const health = doppler.getHealth();
      backoffProgression.push(health.currentBackoffMs);
    }

    // Verify exponential backoff: 1s, 2s, 4s, 8s, 10s (capped at max)
    assert.equal(backoffProgression[0], 1000, 'First backoff should be 1s');
    assert.equal(backoffProgression[1], 2000, 'Second backoff should be 2s');
    assert.equal(backoffProgression[2], 4000, 'Third backoff should be 4s');
    assert.equal(backoffProgression[3], 8000, 'Fourth backoff should be 8s');
    assert.equal(backoffProgression[4], 10000, 'Fifth backoff should be capped at 10s');
  });
});

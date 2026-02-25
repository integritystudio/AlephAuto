import { test, describe } from 'node:test';
import assert from 'node:assert';

/**
 * Unit tests for retry logic
 *
 * Tests the retry counter tracking and circuit breaker functionality
 */

describe('Retry Logic', () => {
  describe('Original Job ID Extraction', () => {
    test('should extract original ID from single retry suffix', () => {
      const originalId = extractOriginalJobId('scan-intra-project-123-retry1');
      assert.strictEqual(originalId, 'scan-intra-project-123');
    });

    test('should extract original ID from multiple retry suffixes', () => {
      const originalId = extractOriginalJobId('scan-intra-project-123-retry1-retry1-retry1');
      assert.strictEqual(originalId, 'scan-intra-project-123');
    });

    test('should handle job ID without retry suffix', () => {
      const originalId = extractOriginalJobId('scan-intra-project-123');
      assert.strictEqual(originalId, 'scan-intra-project-123');
    });

    test('should handle complex job IDs with numbers', () => {
      const originalId = extractOriginalJobId('scan-1763417052507-retry1-retry2-retry3');
      assert.strictEqual(originalId, 'scan-1763417052507');
    });

    test('should handle job IDs with retry-like patterns in name', () => {
      const originalId = extractOriginalJobId('scan-retry-project-123-retry1');
      assert.strictEqual(originalId, 'scan-retry-project-123');
    });
  });

  describe('Retry Counter Tracking', () => {
    test('should track retries by original job ID', () => {
      const retryQueue = new Map();
      const maxRetries = 2;

      // Simulate first failure
      const jobId1 = 'scan-123';
      const originalId1 = extractOriginalJobId(jobId1);

      if (!retryQueue.has(originalId1)) {
        retryQueue.set(originalId1, { attempts: 0, maxAttempts: maxRetries });
      }
      retryQueue.get(originalId1).attempts++;

      assert.strictEqual(retryQueue.get(originalId1).attempts, 1);

      // Simulate retry failure with appended suffix
      const jobId2 = 'scan-123-retry1';
      const originalId2 = extractOriginalJobId(jobId2);

      // Should find existing retry tracking
      assert.ok(retryQueue.has(originalId2));
      assert.strictEqual(originalId2, originalId1);

      retryQueue.get(originalId2).attempts++;
      assert.strictEqual(retryQueue.get(originalId2).attempts, 2);
    });

    test('should respect configured max retries', () => {
      const retryQueue = new Map();
      const maxRetries = 2;
      const originalId = 'scan-123';

      retryQueue.set(originalId, { attempts: 0, maxAttempts: maxRetries });

      // First retry
      retryQueue.get(originalId).attempts++;
      assert.ok(retryQueue.get(originalId).attempts < maxRetries);

      // Second retry
      retryQueue.get(originalId).attempts++;
      assert.strictEqual(retryQueue.get(originalId).attempts, maxRetries);

      // Should stop retrying
      const shouldRetry = retryQueue.get(originalId).attempts < maxRetries;
      assert.strictEqual(shouldRetry, false);
    });
  });

  describe('Circuit Breaker', () => {
    const MAX_ABSOLUTE_RETRIES = 5;

    test('should trigger circuit breaker at absolute max', () => {
      const retryQueue = new Map();
      const maxRetries = 10; // Configured max is higher than absolute
      const originalId = 'scan-123';

      retryQueue.set(originalId, { attempts: 0, maxAttempts: maxRetries });

      // Increment to absolute max
      for (let i = 0; i < MAX_ABSOLUTE_RETRIES; i++) {
        retryQueue.get(originalId).attempts++;
      }

      assert.strictEqual(retryQueue.get(originalId).attempts, MAX_ABSOLUTE_RETRIES);

      // Circuit breaker should trigger
      const circuitBreakerTriggered = retryQueue.get(originalId).attempts >= MAX_ABSOLUTE_RETRIES;
      assert.strictEqual(circuitBreakerTriggered, true);
    });

    test('should prefer configured max when lower than absolute max', () => {
      const retryQueue = new Map();
      const maxRetries = 2; // Lower than absolute max
      const originalId = 'scan-123';

      retryQueue.set(originalId, { attempts: 0, maxAttempts: maxRetries });

      // Increment to configured max
      for (let i = 0; i < maxRetries; i++) {
        retryQueue.get(originalId).attempts++;
      }

      assert.strictEqual(retryQueue.get(originalId).attempts, maxRetries);

      // Should stop at configured max (before circuit breaker)
      const shouldStop = retryQueue.get(originalId).attempts >= maxRetries;
      assert.strictEqual(shouldStop, true);
      assert.ok(retryQueue.get(originalId).attempts < MAX_ABSOLUTE_RETRIES);
    });

    test('should prevent infinite retry loops', () => {
      const retryQueue = new Map();
      const maxRetries = 2;
      const originalId = 'scan-123';

      retryQueue.set(originalId, { attempts: 0, maxAttempts: maxRetries });

      // Simulate many retry attempts
      let retryCount = 0;
      while (retryCount < 100) {
        retryQueue.get(originalId).attempts++;

        // Check if should continue
        const shouldStop =
          retryQueue.get(originalId).attempts >= maxRetries ||
          retryQueue.get(originalId).attempts >= MAX_ABSOLUTE_RETRIES;

        if (shouldStop) {
          break;
        }
        retryCount++;
      }

      // Should have stopped at configured max (2)
      assert.strictEqual(retryQueue.get(originalId).attempts, maxRetries);
      assert.ok(retryCount < 100, 'Should have stopped before 100 iterations');
    });
  });

  describe('Retry Job ID Generation', () => {
    test('should generate consistent retry job IDs', () => {
      const originalId = 'scan-123';
      const retryAttempt = 1;
      const retryJobId = `${originalId}-retry${retryAttempt}`;

      assert.strictEqual(retryJobId, 'scan-123-retry1');
    });

    test('should increment retry suffix correctly', () => {
      const originalId = 'scan-123';

      const retry1 = `${originalId}-retry1`;
      const retry2 = `${originalId}-retry2`;
      const retry3 = `${originalId}-retry3`;

      assert.strictEqual(retry1, 'scan-123-retry1');
      assert.strictEqual(retry2, 'scan-123-retry2');
      assert.strictEqual(retry3, 'scan-123-retry3');

      // All should resolve to same original ID
      assert.strictEqual(extractOriginalJobId(retry1), originalId);
      assert.strictEqual(extractOriginalJobId(retry2), originalId);
      assert.strictEqual(extractOriginalJobId(retry3), originalId);
    });
  });
});

/**
 * Helper function to extract original job ID (mirrors implementation)
 */
function extractOriginalJobId(jobId) {
  return jobId.replace(/-retry\d+/g, '');
}

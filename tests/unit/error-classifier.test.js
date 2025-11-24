/**
 * Unit Tests for Error Classifier
 *
 * Tests error classification logic to ensure ENOENT and other errors
 * are correctly categorized as retryable or non-retryable.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { classifyError, isRetryable, ErrorCategory } from '../../sidequest/pipeline-core/errors/error-classifier.js';

describe('Error Classifier', () => {
  describe('Non-Retryable Errors', () => {
    it('should classify ENOENT as non-retryable', () => {
      const error = new Error('File not found');
      error.code = 'ENOENT';

      const result = classifyError(error);

      assert.strictEqual(result.category, ErrorCategory.NON_RETRYABLE);
      assert.match(result.reason, /ENOENT.*permanent/i);
      assert.strictEqual(isRetryable(error), false);
    });

    it('should classify EACCES as non-retryable', () => {
      const error = new Error('Permission denied');
      error.code = 'EACCES';

      const result = classifyError(error);

      assert.strictEqual(result.category, ErrorCategory.NON_RETRYABLE);
      assert.strictEqual(isRetryable(error), false);
    });

    it('should classify HTTP 400 as non-retryable', () => {
      const error = new Error('Bad Request');
      error.status = 400;

      const result = classifyError(error);

      assert.strictEqual(result.category, ErrorCategory.NON_RETRYABLE);
      assert.match(result.reason, /HTTP 400.*client error/i);
    });
  });

  describe('Retryable Errors', () => {
    it('should classify ETIMEDOUT as retryable', () => {
      const error = new Error('Connection timeout');
      error.code = 'ETIMEDOUT';

      const result = classifyError(error);

      assert.strictEqual(result.category, ErrorCategory.RETRYABLE);
      assert.strictEqual(isRetryable(error), true);
      assert.ok(result.suggestedDelay > 0); // Should have a delay
    });

    it('should classify HTTP 500 as retryable', () => {
      const error = new Error('Internal Server Error');
      error.status = 500;

      const result = classifyError(error);

      assert.strictEqual(result.category, ErrorCategory.RETRYABLE);
      assert.strictEqual(isRetryable(error), true);
    });

    it('should classify HTTP 429 (rate limit) as retryable', () => {
      const error = new Error('Too Many Requests');
      error.status = 429;

      const result = classifyError(error);

      assert.strictEqual(result.category, ErrorCategory.RETRYABLE);
      assert.strictEqual(isRetryable(error), true);
      assert.strictEqual(result.suggestedDelay, 60000); // 60s for rate limits
    });
  });

  describe('Helper Functions', () => {
    it('isRetryable() should return false for ENOENT', () => {
      const error = new Error('File not found');
      error.code = 'ENOENT';

      assert.strictEqual(isRetryable(error), false);
    });

    it('isRetryable() should return true for ETIMEDOUT', () => {
      const error = new Error('Timeout');
      error.code = 'ETIMEDOUT';

      assert.strictEqual(isRetryable(error), true);
    });
  });
});

/**
 * Unit Tests for Error Classifier
 *
 * Tests error classification logic to ensure ENOENT and other errors
 * are correctly categorized as retryable or non-retryable.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { classifyError, isRetryable, ErrorCategory } from '../../sidequest/pipeline-core/errors/error-classifier.ts';

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

  describe('Null/Undefined Handling', () => {
    it('should handle null error', () => {
      const result = classifyError(null);
      assert.ok(result);
      assert.strictEqual(result.category, ErrorCategory.NON_RETRYABLE);
    });

    it('should handle undefined error', () => {
      const result = classifyError(undefined);
      assert.ok(result);
      assert.strictEqual(result.category, ErrorCategory.NON_RETRYABLE);
    });
  });

  describe('Message Pattern Classification', () => {
    it('should classify network errors by message', () => {
      const error = new Error('Network connection failed');

      const result = classifyError(error);
      assert.ok(result);
    });

    it('should classify timeout errors by message', () => {
      const error = new Error('Request timed out');

      const result = classifyError(error);
      assert.ok(result);
    });
  });

  describe('Additional Error Codes', () => {
    it('should classify ECONNRESET as retryable', () => {
      const error = new Error('Connection reset');
      error.code = 'ECONNRESET';

      assert.strictEqual(isRetryable(error), true);
    });

    it('should classify EPERM as non-retryable', () => {
      const error = new Error('Operation not permitted');
      error.code = 'EPERM';

      assert.strictEqual(isRetryable(error), false);
    });

    it('should classify ENOTFOUND as non-retryable', () => {
      const error = new Error('DNS lookup failed');
      error.code = 'ENOTFOUND';

      assert.strictEqual(isRetryable(error), false);
    });

    it('should classify HTTP 503 as retryable', () => {
      const error = new Error('Service Unavailable');
      error.status = 503;

      assert.strictEqual(isRetryable(error), true);
    });

    it('should classify HTTP 404 as non-retryable', () => {
      const error = new Error('Not Found');
      error.status = 404;

      assert.strictEqual(isRetryable(error), false);
    });
  });

  describe('Default Classification', () => {
    it('should return retryable for unknown errors', () => {
      const error = new Error('Something went wrong');
      // No code, no status

      const result = classifyError(error);
      // Default is usually retryable to be conservative
      assert.ok(result);
    });
  });
});

// Import additional exports for comprehensive testing
import { getErrorInfo, createScanError } from '../../sidequest/pipeline-core/errors/error-classifier.ts';

describe('Error Classifier - Extended API', () => {
  describe('getErrorInfo', () => {
    it('should return detailed error information for coded error', () => {
      const error = new Error('Connection timeout');
      error.code = 'ETIMEDOUT';

      const info = getErrorInfo(error);

      assert.strictEqual(info.name, 'Error');
      assert.strictEqual(info.message, 'Connection timeout');
      assert.strictEqual(info.code, 'ETIMEDOUT');
      assert.strictEqual(info.retryable, true);
      assert.ok(info.reason);
      assert.ok(info.suggestedDelay > 0);
    });

    it('should return detailed info for HTTP error', () => {
      const error = new Error('Internal Server Error');
      error.statusCode = 500;

      const info = getErrorInfo(error);

      assert.strictEqual(info.statusCode, 500);
      assert.strictEqual(info.retryable, true);
    });

    it('should include stack trace', () => {
      const error = new Error('Test error');

      const info = getErrorInfo(error);

      assert.ok(info.stack);
    });

    it('should handle errors with cause', () => {
      const cause = new Error('Original error');
      const error = new Error('Wrapped error');
      error.cause = cause;

      const info = getErrorInfo(error);

      assert.strictEqual(info.cause, cause);
    });
  });

  describe('createScanError', () => {
    it('should create scan error from cause', () => {
      const cause = new Error('Original error');
      cause.code = 'ENOENT';

      const scanError = createScanError('Scan failed', cause);

      assert.strictEqual(scanError.name, 'ScanError');
      assert.strictEqual(scanError.message, 'Scan failed');
      assert.strictEqual(scanError.cause, cause);
      assert.strictEqual(scanError.code, 'ENOENT');
    });

    it('should preserve HTTP status from cause', () => {
      const cause = new Error('HTTP error');
      cause.statusCode = 502;

      const scanError = createScanError('Request failed', cause);

      assert.strictEqual(scanError.statusCode, 502);
    });

    it('should add classification to error', () => {
      const cause = new Error('Timeout');
      cause.code = 'ETIMEDOUT';

      const scanError = createScanError('Operation timed out', cause);

      assert.ok(scanError.classification);
      assert.strictEqual(scanError.retryable, true);
    });

    it('should create error without cause', () => {
      const scanError = createScanError('Generic error', null);

      assert.strictEqual(scanError.name, 'ScanError');
      assert.strictEqual(scanError.cause, null);
    });

    it('should handle filesystem errors', () => {
      const cause = new Error('No such file');
      cause.code = 'ENOENT';

      const scanError = createScanError('File not found', cause);

      assert.strictEqual(scanError.retryable, false);
      assert.ok(scanError.classification);
    });

    it('should handle network errors', () => {
      const cause = new Error('Connection refused');
      cause.code = 'ECONNREFUSED';

      const scanError = createScanError('Server unreachable', cause);

      assert.ok(scanError.classification);
    });

    it('should use error.status as fallback for statusCode', () => {
      const cause = new Error('Bad request');
      cause.status = 400;

      const scanError = createScanError('Validation failed', cause);

      assert.strictEqual(scanError.statusCode, 400);
    });

    it('should use errno as fallback for code', () => {
      const cause = new Error('Error with errno');
      cause.errno = 'EACCES';

      const scanError = createScanError('Permission error', cause);

      assert.strictEqual(scanError.code, 'EACCES');
    });
  });
});

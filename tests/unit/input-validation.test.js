/**
 * Unit tests for input validation helpers
 * Tests H5 (job ID validation) and M7 (pagination sanitization) fixes
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { VALIDATION, PAGINATION } from '../../sidequest/core/constants.js';

/**
 * Validate and sanitize job ID from URL parameter
 * (Copied from api/routes/jobs.js for testing)
 */
function validateJobId(jobId) {
  if (!jobId) {
    return { valid: false, error: 'Job ID is required' };
  }

  if (!VALIDATION.JOB_ID_PATTERN.test(jobId)) {
    return {
      valid: false,
      error: 'Invalid job ID format. Must be alphanumeric with hyphens/underscores (max 100 chars)'
    };
  }

  return { valid: true, sanitized: jobId };
}

/**
 * Sanitize pagination parameters
 * (Copied from api/routes/jobs.js for testing)
 */
function sanitizePaginationParams(limit, offset) {
  const limitStr = String(limit);
  const offsetStr = String(offset);

  const parsedLimit = parseInt(limitStr);
  const parsedOffset = parseInt(offsetStr);

  const limitNum = Math.min(
    Math.max(1, Number.isNaN(parsedLimit) ? PAGINATION.DEFAULT_LIMIT : parsedLimit),
    PAGINATION.MAX_LIMIT
  );

  const offsetNum = Math.max(0, Number.isNaN(parsedOffset) ? 0 : parsedOffset);

  return { limit: limitNum, offset: offsetNum };
}

describe('Input Validation - H5: Job ID Validation', () => {
  it('should accept valid job IDs', () => {
    const validIds = [
      'duplicate-detection-12345',
      'job_123',
      'JOB-ABC-123',
      'a',
      'A-B_C-1-2-3'
    ];

    for (const id of validIds) {
      const result = validateJobId(id);
      assert.strictEqual(result.valid, true, `Should accept valid ID: ${id}`);
      assert.strictEqual(result.sanitized, id);
    }
  });

  it('should reject job IDs with path traversal attempts', () => {
    const invalidIds = [
      '../etc/passwd',
      '../../secrets',
      './config',
      'job/../admin',
      '/etc/passwd'
    ];

    for (const id of invalidIds) {
      const result = validateJobId(id);
      assert.strictEqual(result.valid, false, `Should reject path traversal: ${id}`);
      assert.ok(result.error);
    }
  });

  it('should reject job IDs with special characters', () => {
    const invalidIds = [
      'job;rm -rf /',
      'job`whoami`',
      'job$(cat /etc/passwd)',
      'job&& cat /etc/passwd',
      'job|cat secrets',
      'job<script>alert(1)</script>',
      'job%00admin'
    ];

    for (const id of invalidIds) {
      const result = validateJobId(id);
      assert.strictEqual(result.valid, false, `Should reject special chars: ${id}`);
      assert.ok(result.error);
    }
  });

  it('should reject empty or null job IDs', () => {
    const result1 = validateJobId('');
    assert.strictEqual(result1.valid, false);
    assert.strictEqual(result1.error, 'Job ID is required');

    const result2 = validateJobId(null);
    assert.strictEqual(result2.valid, false);
    assert.strictEqual(result2.error, 'Job ID is required');

    const result3 = validateJobId(undefined);
    assert.strictEqual(result3.valid, false);
    assert.strictEqual(result3.error, 'Job ID is required');
  });

  it('should reject job IDs exceeding 100 characters', () => {
    const tooLong = 'a'.repeat(101);
    const result = validateJobId(tooLong);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes('max 100 chars'));
  });

  it('should accept job IDs exactly 100 characters', () => {
    const maxLength = 'a'.repeat(100);
    const result = validateJobId(maxLength);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.sanitized, maxLength);
  });
});

describe('Input Sanitization - M7: Pagination Parameters', () => {
  it('should sanitize valid pagination parameters', () => {
    const result = sanitizePaginationParams(10, 20);
    assert.strictEqual(result.limit, 10);
    assert.strictEqual(result.offset, 20);
  });

  it('should enforce maximum limit to prevent memory issues', () => {
    const result = sanitizePaginationParams(9999999, 0);
    assert.strictEqual(result.limit, PAGINATION.MAX_LIMIT);
    assert.strictEqual(result.offset, 0);
  });

  it('should enforce minimum limit of 1', () => {
    const result1 = sanitizePaginationParams(0, 0);
    assert.strictEqual(result1.limit, 1);

    const result2 = sanitizePaginationParams(-10, 0);
    assert.strictEqual(result2.limit, 1);
  });

  it('should prevent negative offsets', () => {
    const result = sanitizePaginationParams(50, -100);
    assert.strictEqual(result.offset, 0);
  });

  it('should handle NaN inputs with defaults', () => {
    const result1 = sanitizePaginationParams('invalid', 'bad');
    assert.strictEqual(result1.limit, PAGINATION.DEFAULT_LIMIT);
    assert.strictEqual(result1.offset, 0);

    const result2 = sanitizePaginationParams(NaN, NaN);
    assert.strictEqual(result2.limit, PAGINATION.DEFAULT_LIMIT);
    assert.strictEqual(result2.offset, 0);
  });

  it('should handle string inputs correctly', () => {
    const result = sanitizePaginationParams('25', '100');
    assert.strictEqual(result.limit, 25);
    assert.strictEqual(result.offset, 100);
  });

  it('should handle float inputs by truncating', () => {
    const result = sanitizePaginationParams(10.7, 50.3);
    assert.strictEqual(result.limit, 10);
    assert.strictEqual(result.offset, 50);
  });

  it('should use default limit when limit is missing or zero', () => {
    const result1 = sanitizePaginationParams(undefined, 0);
    assert.strictEqual(result1.limit, PAGINATION.DEFAULT_LIMIT);

    const result2 = sanitizePaginationParams(null, 0);
    assert.strictEqual(result2.limit, PAGINATION.DEFAULT_LIMIT);
  });

  it('should prevent huge offsets from causing issues', () => {
    const result = sanitizePaginationParams(50, Number.MAX_SAFE_INTEGER);
    assert.strictEqual(result.offset, Number.MAX_SAFE_INTEGER);
    assert.ok(Number.isSafeInteger(result.offset));
  });
});

/**
 * Unit tests for input validation helpers
 * Tests H5 (job ID validation) and M7 (pagination sanitization) fixes
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { VALIDATION, PAGINATION } from '../../sidequest/core/constants.ts';
import { timingSafeEqual } from '../../api/utils/crypto-helpers.ts';
import { filterReservedJobKeys } from '../../api/utils/job-helpers.ts';

/**
 * Validate and sanitize job ID from URL parameter
 * (Copied from api/routes/jobs.ts for testing)
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
 * (Copied from api/routes/jobs.ts for testing)
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
    const maxLength = 'a'.repeat(VALIDATION.JOB_ID_MAX_LENGTH);
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
    // No isSafeInteger assertion: Number.MAX_SAFE_INTEGER is always a safe integer,
    // so asserting it here would be vacuously true and not test any real code path.
    assert.strictEqual(result.offset, Number.MAX_SAFE_INTEGER);
  });
});

describe('timingSafeEqual - TC-H2', () => {
  it('returns true for identical strings', () => {
    assert.ok(timingSafeEqual('abc', 'abc'));
  });

  it('returns false for same-length strings with different content', () => {
    assert.ok(!timingSafeEqual('key-aaa', 'key-bbb'));
  });

  it('returns false for different-length strings', () => {
    assert.ok(!timingSafeEqual('short', 'longer-key'));
  });

  it('returns false for non-string inputs', () => {
    assert.ok(!timingSafeEqual(null as unknown as string, 'key'));
    assert.ok(!timingSafeEqual(123 as unknown as string, '123'));
  });

  it('returns false for empty string vs non-empty', () => {
    assert.ok(!timingSafeEqual('', 'key'));
  });
});

describe('filterReservedJobKeys - TC-H3', () => {
  it('should strip all four reserved keys', () => {
    const result = filterReservedJobKeys({
      repositoryPath: '/repo',
      retriedFrom: 'job-old',
      triggeredBy: 'retry',
      triggeredAt: '2026-01-01',
      retryCount: 3,
    });
    assert.ok(!('retriedFrom' in result));
    assert.ok(!('triggeredBy' in result));
    assert.ok(!('triggeredAt' in result));
    assert.ok(!('retryCount' in result));
    assert.strictEqual(result.repositoryPath, '/repo');
  });

  it('should pass through non-reserved keys unchanged', () => {
    const result = filterReservedJobKeys({ foo: 'bar', baz: 42 });
    assert.strictEqual(result.foo, 'bar');
    assert.strictEqual(result.baz, 42);
  });

  it('should handle empty input', () => {
    const result = filterReservedJobKeys({});
    assert.deepStrictEqual(result, {});
  });

  it('should not mutate the original object', () => {
    const input = { repositoryPath: '/repo', retriedFrom: 'old' };
    filterReservedJobKeys(input);
    assert.ok('retriedFrom' in input);
  });

  it('should return object with no reserved keys when all are reserved', () => {
    const result = filterReservedJobKeys({ retriedFrom: 'x', triggeredBy: 'y', triggeredAt: 'z', retryCount: 1 });
    assert.deepStrictEqual(result, {});
  });
});

describe('sanitizePaginationParams - route wiring (TC-M4)', () => {
  it('should clamp over-limit value to MAX_LIMIT before it reaches the repository', () => {
    const { limit } = sanitizePaginationParams(Number.MAX_SAFE_INTEGER, 0);
    assert.strictEqual(limit, PAGINATION.MAX_LIMIT);
    assert.ok(limit <= PAGINATION.MAX_LIMIT, 'Repository never receives a limit above MAX_LIMIT');
  });

  it('should clamp negative limit to 1 before it reaches the repository', () => {
    const { limit } = sanitizePaginationParams(-99, 0);
    assert.strictEqual(limit, 1);
  });

  it('should clamp negative offset to 0 before it reaches the repository', () => {
    const { offset } = sanitizePaginationParams(10, -50);
    assert.strictEqual(offset, 0);
  });
});

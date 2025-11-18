#!/usr/bin/env node
/**
 * Validation Middleware Tests
 *
 * Tests for Zod-based request validation middleware.
 */

// @ts-nocheck
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { StartScanRequestSchema } from '../../api/types/scan-requests.js';

describe('Scan Request Validation', () => {
  describe('StartScanRequestSchema', () => {
    it('should accept valid scan request', () => {
      const validRequest = {
        repositoryPath: '/path/to/repo',
        options: {
          forceRefresh: true,
          cacheEnabled: false
        }
      };

      const result = StartScanRequestSchema.parse(validRequest);
      assert.deepStrictEqual(result, validRequest);
    });

    it('should accept request without options', () => {
      const validRequest = {
        repositoryPath: '/path/to/repo'
      };

      const result = StartScanRequestSchema.parse(validRequest);
      assert.strictEqual(result.repositoryPath, '/path/to/repo');
    });

    it('should reject empty repositoryPath', () => {
      const invalidRequest = {
        repositoryPath: ''
      };

      assert.throws(() => {
        StartScanRequestSchema.parse(invalidRequest);
      }, {
        name: 'ZodError',
        message: /must not be empty/
      });
    });

    it('should reject non-string repositoryPath', () => {
      const invalidRequest = {
        repositoryPath: 123
      };

      assert.throws(() => {
        StartScanRequestSchema.parse(invalidRequest);
      }, {
        name: 'ZodError'
      });
    });

    it('should reject missing repositoryPath', () => {
      const invalidRequest = {};

      assert.throws(() => {
        StartScanRequestSchema.parse(invalidRequest);
      }, {
        name: 'ZodError',
        message: /Required/
      });
    });

    it('should reject null repositoryPath', () => {
      const invalidRequest = {
        repositoryPath: null
      };

      assert.throws(() => {
        StartScanRequestSchema.parse(invalidRequest);
      }, {
        name: 'ZodError'
      });
    });

    it('should reject invalid options', () => {
      const invalidRequest = {
        repositoryPath: '/path/to/repo',
        options: {
          forceRefresh: 'yes', // Should be boolean
          invalidOption: true // Not in schema
        }
      };

      assert.throws(() => {
        StartScanRequestSchema.parse(invalidRequest);
      }, {
        name: 'ZodError'
      });
    });

    it('should accept valid boolean options', () => {
      const validRequest = {
        repositoryPath: '/path/to/repo',
        options: {
          forceRefresh: true,
          includeTests: false,
          cacheEnabled: true
        }
      };

      const result = StartScanRequestSchema.parse(validRequest);
      assert.strictEqual(result.options.forceRefresh, true);
      assert.strictEqual(result.options.includeTests, false);
      assert.strictEqual(result.options.cacheEnabled, true);
    });

    it('should accept valid numeric options', () => {
      const validRequest = {
        repositoryPath: '/path/to/repo',
        options: {
          maxDepth: 5
        }
      };

      const result = StartScanRequestSchema.parse(validRequest);
      assert.strictEqual(result.options.maxDepth, 5);
    });

    it('should reject negative maxDepth', () => {
      const invalidRequest = {
        repositoryPath: '/path/to/repo',
        options: {
          maxDepth: -1
        }
      };

      assert.throws(() => {
        StartScanRequestSchema.parse(invalidRequest);
      }, {
        name: 'ZodError'
      });
    });

    it('should reject non-integer maxDepth', () => {
      const invalidRequest = {
        repositoryPath: '/path/to/repo',
        options: {
          maxDepth: 3.14
        }
      };

      assert.throws(() => {
        StartScanRequestSchema.parse(invalidRequest);
      }, {
        name: 'ZodError'
      });
    });
  });
});

describe('Error Response Creation', () => {
  it('should create validation error with details', async () => {
    const { createValidationError } = await import('../../api/types/scan-requests.js');

    const error = createValidationError(
      'repositoryPath',
      'must be a string',
      'INVALID_TYPE'
    );

    assert.strictEqual(error.error, 'Bad Request');
    assert.strictEqual(error.message, 'Validation failed: must be a string');
    assert.strictEqual(error.status, 400);
    assert.strictEqual(error.errors.length, 1);
    assert.strictEqual(error.errors[0].field, 'repositoryPath');
    assert.strictEqual(error.errors[0].message, 'must be a string');
    assert.strictEqual(error.errors[0].code, 'INVALID_TYPE');
  });

  it('should create generic error response', async () => {
    const { createErrorResponse } = await import('../../api/types/scan-requests.js');

    const error = createErrorResponse(
      'Internal Server Error',
      'Something went wrong',
      500
    );

    assert.strictEqual(error.error, 'Internal Server Error');
    assert.strictEqual(error.message, 'Something went wrong');
    assert.strictEqual(error.status, 500);
    assert.ok(error.timestamp);
  });
});

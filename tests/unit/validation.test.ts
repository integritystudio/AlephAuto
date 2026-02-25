#!/usr/bin/env node
/**
 * Validation Middleware Tests
 *
 * Tests for Zod-based request validation middleware.
 */

// @ts-nocheck
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { StartScanRequestSchema } from '../../api/types/scan-requests.ts';

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
    const { createValidationError } = await import('../../api/types/scan-requests.ts');

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
    const { createErrorResponse } = await import('../../api/types/scan-requests.ts');

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

import { z } from 'zod';
import { validateRequest, validateQuery, validateParams } from '../../api/middleware/validation.ts';

describe('Validation Middleware', () => {
  // Test schema
  const TestSchema = z.object({
    name: z.string().min(1),
    value: z.number().int().positive()
  }).strict();

  // Helper to create mock request/response
  function createMocks(data, type = 'body') {
    const req = {
      body: type === 'body' ? data : {},
      query: type === 'query' ? data : {},
      params: type === 'params' ? data : {},
      path: '/test',
      method: 'POST'
    };
    const res = {
      statusCode: 200,
      responseData: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.responseData = data;
        return this;
      }
    };
    let nextCalled = false;
    let nextError = null;
    const next = (err) => {
      nextCalled = true;
      nextError = err;
    };
    return { req, res, next, wasNextCalled: () => nextCalled, getNextError: () => nextError };
  }

  describe('validateRequest', () => {
    it('should pass valid request body to next', () => {
      const middleware = validateRequest(TestSchema);
      const { req, res, next, wasNextCalled } = createMocks({ name: 'test', value: 42 });

      middleware(req, res, next);

      assert.ok(wasNextCalled());
      assert.strictEqual(req.body.name, 'test');
      assert.strictEqual(req.body.value, 42);
    });

    it('should return 400 for invalid request body', () => {
      const middleware = validateRequest(TestSchema);
      const { req, res, next, wasNextCalled } = createMocks({ name: '', value: -1 });

      middleware(req, res, next);

      assert.ok(!wasNextCalled());
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.responseData.error, 'Bad Request');
      assert.strictEqual(res.responseData.message, 'Request validation failed');
      assert.ok(Array.isArray(res.responseData.errors));
      assert.ok(res.responseData.timestamp);
    });

    it('should include field names in error response', () => {
      const middleware = validateRequest(TestSchema);
      const { req, res, next } = createMocks({ name: 123, value: 'not a number' });

      middleware(req, res, next);

      assert.strictEqual(res.statusCode, 400);
      const errors = res.responseData.errors;
      assert.ok(errors.some(e => e.field === 'name'));
      assert.ok(errors.some(e => e.field === 'value'));
    });

    it('should reject extra fields in strict mode', () => {
      const middleware = validateRequest(TestSchema);
      const { req, res, next, wasNextCalled } = createMocks({ name: 'test', value: 42, extra: 'field' });

      middleware(req, res, next);

      assert.ok(!wasNextCalled());
      assert.strictEqual(res.statusCode, 400);
    });

    it('should pass non-Zod errors to next', () => {
      // Create a schema that throws a non-Zod error
      const BrokenSchema = {
        parse() {
          throw new Error('Something unexpected');
        }
      };
      const middleware = validateRequest(BrokenSchema);
      const { req, res, next, wasNextCalled, getNextError } = createMocks({ any: 'data' });

      middleware(req, res, next);

      assert.ok(wasNextCalled());
      assert.ok(getNextError() instanceof Error);
      assert.strictEqual(getNextError().message, 'Something unexpected');
    });
  });

  describe('validateQuery', () => {
    const QuerySchema = z.object({
      limit: z.coerce.number().int().positive().optional(),
      format: z.enum(['json', 'html']).optional()
    });

    it('should pass valid query parameters', () => {
      const middleware = validateQuery(QuerySchema);
      const { req, res, next, wasNextCalled } = createMocks({ limit: '10', format: 'json' }, 'query');

      middleware(req, res, next);

      assert.ok(wasNextCalled());
      assert.strictEqual(req.validatedQuery.limit, 10);
      assert.strictEqual(req.validatedQuery.format, 'json');
    });

    it('should return 400 for invalid query parameters', () => {
      const middleware = validateQuery(QuerySchema);
      const { req, res, next, wasNextCalled } = createMocks({ limit: 'not-a-number' }, 'query');

      middleware(req, res, next);

      assert.ok(!wasNextCalled());
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.responseData.message, 'Query parameter validation failed');
    });

    it('should store validated data in req.validatedQuery', () => {
      const middleware = validateQuery(QuerySchema);
      const { req, res, next } = createMocks({ limit: '5' }, 'query');

      middleware(req, res, next);

      assert.ok(req.validatedQuery);
      assert.strictEqual(req.validatedQuery.limit, 5);
    });

    it('should pass non-Zod errors to next', () => {
      const BrokenSchema = {
        parse() {
          throw new Error('Query schema error');
        }
      };
      const middleware = validateQuery(BrokenSchema);
      const { req, res, next, wasNextCalled, getNextError } = createMocks({}, 'query');

      middleware(req, res, next);

      assert.ok(wasNextCalled());
      assert.ok(getNextError());
    });
  });

  describe('validateParams', () => {
    const ParamsSchema = z.object({
      id: z.string().uuid(),
      type: z.enum(['scan', 'report'])
    });

    it('should pass valid path parameters', () => {
      const middleware = validateParams(ParamsSchema);
      const { req, res, next, wasNextCalled } = createMocks(
        { id: '550e8400-e29b-41d4-a716-446655440000', type: 'scan' },
        'params'
      );

      middleware(req, res, next);

      assert.ok(wasNextCalled());
      assert.strictEqual(req.params.type, 'scan');
    });

    it('should return 400 for invalid path parameters', () => {
      const middleware = validateParams(ParamsSchema);
      const { req, res, next, wasNextCalled } = createMocks(
        { id: 'not-a-uuid', type: 'invalid' },
        'params'
      );

      middleware(req, res, next);

      assert.ok(!wasNextCalled());
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.responseData.message, 'Path parameter validation failed');
    });

    it('should include error details in response', () => {
      const middleware = validateParams(ParamsSchema);
      const { req, res, next } = createMocks({ id: 'bad', type: 'wrong' }, 'params');

      middleware(req, res, next);

      assert.strictEqual(res.statusCode, 400);
      assert.ok(res.responseData.errors.length >= 1);
      assert.ok(res.responseData.errors.every(e => e.field && e.message && e.code));
    });

    it('should pass non-Zod errors to next', () => {
      const BrokenSchema = {
        parse() {
          throw new Error('Params schema error');
        }
      };
      const middleware = validateParams(BrokenSchema);
      const { req, res, next, wasNextCalled, getNextError } = createMocks({}, 'params');

      middleware(req, res, next);

      assert.ok(wasNextCalled());
      assert.ok(getNextError());
    });
  });
});

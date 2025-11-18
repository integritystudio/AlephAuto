/**
 * Unit Tests for Pipeline API Type Definitions
 *
 * Validates Zod schemas for pipeline endpoints work correctly
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  JobStatusSchema,
  JobQueryParamsSchema,
  JobDetailsSchema,
  JobsListResponseSchema,
  PipelineDetailsSchema,
  ManualTriggerRequestSchema,
  ManualTriggerResponseSchema,
  ErrorResponseSchema,
  ValidationErrorResponseSchema,
  createErrorResponse,
  createValidationErrorResponse
} from '../../api/types/pipeline-requests.js';

describe('Pipeline Type Schemas', () => {
  describe('JobStatusSchema', () => {
    it('should accept valid job statuses', () => {
      const validStatuses = ['queued', 'running', 'completed', 'failed'];
      validStatuses.forEach(status => {
        const result = JobStatusSchema.safeParse(status);
        assert.strictEqual(result.success, true, `${status} should be valid`);
      });
    });

    it('should reject invalid job statuses', () => {
      const invalidStatuses = ['pending', 'cancelled', 'invalid'];
      invalidStatuses.forEach(status => {
        const result = JobStatusSchema.safeParse(status);
        assert.strictEqual(result.success, false, `${status} should be invalid`);
      });
    });
  });

  describe('JobQueryParamsSchema', () => {
    it('should accept valid query parameters', () => {
      const validParams = {
        status: 'running',
        limit: 10,
        offset: 0,
        tab: 'recent'
      };
      const result = JobQueryParamsSchema.safeParse(validParams);
      assert.strictEqual(result.success, true);
    });

    it('should apply default values', () => {
      const result = JobQueryParamsSchema.parse({});
      assert.strictEqual(result.limit, 10);
      assert.strictEqual(result.offset, 0);
    });

    it('should coerce string numbers to integers', () => {
      const result = JobQueryParamsSchema.parse({
        limit: '5',
        offset: '10'
      });
      assert.strictEqual(result.limit, 5);
      assert.strictEqual(result.offset, 10);
    });

    it('should reject limit above 100', () => {
      const result = JobQueryParamsSchema.safeParse({ limit: 150 });
      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.ok(result.error.errors[0].message.includes('100'));
      }
    });

    it('should reject negative offset', () => {
      const result = JobQueryParamsSchema.safeParse({ offset: -5 });
      assert.strictEqual(result.success, false);
    });

    it('should reject extra fields (strict mode)', () => {
      const result = JobQueryParamsSchema.safeParse({
        limit: 10,
        extraField: 'invalid'
      });
      assert.strictEqual(result.success, false);
    });
  });

  describe('JobDetailsSchema', () => {
    it('should accept valid job details', () => {
      const validJob = {
        id: 'job-123',
        pipelineId: 'duplicate-detection',
        status: 'completed',
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        duration: 5000,
        parameters: {
          repositoryPath: '/path/to/repo'
        },
        result: {
          output: 'Success',
          stats: {
            filesScanned: 42,
            duplicatesFound: 3,
            success: true
          }
        }
      };
      const result = JobDetailsSchema.safeParse(validJob);
      assert.strictEqual(result.success, true);
    });

    it('should accept minimal job details', () => {
      const minimalJob = {
        id: 'job-123',
        pipelineId: 'test',
        status: 'queued',
        startTime: new Date().toISOString()
      };
      const result = JobDetailsSchema.safeParse(minimalJob);
      assert.strictEqual(result.success, true);
    });

    it('should reject invalid ISO 8601 timestamps', () => {
      const invalidJob = {
        id: 'job-123',
        pipelineId: 'test',
        status: 'running',
        startTime: 'invalid-date'
      };
      const result = JobDetailsSchema.safeParse(invalidJob);
      assert.strictEqual(result.success, false);
    });

    it('should reject negative duration', () => {
      const invalidJob = {
        id: 'job-123',
        pipelineId: 'test',
        status: 'completed',
        startTime: new Date().toISOString(),
        duration: -100
      };
      const result = JobDetailsSchema.safeParse(invalidJob);
      assert.strictEqual(result.success, false);
    });
  });

  describe('JobsListResponseSchema', () => {
    it('should accept valid jobs list response', () => {
      const validResponse = {
        pipelineId: 'duplicate-detection',
        jobs: [
          {
            id: 'job-1',
            pipelineId: 'duplicate-detection',
            status: 'completed',
            startTime: new Date().toISOString()
          }
        ],
        total: 1,
        hasMore: false,
        timestamp: new Date().toISOString()
      };
      const result = JobsListResponseSchema.safeParse(validResponse);
      assert.strictEqual(result.success, true);
    });

    it('should accept empty jobs array', () => {
      const emptyResponse = {
        pipelineId: 'test',
        jobs: [],
        total: 0,
        hasMore: false,
        timestamp: new Date().toISOString()
      };
      const result = JobsListResponseSchema.safeParse(emptyResponse);
      assert.strictEqual(result.success, true);
    });
  });

  describe('ManualTriggerRequestSchema', () => {
    it('should accept request with parameters', () => {
      const validRequest = {
        parameters: {
          repositoryPath: '/path/to/repo',
          dryRun: false
        }
      };
      const result = ManualTriggerRequestSchema.safeParse(validRequest);
      assert.strictEqual(result.success, true);
    });

    it('should accept empty request', () => {
      const result = ManualTriggerRequestSchema.safeParse({});
      assert.strictEqual(result.success, true);
    });

    it('should reject extra fields', () => {
      const invalidRequest = {
        parameters: {},
        extraField: 'invalid'
      };
      const result = ManualTriggerRequestSchema.safeParse(invalidRequest);
      assert.strictEqual(result.success, false);
    });
  });

  describe('Helper Functions', () => {
    it('createErrorResponse should create valid error', () => {
      const error = createErrorResponse('Not Found', 'Pipeline not found', 404);
      assert.strictEqual(error.error, 'Not Found');
      assert.strictEqual(error.message, 'Pipeline not found');
      assert.strictEqual(error.status, 404);
      assert.ok(error.timestamp);
    });

    it('createValidationErrorResponse should create valid validation error', () => {
      const errors = [
        {
          field: 'limit',
          message: 'Number must be less than or equal to 100',
          code: 'too_big'
        }
      ];
      const error = createValidationErrorResponse('Validation failed', errors);
      assert.strictEqual(error.error, 'Bad Request');
      assert.strictEqual(error.status, 400);
      assert.strictEqual(error.errors?.length, 1);
      assert.strictEqual(error.errors?.[0].field, 'limit');
    });
  });
});

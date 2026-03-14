/**
 * Unit Tests for Pipeline API Type Definitions
 *
 * Validates Zod schemas for pipeline endpoints work correctly
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { ZodTypeAny } from 'zod';
import { HttpStatus } from '../../shared/constants/http-status.ts';
import {
  JobStatusSchema,
  TabFilterSchema,
  JobQueryParamsSchema,
  JobResultSchema,
  GitInfoSchema,
  JobErrorSchema,
  JobDetailsSchema,
  JobsListResponseSchema,
  PipelineStatusSchema,
  PipelineDetailsSchema,
  ManualTriggerRequestSchema,
  ManualTriggerResponseSchema,
  PipelineDocsParamsSchema,
  PipelineDocsResponseSchema,
  PipelineHtmlParamsSchema,
  createErrorResponse,
  createValidationErrorResponse
} from '../../api/types/pipeline-requests.ts';
import { TestTiming } from '../constants/timing-test-constants.ts';

// --- Test helpers ---

function assertAllValid(schema: ZodTypeAny, values: unknown[]): void {
  values.forEach(v => {
    const result = schema.safeParse(v);
    assert.strictEqual(result.success, true, `expected valid: ${JSON.stringify(v)}`);
  });
}

function assertAllInvalid(schema: ZodTypeAny, values: unknown[]): void {
  values.forEach(v => {
    const result = schema.safeParse(v);
    assert.strictEqual(result.success, false, `expected invalid: ${JSON.stringify(v)}`);
  });
}

function assertAccepts(schema: ZodTypeAny, value: unknown): void {
  assert.strictEqual(schema.safeParse(value).success, true);
}

function assertRejects(schema: ZodTypeAny, value: unknown): void {
  assert.strictEqual(schema.safeParse(value).success, false);
}

function assertStrictRejectsExtra(schema: ZodTypeAny, base: Record<string, unknown>): void {
  assertRejects(schema, { ...base, extra: true });
}

function assertPassthrough(
  schema: ZodTypeAny,
  base: Record<string, unknown>,
  extraKey: string,
  extraValue: unknown
): void {
  const parsed = schema.parse({ ...base, [extraKey]: extraValue }) as Record<string, unknown>;
  assert.strictEqual(parsed[extraKey], extraValue);
}

// --- Tests ---

describe('Pipeline Type Schemas', () => {
  describe('JobStatusSchema', () => {
    it('should accept valid job statuses', () =>
      assertAllValid(JobStatusSchema, ['queued', 'running', 'completed', 'failed']));

    it('should reject invalid job statuses', () =>
      assertAllInvalid(JobStatusSchema, ['pending', 'cancelled', 'invalid']));
  });

  describe('TabFilterSchema', () => {
    it('should accept valid tab filters', () =>
      assertAllValid(TabFilterSchema, ['recent', 'failed', 'all']));

    it('should reject invalid tab filters', () =>
      assertAllInvalid(TabFilterSchema, ['active', 'completed', '']));
  });

  describe('PipelineStatusSchema', () => {
    it('should accept valid pipeline statuses', () =>
      assertAllValid(PipelineStatusSchema, ['idle', 'running', 'error', 'completed']));

    it('should reject invalid pipeline statuses', () =>
      assertAllInvalid(PipelineStatusSchema, ['queued', 'failed', 'paused']));
  });

  describe('JobQueryParamsSchema', () => {
    it('should accept valid query parameters', () =>
      assertAccepts(JobQueryParamsSchema, { status: 'running', limit: 10, offset: 0, tab: 'recent' }));

    it('should apply default values', () => {
      const result = JobQueryParamsSchema.parse({});
      assert.strictEqual(result.limit, 10);
      assert.strictEqual(result.offset, 0);
    });

    it('should coerce string numbers to integers', () => {
      const result = JobQueryParamsSchema.parse({ limit: '5', offset: '10' });
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

    it('should reject negative offset', () => assertRejects(JobQueryParamsSchema, { offset: -5 }));

    it('should reject extra fields (strict mode)', () =>
      assertStrictRejectsExtra(JobQueryParamsSchema, { limit: 10 }));
  });

  describe('JobResultSchema', () => {
    it('should accept full result with stats', () =>
      assertAccepts(JobResultSchema, {
        output: 'Done',
        error: 'warn: partial',
        stats: { filesScanned: 10, success: true, rate: 'high' }
      }));

    it('should accept empty object', () => assertAccepts(JobResultSchema, {}));

    it('should allow passthrough fields', () =>
      assertPassthrough(JobResultSchema, { output: 'ok' }, 'customField', 42));
  });

  describe('GitInfoSchema', () => {
    it('should accept full git info', () =>
      assertAccepts(GitInfoSchema, {
        branch: 'feat/test',
        commit: 'abc123',
        pr: '#42',
        repository: '/path/to/repo'
      }));

    it('should accept empty object', () => assertAccepts(GitInfoSchema, {}));

    it('should allow passthrough fields', () =>
      assertPassthrough(GitInfoSchema, { branch: 'main' }, 'merged', true));
  });

  describe('JobErrorSchema', () => {
    it('should accept string error', () =>
      assertAccepts(JobErrorSchema, 'Something went wrong'));

    it('should accept object error with message', () =>
      assertAccepts(JobErrorSchema, { message: 'ENOENT', stack: 'Error: ENOENT\n  at ...', code: 'ENOENT' }));

    it('should accept object error with only message', () =>
      assertAccepts(JobErrorSchema, { message: 'fail' }));

    it('should allow passthrough fields on object error', () =>
      assertPassthrough(JobErrorSchema, { message: 'fail' }, 'retryable', true));

    it('should reject number', () => assertRejects(JobErrorSchema, 42));

    it('should reject object without message', () => assertRejects(JobErrorSchema, { code: 'ERR' }));
  });

  describe('JobDetailsSchema', () => {
    const baseJob = {
      id: 'job-123',
      pipelineId: 'test',
      status: 'queued',
      startTime: new Date().toISOString()
    };

    it('should accept valid job details', () =>
      assertAccepts(JobDetailsSchema, {
        ...baseJob,
        pipelineId: 'duplicate-detection',
        status: 'completed',
        endTime: new Date().toISOString(),
        duration: TestTiming.JOB_COMPLETION_OFFSET_MS,
        parameters: { repositoryPath: '/path/to/repo' },
        result: { output: 'Success', stats: { filesScanned: 42, duplicatesFound: 3, success: true } }
      }));

    it('should accept minimal job details', () => assertAccepts(JobDetailsSchema, baseJob));

    it('should reject invalid ISO 8601 timestamps', () =>
      assertRejects(JobDetailsSchema, { ...baseJob, startTime: 'invalid-date' }));

    it('should reject negative duration', () =>
      assertRejects(JobDetailsSchema, { ...baseJob, status: 'completed', duration: -100 }));

    it('should accept job with error string', () =>
      assertAccepts(JobDetailsSchema, { ...baseJob, status: 'failed', error: 'Process exited with code 1' }));

    it('should accept job with error object', () =>
      assertAccepts(JobDetailsSchema, { ...baseJob, status: 'failed', error: { message: 'ENOENT', code: 'ENOENT' } }));

    it('should accept job with git info', () =>
      assertAccepts(JobDetailsSchema, { ...baseJob, status: 'completed', git: { branch: 'feat/x', commit: 'abc123' } }));

    it('should accept job with createdAt', () =>
      assertAccepts(JobDetailsSchema, { ...baseJob, createdAt: new Date().toISOString() }));

    it('should allow passthrough fields', () =>
      assertPassthrough(JobDetailsSchema, baseJob, 'customMeta', 'hello'));
  });

  describe('JobsListResponseSchema', () => {
    const baseResponse = {
      pipelineId: 'test',
      jobs: [],
      total: 0,
      hasMore: false,
      timestamp: new Date().toISOString()
    };

    it('should accept valid jobs list response', () =>
      assertAccepts(JobsListResponseSchema, {
        ...baseResponse,
        pipelineId: 'duplicate-detection',
        jobs: [{
          id: 'job-1',
          pipelineId: 'duplicate-detection',
          status: 'completed',
          startTime: new Date().toISOString()
        }],
        total: 1
      }));

    it('should accept empty jobs array', () => assertAccepts(JobsListResponseSchema, baseResponse));
  });

  describe('PipelineDetailsSchema', () => {
    const basePipeline = {
      id: 'test',
      name: 'Test',
      status: 'idle',
      lastRun: null,
      nextRun: null,
      activeJobs: 0,
      completedJobs: 0,
      failedJobs: 0
    };

    it('should accept full pipeline details', () =>
      assertAccepts(PipelineDetailsSchema, {
        id: 'duplicate-detection',
        name: 'Duplicate Detection',
        status: 'idle',
        lastRun: new Date().toISOString(),
        nextRun: new Date().toISOString(),
        activeJobs: 0,
        completedJobs: 42,
        failedJobs: 3
      }));

    it('should accept null lastRun and nextRun', () => assertAccepts(PipelineDetailsSchema, basePipeline));

    it('should reject negative job counts', () =>
      assertRejects(PipelineDetailsSchema, { ...basePipeline, activeJobs: -1 }));

    it('should reject extra fields (strict mode)', () =>
      assertStrictRejectsExtra(PipelineDetailsSchema, basePipeline));

    it('should reject missing required fields', () =>
      assertRejects(PipelineDetailsSchema, { id: 'test', name: 'Test' }));
  });

  describe('ManualTriggerRequestSchema', () => {
    it('should accept request with parameters', () =>
      assertAccepts(ManualTriggerRequestSchema, { parameters: { repositoryPath: '/path/to/repo', dryRun: false } }));

    it('should accept empty request', () => assertAccepts(ManualTriggerRequestSchema, {}));

    it('should reject extra fields', () =>
      assertStrictRejectsExtra(ManualTriggerRequestSchema, { parameters: {} }));
  });

  describe('ManualTriggerResponseSchema', () => {
    const baseResponse = {
      jobId: 'job-abc',
      pipelineId: 'test',
      status: 'queued',
      timestamp: new Date().toISOString()
    };

    it('should accept valid trigger response', () => assertAccepts(ManualTriggerResponseSchema, baseResponse));

    it('should reject extra fields (strict mode)', () =>
      assertStrictRejectsExtra(ManualTriggerResponseSchema, baseResponse));

    it('should reject missing jobId', () =>
      assertRejects(ManualTriggerResponseSchema, { pipelineId: 'test', status: 'queued', timestamp: new Date().toISOString() }));
  });

  describe('PipelineDocsParamsSchema', () => {
    it('should accept valid pipelineId', () =>
      assertAccepts(PipelineDocsParamsSchema, { pipelineId: 'duplicate-detection' }));

    it('should reject empty pipelineId', () =>
      assertRejects(PipelineDocsParamsSchema, { pipelineId: '' }));

    it('should reject extra fields (strict mode)', () =>
      assertStrictRejectsExtra(PipelineDocsParamsSchema, { pipelineId: 'test' }));
  });

  describe('PipelineDocsResponseSchema', () => {
    it('should accept valid docs response', () =>
      assertAccepts(PipelineDocsResponseSchema, {
        pipelineId: 'test',
        name: 'Test Pipeline',
        markdown: '# Docs\nContent here',
        timestamp: new Date().toISOString()
      }));

    it('should reject missing markdown', () =>
      assertRejects(PipelineDocsResponseSchema, {
        pipelineId: 'test',
        name: 'Test',
        timestamp: new Date().toISOString()
      }));
  });

  describe('PipelineHtmlParamsSchema', () => {
    it('should accept valid pipelineId', () =>
      assertAccepts(PipelineHtmlParamsSchema, { pipelineId: 'repomix' }));

    it('should reject empty pipelineId', () =>
      assertRejects(PipelineHtmlParamsSchema, { pipelineId: '' }));

    it('should reject extra fields (strict mode)', () =>
      assertStrictRejectsExtra(PipelineHtmlParamsSchema, { pipelineId: 'test' }));
  });

  describe('Helper Functions', () => {
    it('createErrorResponse should create valid error', () => {
      const error = createErrorResponse('Not Found', 'Pipeline not found', HttpStatus.NOT_FOUND);
      assert.strictEqual(error.error, 'Not Found');
      assert.strictEqual(error.message, 'Pipeline not found');
      assert.strictEqual(error.status, HttpStatus.NOT_FOUND);
      assert.ok(error.timestamp);
    });

    it('createValidationErrorResponse should create valid validation error', () => {
      const errors = [{ field: 'limit', message: 'Number must be less than or equal to 100', code: 'too_big' }];
      const error = createValidationErrorResponse('Validation failed', errors);
      assert.strictEqual(error.error, 'Bad Request');
      assert.strictEqual(error.status, HttpStatus.BAD_REQUEST);
      assert.strictEqual(error.errors?.length, 1);
      assert.strictEqual(error.errors?.[0].field, 'limit');
    });
  });
});

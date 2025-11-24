// @ts-nocheck
/**
 * Unit tests for error helper utilities
 *
 * Tests safe error message extraction and error object conversion
 * to prevent cascading TypeErrors when handling errors.
 */

import { strict as assert } from 'assert';
import {
  safeErrorMessage,
  safeErrorStack,
  toErrorObject,
  isErrorLike,
  serializeError,
  formatErrorMessage,
  combineErrors
} from '../../sidequest/pipeline-core/utils/error-helpers.js';

describe('Error Helper Utilities', () => {
  describe('safeErrorMessage()', () => {
    it('should extract message from Error object', () => {
      const error = new Error('test error');
      assert.equal(safeErrorMessage(error), 'test error');
    });

    it('should handle custom Error subclasses', () => {
      class CustomError extends Error {
        constructor(message) {
          super(message);
          this.name = 'CustomError';
        }
      }
      const error = new CustomError('custom error');
      assert.equal(safeErrorMessage(error), 'custom error');
    });

    it('should handle string errors', () => {
      assert.equal(safeErrorMessage('string error'), 'string error');
    });

    it('should handle null with default fallback', () => {
      assert.equal(safeErrorMessage(null), 'Unknown error');
    });

    it('should handle undefined with default fallback', () => {
      assert.equal(safeErrorMessage(undefined), 'Unknown error');
    });

    it('should handle null with custom fallback', () => {
      assert.equal(safeErrorMessage(null, 'Custom fallback'), 'Custom fallback');
    });

    it('should handle error-like objects with message property', () => {
      const errorObj = { message: 'error-like object' };
      assert.equal(safeErrorMessage(errorObj), 'error-like object');
    });

    it('should handle empty string with fallback', () => {
      assert.equal(safeErrorMessage(''), 'Unknown error');
    });

    it('should handle Error with empty message', () => {
      const error = new Error('');
      assert.equal(safeErrorMessage(error), 'Unknown error');
    });

    it('should handle numbers by converting to string', () => {
      assert.equal(safeErrorMessage(404), '404');
      assert.equal(safeErrorMessage(0), '0');
    });

    it('should handle booleans by converting to string', () => {
      assert.equal(safeErrorMessage(true), 'true');
      assert.equal(safeErrorMessage(false), 'false');
    });

    it('should handle plain objects by JSON stringifying', () => {
      const obj = { code: 'ENOENT', filePath: '/some/path/to/file' };
      const result = safeErrorMessage(obj);
      assert.ok(result.includes('ENOENT'));
      assert.ok(result.includes('/some/path/to/file'));
    });

    it('should handle arrays by converting to string', () => {
      const arr = ['error1', 'error2'];
      assert.equal(safeErrorMessage(arr), 'error1,error2');
    });

    it('should handle symbols by converting to string', () => {
      const sym = Symbol('test');
      const result = safeErrorMessage(sym);
      assert.ok(result.includes('Symbol'));
    });
  });

  describe('safeErrorStack()', () => {
    it('should extract stack from Error object', () => {
      const error = new Error('test error');
      const stack = safeErrorStack(error);
      assert.ok(stack);
      assert.ok(stack.includes('Error: test error'));
    });

    it('should return undefined for null', () => {
      assert.equal(safeErrorStack(null), undefined);
    });

    it('should return undefined for undefined', () => {
      assert.equal(safeErrorStack(undefined), undefined);
    });

    it('should return undefined for strings', () => {
      assert.equal(safeErrorStack('error string'), undefined);
    });

    it('should handle error-like objects with stack property', () => {
      const errorObj = { stack: 'fake stack trace' };
      assert.equal(safeErrorStack(errorObj), 'fake stack trace');
    });

    it('should return undefined for objects without stack', () => {
      const obj = { message: 'no stack' };
      assert.equal(safeErrorStack(obj), undefined);
    });
  });

  describe('toErrorObject()', () => {
    it('should convert Error to structured object', () => {
      const error = new Error('test error');
      const obj = toErrorObject(error);

      assert.equal(obj.message, 'test error');
      assert.equal(obj.type, 'Error');
      assert.equal(obj.name, 'Error');
      assert.equal(obj.isError, true);
      assert.ok(obj.stack);
    });

    it('should convert string to structured object', () => {
      const obj = toErrorObject('string error');

      assert.equal(obj.message, 'string error');
      assert.equal(obj.type, 'string');
      assert.equal(obj.isError, false);
      assert.equal(obj.stack, undefined);
    });

    it('should handle null with fallback message', () => {
      const obj = toErrorObject(null, { fallbackMessage: 'Null error' });

      assert.equal(obj.message, 'Null error');
      assert.equal(obj.type, 'null');
      assert.equal(obj.isError, false);
    });

    it('should include metadata when provided', () => {
      const error = new Error('test');
      const obj = toErrorObject(error, {
        metadata: { jobId: '123', attempt: 2 }
      });

      assert.deepEqual(obj.metadata, { jobId: '123', attempt: 2 });
    });

    it('should include error code if available', () => {
      const error = new Error('File not found');
      error.code = 'ENOENT';
      const obj = toErrorObject(error);

      assert.equal(obj.code, 'ENOENT');
    });

    it('should handle custom Error subclasses', () => {
      class ValidationError extends Error {
        constructor(message) {
          super(message);
          this.name = 'ValidationError';
        }
      }
      const error = new ValidationError('Invalid input');
      const obj = toErrorObject(error);

      assert.equal(obj.type, 'ValidationError');
      assert.equal(obj.name, 'ValidationError');
      assert.equal(obj.isError, true);
    });
  });

  describe('isErrorLike()', () => {
    it('should return true for Error objects', () => {
      assert.equal(isErrorLike(new Error('test')), true);
    });

    it('should return true for objects with message property', () => {
      assert.equal(isErrorLike({ message: 'test' }), true);
    });

    it('should return true for objects with stack property', () => {
      assert.equal(isErrorLike({ stack: 'stack trace' }), true);
    });

    it('should return true for objects with both message and stack', () => {
      assert.equal(isErrorLike({ message: 'test', stack: 'trace' }), true);
    });

    it('should return false for null', () => {
      assert.equal(isErrorLike(null), false);
    });

    it('should return false for undefined', () => {
      assert.equal(isErrorLike(undefined), false);
    });

    it('should return false for strings', () => {
      assert.equal(isErrorLike('error'), false);
    });

    it('should return false for numbers', () => {
      assert.equal(isErrorLike(404), false);
    });

    it('should return false for plain objects without error properties', () => {
      assert.equal(isErrorLike({ code: 'ENOENT' }), false);
    });
  });

  describe('serializeError()', () => {
    it('should serialize Error object with stack', () => {
      const error = new Error('test error');
      const serialized = serializeError(error, true);

      assert.equal(serialized.message, 'test error');
      assert.equal(serialized.name, 'Error');
      assert.equal(serialized.type, 'Error');
      assert.ok(serialized.stack);
    });

    it('should serialize Error object without stack', () => {
      const error = new Error('test error');
      const serialized = serializeError(error, false);

      assert.equal(serialized.message, 'test error');
      assert.equal(serialized.name, 'Error');
      assert.equal(serialized.stack, undefined);
    });

    it('should serialize Error with cause', () => {
      const cause = new Error('root cause');
      const error = new Error('wrapper error', { cause });
      const serialized = serializeError(error);

      assert.equal(serialized.message, 'wrapper error');
      assert.ok(serialized.cause);
      assert.equal(serialized.cause.message, 'root cause');
    });

    it('should include error code if available', () => {
      const error = new Error('File error');
      error.code = 'ENOENT';
      const serialized = serializeError(error);

      assert.equal(serialized.code, 'ENOENT');
    });

    it('should handle string errors', () => {
      const serialized = serializeError('string error');

      assert.equal(serialized.message, 'string error');
      assert.equal(serialized.type, 'string');
      assert.equal(serialized.stack, undefined);
    });

    it('should handle null errors', () => {
      const serialized = serializeError(null);

      assert.equal(serialized.message, 'Unknown error');
      assert.equal(serialized.type, 'null');
    });
  });

  describe('formatErrorMessage()', () => {
    it('should format error without type prefix by default', () => {
      const error = new Error('test error');
      const formatted = formatErrorMessage(error);

      assert.equal(formatted, 'test error');
    });

    it('should include type prefix when requested', () => {
      const error = new Error('test error');
      const formatted = formatErrorMessage(error, { includeType: true });

      assert.equal(formatted, '[Error] test error');
    });

    it('should include error code when requested', () => {
      const error = new Error('File not found');
      error.code = 'ENOENT';
      const formatted = formatErrorMessage(error, { includeCode: true });

      assert.equal(formatted, '[ENOENT] File not found');
    });

    it('should prefer code over type when both requested', () => {
      const error = new Error('File not found');
      error.code = 'ENOENT';
      const formatted = formatErrorMessage(error, {
        includeCode: true,
        includeType: true
      });

      assert.equal(formatted, '[ENOENT] File not found');
    });

    it('should handle string errors with type', () => {
      const formatted = formatErrorMessage('string error', { includeType: true });

      assert.equal(formatted, '[string] string error');
    });
  });

  describe('combineErrors()', () => {
    it('should combine multiple Error objects', () => {
      const errors = [
        new Error('error 1'),
        new Error('error 2'),
        new Error('error 3')
      ];
      const combined = combineErrors(errors);

      assert.equal(combined, 'error 1; error 2; error 3');
    });

    it('should combine with custom separator', () => {
      const errors = [new Error('error 1'), new Error('error 2')];
      const combined = combineErrors(errors, ' | ');

      assert.equal(combined, 'error 1 | error 2');
    });

    it('should handle mixed error types', () => {
      const errors = [
        new Error('error object'),
        'string error',
        { message: 'object error' }
      ];
      const combined = combineErrors(errors);

      assert.ok(combined.includes('error object'));
      assert.ok(combined.includes('string error'));
      assert.ok(combined.includes('object error'));
    });

    it('should filter out null/undefined errors', () => {
      const errors = [
        new Error('error 1'),
        null,
        new Error('error 2'),
        undefined
      ];
      const combined = combineErrors(errors);

      assert.equal(combined, 'error 1; error 2');
    });

    it('should return fallback for empty array', () => {
      assert.equal(combineErrors([]), 'Unknown error');
    });

    it('should return fallback for null input', () => {
      assert.equal(combineErrors(null), 'Unknown error');
    });

    it('should handle single error', () => {
      const errors = [new Error('single error')];
      const combined = combineErrors(errors);

      assert.equal(combined, 'single error');
    });
  });

  describe('Edge cases and stress tests', () => {
    it('should handle deeply nested error causes', () => {
      const error3 = new Error('level 3');
      const error2 = new Error('level 2', { cause: error3 });
      const error1 = new Error('level 1', { cause: error2 });

      const serialized = serializeError(error1);
      assert.equal(serialized.message, 'level 1');
      assert.equal(serialized.cause.message, 'level 2');
      assert.equal(serialized.cause.cause.message, 'level 3');
    });

    it('should handle circular reference objects safely', () => {
      const obj = { message: 'circular' };
      obj.self = obj;

      // Should not throw
      const message = safeErrorMessage(obj);
      assert.ok(message);
    });

    it('should handle very long error messages', () => {
      const longMessage = 'A'.repeat(10000);
      const error = new Error(longMessage);

      assert.equal(safeErrorMessage(error), longMessage);
    });

    it('should handle errors with special characters', () => {
      const message = 'Error: \n\t\r\0 special chars';
      const error = new Error(message);

      assert.equal(safeErrorMessage(error), message);
    });

    it('should handle errors with unicode characters', () => {
      const message = '错误: Unicode エラー';
      const error = new Error(message);

      assert.equal(safeErrorMessage(error), message);
    });
  });

  describe('ActivityFeed cascade prevention', () => {
    it('should prevent TypeError when error parameter is missing', () => {
      // Simulate activity-feed.js:219 scenario
      const job = { id: '123', data: { type: 'test' } };
      const error = undefined; // Missing error parameter!

      // Should NOT throw TypeError
      assert.doesNotThrow(() => {
        const errorObj = toErrorObject(error, {
          fallbackMessage: 'Unknown error',
          metadata: { jobId: job.id }
        });
        const message = `Job ${job.id} failed: ${errorObj.message}`;
        assert.equal(message, 'Job 123 failed: Unknown error');
      });
    });

    it('should handle job:failed event with null error', () => {
      const job = { id: '456' };
      const error = null;

      const errorObj = toErrorObject(error);
      assert.equal(errorObj.message, 'Unknown error');
      assert.equal(errorObj.type, 'null');
      assert.equal(errorObj.isError, false);
    });

    it('should handle retry:created event with undefined error', () => {
      const jobId = '789';
      const error = undefined;

      const errorMessage = safeErrorMessage(error);
      assert.equal(errorMessage, 'Unknown error');

      // Optional chaining should work
      const code = error?.code;
      assert.equal(code, undefined);
    });
  });
});

// Run tests
console.log('Running error helper tests...');

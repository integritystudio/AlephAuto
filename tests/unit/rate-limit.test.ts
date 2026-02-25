#!/usr/bin/env node
/**
 * Rate Limiting Middleware Tests
 *
 * Tests for rate limiting middleware configuration and behavior.
 * Handler behavior (429 response format, skip logic) should be tested
 * with supertest against a live Express app when added.
 */

// @ts-nocheck
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rateLimiter, strictRateLimiter, bulkImportRateLimiter } from '../../api/middleware/rate-limit.ts';

describe('Rate Limiter Middleware', () => {
  describe('rateLimiter configuration', () => {
    it('should be a function (middleware)', () => {
      assert.strictEqual(typeof rateLimiter, 'function');
    });
  });

  describe('strictRateLimiter configuration', () => {
    it('should be a function (middleware)', () => {
      assert.strictEqual(typeof strictRateLimiter, 'function');
    });

    it('should be a separate middleware from rateLimiter', () => {
      assert.notStrictEqual(rateLimiter, strictRateLimiter);
    });
  });

  describe('bulkImportRateLimiter configuration', () => {
    it('should be a function (middleware)', () => {
      assert.strictEqual(typeof bulkImportRateLimiter, 'function');
    });

    it('should be a separate middleware from rateLimiter and strictRateLimiter', () => {
      assert.notStrictEqual(bulkImportRateLimiter, rateLimiter);
      assert.notStrictEqual(bulkImportRateLimiter, strictRateLimiter);
    });
  });
});

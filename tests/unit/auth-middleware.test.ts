#!/usr/bin/env node
/**
 * Authentication middleware tests.
 */

// @ts-nocheck
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { authMiddleware } from '../../api/middleware/auth.ts';
import { config } from '../../sidequest/core/config.ts';
import { HttpStatus } from '../../shared/constants/http-status.ts';

function createRequest(overrides = {}) {
  return {
    path: '/api/private',
    ip: '127.0.0.1',
    headers: {},
    ...overrides,
  };
}

function createResponse() {
  return {
    statusCode: null,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: Record<string, unknown>) {
      this.body = payload;
      return this;
    }
  };
}

describe('authMiddleware', () => {
  let originalApiKey: string | undefined;
  let originalNodeEnv: string;

  beforeEach(() => {
    originalApiKey = process.env.API_KEY;
    originalNodeEnv = config.nodeEnv;
    delete process.env.API_KEY;
    config.nodeEnv = 'production';
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.API_KEY;
    } else {
      process.env.API_KEY = originalApiKey;
    }
    config.nodeEnv = originalNodeEnv;
  });

  it('skips auth for public paths', () => {
    const req = createRequest({ path: '/health' });
    const res = createResponse();
    let nextCalled = false;

    authMiddleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, null);
  });

  it('allows protected routes in development when API key is not configured', () => {
    config.nodeEnv = 'development';
    const req = createRequest();
    const res = createResponse();
    let nextCalled = false;

    authMiddleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, null);
  });

  it('fails closed for protected routes outside development when API key is missing', () => {
    const req = createRequest();
    const res = createResponse();
    let nextCalled = false;

    authMiddleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, HttpStatus.SERVICE_UNAVAILABLE);
    assert.equal(res.body?.error, 'Service Unavailable');
  });

  it('returns 401 when API key is configured but request has no credentials', () => {
    process.env.API_KEY = 'test-api-key';
    const req = createRequest();
    const res = createResponse();

    authMiddleware(req, res, () => {
      assert.fail('next() should not be called for missing credentials');
    });

    assert.equal(res.statusCode, HttpStatus.UNAUTHORIZED);
    assert.equal(res.body?.error, 'Unauthorized');
  });

  it('returns 403 for invalid API key', () => {
    process.env.API_KEY = 'test-api-key';
    const req = createRequest({
      headers: { 'x-api-key': 'wrong-key' }
    });
    const res = createResponse();

    authMiddleware(req, res, () => {
      assert.fail('next() should not be called for invalid key');
    });

    assert.equal(res.statusCode, HttpStatus.FORBIDDEN);
    assert.equal(res.body?.error, 'Forbidden');
  });

  it('allows request with valid API key', () => {
    process.env.API_KEY = 'test-api-key';
    const req = createRequest({
      headers: { 'x-api-key': 'test-api-key' }
    });
    const res = createResponse();
    let nextCalled = false;

    authMiddleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, null);
  });
});

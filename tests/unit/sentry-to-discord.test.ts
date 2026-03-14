import { describe, it } from 'node:test';
import assert from 'node:assert';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpStatus } from '../../shared/constants/http-status.ts';

import { formatSentryToDiscord, routeRequest } from '../../docs/setup/sentry-to-discord.js';

describe('sentry-to-discord bridge', () => {
  type MockResponse = ServerResponse & {
    statusCode: number;
    headersSent: boolean;
    headers: Record<string, string>;
    body: string;
  };

  const createMockRequest = (method: string, url: string, body?: string): IncomingMessage => {
    const req = new EventEmitter() as IncomingMessage;
    Object.assign(req, { method, url });

    if (body !== undefined) {
      process.nextTick(() => {
        (req as unknown as EventEmitter).emit('data', Buffer.from(body));
        (req as unknown as EventEmitter).emit('end');
      });
    }

    return req;
  };

  const createMockResponse = (): MockResponse => {
    const state = {
      statusCode: 0,
      headersSent: false,
      headers: {} as Record<string, string>,
      body: '',
    };

    const res = {
      ...state,
      writeHead(statusCode: number, headers: Record<string, string>) {
        state.statusCode = statusCode;
        state.headers = headers;
        state.headersSent = true;
        this.statusCode = statusCode;
        this.headers = headers;
        this.headersSent = true;
        return this;
      },
      end(chunk?: string) {
        if (chunk) {
          state.body += chunk.toString();
          this.body += chunk.toString();
        }
      },
    };

    return res as unknown as MockResponse;
  };

  it('formats sentry payload into discord embed', () => {
    const message = formatSentryToDiscord({
      action: 'triggered',
      event: {
        level: 'warning',
        title: 'Error spike',
        environment: 'production',
        tags: { component: 'worker-registry' },
        timestamp: '2026-03-04T12:00:00.000Z',
      },
      issue: {
        count: 7,
        permalink: 'https://sentry.example/issues/123',
      },
    });

    assert.strictEqual(message.username, 'Sentry Alerts');
    assert.ok(Array.isArray(message.embeds));
    assert.strictEqual(message.embeds.length, 1);
    assert.strictEqual(message.embeds[0].title, '⚠️ Error spike');
    assert.strictEqual(message.embeds[0].footer.text, 'Sentry Alert • triggered');
    assert.strictEqual(message.embeds[0].fields[0].value, 'WARNING');
  });

  it('serves health check endpoint', async () => {
    const req = createMockRequest('GET', '/health');
    const res = createMockResponse();

    await routeRequest(req, res);
    const data = JSON.parse(res.body) as { status: string; service: string };

    assert.strictEqual(res.statusCode, HttpStatus.OK);
    assert.strictEqual(data.status, 'healthy');
    assert.strictEqual(data.service, 'sentry-discord-bridge');
  });

  it('accepts sentry webhook and dispatches formatted payload', async () => {
    const payload = {
      action: 'created',
      event: {
        level: 'error',
        title: 'Worker failed',
        environment: 'production',
        tags: { component: 'duplicate-detection' },
      },
      issue: {
        count: 3,
        permalink: 'https://sentry.example/issues/456',
      },
    };
    let dispatchedPayload: Record<string, unknown> | null = null;
    const dispatchToDiscord = async (message: Record<string, unknown>) => {
      dispatchedPayload = message;
      return { success: true, statusCode: 204 };
    };
    const req = createMockRequest('POST', '/sentry-webhook', JSON.stringify(payload));
    const res = createMockResponse();

    await routeRequest(req, res, dispatchToDiscord);
    const responseJson = JSON.parse(res.body) as { success: boolean };

    assert.strictEqual(res.statusCode, HttpStatus.OK);
    assert.strictEqual(responseJson.success, true);
    assert.ok(dispatchedPayload);
    assert.strictEqual((dispatchedPayload.embeds as Array<Record<string, unknown>>)[0].title, '🚨 Worker failed');
  });

  it('returns 500 when webhook dispatch fails', async () => {
    const req = createMockRequest('POST', '/sentry-webhook', JSON.stringify({ event: { title: 'x' } }));
    const res = createMockResponse();
    const dispatchToDiscord = async () => {
      throw new Error('Discord unavailable');
    };

    await routeRequest(req, res, dispatchToDiscord);
    const responseJson = JSON.parse(res.body) as { error: string };

    assert.strictEqual(res.statusCode, HttpStatus.INTERNAL_SERVER_ERROR);
    assert.strictEqual(responseJson.error, 'Discord unavailable');
  });
});

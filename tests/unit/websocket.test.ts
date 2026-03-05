import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'http';
import { WebSocket } from 'ws';
import { createWebSocketServer } from '../../api/websocket.ts';
import { ScanEventBroadcaster } from '../../api/event-broadcaster.ts';
import { TestTiming } from '../constants/timing-test-constants.ts';

const describeEnvSensitive = process.env.SKIP_ENV_SENSITIVE_TESTS === '1'
  ? describe.skip
  : describe;

/**
 * WebSocket Server Integration Tests
 *
 * Fixed (2026-02-23):
 * 1. afterEach now calls ws.terminate() on all clients before wss.close(),
 *    preventing the server from hanging while waiting for graceful disconnects.
 * 2. Updated assertions to match current API: total_clients, message.type,
 *    flat message fields (scan_id, stage, etc. at top level, not nested in data).
 * 3. Added connectAndSubscribe helper to handle welcome message + subscription
 *    handshake before testing channel-filtered broadcasts.
 *
 */
describeEnvSensitive('WebSocket Server', () => {
  let httpServer;
  let wss;
  let broadcaster;
  let baseUrl;
  let port;

  beforeEach(async () => {
    httpServer = createServer();

    await new Promise<void>((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(0, () => {
        const address = httpServer.address();
        if (address === null || typeof address === 'string') {
          reject(new Error('Unable to resolve WebSocket test server address'));
          return;
        }

        port = address.port;
        baseUrl = `ws://localhost:${port}`;
        wss = createWebSocketServer(httpServer);
        broadcaster = new ScanEventBroadcaster(wss);
        resolve();
      });
    });
  });

  afterEach(async () => {
    // Terminate all open connections so wss.close() callback fires immediately
    for (const client of wss.clients) {
      client.terminate();
    }

    // Close wss first (drains WS connections), then httpServer (releases the port).
    // Ordering matters in attached mode: wss.close() fires immediately here because
    // all clients were terminated above; httpServer.close() must come after.
    await new Promise(resolve => wss.close(resolve));
    await new Promise(resolve => httpServer.close(resolve));
  });

  /**
   * Connect and wait for the 'connected' welcome message.
   * @param {string} url - Base ws:// URL (without path)
   * @returns {Promise<WebSocket>}
   */
  function connectClient(url): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${url}/ws`);
      const timeout = setTimeout(() => {
        ws.terminate();
        reject(new Error('Timed out waiting for WebSocket connection handshake'));
      }, TestTiming.DEFAULT_WAIT_TIMEOUT_MS);

      const onError = (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      };

      ws.once('error', onError);
      ws.once('message', (data) => {
        clearTimeout(timeout);
        ws.removeListener('error', onError);
        const msg = JSON.parse(data.toString());
        if (msg.type === 'connected') {
          resolve(ws);
          return;
        }

        reject(new Error(`Expected connected, got: ${msg.type}`));
      });
    });
  }

  async function closeClient(ws: WebSocket): Promise<void> {
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        ws.terminate();
      }, TestTiming.DEFAULT_WAIT_TIMEOUT_MS);

      ws.once('close', () => {
        clearTimeout(timeout);
        resolve();
      });

      if (ws.readyState === ws.OPEN) {
        ws.close();
        return;
      }

      if (ws.readyState === ws.CONNECTING) {
        ws.once('open', () => ws.close());
        return;
      }

      clearTimeout(timeout);
      resolve();
    });
  }

  async function waitForClientCount(expected: number): Promise<void> {
    const start = Date.now();
    while (wss.getClientInfo().total_clients !== expected) {
      if (Date.now() - start >= TestTiming.DEFAULT_WAIT_TIMEOUT_MS) {
        throw new Error(`Timed out waiting for client count ${expected}`);
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  /**
   * Connect, receive welcome, then subscribe to a channel.
   * After this resolves the client will receive filtered broadcasts.
   * @param {string} url - Base ws:// URL
   * @param {string[]} channels - Channels to subscribe to
   * @returns {Promise<WebSocket>}
   */
  async function connectAndSubscribe(url, channels = ['scans']): Promise<WebSocket> {
    const ws = await connectClient(url);
    await new Promise((resolve, reject) => {
      ws.once('error', reject);
      ws.once('message', (data) => {
        ws.removeListener('error', reject);
        const msg = JSON.parse(data.toString());
        if (msg.type === 'subscribed') resolve();
        else reject(new Error(`Expected subscribed, got: ${msg.type}`));
      });
      ws.send(JSON.stringify({ type: 'subscribe', channels }));
    });
    return ws;
  }

  describe('Connection Handling', () => {
    test('should accept WebSocket connections', async () => {
      const ws = await connectClient(baseUrl);
      assert.ok(ws.readyState === ws.OPEN, 'Connection established');
      await closeClient(ws);
    });

    test('should handle multiple concurrent connections', async () => {
      const numConnections = 5;
      const connections = await Promise.all(
        Array.from({ length: numConnections }, () => connectClient(baseUrl))
      );

      assert.strictEqual(wss.getClientInfo().total_clients, numConnections);
      await Promise.all(connections.map(ws => closeClient(ws)));
      await waitForClientCount(0);
    });

    test('should track connected clients', async () => {
      const ws = await connectClient(baseUrl);
      const info = wss.getClientInfo();
      assert.ok(info.total_clients >= 1, 'Should have at least 1 client');
      assert.strictEqual(typeof info.total_clients, 'number');
      await closeClient(ws);
    });
  });

  describe('Event Broadcasting', () => {
    test('should broadcast scan:started event', async () => {
      const ws = await connectAndSubscribe(baseUrl);

      await new Promise((resolve, reject) => {
        ws.once('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            assert.strictEqual(message.type, 'scan:started');
            assert.strictEqual(message.scan_id, 'test-scan-1');
            assert.ok(message.timestamp);
            ws.close();
          } catch (e) {
            reject(e);
          }
        });
        ws.once('close', resolve);
        ws.once('error', reject);
        broadcaster.broadcastScanStarted('test-scan-1', { repository: '/test/repo' });
      });
    });

    test('should broadcast scan:progress event', async () => {
      const ws = await connectAndSubscribe(baseUrl);

      await new Promise((resolve, reject) => {
        ws.once('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            assert.strictEqual(message.type, 'scan:progress');
            assert.strictEqual(message.scan_id, 'test-scan-2');
            assert.strictEqual(message.stage, 'extraction');
            ws.close();
          } catch (e) {
            reject(e);
          }
        });
        ws.once('close', resolve);
        ws.once('error', reject);
        broadcaster.broadcastProgress('test-scan-2', { stage: 'extraction', percent: 42 });
      });
    });

    test('should broadcast scan:completed event', async () => {
      const ws = await connectAndSubscribe(baseUrl);

      await new Promise((resolve, reject) => {
        ws.once('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            assert.strictEqual(message.type, 'scan:completed');
            assert.strictEqual(message.scan_id, 'test-scan-3');
            assert.ok(message.metrics, 'Should have metrics');
            ws.close();
          } catch (e) {
            reject(e);
          }
        });
        ws.once('close', resolve);
        ws.once('error', reject);
        broadcaster.broadcastScanCompleted('test-scan-3', {
          duration_seconds: 1.2,
          metrics: { total_duplicate_groups: 5, total_suggestions: 3 }
        });
      });
    });

    test('should broadcast scan:failed event', async () => {
      const ws = await connectAndSubscribe(baseUrl);

      await new Promise((resolve, reject) => {
        ws.once('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            assert.strictEqual(message.type, 'scan:failed');
            assert.strictEqual(message.scan_id, 'test-scan-4');
            assert.strictEqual(message.error.message, 'Test error message');
            ws.close();
          } catch (e) {
            reject(e);
          }
        });
        ws.once('close', resolve);
        ws.once('error', reject);
        broadcaster.broadcastScanFailed('test-scan-4', new Error('Test error message'));
      });
    });

    test('should broadcast to all connected clients', async () => {
      const numClients = 3;
      const clients = await Promise.all(
        Array.from({ length: numClients }, () => connectAndSubscribe(baseUrl))
      );

      let receivedCount = 0;
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Timeout: not all clients received broadcast')),
          TestTiming.DEFAULT_WAIT_TIMEOUT_MS
        );

        for (const ws of clients) {
          ws.once('message', (data) => {
            try {
              const message = JSON.parse(data.toString());
              assert.strictEqual(message.type, 'scan:started');
              receivedCount++;
              ws.close();
              if (receivedCount === numClients) {
                clearTimeout(timeout);
                resolve();
              }
            } catch (e) {
              clearTimeout(timeout);
              reject(e);
            }
          });
        }

        broadcaster.broadcastScanStarted('broadcast-test', { repository: '/test/repo' });
      });
    });
  });

  describe('Message Format', () => {
    test('all messages should include timestamp', async () => {
      const ws = await connectAndSubscribe(baseUrl);

      await new Promise((resolve, reject) => {
        ws.once('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            assert.ok(message.timestamp, 'Should have timestamp');
            assert.ok(!isNaN(new Date(message.timestamp).getTime()), 'Timestamp should be valid ISO');
            ws.close();
          } catch (e) {
            reject(e);
          }
        });
        ws.once('close', resolve);
        ws.once('error', reject);
        broadcaster.broadcastScanStarted('test-timestamp', { repository: '/test' });
      });
    });

    test('all messages should include type field', async () => {
      const ws = await connectAndSubscribe(baseUrl);

      await new Promise((resolve, reject) => {
        ws.once('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            assert.ok(message.type, 'Should have type field');
            assert.strictEqual(typeof message.type, 'string');
            ws.close();
          } catch (e) {
            reject(e);
          }
        });
        ws.once('close', resolve);
        ws.once('error', reject);
        broadcaster.broadcastProgress('test-event', { stage: 'test' });
      });
    });

    test('messages should be valid JSON', async () => {
      const ws = await connectAndSubscribe(baseUrl);

      await new Promise((resolve, reject) => {
        ws.once('message', (data) => {
          try {
            assert.doesNotThrow(() => JSON.parse(data.toString()));
            ws.close();
          } catch (e) {
            reject(e);
          }
        });
        ws.once('close', resolve);
        ws.once('error', reject);
        broadcaster.broadcastScanCompleted('test-json', {});
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle client disconnection gracefully', () => {
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(`${baseUrl}/ws`);
        ws.on('open', () => ws.close());
        ws.on('close', () => {
          assert.ok(true, 'Client disconnected gracefully');
          resolve();
        });
        ws.on('error', reject);
      });
    });

    test('should continue broadcasting after client disconnects', async () => {
      const ws1 = await connectAndSubscribe(baseUrl);
      const ws2 = await connectAndSubscribe(baseUrl);

      // Disconnect first client and wait for server to process the close
      await new Promise((resolve) => {
        ws1.on('close', resolve);
        ws1.close();
      });
      // Small delay for server-side close handler to run
      await new Promise(r => setTimeout(r, 50));

      await new Promise((resolve, reject) => {
        ws2.once('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            assert.strictEqual(message.type, 'scan:started');
            assert.strictEqual(message.scan_id, 'after-disconnect');
            ws2.close();
          } catch (e) {
            reject(e);
          }
        });
        ws2.once('close', resolve);
        ws2.once('error', reject);
        broadcaster.broadcastScanStarted('after-disconnect', { repository: '/test' });
      });
    });
  });
});

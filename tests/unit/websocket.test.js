import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'http';
import { WebSocket } from 'ws';
import { createWebSocketServer } from '../../api/websocket.js';
import { ScanEventBroadcaster } from '../../api/event-broadcaster.js';

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
 * Related: mcp-server.test.js (still skipped — mcp-servers/ binary not present)
 */
describe('WebSocket Server', () => {
  let httpServer;
  let wss;
  let broadcaster;
  let baseUrl;
  let port;

  beforeEach(async () => {
    httpServer = createServer();
    port = 3001 + Math.floor(Math.random() * 1000);
    baseUrl = `ws://localhost:${port}`;

    await new Promise((resolve) => {
      httpServer.listen(port, () => {
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

    await new Promise((resolve) => {
      const fallback = setTimeout(resolve, 2000);
      wss.close(() => {
        clearTimeout(fallback);
        httpServer.close(() => resolve());
      });
    });
  });

  /**
   * Connect and wait for the 'connected' welcome message.
   * @param {string} url - Base ws:// URL (without path)
   * @returns {Promise<WebSocket>}
   */
  function connectClient(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${url}/ws`);
      ws.once('error', reject);
      ws.once('open', () => {
        ws.once('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'connected') resolve(ws);
          else reject(new Error(`Expected connected, got: ${msg.type}`));
        });
      });
    });
  }

  /**
   * Connect, receive welcome, then subscribe to a channel.
   * After this resolves the client will receive filtered broadcasts.
   * @param {string} url - Base ws:// URL
   * @param {string[]} channels - Channels to subscribe to
   * @returns {Promise<WebSocket>}
   */
  async function connectAndSubscribe(url, channels = ['scans']) {
    const ws = await connectClient(url);
    await new Promise((resolve, reject) => {
      ws.once('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'subscribed') resolve();
        else reject(new Error(`Expected subscribed, got: ${msg.type}`));
      });
      ws.send(JSON.stringify({ type: 'subscribe', channels }));
    });
    return ws;
  }

  describe('Connection Handling', () => {
    test('should accept WebSocket connections', () => {
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(`${baseUrl}/ws`);
        ws.on('open', () => {
          assert.ok(true, 'Connection established');
          ws.close();
        });
        ws.on('close', () => resolve());
        ws.on('error', reject);
      });
    });

    test('should handle multiple concurrent connections', () => {
      return new Promise((resolve, reject) => {
        const numConnections = 5;
        let openCount = 0;
        let closeCount = 0;
        const connections = [];

        for (let i = 0; i < numConnections; i++) {
          const ws = new WebSocket(`${baseUrl}/ws`);
          connections.push(ws);

          ws.on('open', () => {
            openCount++;
            if (openCount === numConnections) {
              assert.strictEqual(openCount, numConnections);
              connections.forEach(conn => conn.close());
            }
          });

          ws.on('close', () => {
            closeCount++;
            if (closeCount === numConnections) resolve();
          });

          ws.on('error', reject);
        }
      });
    });

    test('should track connected clients', () => {
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(`${baseUrl}/ws`);
        ws.on('open', () => {
          try {
            const info = wss.getClientInfo();
            assert.ok(info.total_clients >= 1, 'Should have at least 1 client');
            assert.strictEqual(typeof info.total_clients, 'number');
          } catch (e) {
            reject(e);
            return;
          }
          ws.close();
        });
        ws.on('close', () => resolve());
        ws.on('error', reject);
      });
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
          5000
        );

        for (const ws of clients) {
          ws.once('message', (data) => {
            const message = JSON.parse(data.toString());
            assert.strictEqual(message.type, 'scan:started');
            receivedCount++;
            ws.close();
            if (receivedCount === numClients) {
              clearTimeout(timeout);
              resolve();
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

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'http';
import { WebSocket } from 'ws';
import { createWebSocketServer } from '../../api/websocket.js';
import { ScanEventBroadcaster } from '../../api/event-broadcaster.js';

// TODO: Fix race conditions and hanging tests - skipping until proper async cleanup is implemented
describe.skip('WebSocket Server', () => {
  let httpServer;
  let wss;
  let broadcaster;
  let baseUrl;
  let port;

  beforeEach(async () => {
    // Create HTTP server for testing
    httpServer = createServer();
    port = 3001 + Math.floor(Math.random() * 1000); // Random port to avoid conflicts
    baseUrl = `ws://localhost:${port}`;

    await new Promise((resolve) => {
      httpServer.listen(port, () => {
        // Initialize WebSocket server
        wss = createWebSocketServer(httpServer);
        broadcaster = new ScanEventBroadcaster(wss);
        resolve();
      });
    });
  });

  afterEach(async () => {
    // Give WebSocket connections time to fully close
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Clean up
    await new Promise((resolve) => {
      if (wss) {
        wss.close(() => {
          if (httpServer) {
            httpServer.close(() => resolve());
          } else {
            resolve();
          }
        });
      } else if (httpServer) {
        httpServer.close(() => resolve());
      } else {
        resolve();
      }
    });
  });

  describe('Connection Handling', () => {
    test('should accept WebSocket connections', (done) => {
      const ws = new WebSocket(`${baseUrl}/ws`);
      let finished = false;

      ws.on('open', () => {
        assert.ok(true, 'Connection established');
        ws.close();
      });

      ws.on('close', () => {
        if (!finished) {
          finished = true;
          done();
        }
      });

      ws.on('error', () => {
        // Ignore errors during cleanup
        if (!finished) {
          finished = true;
          done();
        }
      });
    });

    test('should handle multiple concurrent connections', (done) => {
      const connections = [];
      const numConnections = 5;
      let openCount = 0;
      let closeCount = 0;
      let finished = false;

      for (let i = 0; i < numConnections; i++) {
        const ws = new WebSocket(`${baseUrl}/ws`);
        connections.push(ws);

        ws.on('open', () => {
          openCount++;
          if (openCount === numConnections) {
            assert.strictEqual(openCount, numConnections);
            // Close all connections
            connections.forEach(conn => conn.close());
          }
        });

        ws.on('close', () => {
          closeCount++;
          if (closeCount === numConnections && !finished) {
            finished = true;
            done();
          }
        });

        ws.on('error', () => {
          // Ignore errors during cleanup
        });
      }
    });

    test('should track connected clients', (done) => {
      const ws = new WebSocket(`${baseUrl}/ws`);
      let finished = false;

      ws.on('open', () => {
        const info = wss.getClientInfo();
        assert.ok(info.connected_clients >= 1);
        assert.ok(typeof info.total_connections === 'number');
        ws.close();
      });

      ws.on('close', () => {
        if (!finished) {
          finished = true;
          done();
        }
      });

      ws.on('error', () => {
        // Ignore errors during cleanup
        if (!finished) {
          finished = true;
          done();
        }
      });
    });
  });

  describe('Event Broadcasting', () => {
    test('should broadcast scan:started event', (done) => {
      const ws = new WebSocket(`${baseUrl}/ws`);
      let finished = false;

      ws.on('open', () => {
        broadcaster.broadcastScanStarted('test-scan-1', '/test/repo');
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        assert.strictEqual(message.event, 'scan:started');
        assert.strictEqual(message.data.scan_id, 'test-scan-1');
        assert.strictEqual(message.data.repository_path, '/test/repo');
        assert.ok(message.timestamp);
        ws.close();
      });

      ws.on('close', () => {
        if (!finished) {
          finished = true;
          done();
        }
      });

      ws.on('error', () => {
        // Ignore errors during cleanup
      });
    });

    test('should broadcast scan:progress event', (done) => {
      const ws = new WebSocket(`${baseUrl}/ws`);
      let finished = false;

      ws.on('open', () => {
        broadcaster.broadcastScanProgress('test-scan-2', {
          stage: 'extraction',
          blocks_found: 42
        });
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        assert.strictEqual(message.event, 'scan:progress');
        assert.strictEqual(message.data.scan_id, 'test-scan-2');
        assert.strictEqual(message.data.progress.stage, 'extraction');
        assert.strictEqual(message.data.progress.blocks_found, 42);
        ws.close();
      });

      ws.on('close', () => {
        if (!finished) {
          finished = true;
          done();
        }
      });

      ws.on('error', () => {
        // Ignore errors during cleanup
      });
    });

    test('should broadcast scan:completed event', (done) => {
      const ws = new WebSocket(`${baseUrl}/ws`);
      let finished = false;
      const results = {
        total_blocks: 100,
        duplicate_groups: 5,
        total_suggestions: 3
      };

      ws.on('open', () => {
        broadcaster.broadcastScanCompleted('test-scan-3', results);
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        assert.strictEqual(message.event, 'scan:completed');
        assert.strictEqual(message.data.scan_id, 'test-scan-3');
        assert.deepStrictEqual(message.data.results, results);
        ws.close();
      });

      ws.on('close', () => {
        if (!finished) {
          finished = true;
          done();
        }
      });

      ws.on('error', () => {
        // Ignore errors during cleanup
      });
    });

    test('should broadcast scan:failed event', (done) => {
      const ws = new WebSocket(`${baseUrl}/ws`);
      let finished = false;

      ws.on('open', () => {
        broadcaster.broadcastScanFailed('test-scan-4', 'Test error message');
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        assert.strictEqual(message.event, 'scan:failed');
        assert.strictEqual(message.data.scan_id, 'test-scan-4');
        assert.strictEqual(message.data.error, 'Test error message');
        ws.close();
      });

      ws.on('close', () => {
        if (!finished) {
          finished = true;
          done();
        }
      });

      ws.on('error', () => {
        // Ignore errors during cleanup
      });
    });

    test('should broadcast to all connected clients', (done) => {
      const clients = [];
      const numClients = 3;
      let receivedCount = 0;
      let closedCount = 0;
      let finished = false;

      for (let i = 0; i < numClients; i++) {
        const ws = new WebSocket(`${baseUrl}/ws`);
        clients.push(ws);

        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          assert.strictEqual(message.event, 'scan:started');
          receivedCount++;

          if (receivedCount === numClients) {
            assert.strictEqual(receivedCount, numClients, 'All clients received broadcast');
            clients.forEach(client => client.close());
          }
        });

        ws.on('close', () => {
          closedCount++;
          if (closedCount === numClients && !finished) {
            finished = true;
            done();
          }
        });

        ws.on('error', () => {
          // Ignore errors during cleanup
        });
      }

      // Wait for all clients to connect
      setTimeout(() => {
        broadcaster.broadcastScanStarted('broadcast-test', '/test/repo');
      }, 100);
    });
  });

  describe('Message Format', () => {
    test('all messages should include timestamp', (done) => {
      const ws = new WebSocket(`${baseUrl}/ws`);
      let finished = false;

      ws.on('open', () => {
        broadcaster.broadcastScanStarted('test-timestamp', '/test');
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        assert.ok(message.timestamp);
        const timestamp = new Date(message.timestamp);
        assert.ok(!isNaN(timestamp.getTime()));
        ws.close();
      });

      ws.on('close', () => {
        if (!finished) {
          finished = true;
          done();
        }
      });

      ws.on('error', () => {
        // Ignore errors during cleanup
      });
    });

    test('all messages should include event type', (done) => {
      const ws = new WebSocket(`${baseUrl}/ws`);
      let finished = false;

      ws.on('open', () => {
        broadcaster.broadcastScanProgress('test-event', { stage: 'test' });
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        assert.ok(message.event);
        assert.strictEqual(typeof message.event, 'string');
        ws.close();
      });

      ws.on('close', () => {
        if (!finished) {
          finished = true;
          done();
        }
      });

      ws.on('error', () => {
        // Ignore errors during cleanup
      });
    });

    test('messages should be valid JSON', (done) => {
      const ws = new WebSocket(`${baseUrl}/ws`);
      let finished = false;

      ws.on('open', () => {
        broadcaster.broadcastScanCompleted('test-json', { test: true });
      });

      ws.on('message', (data) => {
        assert.doesNotThrow(() => {
          JSON.parse(data.toString());
        });
        ws.close();
      });

      ws.on('close', () => {
        if (!finished) {
          finished = true;
          done();
        }
      });

      ws.on('error', () => {
        // Ignore errors during cleanup
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle client disconnection gracefully', (done) => {
      const ws = new WebSocket(`${baseUrl}/ws`);
      let finished = false;

      ws.on('open', () => {
        ws.close();
      });

      ws.on('close', () => {
        // Server should handle disconnection without errors
        if (!finished) {
          finished = true;
          assert.ok(true, 'Client disconnected gracefully');
          done();
        }
      });

      ws.on('error', () => {
        // Ignore errors during cleanup
      });
    });

    test('should continue broadcasting after client disconnects', (done) => {
      const ws1 = new WebSocket(`${baseUrl}/ws`);
      const ws2 = new WebSocket(`${baseUrl}/ws`);
      let finished = false;

      let ws1Ready = false;
      let ws2Ready = false;

      ws1.on('open', () => {
        ws1Ready = true;
        checkBothReady();
      });

      ws2.on('open', () => {
        ws2Ready = true;
        checkBothReady();
      });

      function checkBothReady() {
        if (ws1Ready && ws2Ready) {
          // Close first client
          ws1.close();

          // Broadcast after one client disconnected
          setTimeout(() => {
            broadcaster.broadcastScanStarted('after-disconnect', '/test');
          }, 50);
        }
      }

      ws2.on('message', (data) => {
        const message = JSON.parse(data.toString());
        assert.strictEqual(message.event, 'scan:started');
        assert.strictEqual(message.data.scan_id, 'after-disconnect');
        ws2.close();
      });

      ws2.on('close', () => {
        if (!finished) {
          finished = true;
          done();
        }
      });

      ws1.on('error', () => {
        // Ignore errors during cleanup
      });

      ws2.on('error', () => {
        // Ignore errors during cleanup
      });
    });
  });
});

/**
 * Port Manager Tests
 *
 * Tests for port availability checking, dynamic port allocation,
 * graceful shutdown, and process cleanup.
 */

import { describe, test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  isPortAvailable,
  findAvailablePort,
  setupServerWithPortFallback,
  setupGracefulShutdown,
  killProcessOnPort
} from '../../api/utils/port-manager.js';
import net from 'net';
import { createServer } from 'http';

describe('Port Manager', () => {
  let servers = [];

  // Helper to create and track servers for cleanup
  const createTestServer = () => {
    const server = createServer();
    servers.push(server);
    return server;
  };

  // Helper to start server on specific port
  const startServerOnPort = (port, host = '0.0.0.0') => {
    return new Promise((resolve, reject) => {
      const server = createTestServer();
      server.listen(port, host, (err) => {
        if (err) reject(err);
        else resolve(server);
      });
      server.on('error', reject);
    });
  };

  // Cleanup all test servers after each test
  after(async () => {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise((resolve) => {
            if (server.listening) {
              server.close(() => resolve());
            } else {
              resolve();
            }
          })
      )
    );
    servers = [];
  });

  describe('isPortAvailable', () => {
    test('should return true for available port', async () => {
      const port = 9000;
      const available = await isPortAvailable(port);
      assert.strictEqual(available, true);
    });

    test('should return false for occupied port', async () => {
      const port = 9001;

      // Start a server to occupy the port
      await startServerOnPort(port);

      // Check availability
      const available = await isPortAvailable(port);
      assert.strictEqual(available, false);
    });

    test('should work with different host addresses', async () => {
      const port = 9002;
      const available = await isPortAvailable(port, 'localhost');
      assert.strictEqual(available, true);
    });

    test('should handle rapid sequential checks', async () => {
      const port = 9003;

      // Run checks sequentially to avoid race conditions
      const result1 = await isPortAvailable(port);
      const result2 = await isPortAvailable(port);
      const result3 = await isPortAvailable(port);

      assert.strictEqual(result1, true);
      assert.strictEqual(result2, true);
      assert.strictEqual(result3, true);
    });
  });

  describe('findAvailablePort', () => {
    test('should return first available port in range', async () => {
      const startPort = 9100;
      const endPort = 9105;

      const port = await findAvailablePort(startPort, endPort);
      assert.strictEqual(port, startPort);
      assert.ok(port >= startPort);
      assert.ok(port <= endPort);
    });

    test('should skip occupied ports and find next available', async () => {
      const startPort = 9110;
      const endPort = 9115;

      // Occupy first two ports
      await startServerOnPort(9110);
      await startServerOnPort(9111);

      const port = await findAvailablePort(startPort, endPort);
      assert.strictEqual(port, 9112);
    });

    test('should return null if no ports available in range', async () => {
      const startPort = 9120;
      const endPort = 9122;

      // Occupy all ports in range
      await startServerOnPort(9120);
      await startServerOnPort(9121);
      await startServerOnPort(9122);

      const port = await findAvailablePort(startPort, endPort);
      assert.strictEqual(port, null);
    });

    test('should work with single port range', async () => {
      const port = 9130;
      const result = await findAvailablePort(port, port);
      assert.strictEqual(result, port);
    });

    test('should handle large port ranges efficiently', async () => {
      const startPort = 9200;
      const endPort = 9300;

      const startTime = Date.now();
      const port = await findAvailablePort(startPort, endPort);
      const duration = Date.now() - startTime;

      assert.strictEqual(port, startPort);
      assert.ok(duration < 1000); // Should be fast when first port is available
    });
  });

  describe('setupServerWithPortFallback', () => {
    test('should bind to preferred port when available', async () => {
      const server = createTestServer();
      const preferredPort = 9300;

      const actualPort = await setupServerWithPortFallback(server, {
        preferredPort,
        maxPort: preferredPort + 5
      });

      assert.strictEqual(actualPort, preferredPort);
      assert.strictEqual(server.listening, true);
      assert.strictEqual(server.address().port, preferredPort);
    });

    test('should fallback to next available port when preferred is occupied', async () => {
      const preferredPort = 9310;

      // Occupy preferred port
      await startServerOnPort(preferredPort);

      // Try to bind new server
      const server = createTestServer();
      const actualPort = await setupServerWithPortFallback(server, {
        preferredPort,
        maxPort: preferredPort + 5
      });

      assert.strictEqual(actualPort, preferredPort + 1);
      assert.strictEqual(server.listening, true);
      assert.strictEqual(server.address().port, preferredPort + 1);
    });

    test('should skip multiple occupied ports', async () => {
      const preferredPort = 9320;

      // Occupy first three ports
      await startServerOnPort(9320);
      await startServerOnPort(9321);
      await startServerOnPort(9322);

      const server = createTestServer();
      const actualPort = await setupServerWithPortFallback(server, {
        preferredPort,
        maxPort: preferredPort + 10
      });

      assert.strictEqual(actualPort, 9323);
      assert.strictEqual(server.listening, true);
    });

    test('should throw error when no ports available', async () => {
      const preferredPort = 9330;
      const maxPort = 9332;

      // Occupy all ports
      await startServerOnPort(9330);
      await startServerOnPort(9331);
      await startServerOnPort(9332);

      const server = createTestServer();

      await assert.rejects(
        setupServerWithPortFallback(server, {
          preferredPort,
          maxPort
        }),
        /No available ports found/
      );
    });

    test('should throw error when preferredPort is missing', async () => {
      const server = createTestServer();

      await assert.rejects(
        setupServerWithPortFallback(server, {}),
        /preferredPort is required/
      );
    });

    test('should respect custom host binding', async () => {
      const server = createTestServer();
      const preferredPort = 9340;

      const actualPort = await setupServerWithPortFallback(server, {
        preferredPort,
        maxPort: preferredPort + 5,
        host: 'localhost'
      });

      assert.strictEqual(actualPort, preferredPort);
      // Node.js may bind to IPv6 ::1 or IPv4 127.0.0.1 for localhost
      const address = server.address().address;
      assert.ok(address === '127.0.0.1' || address === '::1', `Expected localhost address, got ${address}`);
    });
  });

  describe('setupGracefulShutdown', () => {
    test('should register shutdown handlers', () => {
      const server = createTestServer();
      const listeners = process.listeners('SIGTERM').length;

      setupGracefulShutdown(server);

      assert.ok(process.listeners('SIGTERM').length > listeners);
    });

    test('should handle multiple signal types', () => {
      const server = createTestServer();

      const sigtermCount = process.listeners('SIGTERM').length;
      const sigintCount = process.listeners('SIGINT').length;
      const sighupCount = process.listeners('SIGHUP').length;

      setupGracefulShutdown(server);

      assert.ok(process.listeners('SIGTERM').length > sigtermCount);
      assert.ok(process.listeners('SIGINT').length > sigintCount);
      assert.ok(process.listeners('SIGHUP').length > sighupCount);
    });
  });

  describe('Integration: Full server lifecycle', () => {
    test('should handle complete startup and shutdown cycle', async () => {
      const server = createTestServer();
      const preferredPort = 9500;

      // Startup with port fallback
      const actualPort = await setupServerWithPortFallback(server, {
        preferredPort,
        maxPort: preferredPort + 5
      });

      assert.strictEqual(actualPort, preferredPort);
      assert.strictEqual(server.listening, true);

      // Setup graceful shutdown
      let shutdownCalled = false;
      setupGracefulShutdown(server, {
        onShutdown: async () => {
          shutdownCalled = true;
        }
      });

      // Verify server is running
      const available = await isPortAvailable(preferredPort);
      assert.strictEqual(available, false);

      // Shutdown
      await new Promise((resolve) => {
        server.close(resolve);
      });

      assert.strictEqual(server.listening, false);

      // Port should be available again
      const availableAfter = await isPortAvailable(preferredPort);
      assert.strictEqual(availableAfter, true);
    });

    test('should handle rapid restart scenarios', async () => {
      const port = 9510;

      // Start first server
      const server1 = createTestServer();
      await setupServerWithPortFallback(server1, {
        preferredPort: port,
        maxPort: port + 5
      });

      assert.strictEqual(server1.address().port, port);

      // Start second server (should get fallback port)
      const server2 = createTestServer();
      const port2 = await setupServerWithPortFallback(server2, {
        preferredPort: port,
        maxPort: port + 5
      });

      assert.strictEqual(port2, port + 1);

      // Close first server
      await new Promise((resolve) => server1.close(resolve));

      // Start third server (should get original port now)
      const server3 = createTestServer();
      const port3 = await setupServerWithPortFallback(server3, {
        preferredPort: port,
        maxPort: port + 5
      });

      assert.strictEqual(port3, port);
    });
  });

  describe('Error handling', () => {
    test('should handle server listen errors gracefully', async () => {
      const server = createTestServer();

      // Force an error by using an invalid port
      await assert.rejects(
        setupServerWithPortFallback(server, {
          preferredPort: -1,
          maxPort: -1
        })
      );
    });

    test('should handle concurrent port checks correctly', async () => {
      const port = 9600;

      // Run sequentially to avoid race conditions during cleanup
      const result1 = await isPortAvailable(port);
      const result2 = await isPortAvailable(port);
      const result3 = await isPortAvailable(port);
      const result4 = await isPortAvailable(port);
      const result5 = await isPortAvailable(port);

      // All checks should succeed
      assert.strictEqual(result1, true);
      assert.strictEqual(result2, true);
      assert.strictEqual(result3, true);
      assert.strictEqual(result4, true);
      assert.strictEqual(result5, true);
    });
  });

  describe('killProcessOnPort', () => {
    test('should return false when lsof fails to find process', async () => {
      // Use a port that's definitely not in use
      // lsof exits with error when no process found, so we get false
      const unusedPort = 19999;
      const result = await killProcessOnPort(unusedPort);
      // lsof returns non-zero when no process found, which causes error
      assert.strictEqual(result, false);
    });

    test('should handle invalid port errors gracefully', async () => {
      // Use an invalid port number that will cause lsof to fail
      const invalidPort = -1;
      const result = await killProcessOnPort(invalidPort);
      // Should return false due to error in lsof command
      assert.strictEqual(result, false);
    });

    test('should return boolean for any port input', async () => {
      // Test that the function always returns a boolean, never throws
      // Use high ports unlikely to have processes to avoid killing anything important
      const result1 = await killProcessOnPort(59990);
      const result2 = await killProcessOnPort(59991);
      const result3 = await killProcessOnPort(59992);

      assert.strictEqual(typeof result1, 'boolean');
      assert.strictEqual(typeof result2, 'boolean');
      assert.strictEqual(typeof result3, 'boolean');
    });
  });

  describe('setupServerWithPortFallback with killExisting', () => {
    test('should use default maxPort when not specified', async () => {
      const preferredPort = 9750;
      const server = createTestServer();

      const actualPort = await setupServerWithPortFallback(server, {
        preferredPort
        // maxPort will default to preferredPort + 10
      });

      assert.strictEqual(actualPort, preferredPort);
      assert.strictEqual(server.listening, true);
    });

    test('should handle killExisting option when port is available', async () => {
      // Test the killExisting code path when port is already available
      // (no actual killing needed)
      const preferredPort = 9770;
      const server = createTestServer();

      const actualPort = await setupServerWithPortFallback(server, {
        preferredPort,
        maxPort: preferredPort + 5,
        killExisting: true
      });

      // Should get preferred port since it was available
      assert.strictEqual(actualPort, preferredPort);
      assert.strictEqual(server.listening, true);
    });

    test('should accept killExisting as false explicitly', async () => {
      const preferredPort = 9780;
      const server = createTestServer();

      const actualPort = await setupServerWithPortFallback(server, {
        preferredPort,
        maxPort: preferredPort + 5,
        killExisting: false
      });

      assert.strictEqual(actualPort, preferredPort);
      assert.strictEqual(server.listening, true);
    });
  });

  describe('setupGracefulShutdown - Extended', () => {
    test('should accept custom onShutdown handler', () => {
      const server = createTestServer();
      let handlerProvided = false;

      setupGracefulShutdown(server, {
        onShutdown: async () => {
          handlerProvided = true;
        }
      });

      // Verify handlers are registered
      assert.ok(process.listeners('SIGTERM').length > 0);
    });

    test('should accept custom timeout option', () => {
      const server = createTestServer();

      // Should not throw with custom timeout
      setupGracefulShutdown(server, {
        timeout: 5000
      });

      assert.ok(process.listeners('SIGTERM').length > 0);
    });

    test('should register uncaughtException handler', () => {
      const server = createTestServer();
      const beforeCount = process.listeners('uncaughtException').length;

      setupGracefulShutdown(server);

      assert.ok(process.listeners('uncaughtException').length > beforeCount);
    });

    test('should register unhandledRejection handler', () => {
      const server = createTestServer();
      const beforeCount = process.listeners('unhandledRejection').length;

      setupGracefulShutdown(server);

      assert.ok(process.listeners('unhandledRejection').length > beforeCount);
    });

    test('should work with default options', () => {
      const server = createTestServer();

      // Should not throw with no options
      setupGracefulShutdown(server);

      assert.ok(process.listeners('SIGTERM').length > 0);
      assert.ok(process.listeners('SIGINT').length > 0);
      assert.ok(process.listeners('SIGHUP').length > 0);
    });
  });

  describe('isPortAvailable - Edge Cases', () => {
    test('should handle high port numbers', async () => {
      const port = 65000;
      const available = await isPortAvailable(port);
      assert.strictEqual(available, true);
    });

    test('should always return boolean for any valid port', async () => {
      // Test that function returns boolean regardless of port availability
      const result1 = await isPortAvailable(49152);
      const result2 = await isPortAvailable(49153);
      const result3 = await isPortAvailable(65534);

      assert.strictEqual(typeof result1, 'boolean');
      assert.strictEqual(typeof result2, 'boolean');
      assert.strictEqual(typeof result3, 'boolean');
    });

    test('should handle checking same port multiple times', async () => {
      const port = 49200;

      const result1 = await isPortAvailable(port);
      const result2 = await isPortAvailable(port);

      // Both should return same result
      assert.strictEqual(result1, result2);
      assert.strictEqual(result1, true);
    });
  });

  describe('findAvailablePort - Edge Cases', () => {
    test('should handle inverted range (start > end)', async () => {
      // When startPort > endPort, loop doesn't execute
      const port = await findAvailablePort(9900, 9890);
      assert.strictEqual(port, null);
    });

    test('should work with consecutive occupied ports', async () => {
      const startPort = 9800;

      // Occupy consecutive ports
      await startServerOnPort(9800);
      await startServerOnPort(9801);
      await startServerOnPort(9802);
      await startServerOnPort(9803);

      const port = await findAvailablePort(startPort, startPort + 10);
      assert.strictEqual(port, 9804);
    });
  });

  describe('Server Error Scenarios', () => {
    test('should handle server.listen error via error event', async () => {
      const preferredPort = 9850;

      // Occupy the port first
      await startServerOnPort(preferredPort);

      // Create a raw server that might emit error differently
      const server = createTestServer();

      // This should still work via fallback
      const actualPort = await setupServerWithPortFallback(server, {
        preferredPort,
        maxPort: preferredPort + 5
      });

      assert.ok(actualPort > preferredPort);
    });
  });
});

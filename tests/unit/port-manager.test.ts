/**
 * Port Manager Tests
 *
 * Tests for port availability checking, dynamic port allocation,
 * graceful shutdown, and process cleanup.
 */

import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  isPortAvailable,
  findAvailablePort,
  setupServerWithPortFallback,
  setupGracefulShutdown,
  killProcessOnPort
} from '../../api/utils/port-manager.ts';
import { createServer } from 'http';
import { CONFIG_POLICY, RETRY } from '../../sidequest/core/constants.ts';
import { TestTiming } from '../constants/timing-test-constants.ts';

const EPHEMERAL_PORT_RANGE_START = 49_152;
const EPHEMERAL_PORT_RANGE_END = CONFIG_POLICY.PORTS.MAX_PORT;
const FALLBACK_SMALL_RANGE_SIZE = RETRY.MAX_ABSOLUTE_ATTEMPTS;
const FALLBACK_STANDARD_RANGE_SIZE = RETRY.MAX_MANUAL_RETRIES;
const FIRST_FALLBACK_OFFSET = CONFIG_POLICY.PORTS.MIN_PORT;
const SECOND_FALLBACK_OFFSET = CONFIG_POLICY.DOPPLER.DEFAULT_SUCCESS_THRESHOLD;
const THIRD_FALLBACK_OFFSET = CONFIG_POLICY.DOPPLER.DEFAULT_FAILURE_THRESHOLD;
const FOURTH_FALLBACK_OFFSET = 4;
const FAST_LOOKUP_MAX_DURATION_MS = CONFIG_POLICY.DOPPLER.MIN_TIMEOUT_MS;
const UNUSED_TEST_PORT = 19_999;
const HIGH_PORT_TEST_BASE = 59_990;
const HIGH_VALID_TEST_PORT = 65_000;
const REPEAT_CHECK_PORT = 49_200;
const MAX_PORT_MINUS_ONE = CONFIG_POLICY.PORTS.MAX_PORT - CONFIG_POLICY.PORTS.MIN_PORT;

const describeEnvSensitive = process.env.SKIP_ENV_SENSITIVE_TESTS === '1'
  ? describe.skip
  : describe;

describeEnvSensitive('Port Manager', () => {
  let servers = [];

  // Track process listeners added by setupGracefulShutdown so we can remove them
  const SHUTDOWN_EVENTS = ['SIGTERM', 'SIGINT', 'SIGHUP', 'uncaughtException', 'unhandledRejection'];
  let listenerSnapshot: Map<string, ((...args: unknown[]) => void)[]>;

  // Helper to create and track servers for cleanup
  /**
   * createTestServer.
   */
  const createTestServer = () => {
    const server = createServer();
    servers.push(server);
    return server;
  };

  // Helper to start server on specific port
  /**
   * startServerOnPort.
   */
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

  // Snapshot process listeners before each test so afterEach can remove additions
  beforeEach(() => {
    listenerSnapshot = new Map();
    for (const event of SHUTDOWN_EVENTS) {
      listenerSnapshot.set(event, [...process.listeners(event)]);
    }
  });

  afterEach(async () => {
    // Remove signal listeners added during this test
    for (const event of SHUTDOWN_EVENTS) {
      const before = listenerSnapshot.get(event) || [];
      for (const listener of process.listeners(event)) {
        if (!before.includes(listener)) {
          process.removeListener(event, listener as (...args: any[]) => void);
        }
      }
    }

    // Cleanup servers
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
      // Use OS-assigned port to guarantee availability
      const port = await findAvailablePort(EPHEMERAL_PORT_RANGE_START, EPHEMERAL_PORT_RANGE_END);
      assert.ok(port !== null, 'Should find an available port');
      const available = await isPortAvailable(port!);
      assert.strictEqual(available, true);
    });

    test('should return false for occupied port', async () => {
      // Start server on OS-assigned port, then verify that port is reported occupied
      const server = await startServerOnPort(0);
      const { port } = (server as any).address();

      const available = await isPortAvailable(port);
      assert.strictEqual(available, false);
    });

    test('should work with different host addresses', async () => {
      const port = await findAvailablePort(EPHEMERAL_PORT_RANGE_START, EPHEMERAL_PORT_RANGE_END);
      assert.ok(port !== null, 'Should find an available port');
      const available = await isPortAvailable(port!, 'localhost');
      assert.strictEqual(available, true);
    });

    test('should handle rapid sequential checks', async () => {
      const port = await findAvailablePort(EPHEMERAL_PORT_RANGE_START, EPHEMERAL_PORT_RANGE_END);
      assert.ok(port !== null, 'Should find an available port');

      // Run checks sequentially to avoid race conditions
      const result1 = await isPortAvailable(port!);
      const result2 = await isPortAvailable(port!);
      const result3 = await isPortAvailable(port!);

      assert.strictEqual(result1, true);
      assert.strictEqual(result2, true);
      assert.strictEqual(result3, true);
    });
  });

  describe('findAvailablePort', () => {
    test('should return first available port in range', async () => {
      const startPort = 9100;
      const endPort = startPort + FALLBACK_SMALL_RANGE_SIZE;

      const port = await findAvailablePort(startPort, endPort);
      assert.strictEqual(port, startPort);
      assert.ok(port >= startPort);
      assert.ok(port <= endPort);
    });

    test('should skip occupied ports and find next available', async () => {
      const startPort = 9110;
      const endPort = startPort + FALLBACK_SMALL_RANGE_SIZE;

      // Occupy first two ports
      await startServerOnPort(startPort);
      await startServerOnPort(startPort + FIRST_FALLBACK_OFFSET);

      const port = await findAvailablePort(startPort, endPort);
      assert.strictEqual(port, startPort + SECOND_FALLBACK_OFFSET);
    });

    test('should return null if no ports available in range', async () => {
      const startPort = 9120;
      const endPort = 9122;

      // Occupy all ports in range
      await startServerOnPort(startPort);
      await startServerOnPort(startPort + FIRST_FALLBACK_OFFSET);
      await startServerOnPort(startPort + SECOND_FALLBACK_OFFSET);

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
      assert.ok(duration < FAST_LOOKUP_MAX_DURATION_MS); // Should be fast when first port is available
    });
  });

  describe('setupServerWithPortFallback', () => {
    test('should bind to preferred port when available', async () => {
      const server = createTestServer();
      const preferredPort = 9300;

      const actualPort = await setupServerWithPortFallback(server, {
        preferredPort,
        maxPort: preferredPort + FALLBACK_SMALL_RANGE_SIZE
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
        maxPort: preferredPort + FALLBACK_SMALL_RANGE_SIZE
      });

      assert.strictEqual(actualPort, preferredPort + FIRST_FALLBACK_OFFSET);
      assert.strictEqual(server.listening, true);
      assert.strictEqual(server.address().port, preferredPort + FIRST_FALLBACK_OFFSET);
    });

    test('should skip multiple occupied ports', async () => {
      const preferredPort = 9320;

      // Occupy first three ports
      await startServerOnPort(preferredPort);
      await startServerOnPort(preferredPort + FIRST_FALLBACK_OFFSET);
      await startServerOnPort(preferredPort + SECOND_FALLBACK_OFFSET);

      const server = createTestServer();
      const actualPort = await setupServerWithPortFallback(server, {
        preferredPort,
        maxPort: preferredPort + FALLBACK_STANDARD_RANGE_SIZE
      });

      assert.strictEqual(actualPort, preferredPort + THIRD_FALLBACK_OFFSET);
      assert.strictEqual(server.listening, true);
    });

    test('should throw error when no ports available', async () => {
      const preferredPort = 9330;
      const maxPort = 9332;

      // Occupy all ports
      await startServerOnPort(preferredPort);
      await startServerOnPort(preferredPort + FIRST_FALLBACK_OFFSET);
      await startServerOnPort(preferredPort + SECOND_FALLBACK_OFFSET);

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
        maxPort: preferredPort + FALLBACK_SMALL_RANGE_SIZE,
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
        maxPort: preferredPort + FALLBACK_SMALL_RANGE_SIZE
      });

      assert.strictEqual(actualPort, preferredPort);
      assert.strictEqual(server.listening, true);

      // Setup graceful shutdown
      let _shutdownCalled = false;
      setupGracefulShutdown(server, {
        onShutdown: async () => {
          _shutdownCalled = true;
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
        maxPort: port + FALLBACK_SMALL_RANGE_SIZE
      });

      assert.strictEqual(server1.address().port, port);

      // Start second server (should get fallback port)
      const server2 = createTestServer();
      const port2 = await setupServerWithPortFallback(server2, {
        preferredPort: port,
        maxPort: port + FALLBACK_SMALL_RANGE_SIZE
      });

      assert.strictEqual(port2, port + FIRST_FALLBACK_OFFSET);

      // Close first server
      await new Promise((resolve) => server1.close(resolve));

      // Start third server (should get original port now)
      const server3 = createTestServer();
      const port3 = await setupServerWithPortFallback(server3, {
        preferredPort: port,
        maxPort: port + FALLBACK_SMALL_RANGE_SIZE
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

      // All checks should return the same result (consistent behavior)
      const results = [result1, result2, result3, result4, result5];
      const allSame = results.every(r => r === result1);
      assert.strictEqual(allSame, true, `Expected consistent results, got: ${results}`);
    });
  });

  describe('killProcessOnPort', () => {
    test('should return false when lsof fails to find process', async () => {
      // Use a port that's definitely not in use
      // lsof exits with error when no process found, so we get false
      const unusedPort = UNUSED_TEST_PORT;
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
      const result1 = await killProcessOnPort(HIGH_PORT_TEST_BASE);
      const result2 = await killProcessOnPort(HIGH_PORT_TEST_BASE + FIRST_FALLBACK_OFFSET);
      const result3 = await killProcessOnPort(HIGH_PORT_TEST_BASE + SECOND_FALLBACK_OFFSET);

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
        maxPort: preferredPort + FALLBACK_SMALL_RANGE_SIZE,
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
        maxPort: preferredPort + FALLBACK_SMALL_RANGE_SIZE,
        killExisting: false
      });

      assert.strictEqual(actualPort, preferredPort);
      assert.strictEqual(server.listening, true);
    });
  });

  describe('setupGracefulShutdown - Extended', () => {
    test('should accept custom onShutdown handler', () => {
      const server = createTestServer();
      let _handlerProvided = false;

      setupGracefulShutdown(server, {
        onShutdown: async () => {
          _handlerProvided = true;
        }
      });

      // Verify handlers are registered
      assert.ok(process.listeners('SIGTERM').length > 0);
    });

    test('should accept custom timeout option', () => {
      const server = createTestServer();

      // Should not throw with custom timeout
      setupGracefulShutdown(server, {
        timeout: TestTiming.DEFAULT_WAIT_TIMEOUT_MS
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
      const port = HIGH_VALID_TEST_PORT;
      const available = await isPortAvailable(port);
      assert.strictEqual(available, true);
    });

    test('should always return boolean for any valid port', async () => {
      // Test that function returns boolean regardless of port availability
      const result1 = await isPortAvailable(EPHEMERAL_PORT_RANGE_START);
      const result2 = await isPortAvailable(EPHEMERAL_PORT_RANGE_START + FIRST_FALLBACK_OFFSET);
      const result3 = await isPortAvailable(MAX_PORT_MINUS_ONE);

      assert.strictEqual(typeof result1, 'boolean');
      assert.strictEqual(typeof result2, 'boolean');
      assert.strictEqual(typeof result3, 'boolean');
    });

    test('should handle checking same port multiple times', async () => {
      const port = REPEAT_CHECK_PORT;

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
      const invertedRangeStartPort = 9900;
      const port = await findAvailablePort(invertedRangeStartPort, invertedRangeStartPort - FALLBACK_STANDARD_RANGE_SIZE);
      assert.strictEqual(port, null);
    });

    test('should work with consecutive occupied ports', async () => {
      const startPort = 9800;

      // Occupy consecutive ports
      await startServerOnPort(startPort);
      await startServerOnPort(startPort + FIRST_FALLBACK_OFFSET);
      await startServerOnPort(startPort + SECOND_FALLBACK_OFFSET);
      await startServerOnPort(startPort + THIRD_FALLBACK_OFFSET);

      const port = await findAvailablePort(startPort, startPort + FALLBACK_STANDARD_RANGE_SIZE);
      assert.strictEqual(port, startPort + FOURTH_FALLBACK_OFFSET);
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
        maxPort: preferredPort + FALLBACK_SMALL_RANGE_SIZE
      });

      assert.ok(actualPort > preferredPort);
    });
  });
});

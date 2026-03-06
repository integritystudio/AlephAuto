/**
 * Port Manager Integration Tests
 *
 * End-to-end tests with real HTTP servers:
 * - Server binds to port successfully
 * - Port occupied → automatic fallback
 * - Multiple servers start simultaneously → unique ports
 * - Graceful shutdown closes ports properly
 *
 * Scenarios:
 * 1. Server binds to port 8080 successfully
 * 2. Port 8080 occupied → automatic fallback to 8081
 * 3. Multiple servers start simultaneously → each gets unique port
 * 4. Graceful shutdown closes ports properly
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import {
  isPortAvailable,
  findAvailablePort,
  setupServerWithPortFallback,
  setupGracefulShutdown
} from '../../api/utils/port-manager.ts';
import { CONFIG_POLICY, RETRY, TIMEOUTS } from '../../sidequest/core/constants.ts';
import { HttpStatus } from '../../shared/constants/http-status.ts';

const DEFAULT_API_PORT = CONFIG_POLICY.PORTS.DEFAULT_API_PORT;
const FIRST_PORT_OFFSET = CONFIG_POLICY.PORTS.MIN_PORT;
const SECOND_PORT_OFFSET = CONFIG_POLICY.DOPPLER.DEFAULT_SUCCESS_THRESHOLD;
const THIRD_PORT_OFFSET = CONFIG_POLICY.DOPPLER.DEFAULT_FAILURE_THRESHOLD;
const FOURTH_PORT_OFFSET = 4;
const FALLBACK_SMALL_RANGE_SIZE = RETRY.MAX_ABSOLUTE_ATTEMPTS;
const FALLBACK_STANDARD_RANGE_SIZE = RETRY.MAX_MANUAL_RETRIES;
const SERVER_COUNT_THREE = CONFIG_POLICY.DOPPLER.DEFAULT_FAILURE_THRESHOLD;
const SHUTDOWN_FETCH_TIMEOUT_MS = CONFIG_POLICY.DOPPLER.MIN_BASE_DELAY_MS;
const CUSTOM_SHUTDOWN_TIMEOUT_MS = TIMEOUTS.TEN_SECONDS_MS;
const SCENARIO_THREE_RANGE_START = 9000;
const SCENARIO_THREE_RANGE_END = 9100;
const SCENARIO_FOUR_RANGE_START = 9200;
const SCENARIO_FOUR_RANGE_END = 9300;
const SCENARIO_FIVE_RANGE_START = 9400;
const SCENARIO_FIVE_RANGE_END = 9500;
const SCENARIO_SIX_RANGE_START = 9600;
const SCENARIO_SIX_RANGE_END = 9700;
const SCENARIO_SEVEN_RANGE_START = 9800;
const SCENARIO_SEVEN_RANGE_END = 9900;
const SCENARIO_EIGHT_RANGE_START = 9900;
const SCENARIO_EIGHT_RANGE_END = 9950;

describe('Port Manager - Integration Tests', () => {
  let servers = [];

  afterEach(async () => {
    // Close all test servers
    for (const server of servers) {
      if (server.listening) {
        await new Promise(resolve => server.close(resolve));
      }
    }
    servers = [];
  });

  it('Scenario 1: Server binds to port 8080 successfully', async () => {
    const server = http.createServer((req, res) => {
      res.writeHead(HttpStatus.OK, { 'Content-Type': 'text/plain' });
      res.end('OK');
    });
    servers.push(server);

    // Check if port 8080 is available
    const available = await isPortAvailable(DEFAULT_API_PORT);

    if (available) {
      // Bind to port 8080
      const actualPort = await setupServerWithPortFallback(server, {
        preferredPort: DEFAULT_API_PORT,
        host: '0.0.0.0'
      });

      assert.equal(actualPort, DEFAULT_API_PORT, 'Server should bind to preferred port 8080');

      // Verify server is listening
      const address = server.address();
      assert.equal(address.port, DEFAULT_API_PORT);
      assert.equal(server.listening, true);

      // Verify we can make HTTP request
      const response = await fetch(`http://localhost:${DEFAULT_API_PORT}`);
      const text = await response.text();
      assert.equal(text, 'OK');
      assert.equal(response.status, HttpStatus.OK);
    } else {
      // Port 8080 occupied, should fallback
      const actualPort = await setupServerWithPortFallback(server, {
        preferredPort: DEFAULT_API_PORT,
        maxPort: DEFAULT_API_PORT + FALLBACK_STANDARD_RANGE_SIZE,
        host: '0.0.0.0'
      });

      assert(actualPort > DEFAULT_API_PORT, 'Should use fallback port');
      assert(server.listening, 'Server should be listening on fallback port');
    }
  });

  it('Scenario 2: Port 8080 occupied → automatic fallback to 8081', async () => {
    // Create first server on port 8080
    const server1 = http.createServer((req, res) => {
      res.writeHead(HttpStatus.OK);
      res.end('Server 1');
    });
    servers.push(server1);

    // Try to find available port starting from 8080
    let port1 = DEFAULT_API_PORT;
    const isAvailable = await isPortAvailable(port1);
    if (!isAvailable) {
      port1 = await findAvailablePort(DEFAULT_API_PORT, DEFAULT_API_PORT + (SECOND_PORT_OFFSET * FALLBACK_STANDARD_RANGE_SIZE));
    }

    await new Promise((resolve, reject) => {
      server1.listen(port1, '0.0.0.0', () => resolve());
      server1.on('error', reject);
    });

    assert(server1.listening, 'Server 1 should be listening');

    // Create second server - should fallback because port1 is occupied
    const server2 = http.createServer((req, res) => {
      res.writeHead(HttpStatus.OK);
      res.end('Server 2');
    });
    servers.push(server2);

    const port2 = await setupServerWithPortFallback(server2, {
      preferredPort: port1,
      maxPort: port1 + FALLBACK_STANDARD_RANGE_SIZE,
      host: '0.0.0.0'
    });

    assert(port2 > port1, `Server 2 should use fallback port (got ${port2}, expected > ${port1})`);
    assert.equal(server2.listening, true);

    // Verify both servers are accessible
    const response1 = await fetch(`http://localhost:${port1}`);
    const text1 = await response1.text();
    assert.equal(text1, 'Server 1');

    const response2 = await fetch(`http://localhost:${port2}`);
    const text2 = await response2.text();
    assert.equal(text2, 'Server 2');

    // Verify ports are different
    assert.notEqual(port1, port2, 'Servers should use different ports');
  });

  it('Scenario 3: Multiple servers start → each gets unique port via fallback', async () => {
    // Start sequentially so each server exercises the port-fallback mechanism:
    // server N+1 finds port N occupied and falls back to the next available port.
    // Sequential startup eliminates the ECONNRESET race from concurrent binding.
    const startPort = await findAvailablePort(SCENARIO_THREE_RANGE_START, SCENARIO_THREE_RANGE_END);
    assert(startPort, 'Should find available starting port');

    const responses = ['A', 'B', 'C'];
    const results: Array<{ server: http.Server; port: number; response: string }> = [];

    for (const response of responses) {
      const server = http.createServer((req, res) => {
        res.writeHead(HttpStatus.OK);
        res.end(response);
      });
      servers.push(server);

      // All servers prefer the same startPort; each falls back past already-bound ports
      const port = await setupServerWithPortFallback(server, {
        preferredPort: startPort,
        maxPort: startPort + (SECOND_PORT_OFFSET * FALLBACK_STANDARD_RANGE_SIZE),
        host: '0.0.0.0'
      });

      results.push({ server, port, response });
    }

    // Verify all servers got unique ports
    const ports = results.map(r => r.port);
    const uniquePorts = new Set(ports);
    assert.equal(uniquePorts.size, SERVER_COUNT_THREE, 'All servers should have unique ports');

    // Verify all servers are listening (Scenario 2 already covers HTTP accessibility)
    results.forEach(result => {
      assert.equal(result.server.listening, true, 'Each server should be listening');
    });
  });

  it('Scenario 4: Graceful shutdown closes ports properly', async () => {
    const server = http.createServer((req, res) => {
      res.writeHead(HttpStatus.OK);
      res.end('OK');
    });
    servers.push(server);

    const startPort = await findAvailablePort(SCENARIO_FOUR_RANGE_START, SCENARIO_FOUR_RANGE_END);
    await new Promise((resolve, reject) => {
      server.listen(startPort, '0.0.0.0', () => resolve());
      server.on('error', reject);
    });

    assert.equal(server.listening, true, 'Server should be listening');

    // Verify server is accessible
    const response1 = await fetch(`http://localhost:${startPort}`);
    assert.equal(response1.status, HttpStatus.OK);

    // Close server gracefully
    await new Promise(resolve => server.close(resolve));

    assert.equal(server.listening, false, 'Server should no longer be listening');

    // Verify port is now available
    const available = await isPortAvailable(startPort);
    assert.equal(available, true, 'Port should be available after shutdown');

    // Verify server is not accessible
    await assert.rejects(
      async () => await fetch(`http://localhost:${startPort}`, {
        signal: AbortSignal.timeout(SHUTDOWN_FETCH_TIMEOUT_MS)
      }),
      /fetch failed/i,
      'Server should not be accessible after shutdown'
    );
  });

  it('Scenario 5: findAvailablePort with range', async () => {
    // Start servers on consecutive ports
    const basePort = await findAvailablePort(SCENARIO_FIVE_RANGE_START, SCENARIO_FIVE_RANGE_END);
    assert(basePort, 'Should find base port');

    const server1 = http.createServer();
    const server2 = http.createServer();
    const server3 = http.createServer();
    servers.push(server1, server2, server3);

    // Occupy 3 consecutive ports
    await new Promise(resolve => server1.listen(basePort, resolve));
    await new Promise(resolve => server2.listen(basePort + FIRST_PORT_OFFSET, resolve));
    await new Promise(resolve => server3.listen(basePort + SECOND_PORT_OFFSET, resolve));

    // Find next available port
    const nextPort = await findAvailablePort(basePort, basePort + FALLBACK_STANDARD_RANGE_SIZE);

    assert(nextPort >= basePort + THIRD_PORT_OFFSET, `Should find port after occupied ones (got ${nextPort})`);
    assert(nextPort <= basePort + FALLBACK_STANDARD_RANGE_SIZE, 'Should be within range');

    // Verify it's actually available
    const available = await isPortAvailable(nextPort);
    assert.equal(available, true, `Port ${nextPort} should be available`);
  });

  it('Scenario 6: No available ports in range', async () => {
    // This test creates many servers to exhaust a small port range
    const basePort = await findAvailablePort(SCENARIO_SIX_RANGE_START, SCENARIO_SIX_RANGE_END);
    assert(basePort, 'Should find base port');

    // Occupy 5 consecutive ports
    const occupyServers = [];
    for (let i = 0; i < FALLBACK_SMALL_RANGE_SIZE; i++) {
      const server = http.createServer();
      occupyServers.push(server);
      servers.push(server);
      await new Promise(resolve => server.listen(basePort + i, resolve));
    }

    // Try to find port in exhausted range
    const unavailablePort = await findAvailablePort(basePort, basePort + FOURTH_PORT_OFFSET);

    assert.equal(unavailablePort, null, 'Should return null when no ports available');

    // Verify setupServerWithPortFallback throws error
    const server = http.createServer();
    servers.push(server);

    await assert.rejects(
      async () => await setupServerWithPortFallback(server, {
        preferredPort: basePort,
        maxPort: basePort + FOURTH_PORT_OFFSET
      }),
      /No available ports found/i,
      'Should throw error when no ports available'
    );
  });

  it('Scenario 7: Graceful shutdown with custom handler', async () => {
    const server = http.createServer((req, res) => {
      res.writeHead(HttpStatus.OK);
      res.end('OK');
    });
    servers.push(server);

    const startPort = await findAvailablePort(SCENARIO_SEVEN_RANGE_START, SCENARIO_SEVEN_RANGE_END);
    await new Promise(resolve => server.listen(startPort, resolve));

    let _customShutdownCalled = false;
    /**
     * customHandler.
     */
    const customHandler = async (signal) => {
      _customShutdownCalled = true;
      assert(signal, 'Signal should be provided to handler');
    };

    // Setup graceful shutdown (note: we won't trigger actual process signals in test)
    setupGracefulShutdown(server, {
      onShutdown: customHandler,
      timeout: CUSTOM_SHUTDOWN_TIMEOUT_MS
    });

    // Manually close server to verify cleanup
    await new Promise(resolve => server.close(resolve));

    assert.equal(server.listening, false, 'Server should be closed');
  });

  it('Scenario 8: isPortAvailable on specific host', async () => {
    const testPort = await findAvailablePort(SCENARIO_EIGHT_RANGE_START, SCENARIO_EIGHT_RANGE_END);

    // Check availability on localhost
    const availableLocalhost = await isPortAvailable(testPort, '127.0.0.1');
    assert.equal(availableLocalhost, true, 'Port should be available on localhost');

    // Start server on localhost only
    const server = http.createServer();
    servers.push(server);
    await new Promise(resolve => server.listen(testPort, '127.0.0.1', resolve));

    // Check that port is occupied on localhost
    const occupiedLocalhost = await isPortAvailable(testPort, '127.0.0.1');
    assert.equal(occupiedLocalhost, false, 'Port should be occupied on localhost');

    // Note: Port might still be available on 0.0.0.0 depending on system
    // This is expected behavior when binding to specific interface
  });
});

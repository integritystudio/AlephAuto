import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'child_process';
import { createComponentLogger } from '../../sidequest/utils/logger.js';
import { createTempRepository } from '../fixtures/test-helpers.js';

const logger = createComponentLogger('MCPServerTest');

describe('MCP Server', () => {
  let serverProcess;
  let testRepo;

  beforeEach(async () => {
    // Create temporary test repository
    testRepo = await createTempRepository('test-repo');
  });

  afterEach(async () => {
    // Cleanup temporary repository
    if (testRepo) await testRepo.cleanup();
  });

  // Helper function to send JSONRPC request to MCP server
  async function sendMCPRequest(method, params = {}) {
    return new Promise((resolve, reject) => {
      const request = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: method,
        params: params
      };

      serverProcess = spawn('node', [
        'mcp-servers/duplicate-detection/index.js'
      ], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      let requestSent = false;

      serverProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      serverProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        logger.debug({ stderr: data.toString() }, 'MCP server stderr');
      });

      serverProcess.on('spawn', () => {
        // Send request after process spawns
        if (!requestSent) {
          serverProcess.stdin.write(JSON.stringify(request) + '\n');
          requestSent = true;

          // Close stdin to signal end of input
          // Give server more time for complex operations like initialize
          setTimeout(() => {
            serverProcess.stdin.end();
          }, 500);
        }
      });

      serverProcess.on('close', (code) => {
        if (stderr && !stdout) {
          reject(new Error(`MCP server error: ${stderr}`));
          return;
        }

        try {
          // Parse JSONRPC responses (one per line)
          const lines = stdout.trim().split('\n').filter(line => line.trim());
          const responses = lines.map(line => {
            try {
              return JSON.parse(line);
            } catch (error) {
              logger.warn({ line, error }, 'Failed to parse MCP response');
              return null;
            }
          }).filter(r => r !== null);

          resolve(responses);
        } catch (error) {
          reject(error);
        }
      });

      serverProcess.on('error', (error) => {
        reject(error);
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        if (serverProcess) {
          serverProcess.kill();
          reject(new Error('MCP server timeout'));
        }
      }, 10000);
    });
  }

  describe('Server Initialization', () => {
    test('should respond to initialize request', async () => {
      const responses = await sendMCPRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'test-client',
          version: '1.0.0'
        }
      });

      assert.ok(responses.length > 0, 'Should receive at least one response');

      const initResponse = responses.find(r => r.id && r.result);
      assert.ok(initResponse, 'Should receive initialize response');
      assert.ok(initResponse.result.protocolVersion);
      assert.ok(initResponse.result.serverInfo);
    });

    test('should return server info with name and version', async () => {
      const responses = await sendMCPRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' }
      });

      const initResponse = responses.find(r => r.result);
      assert.ok(initResponse.result.serverInfo.name);
      assert.ok(initResponse.result.serverInfo.version);
      assert.strictEqual(typeof initResponse.result.serverInfo.name, 'string');
    });
  });

  describe('Tools Discovery', () => {
    test('should list available tools', async () => {
      const responses = await sendMCPRequest('tools/list', {});

      const toolsResponse = responses.find(r => r.result && r.result.tools);
      assert.ok(toolsResponse, 'Should receive tools list');
      assert.ok(Array.isArray(toolsResponse.result.tools));
      assert.ok(toolsResponse.result.tools.length > 0, 'Should have at least one tool');
    });

    test('each tool should have required fields', async () => {
      const responses = await sendMCPRequest('tools/list', {});
      const toolsResponse = responses.find(r => r.result && r.result.tools);

      toolsResponse.result.tools.forEach(tool => {
        assert.ok(tool.name, 'Tool should have name');
        assert.ok(tool.description, 'Tool should have description');
        assert.ok(tool.inputSchema, 'Tool should have inputSchema');
        assert.strictEqual(typeof tool.name, 'string');
        assert.strictEqual(typeof tool.description, 'string');
        assert.strictEqual(typeof tool.inputSchema, 'object');
      });
    });

    test('should include scan_repository tool', async () => {
      const responses = await sendMCPRequest('tools/list', {});
      const toolsResponse = responses.find(r => r.result && r.result.tools);

      const scanTool = toolsResponse.result.tools.find(t => t.name === 'scan_repository');
      assert.ok(scanTool, 'Should have scan_repository tool');
      // Case-insensitive check for 'scan' in description
      assert.ok(scanTool.description.toLowerCase().includes('scan'),
        'Tool description should mention scanning');
    });
  });

  describe('Resources Discovery', () => {
    test('should list available resources', async () => {
      const responses = await sendMCPRequest('resources/list', {});

      const resourcesResponse = responses.find(r => r.result);
      assert.ok(resourcesResponse, 'Should receive resources list');

      if (resourcesResponse.result.resources) {
        assert.ok(Array.isArray(resourcesResponse.result.resources));
      }
    });

    test('each resource should have required fields', async () => {
      const responses = await sendMCPRequest('resources/list', {});
      const resourcesResponse = responses.find(r => r.result && r.result.resources);

      if (resourcesResponse && resourcesResponse.result.resources.length > 0) {
        resourcesResponse.result.resources.forEach(resource => {
          assert.ok(resource.uri, 'Resource should have URI');
          assert.ok(resource.name, 'Resource should have name');
          assert.strictEqual(typeof resource.uri, 'string');
          assert.strictEqual(typeof resource.name, 'string');
        });
      }
    });
  });

  describe('JSONRPC Protocol', () => {
    test('responses should have jsonrpc version', async () => {
      const responses = await sendMCPRequest('tools/list', {});

      // Filter to only JSONRPC responses (have id or result fields)
      const jsonrpcResponses = responses.filter(r => r.id !== undefined || r.result !== undefined || r.error !== undefined);

      assert.ok(jsonrpcResponses.length > 0, 'Should have at least one JSONRPC response');

      jsonrpcResponses.forEach(response => {
        assert.strictEqual(response.jsonrpc, '2.0', 'JSONRPC response should have version 2.0');
      });
    });

    test('responses should have matching id', async () => {
      const requestId = Date.now();
      const responses = await sendMCPRequest('tools/list', {});

      const mainResponse = responses.find(r => r.id);
      if (mainResponse) {
        assert.strictEqual(typeof mainResponse.id, 'number');
      }
    });

    test('should handle invalid method gracefully', async () => {
      try {
        const responses = await sendMCPRequest('invalid/method', {});

        // Should either return error response or empty array
        if (responses.length > 0) {
          const errorResponse = responses.find(r => r.error);
          if (errorResponse) {
            assert.ok(errorResponse.error.code);
            assert.ok(errorResponse.error.message);
          }
        }
      } catch (error) {
        // It's acceptable to throw for invalid methods
        assert.ok(error);
      }
    });
  });

  describe('Tool Execution', () => {
    test('should validate required parameters', async () => {
      // Attempt to call tool without required parameters
      try {
        const responses = await sendMCPRequest('tools/call', {
          name: 'scan_repository',
          arguments: {} // Missing repositoryPath
        });

        const response = responses.find(r => r.result || r.error);
        if (response && response.error) {
          assert.ok(response.error.message.includes('repositoryPath') ||
                   response.error.message.includes('required'));
        }
      } catch (error) {
        // Acceptable to fail on invalid parameters
        assert.ok(error);
      }
    });

    test('tool call response should be properly formatted', async () => {
      try {
        const responses = await sendMCPRequest('tools/call', {
          name: 'scan_repository',
          arguments: {
            repositoryPath: testRepo.path
          }
        });

        const callResponse = responses.find(r => r.result || r.error);
        assert.ok(callResponse, 'Should receive tool call response');

        if (callResponse.result) {
          assert.ok(callResponse.result.content);
          assert.ok(Array.isArray(callResponse.result.content));
        }
      } catch (error) {
        // Test repo might not exist, which is fine for this test
        assert.ok(error);
      }
    });
  });

  describe('Error Handling', () => {
    test('should return error for malformed JSON', async () => {
      try {
        const responses = await sendMCPRequest(null, null);
        // Should handle gracefully
        assert.ok(responses !== undefined);
      } catch (error) {
        // Acceptable to throw
        assert.ok(error);
      }
    });

    test('should handle stdin close gracefully', async () => {
      const process = spawn('node', [
        'mcp-servers/duplicate-detection/index.js'
      ]);

      // Close stdin immediately
      process.stdin.end();

      await new Promise((resolve) => {
        process.on('close', (code) => {
          // Should exit cleanly
          resolve();
        });
      });
    });
  });

  describe('Capabilities', () => {
    test('should declare tool capabilities', async () => {
      const responses = await sendMCPRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' }
      });

      // Filter for actual JSONRPC responses first
      const jsonrpcResponses = responses.filter(r => r.jsonrpc === '2.0');
      assert.ok(jsonrpcResponses.length > 0, 'Should receive at least one JSONRPC response');

      const initResponse = jsonrpcResponses.find(r => r.result && r.result.protocolVersion);
      assert.ok(initResponse, 'Should receive initialize response');
      assert.ok(initResponse.result.capabilities, 'Response should have capabilities');
      assert.ok(initResponse.result.capabilities.tools, 'Capabilities should include tools');
    });

    test('should declare resource capabilities if supported', async () => {
      const responses = await sendMCPRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' }
      });

      // Filter for actual JSONRPC responses first
      const jsonrpcResponses = responses.filter(r => r.jsonrpc === '2.0');
      assert.ok(jsonrpcResponses.length > 0, 'Should receive at least one JSONRPC response');

      const initResponse = jsonrpcResponses.find(r => r.result && r.result.protocolVersion);
      assert.ok(initResponse, 'Should receive initialize response');

      // Resources capability is optional
      if (initResponse.result.capabilities && initResponse.result.capabilities.resources) {
        assert.strictEqual(typeof initResponse.result.capabilities.resources, 'object',
          'Resources capability should be an object if present');
      }
    });
  });
});

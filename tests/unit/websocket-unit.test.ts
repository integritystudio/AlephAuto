#!/usr/bin/env node
/**
 * WebSocket Unit Tests
 *
 * Unit tests for WebSocket functionality without actual network connections.
 * Tests the exported functions and their expected behavior.
 */

// @ts-nocheck
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'events';
import { createWebSocketServer } from '../../api/websocket.ts';

// Mock WebSocket client
class MockWebSocket extends EventEmitter {
  constructor() {
    super();
    this.readyState = 1; // OPEN
    this.OPEN = 1;
    this.sentMessages = [];
  }

  send(data) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = 3; // CLOSED
    this.emit('close');
  }

  ping() {
    // Mock ping
  }
}

// Mock HTTP Server
class MockHttpServer extends EventEmitter {
  constructor() {
    super();
  }
}

// Mock WebSocketServer (ws library)
class MockWSS extends EventEmitter {
  constructor() {
    super();
    this.clients = new Set();
    this.broadcast = null;
    this.sendToClient = null;
    this.getClientInfo = null;
  }
}

describe('WebSocket Server - Unit Tests', () => {
  let mockHttpServer;
  let wss;

  beforeEach(() => {
    mockHttpServer = new MockHttpServer();
    wss = null;
  });

  afterEach(async () => {
    if (wss) {
      await new Promise((resolve) => wss.close(resolve));
      wss = null;
    }
  });

  describe('createWebSocketServer', () => {
    it('should return a WebSocket server instance', () => {
      wss = createWebSocketServer(mockHttpServer);
      assert.ok(wss);
    });

    it('should add broadcast method to wss', () => {
      wss = createWebSocketServer(mockHttpServer);
      assert.strictEqual(typeof wss.broadcast, 'function');
    });

    it('should add sendToClient method to wss', () => {
      wss = createWebSocketServer(mockHttpServer);
      assert.strictEqual(typeof wss.sendToClient, 'function');
    });

    it('should add getClientInfo method to wss', () => {
      wss = createWebSocketServer(mockHttpServer);
      assert.strictEqual(typeof wss.getClientInfo, 'function');
    });
  });

  describe('getClientInfo', () => {
    it('should return client info structure', () => {
      wss = createWebSocketServer(mockHttpServer);
      const info = wss.getClientInfo();

      assert.ok('total_clients' in info);
      assert.ok('clients' in info);
      assert.ok(Array.isArray(info.clients));
    });

    it('should return 0 clients initially', () => {
      wss = createWebSocketServer(mockHttpServer);
      const info = wss.getClientInfo();

      assert.strictEqual(info.total_clients, 0);
      assert.strictEqual(info.clients.length, 0);
    });
  });

  describe('broadcast', () => {
    it('should not throw when no clients connected', () => {
      wss = createWebSocketServer(mockHttpServer);

      assert.doesNotThrow(() => {
        wss.broadcast({ type: 'test', data: 'hello' });
      });
    });

    it('should accept filter function', () => {
      wss = createWebSocketServer(mockHttpServer);

      assert.doesNotThrow(() => {
        wss.broadcast({ type: 'test' }, (client, clientId) => true);
      });
    });
  });

  describe('sendToClient', () => {
    it('should return false for non-existent client', () => {
      wss = createWebSocketServer(mockHttpServer);
      const result = wss.sendToClient('non-existent-id', { type: 'test' });

      assert.strictEqual(result, false);
    });
  });
});

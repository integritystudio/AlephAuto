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

  beforeEach(() => {
    mockHttpServer = new MockHttpServer();
  });

  describe('createWebSocketServer', () => {
    it('should return a WebSocket server instance', () => {
      const wss = createWebSocketServer(mockHttpServer);
      assert.ok(wss);
      wss.close();
    });

    it('should add broadcast method to wss', () => {
      const wss = createWebSocketServer(mockHttpServer);
      assert.strictEqual(typeof wss.broadcast, 'function');
      wss.close();
    });

    it('should add sendToClient method to wss', () => {
      const wss = createWebSocketServer(mockHttpServer);
      assert.strictEqual(typeof wss.sendToClient, 'function');
      wss.close();
    });

    it('should add getClientInfo method to wss', () => {
      const wss = createWebSocketServer(mockHttpServer);
      assert.strictEqual(typeof wss.getClientInfo, 'function');
      wss.close();
    });
  });

  describe('getClientInfo', () => {
    it('should return client info structure', () => {
      const wss = createWebSocketServer(mockHttpServer);
      const info = wss.getClientInfo();

      assert.ok('total_clients' in info);
      assert.ok('clients' in info);
      assert.ok(Array.isArray(info.clients));
      wss.close();
    });

    it('should return 0 clients initially', () => {
      const wss = createWebSocketServer(mockHttpServer);
      const info = wss.getClientInfo();

      assert.strictEqual(info.total_clients, 0);
      assert.strictEqual(info.clients.length, 0);
      wss.close();
    });
  });

  describe('broadcast', () => {
    it('should not throw when no clients connected', () => {
      const wss = createWebSocketServer(mockHttpServer);

      assert.doesNotThrow(() => {
        wss.broadcast({ type: 'test', data: 'hello' });
      });

      wss.close();
    });

    it('should accept filter function', () => {
      const wss = createWebSocketServer(mockHttpServer);

      assert.doesNotThrow(() => {
        wss.broadcast({ type: 'test' }, (client, clientId) => true);
      });

      wss.close();
    });
  });

  describe('sendToClient', () => {
    it('should return false for non-existent client', () => {
      const wss = createWebSocketServer(mockHttpServer);
      const result = wss.sendToClient('non-existent-id', { type: 'test' });

      assert.strictEqual(result, false);
      wss.close();
    });
  });
});


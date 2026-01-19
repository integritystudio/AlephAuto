#!/usr/bin/env node
/**
 * Dashboard WebSocket URL Derivation Tests
 *
 * Tests the logic for deriving WebSocket URL from API base URL.
 * This is critical for cross-origin setups where the dashboard frontend
 * (e.g., GitHub Pages) connects to a different backend (e.g., Render).
 *
 * Bug fixed: Previously used window.location.host which caused WebSocket
 * to connect to wrong host (e.g., wss://n0ai.app/ws instead of
 * wss://alephauto.onrender.com/ws)
 */

// @ts-nocheck
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Derives WebSocket URL from API base URL
 * This mirrors the logic in public/dashboard.js connectWebSocket()
 *
 * @param {string} apiBaseUrl - The API base URL (e.g., 'https://alephauto.onrender.com')
 * @returns {string} The WebSocket URL (e.g., 'wss://alephauto.onrender.com/ws')
 */
function deriveWebSocketUrl(apiBaseUrl) {
  const apiUrl = new URL(apiBaseUrl);
  const wsProtocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProtocol}//${apiUrl.host}/ws`;
}

describe('Dashboard WebSocket URL Derivation', () => {
  describe('deriveWebSocketUrl', () => {
    it('should derive wss:// from https:// API URL', () => {
      const apiBaseUrl = 'https://alephauto.onrender.com';
      const wsUrl = deriveWebSocketUrl(apiBaseUrl);

      assert.strictEqual(wsUrl, 'wss://alephauto.onrender.com/ws');
    });

    it('should derive ws:// from http:// API URL', () => {
      const apiBaseUrl = 'http://localhost:8080';
      const wsUrl = deriveWebSocketUrl(apiBaseUrl);

      assert.strictEqual(wsUrl, 'ws://localhost:8080/ws');
    });

    it('should preserve port number in URL', () => {
      const apiBaseUrl = 'https://api.example.com:3000';
      const wsUrl = deriveWebSocketUrl(apiBaseUrl);

      assert.strictEqual(wsUrl, 'wss://api.example.com:3000/ws');
    });

    it('should handle localhost with port', () => {
      const apiBaseUrl = 'http://localhost:3000';
      const wsUrl = deriveWebSocketUrl(apiBaseUrl);

      assert.strictEqual(wsUrl, 'ws://localhost:3000/ws');
    });

    it('should handle IP address with port', () => {
      const apiBaseUrl = 'http://192.168.1.100:8080';
      const wsUrl = deriveWebSocketUrl(apiBaseUrl);

      assert.strictEqual(wsUrl, 'ws://192.168.1.100:8080/ws');
    });

    it('should handle subdomain URLs', () => {
      const apiBaseUrl = 'https://api.staging.example.com';
      const wsUrl = deriveWebSocketUrl(apiBaseUrl);

      assert.strictEqual(wsUrl, 'wss://api.staging.example.com/ws');
    });

    it('should ignore path in API URL', () => {
      const apiBaseUrl = 'https://example.com/api/v1';
      const wsUrl = deriveWebSocketUrl(apiBaseUrl);

      // WebSocket connects to root /ws, not nested path
      assert.strictEqual(wsUrl, 'wss://example.com/ws');
    });

    it('should ignore query parameters in API URL', () => {
      const apiBaseUrl = 'https://example.com?token=abc';
      const wsUrl = deriveWebSocketUrl(apiBaseUrl);

      assert.strictEqual(wsUrl, 'wss://example.com/ws');
    });
  });

  describe('Cross-origin scenario (GitHub Pages + Render)', () => {
    it('should connect to Render backend, not GitHub Pages frontend', () => {
      // Simulates the bug scenario:
      // - Dashboard served from https://n0ai.app (GitHub Pages)
      // - API base URL configured to https://alephauto.onrender.com
      // - WebSocket should connect to Render, not GitHub Pages

      const githubPagesHost = 'n0ai.app';
      const renderApiBaseUrl = 'https://alephauto.onrender.com';

      const wsUrl = deriveWebSocketUrl(renderApiBaseUrl);

      // CRITICAL: WebSocket URL should NOT contain GitHub Pages host
      assert.ok(!wsUrl.includes(githubPagesHost),
        `WebSocket URL should not contain GitHub Pages host: ${wsUrl}`);

      // WebSocket URL should contain Render host
      assert.ok(wsUrl.includes('alephauto.onrender.com'),
        `WebSocket URL should contain Render host: ${wsUrl}`);

      assert.strictEqual(wsUrl, 'wss://alephauto.onrender.com/ws');
    });

    it('should use correct protocol based on API URL, not frontend URL', () => {
      // Even if frontend is HTTP (e.g., local dev serving GitHub Pages),
      // WebSocket should use WSS if API is HTTPS

      const apiBaseUrl = 'https://alephauto.onrender.com';
      const wsUrl = deriveWebSocketUrl(apiBaseUrl);

      assert.ok(wsUrl.startsWith('wss://'),
        'Should use wss:// for https:// API regardless of frontend protocol');
    });
  });

  describe('Local development scenarios', () => {
    it('should work for typical local development setup', () => {
      const apiBaseUrl = 'http://localhost:8080';
      const wsUrl = deriveWebSocketUrl(apiBaseUrl);

      assert.strictEqual(wsUrl, 'ws://localhost:8080/ws');
    });

    it('should work when API runs on different port than frontend', () => {
      // Frontend on port 3000, API on port 8080
      const apiBaseUrl = 'http://localhost:8080';
      const wsUrl = deriveWebSocketUrl(apiBaseUrl);

      assert.ok(wsUrl.includes(':8080'),
        'Should connect to API port, not frontend port');
    });

    it('should work for Docker/container setups with service names', () => {
      const apiBaseUrl = 'http://api-service:8080';
      const wsUrl = deriveWebSocketUrl(apiBaseUrl);

      assert.strictEqual(wsUrl, 'ws://api-service:8080/ws');
    });
  });

  describe('Edge cases', () => {
    it('should handle trailing slash in API URL', () => {
      const apiBaseUrl = 'https://example.com/';
      const wsUrl = deriveWebSocketUrl(apiBaseUrl);

      assert.strictEqual(wsUrl, 'wss://example.com/ws');
    });

    it('should handle URL without explicit port (https default 443)', () => {
      const apiBaseUrl = 'https://example.com';
      const wsUrl = deriveWebSocketUrl(apiBaseUrl);

      // URL.host doesn't include default ports
      assert.strictEqual(wsUrl, 'wss://example.com/ws');
      assert.ok(!wsUrl.includes(':443'), 'Should not include default HTTPS port');
    });

    it('should handle URL without explicit port (http default 80)', () => {
      const apiBaseUrl = 'http://example.com';
      const wsUrl = deriveWebSocketUrl(apiBaseUrl);

      assert.strictEqual(wsUrl, 'ws://example.com/ws');
      assert.ok(!wsUrl.includes(':80'), 'Should not include default HTTP port');
    });

    it('should throw for invalid URL', () => {
      assert.throws(() => {
        deriveWebSocketUrl('not-a-valid-url');
      }, /Invalid URL/);
    });

    it('should throw for empty string', () => {
      assert.throws(() => {
        deriveWebSocketUrl('');
      }, /Invalid URL/);
    });
  });
});

describe('Protocol mapping', () => {
  const protocolMappings = [
    { http: 'http:', ws: 'ws:' },
    { http: 'https:', ws: 'wss:' },
  ];

  protocolMappings.forEach(({ http, ws }) => {
    it(`should map ${http} to ${ws}`, () => {
      const apiUrl = new URL(`${http}//example.com`);
      const wsProtocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';

      assert.strictEqual(wsProtocol, ws);
    });
  });
});

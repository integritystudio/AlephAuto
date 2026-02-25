/**
 * Event Broadcaster Unit Tests
 *
 * Tests for the ScanEventBroadcaster class which handles
 * broadcasting events to WebSocket clients.
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import { ScanEventBroadcaster } from '../../api/event-broadcaster.ts';

describe('ScanEventBroadcaster', () => {
  let broadcaster;
  let mockWss;
  let broadcastedMessages;

  beforeEach(() => {
    broadcastedMessages = [];

    // Create mock WebSocket server
    mockWss = {
      broadcast: mock.fn((message, filter) => {
        broadcastedMessages.push({ message, filter });
      }),
      sendToClient: mock.fn((_clientId, _message) => {
        return true;
      }),
      getClientInfo: mock.fn(() => ({
        total_clients: 2,
        clients: [
          { id: 'client-1', subscriptions: ['scans', 'alerts'] },
          { id: 'client-2', subscriptions: ['stats'] }
        ]
      }))
    };

    broadcaster = new ScanEventBroadcaster(mockWss);
  });

  describe('constructor', () => {
    it('should initialize with WebSocket server', () => {
      assert.strictEqual(broadcaster.wss, mockWss);
    });

    it('should handle null WebSocket server', () => {
      const nullBroadcaster = new ScanEventBroadcaster(null);
      assert.strictEqual(nullBroadcaster.wss, null);
    });
  });

  describe('broadcastScanStarted', () => {
    it('should broadcast scan started event with intra-project scan', () => {
      broadcaster.broadcastScanStarted('scan-123', {
        scanType: 'intra-project',
        repository: '/path/to/repo'
      });

      assert.strictEqual(broadcastedMessages.length, 1);
      const { message, filter } = broadcastedMessages[0];

      assert.strictEqual(message.type, 'scan:started');
      assert.strictEqual(message.scan_id, 'scan-123');
      assert.strictEqual(message.scan_type, 'intra-project');
      assert.strictEqual(message.repository, '/path/to/repo');
      assert.ok(message.timestamp);
      assert.ok(filter); // Should have filter for 'scans' channel
    });

    it('should broadcast scan started event with inter-project scan', () => {
      broadcaster.broadcastScanStarted('scan-456', {
        scanType: 'inter-project',
        repositories: ['/repo1', '/repo2']
      });

      assert.strictEqual(broadcastedMessages.length, 1);
      const { message } = broadcastedMessages[0];

      assert.strictEqual(message.type, 'scan:started');
      assert.strictEqual(message.scan_type, 'inter-project');
      assert.deepStrictEqual(message.repository, ['/repo1', '/repo2']);
    });

    it('should default to intra-project scan type', () => {
      broadcaster.broadcastScanStarted('scan-789', {
        repository: '/path/to/repo'
      });

      const { message } = broadcastedMessages[0];
      assert.strictEqual(message.scan_type, 'intra-project');
    });
  });

  describe('broadcastProgress', () => {
    it('should broadcast progress event with all details', () => {
      broadcaster.broadcastProgress('scan-123', {
        stage: 'scanning',
        percent: 50,
        message: 'Processing files...',
        currentFile: 'src/index.js',
        filesProcessed: 25,
        totalFiles: 50
      });

      assert.strictEqual(broadcastedMessages.length, 1);
      const { message } = broadcastedMessages[0];

      assert.strictEqual(message.type, 'scan:progress');
      assert.strictEqual(message.scan_id, 'scan-123');
      assert.strictEqual(message.stage, 'scanning');
      assert.strictEqual(message.percent, 50);
      assert.strictEqual(message.message, 'Processing files...');
      assert.strictEqual(message.current_file, 'src/index.js');
      assert.strictEqual(message.files_processed, 25);
      assert.strictEqual(message.total_files, 50);
      assert.ok(message.timestamp);
    });
  });

  describe('broadcastDuplicateFound', () => {
    it('should broadcast duplicate found event', () => {
      broadcaster.broadcastDuplicateFound('scan-123', {
        group_id: 'dup-001',
        pattern_id: 'pattern-1',
        occurrence_count: 3,
        impact_score: 0.85,
        similarity_score: 0.95,
        affected_files: ['file1.js', 'file2.js', 'file3.js']
      });

      assert.strictEqual(broadcastedMessages.length, 1);
      const { message } = broadcastedMessages[0];

      assert.strictEqual(message.type, 'duplicate:found');
      assert.strictEqual(message.scan_id, 'scan-123');
      assert.strictEqual(message.duplicate.group_id, 'dup-001');
      assert.strictEqual(message.duplicate.pattern_id, 'pattern-1');
      assert.strictEqual(message.duplicate.occurrence_count, 3);
      assert.strictEqual(message.duplicate.impact_score, 0.85);
      assert.strictEqual(message.duplicate.similarity_score, 0.95);
    });

    it('should limit affected files to 5', () => {
      broadcaster.broadcastDuplicateFound('scan-123', {
        group_id: 'dup-001',
        affected_files: ['f1.js', 'f2.js', 'f3.js', 'f4.js', 'f5.js', 'f6.js', 'f7.js']
      });

      const { message } = broadcastedMessages[0];
      assert.strictEqual(message.duplicate.affected_files.length, 5);
    });

    it('should handle undefined affected_files', () => {
      broadcaster.broadcastDuplicateFound('scan-123', {
        group_id: 'dup-001'
      });

      const { message } = broadcastedMessages[0];
      assert.strictEqual(message.duplicate.affected_files, undefined);
    });
  });

  describe('broadcastScanCompleted', () => {
    it('should broadcast scan completed event with metrics', () => {
      broadcaster.broadcastScanCompleted('scan-123', {
        duration_seconds: 45.5,
        metrics: {
          total_duplicate_groups: 10,
          total_suggestions: 15,
          total_duplicated_lines: 500,
          high_impact_duplicates: 3
        }
      });

      assert.strictEqual(broadcastedMessages.length, 1);
      const { message } = broadcastedMessages[0];

      assert.strictEqual(message.type, 'scan:completed');
      assert.strictEqual(message.scan_id, 'scan-123');
      assert.strictEqual(message.duration, 45.5);
      assert.strictEqual(message.metrics.duplicate_groups, 10);
      assert.strictEqual(message.metrics.suggestions, 15);
      assert.strictEqual(message.metrics.duplicated_lines, 500);
      assert.strictEqual(message.metrics.high_impact, 3);
    });

    it('should handle missing metrics', () => {
      broadcaster.broadcastScanCompleted('scan-123', {
        duration_seconds: 30
      });

      const { message } = broadcastedMessages[0];
      assert.strictEqual(message.metrics.duplicate_groups, 0);
      assert.strictEqual(message.metrics.suggestions, 0);
      assert.strictEqual(message.metrics.duplicated_lines, 0);
      assert.strictEqual(message.metrics.high_impact, 0);
    });
  });

  describe('broadcastScanFailed', () => {
    it('should broadcast scan failed event with error details', () => {
      const error = new Error('Scan failed due to timeout');
      error.code = 'ETIMEDOUT';

      broadcaster.broadcastScanFailed('scan-123', error);

      assert.strictEqual(broadcastedMessages.length, 1);
      const { message } = broadcastedMessages[0];

      assert.strictEqual(message.type, 'scan:failed');
      assert.strictEqual(message.scan_id, 'scan-123');
      assert.strictEqual(message.error.message, 'Scan failed due to timeout');
      assert.strictEqual(message.error.code, 'ETIMEDOUT');
      assert.ok(message.timestamp);
    });

    it('should handle error without code', () => {
      const error = new Error('Generic error');

      broadcaster.broadcastScanFailed('scan-123', error);

      const { message } = broadcastedMessages[0];
      assert.strictEqual(message.error.message, 'Generic error');
      assert.strictEqual(message.error.code, undefined);
    });
  });

  describe('broadcastHighImpactAlert', () => {
    it('should broadcast high impact alert', () => {
      broadcaster.broadcastHighImpactAlert('scan-123', {
        group_id: 'dup-high-001',
        impact_score: 0.95,
        occurrence_count: 10,
        total_lines: 500,
        affected_files: ['file1.js', 'file2.js']
      });

      assert.strictEqual(broadcastedMessages.length, 1);
      const { message } = broadcastedMessages[0];

      assert.strictEqual(message.type, 'alert:high-impact');
      assert.strictEqual(message.scan_id, 'scan-123');
      assert.strictEqual(message.duplicate.group_id, 'dup-high-001');
      assert.strictEqual(message.duplicate.impact_score, 0.95);
      assert.strictEqual(message.duplicate.occurrence_count, 10);
      assert.strictEqual(message.duplicate.duplicated_lines, 500);
    });
  });

  describe('broadcastCacheEvent', () => {
    it('should broadcast cache hit event', () => {
      broadcaster.broadcastCacheEvent('hit', {
        repository: '/path/to/repo',
        commitHash: 'abc123',
        cacheAge: 3600
      });

      assert.strictEqual(broadcastedMessages.length, 1);
      const { message } = broadcastedMessages[0];

      assert.strictEqual(message.type, 'cache:hit');
      assert.strictEqual(message.repository, '/path/to/repo');
      assert.strictEqual(message.commit_hash, 'abc123');
      assert.strictEqual(message.cache_age, 3600);
    });

    it('should broadcast cache miss event', () => {
      broadcaster.broadcastCacheEvent('miss', {
        repository: '/path/to/repo'
      });

      const { message } = broadcastedMessages[0];
      assert.strictEqual(message.type, 'cache:miss');
    });

    it('should broadcast cache invalidate event', () => {
      broadcaster.broadcastCacheEvent('invalidate', {
        repository: '/path/to/repo'
      });

      const { message } = broadcastedMessages[0];
      assert.strictEqual(message.type, 'cache:invalidate');
    });
  });

  describe('broadcastStatsUpdate', () => {
    it('should broadcast stats update event', () => {
      broadcaster.broadcastStatsUpdate({
        totalScans: 100,
        activeScans: 2,
        queueSize: 5,
        cacheHitRate: 0.75,
        duplicatesFound: 500
      });

      assert.strictEqual(broadcastedMessages.length, 1);
      const { message } = broadcastedMessages[0];

      assert.strictEqual(message.type, 'stats:update');
      assert.strictEqual(message.stats.total_scans, 100);
      assert.strictEqual(message.stats.active_scans, 2);
      assert.strictEqual(message.stats.queue_size, 5);
      assert.strictEqual(message.stats.cache_hit_rate, 0.75);
      assert.strictEqual(message.stats.duplicates_found, 500);
    });
  });

  describe('broadcast', () => {
    it('should not broadcast when wss is null', () => {
      const nullBroadcaster = new ScanEventBroadcaster(null);
      nullBroadcaster.broadcast({ type: 'test' });

      // Should not throw, just log warning
      assert.strictEqual(broadcastedMessages.length, 0);
    });

    it('should broadcast without channel filter', () => {
      broadcaster.broadcast({ type: 'test:message', data: 'test' });

      assert.strictEqual(broadcastedMessages.length, 1);
      const { message, filter } = broadcastedMessages[0];

      assert.strictEqual(message.type, 'test:message');
      assert.strictEqual(filter, null);
    });

    it('should broadcast with channel filter', () => {
      broadcaster.broadcast({ type: 'test:message' }, 'custom-channel');

      assert.strictEqual(broadcastedMessages.length, 1);
      const { filter } = broadcastedMessages[0];

      assert.ok(filter);
    });
  });

  describe('sendToClient', () => {
    it('should send message to specific client', () => {
      const result = broadcaster.sendToClient('client-123', { type: 'direct:message' });

      assert.strictEqual(result, true);
      assert.strictEqual(mockWss.sendToClient.mock.calls.length, 1);
      assert.strictEqual(mockWss.sendToClient.mock.calls[0].arguments[0], 'client-123');
    });

    it('should return false when wss is null', () => {
      const nullBroadcaster = new ScanEventBroadcaster(null);
      const result = nullBroadcaster.sendToClient('client-123', { type: 'test' });

      assert.strictEqual(result, false);
    });
  });

  describe('getClientInfo', () => {
    it('should return client information', () => {
      const info = broadcaster.getClientInfo();

      assert.strictEqual(info.total_clients, 2);
      assert.strictEqual(info.clients.length, 2);
      assert.strictEqual(info.clients[0].id, 'client-1');
    });

    it('should return empty info when wss is null', () => {
      const nullBroadcaster = new ScanEventBroadcaster(null);
      const info = nullBroadcaster.getClientInfo();

      assert.strictEqual(info.total_clients, 0);
      assert.deepStrictEqual(info.clients, []);
    });
  });
});

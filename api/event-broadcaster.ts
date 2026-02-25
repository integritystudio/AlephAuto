/**
 * Event Broadcaster
 *
 * Broadcasts duplicate detection events to WebSocket clients.
 */

import type { ExtendedError } from '../sidequest/pipeline-core/errors/error-classifier.ts';
import { createComponentLogger } from '../sidequest/utils/logger.ts';
import type { ExtendedWebSocketServer, WsClientInfo } from './websocket.ts';

const logger = createComponentLogger('EventBroadcaster');

export class ScanEventBroadcaster {
  wss: ExtendedWebSocketServer | null;

  constructor(wss: ExtendedWebSocketServer | null) {
    this.wss = wss;
  }

  /**
   * Broadcast scan started event
   */
  broadcastScanStarted(scanId: string, details: Record<string, unknown>): void {
    this.broadcast({
      type: 'scan:started',
      scan_id: scanId,
      scan_type: details.scanType || 'intra-project',
      repository: details.repository || details.repositories,
      timestamp: new Date().toISOString()
    }, 'scans');
  }

  /**
   * Broadcast scan progress event
   */
  broadcastProgress(scanId: string, progress: Record<string, unknown>): void {
    this.broadcast({
      type: 'scan:progress',
      scan_id: scanId,
      stage: progress.stage,
      percent: progress.percent,
      message: progress.message,
      current_file: progress.currentFile,
      files_processed: progress.filesProcessed,
      total_files: progress.totalFiles,
      timestamp: new Date().toISOString()
    }, 'scans');
  }

  /**
   * Broadcast duplicate found event
   */
  broadcastDuplicateFound(scanId: string, duplicate: Record<string, unknown>): void {
    this.broadcast({
      type: 'duplicate:found',
      scan_id: scanId,
      duplicate: {
        group_id: duplicate.group_id,
        pattern_id: duplicate.pattern_id,
        occurrence_count: duplicate.occurrence_count,
        impact_score: duplicate.impact_score,
        similarity_score: duplicate.similarity_score,
        affected_files: (duplicate.affected_files as unknown[])?.slice(0, 5) // Limit to 5 files
      },
      timestamp: new Date().toISOString()
    }, 'scans');
  }

  /**
   * Broadcast scan completed event
   */
  broadcastScanCompleted(scanId: string, results: Record<string, unknown>): void {
    const metrics = results.metrics as Record<string, unknown> | undefined;
    this.broadcast({
      type: 'scan:completed',
      scan_id: scanId,
      duration: results.duration_seconds,
      metrics: {
        duplicate_groups: (metrics?.total_duplicate_groups as number) || 0,
        suggestions: (metrics?.total_suggestions as number) || 0,
        duplicated_lines: (metrics?.total_duplicated_lines as number) || 0,
        high_impact: (metrics?.high_impact_duplicates as number) || 0
      },
      timestamp: new Date().toISOString()
    }, 'scans');
  }

  /**
   * Broadcast scan failed event
   */
  broadcastScanFailed(scanId: string, error: Error): void {
    const extError = error as ExtendedError;
    this.broadcast({
      type: 'scan:failed',
      scan_id: scanId,
      error: {
        message: error.message,
        code: extError.code
      },
      timestamp: new Date().toISOString()
    }, 'scans');
  }

  /**
   * Broadcast high-impact duplicate alert
   */
  broadcastHighImpactAlert(scanId: string, duplicate: Record<string, unknown>): void {
    this.broadcast({
      type: 'alert:high-impact',
      scan_id: scanId,
      duplicate: {
        group_id: duplicate.group_id,
        impact_score: duplicate.impact_score,
        occurrence_count: duplicate.occurrence_count,
        duplicated_lines: duplicate.total_lines,
        affected_files: duplicate.affected_files
      },
      timestamp: new Date().toISOString()
    }, 'alerts');
  }

  /**
   * Broadcast cache event
   */
  broadcastCacheEvent(eventType: string, details: Record<string, unknown>): void {
    this.broadcast({
      type: `cache:${eventType}`,
      repository: details.repository,
      commit_hash: details.commitHash,
      cache_age: details.cacheAge,
      timestamp: new Date().toISOString()
    }, 'cache');
  }

  /**
   * Broadcast system stats update
   */
  broadcastStatsUpdate(stats: Record<string, unknown>): void {
    this.broadcast({
      type: 'stats:update',
      stats: {
        total_scans: stats.totalScans,
        active_scans: stats.activeScans,
        queue_size: stats.queueSize,
        cache_hit_rate: stats.cacheHitRate,
        duplicates_found: stats.duplicatesFound
      },
      timestamp: new Date().toISOString()
    }, 'stats');
  }

  /**
   * Broadcast message to subscribed clients
   */
  broadcast(message: Record<string, unknown>, channel: string | null = null): void {
    if (!this.wss) {
      logger.warn('WebSocket server not initialized');
      return;
    }

    // Filter clients by subscription if channel specified
    const filter = channel
      ? (client: { subscriptions: Set<string> }) => client.subscriptions.has(channel) || client.subscriptions.has('*')
      : null;

    this.wss.broadcast(message, filter);

    logger.debug({
      messageType: message.type,
      channel
    }, 'Event broadcasted');
  }

  /**
   * Send message to specific client
   */
  sendToClient(clientId: string, message: Record<string, unknown>): boolean {
    if (!this.wss) {
      logger.warn('WebSocket server not initialized');
      return false;
    }

    return this.wss.sendToClient(clientId, message);
  }

  /**
   * Get connected clients info
   */
  getClientInfo(): { total_clients: number; clients: WsClientInfo[] } {
    if (!this.wss) {
      return { total_clients: 0, clients: [] };
    }

    return this.wss.getClientInfo();
  }
}

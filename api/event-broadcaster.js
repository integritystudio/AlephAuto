/**
 * Event Broadcaster
 *
 * Broadcasts duplicate detection events to WebSocket clients.
 */

// @ts-check
/** @typedef {import('../sidequest/pipeline-core/errors/error-types').ExtendedError} ExtendedError */

import { createComponentLogger } from '../sidequest/utils/logger.ts';

const logger = createComponentLogger('EventBroadcaster');

export class ScanEventBroadcaster {
  constructor(wss) {
    this.wss = wss;
  }

  /**
   * Broadcast scan started event
   * @param {string} scanId - Scan ID
   * @param {Object} details - Scan details
   */
  broadcastScanStarted(scanId, details) {
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
   * @param {string} scanId - Scan ID
   * @param {Object} progress - Progress details
   */
  broadcastProgress(scanId, progress) {
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
   * @param {string} scanId - Scan ID
   * @param {Object} duplicate - Duplicate details
   */
  broadcastDuplicateFound(scanId, duplicate) {
    this.broadcast({
      type: 'duplicate:found',
      scan_id: scanId,
      duplicate: {
        group_id: duplicate.group_id,
        pattern_id: duplicate.pattern_id,
        occurrence_count: duplicate.occurrence_count,
        impact_score: duplicate.impact_score,
        similarity_score: duplicate.similarity_score,
        affected_files: duplicate.affected_files?.slice(0, 5) // Limit to 5 files
      },
      timestamp: new Date().toISOString()
    }, 'scans');
  }

  /**
   * Broadcast scan completed event
   * @param {string} scanId - Scan ID
   * @param {Object} results - Scan results
   */
  broadcastScanCompleted(scanId, results) {
    this.broadcast({
      type: 'scan:completed',
      scan_id: scanId,
      duration: results.duration_seconds,
      metrics: {
        duplicate_groups: results.metrics?.total_duplicate_groups || 0,
        suggestions: results.metrics?.total_suggestions || 0,
        duplicated_lines: results.metrics?.total_duplicated_lines || 0,
        high_impact: results.metrics?.high_impact_duplicates || 0
      },
      timestamp: new Date().toISOString()
    }, 'scans');
  }

  /**
   * Broadcast scan failed event
   * @param {string} scanId - Scan ID
   * @param {Error} error - Error details
   */
  broadcastScanFailed(scanId, error) {
    const extError = /** @type {ExtendedError} */ (error);
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
   * @param {string} scanId - Scan ID
   * @param {Object} duplicate - High-impact duplicate
   */
  broadcastHighImpactAlert(scanId, duplicate) {
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
   * @param {string} eventType - Event type (hit/miss/invalidate)
   * @param {Object} details - Event details
   */
  broadcastCacheEvent(eventType, details) {
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
   * @param {Object} stats - System statistics
   */
  broadcastStatsUpdate(stats) {
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
   * @param {Object} message - Message to broadcast
   * @param {string} channel - Channel name
   */
  broadcast(message, channel = null) {
    if (!this.wss) {
      logger.warn('WebSocket server not initialized');
      return;
    }

    // Filter clients by subscription if channel specified
    const filter = channel
      ? (client) => client.subscriptions.has(channel) || client.subscriptions.has('*')
      : null;

    this.wss.broadcast(message, filter);

    logger.debug({
      messageType: message.type,
      channel
    }, 'Event broadcasted');
  }

  /**
   * Send message to specific client
   * @param {string} clientId - Client ID
   * @param {Object} message - Message to send
   */
  sendToClient(clientId, message) {
    if (!this.wss) {
      logger.warn('WebSocket server not initialized');
      return false;
    }

    return this.wss.sendToClient(clientId, message);
  }

  /**
   * Get connected clients info
   * @returns {Object} - Clients information
   */
  getClientInfo() {
    if (!this.wss) {
      return { total_clients: 0, clients: [] };
    }

    return this.wss.getClientInfo();
  }
}

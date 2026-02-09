/**
 * WebSocket Service
 * Real-time updates via native WebSocket
 *
 * Connects to the backend's native WebSocket server (ws package)
 */

import { useDashboardStore } from '../store/dashboard';
import { ActivityType } from '../types';
import type { Job, Pipeline, ActivityItem } from '../types';

/**
 * WebSocket Service
 *
 * Manages WebSocket connection for real-time dashboard updates.
 * Automatically handles reconnection and updates the Zustand store.
 */
class WebSocketService {
  private socket: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Connect to WebSocket server
   */
  connect(): void {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = import.meta.env.VITE_WS_HOST || window.location.host;
    const WS_URL = `${protocol}//${host}/ws`;

    console.log('[WebSocket] Connecting to:', WS_URL);

    try {
      this.socket = new WebSocket(WS_URL);
      this.setupEventListeners();
    } catch (error) {
      console.error('[WebSocket] Failed to create connection:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    if (!this.socket) return;

    this.socket.onopen = () => {
      console.log('[WebSocket] Connected');
      this.reconnectAttempts = 0;
      this.updateConnectionStatus(true);
      this.startHeartbeat();
    };

    this.socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        console.error('[WebSocket] Failed to parse message:', error);
      }
    };

    this.socket.onclose = (event) => {
      console.log('[WebSocket] Disconnected:', event.reason || 'Connection closed');
      this.updateConnectionStatus(false);
      this.stopHeartbeat();
      this.scheduleReconnect();
    };

    this.socket.onerror = (error) => {
      console.error('[WebSocket] Error:', error);
      this.updateConnectionStatus(false);
    };
  }

  /**
   * Handle incoming message
   */
  private handleMessage(message: any): void {
    console.log('[WebSocket] Received:', message.type);

    switch (message.type) {
      case 'connected':
        console.log('[WebSocket] Server welcome:', message.message);
        // Subscribe to all channels including activity feed
        this.send({
          type: 'subscribe',
          channels: ['jobs', 'pipelines', 'system', 'activity', 'scans', '*']
        });
        break;

      case 'subscribed':
        console.log('[WebSocket] Subscribed to channels:', message.channels);
        break;

      case 'pong':
        // Heartbeat response
        break;

      case 'job:created':
        this.handleJobCreated(message.data);
        break;

      case 'job:started':
        this.handleJobStarted(message.data);
        break;

      case 'job:progress':
        this.handleJobProgress(message.data);
        break;

      case 'job:completed':
        this.handleJobCompleted(message.data);
        break;

      case 'job:failed':
        this.handleJobFailed(message.data);
        break;

      case 'job:cancelled':
        this.handleJobCancelled(message.data);
        break;

      case 'pipeline:status':
        this.handlePipelineStatus(message.data);
        break;

      case 'system:status':
        useDashboardStore.getState().setSystemStatus(message.data);
        break;

      case 'activity:new':
        // Handle real-time activity from backend
        console.log('[WebSocket] New activity:', message.activity);
        if (message.activity) {
          this.handleActivityEvent(message.activity);
        }
        break;

      case 'error':
        console.error('[WebSocket] Server error:', message.error);
        break;

      default:
        console.log('[WebSocket] Unknown message type:', message.type);
    }
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping' });
      }
    }, 25000); // 25 seconds
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Schedule reconnection
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WebSocket] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * this.reconnectAttempts, 10000);

    console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Update connection status in store
   */
  private updateConnectionStatus(connected: boolean): void {
    const store = useDashboardStore.getState();
    store.setSystemStatus({
      ...store.systemStatus,
      websocketConnected: connected,
      lastUpdate: new Date().toISOString(),
    });
  }

  /**
   * Handle job created event
   */
  private handleJobCreated(job: Job): void {
    const store = useDashboardStore.getState();

    // Add to queued jobs
    store.setQueuedJobs([...store.queuedJobs, job]);

    // Add activity item
    this.addActivity({
      id: `activity-${job.id}-created`,
      type: 'queued' as ActivityType,
      pipelineId: job.pipelineId,
      pipelineName: job.pipelineName || 'Unknown Pipeline',
      message: `Job ${job.id.substring(0, 8)}... queued`,
      timestamp: new Date().toISOString(),
      jobId: job.id,
    });
  }

  /**
   * Handle job started event
   */
  private handleJobStarted(job: Job): void {
    const store = useDashboardStore.getState();

    // Move from queued to active
    store.setQueuedJobs(store.queuedJobs.filter((j) => j.id !== job.id));
    store.setActiveJobs([...store.activeJobs, job]);

    // Update pipeline status
    store.updatePipeline(job.pipelineId, {
      status: 'running' as any,
      currentJob: job.id,
    });

    // Add activity item
    this.addActivity({
      id: `activity-${job.id}-started`,
      type: 'started' as ActivityType,
      pipelineId: job.pipelineId,
      pipelineName: job.pipelineName || 'Unknown Pipeline',
      message: `Job ${job.id.substring(0, 8)}... started`,
      timestamp: new Date().toISOString(),
      jobId: job.id,
    });
  }

  /**
   * Handle job progress event
   */
  private handleJobProgress(data: { jobId: string; progress: number; currentOperation?: string }): void {
    const store = useDashboardStore.getState();
    store.updateJob(data.jobId, {
      progress: data.progress,
      currentOperation: data.currentOperation,
    });
  }

  /**
   * Handle job completed event
   */
  private handleJobCompleted(job: Job): void {
    const store = useDashboardStore.getState();

    // Remove from active jobs
    store.setActiveJobs(store.activeJobs.filter((j) => j.id !== job.id));

    // Add activity item
    this.addActivity({
      id: `activity-${job.id}-completed`,
      type: 'completed' as ActivityType,
      pipelineId: job.pipelineId,
      pipelineName: job.pipelineName || 'Unknown Pipeline',
      message: `Job ${job.id.substring(0, 8)}... completed successfully`,
      timestamp: new Date().toISOString(),
      jobId: job.id,
      severity: 'success',
      details: job.results,
    });
  }

  /**
   * Handle job failed event
   */
  private handleJobFailed(job: Job): void {
    const store = useDashboardStore.getState();

    // Remove from active jobs
    store.setActiveJobs(store.activeJobs.filter((j) => j.id !== job.id));

    // Update pipeline status
    store.updatePipeline(job.pipelineId, {
      status: 'failed' as any,
      lastError: job.error,
    });

    // Add activity item
    this.addActivity({
      id: `activity-${job.id}-failed`,
      type: 'failed' as ActivityType,
      pipelineId: job.pipelineId,
      pipelineName: job.pipelineName || 'Unknown Pipeline',
      message: `Job ${job.id.substring(0, 8)}... failed: ${job.error || 'Unknown error'}`,
      timestamp: new Date().toISOString(),
      jobId: job.id,
      severity: 'error',
      details: {
        error: job.error,
        errorType: job.errorType,
      },
    });
  }

  /**
   * Handle job cancelled event
   */
  private handleJobCancelled(job: Job): void {
    const store = useDashboardStore.getState();

    // Remove from active/queued jobs
    store.removeJob(job.id);

    // Add activity item
    this.addActivity({
      id: `activity-${job.id}-cancelled`,
      type: 'cancelled' as ActivityType,
      pipelineId: job.pipelineId,
      pipelineName: job.pipelineName || 'Unknown Pipeline',
      message: `Job ${job.id.substring(0, 8)}... cancelled`,
      timestamp: new Date().toISOString(),
      jobId: job.id,
      severity: 'warning',
    });
  }

  /**
   * Handle pipeline status event
   */
  private handlePipelineStatus(pipeline: Pipeline): void {
    useDashboardStore.getState().updatePipeline(pipeline.id, pipeline);
  }

  /**
   * Handle activity event from backend ActivityFeed
   */
  private handleActivityEvent(activity: any): void {
    // Map backend activity types to frontend ActivityType
    const typeMapping: Record<string, ActivityType> = {
      'job:created': ActivityType.QUEUED,
      'job:started': ActivityType.STARTED,
      'job:completed': ActivityType.COMPLETED,
      'job:failed': ActivityType.FAILED,
      'job:cancelled': ActivityType.CANCELLED,
      'retry:created': ActivityType.STARTED,
      'retry:max-attempts': ActivityType.FAILED,
    };

    const activityType = typeMapping[activity.type] || ActivityType.PROGRESS;

    // Add activity to the feed
    this.addActivity({
      id: `activity-${activity.id || Date.now()}`,
      type: activityType,
      pipelineId: activity.jobType || 'unknown',
      pipelineName: activity.jobType || 'Unknown Pipeline',
      message: activity.message || `${activity.event}: ${activity.jobId}`,
      timestamp: activity.timestamp || new Date().toISOString(),
      jobId: activity.jobId,
      severity: activity.type?.includes('failed') ? 'error' : activity.type?.includes('completed') ? 'success' : undefined,
    });
  }

  /**
   * Add activity to feed
   */
  private addActivity(activity: Omit<ActivityItem, '@type'>): void {
    useDashboardStore.getState().addActivityItem({
      '@type': 'https://schema.org/Event',
      ...activity,
    });
  }

  /**
   * Send message to server
   */
  send(message: any): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.stopHeartbeat();
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }
}

// Export singleton instance
export const wsService = new WebSocketService();

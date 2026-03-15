/**
 * WebSocket Service
 * Real-time updates via native WebSocket
 *
 * Connects to the backend's native WebSocket server (ws package)
 */

import { useDashboardStore } from '../store/dashboard';
import { ActivityType, PipelineStatus } from '../types';
import type { Job, Pipeline, ActivityItem, SystemStatus } from '../types';
import { ACTIVITY_TYPE_MAP } from '../hooks/useWebSocketConnection';
import { createLogger } from '../utils/logger';
import { DASHBOARD_WEBSOCKET, DISPLAY } from '../constants/timing';

interface ActivityEventPayload {
  id?: string | number;
  type?: string;
  event?: string;
  jobId?: string;
  jobType?: string;
  message?: string;
  timestamp?: string;
}

/** Partial job shape broadcast by the server (subset of the full Job interface) */
type JobBroadcast = Pick<Job, 'id' | 'pipelineId'> & Partial<Omit<Job, 'id' | 'pipelineId'>>;

type WebSocketMessage =
  | { type: 'connected'; message: string }
  | { type: 'subscribed'; channels: string[] }
  | { type: 'pong' }
  | { type: 'job:created'; job: JobBroadcast }
  | { type: 'job:started'; job: JobBroadcast }
  | { type: 'job:progress'; data: { jobId: string; progress: number; currentOperation?: string } }
  | { type: 'job:completed'; job: JobBroadcast }
  | { type: 'job:failed'; job: JobBroadcast }
  | { type: 'job:cancelled'; job: JobBroadcast }
  | { type: 'pipeline:status'; data: Pipeline }
  | { type: 'system:status'; data: SystemStatus }
  | { type: 'activity:new'; activity: ActivityEventPayload }
  | { type: 'error'; error: string };

type OutboundMessage =
  | { type: 'ping' }
  | { type: 'subscribe'; channels: string[] };

const logger = createLogger('WebSocket');

/** Promote a partial broadcast into a store-compatible Job (fills required @type) */
function toStoreJob(broadcast: JobBroadcast): Job {
  return {
    '@type': 'https://schema.org/Action',
    status: 'queued' as Job['status'],
    createdAt: new Date().toISOString(),
    ...broadcast,
  } as Job;
}

type WebSocketMessageType = WebSocketMessage['type'];

const VALID_WS_MESSAGE_TYPES = new Set<WebSocketMessageType>([
  'connected', 'subscribed', 'pong',
  'job:created', 'job:started', 'job:progress',
  'job:completed', 'job:failed', 'job:cancelled',
  'pipeline:status', 'system:status', 'activity:new', 'error',
]);

function isWebSocketMessage(value: unknown): value is WebSocketMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof (value as Record<string, unknown>).type === 'string' &&
    VALID_WS_MESSAGE_TYPES.has((value as Record<string, unknown>).type as WebSocketMessageType)
  );
}

/**
 * WebSocket Service
 *
 * Manages WebSocket connection for real-time dashboard updates.
 * Automatically handles reconnection and updates the Zustand store.
 */
class WebSocketService {
  private socket: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = DASHBOARD_WEBSOCKET.MAX_RECONNECT_ATTEMPTS;
  private reconnectDelay = DASHBOARD_WEBSOCKET.INITIAL_RECONNECT_DELAY_MS;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Connect to WebSocket server
   */
  connect(): void {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = import.meta.env.VITE_WS_HOST || window.location.host;
    const WS_URL = `${protocol}//${host}/ws`;

    logger.log('Connecting to:', WS_URL);

    try {
      this.socket = new WebSocket(WS_URL);
      this.setupEventListeners();
    } catch (error) {
      logger.error('Failed to create connection:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    if (!this.socket) return;

    this.socket.onopen = () => {
      logger.log('Connected');
      this.reconnectAttempts = 0;
      this.updateConnectionStatus(true);
      this.startHeartbeat();
    };

    this.socket.onmessage = (event) => {
      try {
        const raw: unknown = JSON.parse(event.data);
        if (!isWebSocketMessage(raw)) {
          logger.error('Unexpected WebSocket message shape:', raw);
          return;
        }
        this.handleMessage(raw);
      } catch (error) {
        logger.error('Failed to parse message:', error);
      }
    };

    this.socket.onclose = (event) => {
      logger.log('Disconnected:', event.reason || 'Connection closed');
      this.updateConnectionStatus(false);
      this.stopHeartbeat();
      this.scheduleReconnect();
    };

    this.socket.onerror = (error) => {
      logger.error('Error:', error);
      this.updateConnectionStatus(false);
    };
  }

  /**
   * Handle incoming message
   */
  private handleMessage(message: WebSocketMessage): void {
    logger.log('Received:', message.type);

    switch (message.type) {
      case 'connected':
        logger.log('Server welcome:', message.message);
        // Subscribe to all channels including activity feed
        this.send({
          type: 'subscribe',
          channels: ['jobs', 'pipelines', 'system', 'activity', 'scans', '*']
        });
        break;

      case 'subscribed':
        logger.log('Subscribed to channels:', message.channels);
        break;

      case 'pong':
        // Heartbeat response
        break;

      case 'job:created':
        this.handleJobCreated(message.job);
        break;

      case 'job:started':
        this.handleJobStarted(message.job);
        break;

      case 'job:progress':
        this.handleJobProgress(message.data);
        break;

      case 'job:completed':
        this.handleJobCompleted(message.job);
        break;

      case 'job:failed':
        this.handleJobFailed(message.job);
        break;

      case 'job:cancelled':
        this.handleJobCancelled(message.job);
        break;

      case 'pipeline:status':
        this.handlePipelineStatus(message.data);
        break;

      case 'system:status':
        useDashboardStore.getState().setSystemStatus(message.data);
        break;

      case 'activity:new': {
        // Handle real-time activity from backend
        const activity = message.activity;
        logger.log('New activity:', activity);
        if (activity) {
          this.handleActivityEvent(activity);
        }
        break;
      }

      case 'error':
        logger.error('Server error:', message.error);
        break;

      default:
        logger.log('Unknown message type:', (message as { type: string }).type);
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
    }, DASHBOARD_WEBSOCKET.HEARTBEAT_INTERVAL_MS);
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
      logger.error('Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * this.reconnectAttempts, DASHBOARD_WEBSOCKET.MAX_RECONNECT_DELAY_MS);

    logger.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

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
  private handleJobCreated(job: JobBroadcast): void {
    const store = useDashboardStore.getState();

    // Add to queued jobs
    store.setQueuedJobs([...store.queuedJobs, toStoreJob(job)]);

    // Add activity item
    this.addActivity({
      id: `activity-${job.id}-created`,
      type: 'queued' as ActivityType,
      pipelineId: job.pipelineId,
      pipelineName: job.pipelineName ?? DISPLAY.DEFAULT_PIPELINE_NAME,
      message: `Job ${job.id.substring(0, DISPLAY.JOB_ID_PREFIX_LENGTH)}... queued`,
      timestamp: new Date().toISOString(),
      jobId: job.id,
    });
  }

  /**
   * Handle job started event
   */
  private handleJobStarted(job: JobBroadcast): void {
    const store = useDashboardStore.getState();

    // Move from queued to active
    store.setQueuedJobs(store.queuedJobs.filter((j) => j.id !== job.id));
    store.setActiveJobs([...store.activeJobs, toStoreJob(job)]);

    // Update pipeline status
    store.updatePipeline(job.pipelineId, {
      status: PipelineStatus.RUNNING,
      currentJob: job.id,
    });

    // Add activity item
    this.addActivity({
      id: `activity-${job.id}-started`,
      type: 'started' as ActivityType,
      pipelineId: job.pipelineId,
      pipelineName: job.pipelineName ?? DISPLAY.DEFAULT_PIPELINE_NAME,
      message: `Job ${job.id.substring(0, DISPLAY.JOB_ID_PREFIX_LENGTH)}... started`,
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
  private handleJobCompleted(job: JobBroadcast): void {
    const store = useDashboardStore.getState();

    // Remove from active jobs
    store.setActiveJobs(store.activeJobs.filter((j) => j.id !== job.id));

    // Add activity item
    this.addActivity({
      id: `activity-${job.id}-completed`,
      type: 'completed' as ActivityType,
      pipelineId: job.pipelineId,
      pipelineName: job.pipelineName ?? DISPLAY.DEFAULT_PIPELINE_NAME,
      message: `Job ${job.id.substring(0, DISPLAY.JOB_ID_PREFIX_LENGTH)}... completed successfully`,
      timestamp: new Date().toISOString(),
      jobId: job.id,
      severity: 'success',
      details: job.results,
    });
  }

  /**
   * Handle job failed event
   */
  private handleJobFailed(job: JobBroadcast): void {
    const store = useDashboardStore.getState();

    // Remove from active jobs
    store.setActiveJobs(store.activeJobs.filter((j) => j.id !== job.id));

    // Update pipeline status
    store.updatePipeline(job.pipelineId, {
      status: PipelineStatus.FAILED,
      lastError: job.error,
    });

    // Add activity item
    this.addActivity({
      id: `activity-${job.id}-failed`,
      type: 'failed' as ActivityType,
      pipelineId: job.pipelineId,
      pipelineName: job.pipelineName ?? DISPLAY.DEFAULT_PIPELINE_NAME,
      message: `Job ${job.id.substring(0, DISPLAY.JOB_ID_PREFIX_LENGTH)}... failed: ${job.error ?? 'Unknown error'}`,
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
  private handleJobCancelled(job: JobBroadcast): void {
    const store = useDashboardStore.getState();

    // Remove from active/queued jobs
    store.removeJob(job.id);

    // Add activity item
    this.addActivity({
      id: `activity-${job.id}-cancelled`,
      type: 'cancelled' as ActivityType,
      pipelineId: job.pipelineId,
      pipelineName: job.pipelineName ?? DISPLAY.DEFAULT_PIPELINE_NAME,
      message: `Job ${job.id.substring(0, DISPLAY.JOB_ID_PREFIX_LENGTH)}... cancelled`,
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
  private handleActivityEvent(activity: ActivityEventPayload): void {
    const activityType = (activity.type ? ACTIVITY_TYPE_MAP[activity.type] : undefined) ?? ActivityType.PROGRESS;

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
  send(message: OutboundMessage): void {
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

/**
 * WebSocket Service
 * Real-time updates via Socket.IO
 *
 * Following AnalyticsBot patterns:
 * - Class-based service
 * - Reconnection handling
 * - Event-driven updates
 */

import { io, Socket } from 'socket.io-client';
import { useDashboardStore } from '../store/dashboard';
import type { Job, Pipeline, ActivityItem, ActivityType } from '../types';

/**
 * WebSocket Service
 *
 * Manages WebSocket connection for real-time dashboard updates.
 * Automatically handles reconnection and updates the Zustand store.
 */
class WebSocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;

  /**
   * Connect to WebSocket server
   */
  connect(): void {
    const WS_URL = import.meta.env.VITE_WS_URL || window.location.origin;

    this.socket = io(WS_URL, {
      path: '/ws',
      reconnection: true,
      reconnectionDelay: this.reconnectDelay,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: this.maxReconnectAttempts,
      transports: ['websocket', 'polling'],
    });

    this.setupEventListeners();
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      console.log('[WebSocket] Connected');
      this.reconnectAttempts = 0;
      this.updateConnectionStatus(true);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[WebSocket] Disconnected:', reason);
      this.updateConnectionStatus(false);
    });

    this.socket.on('connect_error', (error) => {
      console.error('[WebSocket] Connection error:', error);
      this.reconnectAttempts++;
      this.updateConnectionStatus(false);
    });

    // Job events
    this.socket.on('job:created', (job: Job) => {
      console.log('[WebSocket] Job created:', job.id);
      this.handleJobCreated(job);
    });

    this.socket.on('job:started', (job: Job) => {
      console.log('[WebSocket] Job started:', job.id);
      this.handleJobStarted(job);
    });

    this.socket.on('job:progress', (data: { jobId: string; progress: number; currentOperation?: string }) => {
      console.log('[WebSocket] Job progress:', data.jobId, data.progress);
      this.handleJobProgress(data);
    });

    this.socket.on('job:completed', (job: Job) => {
      console.log('[WebSocket] Job completed:', job.id);
      this.handleJobCompleted(job);
    });

    this.socket.on('job:failed', (job: Job) => {
      console.log('[WebSocket] Job failed:', job.id);
      this.handleJobFailed(job);
    });

    this.socket.on('job:cancelled', (job: Job) => {
      console.log('[WebSocket] Job cancelled:', job.id);
      this.handleJobCancelled(job);
    });

    // Pipeline events
    this.socket.on('pipeline:status', (pipeline: Pipeline) => {
      console.log('[WebSocket] Pipeline status update:', pipeline.id);
      this.handlePipelineStatus(pipeline);
    });

    // System events
    this.socket.on('system:status', (data: any) => {
      console.log('[WebSocket] System status update');
      useDashboardStore.getState().setSystemStatus(data);
    });
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

    // Add activity item with retry action
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
      actionable: [
        {
          label: 'Retry',
          action: () => this.retryJob(job.id),
          variant: 'primary',
        },
        {
          label: 'View Logs',
          action: () => this.viewJobLogs(job.id),
          variant: 'secondary',
        },
      ],
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
   * Add activity to feed
   */
  private addActivity(activity: Omit<ActivityItem, '@type'>): void {
    useDashboardStore.getState().addActivityItem({
      '@type': 'https://schema.org/Event',
      ...activity,
    });
  }

  /**
   * Retry job
   */
  private retryJob(jobId: string): void {
    this.socket?.emit('job:retry', { jobId });
  }

  /**
   * View job logs
   */
  private viewJobLogs(jobId: string): void {
    // This would typically open a modal or navigate to logs page
    console.log('View logs for job:', jobId);
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /**
   * Emit event to server
   */
  emit(event: string, data: any): void {
    this.socket?.emit(event, data);
  }

  /**
   * Listen to custom event
   */
  on(event: string, callback: (data: any) => void): void {
    this.socket?.on(event, callback);
  }

  /**
   * Remove event listener
   */
  off(event: string, callback?: (data: any) => void): void {
    this.socket?.off(event, callback);
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

// Export singleton instance
export const wsService = new WebSocketService();

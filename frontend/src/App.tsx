/**
 * AlephAuto Dashboard Application
 * Main application component with real-time updates
 *
 * Following AnalyticsBot patterns:
 * - WebSocket connection management
 * - Zustand state integration
 * - Layout composition
 */

import { useCallback, useState } from 'react';
import { Layout } from './components/Layout';
import { useWebSocketConnection } from './hooks/useWebSocketConnection';
import { useDashboardStore } from './store/dashboard';
import { apiService } from './services/api';
import './App.css';

/**
 * Main Dashboard Application
 *
 * Connects WebSocket service, manages state via Zustand,
 * and renders the dashboard layout with all pipeline,
 * job, and activity components.
 *
 * @example
 * ```tsx
 * <App />
 * ```
 */
function App() {
  // Connect WebSocket and load initial data
  useWebSocketConnection();

  // Local state for modal/detail views
  const [selectedJobForLogs, setSelectedJobForLogs] = useState<string | null>(null);
  const [selectedPipelineDetail, setSelectedPipelineDetail] = useState<string | null>(null);

  // Connect to Zustand store
  const {
    systemStatus,
    pipelines,
    activeJobs,
    queuedJobs,
    activity,
    isLoading,
    error,
    selectPipeline,
    markActivityRead,
    updateJob,
    removeJob,
    clearActivity,
  } = useDashboardStore();

  /**
   * Handle pipeline view action
   * Opens pipeline detail view (stores selection in state for modal/detail component)
   */
  const handlePipelineView = useCallback((pipelineId: string) => {
    console.log('[App] View pipeline:', pipelineId);
    selectPipeline(pipelineId);
    setSelectedPipelineDetail(pipelineId);
  }, [selectPipeline]);

  /**
   * Handle pipeline retry action
   * Triggers a new pipeline job via the API
   */
  const handlePipelineRetry = useCallback(async (pipelineId: string) => {
    console.log('[App] Retry pipeline:', pipelineId);
    try {
      // Use the pipeline trigger endpoint from pipelines.ts
      const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/sidequest/pipeline-runners/${pipelineId}/trigger`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parameters: {
            triggeredBy: 'user',
            source: 'dashboard',
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to trigger pipeline: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('[App] Pipeline triggered successfully:', result);
    } catch (error) {
      console.error('[App] Failed to retry pipeline:', error);
      alert(`Failed to retry pipeline: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, []);

  /**
   * Handle job view logs action
   * Opens job logs modal/view
   */
  const handleJobViewLogs = useCallback((jobId: string) => {
    console.log('[App] View job logs:', jobId);
    setSelectedJobForLogs(jobId);
  }, []);

  /**
   * Handle job cancel action
   * Cancels a running or queued job via API
   */
  const handleJobCancel = useCallback(async (jobId: string) => {
    console.log('[App] Cancel job:', jobId);
    try {
      const result = await apiService.cancelJob(jobId);

      if (result.success) {
        console.log('[App] Job cancelled successfully:', result);
        // Update job status in store
        updateJob(jobId, { status: 'cancelled' as any });
      } else {
        throw new Error('Failed to cancel job');
      }
    } catch (error) {
      console.error('[App] Failed to cancel job:', error);
      alert(`Failed to cancel job: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [updateJob]);

  /**
   * Handle job retry action
   * Retries a failed job via API
   */
  const handleJobRetry = useCallback(async (jobId: string) => {
    console.log('[App] Retry job:', jobId);
    try {
      const result = await apiService.retryJob(jobId);

      if (result.success) {
        console.log('[App] Job retried successfully:', result);
        // Update job status in store to queued
        updateJob(jobId, { status: 'queued' as any, retryCount: (activeJobs.find(j => j.id === jobId)?.retryCount ?? 0) + 1 });
      } else {
        throw new Error('Failed to retry job');
      }
    } catch (error) {
      console.error('[App] Failed to retry job:', error);
      alert(`Failed to retry job: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [updateJob, activeJobs]);

  /**
   * Handle activity item click
   * Navigates to related job or pipeline based on activity type
   */
  const handleActivityItemClick = useCallback((activityId: string) => {
    console.log('[App] Activity clicked:', activityId);

    // Find the activity item
    const activityItem = activity.find(item => item.id === activityId);

    if (!activityItem) {
      console.warn('[App] Activity item not found:', activityId);
      return;
    }

    // Navigate based on activity type
    if (activityItem.jobId) {
      // If activity has a jobId, open job logs
      setSelectedJobForLogs(activityItem.jobId);
    } else if (activityItem.pipelineId) {
      // If activity only has pipelineId, open pipeline detail
      selectPipeline(activityItem.pipelineId);
      setSelectedPipelineDetail(activityItem.pipelineId);
    }
  }, [activity, selectPipeline]);

  /**
   * Handle clear activity action
   * Clears all activity items from the store
   */
  const handleActivityClear = useCallback(() => {
    console.log('[App] Clear activity');
    markActivityRead();
    clearActivity();
  }, [markActivityRead, clearActivity]);

  /**
   * Handle retry action when error occurs
   */
  const handleRetry = useCallback(() => {
    console.log('[App] Retrying connection...');
    window.location.reload();
  }, []);

  return (
    <div className="app">
      <Layout
        systemStatus={systemStatus}
        pipelines={pipelines}
        activeJobs={activeJobs}
        queuedJobs={queuedJobs}
        activities={activity}
        isLoading={isLoading}
        error={error}
        onRetry={handleRetry}
        onPipelineView={handlePipelineView}
        onPipelineRetry={handlePipelineRetry}
        onJobViewLogs={handleJobViewLogs}
        onJobCancel={handleJobCancel}
        onJobRetry={handleJobRetry}
        onActivityItemClick={handleActivityItemClick}
        onActivityClear={handleActivityClear}
      />
    </div>
  );
}

export default App;

/**
 * AlephAuto Dashboard Application
 * Main application component with real-time updates
 *
 * Following AnalyticsBot patterns:
 * - WebSocket connection management
 * - Zustand state integration
 * - Layout composition
 */

import { useCallback } from 'react';
import { Layout } from './components/Layout';
import { useWebSocketConnection } from './hooks/useWebSocketConnection';
import { useDashboardStore } from './store/dashboard';
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
  } = useDashboardStore();

  /**
   * Handle pipeline view action
   */
  const handlePipelineView = useCallback((pipelineId: string) => {
    console.log('[App] View pipeline:', pipelineId);
    selectPipeline(pipelineId);
    // TODO: Navigate to pipeline detail view or open modal
  }, [selectPipeline]);

  /**
   * Handle pipeline retry action
   */
  const handlePipelineRetry = useCallback((pipelineId: string) => {
    console.log('[App] Retry pipeline:', pipelineId);
    // TODO: Implement retry pipeline logic via API
  }, []);

  /**
   * Handle job view logs action
   */
  const handleJobViewLogs = useCallback((jobId: string) => {
    console.log('[App] View job logs:', jobId);
    // TODO: Navigate to job logs view or open modal
  }, []);

  /**
   * Handle job cancel action
   */
  const handleJobCancel = useCallback((jobId: string) => {
    console.log('[App] Cancel job:', jobId);
    // TODO: Implement cancel job logic via API
  }, []);

  /**
   * Handle job retry action
   */
  const handleJobRetry = useCallback((jobId: string) => {
    console.log('[App] Retry job:', jobId);
    // TODO: Implement retry job logic via API
  }, []);

  /**
   * Handle activity item click
   */
  const handleActivityItemClick = useCallback((activityId: string) => {
    console.log('[App] Activity clicked:', activityId);
    // TODO: Navigate to related job/pipeline
  }, []);

  /**
   * Handle clear activity action
   */
  const handleActivityClear = useCallback(() => {
    console.log('[App] Clear activity');
    markActivityRead();
    // TODO: Optionally clear activity items from store
  }, [markActivityRead]);

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

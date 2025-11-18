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
    selectedPipeline,
    selectPipeline,
    markActivityRead,
  } = useDashboardStore();

  /**
   * Handle pipeline view action
   */
  const handleViewPipeline = useCallback((pipelineId: string) => {
    console.log('[App] View pipeline:', pipelineId);
    selectPipeline(pipelineId);
    // TODO: Navigate to pipeline detail view or open modal
  }, [selectPipeline]);

  /**
   * Handle pipeline retry action
   */
  const handleRetryPipeline = useCallback((pipelineId: string) => {
    console.log('[App] Retry pipeline:', pipelineId);
    // TODO: Implement retry pipeline logic via API
  }, []);

  /**
   * Handle job view action
   */
  const handleViewJob = useCallback((jobId: string) => {
    console.log('[App] View job:', jobId);
    // TODO: Navigate to job detail view or open modal
  }, []);

  /**
   * Handle job cancel action
   */
  const handleCancelJob = useCallback((jobId: string) => {
    console.log('[App] Cancel job:', jobId);
    // TODO: Implement cancel job logic via API
  }, []);

  /**
   * Handle job retry action
   */
  const handleRetryJob = useCallback((jobId: string) => {
    console.log('[App] Retry job:', jobId);
    // TODO: Implement retry job logic via API
  }, []);

  /**
   * Handle activity item click
   */
  const handleActivityClick = useCallback((activityId: string) => {
    console.log('[App] Activity clicked:', activityId);
    // TODO: Navigate to related job/pipeline
  }, []);

  /**
   * Handle clear activity action
   */
  const handleClearActivity = useCallback(() => {
    console.log('[App] Clear activity');
    markActivityRead();
    // TODO: Optionally clear activity items from store
  }, [markActivityRead]);

  return (
    <div className="app">
      <Layout
        systemStatus={systemStatus}
        pipelines={pipelines}
        activeJobs={activeJobs}
        queuedJobs={queuedJobs}
        activities={activity}
        selectedPipeline={selectedPipeline}
        onViewPipeline={handleViewPipeline}
        onRetryPipeline={handleRetryPipeline}
        onViewJob={handleViewJob}
        onCancelJob={handleCancelJob}
        onRetryJob={handleRetryJob}
        onActivityClick={handleActivityClick}
        onClearActivity={handleClearActivity}
      />
    </div>
  );
}

export default App;

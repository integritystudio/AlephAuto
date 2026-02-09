/**
 * useWebSocketConnection Hook
 * React hook for WebSocket connection management
 *
 * Following AnalyticsBot patterns:
 * - Custom hook for service integration
 * - Cleanup on unmount
 * - Initial data loading
 */

import { useEffect, useRef } from 'react';
import { wsService } from '../services/websocket';
import { useDashboardStore } from '../store/dashboard';
import type { Pipeline, SystemHealth } from '../types';

/**
 * Fetch status from the backend API
 * The /api/status endpoint returns all dashboard data
 */
async function fetchStatus() {
  const response = await fetch('/api/status');
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}

/**
 * WebSocket Connection Hook
 *
 * Manages WebSocket connection lifecycle and initial data loading.
 * Sets up connection on mount and cleans up on unmount.
 *
 * @example
 * ```tsx
 * function App() {
 *   useWebSocketConnection();
 *   // ... rest of component
 * }
 * ```
 */
export const useWebSocketConnection = () => {
  const isInitialized = useRef(false);

  useEffect(() => {
    // Prevent double initialization in React StrictMode
    if (isInitialized.current) return;
    isInitialized.current = true;

    /**
     * Load initial data from API
     * Uses the /api/status endpoint which returns all data
     */
    const loadInitialData = async () => {
      const store = useDashboardStore.getState();
      store.setLoading(true);
      store.setError(null);

      try {
        console.log('[Dashboard] Loading initial data...');

        const statusData = await fetchStatus();

        // Transform backend pipelines to frontend Pipeline type
        const pipelines: Pipeline[] = (statusData.pipelines || []).map((p: any) => ({
          '@type': 'https://schema.org/SoftwareApplication' as const,
          id: p.id,
          name: p.name,
          description: p.description,
          icon: getPipelineIcon(p.id),
          color: getPipelineColor(p.id),
          status: p.status || 'idle',
          type: p.id,
          totalJobs: (p.completedJobs || 0) + (p.failedJobs || 0),
          successRate: p.completedJobs > 0
            ? p.completedJobs / ((p.completedJobs || 0) + (p.failedJobs || 0))
            : 1,
          lastRunAt: p.lastRun,
          nextRun: p.nextRun,
          createdAt: p.lastRun || new Date().toISOString(),
          updatedAt: p.lastRun || new Date().toISOString(),
        }));

        store.setPipelines(pipelines);

        // Set system status
        store.setSystemStatus({
          '@type': 'https://schema.org/Report',
          health: 'healthy' as SystemHealth,
          activeJobs: statusData.queue?.active || 0,
          queuedJobs: statusData.queue?.queued || 0,
          totalCapacity: statusData.queue?.capacity || 5,
          websocketConnected: false,
          lastUpdate: statusData.timestamp || new Date().toISOString(),
          retryQueueSize: statusData.retryMetrics?.activeRetries || 0,
        });

        // Set activity from recentActivity if available
        if (statusData.recentActivity?.length > 0) {
          statusData.recentActivity.forEach((activity: any) => {
            // Backend returns jobType, map to pipelineId/pipelineName
            const pipelineId = activity.pipelineId || activity.jobType || 'unknown';
            store.addActivityItem({
              '@type': 'https://schema.org/Event',
              id: activity.id || `activity-${Date.now()}`,
              type: activity.type || 'info',
              pipelineId,
              pipelineName: activity.pipelineName || pipelineId || 'Unknown',
              message: activity.message || '',
              timestamp: activity.timestamp || new Date().toISOString(),
            });
          });
        }

        console.log('[Dashboard] Initial data loaded:', pipelines.length, 'pipelines');
        store.setLoading(false);
      } catch (error) {
        console.error('[Dashboard] Failed to load initial data:', error);
        const errorMessage = error instanceof Error
          ? error.message
          : 'Failed to connect to API. Please ensure the backend server is running on port 8080.';
        store.setError(errorMessage);
        store.setLoading(false);
      }
    };

    // Load initial data
    loadInitialData();

    // Connect WebSocket
    console.log('[Dashboard] Connecting WebSocket...');
    wsService.connect();

    // Set up polling fallback (every 5 seconds if WebSocket not connected)
    const pollInterval = setInterval(async () => {
      const systemStatus = useDashboardStore.getState().systemStatus;

      if (!systemStatus.websocketConnected) {
        console.log('[Dashboard] Polling for updates (WebSocket disconnected)');

        try {
          const statusData = await fetchStatus();
          const store = useDashboardStore.getState();

          // Update system status
          store.setSystemStatus({
            ...store.systemStatus,
            activeJobs: statusData.queue?.active || 0,
            queuedJobs: statusData.queue?.queued || 0,
            lastUpdate: new Date().toISOString(),
          });
        } catch (error) {
          console.error('[Dashboard] Polling failed:', error);
        }
      }
    }, 5000);

    // Cleanup on unmount
    return () => {
      console.log('[Dashboard] Cleaning up...');
      clearInterval(pollInterval);
      wsService.disconnect();
    };
  }, []);
};

/**
 * Get icon for pipeline based on ID
 */
function getPipelineIcon(pipelineId: string): string {
  const icons: Record<string, string> = {
    'duplicate-detection': '🔍',
    'schema-enhancement': '📄',
    'git-activity': '📊',
    'repomix': '📦',
    'claude-health': '🏥',
    'gitignore-manager': '📝',
    'plugin-manager': '🔌',
    'test-refactor': '🧪',
    'repo-cleanup': '🧹',
  };
  return icons[pipelineId] || '⚙️';
}

/**
 * Get color for pipeline based on ID
 */
function getPipelineColor(pipelineId: string): 'purple' | 'cyan' | 'pink' | 'teal' | 'blue' | 'green' | 'amber' {
  const colors: Record<string, 'purple' | 'cyan' | 'pink' | 'teal' | 'blue' | 'green' | 'amber'> = {
    'duplicate-detection': 'purple',
    'schema-enhancement': 'cyan',
    'git-activity': 'pink',
    'repomix': 'teal',
    'claude-health': 'green',
    'gitignore-manager': 'blue',
    'plugin-manager': 'amber',
    'test-refactor': 'purple',
    'repo-cleanup': 'cyan',
  };
  return colors[pipelineId] || 'blue';
}

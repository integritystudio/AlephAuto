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

const POLL_INTERVAL_MS = 5000;

async function fetchStatus() {
  const response = await fetch('/api/status');
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}

function mapActiveJob(j: any) {
  return {
    '@type': 'https://schema.org/Action' as const,
    id: j.id,
    pipelineId: j.pipelineId,
    pipelineName: j.pipelineName,
    status: j.status,
    createdAt: j.createdAt,
    startedAt: j.startedAt,
    progress: j.progress,
    currentOperation: j.currentOperation,
  };
}

function mapQueuedJob(j: any) {
  return {
    '@type': 'https://schema.org/Action' as const,
    id: j.id,
    pipelineId: j.pipelineId,
    pipelineName: j.pipelineName,
    status: j.status,
    createdAt: j.createdAt,
  };
}

function mapPipeline(p: any): Pipeline {
  return {
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
  };
}

function applyJobsToStore(store: ReturnType<typeof useDashboardStore.getState>, statusData: any) {
  if (statusData.activeJobs?.length > 0) {
    store.setActiveJobs(statusData.activeJobs.map(mapActiveJob));
  }
  if (statusData.queuedJobs?.length > 0) {
    store.setQueuedJobs(statusData.queuedJobs.map(mapQueuedJob));
  }
}

async function loadInitialData() {
  const store = useDashboardStore.getState();
  store.setLoading(true);
  store.setError(null);

  try {
    console.log('[Dashboard] Loading initial data...');
    const statusData = await fetchStatus();

    store.setPipelines((statusData.pipelines || []).map(mapPipeline));

    applyJobsToStore(store, statusData);

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

    if (statusData.recentActivity?.length > 0) {
      statusData.recentActivity.forEach((activity: any) => {
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

    console.log('[Dashboard] Initial data loaded:', (statusData.pipelines || []).length, 'pipelines');
    store.setLoading(false);
  } catch (error) {
    console.error('[Dashboard] Failed to load initial data:', error);
    const errorMessage = error instanceof Error
      ? error.message
      : 'Failed to connect to API. Please ensure the backend server is running on port 8080.';
    store.setError(errorMessage);
    store.setLoading(false);
  }
}

async function pollForUpdates() {
  const systemStatus = useDashboardStore.getState().systemStatus;
  if (systemStatus.websocketConnected) return;

  console.log('[Dashboard] Polling for updates (WebSocket disconnected)');
  try {
    const statusData = await fetchStatus();
    const store = useDashboardStore.getState();

    store.setSystemStatus({
      ...store.systemStatus,
      activeJobs: statusData.queue?.active || 0,
      queuedJobs: statusData.queue?.queued || 0,
      lastUpdate: new Date().toISOString(),
    });

    if (statusData.activeJobs) {
      store.setActiveJobs(statusData.activeJobs.map(mapActiveJob));
    }
    if (statusData.queuedJobs) {
      store.setQueuedJobs(statusData.queuedJobs.map(mapQueuedJob));
    }
  } catch (error) {
    console.error('[Dashboard] Polling failed:', error);
  }
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

    loadInitialData();

    console.log('[Dashboard] Connecting WebSocket...');
    wsService.connect();

    const pollInterval = setInterval(pollForUpdates, POLL_INTERVAL_MS);

    return () => {
      console.log('[Dashboard] Cleaning up...');
      clearInterval(pollInterval);
      wsService.disconnect();
    };
  }, []);
};

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

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
import { PipelineType, ActivityType, JobStatus, PipelineStatus } from '../types';
import type { Pipeline, SystemHealth } from '../types';

interface ApiJob {
  id: string;
  pipelineId: string;
  pipelineName: string;
  status: string;
  createdAt: string;
  startedAt?: string;
  progress?: number;
  currentOperation?: string;
}

interface ApiPipeline {
  id: string;
  name: string;
  description?: string;
  status?: string;
  completedJobs?: number;
  failedJobs?: number;
  lastRun?: string;
  nextRun?: string;
}

interface ApiActivity {
  id?: string;
  type: string;
  pipelineId?: string;
  jobType?: string;
  pipelineName?: string;
  message?: string;
  timestamp?: string;
  jobId?: string;
}

interface ApiStatusData {
  pipelines?: ApiPipeline[];
  activeJobs?: ApiJob[];
  queuedJobs?: ApiJob[];
  recentActivity?: ApiActivity[];
  queue?: { active: number; queued: number; capacity: number };
  timestamp?: string;
  retryMetrics?: { activeRetries: number };
}

const ACTIVITY_TYPE_MAP: Record<string, ActivityType> = {
  'job:created': ActivityType.QUEUED,
  'job:started': ActivityType.STARTED,
  'job:completed': ActivityType.COMPLETED,
  'job:failed': ActivityType.FAILED,
  'job:cancelled': ActivityType.CANCELLED,
  'retry:created': ActivityType.RETRY,
  'retry:max-attempts': ActivityType.FAILED,
};
import { DASHBOARD_TIMING } from '../constants/timing';

const POLL_INTERVAL_MS = DASHBOARD_TIMING.STATUS_POLL_INTERVAL_MS;

const PIPELINE_TYPE_MAP: Record<string, PipelineType> = {
  'duplicate-detection': PipelineType.DUPLICATE_DETECTION,
  'schema-enhancement': PipelineType.DOC_ENHANCEMENT,
  'git-activity': PipelineType.GIT_ACTIVITY,
  'repomix': PipelineType.REPOMIX_AUTOMATION,
  'claude-health': PipelineType.CLAUDE_HEALTH,
  'gitignore-manager': PipelineType.GITIGNORE_MANAGER,
  'plugin-manager': PipelineType.PLUGIN_AUDIT,
  'test-refactor': PipelineType.TEST_REFACTOR,
};

/**
 * fetchStatus.
 */
async function fetchStatus(): Promise<ApiStatusData> {
  const response = await fetch('/api/status');
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json() as Promise<ApiStatusData>;
}

/**
 * mapActiveJob.
 */
function mapActiveJob(j: ApiJob) {
  return {
    '@type': 'https://schema.org/Action' as const,
    id: j.id,
    pipelineId: j.pipelineId,
    pipelineName: j.pipelineName,
    status: j.status as JobStatus,
    createdAt: j.createdAt,
    startedAt: j.startedAt,
    progress: j.progress,
    currentOperation: j.currentOperation,
  };
}

/**
 * mapQueuedJob.
 */
function mapQueuedJob(j: ApiJob) {
  return {
    '@type': 'https://schema.org/Action' as const,
    id: j.id,
    pipelineId: j.pipelineId,
    pipelineName: j.pipelineName,
    status: j.status as JobStatus,
    createdAt: j.createdAt,
  };
}

/**
 * mapPipeline.
 */
function mapPipeline(p: ApiPipeline): Pipeline {
  return {
    '@type': 'https://schema.org/SoftwareApplication' as const,
    id: p.id,
    name: p.name,
    description: p.description,
    icon: getPipelineIcon(p.id),
    color: getPipelineColor(p.id),
    status: (p.status ?? 'idle') as PipelineStatus,
    type: PIPELINE_TYPE_MAP[p.id] ?? PipelineType.DUPLICATE_DETECTION,
    totalJobs: (p.completedJobs ?? 0) + (p.failedJobs ?? 0),
    successRate: (p.completedJobs ?? 0) > 0
      ? (p.completedJobs ?? 0) / ((p.completedJobs ?? 0) + (p.failedJobs ?? 0))
      : 1,
    lastRunAt: p.lastRun,
    nextRun: p.nextRun,
    createdAt: p.lastRun || new Date().toISOString(),
    updatedAt: p.lastRun || new Date().toISOString(),
  };
}

/**
 * applyJobsToStore.
 */
function applyJobsToStore(store: ReturnType<typeof useDashboardStore.getState>, statusData: ApiStatusData) {
  if (statusData.activeJobs !== undefined) {
    store.setActiveJobs(statusData.activeJobs.map(mapActiveJob));
  }
  if (statusData.queuedJobs !== undefined) {
    store.setQueuedJobs(statusData.queuedJobs.map(mapQueuedJob));
  }
}

/**
 * loadInitialData.
 */
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

    if (statusData.recentActivity && statusData.recentActivity.length > 0) {
      statusData.recentActivity.forEach((activity: ApiActivity) => {
        const pipelineId = activity.pipelineId || activity.jobType || 'unknown';
        store.addActivityItem({
          '@type': 'https://schema.org/Event',
          id: activity.id || crypto.randomUUID(),
          type: ACTIVITY_TYPE_MAP[activity.type] ?? ActivityType.PROGRESS,
          pipelineId,
          pipelineName: activity.pipelineName || pipelineId || 'Unknown',
          message: activity.message || '',
          timestamp: activity.timestamp || new Date().toISOString(),
          jobId: activity.jobId,
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

/**
 * pollForUpdates.
 */
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

    // Refresh activity feed during polling (WS disconnected)
    if (statusData.recentActivity && statusData.recentActivity.length > 0 && store.activity.length === 0) {
      statusData.recentActivity.forEach((activity: ApiActivity) => {
        const pipelineId = activity.pipelineId || activity.jobType || 'unknown';
        store.addActivityItem({
          '@type': 'https://schema.org/Event',
          id: activity.id || crypto.randomUUID(),
          type: ACTIVITY_TYPE_MAP[activity.type] ?? ActivityType.PROGRESS,
          pipelineId,
          pipelineName: activity.pipelineName || pipelineId || 'Unknown',
          message: activity.message || '',
          timestamp: activity.timestamp || new Date().toISOString(),
          jobId: activity.jobId,
        });
      });
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
    // Guard against double initialization (e.g. strict mode dev double-invoke)
    // Note: ref is intentionally NOT reset in cleanup so the guard remains effective
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

/**
 * getPipelineIcon.
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
 * getPipelineColor.
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

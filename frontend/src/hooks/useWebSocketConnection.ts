/**
 * useWebSocketConnection Hook
 * React hook for WebSocket connection management
 *
 * Following AnalyticsBot patterns:
 * - Custom hook for service integration
 * - Cleanup on unmount
 * - Initial data loading
 */

import { useEffect } from 'react';
import { wsService } from '../services/websocket';
import { useDashboardStore } from '../store/dashboard';
import { PipelineType, ActivityType, JobStatus, PipelineStatus, SystemHealth, PIPELINE_TYPE_MAP } from '../types';
import type { Job, Pipeline, PipelineId } from '../types';
import { createLogger } from '../utils/logger';
import { DASHBOARD_TIMING } from '../constants/timing';

const logger = createLogger('Dashboard');

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
  health?: string;
  timestamp?: string;
  retryMetrics?: { activeRetries: number };
}

export const ACTIVITY_TYPE_MAP: Record<string, ActivityType> = {
  'job:created': ActivityType.QUEUED,
  'job:started': ActivityType.STARTED,
  'job:completed': ActivityType.COMPLETED,
  'job:failed': ActivityType.FAILED,
  'job:cancelled': ActivityType.CANCELLED,
  'retry:created': ActivityType.RETRY,
  'retry:max-attempts': ActivityType.FAILED,
};

const POLL_INTERVAL_MS = DASHBOARD_TIMING.STATUS_POLL_INTERVAL_MS;
const UNKNOWN_TIMESTAMP = '1970-01-01T00:00:00.000Z';



/**
 * fetchStatus.
 */
async function fetchStatus(signal?: AbortSignal): Promise<ApiStatusData> {
  const response = await fetch('/api/status', { signal });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  const data: unknown = await response.json();
  if (typeof data !== 'object' || data === null) {
    throw new Error('Invalid API response: expected object');
  }
  return data as ApiStatusData;
}

/**
 * mapActiveJob.
 */
function mapActiveJob(j: ApiJob): Job {
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
function mapQueuedJob(j: ApiJob): Job {
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
    type: isPipelineId(p.id) ? PIPELINE_TYPE_MAP[p.id] : PipelineType.DUPLICATE_DETECTION,
    totalJobs: (p.completedJobs ?? 0) + (p.failedJobs ?? 0),
    successRate: (p.completedJobs ?? 0) > 0
      ? (p.completedJobs ?? 0) / ((p.completedJobs ?? 0) + (p.failedJobs ?? 0))
      : 1,
    lastRunAt: p.lastRun,
    nextRun: p.nextRun,
    createdAt: UNKNOWN_TIMESTAMP,
    updatedAt: p.lastRun ?? UNKNOWN_TIMESTAMP,
  };
}

/**
 * Map an API activity item to the store activity format.
 */
function mapApiActivity(activity: ApiActivity) {
  const pipelineId = activity.pipelineId || activity.jobType || 'unknown';
  return {
    '@type': 'https://schema.org/Event' as const,
    id: activity.id || crypto.randomUUID(),
    type: ACTIVITY_TYPE_MAP[activity.type] ?? ActivityType.PROGRESS,
    pipelineId,
    pipelineName: activity.pipelineName || pipelineId || 'Unknown',
    message: activity.message || '',
    timestamp: activity.timestamp || new Date().toISOString(),
    jobId: activity.jobId,
  };
}

/**
 * Build system status object from API status data.
 */
const HEALTH_VALUES = new Set<string>([SystemHealth.HEALTHY, SystemHealth.DEGRADED, SystemHealth.ERROR]);

function deriveHealth(statusData: ApiStatusData): SystemHealth {
  if (statusData.health && HEALTH_VALUES.has(statusData.health)) {
    return statusData.health as SystemHealth;
  }
  if ((statusData.retryMetrics?.activeRetries ?? 0) > 0) return SystemHealth.DEGRADED;
  return SystemHealth.HEALTHY;
}

function buildSystemStatus(statusData: ApiStatusData): Parameters<ReturnType<typeof useDashboardStore.getState>['setSystemStatus']>[0] {
  return {
    '@type': 'https://schema.org/Report',
    health: deriveHealth(statusData),
    activeJobs: statusData.queue?.active ?? 0,
    queuedJobs: statusData.queue?.queued ?? 0,
    totalCapacity: statusData.queue?.capacity ?? 5,
    websocketConnected: false,
    lastUpdate: statusData.timestamp ?? new Date().toISOString(),
    retryQueueSize: statusData.retryMetrics?.activeRetries ?? 0,
  };
}

/**
 * Apply jobs and activity feed from API status data to store.
 */
function applyStatusToStore(store: ReturnType<typeof useDashboardStore.getState>, statusData: ApiStatusData) {
  if (statusData.activeJobs !== undefined) {
    store.setActiveJobs(statusData.activeJobs.map(mapActiveJob));
  }
  if (statusData.queuedJobs !== undefined) {
    store.setQueuedJobs(statusData.queuedJobs.map(mapQueuedJob));
  }
}

/**
 * Apply recent activity items to store (skips if activity feed already populated).
 */
function applyActivityFeed(store: ReturnType<typeof useDashboardStore.getState>, activities: ApiActivity[] | undefined, onlyIfEmpty = false) {
  if (!activities || activities.length === 0) return;
  if (onlyIfEmpty && store.activity.length > 0) return;
  activities.forEach(a => store.addActivityItem(mapApiActivity(a)));
}

/**
 * loadInitialData.
 */
async function loadInitialData(signal?: AbortSignal) {
  const store = useDashboardStore.getState();
  store.setLoading(true);
  store.setError(null);

  try {
    logger.log('Loading initial data...');
    const statusData = await fetchStatus(signal);

    if (signal?.aborted) return;

    store.setPipelines((statusData.pipelines || []).map(mapPipeline));
    applyStatusToStore(store, statusData);
    store.setSystemStatus(buildSystemStatus(statusData));
    applyActivityFeed(store, statusData.recentActivity);

    logger.log('Initial data loaded:', (statusData.pipelines || []).length, 'pipelines');
    store.setLoading(false);
  } catch (error) {
    if (signal?.aborted) return;
    logger.error('Failed to load initial data:', error);
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
async function pollForUpdates(signal?: AbortSignal) {
  const systemStatus = useDashboardStore.getState().systemStatus;
  if (systemStatus.websocketConnected) return;

  logger.log('Polling for updates (WebSocket disconnected)');
  try {
    const statusData = await fetchStatus(signal);
    if (signal?.aborted) return;
    const store = useDashboardStore.getState();

    store.setSystemStatus({
      ...store.systemStatus,
      activeJobs: statusData.queue?.active ?? 0,
      queuedJobs: statusData.queue?.queued ?? 0,
      lastUpdate: new Date().toISOString(),
    });

    applyStatusToStore(store, statusData);
    applyActivityFeed(store, statusData.recentActivity, true);
  } catch (error) {
    if (signal?.aborted) return;
    logger.error('Polling failed:', error);
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
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    loadInitialData(signal);

    logger.log('Connecting WebSocket...');
    wsService.connect();

    const pollInterval = setInterval(() => pollForUpdates(signal), POLL_INTERVAL_MS);

    return () => {
      logger.log('Cleaning up...');
      controller.abort();
      clearInterval(pollInterval);
      wsService.disconnect();
    };
  }, []);
};

const PIPELINE_ICONS: Record<PipelineId, string> = {
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

type PipelineColor = 'purple' | 'cyan' | 'pink' | 'teal' | 'blue' | 'green' | 'amber';

const PIPELINE_COLORS: Record<PipelineId, PipelineColor> = {
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

function isPipelineId(id: string): id is PipelineId {
  return id in PIPELINE_TYPE_MAP;
}

function getPipelineIcon(pipelineId: string): string {
  return isPipelineId(pipelineId) ? PIPELINE_ICONS[pipelineId] : '⚙️';
}

function getPipelineColor(pipelineId: string): PipelineColor {
  return isPipelineId(pipelineId) ? PIPELINE_COLORS[pipelineId] : 'blue';
}

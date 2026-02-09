/**
 * Dashboard State Management
 * Zustand store for dashboard data
 *
 * Following AnalyticsBot patterns:
 * - Clean interface definitions
 * - Comprehensive JSDoc
 * - Immutable state updates
 */

import { create } from 'zustand';
import type { Pipeline, Job, ActivityItem, SystemStatus, SystemHealth } from '../types';

interface DashboardStore {
  // State
  /** Array of pipelines */
  pipelines: Pipeline[];
  /** Active jobs */
  activeJobs: Job[];
  /** Queued jobs */
  queuedJobs: Job[];
  /** Activity feed items */
  activity: ActivityItem[];
  /** System status */
  systemStatus: SystemStatus;
  /** Selected pipeline ID */
  selectedPipeline?: string;
  /** Unread activity count */
  unreadActivityCount: number;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: string | null;

  // Actions
  /** Set all pipelines */
  setPipelines: (pipelines: Pipeline[]) => void;
  /** Update a single pipeline */
  updatePipeline: (id: string, updates: Partial<Pipeline>) => void;
  /** Set active jobs */
  setActiveJobs: (jobs: Job[]) => void;
  /** Set queued jobs */
  setQueuedJobs: (jobs: Job[]) => void;
  /** Add activity item to feed */
  addActivityItem: (item: ActivityItem) => void;
  /** Clear all activity */
  clearActivity: () => void;
  /** Set system status */
  setSystemStatus: (status: SystemStatus) => void;
  /** Select a pipeline */
  selectPipeline: (id: string | undefined) => void;
  /** Mark activity as read */
  markActivityRead: () => void;
  /** Update a single job */
  updateJob: (jobId: string, updates: Partial<Job>) => void;
  /** Remove a job */
  removeJob: (jobId: string) => void;
  /** Set loading state */
  setLoading: (isLoading: boolean) => void;
  /** Set error state */
  setError: (error: string | null) => void;
}

/**
 * Dashboard Store
 *
 * Central state management for the dashboard.
 * Manages pipelines, jobs, activity feed, and system status.
 *
 * @example
 * ```tsx
 * const { pipelines, setPipelines } = useDashboardStore();
 * ```
 */
export const useDashboardStore = create<DashboardStore>((set) => ({
  // Initial State
  pipelines: [],
  activeJobs: [],
  queuedJobs: [],
  activity: [],
  systemStatus: {
    '@type': 'https://schema.org/Report',
    health: 'healthy' as SystemHealth,
    activeJobs: 0,
    queuedJobs: 0,
    totalCapacity: 5,
    websocketConnected: false,
    lastUpdate: new Date().toISOString()
  },
  selectedPipeline: undefined,
  unreadActivityCount: 0,
  isLoading: true,
  error: null,

  // Actions
  setPipelines: (pipelines) => set({ pipelines }),

  updatePipeline: (id, updates) =>
    set((state) => ({
      pipelines: state.pipelines.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    })),

  setActiveJobs: (jobs) => set({ activeJobs: jobs }),

  setQueuedJobs: (jobs) => set({ queuedJobs: jobs }),

  addActivityItem: (item) =>
    set((state) => ({
      activity: [item, ...state.activity].slice(0, 100), // Keep last 100 items
      unreadActivityCount: state.unreadActivityCount + 1,
    })),

  clearActivity: () =>
    set({
      activity: [],
      unreadActivityCount: 0,
    }),

  setSystemStatus: (status) => set({ systemStatus: status }),

  selectPipeline: (id) => set({ selectedPipeline: id }),

  markActivityRead: () => set({ unreadActivityCount: 0 }),

  updateJob: (jobId, updates) =>
    set((state) => ({
      activeJobs: state.activeJobs.map((job) =>
        job.id === jobId ? { ...job, ...updates } : job
      ),
      queuedJobs: state.queuedJobs.map((job) =>
        job.id === jobId ? { ...job, ...updates } : job
      ),
    })),

  removeJob: (jobId) =>
    set((state) => ({
      activeJobs: state.activeJobs.filter((job) => job.id !== jobId),
      queuedJobs: state.queuedJobs.filter((job) => job.id !== jobId),
    })),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),
}));

# AlephAuto Dashboard - Implementation Guide

**Purpose:** Translate UI/UX design into production-ready React components and patterns.

---

## 1. Project Setup

### 1.1 Frontend Project Structure

```bash
# Create frontend project within jobs directory
mkdir frontend
cd frontend
npm init -y

# Install core dependencies
npm install react react-dom typescript
npm install -D @types/react @types/react-dom
npm install -D tailwindcss postcss autoprefixer

# Utility libraries
npm install socket.io-client axios zustand
npm install recharts lucide-react

# Dev tools
npm install -D vite @vitejs/plugin-react

# UI Foundation (optional, but recommended)
npm install @headlessui/react clsx
```

### 1.2 Vite Configuration

Create `vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
});
```

### 1.3 TypeScript Types

Create `src/types/index.ts`:

```typescript
// Pipeline Status
export type PipelineStatus = 'running' | 'idle' | 'queued' | 'failed';

export interface Pipeline {
  id: string;
  name: string;
  icon: string; // Unicode or emoji
  color: 'purple' | 'cyan' | 'pink' | 'teal';
  status: PipelineStatus;
  progress?: number; // 0-100
  currentJob?: string;
  nextRun?: Date;
  lastError?: string;
  successRate?: number;
}

// Job Status
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Job {
  id: string;
  pipelineId: string;
  status: JobStatus;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  progress?: number;
  error?: string;
  logs?: string[];
  metadata?: Record<string, any>;
}

// Activity Feed
export type ActivityType = 'started' | 'completed' | 'failed' | 'queued' | 'progress';

export interface ActivityItem {
  id: string;
  type: ActivityType;
  pipelineId: string;
  pipelineName: string;
  message: string;
  timestamp: Date;
  details?: Record<string, any>;
  actionable?: {
    label: string;
    action: () => void;
  }[];
}

// System Status
export type SystemHealth = 'healthy' | 'degraded' | 'error';

export interface SystemStatus {
  health: SystemHealth;
  activeJobs: number;
  queuedJobs: number;
  totalCapacity: number;
  websocketConnected: boolean;
  lastUpdate: Date;
}
```

---

## 2. State Management (Zustand)

Create `src/store/dashboard.ts`:

```typescript
import { create } from 'zustand';
import { Pipeline, Job, ActivityItem, SystemStatus } from '../types';

interface DashboardStore {
  // State
  pipelines: Pipeline[];
  activeJobs: Job[];
  queuedJobs: Job[];
  activity: ActivityItem[];
  systemStatus: SystemStatus;
  selectedPipeline?: string;
  unreadActivityCount: number;

  // Actions
  setPipelines: (pipelines: Pipeline[]) => void;
  updatePipeline: (id: string, updates: Partial<Pipeline>) => void;
  setActiveJobs: (jobs: Job[]) => void;
  setQueuedJobs: (jobs: Job[]) => void;
  addActivityItem: (item: ActivityItem) => void;
  clearActivity: () => void;
  setSystemStatus: (status: SystemStatus) => void;
  selectPipeline: (id: string | undefined) => void;
  markActivityRead: () => void;
}

export const useDashboardStore = create<DashboardStore>((set) => ({
  pipelines: [],
  activeJobs: [],
  queuedJobs: [],
  activity: [],
  systemStatus: {
    health: 'healthy',
    activeJobs: 0,
    queuedJobs: 0,
    totalCapacity: 5,
    websocketConnected: false,
    lastUpdate: new Date(),
  },
  unreadActivityCount: 0,

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
      activity: [item, ...state.activity].slice(0, 100), // Keep last 100
      unreadActivityCount: state.unreadActivityCount + 1,
    })),

  clearActivity: () => set({ activity: [] }),

  setSystemStatus: (status) => set({ systemStatus: status }),

  selectPipeline: (id) => set({ selectedPipeline: id }),

  markActivityRead: () => set({ unreadActivityCount: 0 }),
}));
```

---

## 3. WebSocket Integration

Create `src/services/websocket.ts`:

```typescript
import { io, Socket } from 'socket.io-client';
import { useDashboardStore } from '../store/dashboard';
import { Job, ActivityItem, Pipeline } from '../types';

class WebSocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  connect() {
    this.socket = io(import.meta.env.VITE_WS_URL || 'ws://localhost:3000', {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: this.maxReconnectAttempts,
    });

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      this.updateSystemStatus();
    });

    this.socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      this.updateSystemStatus();
    });

    this.socket.on('job:created', (job: Job) => {
      useDashboardStore.getState().addActivityItem({
        id: `activity-${job.id}`,
        type: 'queued',
        pipelineId: job.pipelineId,
        pipelineName: 'Unknown',
        message: `Job queued: ${job.id}`,
        timestamp: new Date(),
      });
    });

    this.socket.on('job:started', (job: Job) => {
      useDashboardStore.getState().updatePipeline(job.pipelineId, {
        status: 'running',
      });
    });

    this.socket.on('job:completed', (job: Job) => {
      useDashboardStore.getState().addActivityItem({
        id: `activity-${job.id}`,
        type: 'completed',
        pipelineId: job.pipelineId,
        pipelineName: 'Unknown',
        message: `Job completed: ${job.id}`,
        timestamp: new Date(),
      });
    });

    this.socket.on('job:failed', (job: Job) => {
      useDashboardStore.getState().addActivityItem({
        id: `activity-${job.id}`,
        type: 'failed',
        pipelineId: job.pipelineId,
        pipelineName: 'Unknown',
        message: `Job failed: ${job.id}`,
        timestamp: new Date(),
        details: { error: job.error },
        actionable: [
          { label: 'Retry', action: () => this.retryJob(job.id) },
          { label: 'View log', action: () => this.viewJobLog(job.id) },
        ],
      });
    });

    this.socket.on('job:progress', (data: { jobId: string; progress: number }) => {
      // Update store with progress
    });

    this.socket.on('pipeline:status', (pipeline: Pipeline) => {
      useDashboardStore.getState().updatePipeline(pipeline.id, pipeline);
    });
  }

  private updateSystemStatus() {
    const store = useDashboardStore.getState();
    const isConnected = this.socket?.connected ?? false;

    store.setSystemStatus({
      ...store.systemStatus,
      websocketConnected: isConnected,
      health: isConnected ? 'healthy' : 'degraded',
      lastUpdate: new Date(),
    });
  }

  private retryJob(jobId: string) {
    this.socket?.emit('job:retry', { jobId });
  }

  private viewJobLog(jobId: string) {
    this.socket?.emit('job:logs:request', { jobId });
  }

  disconnect() {
    this.socket?.disconnect();
  }

  emit(event: string, data: any) {
    this.socket?.emit(event, data);
  }

  on(event: string, callback: (data: any) => void) {
    this.socket?.on(event, callback);
  }
}

export const wsService = new WebSocketService();
```

---

## 4. API Integration

Create `src/services/api.ts`:

```typescript
import axios from 'axios';
import { Pipeline, Job, SystemStatus } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
});

export const apiService = {
  // Health check
  async getHealth() {
    const response = await api.get('/health');
    return response.data;
  },

  // System status
  async getSystemStatus(): Promise<SystemStatus> {
    const response = await api.get('/api/status');
    return {
      health: response.data.health || 'healthy',
      activeJobs: response.data.activeJobs || 0,
      queuedJobs: response.data.queuedJobs || 0,
      totalCapacity: response.data.totalCapacity || 5,
      websocketConnected: response.data.websocketConnected || false,
      lastUpdate: new Date(),
    };
  },

  // Pipeline operations
  async getPipelines(): Promise<Pipeline[]> {
    const response = await api.get('/api/pipelines');
    return response.data;
  },

  async getPipelineStatus(pipelineId: string): Promise<Pipeline> {
    const response = await api.get(`/api/pipelines/${pipelineId}`);
    return response.data;
  },

  // Job operations
  async getActiveJobs(): Promise<Job[]> {
    const response = await api.get('/api/jobs?status=running');
    return response.data;
  },

  async getQueuedJobs(): Promise<Job[]> {
    const response = await api.get('/api/jobs?status=queued');
    return response.data;
  },

  async getJobDetails(jobId: string): Promise<Job> {
    const response = await api.get(`/api/jobs/${jobId}`);
    return response.data;
  },

  async getJobLogs(jobId: string): Promise<string[]> {
    const response = await api.get(`/api/jobs/${jobId}/logs`);
    return response.data.logs || [];
  },

  async cancelJob(jobId: string) {
    const response = await api.post(`/api/jobs/${jobId}/cancel`);
    return response.data;
  },

  async retryJob(jobId: string) {
    const response = await api.post(`/api/jobs/${jobId}/retry`);
    return response.data;
  },

  // Scan operations
  async triggerScan(repositoryPath: string) {
    const response = await api.post('/api/scan', { repositoryPath });
    return response.data;
  },

  async getScanResults(scanId: string) {
    const response = await api.get(`/api/scan/${scanId}`);
    return response.data;
  },
};
```

---

## 5. Component Architecture

### 5.1 Layout Component (`src/components/Layout.tsx`)

```typescript
import React from 'react';
import { Header } from './Header';
import { PipelineStatus } from './PipelineStatus';
import { JobQueue } from './JobQueue';
import { RecentActivity } from './RecentActivity';
import { Documentation } from './Documentation';

export const Layout: React.FC = () => {
  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <Header />

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
          {/* Left: Pipeline Status */}
          <div className="lg:col-span-1">
            <PipelineStatus />
          </div>

          {/* Center: Job Queue */}
          <div className="lg:col-span-1">
            <JobQueue />
          </div>

          {/* Right: Recent Activity */}
          <div className="lg:col-span-1">
            <RecentActivity />
          </div>
        </div>

        {/* Documentation Section */}
        <div className="mt-8 px-6 pb-6">
          <Documentation />
        </div>
      </div>
    </div>
  );
};
```

### 5.2 Header Component (`src/components/Header.tsx`)

```typescript
import React from 'react';
import { useDashboardStore } from '../store/dashboard';
import { Settings, AlertCircle } from 'lucide-react';

const healthColors = {
  healthy: 'bg-green-500',
  degraded: 'bg-yellow-500',
  error: 'bg-red-500',
};

export const Header: React.FC = () => {
  const systemStatus = useDashboardStore((state) => state.systemStatus);
  const [showSettings, setShowSettings] = React.useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Logo and Title */}
        <div className="flex items-center gap-3">
          <span className="text-2xl">⚙</span>
          <h1 className="text-xl font-semibold text-gray-900">AlephAuto Dashboard</h1>
        </div>

        {/* Center: Status */}
        <div className="flex items-center gap-4">
          <div
            className={`w-3 h-3 rounded-full ${healthColors[systemStatus.health]}`}
            title={systemStatus.health}
          />
          <span className="text-sm text-gray-600">
            {systemStatus.activeJobs} active • {systemStatus.queuedJobs} queued
          </span>
          <span className="text-sm text-gray-500">
            Updated {formatRelativeTime(systemStatus.lastUpdate)}
          </span>
        </div>

        {/* Right: Settings */}
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Settings"
        >
          <Settings size={20} className="text-gray-600" />
        </button>
      </div>

      {/* Connection Status Warning */}
      {!systemStatus.websocketConnected && (
        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-2">
          <AlertCircle size={18} className="text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-yellow-800 font-medium">WebSocket disconnected</p>
            <p className="text-xs text-yellow-700 mt-1">Using polling fallback (5s intervals)</p>
          </div>
        </div>
      )}
    </header>
  );
};

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
```

### 5.3 Pipeline Status Component (`src/components/PipelineStatus.tsx`)

```typescript
import React from 'react';
import { useDashboardStore } from '../store/dashboard';
import { PipelineCard } from './PipelineCard';

export const PipelineStatus: React.FC = () => {
  const pipelines = useDashboardStore((state) => state.pipelines);

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
        <span className="w-1 h-6 bg-gray-900 rounded-full"></span>
        Pipeline Status
      </h2>

      <div className="space-y-3">
        {pipelines.map((pipeline) => (
          <PipelineCard key={pipeline.id} pipeline={pipeline} />
        ))}
      </div>
    </section>
  );
};
```

### 5.4 Pipeline Card Component (`src/components/PipelineCard.tsx`)

```typescript
import React from 'react';
import { Pipeline } from '../types';
import { ChevronDown, ChevronUp, AlertCircle, Play } from 'lucide-react';
import { useDashboardStore } from '../store/dashboard';

const statusColors = {
  running: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  idle: { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' },
  queued: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
  failed: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
};

const statusIcons = {
  running: '▶',
  idle: '─',
  queued: '↷',
  failed: '✗',
};

interface PipelineCardProps {
  pipeline: Pipeline;
}

export const PipelineCard: React.FC<PipelineCardProps> = ({ pipeline }) => {
  const [expanded, setExpanded] = React.useState(false);
  const colors = statusColors[pipeline.status];
  const icon = statusIcons[pipeline.status];

  return (
    <div className={`border ${colors.border} ${colors.bg} rounded-lg p-4`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start justify-between gap-3 text-left hover:opacity-75 transition-opacity"
      >
        <div className="flex items-start gap-3 flex-1">
          <span className="text-lg mt-0.5">{icon}</span>
          <div className="flex-1">
            <h3 className={`font-medium ${colors.text}`}>{pipeline.name}</h3>
            <p className="text-sm text-gray-600 mt-1">
              Status: <span className="font-semibold">{pipeline.status.toUpperCase()}</span>
            </p>
          </div>
        </div>
        {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
      </button>

      {/* Progress Bar (if running) */}
      {pipeline.status === 'running' && pipeline.progress !== undefined && (
        <div className="mt-3">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-gray-600 font-medium">Progress</span>
            <span className="text-xs text-gray-900 font-semibold">{pipeline.progress}%</span>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${pipeline.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Expanded Details */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-300 space-y-3">
          {pipeline.currentJob && (
            <div>
              <p className="text-xs text-gray-600 uppercase font-semibold">Current Job</p>
              <p className="text-sm text-gray-900 font-mono">{pipeline.currentJob}</p>
            </div>
          )}

          {pipeline.nextRun && (
            <div>
              <p className="text-xs text-gray-600 uppercase font-semibold">Next Run</p>
              <p className="text-sm text-gray-900">{formatNextRun(pipeline.nextRun)}</p>
            </div>
          )}

          {pipeline.successRate !== undefined && (
            <div>
              <p className="text-xs text-gray-600 uppercase font-semibold">Success Rate</p>
              <p className="text-sm text-gray-900">{(pipeline.successRate * 100).toFixed(1)}%</p>
            </div>
          )}

          {pipeline.lastError && (
            <div className="mt-3">
              <p className="text-xs text-red-600 uppercase font-semibold flex items-center gap-1">
                <AlertCircle size={14} />
                Last Error
              </p>
              <p className="text-sm text-red-700 mt-1">{pipeline.lastError}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 mt-4">
            <button className="px-3 py-2 text-xs font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-100 transition-colors">
              View Details
            </button>
            {pipeline.status === 'failed' && (
              <button className="px-3 py-2 text-xs font-medium text-white bg-red-500 rounded hover:bg-red-600 transition-colors flex items-center gap-1">
                <Play size={12} />
                Retry
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

function formatNextRun(date: Date): string {
  // Implementation to format next run time
  return new Date(date).toLocaleString();
}
```

### 5.5 Job Queue Component (`src/components/JobQueue.tsx`)

```typescript
import React from 'react';
import { useDashboardStore } from '../store/dashboard';
import { JobItem } from './JobItem';

export const JobQueue: React.FC = () => {
  const activeJobs = useDashboardStore((state) => state.activeJobs);
  const queuedJobs = useDashboardStore((state) => state.queuedJobs);
  const systemStatus = useDashboardStore((state) => state.systemStatus);

  const utilizationPercent = Math.round(
    (systemStatus.activeJobs / systemStatus.totalCapacity) * 100
  );

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
        <span className="w-1 h-6 bg-gray-900 rounded-full"></span>
        Job Queue & Active Jobs
      </h2>

      {/* Capacity Indicator */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex justify-between items-center mb-2">
          <p className="text-sm font-medium text-gray-700">Capacity</p>
          <p className="text-sm font-semibold text-gray-900">
            {systemStatus.activeJobs} / {systemStatus.totalCapacity}
          </p>
        </div>
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${
              utilizationPercent > 80 ? 'bg-red-500' : 'bg-green-500'
            }`}
            style={{ width: `${utilizationPercent}%` }}
          />
        </div>
        <p className="text-xs text-gray-600 mt-2">
          {queuedJobs.length} jobs queued
        </p>
      </div>

      {/* Active Jobs */}
      {activeJobs.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-700 uppercase mb-2">Active</p>
          <div className="space-y-2">
            {activeJobs.map((job) => (
              <JobItem key={job.id} job={job} />
            ))}
          </div>
        </div>
      )}

      {/* Queued Jobs */}
      {queuedJobs.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-700 uppercase mb-2">
            Queued ({queuedJobs.length})
          </p>
          <div className="space-y-2">
            {queuedJobs.slice(0, 5).map((job, index) => (
              <div
                key={job.id}
                className="text-sm text-gray-700 bg-yellow-50 border border-yellow-200 rounded p-2 px-3"
              >
                <div className="flex justify-between items-center">
                  <span>→ {job.id}</span>
                  <span className="text-xs text-yellow-700">#{index + 1}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeJobs.length === 0 && queuedJobs.length === 0 && (
        <p className="text-center text-sm text-gray-500 py-8">No active or queued jobs</p>
      )}
    </section>
  );
};
```

### 5.6 Job Item Component (`src/components/JobItem.tsx`)

```typescript
import React from 'react';
import { Job } from '../types';
import { X, FileText } from 'lucide-react';
import { apiService } from '../services/api';

interface JobItemProps {
  job: Job;
}

export const JobItem: React.FC<JobItemProps> = ({ job }) => {
  const [isExpanded, setIsExpanded] = React.useState(false);

  const handleCancel = async () => {
    if (confirm(`Cancel job ${job.id}?`)) {
      try {
        await apiService.cancelJob(job.id);
      } catch (error) {
        console.error('Failed to cancel job:', error);
      }
    }
  };

  const handleViewLogs = () => {
    // Open log viewer modal
  };

  return (
    <div
      onClick={() => setIsExpanded(!isExpanded)}
      className="bg-white border border-gray-200 rounded-lg p-3 cursor-pointer hover:border-gray-300 transition-colors"
    >
      {/* Job Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="font-mono text-sm font-medium text-gray-900">
            {job.id}
            {job.startedAt && (
              <span className="ml-2 text-xs text-gray-500">
                ({formatElapsed(job.startedAt)})
              </span>
            )}
          </p>
          <p className="text-xs text-gray-600 mt-1">
            Pipeline: {job.pipelineId}
          </p>
        </div>

        {/* Status Badge */}
        <span
          className={`px-2 py-1 text-xs font-semibold rounded whitespace-nowrap ${
            job.status === 'completed'
              ? 'bg-green-100 text-green-700'
              : job.status === 'failed'
              ? 'bg-red-100 text-red-700'
              : 'bg-blue-100 text-blue-700'
          }`}
        >
          {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
        </span>
      </div>

      {/* Progress Bar */}
      {job.progress !== undefined && (
        <div className="mt-3">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-gray-600">Progress</span>
            <span className="text-xs font-semibold text-gray-900">{job.progress}%</span>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${job.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Expanded Details */}
      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-gray-200 space-y-3">
          {job.error && (
            <div className="bg-red-50 border border-red-200 rounded p-2">
              <p className="text-xs text-red-700 font-medium">Error</p>
              <p className="text-xs text-red-600 mt-1 font-mono">{job.error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleViewLogs();
              }}
              className="flex-1 px-2 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-100 transition-colors flex items-center justify-center gap-1"
            >
              <FileText size={12} />
              View Log
            </button>
            {job.status === 'running' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCancel();
                }}
                className="px-2 py-1.5 text-xs font-medium text-red-700 border border-red-300 rounded hover:bg-red-50 transition-colors flex items-center gap-1"
              >
                <X size={12} />
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

function formatElapsed(startDate: Date): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - startDate.getTime()) / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
```

---

## 6. Hooks for Data Management

### 6.1 useWebSocketConnection Hook

Create `src/hooks/useWebSocketConnection.ts`:

```typescript
import { useEffect, useRef } from 'react';
import { wsService } from '../services/websocket';
import { apiService } from '../services/api';
import { useDashboardStore } from '../store/dashboard';

export const useWebSocketConnection = () => {
  const isConnectingRef = useRef(false);

  useEffect(() => {
    if (isConnectingRef.current) return;
    isConnectingRef.current = true;

    // Initial load of data
    const loadInitialData = async () => {
      try {
        const [systemStatus, pipelines, activeJobs, queuedJobs] = await Promise.all([
          apiService.getSystemStatus(),
          apiService.getPipelines(),
          apiService.getActiveJobs(),
          apiService.getQueuedJobs(),
        ]);

        useDashboardStore.getState().setSystemStatus(systemStatus);
        useDashboardStore.getState().setPipelines(pipelines);
        useDashboardStore.getState().setActiveJobs(activeJobs);
        useDashboardStore.getState().setQueuedJobs(queuedJobs);
      } catch (error) {
        console.error('Failed to load initial data:', error);
      }
    };

    loadInitialData();

    // Connect WebSocket
    wsService.connect();

    // Polling fallback (every 5 seconds if WebSocket not connected)
    const pollInterval = setInterval(async () => {
      const systemStatus = useDashboardStore.getState().systemStatus;
      if (!systemStatus.websocketConnected) {
        try {
          const [activeJobs, queuedJobs] = await Promise.all([
            apiService.getActiveJobs(),
            apiService.getQueuedJobs(),
          ]);
          useDashboardStore.getState().setActiveJobs(activeJobs);
          useDashboardStore.getState().setQueuedJobs(queuedJobs);
        } catch (error) {
          console.error('Polling failed:', error);
        }
      }
    }, 5000);

    return () => {
      clearInterval(pollInterval);
      wsService.disconnect();
    };
  }, []);
};
```

---

## 7. Running the Dashboard

### 7.1 Development

```bash
# Terminal 1: Start API server
cd /Users/alyshialedlie/code/jobs
doppler run -- npm start

# Terminal 2: Start frontend
cd frontend
npm run dev
```

Frontend will be available at `http://localhost:5173`

### 7.2 Production Build

```bash
npm run build
npm run preview
```

---

## 8. Tailwind CSS Configuration

Create `tailwind.config.js`:

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        emerald: {
          50: '#f0fdf4',
          500: '#10b981',
        },
        amber: {
          50: '#fffbeb',
          500: '#f59e0b',
        },
      },
    },
  },
  plugins: [],
};
```

---

## 9. Testing Strategy

### 9.1 Component Tests

```typescript
// src/components/__tests__/PipelineCard.test.tsx
import { render, screen } from '@testing-library/react';
import { PipelineCard } from '../PipelineCard';
import { Pipeline } from '../../types';

describe('PipelineCard', () => {
  it('renders pipeline status', () => {
    const pipeline: Pipeline = {
      id: 'test',
      name: 'Test Pipeline',
      icon: '◆',
      color: 'purple',
      status: 'running',
      progress: 50,
    };

    render(<PipelineCard pipeline={pipeline} />);
    expect(screen.getByText('Test Pipeline')).toBeInTheDocument();
    expect(screen.getByText('RUNNING')).toBeInTheDocument();
  });
});
```

---

## 10. Performance Optimization

### 10.1 Component Memoization

```typescript
import { memo } from 'react';

export const JobItem = memo(({ job }: JobItemProps) => {
  // Component implementation
}, (prev, next) => {
  // Custom comparison for deep updates
  return prev.job.id === next.job.id && prev.job.status === next.job.status;
});
```

### 10.2 Virtual Scrolling for Activity Feed

```typescript
import { FixedSizeList } from 'react-window';

export const RecentActivity = () => {
  const activity = useDashboardStore((state) => state.activity);

  return (
    <FixedSizeList
      height={400}
      itemCount={activity.length}
      itemSize={80}
      width="100%"
    >
      {({ index, style }) => (
        <div style={style}>
          <ActivityItem item={activity[index]} />
        </div>
      )}
    </FixedSizeList>
  );
};
```

---

## Next Steps

1. Set up frontend project with dependencies
2. Implement core components (Header, Pipeline, JobQueue, Activity)
3. Connect WebSocket and API integration
4. Build documentation viewer
5. Deploy on same server or separate frontend service
6. Collect user feedback and iterate

---

**Document Version:** 1.0
**Last Updated:** 2025-11-17

/**
 * TypeScript type definitions for AlephAuto Dashboard
 *
 * These types follow schema.org vocabulary for semantic consistency
 * and mirror the backend API response structures.
 */

// ============================================================================
// Enums
// ============================================================================

/**
 * Pipeline execution status
 */
export enum PipelineStatus {
  RUNNING = 'running',
  IDLE = 'idle',
  QUEUED = 'queued',
  FAILED = 'failed'
}

/**
 * Job lifecycle status
 */
export enum JobStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

/**
 * Activity event types
 */
export enum ActivityType {
  STARTED = 'started',
  COMPLETED = 'completed',
  FAILED = 'failed',
  QUEUED = 'queued',
  PROGRESS = 'progress',
  RETRY = 'retry',
  CANCELLED = 'cancelled'
}

/**
 * System health status
 */
export enum SystemHealth {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  ERROR = 'error'
}

/**
 * Pipeline category/type
 */
export enum PipelineType {
  DUPLICATE_DETECTION = 'duplicate_detection',
  DOC_ENHANCEMENT = 'doc_enhancement',
  GIT_ACTIVITY = 'git_activity',
  PLUGIN_AUDIT = 'plugin_audit',
  CLAUDE_HEALTH = 'claude_health',
  GITIGNORE_MANAGER = 'gitignore_manager',
  REPOMIX_AUTOMATION = 'repomix_automation'
}

// ============================================================================
// Core Data Models (schema.org compliant)
// ============================================================================

/**
 * Pipeline configuration and status
 *
 * @type https://schema.org/SoftwareApplication
 */
export interface Pipeline {
  '@type': 'https://schema.org/SoftwareApplication';
  /** Unique pipeline identifier */
  id: string;
  /** Human-readable pipeline name */
  name: string;
  /** Pipeline description */
  description?: string;
  /** Unicode icon or emoji */
  icon: string;
  /** Color theme for UI display */
  color: 'purple' | 'cyan' | 'pink' | 'teal' | 'blue' | 'green' | 'amber';
  /** Current execution status */
  status: PipelineStatus;
  /** Pipeline category */
  type: PipelineType;

  // Execution state
  /** Progress percentage (0-100) */
  progress?: number;
  /** Currently executing job ID */
  currentJob?: string;
  /** Next scheduled run (ISO 8601) */
  nextRun?: string;
  /** Cron schedule expression */
  cronSchedule?: string;

  // Metrics
  /** Last error message */
  lastError?: string;
  /** Success rate (0-1) */
  successRate?: number;
  /** Total jobs executed */
  totalJobs?: number;
  /** Average execution time in milliseconds */
  avgExecutionTime?: number;

  // Timestamps
  /** Creation timestamp (ISO 8601) */
  createdAt: string;
  /** Last update timestamp (ISO 8601) */
  updatedAt: string;
  /** Last successful run timestamp (ISO 8601) */
  lastRunAt?: string;
}

/**
 * Job execution details
 *
 * @type https://schema.org/Action
 */
export interface Job {
  '@type': 'https://schema.org/Action';
  /** Unique job identifier */
  id: string;
  /** Parent pipeline ID */
  pipelineId: string;
  /** Pipeline name (denormalized) */
  pipelineName?: string;
  /** Current job status */
  status: JobStatus;

  // Execution state
  /** Progress percentage (0-100) */
  progress?: number;
  /** Current operation description */
  currentOperation?: string;

  // Error tracking
  /** Error message if failed */
  error?: string;
  /** Error stack trace */
  errorStack?: string;
  /** Error type/code */
  errorType?: string;
  /** Number of retry attempts */
  retryCount?: number;
  /** Maximum retry attempts */
  maxRetries?: number;

  // Timing
  /** Job creation timestamp (ISO 8601) */
  createdAt: string;
  /** Job start timestamp (ISO 8601) */
  startedAt?: string;
  /** Job completion timestamp (ISO 8601) */
  completedAt?: string;
  /** Execution duration in milliseconds */
  duration?: number;

  // Logs and metadata
  /** Log entries */
  logs?: string[];
  /** Additional metadata */
  metadata?: Record<string, any>;

  // Results
  /** Job results/output */
  results?: {
    filesProcessed?: number;
    itemsCreated?: number;
    itemsUpdated?: number;
    itemsDeleted?: number;
    summary?: string;
  };
}

/**
 * Activity feed item
 *
 * @type https://schema.org/Event
 */
export interface ActivityItem {
  '@type': 'https://schema.org/Event';
  /** Unique activity ID */
  id: string;
  /** Activity type */
  type: ActivityType;
  /** Related pipeline ID */
  pipelineId: string;
  /** Pipeline name (denormalized) */
  pipelineName: string;
  /** Human-readable message */
  message: string;
  /** Event timestamp (ISO 8601) */
  timestamp: string;

  // Additional context
  /** Related job ID */
  jobId?: string;
  /** Additional details */
  details?: Record<string, any>;
  /** Severity level */
  severity?: 'info' | 'warning' | 'error' | 'success';

  // Actions
  /** Available user actions */
  actionable?: Array<{
    label: string;
    action: () => void;
    variant?: 'primary' | 'secondary' | 'danger';
  }>;
}

/**
 * System status snapshot
 *
 * @type https://schema.org/Report
 */
export interface SystemStatus {
  '@type': 'https://schema.org/Report';
  /** Overall system health */
  health: SystemHealth;

  // Job queue metrics
  /** Currently running jobs */
  activeJobs: number;
  /** Jobs waiting in queue */
  queuedJobs: number;
  /** Maximum concurrent jobs */
  totalCapacity: number;
  /** Queue utilization percentage (0-100) */
  utilizationPercent?: number;

  // Retry metrics
  /** Jobs in retry queue */
  retryQueueSize?: number;
  /** Failed jobs awaiting retry */
  failedJobsCount?: number;
  /** Circuit breaker status */
  circuitBreakerOpen?: boolean;

  // Connection status
  /** WebSocket connection state */
  websocketConnected: boolean;
  /** Last update timestamp (ISO 8601) */
  lastUpdate: string;

  // System resources
  /** Memory usage percentage */
  memoryUsage?: number;
  /** CPU usage percentage */
  cpuUsage?: number;
  /** Disk usage percentage */
  diskUsage?: number;
}

/**
 * Retry metrics for circuit breaker monitoring
 */
export interface RetryMetrics {
  /** Total retry attempts */
  totalRetries: number;
  /** Successful retries */
  successfulRetries: number;
  /** Failed retries */
  failedRetries: number;
  /** Retry success rate (0-1) */
  retrySuccessRate: number;
  /** Circuit breaker status */
  circuitBreakerStatus: 'closed' | 'open' | 'half-open';
  /** Jobs by retry attempt count */
  retryDistribution: Record<number, number>;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

/**
 * Standard API success response wrapper
 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  /** Response timestamp (ISO 8601) */
  timestamp?: string;
}

/**
 * Standard API error response
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    /** Error message */
    message: string;
    /** Error code */
    code?: string;
    /** Additional error details */
    details?: any;
    /** Error stack trace (dev only) */
    stack?: string;
  };
  /** Response timestamp (ISO 8601) */
  timestamp?: string;
}

/**
 * API response type (success or error)
 */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Health check response
 */
export interface HealthCheckResponse {
  success: boolean;
  health: {
    system_operational: boolean;
    redis_connected: boolean;
    pipelines_healthy: boolean;
  };
  timestamp: string;
}

/**
 * System status API response
 */
export interface SystemStatusResponse extends ApiSuccessResponse<SystemStatus> {}

/**
 * Pipelines list API response
 */
export interface PipelinesResponse extends ApiSuccessResponse<Pipeline[]> {}

/**
 * Single pipeline API response
 */
export interface PipelineResponse extends ApiSuccessResponse<Pipeline> {}

/**
 * Jobs list query parameters
 */
export interface GetJobsParams {
  /** Filter by status */
  status?: JobStatus;
  /** Filter by pipeline ID */
  pipelineId?: string;
  /** Page number (default: 1) */
  page?: number;
  /** Items per page (default: 50) */
  limit?: number;
}

/**
 * Jobs list API response (paginated)
 */
export interface JobsResponse extends ApiSuccessResponse<{
  jobs: Job[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}> {}

/**
 * Single job API response
 */
export interface JobResponse extends ApiSuccessResponse<Job> {}

/**
 * Job logs API response
 */
export interface JobLogsResponse extends ApiSuccessResponse<{
  jobId: string;
  logs: string[];
  totalLines: number;
}> {}

/**
 * Trigger scan request
 */
export interface TriggerScanRequest {
  /** Repository path to scan */
  repositoryPath: string;
  /** Scan options */
  options?: {
    skipCache?: boolean;
    threshold?: number;
  };
}

/**
 * Trigger scan response
 */
export interface TriggerScanResponse extends ApiSuccessResponse<{
  jobId: string;
  pipelineId: string;
  message: string;
}> {}

/**
 * Retry metrics API response
 */
export interface RetryMetricsResponse extends ApiSuccessResponse<RetryMetrics> {}

// ============================================================================
// UI Component Props
// ============================================================================

/**
 * Pipeline card component props
 */
export interface PipelineCardProps {
  pipeline: Pipeline;
  onView?: (pipelineId: string) => void;
  onRetry?: (pipelineId: string) => void;
  className?: string;
}

/**
 * Job item component props
 */
export interface JobItemProps {
  job: Job;
  onCancel?: (jobId: string) => void;
  onViewLogs?: (jobId: string) => void;
  onRetry?: (jobId: string) => void;
  className?: string;
}

/**
 * Activity item component props
 */
export interface ActivityItemProps {
  activity: ActivityItem;
  onClick?: (activityId: string) => void;
  className?: string;
}

/**
 * Dashboard filters
 */
export interface DashboardFilters {
  /** Search query */
  search?: string;
  /** Filter by pipeline type */
  pipelineType?: PipelineType;
  /** Filter by status */
  status?: PipelineStatus;
  /** Date range filter */
  dateRange?: {
    start: Date;
    end: Date;
  };
}

/**
 * Chart data point for visualizations
 */
export interface ChartDataPoint {
  /** X-axis label (date, category, etc.) */
  label: string;
  /** Y-axis value */
  value: number;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Time series data for line charts
 */
export interface TimeSeriesData {
  /** X-axis labels */
  labels: string[];
  /** Data series */
  datasets: Array<{
    /** Series label */
    label: string;
    /** Data points */
    data: number[];
    /** Line color */
    borderColor?: string;
    /** Fill color */
    backgroundColor?: string;
  }>;
}

/**
 * Application Constants
 *
 * Centralized configuration constants to replace magic numbers throughout the codebase.
 * Import from this module instead of using hardcoded values.
 *
 * @module sidequest/core/constants
 */

/**
 * Time units and conversion helpers
 */
// -----------------------------------------------------------------------------
// Time Units
// -----------------------------------------------------------------------------
export const TIME_MS = {
  MS: 1,
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
} as const;

/**
 * Timeout values in milliseconds
 */
// -----------------------------------------------------------------------------
// Timing and Resilience
// -----------------------------------------------------------------------------
export const TIMEOUTS = {
  /** Pipeline and worker execution */
  PYTHON_PIPELINE_BASE_MS: 10 * TIME_MS.MINUTE,
  PYTHON_PIPELINE_PER_PATTERN_MS: 100,
  PYTHON_PIPELINE_PER_FILE_MS: 10,
  REPOMIX_MS: 10 * TIME_MS.MINUTE,
  GIT_REPORT_MS: 5 * TIME_MS.MINUTE,
  WORKER_INIT_MS: 30 * TIME_MS.SECOND,

  /** Shared operation durations */
  POLL_INTERVAL_MS: TIME_MS.SECOND,
  SHORT_MS: 5 * TIME_MS.SECOND,
  MEDIUM_MS: 10 * TIME_MS.SECOND,
  LONG_MS: 30 * TIME_MS.SECOND,
  ONE_MINUTE_MS: TIME_MS.MINUTE,
  FIVE_MINUTES_MS: 5 * TIME_MS.MINUTE,
  ONE_HOUR_MS: TIME_MS.HOUR,
  ONE_DAY_MS: TIME_MS.DAY,

  /** Service and integration checks */
  DATABASE_SAVE_INTERVAL_MS: 30 * TIME_MS.SECOND,
  DEPENDENCY_CHECK_MS: 30 * TIME_MS.SECOND,
  VERSION_CHECK_MS: 5 * TIME_MS.SECOND,
} as const;

/**
 * Retry configuration
 */
export const RETRY = {
  /** Retry limits */
  MAX_ABSOLUTE_ATTEMPTS: 5,
  NEARING_LIMIT_ATTEMPT_THRESHOLD: 3,
  MAX_MANUAL_RETRIES: 10,

  /** Error-type delay defaults */
  NETWORK_ERROR_DELAY_MS: 5 * TIME_MS.SECOND,
  SERVER_ERROR_DELAY_MS: 10 * TIME_MS.SECOND,
  RATE_LIMIT_DELAY_MS: TIME_MS.MINUTE,
  REQUEST_TIMEOUT_DELAY_MS: 30 * TIME_MS.SECOND,
  DEFAULT_DELAY_MS: 5 * TIME_MS.SECOND,

  /** Exponential backoff policy */
  BASE_BACKOFF_MS: TIME_MS.SECOND,
  MAX_BACKOFF_MS: 10 * TIME_MS.SECOND,

  /** Database-specific recovery delays */
  DATABASE_RECOVERY_BASE_MS: 5 * TIME_MS.SECOND,
  DATABASE_RECOVERY_MAX_MS: 5 * TIME_MS.MINUTE,
} as const;

/**
 * Port management constants
 */
export const PORT = {
  /** Delay before releasing a port after process kill (1 second) */
  RELEASE_DELAY_MS: TIME_MS.SECOND,

  /** Default shutdown timeout for graceful shutdown (10 seconds) */
  DEFAULT_SHUTDOWN_TIMEOUT_MS: 10 * TIME_MS.SECOND,
} as const;

/**
 * Cache configuration
 */
export const CACHE = {
  /** Stale threshold for cache validity (5 minutes) */
  STALE_THRESHOLD_MS: 5 * TIME_MS.MINUTE,

  /** Warning threshold for cache age (12 hours) */
  WARNING_THRESHOLD_MS: 12 * TIME_MS.HOUR,

  /** Maximum cache age before considered expired (24 hours) */
  MAX_AGE_MS: 24 * TIME_MS.HOUR,
} as const;

/**
 * WebSocket configuration
 */
export const WEBSOCKET = {
  /** Initial reconnect delay (1 second) */
  INITIAL_RECONNECT_DELAY_MS: TIME_MS.SECOND,

  /** Maximum reconnect delay (30 seconds) */
  MAX_RECONNECT_DELAY_MS: 30 * TIME_MS.SECOND,

  /** Heartbeat interval (30 seconds) */
  HEARTBEAT_INTERVAL_MS: 30 * TIME_MS.SECOND,

  /** Doppler health check interval (60 seconds) */
  HEALTH_CHECK_INTERVAL_MS: TIME_MS.MINUTE,
} as const;

/**
 * Worker cooldown configuration
 */
export const WORKER_COOLDOWN = {
  /** Base cooldown duration (1 minute) */
  BASE_MS: TIME_MS.MINUTE,

  /** Maximum cooldown duration (10 minutes) */
  MAX_MS: 10 * TIME_MS.MINUTE,
} as const;

/**
 * Rate limiting configuration
 */
export const RATE_LIMIT = {
  /** Standard rate limit window (15 minutes) */
  STANDARD_WINDOW_MS: 15 * TIME_MS.MINUTE,

  /** Strict rate limit window (1 hour) */
  STRICT_WINDOW_MS: TIME_MS.HOUR,
} as const;

/**
 * Shared event names used by Sidequest workers and pipelines
 */
// -----------------------------------------------------------------------------
// Event Names
// -----------------------------------------------------------------------------
export const JOB_EVENTS = {
  CREATED: 'job:created',
  STARTED: 'job:started',
  COMPLETED: 'job:completed',
  FAILED: 'job:failed',
} as const;

export const RETRY_EVENTS = {
  CREATED: 'retry:created',
} as const;

export const WORKER_EVENTS = {
  METRICS_UPDATED: 'metrics:updated',
} as const;

/**
 * Numeric parsing radix values
 */
// -----------------------------------------------------------------------------
// Runtime Defaults and Guards
// -----------------------------------------------------------------------------
export const NUMBER_BASE = {
  DECIMAL: 10,
} as const;

/**
 * Health scoring constants
 */
export const HEALTH = {
  MAX_SCORE: 100,
} as const;

/**
 * Concurrency limits
 */
export const CONCURRENCY = {
  /** Default maximum concurrent jobs per worker */
  DEFAULT_MAX_JOBS: 5,

  /** Maximum concurrent worker initializations */
  MAX_WORKER_INITS: 3,
} as const;

/**
 * Pagination defaults
 */
export const PAGINATION = {
  /** Default page size for job listings */
  DEFAULT_LIMIT: 50,

  /** Default page size for all jobs listing */
  DEFAULT_ALL_LIMIT: 100,

  /** Maximum allowed page size to prevent memory issues */
  MAX_LIMIT: 1000,
} as const;

/**
 * Input validation patterns
 */
export const VALIDATION = {
  /** Job ID pattern - alphanumeric, hyphens, underscores, max 100 chars */
  JOB_ID_PATTERN: /^[a-zA-Z0-9_-]{1,100}$/,
} as const;

/**
 * Size limits
 */
export const LIMITS = {
  /** Maximum output characters for log truncation */
  MAX_OUTPUT_CHARS: 1000,

  /** Maximum write queue size */
  MAX_WRITE_QUEUE_SIZE: 10000,

  /** Number of scan history entries retained per repository */
  REPOSITORY_SCAN_HISTORY_ENTRIES: 10,

  /** Minimum hardcoded string occurrences before surfacing in analysis output */
  HARD_CODED_STRING_MIN_OCCURRENCES: 3,
} as const;

/**
 * Git activity pipeline/report constants
 */
// -----------------------------------------------------------------------------
// Domain-Specific Constants
// -----------------------------------------------------------------------------
export const GIT_ACTIVITY = {
  /** Default report type when no explicit mode is provided */
  DEFAULT_REPORT_TYPE: 'weekly',

  /** Explicit report type values */
  WEEKLY_REPORT_TYPE: 'weekly',
  MONTHLY_REPORT_TYPE: 'monthly',
  CUSTOM_REPORT_TYPE: 'custom',

  /** Time windows used by weekly/monthly report shortcuts */
  WEEKLY_WINDOW_DAYS: 7,
  MONTHLY_WINDOW_DAYS: 30,
  MONTHLY_BUCKET_MAX_DAYS: 31,

  /** Default cron schedules for scheduled pipeline mode */
  DEFAULT_WEEKLY_CRON: '0 20 * * 0',
  DEFAULT_MONTHLY_CRON: '0 8 1 * *',
} as const;

/**
 * Job retention configuration
 */
export const JOB_RETENTION = {
  /** Minimum retention period in days */
  MIN_DAYS: 1,

  /** Maximum retention period in days (10 years) */
  MAX_DAYS: 3650,
} as const;

/**
 * Application Constants
 *
 * Centralized configuration constants to replace magic numbers throughout the codebase.
 * Import from this module instead of using hardcoded values.
 *
 * @module sidequest/core/constants
 */

/**
 * Time conversion helpers (for readability)
 */
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Timeout values in milliseconds
 */
export const TIMEOUTS = {
  /** Base Python pipeline execution timeout (10 minutes) */
  PYTHON_PIPELINE_BASE_MS: 10 * MINUTE,

  /** Additional timeout per pattern match (100ms) */
  PYTHON_PIPELINE_PER_PATTERN_MS: 100,

  /** Additional timeout per file (10ms) */
  PYTHON_PIPELINE_PER_FILE_MS: 10,

  /** Database auto-save interval (30 seconds) */
  DATABASE_SAVE_INTERVAL_MS: 30 * SECOND,

  /** Polling/checking interval (1 second) */
  POLL_INTERVAL_MS: SECOND,

  /** Short timeout for quick operations (5 seconds) */
  SHORT_MS: 5 * SECOND,

  /** Medium timeout for moderate operations (10 seconds) */
  MEDIUM_MS: 10 * SECOND,

  /** Long timeout for extended operations (30 seconds) */
  LONG_MS: 30 * SECOND,

  /** One minute timeout */
  ONE_MINUTE_MS: MINUTE,

  /** Five minute timeout */
  FIVE_MINUTES_MS: 5 * MINUTE,

  /** One hour duration */
  ONE_HOUR_MS: HOUR,

  /** One day duration */
  ONE_DAY_MS: DAY,

  /** Repomix execution timeout (10 minutes) */
  REPOMIX_MS: 10 * MINUTE,

  /** Git activity report timeout (5 minutes) */
  GIT_REPORT_MS: 5 * MINUTE,

  /** Dependency validation timeout (30 seconds) */
  DEPENDENCY_CHECK_MS: 30 * SECOND,

  /** Version check timeout (5 seconds) */
  VERSION_CHECK_MS: 5 * SECOND,

  /** Worker initialization timeout (30 seconds) */
  WORKER_INIT_MS: 30 * SECOND,
} as const;

/**
 * Retry configuration
 */
export const RETRY = {
  /** Maximum retry attempts before giving up (circuit breaker) */
  MAX_ABSOLUTE_ATTEMPTS: 5,

  /** Maximum manual retry count for a job via API */
  MAX_MANUAL_RETRIES: 10,

  /** Network error retry delay (5 seconds) */
  NETWORK_ERROR_DELAY_MS: 5 * SECOND,

  /** Server error retry delay (10 seconds) */
  SERVER_ERROR_DELAY_MS: 10 * SECOND,

  /** Rate limit retry delay (60 seconds) */
  RATE_LIMIT_DELAY_MS: MINUTE,

  /** Request timeout retry delay (30 seconds) */
  REQUEST_TIMEOUT_DELAY_MS: 30 * SECOND,

  /** Default retry delay when classification unknown (5 seconds) */
  DEFAULT_DELAY_MS: 5 * SECOND,

  /** Base backoff delay for exponential backoff (1 second) */
  BASE_BACKOFF_MS: SECOND,

  /** Maximum backoff delay (10 seconds) */
  MAX_BACKOFF_MS: 10 * SECOND,

  /** Database recovery base delay (5 seconds) */
  DATABASE_RECOVERY_BASE_MS: 5 * SECOND,

  /** Maximum database recovery delay (5 minutes) */
  DATABASE_RECOVERY_MAX_MS: 5 * MINUTE,
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
 * Port management constants
 */
export const PORT = {
  /** Delay before releasing a port after process kill (1 second) */
  RELEASE_DELAY_MS: SECOND,

  /** Default shutdown timeout for graceful shutdown (10 seconds) */
  DEFAULT_SHUTDOWN_TIMEOUT_MS: 10 * SECOND,
} as const;

/**
 * Cache configuration
 */
export const CACHE = {
  /** Stale threshold for cache validity (5 minutes) */
  STALE_THRESHOLD_MS: 5 * MINUTE,

  /** Warning threshold for cache age (12 hours) */
  WARNING_THRESHOLD_MS: 12 * HOUR,

  /** Maximum cache age before considered expired (24 hours) */
  MAX_AGE_MS: 24 * HOUR,
} as const;

/**
 * WebSocket configuration
 */
export const WEBSOCKET = {
  /** Initial reconnect delay (1 second) */
  INITIAL_RECONNECT_DELAY_MS: SECOND,

  /** Maximum reconnect delay (30 seconds) */
  MAX_RECONNECT_DELAY_MS: 30 * SECOND,

  /** Heartbeat interval (30 seconds) */
  HEARTBEAT_INTERVAL_MS: 30 * SECOND,

  /** Doppler health check interval (60 seconds) */
  HEALTH_CHECK_INTERVAL_MS: MINUTE,
} as const;

/**
 * Worker cooldown configuration
 */
export const WORKER_COOLDOWN = {
  /** Base cooldown duration (1 minute) */
  BASE_MS: MINUTE,

  /** Maximum cooldown duration (10 minutes) */
  MAX_MS: 10 * MINUTE,
} as const;

/**
 * Rate limiting configuration
 */
export const RATE_LIMIT = {
  /** Standard rate limit window (15 minutes) */
  STANDARD_WINDOW_MS: 15 * MINUTE,

  /** Strict rate limit window (1 hour) */
  STRICT_WINDOW_MS: HOUR,
} as const;

/**
 * Size limits
 */
export const LIMITS = {
  /** Maximum output characters for log truncation */
  MAX_OUTPUT_CHARS: 1000,

  /** Maximum write queue size */
  MAX_WRITE_QUEUE_SIZE: 10000,
} as const;

/**
 * Time conversion constants (exported for calculations)
 */
export const TIME = {
  SECOND,
  MINUTE,
  HOUR,
  DAY,
} as const;

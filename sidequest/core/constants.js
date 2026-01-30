/**
 * Application Constants
 *
 * Centralized configuration constants to replace magic numbers throughout the codebase.
 * Import from this module instead of using hardcoded values.
 *
 * @module sidequest/core/constants
 */

/**
 * Timeout values in milliseconds
 */
export const TIMEOUTS = {
  /** Base Python pipeline execution timeout (10 minutes) */
  PYTHON_PIPELINE_BASE_MS: 600000,

  /** Additional timeout per pattern match (100ms) */
  PYTHON_PIPELINE_PER_PATTERN_MS: 100,

  /** Additional timeout per file (10ms) */
  PYTHON_PIPELINE_PER_FILE_MS: 10,

  /** Database auto-save interval (30 seconds) */
  DATABASE_SAVE_INTERVAL_MS: 30000,
};

/**
 * Retry configuration
 */
export const RETRY = {
  /** Maximum retry attempts before giving up (circuit breaker) */
  MAX_ABSOLUTE_ATTEMPTS: 5,
};

/**
 * Concurrency limits
 */
export const CONCURRENCY = {
  /** Default maximum concurrent jobs per worker */
  DEFAULT_MAX_JOBS: 5,

  /** Maximum concurrent worker initializations */
  MAX_WORKER_INITS: 3,
};

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
};

/**
 * Input validation patterns
 */
export const VALIDATION = {
  /** Job ID pattern - alphanumeric, hyphens, underscores, max 100 chars */
  JOB_ID_PATTERN: /^[a-zA-Z0-9_-]{1,100}$/,
};

/**
 * Port management constants
 */
export const PORT = {
  /** Delay before releasing a port after process kill (1 second) */
  RELEASE_DELAY_MS: 1000,

  /** Default shutdown timeout for graceful shutdown (10 seconds) */
  DEFAULT_SHUTDOWN_TIMEOUT_MS: 10000,
};

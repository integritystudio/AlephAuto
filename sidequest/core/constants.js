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
  /** Python pipeline execution timeout (10 minutes) */
  PYTHON_PIPELINE_MS: 600000,

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
};

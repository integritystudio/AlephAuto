/**
 * Application Constants
 *
 * Centralized configuration constants to replace magic numbers throughout the codebase.
 * Import from this module instead of using hardcoded values.
 *
 * @module sidequest/core/constants
 */
import { HOURS_PER_DAY, TIME_MS } from './units.ts';
const DURATION_MS = {
  TEN_MS: TIME_MS.SECOND / 100,
  ONE_HUNDRED_MS: TIME_MS.SECOND / 10,
  SECOND: TIME_MS.SECOND,
  TWO_SECONDS: 2 * TIME_MS.SECOND,
  FIVE_SECONDS: 5 * TIME_MS.SECOND,
  TEN_SECONDS: 10 * TIME_MS.SECOND,
  FIFTEEN_SECONDS: 15 * TIME_MS.SECOND,
  THIRTY_SECONDS: 30 * TIME_MS.SECOND,
  MINUTE: TIME_MS.MINUTE,
  FIVE_MINUTES: 5 * TIME_MS.MINUTE,
  TEN_MINUTES: 10 * TIME_MS.MINUTE,
  FIFTEEN_MINUTES: 15 * TIME_MS.MINUTE,
  THIRTY_MINUTES: 30 * TIME_MS.MINUTE,
  HOUR: TIME_MS.HOUR,
  TWELVE_HOURS: 12 * TIME_MS.HOUR,
  DAY: HOURS_PER_DAY * TIME_MS.HOUR,
} as const;
// -----------------------------------------------------------------------------
// Timing and Resilience
// -----------------------------------------------------------------------------
export const TIMEOUTS = {
  /** Pipeline and worker execution */
  PYTHON_PIPELINE_BASE_MS: DURATION_MS.TEN_MINUTES,
  PYTHON_PIPELINE_PER_PATTERN_MS: DURATION_MS.ONE_HUNDRED_MS,
  PYTHON_PIPELINE_PER_FILE_MS: DURATION_MS.TEN_MS,
  REPOMIX_MS: DURATION_MS.TEN_MINUTES,
  GIT_REPORT_MS: DURATION_MS.FIVE_MINUTES,
  WORKER_INIT_MS: DURATION_MS.THIRTY_SECONDS,

  /** Shared operation durations */
  POLL_INTERVAL_MS: DURATION_MS.SECOND,
  TWO_SECONDS_MS: DURATION_MS.TWO_SECONDS,
  SHORT_MS: DURATION_MS.FIVE_SECONDS,
  TEN_SECONDS_MS: DURATION_MS.TEN_SECONDS,
  FIFTEEN_SECONDS_MS: DURATION_MS.FIFTEEN_SECONDS,
  MEDIUM_MS: DURATION_MS.TEN_SECONDS,
  LONG_MS: DURATION_MS.THIRTY_SECONDS,
  FIVE_MINUTES_MS: DURATION_MS.FIVE_MINUTES,
  ONE_HOUR_MS: DURATION_MS.HOUR,
  ONE_DAY_MS: DURATION_MS.DAY,

  /** Service and integration checks */
  DATABASE_SAVE_INTERVAL_MS: DURATION_MS.THIRTY_SECONDS,
  DEPENDENCY_CHECK_MS: DURATION_MS.THIRTY_SECONDS,
  VERSION_CHECK_MS: DURATION_MS.FIVE_SECONDS,

  /** Maximum wait time for async pipeline completion */
  SCAN_COMPLETION_WAIT_MS: DURATION_MS.THIRTY_MINUTES,

  /** Doppler health monitor polling interval in minutes */
  DOPPLER_MONITOR_INTERVAL_MIN: 15,
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
  NETWORK_ERROR_DELAY_MS: DURATION_MS.FIVE_SECONDS,
  SERVER_ERROR_DELAY_MS: DURATION_MS.TEN_SECONDS,
  RATE_LIMIT_DELAY_MS: DURATION_MS.MINUTE,
  REQUEST_TIMEOUT_DELAY_MS: DURATION_MS.THIRTY_SECONDS,
  DEFAULT_DELAY_MS: DURATION_MS.FIVE_SECONDS,

  /** Exponential backoff policy */
  BACKOFF_MULTIPLIER: 2,
  BASE_BACKOFF_MS: DURATION_MS.SECOND,
  MAX_BACKOFF_MS: DURATION_MS.TEN_SECONDS,

  /** Scan-level retry delay */
  SCAN_DELAY_MS: DURATION_MS.MINUTE,

  /** Database-specific recovery delays */
  DATABASE_RECOVERY_BASE_MS: DURATION_MS.FIVE_SECONDS,
  DATABASE_RECOVERY_MAX_MS: DURATION_MS.FIVE_MINUTES,

} as const;

/**
 * Port management constants
 */
export const PORT = {
  /** Delay before releasing a port after process kill (1 second) */
  RELEASE_DELAY_MS: DURATION_MS.SECOND,

  /** Default shutdown timeout for graceful shutdown (10 seconds) */
  DEFAULT_SHUTDOWN_TIMEOUT_MS: DURATION_MS.TEN_SECONDS,

  /** Number of consecutive ports to try when preferred port is busy */
  FALLBACK_RANGE: 10,
} as const;

/**
 * Cache configuration
 */
export const CACHE = {
  /** Stale threshold for cache validity (5 minutes) */
  STALE_THRESHOLD_MS: DURATION_MS.FIVE_MINUTES,

  /** Warning threshold for cache age (12 hours) */
  WARNING_THRESHOLD_MS: DURATION_MS.TWELVE_HOURS,

  /** Maximum cache age before considered expired (24 hours) */
  MAX_AGE_MS: DURATION_MS.DAY,
} as const;

/**
 * WebSocket configuration
 */
export const WEBSOCKET = {
  /** Initial reconnect delay (1 second) */
  INITIAL_RECONNECT_DELAY_MS: DURATION_MS.SECOND,

  /** Maximum reconnect delay (30 seconds) */
  MAX_RECONNECT_DELAY_MS: DURATION_MS.THIRTY_SECONDS,

  /** Heartbeat interval (30 seconds) */
  HEARTBEAT_INTERVAL_MS: DURATION_MS.THIRTY_SECONDS,

  /** Doppler health check interval (60 seconds) */
  HEALTH_CHECK_INTERVAL_MS: DURATION_MS.MINUTE,
} as const;

/**
 * Worker cooldown configuration
 */
export const WORKER_COOLDOWN = {
  /** Base cooldown duration (1 minute) */
  BASE_MS: DURATION_MS.MINUTE,

  /** Maximum cooldown duration (10 minutes) */
  MAX_MS: DURATION_MS.TEN_MINUTES,
} as const;

/**
 * Rate limiting configuration
 */
export const RATE_LIMIT = {
  /** Standard rate limit window (15 minutes) */
  STANDARD_WINDOW_MS: DURATION_MS.FIFTEEN_MINUTES,

  /** Strict rate limit window (1 hour) */
  STRICT_WINDOW_MS: DURATION_MS.HOUR,

  /** Standard limiter max requests per window */
  STANDARD_MAX_REQUESTS: 500,

  /** Standard limiter retry-after label and seconds */
  STANDARD_RETRY_AFTER_LABEL: '15 minutes',
  STANDARD_RETRY_AFTER_SECONDS: DURATION_MS.FIFTEEN_MINUTES / DURATION_MS.SECOND,

  /** Strict limiter max requests per window by environment */
  STRICT_MAX_REQUESTS_PRODUCTION: 10,
  STRICT_MAX_REQUESTS_DEVELOPMENT: 100,

  /** Strict limiter retry-after label and seconds */
  STRICT_RETRY_AFTER_LABEL: '1 hour',
  STRICT_RETRY_AFTER_SECONDS: DURATION_MS.HOUR / DURATION_MS.SECOND,

  /** Bulk import limiter max requests per window by environment */
  BULK_IMPORT_MAX_REQUESTS_PRODUCTION: 5,
  BULK_IMPORT_MAX_REQUESTS_DEVELOPMENT: 50,
} as const;

/**
 * Database runtime configuration
 */
export const DATABASE = {
  /** Busy timeout for SQLite lock waits */
  BUSY_TIMEOUT_MS: TIMEOUTS.SHORT_MS,
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

export const PERSIST_CONTEXT = {
  CREATE: 'create',
  STARTED: 'started',
  RETRY_QUEUED: 'retry_queued',
  FAILED: 'failed',
} as const;

/** System-controlled job metadata keys stripped on retry to prevent injection */
export const RESERVED_JOB_KEYS: ReadonlySet<string> = new Set([
  'retriedFrom',
  'triggeredBy',
  'triggeredAt',
  'retryCount',
]);

export const WORKER_EVENTS = {
  METRICS_UPDATED: 'metrics:updated',
} as const;

/**
 * Output formatting constants
 */
export const FORMATTING = {
  /** Indentation level for JSON.stringify pretty-print */
  JSON_INDENT: 2,

  /** Default decimal places for .toFixed() display */
  DECIMAL_PLACES: 2,
} as const;

/**
 * Process-level constants
 */
export const PROCESS = {
  /** Index where user-supplied arguments begin in process.argv */
  ARGV_START: 2,

  /** File descriptor number for stderr */
  STDERR_FD: 2,

  /** Maximum EventEmitter listeners to register before Node.js warns */
  MAX_LISTENERS: 20,
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
 * Byte-size unit constants
 */
export const BYTES_PER_KB = 1024;

/**
 * Shared upper bound for percentage/score-style metrics.
 */
export const MAX_SCORE = 100;

/**
 * Concurrency limits
 */
export const CONCURRENCY = {
  /** Default maximum concurrent jobs per worker */
  DEFAULT_MAX_JOBS: 5,

  /** Default concurrency for I/O-bound pipelines (git, schema, etc.) */
  DEFAULT_IO_BOUND: 2,

  /** Maximum concurrent worker initializations */
  MAX_WORKER_INITS: 3,

  /** Default max concurrent jobs for analysis pipelines (test-refactor, duplicate-detection, etc.) */
  DEFAULT_PIPELINE_CONCURRENCY: 3,
} as const;

/**
 * Pagination defaults
 */
export const PAGINATION = {
  /** Default page size for short queries (jobs by pipeline, commit history) */
  DEFAULT_QUERY_LIMIT: 10,

  /** Default page size for job listings */
  DEFAULT_LIMIT: 50,

  /** Default page size for all jobs listing */
  DEFAULT_ALL_LIMIT: 100,

  /** Maximum allowed page size to prevent memory issues */
  MAX_LIMIT: 1000,

  /** Number of recent activities to show in the activity feed */
  ACTIVITY_FEED_LIMIT: 20,
} as const;

/**
 * Input validation patterns
 */
export const VALIDATION = {
  /** Job ID pattern - alphanumeric, hyphens, underscores, max 100 chars */
  JOB_ID_PATTERN: /^[a-zA-Z0-9_-]{1,100}$/,
  /** Maximum allowed length for job IDs */
  JOB_ID_MAX_LENGTH: 100,
  /** Replaces characters not allowed in job IDs (for log filename sanitization) */
  JOB_ID_SANITIZE_PATTERN: /[^a-zA-Z0-9_-]/g,
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

  /** Default number of items to display in top-N lists and truncated output */
  DISPLAY_TOP_N: 10,

  /** Default maximum directory traversal depth */
  DEFAULT_MAX_DEPTH: 10,

  /** Maximum child process buffer size in megabytes */
  MAX_BUFFER_MB: 10,

  /** Maximum slow hook entries to display in health reports */
  MAX_SLOW_HOOKS_DISPLAY: 5,

  /** Default maximum suggestions grouped per PR */
  DEFAULT_MAX_SUGGESTIONS_PER_PR: 5,

  /** Short preview list size for inline truncated displays */
  SHORT_PREVIEW_COUNT: 3,

  /** Number of characters to include in error log previews */
  LOG_PREVIEW_CHARS: 100,

  /** Minimum required disk space in megabytes */
  MIN_DISK_SPACE_MB: 100,

  /** Default maximum number of root files before flagging for cleanup */
  DEFAULT_MAX_ROOT_FILES: 20,

  /** Number of trailing stderr/stdout characters to include in error logs */
  STDERR_TAIL_CHARS: 500,

  /** Number of trailing stderr characters for inline error message snippets */
  STDERR_SHORT_TAIL_CHARS: 200,

  /** Maximum number of recent activities to buffer in the activity feed */
  ACTIVITY_BUFFER_SIZE: 50,

  /** Maximum unique strings to include when generating a constants file */
  UNIQUE_STRINGS_LIMIT: 50,

  /** Length of the path hash prefix used in cache keys */
  CACHE_PATH_HASH_LENGTH: 16,

  /** Number of random bytes used to generate WebSocket client IDs */
  CLIENT_ID_BYTES: 16,

  /** Characters of API key to include in log prefixes */
  API_KEY_LOG_PREFIX: 8,

  /** Number of recent performance log entries to analyze */
  PERF_LOG_RECENT_ENTRIES: 100,

  /** Minimum health score to consider a system healthy (no recommendations) */
  HIGH_HEALTH_SCORE: 90,
} as const;

/**
 * General git operation constants
 */
export const GIT = {
  /** Standard short hash character length (git log --short default) */
  SHORT_HASH_LENGTH: 7,

  /** Maximum characters from branch description slug */
  BRANCH_DESCRIPTION_MAX_CHARS: 30,
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
 * Inter-project duplicate scan heuristic thresholds and scoring weights.
 */
export const INTER_PROJECT_SCAN = {
  MIN_BLOCKS_PER_HASH_GROUP: 2,
  MIN_REPOSITORIES_PER_GROUP: 2,
  GROUP_ID_HASH_LENGTH: 12,

  IMPACT_OCCURRENCE_WEIGHT: 5,
  IMPACT_OCCURRENCE_CAP: 40,
  IMPACT_REPOSITORY_WEIGHT: 15,
  IMPACT_LINES_DIVISOR: 2,
  IMPACT_LINES_CAP: 20,

  SHARED_PACKAGE_MAX_REPOSITORIES: 3,
  SHARED_PACKAGE_MAX_OCCURRENCES: 10,
  MCP_SERVER_MIN_REPOSITORIES: 4,
  AUTONOMOUS_AGENT_MIN_OCCURRENCES: 20,

  COMPLEXITY_SIMPLE_REPOSITORIES: 2,
  COMPLEXITY_MODERATE_REPOSITORIES: 3,

  RESULTS_JSON_INDENT_SPACES: 2,
  DEFAULT_SUGGESTION_CONFIDENCE: 0.9,

  CATEGORY_BONUSES: {
    api_handler: 10,
    auth_check: 10,
    database_operation: 8,
    validator: 8,
    error_handler: 6
  },
  COMPLEXITY_MULTIPLIERS: {
    simple: 1.1,
    moderate: 1.0,
    complex: 0.8
  },
  RISK_MULTIPLIERS: {
    low: 1.1,
    medium: 1.0,
    high: 0.8
  },
} as const;

/**
 * Markdown report presentation defaults and score bands.
 */
export const MARKDOWN_REPORT = {
  DEFAULT_MAX_DUPLICATES: 10,
  DEFAULT_MAX_SUGGESTIONS: 10,
  MAX_AFFECTED_FILES: 5,
  MAX_MIGRATION_STEPS: 5,

  DURATION_DECIMAL_PLACES: 2,
  PERCENTAGE_DECIMAL_PLACES: 2,
  PERCENTAGE_MULTIPLIER: MAX_SCORE,

  HIGH_SCORE_MIN: 75,
  MEDIUM_SCORE_MIN: 50,

  /** Default max duplicates when coordinating across report formats */
  COORDINATOR_MAX_DUPLICATES: 20,

  /** Default max suggestions when coordinating across report formats */
  COORDINATOR_MAX_SUGGESTIONS: 20,
} as const;

/**
 * Schema scoring point weights
 */
export const SCHEMA_SCORING = {
  /** Points per SEO improvement */
  SEO_IMPROVEMENTS_WEIGHT: 15,

  /** Points per rich results eligibility entry */
  RICH_RESULTS_WEIGHT: 20,

  /** Bonus for schema having a description field */
  DESCRIPTION_BONUS: 20,

  /** Bonus for schema having a code repository field */
  CODE_REPO_BONUS: 15,
} as const;

/**
 * Test refactor analysis thresholds
 */
export const TEST_REFACTOR = {
  /** Minimum hardcoded string length to flag for extraction */
  MIN_HARDCODED_STRING_LENGTH: 5,

  /** Minimum pattern count before generating a recommendation */
  PATTERN_RECOMMENDATION_THRESHOLD: 5,
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

/**
 * Runtime configuration policy defaults and bounds used by core/config.ts.
 */
export const CONFIG_POLICY = {
  CONCURRENCY: {
    DEFAULT_MAX_CONCURRENT: 5,
    MIN_MAX_CONCURRENT: 1,
    MAX_MAX_CONCURRENT: 50,
  },
  REPOMIX: {
    DEFAULT_MAX_BUFFER_BYTES: 50 * BYTES_PER_KB * BYTES_PER_KB,
    MIN_MAX_BUFFER_BYTES: BYTES_PER_KB,
    MIN_TIMEOUT_MS: DURATION_MS.SECOND,
  },
  PORTS: {
    MIN_PORT: 1,
    MAX_PORT: 65535,
    DEFAULT_HEALTH_CHECK_PORT: 3000,
    DEFAULT_API_PORT: 8080,
    DEFAULT_REDIS_PORT: 6379,
  },
  DOPPLER: {
    DEFAULT_FAILURE_THRESHOLD: 3,
    DEFAULT_SUCCESS_THRESHOLD: 2,
    MIN_THRESHOLD: 1,
    MAX_THRESHOLD: 10,
    MIN_BASE_DELAY_MS: 100,
    DEFAULT_BACKOFF_MULTIPLIER: TIMEOUTS.TWO_SECONDS_MS / TIME_MS.SECOND,
    MIN_BACKOFF_MULTIPLIER: 1.0,
    MAX_BACKOFF_MULTIPLIER: TIMEOUTS.SHORT_MS / TIME_MS.SECOND,
    MIN_TIMEOUT_MS: DURATION_MS.SECOND,
    MIN_MAX_BACKOFF_MS: DURATION_MS.SECOND,
  },
  REDIS: {
    MIN_CACHE_TTL_SECONDS: 1,
  },
  DATABASE: {
    MIN_SAVE_INTERVAL_MS: DURATION_MS.SECOND,
  },
} as const;

/**
 * Plugin management thresholds
 */
export const PLUGIN_THRESHOLDS = {
  /** Hard maximum number of plugins before audit flags as critical */
  MAX_PLUGINS: 30,

  /** Soft warning threshold for plugin count */
  WARN_PLUGINS: 20,
} as const;

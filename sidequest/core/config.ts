import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import {
  CONFIG_POLICY,
  GIT_ACTIVITY,
  JOB_RETENTION,
  NUMBER_BASE,
  RETRY,
  TIMEOUTS
} from './constants.ts';
import { TIME_MS } from './units.ts';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Safely parse an integer from environment variable with bounds checking
 * Prevents NaN propagation and enforces min/max limits
 */
function safeParseInt(value: string | undefined, defaultValue: number, min?: number, max?: number): number {
  const parsed = parseInt(value ?? String(defaultValue), NUMBER_BASE.DECIMAL);
  if (Number.isNaN(parsed)) return defaultValue;
  let result = parsed;
  if (min !== undefined) result = Math.max(min, result);
  if (max !== undefined) result = Math.min(max, result);
  return result;
}

/**
 * Safely parse a float from environment variable with bounds checking
 */
function safeParseFloat(value: string | undefined, defaultValue: number, min?: number, max?: number): number {
  const parsed = parseFloat(value ?? String(defaultValue));
  if (Number.isNaN(parsed)) return defaultValue;
  let result = parsed;
  if (min !== undefined) result = Math.max(min, result);
  if (max !== undefined) result = Math.min(max, result);
  return result;
}

/**
 * Parse per-job-type retention days from JSON object env var.
 * Example: {"repomix":14,"duplicate-detection":60}
 */
function safeParseRetentionByType(value: string | undefined): Record<string, number> {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const result: Record<string, number> = {};
    for (const [jobType, retentionValue] of Object.entries(parsed as Record<string, unknown>)) {
      if (!jobType) continue;

      const parsedDays = typeof retentionValue === 'number'
        ? Math.floor(retentionValue)
        : typeof retentionValue === 'string'
          ? parseInt(retentionValue, NUMBER_BASE.DECIMAL)
          : Number.NaN;

      if (
        !Number.isFinite(parsedDays)
        || parsedDays < JOB_RETENTION.MIN_DAYS
        || parsedDays > JOB_RETENTION.MAX_DAYS
      ) continue;
      result[jobType] = parsedDays;
    }

    return result;
  } catch {
    return {};
  }
}

/**
 * Centralized configuration for AlephAuto
 * All paths are resolved to absolute paths for consistency
 */
export const config = {
  // Base directories
  codeBaseDir: process.env.CODE_BASE_DIR ?? path.join(os.homedir(), 'code'),

  // Output directories (relative to project root or absolute)
  outputBaseDir: process.env.OUTPUT_BASE_DIR
    ? path.resolve(process.env.OUTPUT_BASE_DIR)
    : path.resolve(__dirname, 'output', 'condense'),

  logDir: process.env.LOG_DIR
    ? path.resolve(process.env.LOG_DIR)
    : path.resolve(__dirname, 'logs'),

  scanReportsDir: path.resolve(__dirname, '..', '..', 'output'),

  // Job processing
  maxConcurrent: safeParseInt(
    process.env.MAX_CONCURRENT,
    CONFIG_POLICY.CONCURRENCY.DEFAULT_MAX_CONCURRENT,
    CONFIG_POLICY.CONCURRENCY.MIN_MAX_CONCURRENT,
    CONFIG_POLICY.CONCURRENCY.MAX_MAX_CONCURRENT
  ),
  defaultJobRetentionDays: safeParseInt(
    process.env.JOB_RETENTION_DAYS,
    GIT_ACTIVITY.MONTHLY_WINDOW_DAYS,
    JOB_RETENTION.MIN_DAYS,
    JOB_RETENTION.MAX_DAYS
  ),
  jobRetentionDaysByType: safeParseRetentionByType(process.env.JOB_RETENTION_DAYS_BY_TYPE),

  // Sentry monitoring
  sentryDsn: process.env.SENTRY_DSN,
  nodeEnv: process.env.NODE_ENV || 'production',

  // Cron schedules (default: 2 AM for repomix, 3 AM for docs)
  repomixSchedule: process.env.CRON_SCHEDULE || '0 2 * * *',
  docSchedule: process.env.DOC_CRON_SCHEDULE || '0 3 * * *',

  // Feature flags
  runOnStartup: process.env.RUN_ON_STARTUP === 'true',
  forceEnhancement: process.env.FORCE_ENHANCEMENT === 'true',

  // Git workflow feature flags
  enableGitWorkflow: process.env.ENABLE_GIT_WORKFLOW === 'true',
  gitBaseBranch: process.env.GIT_BASE_BRANCH || 'main',
  gitBranchPrefix: process.env.GIT_BRANCH_PREFIX || 'automated',
  gitDryRun: process.env.GIT_DRY_RUN === 'true', // Skip push/PR in dry run mode

  // PR creation settings
  prDryRun: process.env.PR_DRY_RUN === 'true',
  enablePRCreation: process.env.ENABLE_PR_CREATION === 'true',

  // Repomix settings
  repomixTimeout: safeParseInt(
    process.env.REPOMIX_TIMEOUT,
    TIMEOUTS.REPOMIX_MS,
    CONFIG_POLICY.REPOMIX.MIN_TIMEOUT_MS
  ), // 10 minutes, min 1s
  repomixMaxBuffer: safeParseInt(
    process.env.REPOMIX_MAX_BUFFER,
    CONFIG_POLICY.REPOMIX.DEFAULT_MAX_BUFFER_BYTES,
    CONFIG_POLICY.REPOMIX.MIN_MAX_BUFFER_BYTES
  ), // 50MB, min 1KB
  repomixIgnorePatterns: process.env.REPOMIX_IGNORE_PATTERNS
    ? process.env.REPOMIX_IGNORE_PATTERNS.split(',')
    : ['**/README.md', '**/README.MD', '**/*.md'], // Skip README and markdown files by default

  // Schema.org MCP integration / Documentation Enhancement
  schemaMcpUrl: process.env.SCHEMA_MCP_URL,
  skipDocEnhancement: process.env.SKIP_DOC_ENHANCEMENT === 'true', // Skip README Schema.org enhancement

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',

  // Directory scanner exclusions
  excludeDirs: [
    'node_modules',
    '.git',
    'dist',
    'build',
    'coverage',
    '.next',
    '.nuxt',
    'vendor',
    '__pycache__',
    '.venv',
    'venv',
    'target',
    '.idea',
    '.vscode',
    'jobs',
    '.DS_Store',
    'Thumbs.db',
    '*.swp',
    '*.swo'
  ],

  // Health check server
  healthCheckPort: safeParseInt(
    process.env.HEALTH_CHECK_PORT,
    CONFIG_POLICY.PORTS.DEFAULT_HEALTH_CHECK_PORT,
    CONFIG_POLICY.PORTS.MIN_PORT,
    CONFIG_POLICY.PORTS.MAX_PORT
  ),

  // API server port
  // PORT is standard for Render/Heroku, JOBS_API_PORT is our custom env var
  apiPort: safeParseInt(
    process.env.PORT || process.env.JOBS_API_PORT,
    CONFIG_POLICY.PORTS.DEFAULT_API_PORT,
    CONFIG_POLICY.PORTS.MIN_PORT,
    CONFIG_POLICY.PORTS.MAX_PORT
  ),

  // Doppler resilience configuration
  doppler: {
    // Circuit breaker settings
    failureThreshold: safeParseInt(
      process.env.DOPPLER_FAILURE_THRESHOLD,
      CONFIG_POLICY.DOPPLER.DEFAULT_FAILURE_THRESHOLD,
      CONFIG_POLICY.DOPPLER.MIN_THRESHOLD,
      CONFIG_POLICY.DOPPLER.MAX_THRESHOLD
    ),
    successThreshold: safeParseInt(
      process.env.DOPPLER_SUCCESS_THRESHOLD,
      CONFIG_POLICY.DOPPLER.DEFAULT_SUCCESS_THRESHOLD,
      CONFIG_POLICY.DOPPLER.MIN_THRESHOLD,
      CONFIG_POLICY.DOPPLER.MAX_THRESHOLD
    ),
    timeout: safeParseInt(
      process.env.DOPPLER_TIMEOUT,
      TIMEOUTS.SHORT_MS,
      CONFIG_POLICY.DOPPLER.MIN_TIMEOUT_MS
    ), // 5s before attempting recovery

    // Exponential backoff settings
    baseDelayMs: safeParseInt(
      process.env.DOPPLER_BASE_DELAY_MS,
      RETRY.BASE_BACKOFF_MS,
      CONFIG_POLICY.DOPPLER.MIN_BASE_DELAY_MS
    ), // 1s
    backoffMultiplier: safeParseFloat(
      process.env.DOPPLER_BACKOFF_MULTIPLIER,
      CONFIG_POLICY.DOPPLER.DEFAULT_BACKOFF_MULTIPLIER,
      CONFIG_POLICY.DOPPLER.MIN_BACKOFF_MULTIPLIER,
      CONFIG_POLICY.DOPPLER.MAX_BACKOFF_MULTIPLIER
    ),
    maxBackoffMs: safeParseInt(
      process.env.DOPPLER_MAX_BACKOFF_MS,
      RETRY.MAX_BACKOFF_MS,
      CONFIG_POLICY.DOPPLER.MIN_MAX_BACKOFF_MS
    ), // 10s

    // Cache settings - Doppler CLI uses a fallback directory, not a single file
    cacheDir: process.env.DOPPLER_CACHE_DIR || path.join(os.homedir(), '.doppler', 'fallback')
  },

  // Project root directory
  projectRoot: __dirname,

  // Redis configuration for scan result caching
  redis: {
    // REDIS_URL is typically provided by hosting platforms (Render, Heroku, etc.)
    // Format: redis://[user:password@]host:port
    url: process.env.REDIS_URL || null,
    // Fallback to individual settings for local development
    host: process.env.REDIS_HOST || 'localhost',
    port: safeParseInt(
      process.env.REDIS_PORT,
      CONFIG_POLICY.PORTS.DEFAULT_REDIS_PORT,
      CONFIG_POLICY.PORTS.MIN_PORT,
      CONFIG_POLICY.PORTS.MAX_PORT
    ),
    // Enable caching when Redis is available
    enabled: process.env.REDIS_URL !== undefined || process.env.REDIS_HOST !== undefined,
    // Cache TTL in seconds (default: 30 days)
    ttl: safeParseInt(
      process.env.REDIS_CACHE_TTL,
      GIT_ACTIVITY.MONTHLY_WINDOW_DAYS * (TIME_MS.DAY / TIME_MS.SECOND),
      CONFIG_POLICY.REDIS.MIN_CACHE_TTL_SECONDS
    ),
  },

  // Migration API key for bulk import operations
  // Used to authenticate database migration requests
  migrationApiKey: process.env.MIGRATION_API_KEY || null,

  // Database settings
  database: {
    // NOTE: saveIntervalMs is unused after migration to better-sqlite3 (WAL mode, direct disk writes)
    saveIntervalMs: safeParseInt(
      process.env.DATABASE_SAVE_INTERVAL_MS,
      TIMEOUTS.DATABASE_SAVE_INTERVAL_MS,
      CONFIG_POLICY.DATABASE.MIN_SAVE_INTERVAL_MS
    ),
  },

  // System paths
  homeDir: process.env.HOME || os.homedir(),

  // API key for authenticating protected API endpoints.
  // Implemented as a getter so test overrides of process.env.API_KEY take effect.
  get apiKey(): string | null {
    const value = process.env.API_KEY;
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  },
};

/**
 * Validate configuration on import
 */
function validateConfig(): void {
  const errors: string[] = [];

  if (
    config.maxConcurrent < CONFIG_POLICY.CONCURRENCY.MIN_MAX_CONCURRENT
    || config.maxConcurrent > CONFIG_POLICY.CONCURRENCY.MAX_MAX_CONCURRENT
  ) {
    errors.push(
      `MAX_CONCURRENT must be between ${CONFIG_POLICY.CONCURRENCY.MIN_MAX_CONCURRENT} and ${CONFIG_POLICY.CONCURRENCY.MAX_MAX_CONCURRENT}`
    );
  }

  if (config.repomixTimeout < CONFIG_POLICY.REPOMIX.MIN_TIMEOUT_MS) {
    errors.push(`REPOMIX_TIMEOUT must be at least ${CONFIG_POLICY.REPOMIX.MIN_TIMEOUT_MS}ms`);
  }

  if (config.repomixMaxBuffer < CONFIG_POLICY.REPOMIX.MIN_MAX_BUFFER_BYTES) {
    errors.push(`REPOMIX_MAX_BUFFER must be at least ${CONFIG_POLICY.REPOMIX.MIN_MAX_BUFFER_BYTES} bytes`);
  }

  // Doppler resilience validation
  if (
    config.doppler.failureThreshold < CONFIG_POLICY.DOPPLER.MIN_THRESHOLD
    || config.doppler.failureThreshold > CONFIG_POLICY.DOPPLER.MAX_THRESHOLD
  ) {
    errors.push(
      `DOPPLER_FAILURE_THRESHOLD must be between ${CONFIG_POLICY.DOPPLER.MIN_THRESHOLD} and ${CONFIG_POLICY.DOPPLER.MAX_THRESHOLD}`
    );
  }

  if (
    config.doppler.successThreshold < CONFIG_POLICY.DOPPLER.MIN_THRESHOLD
    || config.doppler.successThreshold > CONFIG_POLICY.DOPPLER.MAX_THRESHOLD
  ) {
    errors.push(
      `DOPPLER_SUCCESS_THRESHOLD must be between ${CONFIG_POLICY.DOPPLER.MIN_THRESHOLD} and ${CONFIG_POLICY.DOPPLER.MAX_THRESHOLD}`
    );
  }

  if (config.doppler.timeout < CONFIG_POLICY.DOPPLER.MIN_TIMEOUT_MS) {
    errors.push(`DOPPLER_TIMEOUT must be at least ${CONFIG_POLICY.DOPPLER.MIN_TIMEOUT_MS}ms`);
  }

  if (config.doppler.baseDelayMs < CONFIG_POLICY.DOPPLER.MIN_BASE_DELAY_MS) {
    errors.push(`DOPPLER_BASE_DELAY_MS must be at least ${CONFIG_POLICY.DOPPLER.MIN_BASE_DELAY_MS}ms`);
  }

  if (
    config.doppler.backoffMultiplier < CONFIG_POLICY.DOPPLER.MIN_BACKOFF_MULTIPLIER
    || config.doppler.backoffMultiplier > CONFIG_POLICY.DOPPLER.MAX_BACKOFF_MULTIPLIER
  ) {
    errors.push(
      `DOPPLER_BACKOFF_MULTIPLIER must be between ${CONFIG_POLICY.DOPPLER.MIN_BACKOFF_MULTIPLIER} and ${CONFIG_POLICY.DOPPLER.MAX_BACKOFF_MULTIPLIER}`
    );
  }

  if (config.doppler.maxBackoffMs < CONFIG_POLICY.DOPPLER.MIN_MAX_BACKOFF_MS) {
    errors.push(`DOPPLER_MAX_BACKOFF_MS must be at least ${CONFIG_POLICY.DOPPLER.MIN_MAX_BACKOFF_MS}ms`);
  }

  // Database validation
  if (config.database.saveIntervalMs < CONFIG_POLICY.DATABASE.MIN_SAVE_INTERVAL_MS) {
    errors.push(`DATABASE_SAVE_INTERVAL_MS must be at least ${CONFIG_POLICY.DATABASE.MIN_SAVE_INTERVAL_MS}ms`);
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

// Validate on import
validateConfig();

export default config;

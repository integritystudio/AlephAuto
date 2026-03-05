import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { GIT_ACTIVITY, JOB_RETENTION, NUMBER_BASE, RETRY, TIME, TIMEOUTS } from './constants.ts';

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
  codeBaseDir: process.env.CODE_BASE_DIR || path.join(os.homedir(), 'code'),

  // Output directories (relative to project root or absolute)
  outputBaseDir: process.env.OUTPUT_BASE_DIR
    ? path.resolve(process.env.OUTPUT_BASE_DIR)
    : path.resolve(__dirname, 'output', 'condense'),

  logDir: process.env.LOG_DIR
    ? path.resolve(process.env.LOG_DIR)
    : path.resolve(__dirname, 'logs'),

  scanReportsDir: path.resolve(__dirname, '..', '..', 'output'),

  // Job processing
  maxConcurrent: safeParseInt(process.env.MAX_CONCURRENT, 5, 1, 50),
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
  repomixTimeout: safeParseInt(process.env.REPOMIX_TIMEOUT, TIMEOUTS.REPOMIX_MS, TIME.SECOND), // 10 minutes, min 1s
  repomixMaxBuffer: safeParseInt(process.env.REPOMIX_MAX_BUFFER, 52428800, 1024), // 50MB, min 1KB
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
  healthCheckPort: safeParseInt(process.env.HEALTH_CHECK_PORT, 3000, 1, 65535),

  // API server port
  // PORT is standard for Render/Heroku, JOBS_API_PORT is our custom env var
  apiPort: safeParseInt(process.env.PORT || process.env.JOBS_API_PORT, 8080, 1, 65535),

  // Doppler resilience configuration
  doppler: {
    // Circuit breaker settings
    failureThreshold: safeParseInt(process.env.DOPPLER_FAILURE_THRESHOLD, 3, 1, 10),
    successThreshold: safeParseInt(process.env.DOPPLER_SUCCESS_THRESHOLD, 2, 1, 10),
    timeout: safeParseInt(process.env.DOPPLER_TIMEOUT, TIMEOUTS.SHORT_MS, TIME.SECOND), // 5s before attempting recovery

    // Exponential backoff settings
    baseDelayMs: safeParseInt(process.env.DOPPLER_BASE_DELAY_MS, RETRY.BASE_BACKOFF_MS, 100), // 1s
    backoffMultiplier: safeParseFloat(process.env.DOPPLER_BACKOFF_MULTIPLIER, 2.0, 1.0, 5.0),
    maxBackoffMs: safeParseInt(process.env.DOPPLER_MAX_BACKOFF_MS, RETRY.MAX_BACKOFF_MS, TIME.SECOND), // 10s

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
    port: safeParseInt(process.env.REDIS_PORT, 6379, 1, 65535),
    // Enable caching when Redis is available
    enabled: process.env.REDIS_URL !== undefined || process.env.REDIS_HOST !== undefined,
    // Cache TTL in seconds (default: 30 days)
    ttl: safeParseInt(process.env.REDIS_CACHE_TTL, GIT_ACTIVITY.MONTHLY_WINDOW_DAYS * (TIME.DAY / TIME.SECOND), 1),
  },

  // Migration API key for bulk import operations
  // Used to authenticate database migration requests
  migrationApiKey: process.env.MIGRATION_API_KEY || null,

  // Database settings
  database: {
    // NOTE: saveIntervalMs is unused after migration to better-sqlite3 (WAL mode, direct disk writes)
    saveIntervalMs: safeParseInt(process.env.DATABASE_SAVE_INTERVAL_MS, TIMEOUTS.DATABASE_SAVE_INTERVAL_MS, TIME.SECOND),
  },

  // System paths
  homeDir: process.env.HOME || os.homedir(),
};

/**
 * Validate configuration on import
 */
function validateConfig(): void {
  const errors: string[] = [];

  if (config.maxConcurrent < 1 || config.maxConcurrent > 50) {
    errors.push('MAX_CONCURRENT must be between 1 and 50');
  }

  if (config.repomixTimeout < TIME.SECOND) {
    errors.push('REPOMIX_TIMEOUT must be at least 1000ms');
  }

  if (config.repomixMaxBuffer < 1024) {
    errors.push('REPOMIX_MAX_BUFFER must be at least 1024 bytes');
  }

  // Doppler resilience validation
  if (config.doppler.failureThreshold < 1 || config.doppler.failureThreshold > 10) {
    errors.push('DOPPLER_FAILURE_THRESHOLD must be between 1 and 10');
  }

  if (config.doppler.successThreshold < 1 || config.doppler.successThreshold > 10) {
    errors.push('DOPPLER_SUCCESS_THRESHOLD must be between 1 and 10');
  }

  if (config.doppler.timeout < TIME.SECOND) {
    errors.push('DOPPLER_TIMEOUT must be at least 1000ms');
  }

  if (config.doppler.baseDelayMs < 100) {
    errors.push('DOPPLER_BASE_DELAY_MS must be at least 100ms');
  }

  if (config.doppler.backoffMultiplier < 1.0 || config.doppler.backoffMultiplier > 5.0) {
    errors.push('DOPPLER_BACKOFF_MULTIPLIER must be between 1.0 and 5.0');
  }

  if (config.doppler.maxBackoffMs < TIME.SECOND) {
    errors.push('DOPPLER_MAX_BACKOFF_MS must be at least 1000ms');
  }

  // Database validation
  if (config.database.saveIntervalMs < TIME.SECOND) {
    errors.push('DATABASE_SAVE_INTERVAL_MS must be at least 1000ms');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

// Validate on import
validateConfig();

export default config;

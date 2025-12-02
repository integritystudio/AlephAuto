import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

  scanReportsDir: process.env.SCAN_REPORTS_DIR
    ? path.resolve(process.env.SCAN_REPORTS_DIR)
    : path.resolve(__dirname, 'output', 'directory-scan-reports'),

  // Job processing
  maxConcurrent: parseInt(process.env.MAX_CONCURRENT || '5', 10),

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

  // Repomix settings
  repomixTimeout: parseInt(process.env.REPOMIX_TIMEOUT || '600000', 10), // 10 minutes
  repomixMaxBuffer: parseInt(process.env.REPOMIX_MAX_BUFFER || '52428800', 10), // 50MB
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
  healthCheckPort: parseInt(process.env.HEALTH_CHECK_PORT || '3000', 10),

  // API server port
  apiPort: parseInt(process.env.JOBS_API_PORT || '8080', 10),

  // Doppler resilience configuration
  doppler: {
    // Circuit breaker settings
    failureThreshold: parseInt(process.env.DOPPLER_FAILURE_THRESHOLD || '3', 10),
    successThreshold: parseInt(process.env.DOPPLER_SUCCESS_THRESHOLD || '2', 10),
    timeout: parseInt(process.env.DOPPLER_TIMEOUT || '5000', 10), // 5s before attempting recovery

    // Exponential backoff settings
    baseDelayMs: parseInt(process.env.DOPPLER_BASE_DELAY_MS || '1000', 10), // 1s
    backoffMultiplier: parseFloat(process.env.DOPPLER_BACKOFF_MULTIPLIER || '2.0'),
    maxBackoffMs: parseInt(process.env.DOPPLER_MAX_BACKOFF_MS || '10000', 10), // 10s

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
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    // Enable caching when Redis is available
    enabled: process.env.REDIS_URL !== undefined || process.env.REDIS_HOST !== undefined,
    // Cache TTL in seconds (default: 30 days)
    ttl: parseInt(process.env.REDIS_CACHE_TTL || String(30 * 24 * 60 * 60), 10),
  },
};

/**
 * Validate configuration on import
 */
function validateConfig() {
  const errors = [];

  if (config.maxConcurrent < 1 || config.maxConcurrent > 50) {
    errors.push('MAX_CONCURRENT must be between 1 and 50');
  }

  if (config.repomixTimeout < 1000) {
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

  if (config.doppler.timeout < 1000) {
    errors.push('DOPPLER_TIMEOUT must be at least 1000ms');
  }

  if (config.doppler.baseDelayMs < 100) {
    errors.push('DOPPLER_BASE_DELAY_MS must be at least 100ms');
  }

  if (config.doppler.backoffMultiplier < 1.0 || config.doppler.backoffMultiplier > 5.0) {
    errors.push('DOPPLER_BACKOFF_MULTIPLIER must be between 1.0 and 5.0');
  }

  if (config.doppler.maxBackoffMs < 1000) {
    errors.push('DOPPLER_MAX_BACKOFF_MS must be at least 1000ms');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

// Validate on import
validateConfig();

export default config;

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

/**
 * PM2 Ecosystem Configuration - Production
 *
 * Usage:
 *   doppler run -- pm2 start config/ecosystem.config.cjs              # Start with Doppler env vars
 *   doppler run -- pm2 restart config/ecosystem.config.cjs --update-env  # Restart with updated env
 *   pm2 save                                                   # Save current process list
 *
 * Environment variables are pulled from Doppler at PM2 startup and preserved
 * across PM2 restarts. All variables have fallback defaults.
 *
 * Note: Uses __dirname to resolve paths relative to this config file,
 * ensuring consistency between local development and CI/CD deployment.
 */

// CRITICAL: Include Homebrew paths for npx/node availability in child processes
// This prevents "spawn npx ENOENT" errors in workers (E4 bugfix 2025-11-25)
const PATH_FALLBACK = '/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';

const LOG_DATE_FORMAT = 'YYYY-MM-DD HH:mm:ss Z';

// Shared env fields present in all three processes
const SHARED_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  SENTRY_DSN: process.env.SENTRY_DSN,
  SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT,
  PATH: process.env.PATH || PATH_FALLBACK
};

// Shared logging + interpreter config (max_size triggers pm2-logrotate)
const SHARED_LOGGING = {
  log_date_format: LOG_DATE_FORMAT,
  merge_logs: true,
  max_size: '10M',
  // CRITICAL: Use node interpreter explicitly to prevent "fork/exec permission denied" errors
  // This tells PM2 to run: node <script>
  // NOT: ./<script> (which would require shebang + executable permissions)
  interpreter: 'node'
};

module.exports = {
  apps: [
    /**
     * Dashboard & API Server
     * Runs in fork mode (single instance) to prevent port conflicts
     * Note: Cluster mode disabled due to EADDRINUSE errors with WebSocket server
     */
    {
      name: process.env.NAME,
      script: process.env.SCRIPT,
      cwd: PROJECT_ROOT,
      instances: process.env.INSTANCES,
      exec_mode: process.env.EXEC_MODE,
      autorestart: process.env.AUTORESTART,
      watch: process.env.WATCH,
      max_memory_restart: process.env.MAX_MEMORY_RESTART,

      // Node.js arguments - preload script to set EventEmitter max listeners before any imports
      node_args: '--strip-types --import ./instrument.ts --import ./api/preload.ts --max-old-space-size=512',

      // Environment variables (pulled from Doppler at PM2 startup)
      env: {
        ...SHARED_ENV,
        JOBS_API_PORT: process.env.JOBS_API_PORT,
        REDIS_HOST: process.env.REDIS_HOST,
        REDIS_PORT: process.env.REDIS_PORT
      },

      // Logging (max_size triggers pm2-logrotate)
      error_file: path.join(LOGS_DIR, 'pm2-dashboard-error.log'),
      out_file: path.join(LOGS_DIR, 'pm2-dashboard-out.log'),
      ...SHARED_LOGGING,

      // Restart behavior - ENHANCED to prevent restart loops
      min_uptime: '30s',  // CHANGED: Process must stay up 30s to be considered stable (was 10s)
      max_restarts: 5,  // CHANGED: Reduced from 10 to prevent infinite loops
      restart_delay: 8000,  // CHANGED: Increased from 4s to 8s to allow port cleanup
      exp_backoff_restart_delay: 100,  // NEW: Enable exponential backoff on restarts

      // Monitoring - ENHANCED for better error detection
      listen_timeout: 10000,  // CHANGED: Increased from 3s to 10s for slower startups
      kill_timeout: 10000,  // CHANGED: Increased from 5s to 10s for graceful shutdown

      // NEW: Stop restarting if it crashes within min_uptime 3 times in a row
      stop_exit_codes: [0],  // Only stop on clean exit (code 0)

      // NEW: Throttle restarts to prevent rapid crash loops
      vizion: false  // Disable git integration for faster restarts
    },

    /**
     * Background Worker (Duplicate Detection Pipeline)
     * Runs in fork mode (single instance)
     */
    {
      name: 'aleph-worker',
      script: 'sidequest/pipeline-runners/duplicate-detection-pipeline.ts',
      cwd: PROJECT_ROOT,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',

      // Node.js arguments - enable TypeScript strip-types for .ts imports
      node_args: '--strip-types --import ./instrument.ts',

      // Environment variables (pulled from Doppler at PM2 startup)
      env: {
        ...SHARED_ENV,
        JOBS_API_PORT: process.env.JOBS_API_PORT,
        REDIS_HOST: process.env.REDIS_HOST,
        REDIS_PORT: process.env.REDIS_PORT,
        CRON_SCHEDULE: '0 2 * * *',
        DOC_CRON_SCHEDULE: '0 3 * * *',
        GIT_CRON_SCHEDULE: '0 20 * * 0',
        PLUGIN_CRON_SCHEDULE: '0 9 * * 1',
        CLAUDE_HEALTH_CRON_SCHEDULE: '0 8 * * *',
        CLOUDFLARE_KV_NAMESPACE_ID: process.env.KV_NAMESPACE_ID
      },

      // Logging (max_size triggers pm2-logrotate)
      error_file: path.join(LOGS_DIR, 'pm2-worker-error.log'),
      out_file: path.join(LOGS_DIR, 'pm2-worker-out.log'),
      ...SHARED_LOGGING,

      // Restart behavior (more lenient for long-running jobs)
      min_uptime: '60s',
      max_restarts: 5,
      restart_delay: 10000,

      // Disabled wait_ready — PM2 6.x sends SIGINT before listen_timeout
      // when using --strip-types with .ts files. The cron scheduler keeps
      // the event loop alive, so ready signal is unnecessary.
      wait_ready: false,
      kill_timeout: 15000  // Allow 15s for graceful shutdown
    },

    /**
     * Dashboard Populate Pipeline (DP-H1)
     *
     * Runs derive → judge → KV sync on a cron schedule (default: 6 AM, 6 PM).
     * Uses --cron to keep the process alive with node-cron scheduler.
     * Requires KV_NAMESPACE_ID for sync-to-kv step and ANTHROPIC_API_KEY
     * (injected via Doppler) for the LLM judge step.
     */
    {
      name: 'aleph-populate',
      script: 'sidequest/pipeline-runners/dashboard-populate-pipeline.ts',
      args: '--cron',
      cwd: PROJECT_ROOT,
      instances: process.env.INSTANCES,
      exec_mode: 'fork',
      autorestart: process.env.AUTORESTART,
      watch: process.env.WATCH,
      max_memory_restart: '1G',

      // Node.js arguments - enable TypeScript strip-types for .ts imports
      // NOTE: Do not add --import ./api/preload.ts here — it causes crash loops
      // under PM2 6.x with this pipeline runner. EventEmitter limits are not needed
      // since this process only runs a single cron-triggered worker.
      node_args: '--strip-types --import ./instrument.ts',

      // Environment variables (pulled from Doppler at PM2 startup)
      env: {
        ...SHARED_ENV,
        DASHBOARD_CRON_SCHEDULE: '0 6,18 * * *',
        CLOUDFLARE_KV_NAMESPACE_ID: process.env.KV_NAMESPACE_ID
      },

      // Logging
      error_file: path.join(LOGS_DIR, 'pm2-populate-error.log'),
      out_file: path.join(LOGS_DIR, 'pm2-populate-out.log'),
      ...SHARED_LOGGING,

      // Restart behavior (lenient — jobs can take several minutes)
      min_uptime: '60s',
      max_restarts: 5,
      restart_delay: 10000,

      wait_ready: false,
      kill_timeout: 15000
    }
  ],

  /**
   * Deployment Configuration (Optional)
   * For automated deployments via PM2 deploy
   */
  deploy: {
    production: {
      user: process.env.RENDER_DB_USER,
      host: process.env.DATABASE_URL,
      ref: 'origin/main',
      repo: process.env.GIT_REPO_SSH,
      path: process.env.DEPLOY_PATH,

      // Pre-deploy commands
      'pre-deploy-local': 'echo "Deploying to production..."',

      // Post-deploy commands
      'post-deploy': 'npm ci --production && ' +
                     'source venv/bin/activate && pip install -r requirements.txt && ' +
                     'doppler run --config prd -- pm2 reload config/ecosystem.config.cjs --env production && ' +
                     'pm2 save',

      // Pre-setup commands (first-time deployment)
      'pre-setup': 'sudo apt update && sudo apt install -y git',

      // Environment
      env: {
        NODE_ENV: process.env.NODE_ENV || 'production'
      }
    }
  }
};

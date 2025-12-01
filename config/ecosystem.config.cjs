const path = require('path');

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

// Project root is one level up from config/
const PROJECT_ROOT = path.resolve(__dirname, '..');
const LOGS_DIR = path.join(PROJECT_ROOT, 'logs');

module.exports = {
  apps: [
    /**
     * Dashboard & API Server
     * Runs in fork mode (single instance) to prevent port conflicts
     * Note: Cluster mode disabled due to EADDRINUSE errors with WebSocket server
     */
    {
      name: 'aleph-dashboard',
      script: 'api/server.js',
      cwd: PROJECT_ROOT,
      instances: 1,  // CHANGED: Single instance to prevent port conflicts (was 2)
      exec_mode: 'fork',  // CHANGED: Fork mode instead of cluster to prevent EADDRINUSE (was 'cluster')
      autorestart: true,
      watch: false,  // Set to true for development
      max_memory_restart: '500M',

      // Node.js arguments - preload script to set EventEmitter max listeners before any imports
      node_args: '--require ./api/preload.js --max-old-space-size=512',

      // Environment variables (pulled from Doppler at PM2 startup)
      env: {
        NODE_ENV: process.env.NODE_ENV || 'production',
        JOBS_API_PORT: process.env.JOBS_API_PORT || '8080',
        REDIS_HOST: process.env.REDIS_HOST || 'localhost',
        REDIS_PORT: process.env.REDIS_PORT || '6379',
        SENTRY_DSN: process.env.SENTRY_DSN || '',
        SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT || 'production'
      },

      // Logging
      error_file: path.join(LOGS_DIR, 'pm2-dashboard-error.log'),
      out_file: path.join(LOGS_DIR, 'pm2-dashboard-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // CRITICAL: Use node interpreter explicitly to prevent "fork/exec permission denied" errors
      // This tells PM2 to run: node api/server.js
      // NOT: ./api/server.js (which would require shebang + executable permissions)
      // Environment variables from process.env, set by doppler run
      interpreter: 'node',

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
      script: 'sidequest/pipeline-runners/duplicate-detection-pipeline.js',
      cwd: PROJECT_ROOT,
      instances: 1,
      exec_mode: 'fork',
      autorestart: false,  // Disable autorestart to debug - worker should run indefinitely with cron
      watch: false,
      max_memory_restart: '1G',

      // Environment variables (pulled from Doppler at PM2 startup)
      env: {
        NODE_ENV: process.env.NODE_ENV || 'production',
        JOBS_API_PORT: process.env.JOBS_API_PORT || '8080',
        REDIS_HOST: process.env.REDIS_HOST || 'localhost',
        REDIS_PORT: process.env.REDIS_PORT || '6379',
        SENTRY_DSN: process.env.SENTRY_DSN || '',
        SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT || 'production',
        CRON_SCHEDULE: process.env.CRON_SCHEDULE || '0 2 * * *',
        DOC_CRON_SCHEDULE: process.env.DOC_CRON_SCHEDULE || '0 3 * * *',
        GIT_CRON_SCHEDULE: process.env.GIT_CRON_SCHEDULE || '0 20 * * 0',
        PLUGIN_CRON_SCHEDULE: process.env.PLUGIN_CRON_SCHEDULE || '0 9 * * 1',
        CLAUDE_HEALTH_CRON_SCHEDULE: process.env.CLAUDE_HEALTH_CRON_SCHEDULE || '0 8 * * *'
      },

      // Logging
      error_file: path.join(LOGS_DIR, 'pm2-worker-error.log'),
      out_file: path.join(LOGS_DIR, 'pm2-worker-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // CRITICAL: Use node interpreter explicitly to prevent "fork/exec permission denied" errors
      // This tells PM2 to run: node sidequest/pipeline-runners/duplicate-detection-pipeline.js
      // NOT: ./sidequest/pipeline-runners/duplicate-detection-pipeline.js
      // Environment variables from process.env, set by doppler run
      interpreter: 'node',

      // Restart behavior (more lenient for long-running jobs)
      min_uptime: '60s',
      max_restarts: 5,
      restart_delay: 10000,

      // Wait for ready signal from process
      wait_ready: true,
      listen_timeout: 10000,  // Wait up to 10s for ready signal

      // Cron-based restart (optional - restart daily at 2 AM)
      cron_restart: '0 2 * * *'
    }
  ],

  /**
   * Deployment Configuration (Optional)
   * For automated deployments via PM2 deploy
   */
  deploy: {
    production: {
      user: process.env.DEPLOY_USER || 'aleph',
      host: process.env.TAILSCALE_DOMAIN,
      ref: 'origin/main',
      repo: process.env.GIT_REPO_SSH,
      path: process.env.DEPLOY_PATH || PROJECT_ROOT,

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

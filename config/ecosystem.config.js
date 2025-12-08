const path = require('path');

/**
 * PM2 Ecosystem Configuration Template
 *
 * This is a template file. The actual production config is ecosystem.config.cjs.
 *
 * Usage:
 *   doppler run -- pm2 start config/ecosystem.config.cjs              # Start with Doppler env vars
 *   doppler run -- pm2 restart config/ecosystem.config.cjs --update-env  # Restart with updated env
 *   pm2 save                                                   # Save current process list
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
      instances: 1,  // Single instance to prevent port conflicts
      exec_mode: 'fork',  // Fork mode instead of cluster to prevent EADDRINUSE
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
      interpreter: 'node',

      // Restart behavior
      min_uptime: '30s',
      max_restarts: 5,
      restart_delay: 8000,
      exp_backoff_restart_delay: 100,

      // Monitoring
      listen_timeout: 10000,
      kill_timeout: 10000,

      stop_exit_codes: [0],
      vizion: false
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
      autorestart: false,
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

      // CRITICAL: Use node interpreter explicitly
      interpreter: 'node',

      // Restart behavior (more lenient for long-running jobs)
      min_uptime: '60s',
      max_restarts: 5,
      restart_delay: 10000,

      // Wait for ready signal from process
      wait_ready: true,
      listen_timeout: 10000,

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

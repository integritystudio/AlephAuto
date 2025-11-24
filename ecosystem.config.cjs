/**
 * PM2 Ecosystem Configuration - macOS Development/Production
 *
 * Usage:
 *   doppler run -- pm2 start ecosystem.config.cjs              # Start with Doppler env vars
 *   doppler run -- pm2 restart ecosystem.config.cjs --update-env  # Restart with updated env
 *   pm2 save                                                   # Save current process list
 *
 * Environment variables are pulled from Doppler at PM2 startup and preserved
 * across PM2 restarts. All variables have fallback defaults.
 */

module.exports = {
  apps: [
    /**
     * Dashboard & API Server
     * Runs in cluster mode for load balancing
     */
    {
      name: 'aleph-dashboard',
      script: 'api/server.js',
      cwd: '/Users/alyshialedlie/code/jobs',
      instances: 2,  // Or 'max' to use all CPU cores
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,  // Set to true for development
      max_memory_restart: '500M',

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
      error_file: '/Users/alyshialedlie/code/jobs/logs/pm2-dashboard-error.log',
      out_file: '/Users/alyshialedlie/code/jobs/logs/pm2-dashboard-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Use node interpreter (environment variables from process.env, set by doppler run)
      interpreter: 'node',

      // Restart behavior
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,

      // Monitoring
      listen_timeout: 3000,
      kill_timeout: 5000
    },

    /**
     * Background Worker (Duplicate Detection Pipeline)
     * Runs in fork mode (single instance)
     */
    {
      name: 'aleph-worker',
      script: 'sidequest/pipeline-runners/duplicate-detection-pipeline.js',
      cwd: '/Users/alyshialedlie/code/jobs',
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
      error_file: '/Users/alyshialedlie/code/jobs/logs/pm2-worker-error.log',
      out_file: '/Users/alyshialedlie/code/jobs/logs/pm2-worker-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Use node interpreter (environment variables from process.env, set by doppler run)
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
  ]
};

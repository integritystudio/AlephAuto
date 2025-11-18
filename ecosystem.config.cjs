/**
 * PM2 Ecosystem Configuration - macOS Development/Production
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *   pm2 restart ecosystem.config.cjs
 *   pm2 reload ecosystem.config.cjs --update-env
 *   pm2 save  # Save current process list
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

      // Environment variables (Doppler injects all secrets)
      env: {
        NODE_ENV: 'production'
      },

      // Logging
      error_file: '/Users/alyshialedlie/code/jobs/logs/pm2-dashboard-error.log',
      out_file: '/Users/alyshialedlie/code/jobs/logs/pm2-dashboard-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Use Doppler to inject secrets
      interpreter: 'doppler',
      interpreter_args: 'run --',

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
      script: 'pipelines/duplicate-detection-pipeline.js',
      cwd: '/Users/alyshialedlie/code/jobs',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',

      // Environment variables (Doppler injects all secrets)
      env: {
        NODE_ENV: 'production'
      },

      // Logging
      error_file: '/Users/alyshialedlie/code/jobs/logs/pm2-worker-error.log',
      out_file: '/Users/alyshialedlie/code/jobs/logs/pm2-worker-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Use Doppler to inject secrets
      interpreter: 'doppler',
      interpreter_args: 'run --',

      // Restart behavior (more lenient for long-running jobs)
      min_uptime: '60s',
      max_restarts: 5,
      restart_delay: 10000,

      // Cron-based restart (optional - restart daily at 2 AM)
      cron_restart: '0 2 * * *'
    }
  ]
};

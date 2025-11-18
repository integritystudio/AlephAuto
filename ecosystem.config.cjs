/**
 * PM2 Ecosystem Configuration (macOS Development)
 *
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 restart ecosystem.config.js
 *   pm2 reload ecosystem.config.js --update-env
 */

const os = require('os');
const path = require('path');

const APP_DIR = path.join(os.homedir(), 'code', 'jobs');
const LOG_DIR = path.join(APP_DIR, 'logs');

module.exports = {
  apps: [
    /**
     * Dashboard & API Server
     * Runs in cluster mode for load balancing
     */
    {
      name: 'aleph-dashboard',
      script: 'doppler',
      args: 'run -- node api/server.js',
      cwd: APP_DIR,
      instances: 1,  // Use 1 instance for local dev, 'max' for production
      exec_mode: 'fork',
      autorestart: true,
      watch: false,  // Set to true for development auto-reload
      max_memory_restart: '500M',

      // Logging
      error_file: path.join(LOG_DIR, 'pm2-dashboard-error.log'),
      out_file: path.join(LOG_DIR, 'pm2-dashboard-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

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
      script: 'doppler',
      args: 'run -- node pipelines/duplicate-detection-pipeline.js',
      cwd: APP_DIR,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',

      // Logging
      error_file: path.join(LOG_DIR, 'pm2-worker-error.log'),
      out_file: path.join(LOG_DIR, 'pm2-worker-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Restart behavior (more lenient for long-running jobs)
      min_uptime: '60s',
      max_restarts: 5,
      restart_delay: 10000,

      // Cron-based restart (optional - restart daily at 2 AM)
      cron_restart: '0 2 * * *'
    }
  ]
};

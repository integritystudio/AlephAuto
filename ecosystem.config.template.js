/**
 * PM2 Ecosystem Configuration Template
 *
 * Copy this file to ecosystem.config.js and replace YOUR_DOPPLER_TOKEN
 *
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 restart ecosystem.config.js
 *   pm2 reload ecosystem.config.js --update-env
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
      cwd: '/var/www/aleph-dashboard',
      instances: 2,  // Or 'max' to use all CPU cores
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,  // Set to true for development
      max_memory_restart: '500M',

      // Environment variables
      env: {
        NODE_ENV: 'production',
        DOPPLER_TOKEN: 'YOUR_DOPPLER_TOKEN_HERE'  // Replace with actual token
      },

      // Logging
      error_file: '/var/www/aleph-dashboard/logs/pm2-dashboard-error.log',
      out_file: '/var/www/aleph-dashboard/logs/pm2-dashboard-out.log',
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
      cwd: '/var/www/aleph-dashboard',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',

      // Environment variables
      env: {
        NODE_ENV: 'production',
        DOPPLER_TOKEN: 'YOUR_DOPPLER_TOKEN_HERE'  // Replace with actual token
      },

      // Logging
      error_file: '/var/www/aleph-dashboard/logs/pm2-worker-error.log',
      out_file: '/var/www/aleph-dashboard/logs/pm2-worker-out.log',
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
  ],

  /**
   * Deployment Configuration (Optional)
   * For automated deployments via PM2 deploy
   */
  deploy: {
    production: {
      user: 'aleph',
      host: 'your-server-ip',  // Replace with actual server IP/hostname
      ref: 'origin/main',
      repo: 'git@github.com:your-username/your-repo.git',  // Replace with actual repo
      path: '/var/www/aleph-dashboard',

      // Pre-deploy commands
      'pre-deploy-local': 'echo "Deploying to production..."',

      // Post-deploy commands
      'post-deploy': 'npm ci --production && ' +
                     'source venv/bin/activate && pip install -r requirements.txt && ' +
                     'pm2 reload ecosystem.config.js --env production && ' +
                     'pm2 save',

      // Pre-setup commands (first-time deployment)
      'pre-setup': 'sudo apt update && sudo apt install -y git',

      // Environment
      env: {
        NODE_ENV: 'production'
      }
    }
  }
};

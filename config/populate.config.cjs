const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

/**
 * PM2 Process Config — Dashboard Populate Pipeline (DP-H1)
 *
 * Runs derive → judge → KV sync on a cron schedule (default: 6 AM, 6 PM).
 * Uses --cron to keep the process alive with node-cron scheduler.
 * Requires CLOUDFLARE_KV_NAMESPACE_ID for sync-to-kv step and ANTHROPIC_API_KEY
 * (injected via Doppler) for the LLM judge step.
 *
 * Imported by ecosystem.config.cjs — do not start standalone.
 */

const PROJECT_ROOT = path.resolve(__dirname, '..');
const LOGS_DIR = path.join(PROJECT_ROOT, 'logs');

module.exports = {
  name: 'aleph-populate',
  script: 'sidequest/pipeline-runners/dashboard-populate-pipeline.ts',
  args: '--cron',
  cwd: PROJECT_ROOT,
  instances: 1,
  exec_mode: 'fork',
  autorestart: true,
  watch: false,
  max_memory_restart: '1G',

  // Node.js arguments - enable TypeScript strip-types for .ts imports
  // NOTE: Do not add --import ./api/preload.ts here — it causes crash loops
  // under PM2 6.x with this pipeline runner. EventEmitter limits are not needed
  // since this process only runs a single cron-triggered worker.
  node_args: '--strip-types',

  // Environment variables (pulled from Doppler at PM2 startup)
  env: {
    NODE_ENV: process.env.NODE_ENV || 'production',
    SENTRY_DSN: process.env.SENTRY_DSN || '',
    SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT || 'production',
    DASHBOARD_CRON_SCHEDULE: process.env.DASHBOARD_CRON_SCHEDULE || '0 6,18 * * *',
    CLOUDFLARE_KV_NAMESPACE_ID: process.env.CLOUDFLARE_KV_NAMESPACE_ID || '',
    // CRITICAL: Include Homebrew paths for npx/wrangler availability in child processes
    PATH: process.env.PATH || '/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
  },

  // Logging
  error_file: path.join(LOGS_DIR, 'pm2-populate-error.log'),
  out_file: path.join(LOGS_DIR, 'pm2-populate-out.log'),
  log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  merge_logs: true,
  max_size: '10M',

  interpreter: 'node',

  // Restart behavior (lenient — jobs can take several minutes)
  min_uptime: '60s',
  max_restarts: 5,
  restart_delay: 10000,

  wait_ready: false,
  kill_timeout: 15000
};

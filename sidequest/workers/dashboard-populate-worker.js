// @ts-nocheck
import { SidequestServer } from '../core/server.ts';
import { generateReport } from '../utils/report-generator.js';
import { createComponentLogger } from '../utils/logger.ts';
import * as Sentry from '@sentry/node';
import { execCommandOrThrow } from '@shared/process-io';
import path from 'path';
import os from 'os';
const logger = createComponentLogger('DashboardPopulateWorker');

const DASHBOARD_DIR = path.join(os.homedir(), '.claude', 'mcp-servers', 'observability-toolkit', 'dashboard');
const TOOLKIT_DIR = path.join(os.homedir(), '.claude', 'mcp-servers', 'observability-toolkit');

/**
 * DashboardPopulateWorker - Runs the quality-metrics-dashboard populate pipeline
 *
 * Shells out to `npm run populate` in the dashboard submodule, which executes:
 *   1. derive-evaluations  → rule-based metrics
 *   2. judge-evaluations   → LLM-based metrics (or --seed for offline)
 *   3. sync-to-kv          → aggregate + upload to Cloudflare KV
 */
export class DashboardPopulateWorker extends SidequestServer {
  constructor(options = {}) {
    super({
      ...options,
      jobType: 'dashboard-populate',
    });
    this.dashboardDir = options.dashboardDir || DASHBOARD_DIR;
    this.toolkitDir = options.toolkitDir || TOOLKIT_DIR;
  }

  /**
   * Create a populate job
   */
  createPopulateJob(options = {}) {
    const jobId = `dashboard-populate-${Date.now()}`;
    return this.createJob(jobId, {
      type: 'populate',
      seed: options.seed ?? true,
      dryRun: options.dryRun ?? false,
      skipJudge: options.skipJudge ?? false,
      skipSync: options.skipSync ?? false,
      limit: options.limit,
    });
  }

  /**
   * Run the populate pipeline
   */
  async runJobHandler(job) {
    const startTime = Date.now();
    const { seed, dryRun, skipJudge, skipSync, limit } = job.data;

    logger.info({
      jobId: job.id,
      seed,
      dryRun,
      skipJudge,
      skipSync,
      limit,
    }, 'Running dashboard populate job');

    try {
      // Build parent toolkit first (sync-to-kv imports from dist/)
      if (!skipSync) {
        logger.info({ jobId: job.id }, 'Building parent observability-toolkit');
        await execCommandOrThrow('npm', ['run', 'build'], {
          cwd: this.toolkitDir,
        });
      }

      // Build populate args
      const populateArgs = ['run', 'populate', '--'];
      if (seed) populateArgs.push('--seed');
      if (dryRun) populateArgs.push('--dry-run');
      if (skipJudge) populateArgs.push('--skip-judge');
      if (skipSync) populateArgs.push('--skip-sync');
      if (limit) populateArgs.push('--limit', String(limit));

      logger.info({
        jobId: job.id,
        command: `npm ${populateArgs.join(' ')}`,
        cwd: this.dashboardDir,
      }, 'Executing populate pipeline');

      const { stdout, stderr } = await execCommandOrThrow('npm', populateArgs, {
        cwd: this.dashboardDir,
        timeout: 5 * 60 * 1000, // 5 minutes
        env: { ...process.env, FORCE_COLOR: '0' },
      });

      // Parse step timings from stdout
      const stepTimings = this.#parseTimings(stdout);

      const endTime = Date.now();
      const output = {
        seed,
        dryRun,
        skipJudge,
        skipSync,
        limit,
        steps: stepTimings,
        durationMs: endTime - startTime,
        stdout: stdout.slice(-2000), // last 2KB for logs
        stderr: stderr.slice(-1000),
        timestamp: new Date().toISOString(),
      };

      logger.info({
        jobId: job.id,
        durationMs: output.durationMs,
        steps: stepTimings.length,
      }, 'Dashboard populate job completed');

      // Generate report
      const reportPaths = await generateReport({
        jobId: job.id,
        jobType: 'dashboard-populate',
        status: 'completed',
        result: output,
        startTime,
        endTime,
        parameters: job.data,
        metadata: { steps: stepTimings },
      });

      output.reportPaths = reportPaths;
      return output;
    } catch (error) {
      logger.error({
        jobId: job.id,
        error: error.message,
        stderr: error.stderr?.slice(-1000),
      }, 'Dashboard populate job failed');

      Sentry.captureException(error, {
        tags: {
          component: 'dashboard-populate-worker',
          job_id: job.id,
        },
        extra: { seed, dryRun, skipJudge, skipSync },
      });

      throw error;
    }
  }

  /**
   * Parse step timings from populate-dashboard.ts stdout
   * @private
   */
  #parseTimings(stdout) {
    const timings = [];
    const lines = stdout.split('\n');
    for (const line of lines) {
      // Match: "  derive-evaluations         1234ms"
      const match = line.match(/^\s{2}(\S+)\s+(\d+)ms$/);
      if (match && match[1] !== 'total') {
        timings.push({ name: match[1], ms: parseInt(match[2], 10) });
      }
    }
    return timings;
  }
}

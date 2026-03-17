import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import { DashboardPopulateWorker } from '../../sidequest/workers/dashboard-populate-worker.ts';

describe('DashboardPopulateWorker', () => {
  describe('constructor', () => {
    it('should initialize with default directories', () => {
      const worker = new DashboardPopulateWorker();
      const expectedDashboard = path.join(os.homedir(), '.claude', 'mcp-servers', 'observability-toolkit', 'dashboard');
      const expectedToolkit = path.join(os.homedir(), '.claude', 'mcp-servers', 'observability-toolkit');

      assert.strictEqual(worker.dashboardDir, expectedDashboard);
      assert.strictEqual(worker.toolkitDir, expectedToolkit);
    });

    it('should accept custom directories', () => {
      const worker = new DashboardPopulateWorker({
        dashboardDir: '/custom/dashboard',
        toolkitDir: '/custom/toolkit',
      });
      assert.strictEqual(worker.dashboardDir, '/custom/dashboard');
      assert.strictEqual(worker.toolkitDir, '/custom/toolkit');
    });

    it('should pass maxConcurrent to SidequestServer', () => {
      const worker = new DashboardPopulateWorker({ maxConcurrent: 2 });
      assert.strictEqual(worker.maxConcurrent, 2);
    });

    it('should set jobType to dashboard-populate', () => {
      const worker = new DashboardPopulateWorker();
      assert.strictEqual(worker.jobType, 'dashboard-populate');
    });

    it('should inherit from SidequestServer', () => {
      const worker = new DashboardPopulateWorker();
      assert.ok(typeof worker.createJob === 'function');
      assert.ok(typeof worker.getJob === 'function');
      assert.ok(typeof worker.getAllJobs === 'function');
      assert.ok(typeof worker.getStats === 'function');
      assert.ok(typeof worker.runJobHandler === 'function');
    });
  });

  describe('createPopulateJob', () => {
    it('should create job with default options (seed=true, rest false)', () => {
      const worker = new DashboardPopulateWorker();
      worker.stop();

      const job = worker.createPopulateJob();

      assert.ok(job.id.startsWith('dashboard-populate-'));
      assert.strictEqual(job.data.type, 'populate');
      assert.strictEqual(job.data.seed, true);
      assert.strictEqual(job.data.dryRun, false);
      assert.strictEqual(job.data.skipJudge, false);
      assert.strictEqual(job.data.skipSync, false);
      assert.strictEqual(job.data.limit, undefined);
    });

    it('should create job with all custom options', () => {
      const worker = new DashboardPopulateWorker();
      worker.stop();

      const job = worker.createPopulateJob({
        seed: false,
        dryRun: true,
        skipJudge: true,
        skipSync: true,
        limit: 5,
      });

      assert.strictEqual(job.data.seed, false);
      assert.strictEqual(job.data.dryRun, true);
      assert.strictEqual(job.data.skipJudge, true);
      assert.strictEqual(job.data.skipSync, true);
      assert.strictEqual(job.data.limit, 5);
    });

    it('should create job with partial options', () => {
      const worker = new DashboardPopulateWorker();
      worker.stop();

      const job = worker.createPopulateJob({ dryRun: true });

      assert.strictEqual(job.data.seed, true);
      assert.strictEqual(job.data.dryRun, true);
      assert.strictEqual(job.data.skipJudge, false);
      assert.strictEqual(job.data.skipSync, false);
    });

    it('should generate unique job IDs', () => {
      const worker = new DashboardPopulateWorker();
      worker.stop();

      const job1 = worker.createPopulateJob();
      const job2 = worker.createPopulateJob();
      assert.notStrictEqual(job1.id, job2.id);
    });

    it('should generate timestamp-based job IDs', () => {
      const worker = new DashboardPopulateWorker();
      worker.stop();

      const before = Date.now();
      const job = worker.createPopulateJob();
      const after = Date.now();

      const timestamp = parseInt(job.id.replace('dashboard-populate-', ''), 10);
      assert.ok(timestamp >= before);
      assert.ok(timestamp <= after);
    });

    it('should emit job:created event', async () => {
      const worker = new DashboardPopulateWorker();
      worker.stop();

      const eventPromise = new Promise<void>((resolve) => {
        worker.on('job:created', (job) => {
          assert.strictEqual(job.data.type, 'populate');
          resolve();
        });
      });

      worker.createPopulateJob();
      await eventPromise;
    });

    it('should queue multiple jobs', () => {
      const worker = new DashboardPopulateWorker();
      worker.stop();

      worker.createPopulateJob();
      worker.createPopulateJob({ dryRun: true });
      worker.createPopulateJob({ skipJudge: true });

      const allJobs = worker.getAllJobs();
      assert.strictEqual(allJobs.length, 3);
    });
  });

  describe('createPopulateJob - limit edge cases', () => {
    it('should preserve limit=0 as falsy (no --limit flag)', () => {
      const worker = new DashboardPopulateWorker();
      worker.stop();

      const job = worker.createPopulateJob({ limit: 0 });
      // limit=0 is stored as 0 in job data
      assert.strictEqual(job.data.limit, 0);
    });

    it('should store undefined limit when not provided', () => {
      const worker = new DashboardPopulateWorker();
      worker.stop();

      const job = worker.createPopulateJob({});
      assert.strictEqual(job.data.limit, undefined);
    });
  });
});

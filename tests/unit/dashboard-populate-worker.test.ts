import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import { DashboardPopulateWorker } from '../../sidequest/workers/dashboard-populate-worker.ts';
import { waitForEvent } from '../utils/test-utilities.ts';

class TestDashboardPopulateWorker extends DashboardPopulateWorker {
  parseTimings(stdout: string) {
    return this._parseTimings(stdout);
  }
}

describe('DashboardPopulateWorker', () => {
  let worker: DashboardPopulateWorker;

  afterEach(() => {
    worker?.stop();
  });

  describe('constructor', () => {
    it('should initialize with default directories', () => {
      worker = new DashboardPopulateWorker();
      const expectedDashboard = path.join(os.homedir(), '.claude', 'mcp-servers', 'observability-toolkit', 'dashboard');
      const expectedToolkit = path.join(os.homedir(), '.claude', 'mcp-servers', 'observability-toolkit');

      assert.strictEqual(worker.dashboardDir, expectedDashboard);
      assert.strictEqual(worker.toolkitDir, expectedToolkit);
    });

    it('should accept custom directories', () => {
      worker = new DashboardPopulateWorker({
        dashboardDir: '/custom/dashboard',
        toolkitDir: '/custom/toolkit',
      });
      assert.strictEqual(worker.dashboardDir, '/custom/dashboard');
      assert.strictEqual(worker.toolkitDir, '/custom/toolkit');
    });

    it('should pass maxConcurrent to SidequestServer', () => {
      worker = new DashboardPopulateWorker({ maxConcurrent: 2 });
      assert.strictEqual(worker.maxConcurrent, 2);
    });

    it('should set jobType to dashboard-populate', () => {
      worker = new DashboardPopulateWorker();
      assert.strictEqual(worker.jobType, 'dashboard-populate');
    });

    it('should inherit from SidequestServer with correct initial stats', () => {
      worker = new DashboardPopulateWorker();
      assert.ok(typeof worker.createJob === 'function');
      assert.ok(typeof worker.getJob === 'function');
      assert.ok(typeof worker.getAllJobs === 'function');
      assert.ok(typeof worker.getStats === 'function');
      assert.ok(typeof worker.runJobHandler === 'function');

      const stats = worker.getStats();
      assert.strictEqual(stats.queued, 0);
      assert.strictEqual(stats.active, 0);
      assert.strictEqual(stats.total, 0);
    });
  });

  describe('createPopulateJob', () => {
    it('should create job with default options (seed=true, rest false)', () => {
      worker = new DashboardPopulateWorker();

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
      worker = new DashboardPopulateWorker();

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
      worker = new DashboardPopulateWorker();

      const job = worker.createPopulateJob({ dryRun: true });

      assert.strictEqual(job.data.seed, true);
      assert.strictEqual(job.data.dryRun, true);
      assert.strictEqual(job.data.skipJudge, false);
      assert.strictEqual(job.data.skipSync, false);
    });

    it('should generate unique job IDs', () => {
      worker = new DashboardPopulateWorker();

      const job1 = worker.createPopulateJob();
      const job2 = worker.createPopulateJob();
      assert.notStrictEqual(job1.id, job2.id);
    });

    it('should generate timestamp-based job IDs', () => {
      worker = new DashboardPopulateWorker();

      const before = Date.now();
      const job = worker.createPopulateJob();
      const after = Date.now();

      const timestamp = parseInt(job.id.replace('dashboard-populate-', ''), 10);
      assert.ok(timestamp >= before);
      assert.ok(timestamp <= after);
    });

    it('should emit job:created event', async () => {
      worker = new DashboardPopulateWorker();

      const eventPromise = waitForEvent(worker, 'job:created');
      worker.createPopulateJob();
      const [job] = await eventPromise;
      assert.strictEqual((job as { data: { type: string } }).data.type, 'populate');
    });

    it('should queue multiple jobs', () => {
      worker = new DashboardPopulateWorker();

      worker.createPopulateJob();
      worker.createPopulateJob({ dryRun: true });
      worker.createPopulateJob({ skipJudge: true });

      const allJobs = worker.getAllJobs();
      assert.strictEqual(allJobs.length, 3);
    });

    describe('limit edge cases', () => {
      it('should preserve limit=0 in job data', () => {
        worker = new DashboardPopulateWorker();

        const job = worker.createPopulateJob({ limit: 0 });
        assert.strictEqual(job.data.limit, 0);
      });

      it('should store undefined limit when not provided', () => {
        worker = new DashboardPopulateWorker();

        const job = worker.createPopulateJob({});
        assert.strictEqual(job.data.limit, undefined);
      });
    });
  });

  describe('_parseTimings', () => {
    let testWorker: TestDashboardPopulateWorker;

    afterEach(() => {
      testWorker?.stop();
    });

    it('should parse valid multi-line timing output', () => {
      testWorker = new TestDashboardPopulateWorker();
      const stdout = [
        '  seed 1200ms',
        '  sync 340ms',
        '  judge 5600ms',
      ].join('\n');

      const timings = testWorker.parseTimings(stdout);

      assert.strictEqual(timings.length, 3);
      assert.deepStrictEqual(timings[0], { name: 'seed', ms: 1200 });
      assert.deepStrictEqual(timings[1], { name: 'sync', ms: 340 });
      assert.deepStrictEqual(timings[2], { name: 'judge', ms: 5600 });
    });

    it('should exclude total line', () => {
      testWorker = new TestDashboardPopulateWorker();
      const stdout = [
        '  seed 1200ms',
        '  total 7140ms',
      ].join('\n');

      const timings = testWorker.parseTimings(stdout);

      assert.strictEqual(timings.length, 1);
      assert.strictEqual(timings[0].name, 'seed');
    });

    it('should ignore non-matching lines (headers, blank lines)', () => {
      testWorker = new TestDashboardPopulateWorker();
      const stdout = [
        'Dashboard Populate Pipeline',
        '',
        '  Step timings:',
        '  seed 1200ms',
        '  --- done ---',
      ].join('\n');

      const timings = testWorker.parseTimings(stdout);

      assert.strictEqual(timings.length, 1);
      assert.deepStrictEqual(timings[0], { name: 'seed', ms: 1200 });
    });

    it('should return empty array for empty string', () => {
      testWorker = new TestDashboardPopulateWorker();
      const timings = testWorker.parseTimings('');
      assert.deepStrictEqual(timings, []);
    });
  });
});

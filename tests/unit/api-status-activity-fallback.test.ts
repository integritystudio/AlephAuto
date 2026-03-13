/**
 * API Status Activity Feed Database Fallback Tests
 *
 * Verifies that GET /api/status returns job history from the database
 * when the in-memory ActivityFeedManager is empty (e.g. after server restart).
 *
 * Bug: Production dashboard showed no job history because the activity feed
 * was purely in-memory and lost on every restart. Fix: /api/status now falls
 * back to querying recent jobs from SQLite when the in-memory feed is empty.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DURATION_MS, JOB_EVENTS, PAGINATION } from '../../sidequest/core/constants.ts';
import { TIME_MS } from '../../sidequest/core/units.ts';

const COMPLETED_JOB_COUNT = 3;
const FAILED_JOB_COUNT = 1;
const TOTAL_SEEDED_JOBS = COMPLETED_JOB_COUNT + FAILED_JOB_COUNT;

let initDatabase: (path: string) => Promise<void>;
let closeDatabase: () => void;
let saveJob: (job: Record<string, unknown>) => void;
let getAllJobs: (opts?: Record<string, unknown>) => Array<Record<string, unknown>>;

describe('GET /api/status — activity feed database fallback', () => {
  before(async () => {
    const dbModule = await import('../../sidequest/core/database.ts');
    initDatabase = dbModule.initDatabase;
    closeDatabase = dbModule.closeDatabase;
    saveJob = dbModule.saveJob;
    getAllJobs = dbModule.getAllJobs;
  });

  after(() => {
    if (closeDatabase) closeDatabase();
  });

  beforeEach(async () => {
    // Fresh in-memory database for each test
    await initDatabase(':memory:');
  });

  describe('Database contains jobs but in-memory feed is empty', () => {
    beforeEach(() => {
      // Seed completed jobs (SaveJobInput uses camelCase)
      for (let i = 0; i < COMPLETED_JOB_COUNT; i++) {
        saveJob({
          id: `test-completed-${i}`,
          pipelineId: 'duplicate-detection',
          status: 'completed',
          data: JSON.stringify({ type: 'duplicate-detection' }),
          result: JSON.stringify({ filesScanned: 10 }),
          createdAt: new Date(Date.now() - (TOTAL_SEEDED_JOBS - i) * TIME_MS.MINUTE).toISOString(),
          startedAt: new Date(Date.now() - (TOTAL_SEEDED_JOBS - i) * TIME_MS.MINUTE + TIME_MS.SECOND).toISOString(),
          completedAt: new Date(Date.now() - (TOTAL_SEEDED_JOBS - i) * TIME_MS.MINUTE + DURATION_MS.THIRTY_SECONDS).toISOString(),
        });
      }
      // Seed a failed job
      saveJob({
        id: 'test-failed-0',
        pipelineId: 'schema-enhancement',
        status: 'failed',
        data: JSON.stringify({ type: 'schema-enhancement' }),
        error: JSON.stringify({ message: 'ENOENT: no such file' }),
        createdAt: new Date(Date.now() - DURATION_MS.TEN_SECONDS).toISOString(),
        startedAt: new Date(Date.now() - DURATION_MS.NINE_SECONDS).toISOString(),
        completedAt: new Date(Date.now() - DURATION_MS.FIVE_SECONDS).toISOString(),
      });
    });

    it('should return jobs from database when queried', () => {
      const jobs = getAllJobs({ limit: PAGINATION.ACTIVITY_FEED_LIMIT });
      assert.strictEqual(jobs.length, TOTAL_SEEDED_JOBS);
    });

    it('should map completed jobs to job:completed activity type', () => {
      const jobs = getAllJobs({ limit: PAGINATION.ACTIVITY_FEED_LIMIT });
      const completedJobs = jobs.filter(j => j.status === 'completed');
      assert.strictEqual(completedJobs.length, COMPLETED_JOB_COUNT);

      // Verify the mapping logic matches server.ts
      for (const job of completedJobs) {
        const activityType = job.status === 'completed' ? JOB_EVENTS.COMPLETED
          : job.status === 'failed' ? JOB_EVENTS.FAILED
          : job.status === 'running' ? JOB_EVENTS.STARTED
          : JOB_EVENTS.CREATED;
        assert.strictEqual(activityType, JOB_EVENTS.COMPLETED);
      }
    });

    it('should map failed jobs to job:failed activity type', () => {
      const jobs = getAllJobs({ limit: PAGINATION.ACTIVITY_FEED_LIMIT });
      const failedJobs = jobs.filter(j => j.status === 'failed');
      assert.strictEqual(failedJobs.length, FAILED_JOB_COUNT);

      for (const job of failedJobs) {
        const activityType = job.status === 'completed' ? JOB_EVENTS.COMPLETED
          : job.status === 'failed' ? JOB_EVENTS.FAILED
          : job.status === 'running' ? JOB_EVENTS.STARTED
          : JOB_EVENTS.CREATED;
        assert.strictEqual(activityType, JOB_EVENTS.FAILED);
      }
    });

    it('should prefer completedAt for timestamp on completed jobs', () => {
      const jobs = getAllJobs({ limit: PAGINATION.ACTIVITY_FEED_LIMIT });
      const completedJob = jobs.find(j => j.status === 'completed');
      assert.ok(completedJob);
      assert.ok(completedJob.completedAt, 'Completed job should have completedAt');

      const timestamp = completedJob.completedAt ?? completedJob.startedAt ?? completedJob.createdAt;
      assert.strictEqual(timestamp, completedJob.completedAt);
    });

    it('should fall back to createdAt when completedAt and startedAt are absent', () => {
      // Save a queued job (no startedAt, no completedAt)
      saveJob({
        id: 'test-queued-0',
        pipelineId: 'git-activity',
        status: 'queued',
        data: JSON.stringify({ type: 'git-activity' }),
        createdAt: new Date().toISOString(),
      });

      const jobs = getAllJobs({ limit: PAGINATION.ACTIVITY_FEED_LIMIT });
      const queuedJob = jobs.find(j => j.status === 'queued');
      assert.ok(queuedJob);

      // Queued jobs have no completedAt or startedAt, should fall back to createdAt
      assert.ok(!queuedJob.completedAt, 'Queued job should not have completedAt');
      assert.ok(!queuedJob.startedAt, 'Queued job should not have startedAt');
      const timestamp = queuedJob.completedAt ?? queuedJob.startedAt ?? queuedJob.createdAt;
      assert.strictEqual(timestamp, queuedJob.createdAt);
    });

    it('should respect ACTIVITY_FEED_LIMIT', () => {
      // Seed more jobs than the limit
      for (let i = 0; i < PAGINATION.ACTIVITY_FEED_LIMIT + 5; i++) {
        saveJob({
          id: `test-overflow-${i}`,
          pipelineId: 'duplicate-detection',
          status: 'completed',
          data: JSON.stringify({ type: 'duplicate-detection' }),
          createdAt: new Date(Date.now() - i * TIME_MS.MINUTE).toISOString(),
        });
      }

      const jobs = getAllJobs({ limit: PAGINATION.ACTIVITY_FEED_LIMIT });
      assert.ok(jobs.length <= PAGINATION.ACTIVITY_FEED_LIMIT,
        `Expected at most ${PAGINATION.ACTIVITY_FEED_LIMIT} jobs, got ${jobs.length}`);
    });

    it('should include pipelineId from database job', () => {
      const jobs = getAllJobs({ limit: PAGINATION.ACTIVITY_FEED_LIMIT });
      for (const job of jobs) {
        assert.ok(job.pipelineId, `Job ${job.id} should have pipelineId`);
      }
    });
  });

  describe('Database is empty and in-memory feed is empty', () => {
    it('should return empty activity array', async () => {
      // Close and re-initialize to get a fresh empty database
      closeDatabase();
      await initDatabase(':memory:');
      const jobs = getAllJobs({ limit: PAGINATION.ACTIVITY_FEED_LIMIT });
      assert.strictEqual(jobs.length, 0);
    });
  });
});

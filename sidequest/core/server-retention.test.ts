import test from 'node:test';
import assert from 'node:assert/strict';
import type { Job } from './server.ts';
import { SidequestServer } from './server.ts';
import { config } from './config.ts';
import { GIT_ACTIVITY, JOB_RETENTION, TIME_MS } from './constants.ts';
import { jobRepository } from './job-repository.ts';
import { JOB_STATUS } from '#api/types/job-status.ts';

function makeJob(
  id: string,
  status: Job['status'],
  createdAt: Date,
  completedAt: Date | null
): Job {
  return {
    id,
    status,
    data: {},
    createdAt,
    startedAt: createdAt,
    completedAt,
    error: null,
    result: null,
    retryCount: 0,
    git: {
      branchName: null,
      originalBranch: null,
      commitSha: null,
      prUrl: null,
      changedFiles: []
    }
  };
}

function stubRepositoryInit(t: test.TestContext): void {
  const originalInitialize = jobRepository.initialize.bind(jobRepository);
  (jobRepository as unknown as { initialize: () => Promise<void> }).initialize = async () => {};

  t.after(() => {
    (jobRepository as unknown as { initialize: () => Promise<void> }).initialize = originalInitialize;
  });
}

test('SidequestServer resolves retention days by job type with 30-day default', (t) => {
  stubRepositoryInit(t);

  const cfg = config as unknown as {
    defaultJobRetentionDays: number;
    jobRetentionDaysByType: Record<string, number>;
  };

  const originalDefault = cfg.defaultJobRetentionDays;
  const originalByType = cfg.jobRetentionDaysByType;
  cfg.defaultJobRetentionDays = GIT_ACTIVITY.MONTHLY_WINDOW_DAYS;
  cfg.jobRetentionDaysByType = { 'retention-configured': GIT_ACTIVITY.WEEKLY_WINDOW_DAYS };

  t.after(() => {
    cfg.defaultJobRetentionDays = originalDefault;
    cfg.jobRetentionDaysByType = originalByType;
  });

  const configuredServer = new SidequestServer({ autoStart: false, jobType: 'retention-configured' });
  const fallbackServer = new SidequestServer({ autoStart: false, jobType: 'retention-fallback' });

  configuredServer.stop();
  fallbackServer.stop();

  assert.equal(configuredServer.jobRetentionDays, GIT_ACTIVITY.WEEKLY_WINDOW_DAYS);
  assert.equal(fallbackServer.jobRetentionDays, GIT_ACTIVITY.MONTHLY_WINDOW_DAYS);
});

test('prune removes expired terminal jobs from jobs map and history', (t) => {
  stubRepositoryInit(t);

  const server = new SidequestServer({
    autoStart: false,
    jobType: 'retention-prune',
    jobRetentionDays: JOB_RETENTION.MIN_DAYS
  });
  server.stop();

  const nowMs = Date.UTC(2026, 2, 4, 12, 0, 0);
  const oldDate = new Date(nowMs - (2 * TIME_MS.DAY));
  const freshDate = new Date(nowMs - (12 * TIME_MS.HOUR));

  const oldCompleted = makeJob('old-completed', JOB_STATUS.COMPLETED, oldDate, oldDate);
  const oldCancelled = makeJob('old-cancelled', JOB_STATUS.CANCELLED, oldDate, oldDate);
  const freshCompleted = makeJob('fresh-completed', JOB_STATUS.COMPLETED, freshDate, freshDate);
  const oldRunning = makeJob('old-running', JOB_STATUS.RUNNING, oldDate, null);

  server.jobs.set(oldCompleted.id, oldCompleted);
  server.jobs.set(oldCancelled.id, oldCancelled);
  server.jobs.set(freshCompleted.id, freshCompleted);
  server.jobs.set(oldRunning.id, oldRunning);

  server.jobHistory.push({ ...oldCompleted }, { ...oldCancelled }, { ...freshCompleted }, { ...oldRunning });

  (server as unknown as { _pruneExpiredJobs: (referenceTimeMs?: number) => void })._pruneExpiredJobs(nowMs);

  assert.equal(server.jobs.has('old-completed'), false);
  assert.equal(server.jobs.has('old-cancelled'), false);
  assert.equal(server.jobs.has('fresh-completed'), true);
  assert.equal(server.jobs.has('old-running'), true);

  const remainingHistoryIds = server.jobHistory.map(job => job.id).sort();
  assert.deepEqual(remainingHistoryIds, ['fresh-completed', 'old-running']);
});

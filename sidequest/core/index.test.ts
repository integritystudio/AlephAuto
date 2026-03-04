import test from 'node:test';
import assert from 'node:assert/strict';
import { isWorkerIdle } from './index.ts';
import type { JobStats } from './server.ts';

test('isWorkerIdle returns false when retry is pending', () => {
  const stats: JobStats = {
    total: 1,
    queued: 0,
    active: 0,
    pendingRetries: 1,
    completed: 0,
    failed: 0
  };

  assert.equal(isWorkerIdle(stats), false);
});

test('isWorkerIdle returns true only when active, queued, and pendingRetries are zero', () => {
  const stats: JobStats = {
    total: 2,
    queued: 0,
    active: 0,
    pendingRetries: 0,
    completed: 1,
    failed: 1
  };

  assert.equal(isWorkerIdle(stats), true);
});

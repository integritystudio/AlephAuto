import test from 'node:test';
import assert from 'node:assert/strict';
import { DuplicateDetectionWorker } from './duplicate-detection-worker.ts';

interface MinimalRepoConfig {
  name: string;
  path: string;
}

interface PipelineStatusPayload {
  status: string;
  groupScans?: number;
  individualScans?: number;
}

function waitForEvent<T>(emitter: NodeJS.EventEmitter, eventName: string): Promise<T> {
  return new Promise((resolve) => {
    emitter.once(eventName, (payload: T) => resolve(payload));
  });
}

test('retry authority stays in SidequestServer (no worker-created retry jobs)', async (t) => {
  const worker = new DuplicateDetectionWorker({ maxConcurrentScans: 1 });
  t.after(() => worker.stop());

  const originalSetTimeout = global.setTimeout;
  (global as unknown as { setTimeout: typeof setTimeout }).setTimeout =
    (((handler: (...args: unknown[]) => void, _delay?: number, ...args: unknown[]) => {
      handler(...args);
      return 0 as unknown as NodeJS.Timeout;
    }) as unknown as typeof setTimeout);
  t.after(() => {
    (global as unknown as { setTimeout: typeof setTimeout }).setTimeout = originalSetTimeout;
  });

  let attempts = 0;
  (worker as unknown as { _runIntraProjectScan: (job: unknown, repo: unknown) => Promise<unknown> })._runIntraProjectScan =
    async () => {
      attempts++;
      if (attempts === 1) {
        throw new Error('timeout while scanning');
      }
      return {
        scanType: 'intra-project',
        repository: 'repo-a',
        duplicates: 0,
        suggestions: 0,
        duration: 0,
        reportPaths: {},
        prResults: null
      };
    };

  const createdJobIds: string[] = [];
  worker.on('job:created', (job) => createdJobIds.push(job.id));

  const completed = waitForEvent(worker, 'job:completed');
  const jobId = `scan-intra-project-${Date.now()}`;
  worker.createJob(jobId, {
    type: 'duplicate-detection',
    scanType: 'intra-project',
    repositories: [{ name: 'repo-a', path: '/tmp/repo-a' } satisfies MinimalRepoConfig],
    groupName: null
  });
  await completed;

  assert.equal(attempts, 2, 'job should retry exactly once and then succeed');
  assert.equal(createdJobIds.length, 1, 'no extra jobs should be created for retries');
  assert.equal(createdJobIds[0], jobId);
  assert.deepEqual(
    Array.from(worker.jobs.keys()).filter(id => id.includes('-retry')),
    [],
    'worker should not create retry-suffixed jobs'
  );

  const job = worker.getJob(jobId);
  assert.equal(job?.retryCount, 1, 'base queue retry count should increment');
});

test('_updateRepositoryConfigs performs one atomic record call per non-test repository', async () => {
  const worker = new DuplicateDetectionWorker();
  worker.stop();

  const calls: Array<{ repoName: string; entry: Record<string, unknown> }> = [];
  (worker as unknown as { configLoader: { recordScanResult: (repoName: string, entry: Record<string, unknown>) => Promise<void> } }).configLoader = {
    async recordScanResult(repoName: string, entry: Record<string, unknown>): Promise<void> {
      calls.push({ repoName, entry });
    }
  };

  await worker._updateRepositoryConfigs(
    [
      { name: 'repo-a', path: '/tmp/repo-a' } as unknown as never,
      { name: 'alephauto-test-sandbox', path: '/tmp/test-repo' } as unknown as never
    ],
    {
      scan_type: 'intra-project',
      metrics: {
        total_duplicate_groups: 3,
        total_suggestions: 1
      },
      scan_metadata: {
        duration_seconds: 2.5
      }
    } as unknown as never
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].repoName, 'repo-a');
  assert.deepEqual(calls[0].entry, {
    status: 'success',
    duration: 2.5,
    duplicatesFound: 3
  });
});

test('runNightlyScan reports only actually scheduled group scans', async () => {
  const worker = new DuplicateDetectionWorker();
  worker.stop();

  const repoA = { name: 'repo-a', path: '/tmp/repo-a' } as unknown as never;
  const repoB = { name: 'repo-b', path: '/tmp/repo-b' } as unknown as never;
  const repoC = { name: 'repo-c', path: '/tmp/repo-c' } as unknown as never;

  (worker as unknown as {
    configLoader: {
      getScanConfig: () => { enabled: boolean };
      getRepositoriesToScanTonight: () => unknown[];
      getEnabledGroups: () => Array<{ name: string }>;
      getGroupRepositories: (name: string) => unknown[];
    }
  }).configLoader = {
    getScanConfig: () => ({ enabled: true }),
    getRepositoriesToScanTonight: () => [repoA],
    getEnabledGroups: () => [{ name: 'g-valid' }, { name: 'g-too-small' }, { name: 'g-empty' }],
    getGroupRepositories: (name: string) => {
      if (name === 'g-valid') return [repoA, repoB, repoC];
      if (name === 'g-too-small') return [repoA];
      return [];
    }
  };

  const scheduled: Array<{ scanType: string; groupName: string | null }> = [];
  (worker as unknown as {
    scheduleScan: (scanType: string, repositories: unknown[], groupName?: string | null) => { id: string };
  }).scheduleScan = (scanType: string, repositories: unknown[], groupName: string | null = null) => {
    assert.ok(repositories.length > 0);
    scheduled.push({ scanType, groupName });
    return { id: `job-${scheduled.length}` };
  };

  let scheduledStatus: PipelineStatusPayload | null = null;
  worker.on('pipeline:status', (payload: PipelineStatusPayload) => {
    if (payload.status === 'scheduled') {
      scheduledStatus = payload;
    }
  });

  await worker.runNightlyScan();

  if (!scheduledStatus) {
    assert.fail('scheduled status payload should be emitted');
  }
  const emittedStatus: PipelineStatusPayload = scheduledStatus;
  assert.equal(scheduled.filter(s => s.scanType === 'intra-project').length, 1);
  assert.equal(scheduled.filter(s => s.scanType === 'inter-project').length, 1);
  assert.equal(emittedStatus.groupScans, 1);
  assert.equal(emittedStatus.individualScans, 1);
});

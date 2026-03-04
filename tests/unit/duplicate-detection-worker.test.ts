/**
 * Duplicate Detection Worker Unit Tests
 *
 * Tests for the duplicate detection worker that handles scanning jobs.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { DuplicateDetectionWorker } from '../../sidequest/workers/duplicate-detection-worker.ts';

function createRetryingJob(jobId: string, retryCount: number, retryPending: boolean): Record<string, unknown> {
  const now = new Date();
  return {
    id: jobId,
    status: 'queued',
    data: { type: 'duplicate-detection' },
    createdAt: now,
    startedAt: now,
    completedAt: null,
    error: null,
    result: null,
    retryCount,
    retryPending,
    git: {
      branchName: null,
      originalBranch: null,
      commitSha: null,
      prUrl: null,
      changedFiles: []
    }
  };
}

describe('DuplicateDetectionWorker', () => {
  describe('Constructor', () => {
    it('should initialize with default options', () => {
      const worker = new DuplicateDetectionWorker();

      assert.strictEqual(worker.jobType, 'duplicate-detection');
      assert.ok(worker.configLoader);
      assert.ok(worker.interProjectScanner);
      assert.ok(worker.orchestrator);
      assert.ok(worker.reportCoordinator);
      assert.ok(worker.prCreator);
    });

    it('should initialize scan metrics', () => {
      const worker = new DuplicateDetectionWorker();

      assert.strictEqual(worker.scanMetrics.totalScans, 0);
      assert.strictEqual(worker.scanMetrics.successfulScans, 0);
      assert.strictEqual(worker.scanMetrics.failedScans, 0);
      assert.strictEqual(worker.scanMetrics.totalDuplicatesFound, 0);
      assert.strictEqual(worker.scanMetrics.totalSuggestionsGenerated, 0);
      assert.strictEqual(worker.scanMetrics.highImpactDuplicates, 0);
      assert.strictEqual(worker.scanMetrics.prsCreated, 0);
      assert.strictEqual(worker.scanMetrics.prCreationErrors, 0);
    });

    it('should accept custom maxConcurrentScans', () => {
      const worker = new DuplicateDetectionWorker({
        maxConcurrentScans: 5
      });

      assert.strictEqual(worker.maxConcurrent, 5);
    });

    it('should accept custom configPath', () => {
      const worker = new DuplicateDetectionWorker({
        configPath: '/custom/config.json'
      });

      assert.ok(worker.configLoader);
    });

    it('should accept custom baseBranch for PR creator', () => {
      const worker = new DuplicateDetectionWorker({
        baseBranch: 'develop'
      });

      assert.ok(worker.prCreator);
    });

    it('should accept custom branchPrefix for PR creator', () => {
      const worker = new DuplicateDetectionWorker({
        branchPrefix: 'refactor'
      });

      assert.ok(worker.prCreator);
    });

    it('should accept dryRun option', () => {
      const worker = new DuplicateDetectionWorker({
        dryRun: true
      });

      assert.ok(worker.prCreator);
    });

    it('should accept maxSuggestionsPerPR option', () => {
      const worker = new DuplicateDetectionWorker({
        maxSuggestionsPerPR: 10
      });

      assert.ok(worker.prCreator);
    });

    it('should accept enablePRCreation option', () => {
      const worker = new DuplicateDetectionWorker({
        enablePRCreation: true
      });

      assert.strictEqual(worker.enablePRCreation, true);
    });

    it('should initialize with no retry metrics', () => {
      const worker = new DuplicateDetectionWorker();
      const metrics = worker.getRetryMetrics();

      assert.strictEqual(metrics.activeRetries, 0);
      assert.strictEqual(metrics.totalRetryAttempts, 0);
      assert.deepStrictEqual(metrics.jobsBeingRetried, []);
    });
  });

  describe('_updateMetrics', () => {
    it('should update aggregate metrics for intra-project scan', () => {
      const worker = new DuplicateDetectionWorker();
      const scanResult = {
        scan_type: 'intra-project',
        metrics: {
          total_duplicate_groups: 5,
          total_suggestions: 3
        },
        duplicate_groups: [
          { impact_score: 80 },
          { impact_score: 50 },
          { impact_score: 90 }
        ]
      };

      worker._updateMetrics(scanResult as never);

      assert.strictEqual(worker.scanMetrics.totalScans, 0);
      assert.strictEqual(worker.scanMetrics.totalDuplicatesFound, 5);
      assert.strictEqual(worker.scanMetrics.totalSuggestionsGenerated, 3);
      assert.strictEqual(worker.scanMetrics.highImpactDuplicates, 2);
    });

    it('should update aggregate metrics for inter-project scan', () => {
      const worker = new DuplicateDetectionWorker();
      const scanResult = {
        scan_type: 'inter-project',
        metrics: {
          total_cross_repository_groups: 10,
          total_suggestions: 7
        },
        cross_repository_duplicates: [
          { impact_score: 75 },
          { impact_score: 60 },
          { impact_score: 95 }
        ]
      };

      worker._updateMetrics(scanResult as never);

      assert.strictEqual(worker.scanMetrics.totalScans, 0);
      assert.strictEqual(worker.scanMetrics.totalDuplicatesFound, 10);
      assert.strictEqual(worker.scanMetrics.totalSuggestionsGenerated, 7);
      assert.strictEqual(worker.scanMetrics.highImpactDuplicates, 2);
    });

    it('should handle missing duplicate arrays', () => {
      const worker = new DuplicateDetectionWorker();

      worker._updateMetrics({
        scan_type: 'intra-project',
        metrics: {
          total_duplicate_groups: 0,
          total_suggestions: 0
        }
      } as never);

      worker._updateMetrics({
        scan_type: 'inter-project',
        metrics: {
          total_cross_repository_groups: 0,
          total_suggestions: 0
        }
      } as never);

      assert.strictEqual(worker.scanMetrics.highImpactDuplicates, 0);
    });

    it('should accumulate metrics across multiple scans', () => {
      const worker = new DuplicateDetectionWorker();

      worker._updateMetrics({
        scan_type: 'intra-project',
        metrics: {
          total_duplicate_groups: 5,
          total_suggestions: 3
        },
        duplicate_groups: [{ impact_score: 80 }]
      } as never);

      worker._updateMetrics({
        scan_type: 'intra-project',
        metrics: {
          total_duplicate_groups: 3,
          total_suggestions: 2
        },
        duplicate_groups: [{ impact_score: 90 }]
      } as never);

      assert.strictEqual(worker.scanMetrics.totalScans, 0);
      assert.strictEqual(worker.scanMetrics.totalDuplicatesFound, 8);
      assert.strictEqual(worker.scanMetrics.totalSuggestionsGenerated, 5);
      assert.strictEqual(worker.scanMetrics.highImpactDuplicates, 2);
    });
  });

  describe('getRetryMetrics', () => {
    it('should return empty metrics when no retries', () => {
      const worker = new DuplicateDetectionWorker();

      const metrics = worker.getRetryMetrics();

      assert.strictEqual(metrics.activeRetries, 0);
      assert.strictEqual(metrics.totalRetryAttempts, 0);
      assert.deepStrictEqual(metrics.jobsBeingRetried, []);
      assert.strictEqual(metrics.retryDistribution.attempt1, 0);
      assert.strictEqual(metrics.retryDistribution.attempt2, 0);
      assert.strictEqual(metrics.retryDistribution.attempt3Plus, 0);
      assert.strictEqual(metrics.retryDistribution.nearingLimit, 0);
    });

    it('should track active retries from SidequestServer job state', () => {
      const worker = new DuplicateDetectionWorker();

      worker.jobs.set('job-1', createRetryingJob('job-1', 1, true) as never);
      worker.jobs.set('job-2', createRetryingJob('job-2', 2, false) as never);

      const metrics = worker.getRetryMetrics();

      assert.strictEqual(metrics.activeRetries, 1);
      assert.strictEqual(metrics.totalRetryAttempts, 3);
      assert.strictEqual(metrics.jobsBeingRetried.length, 1);
      assert.strictEqual(metrics.jobsBeingRetried[0].jobId, 'job-1');
    });

    it('should track retry distribution', () => {
      const worker = new DuplicateDetectionWorker();

      worker.jobs.set('job-1', createRetryingJob('job-1', 1, true) as never);
      worker.jobs.set('job-2', createRetryingJob('job-2', 2, true) as never);
      worker.jobs.set('job-3', createRetryingJob('job-3', 3, true) as never);
      worker.jobs.set('job-4', createRetryingJob('job-4', 4, false) as never);

      const metrics = worker.getRetryMetrics();

      assert.strictEqual(metrics.retryDistribution.attempt1, 1);
      assert.strictEqual(metrics.retryDistribution.attempt2, 1);
      assert.strictEqual(metrics.retryDistribution.attempt3Plus, 2);
      assert.strictEqual(metrics.retryDistribution.nearingLimit, 2);
    });
  });

  describe('getScanMetrics', () => {
    it('should return combined scan and queue metrics', () => {
      const worker = new DuplicateDetectionWorker();

      worker.scanMetrics.totalScans = 10;
      worker.scanMetrics.successfulScans = 8;
      worker.scanMetrics.failedScans = 2;

      const metrics = worker.getScanMetrics();

      assert.strictEqual(metrics.totalScans, 10);
      assert.strictEqual(metrics.successfulScans, 8);
      assert.strictEqual(metrics.failedScans, 2);
      assert.ok(metrics.queueStats);
      assert.ok(metrics.retryMetrics);
    });
  });

  describe('scheduleScan', () => {
    it('should create a job with correct scanType', () => {
      const worker = new DuplicateDetectionWorker();
      let createdJobId: string | null = null;
      let createdJobData: Record<string, unknown> | null = null;

      worker.createJob = ((jobId: string, jobData: Record<string, unknown>) => {
        createdJobId = jobId;
        createdJobData = jobData;
        return { id: jobId, data: jobData } as never;
      }) as never;

      worker.scheduleScan('intra-project', [{ path: '/repo', name: 'test' } as never]);

      assert.ok(createdJobId?.startsWith('scan-intra-project-'));
      assert.strictEqual(createdJobData?.scanType, 'intra-project');
      assert.strictEqual(createdJobData?.type, 'duplicate-detection');
    });

    it('should include repositories and optional groupName', () => {
      const worker = new DuplicateDetectionWorker();
      let createdJobData: Record<string, unknown> | null = null;
      const repos = [
        { path: '/repo1', name: 'repo1' },
        { path: '/repo2', name: 'repo2' }
      ];

      worker.createJob = ((_: string, jobData: Record<string, unknown>) => {
        createdJobData = jobData;
        return { id: 'job' } as never;
      }) as never;

      worker.scheduleScan('inter-project', repos as never, 'core-repos');

      assert.deepStrictEqual(createdJobData?.repositories, repos);
      assert.strictEqual(createdJobData?.groupName, 'core-repos');
    });
  });
});

describe('DuplicateDetectionWorker - Event Emission', () => {
  it('should emit metrics:updated after successful runJobHandler', async () => {
    const worker = new DuplicateDetectionWorker();
    let emittedData: Record<string, unknown> | null = null;
    const repositoryPath = path.join(process.cwd(), 'repo-a');

    worker.once('metrics:updated', (data) => {
      emittedData = data;
    });

    worker._runIntraProjectScan = (async () => ({
      scanType: 'intra-project',
      repository: 'repo-a',
      duplicates: 0,
      suggestions: 0,
      duration: 0,
      reportPaths: {},
      prResults: null
    })) as never;

    await worker.runJobHandler({
      id: 'job-1',
      data: {
        scanType: 'intra-project',
        repositories: [{ name: 'repo-a', path: repositoryPath }],
        groupName: null
      }
    } as never);

    assert.ok(emittedData);
    assert.strictEqual(emittedData?.totalScans, 1);
    assert.strictEqual(emittedData?.successfulScans, 1);
  });
});

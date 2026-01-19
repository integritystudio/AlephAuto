/**
 * Duplicate Detection Worker Unit Tests
 *
 * Tests for the duplicate detection worker that handles scanning jobs.
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { DuplicateDetectionWorker } from '../../sidequest/workers/duplicate-detection-worker.js';

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

    it('should initialize empty retry queue', () => {
      const worker = new DuplicateDetectionWorker();

      assert.ok(worker.retryQueue instanceof Map);
      assert.strictEqual(worker.retryQueue.size, 0);
    });
  });

  describe('_getOriginalJobId', () => {
    it('should return job ID without retry suffix', () => {
      const worker = new DuplicateDetectionWorker();

      const result = worker._getOriginalJobId('scan-intra-project-123-retry1');

      assert.strictEqual(result, 'scan-intra-project-123');
    });

    it('should strip multiple retry suffixes', () => {
      const worker = new DuplicateDetectionWorker();

      const result = worker._getOriginalJobId('scan-intra-project-123-retry1-retry2-retry3');

      assert.strictEqual(result, 'scan-intra-project-123');
    });

    it('should return original ID when no retry suffix', () => {
      const worker = new DuplicateDetectionWorker();

      const result = worker._getOriginalJobId('scan-intra-project-123');

      assert.strictEqual(result, 'scan-intra-project-123');
    });

    it('should handle retry suffix with double digits', () => {
      const worker = new DuplicateDetectionWorker();

      const result = worker._getOriginalJobId('scan-inter-project-456-retry10');

      assert.strictEqual(result, 'scan-inter-project-456');
    });

    it('should handle various job ID formats', () => {
      const worker = new DuplicateDetectionWorker();

      assert.strictEqual(
        worker._getOriginalJobId('job-123'),
        'job-123'
      );

      assert.strictEqual(
        worker._getOriginalJobId('job-123-retry5'),
        'job-123'
      );

      assert.strictEqual(
        worker._getOriginalJobId('complex-job-id-with-many-parts-retry2'),
        'complex-job-id-with-many-parts'
      );
    });
  });

  describe('_updateMetrics', () => {
    it('should update metrics for intra-project scan', () => {
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

      worker._updateMetrics(scanResult);

      assert.strictEqual(worker.scanMetrics.totalScans, 1);
      assert.strictEqual(worker.scanMetrics.totalDuplicatesFound, 5);
      assert.strictEqual(worker.scanMetrics.totalSuggestionsGenerated, 3);
      assert.strictEqual(worker.scanMetrics.highImpactDuplicates, 2); // 80 and 90 >= 75
    });

    it('should update metrics for inter-project scan', () => {
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

      worker._updateMetrics(scanResult);

      assert.strictEqual(worker.scanMetrics.totalScans, 1);
      assert.strictEqual(worker.scanMetrics.totalDuplicatesFound, 10);
      assert.strictEqual(worker.scanMetrics.totalSuggestionsGenerated, 7);
      assert.strictEqual(worker.scanMetrics.highImpactDuplicates, 2); // 75 and 95 >= 75
    });

    it('should handle missing duplicate_groups', () => {
      const worker = new DuplicateDetectionWorker();
      const scanResult = {
        scan_type: 'intra-project',
        metrics: {
          total_duplicate_groups: 0,
          total_suggestions: 0
        }
        // No duplicate_groups array
      };

      worker._updateMetrics(scanResult);

      assert.strictEqual(worker.scanMetrics.totalScans, 1);
      assert.strictEqual(worker.scanMetrics.highImpactDuplicates, 0);
    });

    it('should handle missing cross_repository_duplicates', () => {
      const worker = new DuplicateDetectionWorker();
      const scanResult = {
        scan_type: 'inter-project',
        metrics: {
          total_cross_repository_groups: 0,
          total_suggestions: 0
        }
        // No cross_repository_duplicates array
      };

      worker._updateMetrics(scanResult);

      assert.strictEqual(worker.scanMetrics.totalScans, 1);
      assert.strictEqual(worker.scanMetrics.highImpactDuplicates, 0);
    });

    it('should accumulate metrics across multiple scans', () => {
      const worker = new DuplicateDetectionWorker();

      // First scan
      worker._updateMetrics({
        scan_type: 'intra-project',
        metrics: {
          total_duplicate_groups: 5,
          total_suggestions: 3
        },
        duplicate_groups: [{ impact_score: 80 }]
      });

      // Second scan
      worker._updateMetrics({
        scan_type: 'intra-project',
        metrics: {
          total_duplicate_groups: 3,
          total_suggestions: 2
        },
        duplicate_groups: [{ impact_score: 90 }]
      });

      assert.strictEqual(worker.scanMetrics.totalScans, 2);
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

    it('should track active retries', () => {
      const worker = new DuplicateDetectionWorker();

      // Add retry entries
      worker.retryQueue.set('job-1', {
        attempts: 1,
        lastAttempt: Date.now(),
        maxAttempts: 3,
        delay: 60000
      });

      worker.retryQueue.set('job-2', {
        attempts: 2,
        lastAttempt: Date.now(),
        maxAttempts: 3,
        delay: 60000
      });

      const metrics = worker.getRetryMetrics();

      assert.strictEqual(metrics.activeRetries, 2);
      assert.strictEqual(metrics.totalRetryAttempts, 3);
      assert.strictEqual(metrics.jobsBeingRetried.length, 2);
    });

    it('should track retry distribution', () => {
      const worker = new DuplicateDetectionWorker();

      // Add retry entries with different attempt counts
      worker.retryQueue.set('job-1', {
        attempts: 1,
        lastAttempt: Date.now(),
        maxAttempts: 5,
        delay: 60000
      });

      worker.retryQueue.set('job-2', {
        attempts: 2,
        lastAttempt: Date.now(),
        maxAttempts: 5,
        delay: 60000
      });

      worker.retryQueue.set('job-3', {
        attempts: 3,
        lastAttempt: Date.now(),
        maxAttempts: 5,
        delay: 60000
      });

      worker.retryQueue.set('job-4', {
        attempts: 4,
        lastAttempt: Date.now(),
        maxAttempts: 5,
        delay: 60000
      });

      const metrics = worker.getRetryMetrics();

      assert.strictEqual(metrics.retryDistribution.attempt1, 1);
      assert.strictEqual(metrics.retryDistribution.attempt2, 1);
      assert.strictEqual(metrics.retryDistribution.attempt3Plus, 2);
      assert.strictEqual(metrics.retryDistribution.nearingLimit, 2); // 3 and 4 attempts
    });

    it('should include job details in jobsBeingRetried', () => {
      const worker = new DuplicateDetectionWorker();
      const timestamp = Date.now();

      worker.retryQueue.set('job-123', {
        attempts: 2,
        lastAttempt: timestamp,
        maxAttempts: 3,
        delay: 60000
      });

      const metrics = worker.getRetryMetrics();

      assert.strictEqual(metrics.jobsBeingRetried.length, 1);
      assert.strictEqual(metrics.jobsBeingRetried[0].jobId, 'job-123');
      assert.strictEqual(metrics.jobsBeingRetried[0].attempts, 2);
      assert.strictEqual(metrics.jobsBeingRetried[0].maxAttempts, 3);
      assert.ok(metrics.jobsBeingRetried[0].lastAttempt);
    });
  });

  describe('getScanMetrics', () => {
    it('should return combined scan and queue metrics', () => {
      const worker = new DuplicateDetectionWorker();

      // Update some scan metrics
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

    it('should include all scan metric fields', () => {
      const worker = new DuplicateDetectionWorker();

      const metrics = worker.getScanMetrics();

      assert.ok('totalScans' in metrics);
      assert.ok('successfulScans' in metrics);
      assert.ok('failedScans' in metrics);
      assert.ok('totalDuplicatesFound' in metrics);
      assert.ok('totalSuggestionsGenerated' in metrics);
      assert.ok('highImpactDuplicates' in metrics);
      assert.ok('prsCreated' in metrics);
      assert.ok('prCreationErrors' in metrics);
    });
  });

  describe('scheduleScan', () => {
    it('should create a job with correct scanType', () => {
      const worker = new DuplicateDetectionWorker();
      let createdJobId = null;
      let createdJobData = null;

      // Mock createJob
      worker.createJob = (jobId, jobData) => {
        createdJobId = jobId;
        createdJobData = jobData;
        return { id: jobId, data: jobData };
      };

      worker.scheduleScan('intra-project', [{ path: '/repo', name: 'test' }]);

      assert.ok(createdJobId.startsWith('scan-intra-project-'));
      assert.strictEqual(createdJobData.scanType, 'intra-project');
      assert.strictEqual(createdJobData.type, 'duplicate-detection');
    });

    it('should pass repositories to job data', () => {
      const worker = new DuplicateDetectionWorker();
      let createdJobData = null;

      worker.createJob = (jobId, jobData) => {
        createdJobData = jobData;
        return { id: jobId, data: jobData };
      };

      const repos = [
        { path: '/repo1', name: 'repo1' },
        { path: '/repo2', name: 'repo2' }
      ];

      worker.scheduleScan('inter-project', repos);

      assert.deepStrictEqual(createdJobData.repositories, repos);
    });

    it('should include groupName when provided', () => {
      const worker = new DuplicateDetectionWorker();
      let createdJobData = null;

      worker.createJob = (jobId, jobData) => {
        createdJobData = jobData;
        return { id: jobId, data: jobData };
      };

      worker.scheduleScan('inter-project', [{ path: '/repo' }], 'core-repos');

      assert.strictEqual(createdJobData.groupName, 'core-repos');
    });

    it('should use null for groupName when not provided', () => {
      const worker = new DuplicateDetectionWorker();
      let createdJobData = null;

      worker.createJob = (jobId, jobData) => {
        createdJobData = jobData;
        return { id: jobId, data: jobData };
      };

      worker.scheduleScan('intra-project', [{ path: '/repo' }]);

      assert.strictEqual(createdJobData.groupName, null);
    });

    it('should generate unique job IDs', async () => {
      const worker = new DuplicateDetectionWorker();
      const jobIds = [];

      worker.createJob = (jobId) => {
        jobIds.push(jobId);
        return { id: jobId };
      };

      worker.scheduleScan('intra-project', [{ path: '/repo1' }]);
      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 2));
      worker.scheduleScan('intra-project', [{ path: '/repo2' }]);

      // Job IDs should be different (different timestamps)
      assert.notStrictEqual(jobIds[0], jobIds[1]);
    });
  });
});

describe('DuplicateDetectionWorker - Edge Cases', () => {
  describe('Metrics with edge values', () => {
    it('should handle impact_score exactly at threshold', () => {
      const worker = new DuplicateDetectionWorker();
      const scanResult = {
        scan_type: 'intra-project',
        metrics: {
          total_duplicate_groups: 3,
          total_suggestions: 1
        },
        duplicate_groups: [
          { impact_score: 75 }, // Exactly at threshold
          { impact_score: 74 }, // Just below
          { impact_score: 76 }  // Just above
        ]
      };

      worker._updateMetrics(scanResult);

      // 75 and 76 should be counted as high impact
      assert.strictEqual(worker.scanMetrics.highImpactDuplicates, 2);
    });

    it('should handle empty duplicate groups array', () => {
      const worker = new DuplicateDetectionWorker();
      const scanResult = {
        scan_type: 'intra-project',
        metrics: {
          total_duplicate_groups: 0,
          total_suggestions: 0
        },
        duplicate_groups: []
      };

      worker._updateMetrics(scanResult);

      assert.strictEqual(worker.scanMetrics.highImpactDuplicates, 0);
    });
  });

  describe('Retry queue edge cases', () => {
    it('should handle job IDs with numbers that look like retry counts', () => {
      const worker = new DuplicateDetectionWorker();

      // Job ID that contains numbers but isn't a retry
      const result = worker._getOriginalJobId('scan-123-456-789');

      assert.strictEqual(result, 'scan-123-456-789');
    });

    it('should handle empty job ID', () => {
      const worker = new DuplicateDetectionWorker();

      const result = worker._getOriginalJobId('');

      assert.strictEqual(result, '');
    });
  });
});

describe('DuplicateDetectionWorker - Event Emission', () => {
  it('should emit metrics:updated on _updateMetrics', () => {
    const worker = new DuplicateDetectionWorker();
    let emittedEvent = null;
    let emittedData = null;

    worker.on('metrics:updated', (data) => {
      emittedEvent = 'metrics:updated';
      emittedData = data;
    });

    worker._updateMetrics({
      scan_type: 'intra-project',
      metrics: {
        total_duplicate_groups: 1,
        total_suggestions: 1
      },
      duplicate_groups: []
    });

    assert.strictEqual(emittedEvent, 'metrics:updated');
    assert.ok(emittedData);
    assert.strictEqual(emittedData.totalScans, 1);
  });
});

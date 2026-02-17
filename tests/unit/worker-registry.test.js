/**
 * Worker Registry Unit Tests
 *
 * Tests for the WorkerRegistry class focusing on:
 * - Configuration and constants validation
 * - Pipeline support checking
 * - Stats aggregation
 *
 * Note: Full integration tests with actual workers are in integration tests.
 * These unit tests focus on the registry logic without initializing real workers.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

// Import constants first (no side effects)
import { CONCURRENCY } from '../../sidequest/core/constants.ts';

describe('Worker Registry - Constants', () => {

  describe('CONCURRENCY.MAX_WORKER_INITS', () => {
    it('should be set to 3 for concurrency limiting', () => {
      assert.strictEqual(CONCURRENCY.MAX_WORKER_INITS, 3);
    });

    it('should be greater than 0', () => {
      assert.ok(CONCURRENCY.MAX_WORKER_INITS > 0);
    });
  });

  describe('CONCURRENCY.DEFAULT_MAX_JOBS', () => {
    it('should be set to 5', () => {
      assert.strictEqual(CONCURRENCY.DEFAULT_MAX_JOBS, 5);
    });
  });
});

describe('Worker Registry - Pipeline Support', () => {
  let workerRegistry;

  beforeEach(async () => {
    // Import dynamically to isolate each test
    const module = await import('../../api/utils/worker-registry.js');
    workerRegistry = module.workerRegistry;
  });

  describe('isSupported', () => {
    it('should return true for known pipeline IDs', () => {
      const knownPipelines = [
        'duplicate-detection',
        'schema-enhancement',
        'git-activity',
        'gitignore-manager',
        'repomix',
        'claude-health',
        'repo-cleanup',
        'bugfix-audit',
        'dashboard-populate',
        'plugin-manager',
        'test-refactor'
      ];

      for (const pipelineId of knownPipelines) {
        assert.strictEqual(
          workerRegistry.isSupported(pipelineId),
          true,
          `${pipelineId} should be supported`
        );
      }
    });

    it('should return false for unknown pipeline IDs', () => {
      const unknownPipelines = [
        'unknown-pipeline',
        'nonexistent',
        '',
        'DUPLICATE-DETECTION' // case sensitive
      ];

      for (const pipelineId of unknownPipelines) {
        assert.strictEqual(
          workerRegistry.isSupported(pipelineId),
          false,
          `${pipelineId} should not be supported`
        );
      }
    });
  });

  describe('getSupportedPipelines', () => {
    it('should return array of pipeline IDs', () => {
      const pipelines = workerRegistry.getSupportedPipelines();

      assert.ok(Array.isArray(pipelines), 'Should return array');
      assert.ok(pipelines.length > 0, 'Should have at least one pipeline');
      assert.ok(pipelines.includes('duplicate-detection'), 'Should include duplicate-detection');
    });

    it('should return consistent results', () => {
      const pipelines1 = workerRegistry.getSupportedPipelines();
      const pipelines2 = workerRegistry.getSupportedPipelines();

      assert.deepStrictEqual(pipelines1, pipelines2, 'Should return same pipelines');
    });

    it('should include all expected pipelines', () => {
      const pipelines = workerRegistry.getSupportedPipelines();
      const expected = [
        'duplicate-detection',
        'schema-enhancement',
        'git-activity',
        'gitignore-manager',
        'repomix',
        'claude-health',
        'repo-cleanup',
        'test-refactor'
      ];

      for (const p of expected) {
        assert.ok(pipelines.includes(p), `Should include ${p}`);
      }
    });
  });
});

describe('Worker Registry - Stats', () => {
  let workerRegistry;

  beforeEach(async () => {
    const module = await import('../../api/utils/worker-registry.js');
    workerRegistry = module.workerRegistry;
  });

  describe('getAllStats', () => {
    it('should return stats object with expected structure', () => {
      const stats = workerRegistry.getAllStats();

      assert.ok(typeof stats === 'object', 'Should return object');
      assert.ok('total' in stats, 'Should have total');
      assert.ok('queued' in stats, 'Should have queued');
      assert.ok('active' in stats, 'Should have active');
      assert.ok('completed' in stats, 'Should have completed');
      assert.ok('failed' in stats, 'Should have failed');
      assert.ok('byPipeline' in stats, 'Should have byPipeline');
    });

    it('should have non-negative numeric values', () => {
      const stats = workerRegistry.getAllStats();

      assert.ok(stats.total >= 0, 'total should be >= 0');
      assert.ok(stats.queued >= 0, 'queued should be >= 0');
      assert.ok(stats.active >= 0, 'active should be >= 0');
      assert.ok(stats.completed >= 0, 'completed should be >= 0');
      assert.ok(stats.failed >= 0, 'failed should be >= 0');
    });
  });

  describe('getWorkerStats', () => {
    it('should return null for uninitialized workers', () => {
      const stats = workerRegistry.getWorkerStats('nonexistent-pipeline');
      assert.strictEqual(stats, null);
    });
  });

  describe('getScanMetrics', () => {
    it('should return null for workers without scan metrics', () => {
      const metrics = workerRegistry.getScanMetrics('nonexistent-pipeline');
      assert.strictEqual(metrics, null);
    });
  });
});

describe('Worker Registry - Activity Feed', () => {
  let workerRegistry;

  beforeEach(async () => {
    const module = await import('../../api/utils/worker-registry.js');
    workerRegistry = module.workerRegistry;
  });

  describe('setActivityFeed', () => {
    it('should accept activity feed manager without error', () => {
      const mockActivityFeed = {
        listenToWorker: () => {}
      };

      assert.doesNotThrow(() => {
        workerRegistry.setActivityFeed(mockActivityFeed);
      });
    });
  });
});

describe('Worker Registry - Error Handling', () => {
  let workerRegistry;

  beforeEach(async () => {
    const module = await import('../../api/utils/worker-registry.js');
    workerRegistry = module.workerRegistry;
  });

  describe('getWorker with unknown pipeline', () => {
    it('should throw error for unknown pipeline ID', async () => {
      await assert.rejects(
        () => workerRegistry.getWorker('completely-unknown-pipeline'),
        /Unknown pipeline ID/
      );
    });
  });

  describe('getWorker with disabled pipeline', () => {
    it('should throw error for disabled pipeline', async () => {
      await assert.rejects(
        () => workerRegistry.getWorker('test-refactor'),
        /temporarily disabled/
      );
    });
  });
});

describe('Worker Registry - Shutdown', () => {
  let workerRegistry;

  beforeEach(async () => {
    const module = await import('../../api/utils/worker-registry.js');
    workerRegistry = module.workerRegistry;
  });

  describe('shutdown method', () => {
    it('should be a function', () => {
      assert.strictEqual(typeof workerRegistry.shutdown, 'function');
    });
  });
});

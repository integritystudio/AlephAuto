/**
 * Pipeline Triggering Integration Tests
 *
 * Tests POST /api/sidequest/pipeline-runners/:id/trigger endpoint to verify:
 * - All 7+ supported pipelines can be triggered
 * - WorkerRegistry integration works correctly
 * - Unsupported pipelines return helpful error messages
 * - Jobs are created with correct pipeline IDs
 * - Parameters are passed through correctly
 *
 * These tests verify fixes for E4 (missing job triggering implementation)
 * which previously only supported duplicate-detection pipeline.
 *
 * @see ~/dev/active/bugfix-AlephAuto-errors-2025-11-29/plan.md - Phase 3: WorkerRegistry Integration
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createTempRepository, createMultipleTempRepositories, cleanupRepositories } from '../fixtures/test-helpers.js';

// Base URL for API - uses localhost by default
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8080';

// Skip in CI - requires running API server
const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

// Supported pipelines that should be triggerable (excluding test-refactor which is disabled)
const SUPPORTED_PIPELINES = [
  'duplicate-detection',
  'schema-enhancement',
  'git-activity',
  'gitignore-manager',
  'repomix',
  'claude-health',
  'repo-cleanup'
];

// Test repositories - populated in before() hook
let testRepo;
let multiRepos;

// Test parameters for each pipeline - uses testRepo.path
function getPipelineTestParams() {
  return {
    'duplicate-detection': {
      repositoryPath: testRepo.path
    },
    'schema-enhancement': {
      readmePath: `${testRepo.path}/README.md`
    },
    'git-activity': {
      reportType: 'weekly'
    },
    'gitignore-manager': {
      repositories: [testRepo.path]
    },
    'repomix': {
      repositoryPath: testRepo.path
    },
    'claude-health': {},
    'repo-cleanup': {
      targetDir: testRepo.path,
      dryRun: true
    }
  };
}

describe('POST /api/sidequest/pipeline-runners/:id/trigger Integration Tests', { skip: isCI ? 'Requires running API server' : false }, () => {

  before(async () => {
    // Create temporary test repositories
    testRepo = await createTempRepository('trigger-test');
    multiRepos = await createMultipleTempRepositories(3);
  });

  after(async () => {
    // Clean up all temporary repositories
    if (testRepo) await testRepo.cleanup();
    if (multiRepos) await cleanupRepositories(multiRepos);
  });

  describe('Supported Pipeline Triggering', () => {
    for (const pipelineId of SUPPORTED_PIPELINES) {
      it(`should trigger ${pipelineId} pipeline successfully`, async () => {
        const params = getPipelineTestParams()[pipelineId] || {};

        const response = await fetch(`${API_BASE_URL}/api/sidequest/pipeline-runners/${pipelineId}/trigger`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ parameters: params })
        });

        // Expect 201 Created for successful job creation
        assert.strictEqual(response.status, 201, `Should return 201 Created for ${pipelineId}`);

        const data = await response.json();

        // Verify response structure
        assert.ok(data.jobId, `Response should have jobId for ${pipelineId}`);
        assert.strictEqual(data.pipelineId, pipelineId, `Response pipelineId should match ${pipelineId}`);
        assert.strictEqual(data.status, 'queued', `Job status should be 'queued' for ${pipelineId}`);
        assert.ok(data.timestamp, `Response should have timestamp for ${pipelineId}`);

        // Verify job ID format includes pipeline name
        assert.ok(
          data.jobId.includes(pipelineId),
          `Job ID should include pipeline name: ${data.jobId}`
        );

        console.log(`  - ${pipelineId}: Job created with ID ${data.jobId}`);
      });
    }
  });

  describe('Unsupported Pipeline Handling', () => {
    it('should reject unsupported pipeline with helpful error', async () => {
      const response = await fetch(`${API_BASE_URL}/api/sidequest/pipeline-runners/invalid-pipeline/trigger`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ parameters: {} })
      });

      // Should return error status (500 since it throws in handler)
      assert.ok(response.status >= 400, 'Should return error status for invalid pipeline');

      const data = await response.json();

      // Verify error message mentions the invalid pipeline
      assert.ok(
        data.message && data.message.includes('invalid-pipeline'),
        `Error should mention invalid pipeline: ${data.message}`
      );

      // Verify error message lists supported pipelines
      for (const supported of SUPPORTED_PIPELINES) {
        assert.ok(
          data.message && data.message.includes(supported),
          `Error should list supported pipeline '${supported}' in message: ${data.message}`
        );
      }
    });

    it('should reject non-existent pipeline ID', async () => {
      const response = await fetch(`${API_BASE_URL}/api/sidequest/pipeline-runners/nonexistent-pipeline-12345/trigger`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ parameters: {} })
      });

      assert.ok(response.status >= 400, 'Should return error status');

      const data = await response.json();
      assert.ok(data.message, 'Error response should have message');
    });
  });

  describe('Disabled Pipeline Handling', () => {
    it('should return specific error for disabled test-refactor pipeline', async () => {
      const response = await fetch(`${API_BASE_URL}/api/sidequest/pipeline-runners/test-refactor/trigger`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ parameters: {} })
      });

      assert.ok(response.status >= 400, 'Should return error status for disabled pipeline');

      const data = await response.json();

      // Verify error mentions TypeScript compilation
      assert.ok(
        data.message && data.message.includes('TypeScript'),
        `Error should mention TypeScript compilation: ${data.message}`
      );
    });
  });

  describe('Parameter Handling', () => {
    it('should pass parameters through to job for claude-health', async () => {
      const customParams = {
        customField: 'test-value',
        checkType: 'full'
      };

      const response = await fetch(`${API_BASE_URL}/api/sidequest/pipeline-runners/claude-health/trigger`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ parameters: customParams })
      });

      assert.strictEqual(response.status, 201, 'Should accept custom parameters');

      const data = await response.json();
      assert.ok(data.jobId, 'Should return job ID with custom parameters');
    });

    it('should handle empty parameters gracefully', async () => {
      const response = await fetch(`${API_BASE_URL}/api/sidequest/pipeline-runners/claude-health/trigger`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      assert.strictEqual(response.status, 201, 'Should accept request without parameters');

      const data = await response.json();
      assert.ok(data.jobId, 'Should return job ID without parameters');
    });
  });

  describe('duplicate-detection Backward Compatibility', () => {
    it('should require repositoryPath or repositoryPaths for duplicate-detection', async () => {
      const response = await fetch(`${API_BASE_URL}/api/sidequest/pipeline-runners/duplicate-detection/trigger`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ parameters: {} })
      });

      // Should fail because no repository path provided
      assert.ok(response.status >= 400, 'Should fail without repositoryPath');

      const data = await response.json();
      assert.ok(
        data.message && (data.message.includes('repositoryPath') || data.message.includes('repositoryPaths')),
        'Error should mention required parameters'
      );
    });

    it('should accept single repositoryPath for intra-project scan', async () => {
      const response = await fetch(`${API_BASE_URL}/api/sidequest/pipeline-runners/duplicate-detection/trigger`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          parameters: {
            repositoryPath: testRepo.path
          }
        })
      });

      assert.strictEqual(response.status, 201, 'Should accept single repositoryPath');

      const data = await response.json();
      assert.ok(data.jobId, 'Should return job ID');
    });

    it('should accept multiple repositoryPaths for inter-project scan', async () => {
      const response = await fetch(`${API_BASE_URL}/api/sidequest/pipeline-runners/duplicate-detection/trigger`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          parameters: {
            repositoryPaths: multiRepos.map(r => r.path)
          }
        })
      });

      assert.strictEqual(response.status, 201, 'Should accept multiple repositoryPaths');

      const data = await response.json();
      assert.ok(data.jobId, 'Should return job ID');
    });
  });

  describe('Concurrent Trigger Handling', () => {
    it('should handle multiple concurrent triggers for different pipelines', async () => {
      // Trigger multiple pipelines concurrently
      const triggers = [
        fetch(`${API_BASE_URL}/api/sidequest/pipeline-runners/claude-health/trigger`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parameters: {} })
        }),
        fetch(`${API_BASE_URL}/api/sidequest/pipeline-runners/git-activity/trigger`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parameters: { reportType: 'weekly' } })
        }),
        fetch(`${API_BASE_URL}/api/sidequest/pipeline-runners/schema-enhancement/trigger`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parameters: { readmePath: `${testRepo.path}/README.md` } })
        })
      ];

      const responses = await Promise.all(triggers);

      // All should succeed
      for (const response of responses) {
        assert.strictEqual(response.status, 201, 'All concurrent triggers should succeed');
      }

      // All should have unique job IDs
      const jobIds = await Promise.all(responses.map(async (r) => {
        const data = await r.json();
        return data.jobId;
      }));

      const uniqueJobIds = new Set(jobIds);
      assert.strictEqual(uniqueJobIds.size, jobIds.length, 'All job IDs should be unique');
    });
  });

  describe('Response Format Validation', () => {
    it('should return correct response format for successful trigger', async () => {
      const response = await fetch(`${API_BASE_URL}/api/sidequest/pipeline-runners/claude-health/trigger`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ parameters: {} })
      });

      assert.strictEqual(response.status, 201, 'Should return 201 Created');

      const data = await response.json();

      // Verify all required fields
      assert.ok(typeof data.jobId === 'string', 'jobId should be a string');
      assert.ok(typeof data.pipelineId === 'string', 'pipelineId should be a string');
      assert.ok(typeof data.status === 'string', 'status should be a string');
      assert.ok(typeof data.timestamp === 'string', 'timestamp should be a string');

      // Verify timestamp is valid ISO format
      const parsedTimestamp = new Date(data.timestamp);
      assert.ok(!isNaN(parsedTimestamp.getTime()), 'timestamp should be valid ISO date');
    });
  });
});

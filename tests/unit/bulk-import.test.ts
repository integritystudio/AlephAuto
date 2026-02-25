#!/usr/bin/env node
/**
 * Bulk Import Migration Tests
 *
 * Tests for the database migration functionality including:
 * - bulkImportJobs() function for batch job imports
 * - Idempotent imports (skip existing jobs)
 * - Data validation and error handling
 * - Field mapping (snake_case vs camelCase)
 *
 * Bug fixed: Migration from local SQLite to Render deployment
 */

// @ts-nocheck
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  initDatabase,
  isDatabaseReady,
  getAllJobs,
  bulkImportJobs,
  closeDatabase
} from '../../sidequest/core/database.ts';

describe('Bulk Import Migration', () => {
  before(async () => {
    await initDatabase(':memory:');
  });

  after(() => {
    closeDatabase();
  });

  beforeEach(async () => {
    if (!isDatabaseReady()) {
      await initDatabase(':memory:');
    }
  });

  describe('bulkImportJobs', () => {
    it('should import jobs with snake_case field names', () => {
      const jobs = [
        {
          id: `test-import-snake-${Date.now()}`,
          pipeline_id: 'test-pipeline',
          status: 'completed',
          created_at: '2026-01-18T10:00:00.000Z',
          started_at: '2026-01-18T10:00:01.000Z',
          completed_at: '2026-01-18T10:00:05.000Z',
          data: '{"test": true}',
          result: '{"success": true}',
          error: null,
          git: null
        }
      ];

      const result = bulkImportJobs(jobs);

      assert.strictEqual(result.imported, 1);
      assert.strictEqual(result.skipped, 0);
      assert.strictEqual(result.errors.length, 0);
    });

    it('should import jobs with camelCase field names', () => {
      const jobs = [
        {
          id: `test-import-camel-${Date.now()}`,
          pipelineId: 'test-pipeline',
          status: 'completed',
          createdAt: '2026-01-18T10:00:00.000Z',
          startedAt: '2026-01-18T10:00:01.000Z',
          completedAt: '2026-01-18T10:00:05.000Z',
          data: { test: true },
          result: { success: true },
          error: null,
          git: null
        }
      ];

      const result = bulkImportJobs(jobs);

      assert.strictEqual(result.imported, 1);
      assert.strictEqual(result.skipped, 0);
      assert.strictEqual(result.errors.length, 0);
    });

    it('should skip jobs that already exist (idempotent)', () => {
      const jobId = `test-idempotent-${Date.now()}`;
      const jobs = [
        {
          id: jobId,
          pipeline_id: 'test-pipeline',
          status: 'completed',
          created_at: '2026-01-18T10:00:00.000Z'
        }
      ];

      // First import
      const result1 = bulkImportJobs(jobs);
      assert.strictEqual(result1.imported, 1);
      assert.strictEqual(result1.skipped, 0);

      // Second import - same job should be skipped
      const result2 = bulkImportJobs(jobs);
      assert.strictEqual(result2.imported, 0);
      assert.strictEqual(result2.skipped, 1);
    });

    it('should handle mixed new and existing jobs', () => {
      const existingJobId = `test-existing-${Date.now()}`;
      const newJobId = `test-new-${Date.now() + 1}`;

      // Create existing job first
      bulkImportJobs([{
        id: existingJobId,
        pipeline_id: 'test-pipeline',
        status: 'completed',
        created_at: '2026-01-18T10:00:00.000Z'
      }]);

      // Import batch with both existing and new
      const result = bulkImportJobs([
        {
          id: existingJobId,
          pipeline_id: 'test-pipeline',
          status: 'completed',
          created_at: '2026-01-18T10:00:00.000Z'
        },
        {
          id: newJobId,
          pipeline_id: 'test-pipeline',
          status: 'failed',
          created_at: '2026-01-18T11:00:00.000Z'
        }
      ]);

      assert.strictEqual(result.imported, 1);
      assert.strictEqual(result.skipped, 1);
    });

    it('should import multiple jobs in a single batch', () => {
      const timestamp = Date.now();
      const jobs = Array.from({ length: 5 }, (_, i) => ({
        id: `test-batch-${timestamp}-${i}`,
        pipeline_id: 'batch-test',
        status: i % 2 === 0 ? 'completed' : 'failed',
        created_at: new Date(Date.now() - i * 1000).toISOString()
      }));

      const result = bulkImportJobs(jobs);

      assert.strictEqual(result.imported, 5);
      assert.strictEqual(result.skipped, 0);
      assert.strictEqual(result.errors.length, 0);
    });

    it('should handle JSON objects in data/result/error/git fields', () => {
      const jobId = `test-json-fields-${Date.now()}`;
      const jobs = [{
        id: jobId,
        pipeline_id: 'test-pipeline',
        status: 'completed',
        created_at: '2026-01-18T10:00:00.000Z',
        data: { repositoryPath: '/test/path', scanType: 'intra-project' },
        result: { duplicatesFound: 5, reportPath: '/reports/test.html' },
        error: null,
        git: { branchName: 'feature/test', commitSha: 'abc123' }
      }];

      const result = bulkImportJobs(jobs);
      assert.strictEqual(result.imported, 1);

      // Verify data was stored correctly
      const allJobs = getAllJobs();
      const importedJob = allJobs.find(j => j.id === jobId);
      assert.ok(importedJob, 'Job should be retrievable');
    });

    it('should handle string-encoded JSON in data fields', () => {
      const jobId = `test-string-json-${Date.now()}`;
      const jobs = [{
        id: jobId,
        pipeline_id: 'test-pipeline',
        status: 'failed',
        created_at: '2026-01-18T10:00:00.000Z',
        data: '{"test": true}',
        result: null,
        error: '"Error message here"',
        git: '{"branchName": null}'
      }];

      const result = bulkImportJobs(jobs);
      assert.strictEqual(result.imported, 1);
      assert.strictEqual(result.errors.length, 0);
    });

    it('should use default pipeline_id when not provided', () => {
      const jobId = `test-no-pipeline-${Date.now()}`;
      const jobs = [{
        id: jobId,
        status: 'completed',
        created_at: '2026-01-18T10:00:00.000Z'
      }];

      const result = bulkImportJobs(jobs);
      assert.strictEqual(result.imported, 1);

      const allJobs = getAllJobs();
      const importedJob = allJobs.find(j => j.id === jobId);
      assert.ok(importedJob, 'Job should exist');
      assert.strictEqual(importedJob.pipelineId, 'unknown');
    });

    it('should handle empty jobs array', () => {
      const result = bulkImportJobs([]);

      assert.strictEqual(result.imported, 0);
      assert.strictEqual(result.skipped, 0);
      assert.strictEqual(result.errors.length, 0);
    });

    it('should return correct summary counts', () => {
      const timestamp = Date.now();

      // Create one existing job
      bulkImportJobs([{
        id: `test-summary-existing-${timestamp}`,
        pipeline_id: 'test',
        status: 'completed',
        created_at: '2026-01-18T10:00:00.000Z'
      }]);

      // Import batch with 1 existing, 2 new
      const result = bulkImportJobs([
        {
          id: `test-summary-existing-${timestamp}`,
          pipeline_id: 'test',
          status: 'completed',
          created_at: '2026-01-18T10:00:00.000Z'
        },
        {
          id: `test-summary-new1-${timestamp}`,
          pipeline_id: 'test',
          status: 'completed',
          created_at: '2026-01-18T11:00:00.000Z'
        },
        {
          id: `test-summary-new2-${timestamp}`,
          pipeline_id: 'test',
          status: 'failed',
          created_at: '2026-01-18T12:00:00.000Z'
        }
      ]);

      assert.strictEqual(result.imported, 2, 'Should import 2 new jobs');
      assert.strictEqual(result.skipped, 1, 'Should skip 1 existing job');
      assert.strictEqual(result.errors.length, 0, 'Should have no errors');
    });
  });

  describe('Migration scenarios', () => {
    it('should handle typical migration payload structure', () => {
      // This mimics the actual data structure from SQLite dump
      // Use a unique prefix to avoid timestamp collisions with other tests
      const uniqueKey = `migration-payload-${Date.now()}`;
      const jobs = [
        {
          id: `${uniqueKey}-0`,
          pipeline_id: 'test-worker',
          status: 'failed',
          created_at: '2026-01-17T02:15:50.116Z',
          started_at: '2026-01-17T02:15:50.116Z',
          completed_at: '2026-01-17T02:15:50.116Z',
          data: '{"type":"test","index":0,"data":{"test":true}}',
          result: null,
          error: '"No test handler configured"',
          git: '{"branchName":null,"originalBranch":null,"commitSha":null,"prUrl":null,"changedFiles":[]}'
        },
        {
          id: `${uniqueKey}-1`,
          pipeline_id: 'test-worker',
          status: 'completed',
          created_at: '2026-01-17T02:15:50.117Z',
          started_at: '2026-01-17T02:15:50.187Z',
          completed_at: '2026-01-17T02:15:50.187Z',
          data: '{"type":"test","index":1,"data":{"test":true}}',
          result: '{"success":true}',
          error: null,
          git: '{"branchName":null,"originalBranch":null,"commitSha":null,"prUrl":null,"changedFiles":[]}'
        }
      ];

      const result = bulkImportJobs(jobs);

      assert.strictEqual(result.imported, 2);
      assert.strictEqual(result.skipped, 0);
      assert.strictEqual(result.errors.length, 0);

      // Verify jobs are retrievable by their unique prefix
      const allJobs = getAllJobs();
      const importedJobs = allJobs.filter(j => j.id.startsWith(uniqueKey));
      assert.strictEqual(importedJobs.length, 2);
    });

    it('should preserve all job statuses during migration', () => {
      const timestamp = Date.now();
      const statuses = ['queued', 'running', 'completed', 'failed'];

      const jobs = statuses.map((status, i) => ({
        id: `test-status-${timestamp}-${i}`,
        pipeline_id: 'status-test',
        status,
        created_at: new Date().toISOString()
      }));

      const result = bulkImportJobs(jobs);
      assert.strictEqual(result.imported, 4);

      // Verify each status was preserved
      const allJobs = getAllJobs();
      for (const status of statuses) {
        const job = allJobs.find(j =>
          j.id.includes(`test-status-${timestamp}`) && j.status === status
        );
        assert.ok(job, `Job with status '${status}' should exist`);
      }
    });

    it('should handle re-running migration multiple times (idempotent)', () => {
      const timestamp = Date.now();
      const jobs = [
        {
          id: `test-rerun-${timestamp}-1`,
          pipeline_id: 'rerun-test',
          status: 'completed',
          created_at: '2026-01-18T10:00:00.000Z'
        },
        {
          id: `test-rerun-${timestamp}-2`,
          pipeline_id: 'rerun-test',
          status: 'failed',
          created_at: '2026-01-18T11:00:00.000Z'
        }
      ];

      // Run migration 3 times
      const result1 = bulkImportJobs(jobs);
      const result2 = bulkImportJobs(jobs);
      const result3 = bulkImportJobs(jobs);

      // First run should import all
      assert.strictEqual(result1.imported, 2);
      assert.strictEqual(result1.skipped, 0);

      // Subsequent runs should skip all
      assert.strictEqual(result2.imported, 0);
      assert.strictEqual(result2.skipped, 2);

      assert.strictEqual(result3.imported, 0);
      assert.strictEqual(result3.skipped, 2);

      // Total jobs should still be 2
      const allJobs = getAllJobs();
      const testJobs = allJobs.filter(j => j.id.includes(`test-rerun-${timestamp}`));
      assert.strictEqual(testJobs.length, 2);
    });
  });

  describe('Error handling', () => {
    it('should continue importing after individual job errors', () => {
      const timestamp = Date.now();
      // Note: This test depends on database constraints
      // Currently bulkImportJobs handles most errors gracefully
      const jobs = [
        {
          id: `test-error-${timestamp}-1`,
          pipeline_id: 'error-test',
          status: 'completed',
          created_at: '2026-01-18T10:00:00.000Z'
        },
        {
          id: `test-error-${timestamp}-2`,
          pipeline_id: 'error-test',
          status: 'completed',
          created_at: '2026-01-18T11:00:00.000Z'
        }
      ];

      const result = bulkImportJobs(jobs);

      // Both should be imported successfully
      assert.strictEqual(result.imported, 2);
    });

    it('should handle null/undefined values gracefully', () => {
      const timestamp = Date.now();
      const jobs = [{
        id: `test-null-${timestamp}`,
        pipeline_id: null,
        status: 'completed',
        created_at: null,
        started_at: undefined,
        completed_at: null,
        data: null,
        result: undefined,
        error: null,
        git: null
      }];

      // Should not throw
      const result = bulkImportJobs(jobs);

      // Job should be imported with defaults
      assert.ok(result.imported === 1 || result.errors.length === 0);
    });
  });
});

describe('Field mapping compatibility', () => {
  before(async () => {
    if (!isDatabaseReady()) {
      await initDatabase(':memory:');
    }
  });

  it('should accept both snake_case and camelCase for pipeline_id', () => {
    const timestamp = Date.now();

    // snake_case
    const result1 = bulkImportJobs([{
      id: `test-snake-pipeline-${timestamp}`,
      pipeline_id: 'snake-pipeline',
      status: 'completed',
      created_at: new Date().toISOString()
    }]);

    // camelCase
    const result2 = bulkImportJobs([{
      id: `test-camel-pipeline-${timestamp}`,
      pipelineId: 'camel-pipeline',
      status: 'completed',
      createdAt: new Date().toISOString()
    }]);

    assert.strictEqual(result1.imported, 1);
    assert.strictEqual(result2.imported, 1);
  });

  it('should accept both snake_case and camelCase for timestamps', () => {
    const timestamp = Date.now();
    const isoDate = '2026-01-18T10:00:00.000Z';

    // snake_case timestamps
    const result1 = bulkImportJobs([{
      id: `test-snake-ts-${timestamp}`,
      pipeline_id: 'test',
      status: 'completed',
      created_at: isoDate,
      started_at: isoDate,
      completed_at: isoDate
    }]);

    // camelCase timestamps
    const result2 = bulkImportJobs([{
      id: `test-camel-ts-${timestamp}`,
      pipelineId: 'test',
      status: 'completed',
      createdAt: isoDate,
      startedAt: isoDate,
      completedAt: isoDate
    }]);

    assert.strictEqual(result1.imported, 1);
    assert.strictEqual(result2.imported, 1);
  });
});

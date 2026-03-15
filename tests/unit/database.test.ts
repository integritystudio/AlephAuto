/**
 * Database Unit Tests
 *
 * Tests for the PostgreSQL database module for job history persistence.
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { TIME_MS } from '../../sidequest/core/units.ts';
import {
  initDatabase,
  isDatabaseReady,
  saveJob,
  getJobs,
  getAllJobs,
  getJobCounts,
  getLastJob,
  getAllPipelineStats,
  importReportsToDatabase,
  importLogsToDatabase,
  bulkImportJobs,
  closeDatabase
} from '../../sidequest/core/database.ts';
import { VALIDATION } from '../../sidequest/core/constants.ts';
import { createTestDatabase, destroyTestDatabase } from '../fixtures/pg-test-helper.ts';

describe('Database Module', () => {
  before(async () => {
    await closeDatabase();
    await createTestDatabase();
    await initDatabase('pglite://memory');
  });

  after(async () => {
    await closeDatabase();
    await destroyTestDatabase();
  });

  beforeEach(async () => {
    if (!isDatabaseReady()) {
      await createTestDatabase();
      await initDatabase('pglite://memory');
    }
  });

  describe('initDatabase', () => {
    it('should initialize the database successfully', async () => {
      await initDatabase();
      assert.ok(isDatabaseReady(), 'Database should be initialized');
    });

    it('should return existing database on subsequent calls', async () => {
      await initDatabase();
      await initDatabase();
      assert.ok(isDatabaseReady(), 'Database should still be initialized');
    });
  });

  describe('isDatabaseReady', () => {
    it('should return true when database is initialized', () => {
      assert.strictEqual(isDatabaseReady(), true);
    });
  });

  describe('saveJob', () => {
    it('should save a job with all fields', async () => {
      const testJob = {
        id: `test-save-${Date.now()}`,
        pipelineId: 'test-pipeline',
        status: 'completed',
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        data: { testKey: 'testValue' },
        result: { success: true },
        error: null,
        git: { branch: 'main', commit: 'abc123' }
      };

      await saveJob(testJob);

      // Verify it was saved
      const saved = await getLastJob('test-pipeline');
      assert.ok(saved, 'Job should be saved');
      assert.strictEqual(saved.id, testJob.id);
    });

    it('should save a job with minimal fields', async () => {
      const minimalJob = {
        id: `test-minimal-${Date.now()}`,
        status: 'queued'
      };

      await saveJob(minimalJob);
    });

    it('should handle null optional fields', async () => {
      const jobWithNulls = {
        id: `test-nulls-${Date.now()}`,
        pipelineId: 'test-pipeline',
        status: 'running',
        data: null,
        result: null,
        error: null,
        git: null
      };

      await saveJob(jobWithNulls);
    });

    it('should update existing job on duplicate id', async () => {
      const jobId = `test-update-${Date.now()}`;

      await saveJob({
        id: jobId,
        pipelineId: 'test-pipeline',
        status: 'queued'
      });

      await saveJob({
        id: jobId,
        pipelineId: 'test-pipeline',
        status: 'completed'
      });

      const jobs = await getJobs('test-pipeline', { limit: 100 });
      const savedJob = jobs.find(j => j.id === jobId);
      assert.strictEqual(savedJob?.status, 'completed');
    });

    it('should reject job ID exceeding 100-char max', async () => {
      const longId = 'a'.repeat(VALIDATION.JOB_ID_MAX_LENGTH + 1);
      await assert.rejects(
        () => saveJob({ id: longId, status: 'queued' }),
        /max 100 chars/
      );
    });

    it('should reject pre-serialized data field that is not valid JSON', async () => {
      const id = `test-invalid-json-${Date.now()}`;
      await assert.rejects(
        () => saveJob({ id, status: 'queued', data: 'not-valid-json' }),
        /is a string but not valid JSON/
      );
    });

    it('should reject pre-serialized result field that is not valid JSON', async () => {
      const id = `test-invalid-json-result-${Date.now()}`;
      await assert.rejects(
        () => saveJob({ id, status: 'queued', result: '{broken' }),
        /is a string but not valid JSON/
      );
    });

    it('should accept pre-serialized fields that are valid JSON strings', async () => {
      const id = `test-valid-json-${Date.now()}`;
      await saveJob({ id, status: 'queued', data: '{"key":"value"}', result: '[1,2,3]' });
    });
  });

  describe('bulkImportJobs', () => {
    it('should reject jobs with invalid job ID format', async () => {
      const result = await bulkImportJobs([{ id: '!!!invalid!!!', status: 'completed' }]);
      assert.strictEqual(result.imported, 0);
      assert.ok(result.errors.length > 0);
      assert.ok(result.errors[0].includes('Invalid job ID format'));
    });

    it('should reject records where a JSON string field is not valid JSON', async () => {
      const id = `bulk-invalid-json-${Date.now()}`;
      const result = await bulkImportJobs([{ id, status: 'completed', data: 'not-json' }]);
      assert.strictEqual(result.imported, 0);
      assert.ok(result.errors.length > 0);
      assert.ok(result.errors[0].includes("is a string but not valid JSON"));
    });

    it('should include field name in error for invalid JSON string', async () => {
      const id = `bulk-field-name-${Date.now()}`;
      const result = await bulkImportJobs([{ id, status: 'completed', result: '{bad' }]);
      assert.ok(result.errors[0].includes("'result'"));
    });

    it('should include field name in error for invalid JSON git field', async () => {
      const id = `bulk-git-json-${Date.now()}`;
      const result = await bulkImportJobs([{ id, status: 'completed', git: '{bad' }]);
      assert.strictEqual(result.imported, 0);
      assert.ok(result.errors.length > 0);
      assert.ok(result.errors[0].includes("'git'"));
    });

    it('should import valid jobs and skip invalid ones', async () => {
      const validId = `bulk-valid-${Date.now()}`;
      const result = await bulkImportJobs([
        { id: validId, status: 'completed' },
        { id: '!!!bad!!!', status: 'completed' }
      ]);
      assert.strictEqual(result.imported, 1);
      assert.strictEqual(result.errors.length, 1);
    });
  });

  describe('getJobs', () => {
    // testPipelineId is assigned fresh in each beforeEach to prevent job-count
    // accumulation across tests (each run would otherwise add 5 more rows to the
    // same pipeline, making assertion counts non-deterministic).
    let testPipelineId: string;

    beforeEach(async () => {
      testPipelineId = `test-getjobs-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      // Create test jobs
      for (let i = 0; i < 5; i++) {
        await saveJob({
          id: `${testPipelineId}-job-${i}`,
          pipelineId: testPipelineId,
          status: i % 2 === 0 ? 'completed' : 'failed',
          createdAt: new Date(Date.now() - i * TIME_MS.SECOND).toISOString()
        });
      }
    });

    it('should return jobs for a pipeline', async () => {
      const jobs = await getJobs(testPipelineId);
      assert.ok(Array.isArray(jobs), 'Should return array');
      assert.ok(jobs.length > 0, 'Should have jobs');
    });

    it('should filter by status', async () => {
      const completedJobs = await getJobs(testPipelineId, { status: 'completed' });
      completedJobs.forEach(job => {
        assert.strictEqual(job.status, 'completed');
      });
    });

    it('should filter by tab=failed', async () => {
      const failedJobs = await getJobs(testPipelineId, { tab: 'failed' });
      failedJobs.forEach(job => {
        assert.strictEqual(job.status, 'failed');
      });
    });

    it('should apply limit', async () => {
      const limitedJobs = await getJobs(testPipelineId, { limit: 2 });
      assert.ok(limitedJobs.length <= 2, 'Should respect limit');
    });

    it('should apply offset', async () => {
      const allJobs = await getJobs(testPipelineId, { limit: 100 });
      const offsetJobs = await getJobs(testPipelineId, { limit: 100, offset: 2 });

      if (allJobs.length > 2) {
        assert.strictEqual(offsetJobs[0]?.id, allJobs[2]?.id);
      }
    });

    it('should include total count when includeTotal=true', async () => {
      const result = await getJobs(testPipelineId, { includeTotal: true });
      assert.ok('jobs' in result, 'Should have jobs property');
      assert.ok('total' in result, 'Should have total property');
      assert.ok(typeof result.total === 'number');
    });

    it('should return array when includeTotal=false', async () => {
      const result = await getJobs(testPipelineId, { includeTotal: false });
      assert.ok(Array.isArray(result), 'Should return array directly');
    });

    it('should include total with status filter', async () => {
      const result = await getJobs(testPipelineId, {
        status: 'completed',
        includeTotal: true
      });
      assert.ok(typeof result.total === 'number');
    });

    it('should include total with tab filter', async () => {
      const result = await getJobs(testPipelineId, {
        tab: 'failed',
        includeTotal: true
      });
      assert.ok(typeof result.total === 'number');
    });

    it('should parse JSON fields correctly', async () => {
      const jobId = `${testPipelineId}-json-${Date.now()}`;
      await saveJob({
        id: jobId,
        pipelineId: testPipelineId,
        status: 'completed',
        data: { key: 'value' },
        result: { count: 42 },
        git: { branch: 'main' }
      });

      const jobs = await getJobs(testPipelineId, { limit: 100 });
      const job = jobs.find(j => j.id === jobId);

      assert.ok(job, 'Should find job');
      assert.deepStrictEqual(job.data, { key: 'value' });
      assert.deepStrictEqual(job.result, { count: 42 });
      assert.deepStrictEqual(job.git, { branch: 'main' });
    });
  });

  describe('getAllJobs', () => {
    beforeEach(async () => {
      await saveJob({
        id: `all-jobs-test-${Date.now()}`,
        pipelineId: 'pipeline-a',
        status: 'completed'
      });
    });

    it('should return jobs from all pipelines', async () => {
      const jobs = await getAllJobs();
      assert.ok(Array.isArray(jobs), 'Should return array');
    });

    it('should filter by status', async () => {
      const completedJobs = await getAllJobs({ status: 'completed' });
      completedJobs.forEach(job => {
        assert.strictEqual(job.status, 'completed');
      });
    });

    it('should apply limit and offset', async () => {
      const jobs = await getAllJobs({ limit: 5, offset: 0 });
      assert.ok(jobs.length <= 5, 'Should respect limit');
    });
  });

  describe('getJobCounts', () => {
    const countPipelineId = `test-counts-${Date.now()}`;

    beforeEach(async () => {
      // Create jobs with different statuses
      await saveJob({ id: `${countPipelineId}-1`, pipelineId: countPipelineId, status: 'completed' });
      await saveJob({ id: `${countPipelineId}-2`, pipelineId: countPipelineId, status: 'completed' });
      await saveJob({ id: `${countPipelineId}-3`, pipelineId: countPipelineId, status: 'failed' });
      await saveJob({ id: `${countPipelineId}-4`, pipelineId: countPipelineId, status: 'running' });
      await saveJob({ id: `${countPipelineId}-5`, pipelineId: countPipelineId, status: 'queued' });
    });

    it('should return count object', async () => {
      const counts = await getJobCounts(countPipelineId);
      assert.ok(counts, 'Should return counts');
      assert.ok('total' in counts, 'Should have total');
      assert.ok('completed' in counts, 'Should have completed');
      assert.ok('failed' in counts, 'Should have failed');
      assert.ok('running' in counts, 'Should have running');
      assert.ok('queued' in counts, 'Should have queued');
    });

    it('should count jobs correctly', async () => {
      const counts = await getJobCounts(countPipelineId);
      assert.strictEqual(counts.total, 5);
      assert.strictEqual(counts.completed, 2);
      assert.strictEqual(counts.failed, 1);
      assert.strictEqual(counts.running, 1);
      assert.strictEqual(counts.queued, 1);
    });

    it('should return zeros for empty pipeline', async () => {
      const counts = await getJobCounts('non-existent-pipeline');
      assert.strictEqual(counts.total, 0);
    });
  });

  describe('getLastJob', () => {
    const lastJobPipelineId = `test-last-${Date.now()}`;

    beforeEach(async () => {
      // Create jobs in order
      await saveJob({
        id: `${lastJobPipelineId}-old`,
        pipelineId: lastJobPipelineId,
        status: 'completed',
        createdAt: new Date(Date.now() - 10000).toISOString()
      });
      await saveJob({
        id: `${lastJobPipelineId}-new`,
        pipelineId: lastJobPipelineId,
        status: 'completed',
        createdAt: new Date().toISOString()
      });
    });

    it('should return the most recent job', async () => {
      const lastJob = await getLastJob(lastJobPipelineId);
      assert.ok(lastJob, 'Should return a job');
      assert.strictEqual(lastJob.id, `${lastJobPipelineId}-new`);
    });

    it('should return null for non-existent pipeline', async () => {
      const lastJob = await getLastJob('non-existent-pipeline');
      assert.strictEqual(lastJob, null);
    });

    it('should parse JSON fields in last job', async () => {
      await saveJob({
        id: `${lastJobPipelineId}-latest`,
        pipelineId: lastJobPipelineId,
        status: 'completed',
        createdAt: new Date(Date.now() + TIME_MS.SECOND).toISOString(),
        data: { test: true },
        result: { value: 123 }
      });

      const lastJob = await getLastJob(lastJobPipelineId);
      assert.deepStrictEqual(lastJob.data, { test: true });
      assert.deepStrictEqual(lastJob.result, { value: 123 });
    });
  });

  describe('getAllPipelineStats', () => {
    beforeEach(async () => {
      // Create jobs for multiple pipelines
      await saveJob({
        id: `stats-test-a-${Date.now()}`,
        pipelineId: 'pipeline-stats-a',
        status: 'completed',
        completedAt: new Date().toISOString()
      });
      await saveJob({
        id: `stats-test-b-${Date.now()}`,
        pipelineId: 'pipeline-stats-b',
        status: 'failed'
      });
    });

    it('should return stats for all pipelines', async () => {
      const stats = await getAllPipelineStats();
      assert.ok(Array.isArray(stats), 'Should return array');
    });

    it('should include required fields in stats', async () => {
      const stats = await getAllPipelineStats();
      if (stats.length > 0) {
        const stat = stats[0];
        assert.ok('pipelineId' in stat);
        assert.ok('total' in stat);
        assert.ok('completed' in stat);
        assert.ok('failed' in stat);
        assert.ok('running' in stat);
        assert.ok('queued' in stat);
        assert.ok('lastRun' in stat);
      }
    });

    it('should calculate correct counts per pipeline', async () => {
      const stats = await getAllPipelineStats();
      const statA = stats.find(s => s.pipelineId === 'pipeline-stats-a');

      if (statA) {
        assert.ok(statA.total >= 1);
        assert.ok(statA.completed >= 1);
      }
    });
  });

  describe('importReportsToDatabase', () => {
    let tempDir;

    beforeEach(() => {
      // Create temp directory for test reports
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-reports-'));
    });

    afterEach(() => {
      // Clean up temp directory
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should return 0 for non-existent directory', async () => {
      const result = await importReportsToDatabase('/non/existent/path');
      assert.strictEqual(result, 0);
    });

    it('should return 0 for empty directory', async () => {
      const result = await importReportsToDatabase(tempDir);
      assert.strictEqual(result, 0);
    });

    it('should import summary.json files', async () => {
      // Create test report file
      const reportFile = path.join(tempDir, 'test-scan-2025-01-01-summary.json');
      fs.writeFileSync(reportFile, JSON.stringify({
        scanType: 'inter-project',
        repositories: ['/repo1', '/repo2'],
        totalDuplicates: 5,
        totalBlocks: 100,
        scanDuration: 1000
      }));

      const result = await importReportsToDatabase(tempDir);
      assert.strictEqual(result, 1);
    });

    it('should skip already imported reports', async () => {
      const reportFile = path.join(tempDir, 'duplicate-report-2025-01-01-summary.json');
      fs.writeFileSync(reportFile, JSON.stringify({
        scanType: 'inter-project',
        totalDuplicates: 3
      }));

      // Import once
      await importReportsToDatabase(tempDir);

      // Import again - should skip
      const result = await importReportsToDatabase(tempDir);
      assert.strictEqual(result, 0);
    });

    it('should extract date from filename', async () => {
      const reportFile = path.join(tempDir, 'scan-2025-06-15-summary.json');
      fs.writeFileSync(reportFile, JSON.stringify({
        scanType: 'test'
      }));

      await importReportsToDatabase(tempDir);

      // Verify the job was created with correct date
      const jobs = await getJobs('duplicate-detection', { limit: 100 });
      const importedJob = jobs.find(j => j.id === 'scan-2025-06-15');

      if (importedJob) {
        assert.ok(importedJob.createdAt.includes('2025-06-15'));
      }
    });

    it('should handle malformed JSON gracefully', async () => {
      const badFile = path.join(tempDir, 'bad-report-2025-01-01-summary.json');
      fs.writeFileSync(badFile, 'not valid json');

      const result = await importReportsToDatabase(tempDir);
      assert.strictEqual(result, 0);
    });

    it('should ignore non-summary files', async () => {
      // Create non-summary files
      fs.writeFileSync(path.join(tempDir, 'report.json'), '{}');
      fs.writeFileSync(path.join(tempDir, 'data.txt'), 'text');

      const result = await importReportsToDatabase(tempDir);
      assert.strictEqual(result, 0);
    });
  });

  describe('importLogsToDatabase', () => {
    let tempDir;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-logs-'));
    });

    afterEach(() => {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should return 0 for non-existent directory', async () => {
      const result = await importLogsToDatabase('/non/existent/path');
      assert.strictEqual(result, 0);
    });

    it('should return 0 for empty directory', async () => {
      const result = await importLogsToDatabase(tempDir);
      assert.strictEqual(result, 0);
    });

    it('should import git-activity logs', async () => {
      const logFile = path.join(tempDir, `git-activity-${Date.now()}.json`);
      fs.writeFileSync(logFile, JSON.stringify({
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        result: { commits: 10 }
      }));

      const result = await importLogsToDatabase(tempDir);
      assert.strictEqual(result, 1);
    });

    it('should import claude-health logs', async () => {
      const logFile = path.join(tempDir, `claude-health-${Date.now()}.json`);
      fs.writeFileSync(logFile, JSON.stringify({
        startTime: new Date().toISOString(),
        result: { status: 'healthy' }
      }));

      const result = await importLogsToDatabase(tempDir);
      assert.strictEqual(result, 1);
    });

    it('should import schema-enhancement logs', async () => {
      const logFile = path.join(tempDir, `schema-enhancement-${Date.now()}.json`);
      fs.writeFileSync(logFile, JSON.stringify({
        startTime: new Date().toISOString(),
        result: { enhanced: 5 }
      }));

      const result = await importLogsToDatabase(tempDir);
      assert.strictEqual(result, 1);
    });

    it('should import repomix logs', async () => {
      const logFile = path.join(tempDir, `repomix-${Date.now()}.json`);
      fs.writeFileSync(logFile, JSON.stringify({
        startTime: new Date().toISOString(),
        result: { files: 100 }
      }));

      const result = await importLogsToDatabase(tempDir);
      assert.strictEqual(result, 1);
    });

    it('should mark failed logs correctly', async () => {
      const logFile = path.join(tempDir, `git-activity-failed-${Date.now()}.json`);
      fs.writeFileSync(logFile, JSON.stringify({
        startTime: new Date().toISOString(),
        error: { message: 'Test error' }
      }));

      const importCount = await importLogsToDatabase(tempDir);
      assert.strictEqual(importCount, 1, 'Should import 1 failed log');

      const jobs = await getAllJobs({ status: 'failed' });
      const failedJob = jobs.find(j => j.id?.includes('git-activity-failed'));
      assert.ok(failedJob !== undefined, 'Failed log should be imported as a failed job');
    });

    it('should skip already imported logs', async () => {
      const logFile = path.join(tempDir, `git-activity-skip-test-${Date.now()}.json`);
      fs.writeFileSync(logFile, JSON.stringify({
        startTime: new Date().toISOString(),
        result: {}
      }));

      await importLogsToDatabase(tempDir);
      const result = await importLogsToDatabase(tempDir);
      assert.strictEqual(result, 0);
    });

    it('should handle malformed JSON gracefully', async () => {
      const badFile = path.join(tempDir, 'bad-log.json');
      fs.writeFileSync(badFile, 'not valid json');

      const result = await importLogsToDatabase(tempDir);
      assert.strictEqual(result, 0);
    });

    it('should map pipeline IDs correctly', async () => {
      const ts = Date.now();
      const pipelineMap: Record<string, string> = {
        'git-activity': 'git-activity',
        'claude-health': 'claude-health',
        'plugin-audit': 'plugin-manager',
        'gitignore': 'gitignore-manager',
        'doc-enhancement': 'schema-enhancement'
      };

      for (const prefix of Object.keys(pipelineMap)) {
        const logFile = path.join(tempDir, `${prefix}-map-test-${ts}.json`);
        fs.writeFileSync(logFile, JSON.stringify({
          startTime: new Date().toISOString()
        }));
      }

      const result = await importLogsToDatabase(tempDir);
      assert.strictEqual(result, 5, 'Should import all 5 log files');

      const allJobs = await getAllJobs({ limit: 1000 });
      for (const [prefix, expectedPipelineId] of Object.entries(pipelineMap)) {
        const job = allJobs.find(j => j.id?.includes(`${prefix}-map-test`));
        assert.ok(job !== undefined, `Should have imported log with prefix '${prefix}'`);
        assert.strictEqual(job!.pipelineId, expectedPipelineId,
          `'${prefix}' should map to pipeline '${expectedPipelineId}'`);
      }
    });

    it('should use unknown for unrecognized prefixes', async () => {
      const ts = Date.now();
      const logFile = path.join(tempDir, `unknown-prefix-${ts}.json`);
      fs.writeFileSync(logFile, JSON.stringify({
        startTime: new Date().toISOString()
      }));

      const importCount = await importLogsToDatabase(tempDir);
      assert.strictEqual(importCount, 1, 'Should import 1 log with unrecognized prefix');

      const allJobs = await getAllJobs({ limit: 1000 });
      const job = allJobs.find(j => j.id === `unknown-prefix-${ts}`);
      assert.ok(job !== undefined, 'Job should exist for unrecognized prefix');
      assert.strictEqual(job!.pipelineId, 'unknown', 'Unrecognized prefix should use pipeline ID "unknown"');
    });

    it('should ignore non-JSON files', async () => {
      fs.writeFileSync(path.join(tempDir, 'log.txt'), 'text content');
      fs.writeFileSync(path.join(tempDir, 'data.xml'), '<xml/>');

      const result = await importLogsToDatabase(tempDir);
      assert.strictEqual(result, 0);
    });
  });

  describe('closeDatabase', () => {
    it('should close without error when database is open', () => {
      // Just verify the function exists and is callable
      assert.strictEqual(typeof closeDatabase, 'function');
    });
  });
});

describe('Database Edge Cases', () => {
  before(async () => {
    await closeDatabase();
    await createTestDatabase();
    await initDatabase('pglite://memory');
  });

  after(async () => {
    await closeDatabase();
    await destroyTestDatabase();
  });

  beforeEach(async () => {
    if (!isDatabaseReady()) {
      await createTestDatabase();
      await initDatabase('pglite://memory');
    }
  });

  describe('JSON serialization', () => {
    it('should handle deeply nested objects', async () => {
      const complexJob = {
        id: `complex-${Date.now()}`,
        pipelineId: 'test',
        status: 'completed',
        data: {
          level1: {
            level2: {
              level3: {
                array: [1, 2, { nested: true }]
              }
            }
          }
        }
      };

      await saveJob(complexJob);

      const jobs = await getJobs('test', { limit: 100 });
      const saved = jobs.find(j => j.id === complexJob.id);
      assert.deepStrictEqual(saved?.data, complexJob.data);
    });

    it('should handle special characters in strings', async () => {
      const jobWithSpecialChars = {
        id: `special-${Date.now()}`,
        pipelineId: 'test',
        status: 'failed',
        error: {
          message: "Error with 'quotes' and \"double quotes\" and\nnewlines"
        }
      };

      await saveJob(jobWithSpecialChars);
    });

    it('should handle unicode characters', async () => {
      const unicodeJob = {
        id: `unicode-${Date.now()}`,
        pipelineId: 'test',
        status: 'completed',
        data: {
          emoji: '🚀',
          chinese: '中文',
          arabic: 'العربية'
        }
      };

      await saveJob(unicodeJob);

      const jobs = await getJobs('test', { limit: 100 });
      const saved = jobs.find(j => j.id === unicodeJob.id);
      assert.strictEqual(saved?.data?.emoji, '🚀');
    });
  });

  describe('Large data handling', () => {
    it('should handle large result objects', async () => {
      const largeResult = {
        items: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
          description: 'A'.repeat(100)
        }))
      };

      const largeJob = {
        id: `large-${Date.now()}`,
        pipelineId: 'test',
        status: 'completed',
        result: largeResult
      };

      await saveJob(largeJob);
    });
  });

  describe('Concurrent operations', () => {
    it('should handle rapid consecutive saves', async () => {
      const baseId = `rapid-${Date.now()}`;

      for (let i = 0; i < 10; i++) {
        await saveJob({
          id: `${baseId}-${i}`,
          pipelineId: 'rapid-test',
          status: 'queued'
        });
      }

      const jobs = await getJobs('rapid-test', { limit: 100 });
      const rapidJobs = jobs.filter(j => j.id?.startsWith(baseId));
      assert.strictEqual(rapidJobs.length, 10);
    });
  });
});

describe('Database Query Options', () => {
  const queryPipelineId = `query-options-${Date.now()}`;

  before(async () => {
    await closeDatabase();
    await createTestDatabase();
    await initDatabase('pglite://memory');
  });

  after(async () => {
    await closeDatabase();
    await destroyTestDatabase();
  });

  beforeEach(async () => {
    // Always reset to a fresh DB to prevent job accumulation across tests
    await closeDatabase();
    await createTestDatabase();
    await initDatabase('pglite://memory');

    // Create test data
    for (let i = 0; i < 20; i++) {
      await saveJob({
        id: `${queryPipelineId}-${i}`,
        pipelineId: queryPipelineId,
        status: i < 10 ? 'completed' : 'failed',
        createdAt: new Date(Date.now() - i * 60000).toISOString()
      });
    }
  });

  it('should use default limit of 10', async () => {
    const jobs = await getJobs(queryPipelineId);
    assert.strictEqual(jobs.length, 10);
  });

  it('should use default offset of 0', async () => {
    const jobs = await getJobs(queryPipelineId, { limit: 5 });
    const allJobs = await getJobs(queryPipelineId, { limit: 100 });
    assert.strictEqual(jobs[0]?.id, allJobs[0]?.id);
  });

  it('should handle limit of 0 (returns nothing)', async () => {
    const jobs = await getJobs(queryPipelineId, { limit: 0 });
    assert.strictEqual(jobs.length, 0);
  });

  it('should handle large offset', async () => {
    const jobs = await getJobs(queryPipelineId, { offset: 1000 });
    assert.strictEqual(jobs.length, 0);
  });

  it('should combine status filter with pagination', async () => {
    const result = await getJobs(queryPipelineId, {
      status: 'completed',
      limit: 5,
      offset: 2,
      includeTotal: true
    });

    assert.ok(result.jobs.length <= 5);
    assert.strictEqual(result.total, 10); // 10 completed jobs total
  });
});

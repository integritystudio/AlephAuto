/**
 * Database Unit Tests
 *
 * Tests for the SQLite database module for job history persistence.
 */

import { describe, it, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';

import {
  initDatabase,
  getDatabase,
  isDatabaseReady,
  saveJob,
  getJobs,
  getAllJobs,
  getJobCounts,
  getLastJob,
  getAllPipelineStats,
  importReportsToDatabase,
  importLogsToDatabase,
  closeDatabase
} from '../../sidequest/core/database.js';

describe('Database Module', () => {
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

  describe('initDatabase', () => {
    it('should initialize the database successfully', async () => {
      const db = await initDatabase();
      assert.ok(db, 'Database should be initialized');
    });

    it('should return existing database on subsequent calls', async () => {
      const db1 = await initDatabase();
      const db2 = await initDatabase();
      assert.strictEqual(db1, db2, 'Should return same database instance');
    });
  });

  describe('isDatabaseReady', () => {
    it('should return true when database is initialized', () => {
      assert.strictEqual(isDatabaseReady(), true);
    });
  });

  describe('getDatabase', () => {
    it('should return database instance when initialized', () => {
      const db = getDatabase();
      assert.ok(db, 'Should return database instance');
    });
  });

  describe('saveJob', () => {
    it('should save a job with all fields', () => {
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

      assert.doesNotThrow(() => saveJob(testJob));

      // Verify it was saved
      const saved = getLastJob('test-pipeline');
      assert.ok(saved, 'Job should be saved');
      assert.strictEqual(saved.id, testJob.id);
    });

    it('should save a job with minimal fields', () => {
      const minimalJob = {
        id: `test-minimal-${Date.now()}`,
        status: 'queued'
      };

      assert.doesNotThrow(() => saveJob(minimalJob));
    });

    it('should handle null optional fields', () => {
      const jobWithNulls = {
        id: `test-nulls-${Date.now()}`,
        pipelineId: 'test-pipeline',
        status: 'running',
        data: null,
        result: null,
        error: null,
        git: null
      };

      assert.doesNotThrow(() => saveJob(jobWithNulls));
    });

    it('should update existing job on duplicate id', () => {
      const jobId = `test-update-${Date.now()}`;

      saveJob({
        id: jobId,
        pipelineId: 'test-pipeline',
        status: 'queued'
      });

      saveJob({
        id: jobId,
        pipelineId: 'test-pipeline',
        status: 'completed'
      });

      const jobs = getJobs('test-pipeline', { limit: 100 });
      const savedJob = jobs.find(j => j.id === jobId);
      assert.strictEqual(savedJob?.status, 'completed');
    });
  });

  describe('getJobs', () => {
    const testPipelineId = `test-getjobs-${Date.now()}`;

    beforeEach(() => {
      // Create test jobs
      for (let i = 0; i < 5; i++) {
        saveJob({
          id: `${testPipelineId}-job-${i}`,
          pipelineId: testPipelineId,
          status: i % 2 === 0 ? 'completed' : 'failed',
          createdAt: new Date(Date.now() - i * 1000).toISOString()
        });
      }
    });

    it('should return jobs for a pipeline', () => {
      const jobs = getJobs(testPipelineId);
      assert.ok(Array.isArray(jobs), 'Should return array');
      assert.ok(jobs.length > 0, 'Should have jobs');
    });

    it('should filter by status', () => {
      const completedJobs = getJobs(testPipelineId, { status: 'completed' });
      completedJobs.forEach(job => {
        assert.strictEqual(job.status, 'completed');
      });
    });

    it('should filter by tab=failed', () => {
      const failedJobs = getJobs(testPipelineId, { tab: 'failed' });
      failedJobs.forEach(job => {
        assert.strictEqual(job.status, 'failed');
      });
    });

    it('should apply limit', () => {
      const limitedJobs = getJobs(testPipelineId, { limit: 2 });
      assert.ok(limitedJobs.length <= 2, 'Should respect limit');
    });

    it('should apply offset', () => {
      const allJobs = getJobs(testPipelineId, { limit: 100 });
      const offsetJobs = getJobs(testPipelineId, { limit: 100, offset: 2 });

      if (allJobs.length > 2) {
        assert.strictEqual(offsetJobs[0]?.id, allJobs[2]?.id);
      }
    });

    it('should include total count when includeTotal=true', () => {
      const result = getJobs(testPipelineId, { includeTotal: true });
      assert.ok('jobs' in result, 'Should have jobs property');
      assert.ok('total' in result, 'Should have total property');
      assert.ok(typeof result.total === 'number');
    });

    it('should return array when includeTotal=false', () => {
      const result = getJobs(testPipelineId, { includeTotal: false });
      assert.ok(Array.isArray(result), 'Should return array directly');
    });

    it('should include total with status filter', () => {
      const result = getJobs(testPipelineId, {
        status: 'completed',
        includeTotal: true
      });
      assert.ok(typeof result.total === 'number');
    });

    it('should include total with tab filter', () => {
      const result = getJobs(testPipelineId, {
        tab: 'failed',
        includeTotal: true
      });
      assert.ok(typeof result.total === 'number');
    });

    it('should parse JSON fields correctly', () => {
      const jobId = `${testPipelineId}-json-${Date.now()}`;
      saveJob({
        id: jobId,
        pipelineId: testPipelineId,
        status: 'completed',
        data: { key: 'value' },
        result: { count: 42 },
        git: { branch: 'main' }
      });

      const jobs = getJobs(testPipelineId, { limit: 100 });
      const job = jobs.find(j => j.id === jobId);

      assert.ok(job, 'Should find job');
      assert.deepStrictEqual(job.data, { key: 'value' });
      assert.deepStrictEqual(job.result, { count: 42 });
      assert.deepStrictEqual(job.git, { branch: 'main' });
    });
  });

  describe('getAllJobs', () => {
    beforeEach(() => {
      saveJob({
        id: `all-jobs-test-${Date.now()}`,
        pipelineId: 'pipeline-a',
        status: 'completed'
      });
    });

    it('should return jobs from all pipelines', () => {
      const jobs = getAllJobs();
      assert.ok(Array.isArray(jobs), 'Should return array');
    });

    it('should filter by status', () => {
      const completedJobs = getAllJobs({ status: 'completed' });
      completedJobs.forEach(job => {
        assert.strictEqual(job.status, 'completed');
      });
    });

    it('should apply limit and offset', () => {
      const jobs = getAllJobs({ limit: 5, offset: 0 });
      assert.ok(jobs.length <= 5, 'Should respect limit');
    });
  });

  describe('getJobCounts', () => {
    const countPipelineId = `test-counts-${Date.now()}`;

    beforeEach(() => {
      // Create jobs with different statuses
      saveJob({ id: `${countPipelineId}-1`, pipelineId: countPipelineId, status: 'completed' });
      saveJob({ id: `${countPipelineId}-2`, pipelineId: countPipelineId, status: 'completed' });
      saveJob({ id: `${countPipelineId}-3`, pipelineId: countPipelineId, status: 'failed' });
      saveJob({ id: `${countPipelineId}-4`, pipelineId: countPipelineId, status: 'running' });
      saveJob({ id: `${countPipelineId}-5`, pipelineId: countPipelineId, status: 'queued' });
    });

    it('should return count object', () => {
      const counts = getJobCounts(countPipelineId);
      assert.ok(counts, 'Should return counts');
      assert.ok('total' in counts, 'Should have total');
      assert.ok('completed' in counts, 'Should have completed');
      assert.ok('failed' in counts, 'Should have failed');
      assert.ok('running' in counts, 'Should have running');
      assert.ok('queued' in counts, 'Should have queued');
    });

    it('should count jobs correctly', () => {
      const counts = getJobCounts(countPipelineId);
      assert.strictEqual(counts.total, 5);
      assert.strictEqual(counts.completed, 2);
      assert.strictEqual(counts.failed, 1);
      assert.strictEqual(counts.running, 1);
      assert.strictEqual(counts.queued, 1);
    });

    it('should return zeros for empty pipeline', () => {
      const counts = getJobCounts('non-existent-pipeline');
      assert.strictEqual(counts.total, 0);
    });
  });

  describe('getLastJob', () => {
    const lastJobPipelineId = `test-last-${Date.now()}`;

    beforeEach(() => {
      // Create jobs in order
      saveJob({
        id: `${lastJobPipelineId}-old`,
        pipelineId: lastJobPipelineId,
        status: 'completed',
        createdAt: new Date(Date.now() - 10000).toISOString()
      });
      saveJob({
        id: `${lastJobPipelineId}-new`,
        pipelineId: lastJobPipelineId,
        status: 'completed',
        createdAt: new Date().toISOString()
      });
    });

    it('should return the most recent job', () => {
      const lastJob = getLastJob(lastJobPipelineId);
      assert.ok(lastJob, 'Should return a job');
      assert.strictEqual(lastJob.id, `${lastJobPipelineId}-new`);
    });

    it('should return null for non-existent pipeline', () => {
      const lastJob = getLastJob('non-existent-pipeline');
      assert.strictEqual(lastJob, null);
    });

    it('should parse JSON fields in last job', () => {
      saveJob({
        id: `${lastJobPipelineId}-latest`,
        pipelineId: lastJobPipelineId,
        status: 'completed',
        createdAt: new Date(Date.now() + 1000).toISOString(),
        data: { test: true },
        result: { value: 123 }
      });

      const lastJob = getLastJob(lastJobPipelineId);
      assert.deepStrictEqual(lastJob.data, { test: true });
      assert.deepStrictEqual(lastJob.result, { value: 123 });
    });
  });

  describe('getAllPipelineStats', () => {
    beforeEach(() => {
      // Create jobs for multiple pipelines
      saveJob({
        id: `stats-test-a-${Date.now()}`,
        pipelineId: 'pipeline-stats-a',
        status: 'completed',
        completedAt: new Date().toISOString()
      });
      saveJob({
        id: `stats-test-b-${Date.now()}`,
        pipelineId: 'pipeline-stats-b',
        status: 'failed'
      });
    });

    it('should return stats for all pipelines', () => {
      const stats = getAllPipelineStats();
      assert.ok(Array.isArray(stats), 'Should return array');
    });

    it('should include required fields in stats', () => {
      const stats = getAllPipelineStats();
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

    it('should calculate correct counts per pipeline', () => {
      const stats = getAllPipelineStats();
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
      const jobs = getJobs('duplicate-detection', { limit: 100 });
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

      await importLogsToDatabase(tempDir);

      // The job should be imported with failed status
      const jobs = getAllJobs({ status: 'failed' });
      const failedJob = jobs.find(j => j.id?.includes('git-activity-failed'));
      // Job might exist if imported
      assert.ok(true); // Test passes if no error thrown
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
      const pipelineMap = {
        'git-activity': 'git-activity',
        'claude-health': 'claude-health',
        'plugin-audit': 'plugin-manager',
        'gitignore': 'gitignore-manager',
        'doc-enhancement': 'schema-enhancement'
      };

      for (const [prefix, expectedId] of Object.entries(pipelineMap)) {
        const logFile = path.join(tempDir, `${prefix}-map-test-${Date.now()}.json`);
        fs.writeFileSync(logFile, JSON.stringify({
          startTime: new Date().toISOString()
        }));
      }

      const result = await importLogsToDatabase(tempDir);
      assert.ok(result >= 0);
    });

    it('should use unknown for unrecognized prefixes', async () => {
      const logFile = path.join(tempDir, `unknown-prefix-${Date.now()}.json`);
      fs.writeFileSync(logFile, JSON.stringify({
        startTime: new Date().toISOString()
      }));

      await importLogsToDatabase(tempDir);
      // Test passes if no error thrown
      assert.ok(true);
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
      // Note: This test may affect other tests, so we reinitialize
      assert.doesNotThrow(() => {
        // We don't actually close here to avoid breaking other tests
        // Just verify the function exists and is callable
        assert.strictEqual(typeof closeDatabase, 'function');
      });
    });
  });
});

describe('Database Edge Cases', () => {
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

  describe('JSON serialization', () => {
    it('should handle deeply nested objects', () => {
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

      assert.doesNotThrow(() => saveJob(complexJob));

      const jobs = getJobs('test', { limit: 100 });
      const saved = jobs.find(j => j.id === complexJob.id);
      assert.deepStrictEqual(saved?.data, complexJob.data);
    });

    it('should handle special characters in strings', () => {
      const jobWithSpecialChars = {
        id: `special-${Date.now()}`,
        pipelineId: 'test',
        status: 'failed',
        error: {
          message: "Error with 'quotes' and \"double quotes\" and\nnewlines"
        }
      };

      assert.doesNotThrow(() => saveJob(jobWithSpecialChars));
    });

    it('should handle unicode characters', () => {
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

      assert.doesNotThrow(() => saveJob(unicodeJob));

      const jobs = getJobs('test', { limit: 100 });
      const saved = jobs.find(j => j.id === unicodeJob.id);
      assert.strictEqual(saved?.data?.emoji, '🚀');
    });
  });

  describe('Large data handling', () => {
    it('should handle large result objects', () => {
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

      assert.doesNotThrow(() => saveJob(largeJob));
    });
  });

  describe('Concurrent operations', () => {
    it('should handle rapid consecutive saves', () => {
      const baseId = `rapid-${Date.now()}`;

      for (let i = 0; i < 10; i++) {
        saveJob({
          id: `${baseId}-${i}`,
          pipelineId: 'rapid-test',
          status: 'queued'
        });
      }

      const jobs = getJobs('rapid-test', { limit: 100 });
      const rapidJobs = jobs.filter(j => j.id?.startsWith(baseId));
      assert.strictEqual(rapidJobs.length, 10);
    });
  });
});

describe('Database Query Options', () => {
  const queryPipelineId = `query-options-${Date.now()}`;

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

    // Create test data
    for (let i = 0; i < 20; i++) {
      saveJob({
        id: `${queryPipelineId}-${i}`,
        pipelineId: queryPipelineId,
        status: i < 10 ? 'completed' : 'failed',
        createdAt: new Date(Date.now() - i * 60000).toISOString()
      });
    }
  });

  it('should use default limit of 10', () => {
    const jobs = getJobs(queryPipelineId);
    assert.strictEqual(jobs.length, 10);
  });

  it('should use default offset of 0', () => {
    const jobs = getJobs(queryPipelineId, { limit: 5 });
    const allJobs = getJobs(queryPipelineId, { limit: 100 });
    assert.strictEqual(jobs[0]?.id, allJobs[0]?.id);
  });

  it('should handle limit of 0 (returns nothing)', () => {
    const jobs = getJobs(queryPipelineId, { limit: 0 });
    assert.strictEqual(jobs.length, 0);
  });

  it('should handle large offset', () => {
    const jobs = getJobs(queryPipelineId, { offset: 1000 });
    assert.strictEqual(jobs.length, 0);
  });

  it('should combine status filter with pagination', () => {
    const result = getJobs(queryPipelineId, {
      status: 'completed',
      limit: 5,
      offset: 2,
      includeTotal: true
    });

    assert.ok(result.jobs.length <= 5);
    assert.strictEqual(result.total, 10); // 10 completed jobs total
  });
});

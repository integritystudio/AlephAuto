/**
 * PostgreSQL Connection Lifecycle Tests (RED phase)
 *
 * Verifies the async PG-based API for initDatabase, closeDatabase, isDatabaseReady.
 * These tests are written against the FUTURE pg implementation and FAIL against
 * the current SQLite-backed database.ts.
 *
 * Key differences that cause failures:
 * - initDatabase() with a PG connection string must create a PG pool, not SQLite
 * - Schema introspection queries target pg_catalog / information_schema (PG-only)
 * - closeDatabase() must become async (Promise<void>)
 * - Singleton guard must reset cleanly across test teardown via closeDatabase()
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  createTestDatabase,
  destroyTestDatabase,
  getTestClient,
  truncateJobs,
} from '../fixtures/pg-test-helper.ts';
import {
  initDatabase,
  closeDatabase,
  isDatabaseReady,
  saveJob,
  getJobById,
  getJobCount,
  getJobs,
  getAllJobs,
  getJobCounts,
  getLastJob,
  getAllPipelineStats,
  bulkImportJobs,
  bulkCancelJobsByPipeline,
  importReportsToDatabase,
  importLogsToDatabase,
  getHealthStatus,
} from '../../sidequest/core/database.ts';
import type { BulkImportJob } from '../../sidequest/core/database.ts';
import type { JobStatus } from '../../api/types/job-status.ts';

/** PGlite connection string sentinel used by the future pg-based initDatabase. */
const PG_TEST_CONNECTION = 'pglite://memory';

describe('PostgreSQL connection lifecycle', () => {

  describe('isDatabaseReady before init', () => {
    before(async () => {
      // Guarantee a clean slate — close any prior SQLite instance
      closeDatabase();
    });

    it('returns false when no pool has been initialised', () => {
      assert.strictEqual(isDatabaseReady(), false,
        'isDatabaseReady() must be false before initDatabase() is called');
    });
  });

  describe('initDatabase — schema creation', () => {
    before(async () => {
      // Reset state before each suite
      closeDatabase();
      // Create the PGlite instance that the future implementation will use
      await createTestDatabase();
    });

    after(async () => {
      await closeDatabase();
      await destroyTestDatabase();
    });

    it('resolves to void (not a db instance) when given a PG connection string', async () => {
      const result = await initDatabase(PG_TEST_CONNECTION);
      // Future API: initDatabase returns Promise<void>
      assert.strictEqual(result, undefined,
        'initDatabase() should return undefined, not a database instance');
    });

    it('creates the jobs table with all required columns', async () => {
      const client = getTestClient();

      const res = await client.query<{ column_name: string }>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'jobs'
        ORDER BY ordinal_position
      `);

      const cols = res.rows.map(r => r.column_name);
      const required = [
        'id', 'pipeline_id', 'status', 'created_at',
        'started_at', 'completed_at', 'data', 'result', 'error', 'git',
      ];

      for (const col of required) {
        assert.ok(cols.includes(col),
          `jobs table must have column '${col}' — found: ${cols.join(', ')}`);
      }
    });

    it('creates exactly 4 indexes on the jobs table', async () => {
      const client = getTestClient();

      const res = await client.query<{ indexname: string }>(`
        SELECT indexname
        FROM pg_catalog.pg_indexes
        WHERE tablename = 'jobs'
          AND indexname != 'jobs_pkey'
        ORDER BY indexname
      `);

      assert.strictEqual(res.rows.length, 4,
        `Expected 4 non-PK indexes, found ${res.rows.length}: ${res.rows.map(r => r.indexname).join(', ')}`);
    });

    it('creates idx_jobs_pipeline_id index', async () => {
      const client = getTestClient();
      const res = await client.query<{ indexname: string }>(`
        SELECT indexname FROM pg_catalog.pg_indexes
        WHERE tablename = 'jobs' AND indexname = 'idx_jobs_pipeline_id'
      `);
      assert.strictEqual(res.rows.length, 1, 'idx_jobs_pipeline_id index must exist');
    });

    it('creates idx_jobs_status index', async () => {
      const client = getTestClient();
      const res = await client.query<{ indexname: string }>(`
        SELECT indexname FROM pg_catalog.pg_indexes
        WHERE tablename = 'jobs' AND indexname = 'idx_jobs_status'
      `);
      assert.strictEqual(res.rows.length, 1, 'idx_jobs_status index must exist');
    });

    it('creates idx_jobs_created_at index', async () => {
      const client = getTestClient();
      const res = await client.query<{ indexname: string }>(`
        SELECT indexname FROM pg_catalog.pg_indexes
        WHERE tablename = 'jobs' AND indexname = 'idx_jobs_created_at'
      `);
      assert.strictEqual(res.rows.length, 1, 'idx_jobs_created_at index must exist');
    });

    it('creates idx_jobs_pipeline_status composite index', async () => {
      const client = getTestClient();
      const res = await client.query<{ indexname: string }>(`
        SELECT indexname FROM pg_catalog.pg_indexes
        WHERE tablename = 'jobs' AND indexname = 'idx_jobs_pipeline_status'
      `);
      assert.strictEqual(res.rows.length, 1, 'idx_jobs_pipeline_status index must exist');
    });
  });

  describe('initDatabase — singleton guard', () => {
    before(async () => {
      closeDatabase();
      await createTestDatabase();
    });

    after(async () => {
      await closeDatabase();
      await destroyTestDatabase();
    });

    it('does not throw on a second call (no-op)', async () => {
      await initDatabase(PG_TEST_CONNECTION);
      await assert.doesNotReject(
        () => initDatabase(PG_TEST_CONNECTION),
        'Second call to initDatabase() must be a no-op and must not throw'
      );
    });
  });

  describe('isDatabaseReady state transitions', () => {
    before(async () => {
      closeDatabase();
    });

    after(async () => {
      await closeDatabase();
      await destroyTestDatabase();
    });

    it('returns false before initDatabase is called', () => {
      assert.strictEqual(isDatabaseReady(), false,
        'isDatabaseReady() must be false before init');
    });

    it('returns true after initDatabase resolves', async () => {
      await createTestDatabase();
      await initDatabase(PG_TEST_CONNECTION);
      assert.strictEqual(isDatabaseReady(), true,
        'isDatabaseReady() must be true after successful init');
    });
  });

  describe('closeDatabase — async teardown', () => {
    beforeEach(async () => {
      closeDatabase();
      await createTestDatabase();
      await initDatabase(PG_TEST_CONNECTION);
    });

    after(async () => {
      await destroyTestDatabase();
    });

    it('returns a Promise (is async)', async () => {
      const result = closeDatabase();
      assert.ok(
        result instanceof Promise,
        'closeDatabase() must return a Promise in the PG implementation'
      );
      await result;
    });

    it('isDatabaseReady returns false after closeDatabase resolves', async () => {
      await closeDatabase();
      assert.strictEqual(isDatabaseReady(), false,
        'isDatabaseReady() must be false after pool is closed');
    });

    it('calling closeDatabase twice does not throw', async () => {
      await closeDatabase();
      await assert.doesNotReject(
        () => closeDatabase(),
        'Second closeDatabase() call must be a no-op and must not throw'
      );
    });
  });
});

describe('Core CRUD — saveJob, getJobById, getJobCount', () => {
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
    // Reset the database.ts pool to a fresh in-memory PGlite for each test.
    // truncateJobs() clears the pg-test-helper's separate client; we must also
    // reset the pool used by saveJob/getJobById/getJobCount.
    await closeDatabase();
    await initDatabase('pglite://memory');
    await truncateJobs();
  });

  it('saveJob — full fields roundtrip: camelCase fields returned correctly by getJobById', async () => {
    const createdAt = '2026-01-01T10:00:00.000Z';
    const startedAt = '2026-01-01T10:00:01.000Z';
    const completedAt = '2026-01-01T10:05:00.000Z';

    await saveJob({
      id: 'crud-full-001',
      pipelineId: 'test-pipeline',
      status: 'completed',
      createdAt,
      startedAt,
      completedAt,
      data: { key: 'value' },
      result: { output: 42 },
    });

    const job = await getJobById('crud-full-001');

    assert.ok(job !== null, 'getJobById must return a job after saveJob');
    assert.strictEqual(job.id, 'crud-full-001');
    assert.strictEqual(job.pipelineId, 'test-pipeline', 'pipelineId must be camelCase');
    assert.strictEqual(job.status, 'completed');
    assert.strictEqual(job.createdAt, createdAt, 'createdAt must be preserved');
    assert.strictEqual(job.startedAt, startedAt, 'startedAt must be preserved');
    assert.strictEqual(job.completedAt, completedAt, 'completedAt must be preserved');
  });

  it('saveJob — minimal fields: pipelineId defaults to "unknown" and createdAt is auto-generated', async () => {
    const before = new Date();

    await saveJob({
      id: 'crud-minimal-001',
      status: 'queued',
    });

    const after = new Date();
    const job = await getJobById('crud-minimal-001');

    assert.ok(job !== null, 'getJobById must return a job after minimal saveJob');
    assert.strictEqual(job.pipelineId, 'unknown', 'pipelineId must default to "unknown"');
    assert.ok(typeof job.createdAt === 'string' && job.createdAt.length > 0,
      'createdAt must be auto-generated as a non-empty string');

    const createdDate = new Date(job.createdAt);
    assert.ok(
      createdDate >= before && createdDate <= after,
      `auto-generated createdAt must be within test execution window, got: ${job.createdAt}`
    );
  });

  it('saveJob — upsert: second save with same ID overwrites status', async () => {
    await saveJob({ id: 'crud-upsert-001', status: 'queued' });
    await saveJob({ id: 'crud-upsert-001', status: 'completed' });

    const job = await getJobById('crud-upsert-001');

    assert.ok(job !== null, 'getJobById must return a job after upsert');
    assert.strictEqual(job.status, 'completed', 'second saveJob must win on conflict (upsert)');
  });

  it('saveJob — rejects job ID longer than 100 characters', async () => {
    const tooLongId = 'a'.repeat(101);

    await assert.rejects(
      () => saveJob({ id: tooLongId, status: 'queued' }),
      /max 100 chars/,
      'saveJob must throw with /max 100 chars/ for ID > 100 chars'
    );
  });

  it('saveJob — rejects pre-serialized string field that is not valid JSON', async () => {
    await assert.rejects(
      () => saveJob({ id: 'crud-bad-json-001', status: 'queued', data: 'not-valid-json{' }),
      /is a string but not valid JSON/,
      'saveJob must throw with /is a string but not valid JSON/ for invalid JSON string field'
    );
  });

  it('saveJob — accepts pre-serialized valid JSON string fields', async () => {
    await assert.doesNotReject(
      () => saveJob({ id: 'crud-valid-json-str-001', status: 'queued', data: '{"key":"value"}' }),
      'saveJob must accept a pre-serialized valid JSON string for data field'
    );

    const job = await getJobById('crud-valid-json-str-001');
    assert.ok(job !== null, 'job must be retrievable after saving with pre-serialized JSON string');
  });

  it('saveJob — JSON field object roundtrip: data/result/git survive save and retrieve as deep-equal objects', async () => {
    const data = { type: 'scan', repositories: ['repo-a', 'repo-b'] };
    const result = { duplicates: 5, score: 0.87 };
    const git = { branch: 'main', sha: 'abc123' };

    await saveJob({
      id: 'crud-json-roundtrip-001',
      status: 'completed',
      data,
      result,
      git,
    });

    const job = await getJobById('crud-json-roundtrip-001');

    assert.ok(job !== null, 'job must be retrievable');
    assert.deepStrictEqual(job.data, data, 'data field must round-trip through JSON storage');
    assert.deepStrictEqual(job.result, result, 'result field must round-trip through JSON storage');
    assert.deepStrictEqual(job.git, git, 'git field must round-trip through JSON storage');
  });

  it('saveJob — error field: saved error object is parsed into ParsedJobError shape', async () => {
    const error = { message: 'something broke', code: 'ERR_FAIL' };

    await saveJob({
      id: 'crud-error-shape-001',
      status: 'failed',
      error,
    });

    const job = await getJobById('crud-error-shape-001');

    assert.ok(job !== null, 'job must be retrievable');
    assert.ok(job.error !== null, 'error must not be null after saving error object');
    assert.strictEqual(job.error?.message, 'something broke', 'error.message must be preserved');
    assert.strictEqual(job.error?.code, 'ERR_FAIL', 'error.code must be preserved');
  });

  it('getJobById — returns null for non-existent job ID', async () => {
    const result = await getJobById('does-not-exist-xyz-999');

    assert.strictEqual(result, null, 'getJobById must return null for an ID that was never saved');
  });

  it('getJobCount — counts all jobs without status filter', async () => {
    await saveJob({ id: 'crud-count-001', status: 'completed' });
    await saveJob({ id: 'crud-count-002', status: 'failed' });
    await saveJob({ id: 'crud-count-003', status: 'queued' });

    const total = await getJobCount();

    assert.strictEqual(total, 3, 'getJobCount() must return total count of all saved jobs');
  });

  it('getJobCount — counts only jobs matching the status filter', async () => {
    await saveJob({ id: 'crud-count-filter-001', status: 'completed' });
    await saveJob({ id: 'crud-count-filter-002', status: 'completed' });
    await saveJob({ id: 'crud-count-filter-003', status: 'failed' });

    const completedCount = await getJobCount({ status: 'completed' });
    const failedCount = await getJobCount({ status: 'failed' });
    const queuedCount = await getJobCount({ status: 'queued' });

    assert.strictEqual(completedCount, 2, 'getJobCount({ status: "completed" }) must return 2');
    assert.strictEqual(failedCount, 1, 'getJobCount({ status: "failed" }) must return 1');
    assert.strictEqual(queuedCount, 0, 'getJobCount({ status: "queued" }) must return 0 when none saved');
  });
});

// ---------------------------------------------------------------------------
// Query operations: getJobs
// ---------------------------------------------------------------------------

describe('getJobs — pipeline-scoped query', () => {
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
    await closeDatabase();
    await initDatabase('pglite://memory');
    await truncateJobs();
  });

  it('returns only jobs belonging to the requested pipeline, not jobs from other pipelines', async () => {
    await saveJob({ id: 'gj-pipe-a-001', pipelineId: 'pipeline-alpha', status: 'completed', createdAt: '2026-01-01T10:00:00.000Z' });
    await saveJob({ id: 'gj-pipe-a-002', pipelineId: 'pipeline-alpha', status: 'completed', createdAt: '2026-01-01T11:00:00.000Z' });
    await saveJob({ id: 'gj-pipe-b-001', pipelineId: 'pipeline-beta', status: 'completed', createdAt: '2026-01-01T12:00:00.000Z' });

    const result = await getJobs('pipeline-alpha') as import('../../sidequest/core/database.ts').ParsedJob[];

    assert.strictEqual(result.length, 2, 'getJobs must return only jobs from the requested pipeline');
    assert.ok(result.every(j => j.pipelineId === 'pipeline-alpha'), 'all returned jobs must belong to pipeline-alpha');
  });

  it('filters by status option — returns only jobs matching the given status', async () => {
    await saveJob({ id: 'gj-status-001', pipelineId: 'pipeline-status-test', status: 'completed', createdAt: '2026-01-01T10:00:00.000Z' });
    await saveJob({ id: 'gj-status-002', pipelineId: 'pipeline-status-test', status: 'failed', createdAt: '2026-01-01T11:00:00.000Z' });
    await saveJob({ id: 'gj-status-003', pipelineId: 'pipeline-status-test', status: 'completed', createdAt: '2026-01-01T12:00:00.000Z' });

    const result = await getJobs('pipeline-status-test', { status: 'completed' }) as import('../../sidequest/core/database.ts').ParsedJob[];

    assert.strictEqual(result.length, 2, 'getJobs with status filter must return only jobs with that status');
    assert.ok(result.every(j => j.status === 'completed'), 'all returned jobs must have status "completed"');
  });

  it('filters by tab="failed" — returns only failed jobs', async () => {
    await saveJob({ id: 'gj-tab-001', pipelineId: 'pipeline-tab-test', status: 'failed', createdAt: '2026-01-01T10:00:00.000Z' });
    await saveJob({ id: 'gj-tab-002', pipelineId: 'pipeline-tab-test', status: 'completed', createdAt: '2026-01-01T11:00:00.000Z' });
    await saveJob({ id: 'gj-tab-003', pipelineId: 'pipeline-tab-test', status: 'failed', createdAt: '2026-01-01T12:00:00.000Z' });

    const result = await getJobs('pipeline-tab-test', { tab: 'failed' }) as import('../../sidequest/core/database.ts').ParsedJob[];

    assert.strictEqual(result.length, 2, 'getJobs with tab="failed" must return only failed jobs');
    assert.ok(result.every(j => j.status === 'failed'), 'all returned jobs must have status "failed"');
  });

  it('applies limit — returns at most N jobs', async () => {
    await saveJob({ id: 'gj-limit-001', pipelineId: 'pipeline-limit-test', status: 'completed', createdAt: '2026-01-01T10:00:00.000Z' });
    await saveJob({ id: 'gj-limit-002', pipelineId: 'pipeline-limit-test', status: 'completed', createdAt: '2026-01-01T11:00:00.000Z' });
    await saveJob({ id: 'gj-limit-003', pipelineId: 'pipeline-limit-test', status: 'completed', createdAt: '2026-01-01T12:00:00.000Z' });

    const result = await getJobs('pipeline-limit-test', { limit: 2 }) as import('../../sidequest/core/database.ts').ParsedJob[];

    assert.strictEqual(result.length, 2, 'getJobs with limit=2 must return at most 2 jobs');
  });

  it('applies offset — skips the first N jobs', async () => {
    await saveJob({ id: 'gj-offset-001', pipelineId: 'pipeline-offset-test', status: 'completed', createdAt: '2026-01-01T10:00:00.000Z' });
    await saveJob({ id: 'gj-offset-002', pipelineId: 'pipeline-offset-test', status: 'completed', createdAt: '2026-01-01T11:00:00.000Z' });
    await saveJob({ id: 'gj-offset-003', pipelineId: 'pipeline-offset-test', status: 'completed', createdAt: '2026-01-01T12:00:00.000Z' });

    const allJobs = await getJobs('pipeline-offset-test', { limit: 10 }) as import('../../sidequest/core/database.ts').ParsedJob[];
    const withOffset = await getJobs('pipeline-offset-test', { limit: 10, offset: 1 }) as import('../../sidequest/core/database.ts').ParsedJob[];

    assert.strictEqual(withOffset.length, 2, 'getJobs with offset=1 must skip the first job and return 2');
    assert.strictEqual(withOffset[0].id, allJobs[1].id, 'first job with offset=1 must equal second job without offset');
  });

  it('returns { jobs, total } when includeTotal is true', async () => {
    await saveJob({ id: 'gj-total-001', pipelineId: 'pipeline-total-test', status: 'completed', createdAt: '2026-01-01T10:00:00.000Z' });
    await saveJob({ id: 'gj-total-002', pipelineId: 'pipeline-total-test', status: 'completed', createdAt: '2026-01-01T11:00:00.000Z' });

    const result = await getJobs('pipeline-total-test', { includeTotal: true });

    assert.ok(typeof result === 'object' && !Array.isArray(result), 'getJobs with includeTotal=true must return an object, not an array');
    assert.ok('jobs' in result, 'result must have a "jobs" property');
    assert.ok('total' in result, 'result must have a "total" property');
  });

  it('returns an array directly when includeTotal is false', async () => {
    await saveJob({ id: 'gj-noTotal-001', pipelineId: 'pipeline-nototal-test', status: 'completed', createdAt: '2026-01-01T10:00:00.000Z' });

    const result = await getJobs('pipeline-nototal-test', { includeTotal: false });

    assert.ok(Array.isArray(result), 'getJobs with includeTotal=false must return an array');
  });

  it('includeTotal with status filter — total reflects the filter, not all pipeline jobs', async () => {
    await saveJob({ id: 'gj-totalfilter-001', pipelineId: 'pipeline-totalfilter-test', status: 'completed', createdAt: '2026-01-01T10:00:00.000Z' });
    await saveJob({ id: 'gj-totalfilter-002', pipelineId: 'pipeline-totalfilter-test', status: 'completed', createdAt: '2026-01-01T11:00:00.000Z' });
    await saveJob({ id: 'gj-totalfilter-003', pipelineId: 'pipeline-totalfilter-test', status: 'failed', createdAt: '2026-01-01T12:00:00.000Z' });

    const result = await getJobs('pipeline-totalfilter-test', { includeTotal: true, status: 'completed' }) as { jobs: import('../../sidequest/core/database.ts').ParsedJob[]; total: number };

    assert.strictEqual(result.total, 2, 'total must reflect the status-filtered count, not all pipeline jobs');
    assert.strictEqual(result.jobs.length, 2, 'jobs array must contain only the filtered results');
  });

  it('orders by created_at DESC — newest job appears first', async () => {
    await saveJob({ id: 'gj-order-001', pipelineId: 'pipeline-order-test', status: 'completed', createdAt: '2026-01-01T08:00:00.000Z' });
    await saveJob({ id: 'gj-order-002', pipelineId: 'pipeline-order-test', status: 'completed', createdAt: '2026-01-01T10:00:00.000Z' });
    await saveJob({ id: 'gj-order-003', pipelineId: 'pipeline-order-test', status: 'completed', createdAt: '2026-01-01T09:00:00.000Z' });

    const result = await getJobs('pipeline-order-test') as import('../../sidequest/core/database.ts').ParsedJob[];

    assert.strictEqual(result[0].id, 'gj-order-002', 'first result must be the job with the newest created_at');
    assert.strictEqual(result[result.length - 1].id, 'gj-order-001', 'last result must be the job with the oldest created_at');
  });
});

// ---------------------------------------------------------------------------
// Query operations: getAllJobs
// ---------------------------------------------------------------------------

describe('getAllJobs — cross-pipeline query', () => {
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
    await closeDatabase();
    await initDatabase('pglite://memory');
    await truncateJobs();
  });

  it('returns jobs from all pipelines', async () => {
    await saveJob({ id: 'gaj-multi-001', pipelineId: 'pipeline-gaj-x', status: 'completed', createdAt: '2026-01-01T10:00:00.000Z' });
    await saveJob({ id: 'gaj-multi-002', pipelineId: 'pipeline-gaj-y', status: 'completed', createdAt: '2026-01-01T11:00:00.000Z' });
    await saveJob({ id: 'gaj-multi-003', pipelineId: 'pipeline-gaj-z', status: 'completed', createdAt: '2026-01-01T12:00:00.000Z' });

    const result = await getAllJobs();

    assert.strictEqual(result.length, 3, 'getAllJobs must return jobs from all pipelines');
    const pipelineIds = new Set(result.map(j => j.pipelineId));
    assert.strictEqual(pipelineIds.size, 3, 'result must include jobs from all 3 distinct pipelines');
  });

  it('filters by status — returns only jobs matching the given status', async () => {
    await saveJob({ id: 'gaj-status-001', pipelineId: 'pipeline-gaj-status', status: 'failed', createdAt: '2026-01-01T10:00:00.000Z' });
    await saveJob({ id: 'gaj-status-002', pipelineId: 'pipeline-gaj-status', status: 'completed', createdAt: '2026-01-01T11:00:00.000Z' });
    await saveJob({ id: 'gaj-status-003', pipelineId: 'pipeline-gaj-status2', status: 'failed', createdAt: '2026-01-01T12:00:00.000Z' });

    const result = await getAllJobs({ status: 'failed' });

    assert.strictEqual(result.length, 2, 'getAllJobs with status="failed" must return 2 failed jobs');
    assert.ok(result.every(j => j.status === 'failed'), 'all returned jobs must have status "failed"');
  });

  it('applies limit and offset', async () => {
    await saveJob({ id: 'gaj-page-001', pipelineId: 'pipeline-gaj-page', status: 'completed', createdAt: '2026-01-01T10:00:00.000Z' });
    await saveJob({ id: 'gaj-page-002', pipelineId: 'pipeline-gaj-page', status: 'completed', createdAt: '2026-01-01T11:00:00.000Z' });
    await saveJob({ id: 'gaj-page-003', pipelineId: 'pipeline-gaj-page', status: 'completed', createdAt: '2026-01-01T12:00:00.000Z' });
    await saveJob({ id: 'gaj-page-004', pipelineId: 'pipeline-gaj-page', status: 'completed', createdAt: '2026-01-01T13:00:00.000Z' });

    const page1 = await getAllJobs({ limit: 2, offset: 0 });
    const page2 = await getAllJobs({ limit: 2, offset: 2 });

    assert.strictEqual(page1.length, 2, 'first page must contain 2 jobs');
    assert.strictEqual(page2.length, 2, 'second page must contain 2 jobs');
    assert.ok(
      !page1.some(j => page2.some(j2 => j2.id === j.id)),
      'page1 and page2 must not share any job IDs'
    );
  });

  it('sortByCompletedAt — orders by completed_at DESC NULLS LAST, then created_at DESC', async () => {
    await saveJob({ id: 'gaj-sort-001', pipelineId: 'pipeline-gaj-sort', status: 'completed', createdAt: '2026-01-01T10:00:00.000Z', completedAt: '2026-01-01T10:30:00.000Z' });
    await saveJob({ id: 'gaj-sort-002', pipelineId: 'pipeline-gaj-sort', status: 'completed', createdAt: '2026-01-01T08:00:00.000Z', completedAt: '2026-01-01T12:00:00.000Z' });
    await saveJob({ id: 'gaj-sort-003', pipelineId: 'pipeline-gaj-sort', status: 'queued', createdAt: '2026-01-01T13:00:00.000Z' });

    const result = await getAllJobs({ sortByCompletedAt: true });

    assert.strictEqual(result[0].id, 'gaj-sort-002', 'job with latest completed_at must appear first');
    assert.strictEqual(result[result.length - 1].id, 'gaj-sort-003', 'job with null completed_at must appear last (NULLS LAST)');
  });
});

// ---------------------------------------------------------------------------
// Query operations: getJobCounts
// ---------------------------------------------------------------------------

describe('getJobCounts — pipeline aggregate counts', () => {
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
    await closeDatabase();
    await initDatabase('pglite://memory');
    await truncateJobs();
  });

  it('returns correct aggregate counts for total, completed, failed, running, queued', async () => {
    const pipelineId = 'pipeline-counts-test';
    await saveJob({ id: 'gjc-001', pipelineId, status: 'completed', createdAt: '2026-01-01T10:00:00.000Z' });
    await saveJob({ id: 'gjc-002', pipelineId, status: 'completed', createdAt: '2026-01-01T11:00:00.000Z' });
    await saveJob({ id: 'gjc-003', pipelineId, status: 'failed', createdAt: '2026-01-01T12:00:00.000Z' });
    await saveJob({ id: 'gjc-004', pipelineId, status: 'running', createdAt: '2026-01-01T13:00:00.000Z' });
    await saveJob({ id: 'gjc-005', pipelineId, status: 'queued', createdAt: '2026-01-01T14:00:00.000Z' });

    const counts = await getJobCounts(pipelineId);

    assert.ok(counts !== null, 'getJobCounts must return a non-null result when jobs exist');
    assert.strictEqual(counts.total, 5, 'total must be 5');
    assert.strictEqual(counts.completed, 2, 'completed must be 2');
    assert.strictEqual(counts.failed, 1, 'failed must be 1');
    assert.strictEqual(counts.running, 1, 'running must be 1');
    assert.strictEqual(counts.queued, 1, 'queued must be 1');
  });

  it('returns zero counts for a pipeline that has no jobs', async () => {
    const counts = await getJobCounts('pipeline-does-not-exist-xyz');

    assert.ok(counts !== null, 'getJobCounts must return a row (COUNT aggregation always produces a row)');
    assert.strictEqual(counts.total, 0, 'total must be 0 for a non-existent pipeline');
    assert.strictEqual(counts.completed, 0, 'completed must be 0 for a non-existent pipeline');
    assert.strictEqual(counts.failed, 0, 'failed must be 0 for a non-existent pipeline');
    assert.strictEqual(counts.running, 0, 'running must be 0 for a non-existent pipeline');
    assert.strictEqual(counts.queued, 0, 'queued must be 0 for a non-existent pipeline');
  });
});

// ---------------------------------------------------------------------------
// Query operations: getLastJob
// ---------------------------------------------------------------------------

describe('getLastJob — most recent pipeline job', () => {
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
    await closeDatabase();
    await initDatabase('pglite://memory');
    await truncateJobs();
  });

  it('returns the most recent job ordered by created_at DESC', async () => {
    const pipelineId = 'pipeline-lastjob-test';
    await saveJob({ id: 'glj-oldest', pipelineId, status: 'completed', createdAt: '2026-01-01T08:00:00.000Z' });
    await saveJob({ id: 'glj-newest', pipelineId, status: 'completed', createdAt: '2026-01-01T12:00:00.000Z' });
    await saveJob({ id: 'glj-middle', pipelineId, status: 'failed', createdAt: '2026-01-01T10:00:00.000Z' });

    const job = await getLastJob(pipelineId);

    assert.ok(job !== null, 'getLastJob must return a job when jobs exist for the pipeline');
    assert.strictEqual(job.id, 'glj-newest', 'getLastJob must return the job with the most recent created_at');
  });

  it('returns null for a pipeline that has no jobs', async () => {
    const job = await getLastJob('pipeline-never-existed-xyz');

    assert.strictEqual(job, null, 'getLastJob must return null when no jobs exist for the pipeline');
  });

  it('parses JSON fields correctly — data and result are objects, not strings', async () => {
    const pipelineId = 'pipeline-lastjob-json';
    const data = { scanType: 'inter-project', count: 7 };
    const result = { duplicates: 3 };

    await saveJob({ id: 'glj-json-001', pipelineId, status: 'completed', createdAt: '2026-01-01T10:00:00.000Z', data, result });

    const job = await getLastJob(pipelineId);

    assert.ok(job !== null, 'job must be returned');
    assert.deepStrictEqual(job.data, data, 'data must be parsed back to its original object shape');
    assert.deepStrictEqual(job.result, result, 'result must be parsed back to its original object shape');
  });
});

// ---------------------------------------------------------------------------
// Query operations: getAllPipelineStats
// ---------------------------------------------------------------------------

describe('getAllPipelineStats — cross-pipeline aggregate statistics', () => {
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
    await closeDatabase();
    await initDatabase('pglite://memory');
    await truncateJobs();
  });

  it('returns stats for all pipelines with correct field names: pipelineId, total, completed, failed, running, queued, lastRun', async () => {
    await saveJob({ id: 'gps-alpha-001', pipelineId: 'pipeline-gps-alpha', status: 'completed', createdAt: '2026-01-01T10:00:00.000Z', completedAt: '2026-01-01T10:05:00.000Z' });
    await saveJob({ id: 'gps-alpha-002', pipelineId: 'pipeline-gps-alpha', status: 'failed', createdAt: '2026-01-01T11:00:00.000Z' });
    await saveJob({ id: 'gps-beta-001', pipelineId: 'pipeline-gps-beta', status: 'queued', createdAt: '2026-01-01T12:00:00.000Z' });

    const stats = await getAllPipelineStats();

    assert.ok(stats.length >= 2, 'must return at least 2 pipeline rows');

    const alpha = stats.find(s => s.pipelineId === 'pipeline-gps-alpha');
    assert.ok(alpha !== undefined, 'stats for pipeline-gps-alpha must be present');
    assert.ok('pipelineId' in alpha, 'stat row must have pipelineId field');
    assert.ok('total' in alpha, 'stat row must have total field');
    assert.ok('completed' in alpha, 'stat row must have completed field');
    assert.ok('failed' in alpha, 'stat row must have failed field');
    assert.ok('running' in alpha, 'stat row must have running field');
    assert.ok('queued' in alpha, 'stat row must have queued field');
    assert.ok('lastRun' in alpha, 'stat row must have lastRun field');

    assert.strictEqual(alpha.total, 2, 'pipeline-gps-alpha total must be 2');
    assert.strictEqual(alpha.completed, 1, 'pipeline-gps-alpha completed must be 1');
    assert.strictEqual(alpha.failed, 1, 'pipeline-gps-alpha failed must be 1');
  });

  it('lastRun is the MAX(completed_at) for each pipeline', async () => {
    const pipelineId = 'pipeline-gps-lastrun';
    await saveJob({ id: 'gps-lr-001', pipelineId, status: 'completed', createdAt: '2026-01-01T08:00:00.000Z', completedAt: '2026-01-01T08:10:00.000Z' });
    await saveJob({ id: 'gps-lr-002', pipelineId, status: 'completed', createdAt: '2026-01-01T10:00:00.000Z', completedAt: '2026-01-02T15:00:00.000Z' });
    await saveJob({ id: 'gps-lr-003', pipelineId, status: 'completed', createdAt: '2026-01-01T12:00:00.000Z', completedAt: '2026-01-01T12:20:00.000Z' });

    const stats = await getAllPipelineStats();
    const row = stats.find(s => s.pipelineId === pipelineId);

    assert.ok(row !== undefined, 'pipeline stats row must exist');
    assert.strictEqual(
      row.lastRun,
      '2026-01-02T15:00:00.000Z',
      'lastRun must equal the MAX(completed_at) across all pipeline jobs'
    );
  });
});

// ---------------------------------------------------------------------------
// Bulk operations: bulkImportJobs, bulkCancelJobsByPipeline
// ---------------------------------------------------------------------------

describe('Bulk operations — bulkImportJobs, bulkCancelJobsByPipeline', () => {
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
    await closeDatabase();
    await initDatabase('pglite://memory');
    await truncateJobs();
  });

  // --- bulkImportJobs ---

  it('bulkImportJobs — imports valid jobs and returns imported count matching input length', async () => {
    const ts = Date.now();
    const jobs: BulkImportJob[] = [
      { id: `bulk-valid-${ts}-0`, pipelineId: 'pipeline-bulk', status: 'completed' },
      { id: `bulk-valid-${ts}-1`, pipelineId: 'pipeline-bulk', status: 'queued' },
      { id: `bulk-valid-${ts}-2`, pipelineId: 'pipeline-bulk', status: 'failed' },
    ];

    const result = await bulkImportJobs(jobs);

    assert.strictEqual(result.imported, 3,
      'imported count must equal the number of valid jobs submitted');
    assert.strictEqual(result.skipped, 0, 'skipped must be 0 when no duplicates exist');
    assert.strictEqual(result.errors.length, 0, 'errors must be empty for all-valid input');
  });

  it('bulkImportJobs — skips jobs with invalid ID format and records error with "Invalid job ID format"', async () => {
    const ts = Date.now();
    const jobs: BulkImportJob[] = [
      { id: 'invalid id with spaces', pipelineId: 'pipeline-bulk', status: 'queued' },
      { id: `bulk-valid-id-${ts}`, pipelineId: 'pipeline-bulk', status: 'queued' },
    ];

    const result = await bulkImportJobs(jobs);

    assert.strictEqual(result.errors.length, 1,
      'exactly one error must be recorded for the invalid-ID job');
    assert.ok(
      result.errors[0].includes('Invalid job ID format'),
      `error message must include "Invalid job ID format", got: ${result.errors[0]}`
    );
    assert.strictEqual(result.imported, 1,
      'valid job must still be imported despite the invalid-ID entry');
  });

  it('bulkImportJobs — skips jobs with invalid status and records error including "Invalid status"', async () => {
    const ts = Date.now();
    const jobs: BulkImportJob[] = [
      { id: `bulk-bad-status-${ts}`, pipelineId: 'pipeline-bulk', status: 'nonsense-status' },
    ];

    const result = await bulkImportJobs(jobs);

    assert.strictEqual(result.imported, 0, 'no jobs must be imported when status is invalid');
    assert.strictEqual(result.errors.length, 1, 'one error must be recorded for the invalid-status job');
    assert.ok(
      result.errors[0].includes('Invalid status'),
      `error message must include "Invalid status", got: ${result.errors[0]}`
    );
  });

  it('bulkImportJobs — skips jobs where a JSON field is a non-JSON string and records "is a string but not valid JSON"', async () => {
    const ts = Date.now();
    const jobs: BulkImportJob[] = [
      {
        id: `bulk-bad-json-${ts}`,
        pipelineId: 'pipeline-bulk',
        status: 'completed',
        data: 'this is {not valid json',
      },
    ];

    const result = await bulkImportJobs(jobs);

    assert.strictEqual(result.imported, 0, 'job with invalid JSON string field must not be imported');
    assert.strictEqual(result.errors.length, 1, 'one error must be recorded for the bad-JSON field');
    assert.ok(
      result.errors[0].includes('is a string but not valid JSON'),
      `error must include "is a string but not valid JSON", got: ${result.errors[0]}`
    );
  });

  it('bulkImportJobs — skips duplicate jobs (same ID submitted twice) and increments skipped count', async () => {
    const ts = Date.now();
    const id = `bulk-dup-${ts}`;
    const jobs: BulkImportJob[] = [
      { id, pipelineId: 'pipeline-bulk', status: 'queued' },
      { id, pipelineId: 'pipeline-bulk', status: 'completed' },
    ];

    const result = await bulkImportJobs(jobs);

    assert.strictEqual(result.imported, 1, 'first occurrence must be imported');
    assert.strictEqual(result.skipped, 1, 'second occurrence with same ID must be skipped');
    assert.strictEqual(result.errors.length, 0, 'duplicates are skipped, not errored');
  });

  it('bulkImportJobs — mix of valid, invalid ID, invalid status returns correct imported/skipped/errors counts', async () => {
    const ts = Date.now();
    const jobs: BulkImportJob[] = [
      { id: `bulk-mix-valid-${ts}`, pipelineId: 'pipeline-bulk', status: 'queued' },
      { id: 'bad id!', pipelineId: 'pipeline-bulk', status: 'queued' },
      { id: `bulk-mix-bad-status-${ts}`, pipelineId: 'pipeline-bulk', status: 'unknown-status' },
    ];

    const result = await bulkImportJobs(jobs);

    assert.strictEqual(result.imported, 1, 'only the valid job must be imported');
    assert.strictEqual(result.skipped, 0, 'no duplicates in this batch');
    assert.strictEqual(result.errors.length, 2, 'two errors: one for bad ID, one for bad status');
  });

  it('bulkImportJobs — accepts snake_case field names (pipeline_id, created_at) and imports successfully', async () => {
    const ts = Date.now();
    const id = `bulk-snake-${ts}`;
    const jobs: BulkImportJob[] = [
      {
        id,
        pipeline_id: 'pipeline-snake',
        status: 'completed',
        created_at: '2026-01-01T10:00:00.000Z',
      },
    ];

    const result = await bulkImportJobs(jobs);

    assert.strictEqual(result.imported, 1, 'job using snake_case fields must be imported');
    assert.strictEqual(result.errors.length, 0, 'no errors expected for snake_case fields');

    const saved = await getJobById(id);
    assert.ok(saved !== null, 'saved job must be retrievable by ID');
    assert.strictEqual(saved.pipelineId, 'pipeline-snake',
      'pipeline_id must be stored and returned as pipelineId');
  });

  it('bulkImportJobs — accepts camelCase field names (pipelineId, createdAt) and imports successfully', async () => {
    const ts = Date.now();
    const id = `bulk-camel-${ts}`;
    const jobs: BulkImportJob[] = [
      {
        id,
        pipelineId: 'pipeline-camel',
        status: 'completed',
        createdAt: '2026-01-01T11:00:00.000Z',
      },
    ];

    const result = await bulkImportJobs(jobs);

    assert.strictEqual(result.imported, 1, 'job using camelCase fields must be imported');
    assert.strictEqual(result.errors.length, 0, 'no errors expected for camelCase fields');

    const saved = await getJobById(id);
    assert.ok(saved !== null, 'saved job must be retrievable by ID');
    assert.strictEqual(saved.createdAt, '2026-01-01T11:00:00.000Z',
      'createdAt must be stored and returned correctly');
  });

  // --- bulkCancelJobsByPipeline ---

  it('bulkCancelJobsByPipeline — cancels queued jobs for the pipeline and returns the correct count', async () => {
    const ts = Date.now();
    const pipelineId = `pipeline-cancel-${ts}`;

    await saveJob({ id: `cancel-q-${ts}-0`, pipelineId, status: 'queued' });
    await saveJob({ id: `cancel-q-${ts}-1`, pipelineId, status: 'queued' });

    const count = await bulkCancelJobsByPipeline(pipelineId, ['queued'] as JobStatus[]);

    assert.strictEqual(count, 2, 'must return 2 — the number of queued jobs cancelled');

    const j0 = await getJobById(`cancel-q-${ts}-0`);
    const j1 = await getJobById(`cancel-q-${ts}-1`);
    assert.strictEqual(j0?.status, 'cancelled', 'first job status must be "cancelled"');
    assert.strictEqual(j1?.status, 'cancelled', 'second job status must be "cancelled"');
  });

  it('bulkCancelJobsByPipeline — cancels both queued and running jobs when both statuses are provided', async () => {
    const ts = Date.now();
    const pipelineId = `pipeline-cancel-multi-${ts}`;

    await saveJob({ id: `cancel-m-${ts}-q`, pipelineId, status: 'queued' });
    await saveJob({ id: `cancel-m-${ts}-r`, pipelineId, status: 'running' });
    await saveJob({ id: `cancel-m-${ts}-c`, pipelineId, status: 'completed' });

    const count = await bulkCancelJobsByPipeline(pipelineId, ['queued', 'running'] as JobStatus[]);

    assert.strictEqual(count, 2, 'must return 2 — queued and running jobs cancelled, completed untouched');

    const completed = await getJobById(`cancel-m-${ts}-c`);
    assert.strictEqual(completed?.status, 'completed',
      'completed job must remain completed — not cancelled');
  });

  it('bulkCancelJobsByPipeline — returns 0 when no jobs match the given statuses', async () => {
    const ts = Date.now();
    const pipelineId = `pipeline-cancel-nomatch-${ts}`;

    await saveJob({ id: `cancel-nm-${ts}`, pipelineId, status: 'completed' });

    const count = await bulkCancelJobsByPipeline(pipelineId, ['queued'] as JobStatus[]);

    assert.strictEqual(count, 0,
      'must return 0 when no jobs in the pipeline have the requested status');
  });

  it('bulkCancelJobsByPipeline — returns 0 immediately when statuses array is empty', async () => {
    const ts = Date.now();
    const pipelineId = `pipeline-cancel-empty-${ts}`;

    await saveJob({ id: `cancel-e-${ts}`, pipelineId, status: 'queued' });

    const count = await bulkCancelJobsByPipeline(pipelineId, [] as JobStatus[]);

    assert.strictEqual(count, 0,
      'must return 0 without touching any jobs when statuses array is empty');

    const job = await getJobById(`cancel-e-${ts}`);
    assert.strictEqual(job?.status, 'queued',
      'job must remain queued when empty statuses array was passed');
  });

  it('bulkCancelJobsByPipeline — does not cancel jobs belonging to other pipelines', async () => {
    const ts = Date.now();
    const targetPipeline = `pipeline-cancel-target-${ts}`;
    const otherPipeline = `pipeline-cancel-other-${ts}`;

    await saveJob({ id: `cancel-t-${ts}`, pipelineId: targetPipeline, status: 'queued' });
    await saveJob({ id: `cancel-o-${ts}`, pipelineId: otherPipeline, status: 'queued' });

    const count = await bulkCancelJobsByPipeline(targetPipeline, ['queued'] as JobStatus[]);

    assert.strictEqual(count, 1, 'must return 1 — only target pipeline job cancelled');

    const otherJob = await getJobById(`cancel-o-${ts}`);
    assert.strictEqual(otherJob?.status, 'queued',
      'job from other pipeline must remain queued — only target pipeline is affected');
  });
});

// ---------------------------------------------------------------------------
// importReportsToDatabase
// ---------------------------------------------------------------------------

describe('importReportsToDatabase — import *-summary.json files', () => {
  let tempDir: string;

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
    await closeDatabase();
    await initDatabase('pglite://memory');
    await truncateJobs();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-reports-'));
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('returns 0 for a non-existent directory', async () => {
    const nonExistent = path.join(os.tmpdir(), 'does-not-exist-xyz-reports-12345');
    const result = await importReportsToDatabase(nonExistent);
    assert.strictEqual(result, 0,
      'importReportsToDatabase must return 0 when the directory does not exist');
  });

  it('returns 0 for an empty directory', async () => {
    const result = await importReportsToDatabase(tempDir);
    assert.strictEqual(result, 0,
      'importReportsToDatabase must return 0 when the directory contains no *-summary.json files');
  });

  it('imports a single *-summary.json file and returns 1', async () => {
    const summaryContent = JSON.stringify({
      scanType: 'inter-project',
      repositories: ['repo-a'],
      totalDuplicates: 3,
      totalBlocks: 10,
    });
    fs.writeFileSync(path.join(tempDir, 'scan-2025-06-15-summary.json'), summaryContent, 'utf8');

    const result = await importReportsToDatabase(tempDir);
    assert.strictEqual(result, 1,
      'importReportsToDatabase must return 1 after importing one summary file');
  });

  it('skips already-imported reports — second import of same directory returns 0', async () => {
    const summaryContent = JSON.stringify({ scanType: 'inter-project', repositories: [] });
    fs.writeFileSync(path.join(tempDir, 'scan-2025-07-01-summary.json'), summaryContent, 'utf8');

    const first = await importReportsToDatabase(tempDir);
    const second = await importReportsToDatabase(tempDir);

    assert.strictEqual(first, 1, 'first import must return 1');
    assert.strictEqual(second, 0,
      'second import of the same file must return 0 — already imported');
  });

  it('extracts date from filename — createdAt includes the date from the filename', async () => {
    const summaryContent = JSON.stringify({ scanType: 'inter-project', repositories: [] });
    fs.writeFileSync(path.join(tempDir, 'scan-2025-06-15-summary.json'), summaryContent, 'utf8');

    await importReportsToDatabase(tempDir);

    const jobs = await getAllJobs({ status: 'completed' });
    const imported = jobs.find(j => j.pipelineId === 'duplicate-detection');
    assert.ok(imported !== undefined, 'an imported duplicate-detection job must exist');
    assert.ok(
      imported.createdAt.includes('2025-06-15'),
      `createdAt must include '2025-06-15' extracted from filename, got: ${imported.createdAt}`
    );
  });

  it('handles malformed JSON gracefully — returns 0 and does not throw', async () => {
    fs.writeFileSync(path.join(tempDir, 'scan-2025-08-01-summary.json'), 'not valid {json', 'utf8');

    await assert.doesNotReject(
      () => importReportsToDatabase(tempDir),
      'importReportsToDatabase must not throw for a file with malformed JSON'
    );

    const result = await importReportsToDatabase(tempDir);
    assert.strictEqual(result, 0,
      'importReportsToDatabase must return 0 when the only file has malformed JSON');
  });
});

// ---------------------------------------------------------------------------
// importLogsToDatabase
// ---------------------------------------------------------------------------

describe('importLogsToDatabase — import *.json log files', () => {
  let tempDir: string;

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
    await closeDatabase();
    await initDatabase('pglite://memory');
    await truncateJobs();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-reports-'));
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('returns 0 for a non-existent directory', async () => {
    const nonExistent = path.join(os.tmpdir(), 'does-not-exist-xyz-logs-12345');
    const result = await importLogsToDatabase(nonExistent);
    assert.strictEqual(result, 0,
      'importLogsToDatabase must return 0 when the directory does not exist');
  });

  it('returns 0 for an empty directory', async () => {
    const result = await importLogsToDatabase(tempDir);
    assert.strictEqual(result, 0,
      'importLogsToDatabase must return 0 when the directory contains no .json files');
  });

  it('imports a git-activity log file and returns 1', async () => {
    const logContent = JSON.stringify({ startTime: '2025-06-01T10:00:00.000Z', result: { commits: 5 } });
    fs.writeFileSync(path.join(tempDir, 'git-activity-2025-06-01.json'), logContent, 'utf8');

    const result = await importLogsToDatabase(tempDir);
    assert.strictEqual(result, 1,
      'importLogsToDatabase must return 1 after importing one log file');
  });

  it('imports a claude-health log file and returns 1', async () => {
    const logContent = JSON.stringify({ startTime: '2025-06-02T10:00:00.000Z', result: { status: 'ok' } });
    fs.writeFileSync(path.join(tempDir, 'claude-health-2025-06-02.json'), logContent, 'utf8');

    const result = await importLogsToDatabase(tempDir);
    assert.strictEqual(result, 1,
      'importLogsToDatabase must return 1 after importing one claude-health log file');
  });

  it('marks logs with an error field as status="failed"', async () => {
    const logContent = JSON.stringify({
      startTime: '2025-06-03T10:00:00.000Z',
      error: { message: 'pipeline failed', code: 'ERR_PIPE' },
    });
    fs.writeFileSync(path.join(tempDir, 'git-activity-2025-06-03-failed.json'), logContent, 'utf8');

    await importLogsToDatabase(tempDir);

    const jobs = await getAllJobs();
    const imported = jobs.find(j => j.pipelineId === 'git-activity');
    assert.ok(imported !== undefined, 'imported git-activity job must exist');
    assert.strictEqual(imported.status, 'failed',
      'job must have status "failed" when the log content contains an error field');
  });

  it('skips already-imported logs — second import of same directory returns 0', async () => {
    const logContent = JSON.stringify({ startTime: '2025-06-04T10:00:00.000Z', result: {} });
    fs.writeFileSync(path.join(tempDir, 'git-activity-2025-06-04.json'), logContent, 'utf8');

    const first = await importLogsToDatabase(tempDir);
    const second = await importLogsToDatabase(tempDir);

    assert.strictEqual(first, 1, 'first import must return 1');
    assert.strictEqual(second, 0,
      'second import of the same file must return 0 — already imported');
  });

  it('maps git-activity prefix to pipeline ID "git-activity"', async () => {
    const logContent = JSON.stringify({ startTime: '2025-06-05T10:00:00.000Z', result: {} });
    fs.writeFileSync(path.join(tempDir, 'git-activity-2025-06-05.json'), logContent, 'utf8');

    await importLogsToDatabase(tempDir);

    const jobs = await getAllJobs();
    const imported = jobs.find(j => j.pipelineId === 'git-activity');
    assert.ok(imported !== undefined,
      'git-activity log must be imported with pipelineId "git-activity"');
  });

  it('maps claude-health prefix to pipeline ID "claude-health"', async () => {
    const logContent = JSON.stringify({ startTime: '2025-06-06T10:00:00.000Z', result: {} });
    fs.writeFileSync(path.join(tempDir, 'claude-health-2025-06-06.json'), logContent, 'utf8');

    await importLogsToDatabase(tempDir);

    const jobs = await getAllJobs();
    const imported = jobs.find(j => j.pipelineId === 'claude-health');
    assert.ok(imported !== undefined,
      'claude-health log must be imported with pipelineId "claude-health"');
  });

  it('maps plugin-audit prefix to pipeline ID "plugin-manager"', async () => {
    const logContent = JSON.stringify({ startTime: '2025-06-07T10:00:00.000Z', result: {} });
    fs.writeFileSync(path.join(tempDir, 'plugin-audit-2025-06-07.json'), logContent, 'utf8');

    await importLogsToDatabase(tempDir);

    const jobs = await getAllJobs();
    const imported = jobs.find(j => j.pipelineId === 'plugin-manager');
    assert.ok(imported !== undefined,
      'plugin-audit log must be imported with pipelineId "plugin-manager"');
  });

  it('maps gitignore prefix to pipeline ID "gitignore-manager"', async () => {
    const logContent = JSON.stringify({ startTime: '2025-06-08T10:00:00.000Z', result: {} });
    fs.writeFileSync(path.join(tempDir, 'gitignore-2025-06-08.json'), logContent, 'utf8');

    await importLogsToDatabase(tempDir);

    const jobs = await getAllJobs();
    const imported = jobs.find(j => j.pipelineId === 'gitignore-manager');
    assert.ok(imported !== undefined,
      'gitignore log must be imported with pipelineId "gitignore-manager"');
  });

  it('uses "unknown" pipeline ID for unrecognized filename prefixes', async () => {
    const logContent = JSON.stringify({ startTime: '2025-06-09T10:00:00.000Z', result: {} });
    fs.writeFileSync(path.join(tempDir, 'mystery-pipeline-2025-06-09.json'), logContent, 'utf8');

    await importLogsToDatabase(tempDir);

    const jobs = await getAllJobs();
    const imported = jobs.find(j => j.pipelineId === 'unknown');
    assert.ok(imported !== undefined,
      'log with unrecognized prefix must be imported with pipelineId "unknown"');
  });
});

// ---------------------------------------------------------------------------
// getHealthStatus
// ---------------------------------------------------------------------------

describe('getHealthStatus — sync health snapshot', () => {
  before(async () => {
    await closeDatabase();
    await createTestDatabase();
    await initDatabase('pglite://memory');
  });

  after(async () => {
    await closeDatabase();
    await destroyTestDatabase();
  });

  it('returns initialized=true and status="healthy" when pool is active', async () => {
    const health = getHealthStatus();

    assert.strictEqual(health.initialized, true,
      'initialized must be true when the pool has been init\'d');
    assert.strictEqual(health.status, 'healthy',
      'status must be "healthy" when the pool is active');
  });

  it('returns initialized=false and status="not_initialized" when pool is closed', async () => {
    await closeDatabase();

    const health = getHealthStatus();

    assert.strictEqual(health.initialized, false,
      'initialized must be false after closeDatabase()');
    assert.strictEqual(health.status, 'not_initialized',
      'status must be "not_initialized" when no pool exists');

    // Re-init so the after() hook can close cleanly
    await initDatabase('pglite://memory');
  });
});

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

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  createTestDatabase,
  destroyTestDatabase,
  getTestClient,
} from '../fixtures/pg-test-helper.ts';
import {
  initDatabase,
  closeDatabase,
  isDatabaseReady,
} from '../../sidequest/core/database.ts';

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

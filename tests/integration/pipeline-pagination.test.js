/**
 * Pipeline Pagination Integration Tests
 *
 * Tests pagination functionality for pipeline job listings against the actual database:
 * - Total count matches database COUNT(*)
 * - Different limit/offset combinations work correctly
 * - Status filters apply properly
 * - hasMore flag accuracy
 *
 * Note: Uses the actual database at data/jobs.db (not a test database)
 * These tests verify the pagination fixes are working correctly.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getJobs, initDatabase } from '../../sidequest/core/database.js';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../../data/jobs.db');

describe('Pipeline Pagination Integration Tests', () => {
  // Initialize database
  initDatabase();

  // Get direct database connection for verification queries
  const db = new Database(DB_PATH);

  it('should return total count matching database COUNT(*)', () => {
    const result = getJobs('duplicate-detection', {
      limit: 5,
      offset: 0,
      includeTotal: true
    });

    // Verify total matches actual database count
    const dbCount = db.prepare('SELECT COUNT(*) as count FROM jobs WHERE pipeline_id = ?')
      .get('duplicate-detection').count;

    assert.ok(result.total !== undefined, 'Should return total property');
    assert.strictEqual(result.total, dbCount, `Total (${result.total}) should match database COUNT(*) (${dbCount})`);
    assert.ok(result.jobs.length <= 5, 'Should return at most 5 jobs with limit=5');
    assert.ok(Array.isArray(result.jobs), 'Jobs should be an array');
  });

  it('should handle different limit/offset combinations', () => {
    // Get total first
    const totalCount = db.prepare('SELECT COUNT(*) as count FROM jobs WHERE pipeline_id = ?')
      .get('duplicate-detection').count;

    if (totalCount === 0) {
      // Skip test if no data
      return;
    }

    // Page 1
    const page1 = getJobs('duplicate-detection', {
      limit: 3,
      offset: 0,
      includeTotal: true
    });

    assert.ok(page1.jobs.length <= 3, 'Page 1 should have at most 3 jobs');
    assert.strictEqual(page1.total, totalCount, 'Page 1 total should match database');

    // Page 2
    const page2 = getJobs('duplicate-detection', {
      limit: 3,
      offset: 3,
      includeTotal: true
    });

    assert.strictEqual(page2.total, totalCount, 'Page 2 total should match database');

    // Verify total is consistent
    assert.strictEqual(page1.total, page2.total, 'Total should be consistent across pages');

    // Verify no duplicate jobs if both pages have jobs
    if (page1.jobs.length > 0 && page2.jobs.length > 0) {
      const page1Ids = page1.jobs.map(j => j.id);
      const page2Ids = page2.jobs.map(j => j.id);

      const allIds = [...page1Ids, ...page2Ids];
      const uniqueIds = new Set(allIds);

      assert.strictEqual(allIds.length, uniqueIds.size, 'Should not have duplicate jobs across pages');
    }
  });

  it('should filter by status correctly', () => {
    // Get database counts for each status
    const completedCount = db.prepare('SELECT COUNT(*) as count FROM jobs WHERE pipeline_id = ? AND status = ?')
      .get('duplicate-detection', 'completed').count;

    if (completedCount > 0) {
      const completed = getJobs('duplicate-detection', {
        status: 'completed',
        limit: 20,
        offset: 0,
        includeTotal: true
      });

      assert.strictEqual(completed.total, completedCount, 'Completed total should match database');
      assert.ok(completed.jobs.every(j => j.status === 'completed'), 'All jobs should be completed');
    }
  });

  it('should calculate hasMore flag correctly based on limit', () => {
    const totalCount = db.prepare('SELECT COUNT(*) as count FROM jobs WHERE pipeline_id = ?')
      .get('duplicate-detection').count;

    if (totalCount === 0) {
      return;
    }

    // Test with small limit - should have more if total > limit
    const smallLimit = Math.min(2, totalCount);
    const page1 = getJobs('duplicate-detection', {
      limit: smallLimit,
      offset: 0,
      includeTotal: true
    });

    // hasMore is true when jobs.length === limit (meaning there might be more)
    const expectedHasMore = totalCount > smallLimit;
    const actualHasMore = page1.jobs.length === smallLimit;

    if (expectedHasMore) {
      assert.strictEqual(actualHasMore, true, `Should have more when total (${totalCount}) > limit (${smallLimit})`);
    }
  });

  it('should handle edge cases (empty results, large offsets)', () => {
    const totalCount = db.prepare('SELECT COUNT(*) as count FROM jobs WHERE pipeline_id = ?')
      .get('duplicate-detection').count;

    // Offset beyond total
    const beyond = getJobs('duplicate-detection', {
      limit: 10,
      offset: totalCount + 100,
      includeTotal: true
    });

    assert.strictEqual(beyond.jobs.length, 0, 'Should return empty array when offset > total');
    assert.strictEqual(beyond.total, totalCount, 'Total should still be accurate');

    // Very large limit
    const large = getJobs('duplicate-detection', {
      limit: 10000,
      offset: 0,
      includeTotal: true
    });

    assert.strictEqual(large.jobs.length, totalCount, 'Should return all jobs with large limit');
    assert.strictEqual(large.total, totalCount, 'Total should be accurate with large limit');
  });

  it('should maintain consistent total across pagination', () => {
    const totalCount = db.prepare('SELECT COUNT(*) as count FROM jobs WHERE pipeline_id = ?')
      .get('duplicate-detection').count;

    if (totalCount === 0) {
      return;
    }

    const totals = [];

    // Get total from multiple pages
    const limit = Math.min(3, totalCount);
    for (let offset = 0; offset < totalCount; offset += limit) {
      const result = getJobs('duplicate-detection', {
        limit,
        offset,
        includeTotal: true
      });

      totals.push(result.total);
    }

    // All totals should be the same
    const uniqueTotals = new Set(totals);
    assert.strictEqual(uniqueTotals.size, 1, 'Total should be consistent across all pages');
    assert.strictEqual(totals[0], totalCount, `Total should always be ${totalCount}`);
  });
});

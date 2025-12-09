/**
 * Pipeline Pagination Integration Tests
 *
 * Tests pagination functionality for pipeline job listings:
 * - Total count consistency across pages
 * - Different limit/offset combinations work correctly
 * - Status filters apply properly
 * - hasMore flag accuracy
 * - No duplicate jobs across pages
 *
 * Note: Uses the sql.js in-memory database via the database module.
 * Tests verify internal consistency of the pagination system.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { getJobs, initDatabase, getJobCounts, closeDatabase } from '../../sidequest/core/database.js';

describe('Pipeline Pagination Integration Tests', () => {
  // Initialize database BEFORE tests run (async)
  before(async () => {
    await initDatabase();
  });

  // Close database AFTER tests to clear interval timer
  after(() => {
    closeDatabase();
  });

  it('should return total count with includeTotal option', () => {
    const result = getJobs('duplicate-detection', {
      limit: 5,
      offset: 0,
      includeTotal: true
    });

    assert.ok(result.total !== undefined, 'Should return total property when includeTotal=true');
    assert.ok(typeof result.total === 'number', 'Total should be a number');
    assert.ok(result.total >= 0, 'Total should be non-negative');
    assert.ok(result.jobs.length <= 5, 'Should return at most 5 jobs with limit=5');
    assert.ok(Array.isArray(result.jobs), 'Jobs should be an array');
  });

  it('should handle different limit/offset combinations', () => {
    // Get total first using includeTotal
    const initial = getJobs('duplicate-detection', {
      limit: 1,
      offset: 0,
      includeTotal: true
    });

    const totalCount = initial.total;

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
    assert.strictEqual(page1.total, totalCount, 'Page 1 total should be consistent');

    // Page 2
    const page2 = getJobs('duplicate-detection', {
      limit: 3,
      offset: 3,
      includeTotal: true
    });

    assert.strictEqual(page2.total, totalCount, 'Page 2 total should be consistent');

    // Verify total is consistent across pages
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
    // Get completed jobs
    const completed = getJobs('duplicate-detection', {
      status: 'completed',
      limit: 100,
      offset: 0,
      includeTotal: true
    });

    if (completed.total > 0) {
      assert.ok(completed.jobs.every(j => j.status === 'completed'), 'All jobs should be completed');
      assert.ok(completed.jobs.length <= completed.total, 'Jobs length should not exceed total');
    }

    // Get failed jobs
    const failed = getJobs('duplicate-detection', {
      status: 'failed',
      limit: 100,
      offset: 0,
      includeTotal: true
    });

    if (failed.total > 0) {
      assert.ok(failed.jobs.every(j => j.status === 'failed'), 'All jobs should be failed');
    }
  });

  it('should calculate hasMore flag correctly based on limit', () => {
    const initial = getJobs('duplicate-detection', {
      limit: 1,
      offset: 0,
      includeTotal: true
    });

    const totalCount = initial.total;

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
    const initial = getJobs('duplicate-detection', {
      limit: 1,
      offset: 0,
      includeTotal: true
    });

    const totalCount = initial.total;

    // Offset beyond total
    const beyond = getJobs('duplicate-detection', {
      limit: 10,
      offset: totalCount + 100,
      includeTotal: true
    });

    assert.strictEqual(beyond.jobs.length, 0, 'Should return empty array when offset > total');
    assert.strictEqual(beyond.total, totalCount, 'Total should still be accurate with large offset');

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
    const initial = getJobs('duplicate-detection', {
      limit: 1,
      offset: 0,
      includeTotal: true
    });

    const totalCount = initial.total;

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

  it('should return job counts via getJobCounts', () => {
    const counts = getJobCounts('duplicate-detection');

    assert.ok(typeof counts === 'object', 'Should return an object');
    assert.ok(typeof counts.total === 'number', 'Should have total count');
    assert.ok(typeof counts.completed === 'number', 'Should have completed count');
    assert.ok(typeof counts.failed === 'number', 'Should have failed count');
    assert.ok(typeof counts.running === 'number', 'Should have running count');
    assert.ok(typeof counts.queued === 'number', 'Should have queued count');

    // Verify counts add up
    const sum = counts.completed + counts.failed + counts.running + counts.queued;
    assert.ok(sum <= counts.total, 'Status counts should not exceed total');
  });
});

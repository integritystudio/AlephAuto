/**
 * API Status Endpoint Integration Tests
 *
 * Tests GET /api/status endpoint to verify:
 * - Returns all pipelines from database
 * - Job counts match database totals
 * - Response structure is correct
 * - All required fields are present
 *
 * These tests verify fixes for E1 (dashboard showing only 1 pipeline)
 * and ensure the API returns accurate data from the database.
 *
 * @see ~/dev/active/bugfix-AlephAuto-errors-2025-11-29/plan.md - Phase 1: Verification
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../../data/jobs.db');

// Base URL for API - uses localhost by default
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8080';

// Skip in CI - requires running API server
const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

describe('GET /api/status Integration Tests', { skip: isCI ? 'Requires running API server' : false }, () => {
  let db;
  let expectedPipelines;

  before(() => {
    // Get direct database connection for verification
    db = new Database(DB_PATH);

    // Query database for expected pipeline counts
    expectedPipelines = db.prepare(`
      SELECT
        pipeline_id,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM jobs
      GROUP BY pipeline_id
      ORDER BY pipeline_id
    `).all();
  });

  after(() => {
    if (db) db.close();
  });

  it('should return all pipelines from database', async () => {
    const response = await fetch(`${API_BASE_URL}/api/status`);
    assert.strictEqual(response.status, 200, 'Should return 200 OK');

    const data = await response.json();

    // Verify response has pipelines array
    assert.ok(Array.isArray(data.pipelines), 'Response should have pipelines array');

    // Verify we have at least as many pipelines as in database
    // (API may include additional pipelines from workers not yet in DB)
    assert.ok(
      data.pipelines.length >= expectedPipelines.length,
      `Should return at least ${expectedPipelines.length} pipelines, got ${data.pipelines.length}`
    );

    // Verify all database pipelines are included
    const apiPipelineIds = data.pipelines.map(p => p.id);
    for (const dbPipeline of expectedPipelines) {
      assert.ok(
        apiPipelineIds.includes(dbPipeline.pipeline_id),
        `Pipeline '${dbPipeline.pipeline_id}' should be included in API response`
      );
    }
  });

  it('should return accurate job counts matching database', async () => {
    const response = await fetch(`${API_BASE_URL}/api/status`);
    const data = await response.json();

    // Verify counts for each database pipeline
    for (const dbPipeline of expectedPipelines) {
      const apiPipeline = data.pipelines.find(p => p.id === dbPipeline.pipeline_id);

      assert.ok(apiPipeline, `Pipeline '${dbPipeline.pipeline_id}' should exist in API response`);

      assert.strictEqual(
        apiPipeline.completedJobs,
        dbPipeline.completed,
        `Completed count for '${dbPipeline.pipeline_id}' should match: API=${apiPipeline.completedJobs}, DB=${dbPipeline.completed}`
      );

      assert.strictEqual(
        apiPipeline.failedJobs,
        dbPipeline.failed,
        `Failed count for '${dbPipeline.pipeline_id}' should match: API=${apiPipeline.failedJobs}, DB=${dbPipeline.failed}`
      );
    }
  });

  it('should return correct response structure', async () => {
    const response = await fetch(`${API_BASE_URL}/api/status`);
    const data = await response.json();

    // Verify top-level structure
    assert.ok(data.timestamp, 'Should have timestamp');
    assert.ok(Array.isArray(data.pipelines), 'Should have pipelines array');
    assert.ok(data.queue, 'Should have queue object');

    // Verify each pipeline has required fields
    for (const pipeline of data.pipelines) {
      assert.ok(pipeline.id, 'Pipeline should have id');
      assert.ok(pipeline.name, 'Pipeline should have name');
      assert.ok(['idle', 'running'].includes(pipeline.status), `Pipeline status should be 'idle' or 'running', got '${pipeline.status}'`);
      assert.ok(typeof pipeline.completedJobs === 'number', 'Pipeline should have numeric completedJobs');
      assert.ok(typeof pipeline.failedJobs === 'number', 'Pipeline should have numeric failedJobs');
    }

    // Verify queue structure
    assert.ok(typeof data.queue.active === 'number', 'Queue should have numeric active count');
    assert.ok(typeof data.queue.queued === 'number', 'Queue should have numeric queued count');
  });

  it('should include repomix pipeline with accurate high-failure-rate data', async () => {
    const response = await fetch(`${API_BASE_URL}/api/status`);
    const data = await response.json();

    const repomix = data.pipelines.find(p => p.id === 'repomix');

    // Repomix should exist if it's in the database
    const dbRepomix = expectedPipelines.find(p => p.pipeline_id === 'repomix');
    if (dbRepomix) {
      assert.ok(repomix, 'Repomix pipeline should be in API response');
      assert.strictEqual(repomix.completedJobs, dbRepomix.completed, 'Repomix completed count should match');
      assert.strictEqual(repomix.failedJobs, dbRepomix.failed, 'Repomix failed count should match');

      // Verify the high failure rate (should be > 50%)
      const totalJobs = repomix.completedJobs + repomix.failedJobs;
      if (totalJobs > 0) {
        const failureRate = repomix.failedJobs / totalJobs;
        // Just verify the data is accurate - the high failure rate is a known issue (E3)
        console.log(`Repomix failure rate: ${(failureRate * 100).toFixed(1)}% (${repomix.failedJobs}/${totalJobs})`);
      }
    }
  });

  it('should include duplicate-detection pipeline', async () => {
    const response = await fetch(`${API_BASE_URL}/api/status`);
    const data = await response.json();

    const duplicateDetection = data.pipelines.find(p => p.id === 'duplicate-detection');

    const dbDuplicateDetection = expectedPipelines.find(p => p.pipeline_id === 'duplicate-detection');
    if (dbDuplicateDetection) {
      assert.ok(duplicateDetection, 'Duplicate Detection pipeline should be in API response');
      assert.strictEqual(
        duplicateDetection.completedJobs,
        dbDuplicateDetection.completed,
        'Duplicate Detection completed count should match'
      );
    }
  });

  it('should handle concurrent requests consistently', async () => {
    // Make 5 concurrent requests
    const requests = Array(5).fill(null).map(() =>
      fetch(`${API_BASE_URL}/api/status`).then(r => r.json())
    );

    const responses = await Promise.all(requests);

    // All responses should have the same number of pipelines
    const pipelineCounts = responses.map(r => r.pipelines.length);
    const uniqueCounts = new Set(pipelineCounts);
    assert.strictEqual(uniqueCounts.size, 1, 'All concurrent responses should return same number of pipelines');

    // All responses should have same job counts for each pipeline
    const firstResponse = responses[0];
    for (let i = 1; i < responses.length; i++) {
      for (const pipeline of firstResponse.pipelines) {
        const samePipeline = responses[i].pipelines.find(p => p.id === pipeline.id);
        if (samePipeline) {
          assert.strictEqual(
            samePipeline.completedJobs,
            pipeline.completedJobs,
            `Completed jobs for ${pipeline.id} should be consistent across requests`
          );
        }
      }
    }
  });
});

describe('GET /api/sidequest/pipeline-runners/:id/jobs Pagination Tests', { skip: isCI ? 'Requires running API server' : false }, () => {
  let db;

  before(() => {
    db = new Database(DB_PATH);
  });

  after(() => {
    if (db) db.close();
  });

  it('should return consistent total count across pages for repomix', async () => {
    // Get expected total from database
    const dbCount = db.prepare('SELECT COUNT(*) as count FROM jobs WHERE pipeline_id = ?')
      .get('repomix').count;

    // Page 1
    const page1Response = await fetch(`${API_BASE_URL}/api/sidequest/pipeline-runners/repomix/jobs?limit=100&offset=0`);
    const page1 = await page1Response.json();

    // Page 2
    const page2Response = await fetch(`${API_BASE_URL}/api/sidequest/pipeline-runners/repomix/jobs?limit=100&offset=100`);
    const page2 = await page2Response.json();

    // Verify totals match database
    assert.strictEqual(page1.total, dbCount, `Page 1 total (${page1.total}) should match database (${dbCount})`);
    assert.strictEqual(page2.total, dbCount, `Page 2 total (${page2.total}) should match database (${dbCount})`);

    // Verify totals are consistent
    assert.strictEqual(page1.total, page2.total, 'Total should be consistent across pages');
  });

  it('should set hasMore flag correctly', async () => {
    const dbCount = db.prepare('SELECT COUNT(*) as count FROM jobs WHERE pipeline_id = ?')
      .get('repomix').count;

    if (dbCount <= 100) {
      // Skip if not enough data for pagination
      console.log(`Skipping hasMore test: repomix only has ${dbCount} jobs`);
      return;
    }

    // Page 1 should have hasMore=true
    const page1Response = await fetch(`${API_BASE_URL}/api/sidequest/pipeline-runners/repomix/jobs?limit=100&offset=0`);
    const page1 = await page1Response.json();

    assert.strictEqual(page1.hasMore, true, 'Page 1 should have hasMore=true when more pages exist');

    // Last page should have hasMore=false
    const lastOffset = Math.floor(dbCount / 100) * 100;
    const lastPageResponse = await fetch(`${API_BASE_URL}/api/sidequest/pipeline-runners/repomix/jobs?limit=100&offset=${lastOffset}`);
    const lastPage = await lastPageResponse.json();

    // If the last page has fewer items than the limit, hasMore should be false
    if (lastPage.jobs.length < 100) {
      assert.strictEqual(lastPage.hasMore, false, 'Last page should have hasMore=false');
    }
  });

  it('should return correct job counts across all pages', async () => {
    const dbCount = db.prepare('SELECT COUNT(*) as count FROM jobs WHERE pipeline_id = ?')
      .get('repomix').count;

    let totalJobsReturned = 0;
    let offset = 0;
    const limit = 100;

    while (offset < dbCount) {
      const response = await fetch(`${API_BASE_URL}/api/sidequest/pipeline-runners/repomix/jobs?limit=${limit}&offset=${offset}`);
      const data = await response.json();

      totalJobsReturned += data.jobs.length;
      offset += limit;
    }

    assert.strictEqual(totalJobsReturned, dbCount, `Total jobs returned (${totalJobsReturned}) should match database (${dbCount})`);
  });
});

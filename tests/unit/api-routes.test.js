import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../../data/jobs.db');

// Dynamic imports to control initialization order
let scanRoutes, worker, repositoryRoutes, reportRoutes;
let closeDatabase, initDatabase;
let createTempRepository, createMultipleTempRepositories, cleanupRepositories, waitForQueueDrain;

describe('API Routes', () => {
  let app;
  let testRepo;
  let multiRepos;

  // Initialize fresh database before all tests
  before(async () => {
    // Delete corrupted database file if it exists (before importing modules)
    if (fs.existsSync(DB_PATH)) {
      fs.unlinkSync(DB_PATH);
    }
    // Also delete WAL files
    [DB_PATH + '-shm', DB_PATH + '-wal'].forEach(f => {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    });

    // Now import modules (will create fresh database)
    const dbModule = await import('../../sidequest/core/database.js');
    closeDatabase = dbModule.closeDatabase;
    initDatabase = dbModule.initDatabase;
    await initDatabase();

    const scanModule = await import('../../api/routes/scans.js');
    scanRoutes = scanModule.default;
    worker = scanModule.worker;

    const repoModule = await import('../../api/routes/repositories.js');
    repositoryRoutes = repoModule.default;

    const reportModule = await import('../../api/routes/reports.js');
    reportRoutes = reportModule.default;

    const helpersModule = await import('../fixtures/test-helpers.js');
    createTempRepository = helpersModule.createTempRepository;
    createMultipleTempRepositories = helpersModule.createMultipleTempRepositories;
    cleanupRepositories = helpersModule.cleanupRepositories;
    waitForQueueDrain = helpersModule.waitForQueueDrain;
  });

  // Stop worker and close database after all tests
  after(async () => {
    if (worker) {
      worker.stop();
      // Cancel any remaining active/queued jobs
      for (const [jobId, job] of worker.jobs) {
        if (job.status === 'running' || job.status === 'queued') {
          worker.cancelJob(jobId);
        }
      }
      // Brief wait for cancellation to propagate
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (closeDatabase) closeDatabase();
  });

  beforeEach(async () => {
    // Create fresh Express app for each test
    app = express();
    app.use(express.json());

    // Mount routes
    app.use('/api/scans', scanRoutes);
    app.use('/api/repositories', repositoryRoutes);
    app.use('/api/reports', reportRoutes);

    // Create temporary test repositories
    testRepo = await createTempRepository('test');
    multiRepos = await createMultipleTempRepositories(2);
  });

  afterEach(async () => {
    // Cancel any active/queued jobs to speed up cleanup
    // This prevents long-running scans from blocking test cleanup
    if (worker) {
      const stats = worker.getStats();
      if (stats.active > 0 || stats.queued > 0) {
        // Get all jobs and cancel any that are running or queued
        for (const [jobId, job] of worker.jobs) {
          if (job.status === 'running' || job.status === 'queued') {
            worker.cancelJob(jobId);
          }
        }
      }
      // Brief wait for cancellation to propagate
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Cleanup temporary repositories
    if (testRepo) await testRepo.cleanup();
    if (multiRepos) await cleanupRepositories(multiRepos);
  });

  describe('Scan Routes', () => {
    describe('POST /api/scans/start', () => {
      test('should reject request without repositoryPath', async () => {
        const response = await request(app)
          .post('/api/scans/start')
          .send({});

        assert.strictEqual(response.status, 400);
        assert.strictEqual(response.body.error.code, 'INVALID_REQUEST');
        // Validation middleware returns errors in error.details.errors array with field names
        assert.ok(
          response.body.error.message.includes('repositoryPath') ||
          (response.body.error.details?.errors?.some(e => e.field === 'repositoryPath')),
          'Error should mention repositoryPath field'
        );
      });

      test('should accept valid scan request', async () => {
        const response = await request(app)
          .post('/api/scans/start')
          .send({
            repositoryPath: testRepo.path,
            options: {}
          });

        assert.strictEqual(response.status, 201);
        assert.ok(response.body.success);
        assert.ok(response.body.job_id);
        assert.ok(response.body.status_url);
        assert.ok(response.body.results_url);
      });

      test('should include timestamp in response', async () => {
        const response = await request(app)
          .post('/api/scans/start')
          .send({ repositoryPath: testRepo.path });

        assert.ok(response.body.timestamp);
        const timestamp = new Date(response.body.timestamp);
        assert.ok(!isNaN(timestamp.getTime()));
      });
    });

    describe('POST /api/scans/start-multi', () => {
      test('should reject request without repositoryPaths', async () => {
        const response = await request(app)
          .post('/api/scans/start-multi')
          .send({});

        assert.strictEqual(response.status, 400);
        assert.ok(response.body.error.message.includes('repositoryPaths'));
      });

      test('should reject request with single repository', async () => {
        const response = await request(app)
          .post('/api/scans/start-multi')
          .send({
            repositoryPaths: [multiRepos[0].path]
          });

        assert.strictEqual(response.status, 400);
        assert.ok(response.body.error.message.includes('at least 2 repositories'));
      });

      test('should accept valid multi-repo scan request', async () => {
        const response = await request(app)
          .post('/api/scans/start-multi')
          .send({
            repositoryPaths: [multiRepos[0].path, multiRepos[1].path],
            groupName: 'test-group'
          });

        assert.strictEqual(response.status, 201);
        assert.ok(response.body.success);
        assert.strictEqual(response.body.repository_count, 2);
        assert.ok(response.body.job_id);
      });
    });

    describe('GET /api/scans/:jobId/status', () => {
      test('should return scan status', async () => {
        const response = await request(app)
          .get('/api/scans/test-job-123/status');

        assert.strictEqual(response.status, 200);
        assert.ok(response.body.job_id);
        assert.ok(['queued', 'running', 'completed'].includes(response.body.status));
        assert.ok(typeof response.body.queued === 'number');
        assert.ok(typeof response.body.active === 'number');
        assert.ok(typeof response.body.completed === 'number');
      });
    });

    describe('GET /api/scans/:jobId/results', () => {
      test('should return scan results summary by default', async () => {
        const response = await request(app)
          .get('/api/scans/test-job-123/results');

        assert.strictEqual(response.status, 200);
        assert.ok(response.body.job_id);
        assert.ok(response.body.metrics);
        assert.ok(typeof response.body.metrics.total_scans === 'number');
        assert.ok(typeof response.body.metrics.duplicates_found === 'number');
      });

      test('should return detailed results when format=full', async () => {
        const response = await request(app)
          .get('/api/scans/test-job-123/results?format=full');

        assert.strictEqual(response.status, 200);
        assert.ok(response.body.metrics);
        assert.ok(response.body.detailed_metrics);
      });
    });

    describe('GET /api/scans/recent', () => {
      test('should return recent scans list', async () => {
        const response = await request(app)
          .get('/api/scans/recent');

        assert.strictEqual(response.status, 200);
        assert.ok(Array.isArray(response.body.scans));
        assert.ok(typeof response.body.total === 'number');
      });

      test('should respect limit parameter', async () => {
        const response = await request(app)
          .get('/api/scans/recent?limit=5');

        assert.strictEqual(response.status, 200);
        assert.ok(response.body.scans);
      });
    });

    describe('GET /api/scans/stats', () => {
      test('should return scanning statistics', async () => {
        const response = await request(app)
          .get('/api/scans/stats');

        assert.strictEqual(response.status, 200);
        assert.ok(response.body.scan_metrics);
        assert.ok(response.body.queue_stats);
        assert.ok(response.body.cache_stats);
        assert.ok(typeof response.body.scan_metrics.total_scans === 'number');
      });
    });

    describe('DELETE /api/scans/:jobId', () => {
      test('should cancel queued scan job', async () => {
        // First, create a job by starting a scan
        const startResponse = await request(app)
          .post('/api/scans/start')
          .send({ repositoryPath: testRepo.path });

        assert.strictEqual(startResponse.status, 201);
        const jobId = startResponse.body.job_id;

        // Now cancel the job
        const response = await request(app)
          .delete(`/api/scans/${jobId}`);

        // Job should be cancelled (200) or already completed (400)
        assert.ok([200, 400].includes(response.status));
        assert.strictEqual(response.body.job_id, jobId);
      });

      test('should return 404 for non-existent job', async () => {
        const response = await request(app)
          .delete('/api/scans/non-existent-job-123');

        assert.strictEqual(response.status, 404);
        assert.strictEqual(response.body.success, false);
        assert.ok(response.body.message.includes('not found'));
      });
    });
  });

  describe('Response Format Validation', () => {
    test('all endpoints should include timestamp', async () => {
      const endpoints = [
        { method: 'get', path: '/api/scans/test/status' },
        { method: 'get', path: '/api/scans/test/results' },
        { method: 'get', path: '/api/scans/recent' },
        { method: 'get', path: '/api/scans/stats' }
      ];

      for (const endpoint of endpoints) {
        const response = await request(app)[endpoint.method](endpoint.path);
        assert.ok(response.body.timestamp, `${endpoint.path} missing timestamp`);
      }
    });

    test('error responses should have consistent format', async () => {
      const response = await request(app)
        .post('/api/scans/start')
        .send({});

      assert.strictEqual(response.status, 400);
      assert.ok(response.body.error);
      assert.ok(response.body.error.code);
      assert.ok(response.body.error.message);
      assert.ok(response.body.timestamp);
    });
  });

  describe('Report Routes', () => {
    describe('GET /api/reports', () => {
      test('should return list of reports or handle missing directory', async () => {
        const response = await request(app)
          .get('/api/reports');

        // 200 if reports dir exists, 500 if it doesn't (CI environment)
        if (response.status === 200) {
          assert.ok(Array.isArray(response.body.reports));
          assert.ok(typeof response.body.total === 'number');
          assert.ok(response.body.timestamp);
        } else {
          // In CI, the reports directory may not exist
          assert.strictEqual(response.status, 500);
        }
      });

      test('should respect limit query parameter', async () => {
        const response = await request(app)
          .get('/api/reports?limit=5');

        // 200 if reports dir exists, 500 if it doesn't
        if (response.status === 200) {
          assert.ok(response.body.reports.length <= 5);
        } else {
          assert.strictEqual(response.status, 500);
        }
      });

      test('should filter by format=html', async () => {
        const response = await request(app)
          .get('/api/reports?format=html');

        if (response.status === 200) {
          // If there are reports, they should all be html
          for (const report of response.body.reports) {
            assert.strictEqual(report.format, 'html');
          }
        } else {
          assert.strictEqual(response.status, 500);
        }
      });

      test('should filter by format=json', async () => {
        const response = await request(app)
          .get('/api/reports?format=json');

        if (response.status === 200) {
          for (const report of response.body.reports) {
            assert.strictEqual(report.format, 'json');
          }
        } else {
          assert.strictEqual(response.status, 500);
        }
      });

      test('should filter by format=markdown', async () => {
        const response = await request(app)
          .get('/api/reports?format=markdown');

        if (response.status === 200) {
          for (const report of response.body.reports) {
            assert.strictEqual(report.format, 'markdown');
          }
        } else {
          assert.strictEqual(response.status, 500);
        }
      });

      test('should filter by type=summary', async () => {
        const response = await request(app)
          .get('/api/reports?type=summary');

        if (response.status === 200) {
          for (const report of response.body.reports) {
            assert.strictEqual(report.type, 'summary');
          }
        } else {
          assert.strictEqual(response.status, 500);
        }
      });

      test('should filter by type=full', async () => {
        const response = await request(app)
          .get('/api/reports?type=full');

        if (response.status === 200) {
          for (const report of response.body.reports) {
            assert.strictEqual(report.type, 'full');
          }
        } else {
          assert.strictEqual(response.status, 500);
        }
      });
    });

    describe('GET /api/reports/:filename', () => {
      test('should reject path traversal attempts with ..', async () => {
        // Express normalizes paths, so ../../.. becomes a 404 not found
        // The security check catches encoded traversal attempts
        const response = await request(app)
          .get('/api/reports/..%2F..%2Fetc%2Fpasswd');

        // Either 400 (caught by security check) or 404 (normalized path)
        assert.ok([400, 404].includes(response.status));
      });

      test('should handle encoded path traversal attempts', async () => {
        const response = await request(app)
          .get('/api/reports/test%2F..%2Ftest.html');

        // Security check or file not found
        assert.ok([400, 404].includes(response.status));
      });

      test('should return 404 for non-existent report', async () => {
        const response = await request(app)
          .get('/api/reports/non-existent-report-xyz.html');

        // 404 if reports dir exists but file doesn't, 500 if dir doesn't exist (CI)
        if (response.status === 404) {
          assert.strictEqual(response.body.error.code, 'NOT_FOUND');
        } else {
          assert.strictEqual(response.status, 500);
        }
      });

      test('should return report when it exists', async () => {
        // First get list of reports to find an existing one
        const listResponse = await request(app)
          .get('/api/reports?limit=1&format=html');

        // Skip if reports directory doesn't exist (CI environment)
        if (listResponse.status === 500) return;

        if (listResponse.body.reports && listResponse.body.reports.length > 0) {
          const reportName = listResponse.body.reports[0].name;
          const response = await request(app)
            .get(`/api/reports/${reportName}`);

          assert.strictEqual(response.status, 200);
          assert.ok(response.type.includes('html'));
        }
      });

      test('should return JSON report with correct content type', async () => {
        const listResponse = await request(app)
          .get('/api/reports?limit=1&format=json');

        // Skip if reports directory doesn't exist (CI environment)
        if (listResponse.status === 500) return;

        if (listResponse.body.reports && listResponse.body.reports.length > 0) {
          const reportName = listResponse.body.reports[0].name;
          const response = await request(app)
            .get(`/api/reports/${reportName}`);

          assert.strictEqual(response.status, 200);
          assert.ok(response.type.includes('json'));
        }
      });
    });

    describe('DELETE /api/reports/:filename', () => {
      test('should reject path traversal attempts', async () => {
        // Express normalizes paths, so encoded traversal triggers security check
        const response = await request(app)
          .delete('/api/reports/..%2F..%2Fetc%2Fpasswd');

        // Either 400 (caught by security check) or 404 (normalized/not found)
        assert.ok([400, 404].includes(response.status));
      });

      test('should return 404 for non-existent report', async () => {
        const response = await request(app)
          .delete('/api/reports/non-existent-report-xyz.html');

        assert.strictEqual(response.status, 404);
        assert.strictEqual(response.body.error.code, 'NOT_FOUND');
      });
    });

    describe('GET /api/reports/:scanId/summary', () => {
      test('should return 404 for non-existent scan summary', async () => {
        const response = await request(app)
          .get('/api/reports/non-existent-scan-xyz/summary');

        // 404 if reports dir exists but summary not found, 500 if dir doesn't exist
        if (response.status === 404) {
          assert.strictEqual(response.body.error.code, 'NOT_FOUND');
          assert.ok(response.body.error.message.includes('Summary not found'));
        } else {
          assert.strictEqual(response.status, 500);
        }
      });
    });
  });

  describe('Repository Routes', () => {
    describe('GET /api/repositories', () => {
      test('should return list of repositories', async () => {
        const response = await request(app)
          .get('/api/repositories');

        assert.strictEqual(response.status, 200);
        assert.ok(Array.isArray(response.body.repositories));
        assert.ok(typeof response.body.total === 'number');
        assert.ok(response.body.timestamp);
      });

      test('should filter by enabled=true', async () => {
        const response = await request(app)
          .get('/api/repositories?enabled=true');

        assert.strictEqual(response.status, 200);
        assert.ok(Array.isArray(response.body.repositories));
        // All returned repos should be enabled
        for (const repo of response.body.repositories) {
          assert.strictEqual(repo.enabled, true);
        }
      });

      test('should filter by priority', async () => {
        const response = await request(app)
          .get('/api/repositories?priority=high');

        assert.strictEqual(response.status, 200);
        for (const repo of response.body.repositories) {
          assert.strictEqual(repo.priority, 'high');
        }
      });

      test('should filter by tag', async () => {
        const response = await request(app)
          .get('/api/repositories?tag=production');

        assert.strictEqual(response.status, 200);
        for (const repo of response.body.repositories) {
          assert.ok(repo.tags.includes('production'));
        }
      });
    });

    describe('GET /api/repositories/:name', () => {
      test('should return 404 for non-existent repository', async () => {
        const response = await request(app)
          .get('/api/repositories/non-existent-repo-xyz');

        assert.strictEqual(response.status, 404);
        assert.strictEqual(response.body.error.code, 'NOT_FOUND');
        assert.ok(response.body.error.message.includes('not found'));
      });

      test('should return repository details when found', async () => {
        // First get list of repos to find an existing one
        const listResponse = await request(app)
          .get('/api/repositories');

        if (listResponse.body.repositories.length > 0) {
          const repoName = listResponse.body.repositories[0].name;
          const response = await request(app)
            .get(`/api/repositories/${repoName}`);

          assert.strictEqual(response.status, 200);
          assert.ok(response.body.name || response.body.path);
          assert.ok(response.body.timestamp);
        }
      });
    });

    describe('POST /api/repositories/:name/scan', () => {
      test('should return 404 for non-existent repository', async () => {
        const response = await request(app)
          .post('/api/repositories/non-existent-repo-xyz/scan')
          .send({});

        assert.strictEqual(response.status, 404);
        assert.strictEqual(response.body.error.code, 'NOT_FOUND');
      });

      test('should trigger scan for existing repository', async () => {
        // First get list of repos to find an existing one
        const listResponse = await request(app)
          .get('/api/repositories');

        if (listResponse.body.repositories.length > 0) {
          const repoName = listResponse.body.repositories[0].name;
          const response = await request(app)
            .post(`/api/repositories/${repoName}/scan`)
            .send({ forceRefresh: true });

          assert.strictEqual(response.status, 200);
          assert.ok(response.body.success);
          assert.ok(response.body.job_id);
          assert.ok(response.body.status_url);
        }
      });
    });

    describe('GET /api/repositories/:name/cache', () => {
      test('should return 404 for non-existent repository', async () => {
        const response = await request(app)
          .get('/api/repositories/non-existent-repo-xyz/cache');

        assert.strictEqual(response.status, 404);
        assert.strictEqual(response.body.error.code, 'NOT_FOUND');
      });

      test('should return cache status for existing repository', async () => {
        const listResponse = await request(app)
          .get('/api/repositories');

        if (listResponse.body.repositories.length > 0) {
          const repoName = listResponse.body.repositories[0].name;
          const response = await request(app)
            .get(`/api/repositories/${repoName}/cache`);

          assert.strictEqual(response.status, 200);
          assert.ok(response.body.repository);
          assert.ok(response.body.cache_status !== undefined);
        }
      });
    });

    describe('DELETE /api/repositories/:name/cache', () => {
      test('should return 404 for non-existent repository', async () => {
        const response = await request(app)
          .delete('/api/repositories/non-existent-repo-xyz/cache');

        assert.strictEqual(response.status, 404);
        assert.strictEqual(response.body.error.code, 'NOT_FOUND');
      });

      test('should invalidate cache for existing repository', async () => {
        const listResponse = await request(app)
          .get('/api/repositories');

        if (listResponse.body.repositories.length > 0) {
          const repoName = listResponse.body.repositories[0].name;
          const response = await request(app)
            .delete(`/api/repositories/${repoName}/cache`);

          assert.strictEqual(response.status, 200);
          assert.ok(response.body.success);
          assert.ok(typeof response.body.cache_entries_deleted === 'number');
        }
      });
    });

    describe('GET /api/repositories/groups/list', () => {
      test('should return list of repository groups', async () => {
        const response = await request(app)
          .get('/api/repositories/groups/list');

        assert.strictEqual(response.status, 200);
        assert.ok(Array.isArray(response.body.groups));
        assert.ok(typeof response.body.total === 'number');
        assert.ok(response.body.timestamp);
      });

      test('should filter by enabled=true', async () => {
        const response = await request(app)
          .get('/api/repositories/groups/list?enabled=true');

        assert.strictEqual(response.status, 200);
        for (const group of response.body.groups) {
          assert.strictEqual(group.enabled, true);
        }
      });
    });

    describe('GET /api/repositories/groups/:name', () => {
      test('should return 404 for non-existent group', async () => {
        const response = await request(app)
          .get('/api/repositories/groups/non-existent-group-xyz');

        assert.strictEqual(response.status, 404);
        assert.strictEqual(response.body.error.code, 'NOT_FOUND');
        assert.ok(response.body.error.message.includes('not found'));
      });

      test('should return group details when found', async () => {
        const listResponse = await request(app)
          .get('/api/repositories/groups/list');

        if (listResponse.body.groups.length > 0) {
          const groupName = listResponse.body.groups[0].name;
          const response = await request(app)
            .get(`/api/repositories/groups/${groupName}`);

          assert.strictEqual(response.status, 200);
          assert.ok(response.body.name);
          assert.ok(response.body.timestamp);
        }
      });
    });
  });
});

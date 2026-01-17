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
        assert.strictEqual(response.body.error, 'Bad Request');
        // Validation middleware returns errors in errors array with field names
        assert.ok(
          response.body.message.includes('repositoryPath') ||
          (response.body.errors && response.body.errors.some(e => e.field === 'repositoryPath')),
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
        assert.ok(response.body.message.includes('repositoryPaths'));
      });

      test('should reject request with single repository', async () => {
        const response = await request(app)
          .post('/api/scans/start-multi')
          .send({
            repositoryPaths: [multiRepos[0].path]
          });

        assert.strictEqual(response.status, 400);
        assert.ok(response.body.message.includes('at least 2 repositories'));
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
      assert.ok(response.body.message);
      assert.ok(response.body.timestamp);
    });
  });
});

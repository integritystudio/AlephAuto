import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import express from 'express';
import scanRoutes from '../api/routes/scans.js';
import repositoryRoutes from '../api/routes/repositories.js';
import reportRoutes from '../api/routes/reports.js';

describe('API Routes', () => {
  let app;

  beforeEach(() => {
    // Create fresh Express app for each test
    app = express();
    app.use(express.json());

    // Mount routes
    app.use('/api/scans', scanRoutes);
    app.use('/api/repositories', repositoryRoutes);
    app.use('/api/reports', reportRoutes);
  });

  describe('Scan Routes', () => {
    describe('POST /api/scans/start', () => {
      test('should reject request without repositoryPath', async () => {
        const response = await request(app)
          .post('/api/scans/start')
          .send({});

        assert.strictEqual(response.status, 400);
        assert.strictEqual(response.body.error, 'Bad Request');
        assert.ok(response.body.message.includes('repositoryPath'));
      });

      test('should accept valid scan request', async () => {
        const response = await request(app)
          .post('/api/scans/start')
          .send({
            repositoryPath: '/tmp/test-repo',
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
          .send({ repositoryPath: '/tmp/test' });

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
            repositoryPaths: ['/tmp/repo1']
          });

        assert.strictEqual(response.status, 400);
        assert.ok(response.body.message.includes('at least 2 repositories'));
      });

      test('should accept valid multi-repo scan request', async () => {
        const response = await request(app)
          .post('/api/scans/start-multi')
          .send({
            repositoryPaths: ['/tmp/repo1', '/tmp/repo2'],
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
      test('should cancel scan job', async () => {
        const response = await request(app)
          .delete('/api/scans/test-job-123');

        assert.strictEqual(response.status, 200);
        assert.ok(response.body.success);
        assert.strictEqual(response.body.job_id, 'test-job-123');
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

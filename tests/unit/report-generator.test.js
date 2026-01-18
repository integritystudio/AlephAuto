#!/usr/bin/env node
/**
 * Generic Report Generator Tests
 *
 * Tests for HTML and JSON report generation.
 */

// @ts-nocheck
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { generateReport } from '../../sidequest/utils/report-generator.js';

describe('Report Generator', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), 'test-report-gen-' + Date.now());
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('generateReport', () => {
    it('should generate HTML and JSON reports', async () => {
      const options = {
        jobId: 'test-job-123',
        jobType: 'claude-health',
        status: 'completed',
        result: { healthScore: 95 },
        startTime: Date.now() - 5000,
        endTime: Date.now(),
        outputDir: tempDir
      };

      const reportPaths = await generateReport(options);

      assert.ok(reportPaths.html);
      assert.ok(reportPaths.json);
      assert.ok(reportPaths.timestamp);

      // Verify files exist
      const htmlExists = await fs.access(reportPaths.html).then(() => true).catch(() => false);
      const jsonExists = await fs.access(reportPaths.json).then(() => true).catch(() => false);

      assert.ok(htmlExists, 'HTML file should exist');
      assert.ok(jsonExists, 'JSON file should exist');
    });

    it('should throw error for missing required fields', async () => {
      await assert.rejects(
        async () => generateReport({ outputDir: tempDir }),
        /Missing required fields/
      );

      await assert.rejects(
        async () => generateReport({ jobId: 'test', outputDir: tempDir }),
        /Missing required fields/
      );

      await assert.rejects(
        async () => generateReport({ jobId: 'test', jobType: 'type', outputDir: tempDir }),
        /Missing required fields/
      );
    });

    it('should generate report with parameters', async () => {
      const options = {
        jobId: 'test-job-456',
        jobType: 'git-activity',
        status: 'completed',
        result: { commits: 10 },
        startTime: Date.now() - 3000,
        endTime: Date.now(),
        parameters: {
          repository: '/path/to/repo',
          branch: 'main',
          daysBack: 30
        },
        outputDir: tempDir
      };

      const reportPaths = await generateReport(options);

      // Read HTML and check parameters
      const htmlContent = await fs.readFile(reportPaths.html, 'utf-8');
      assert.ok(htmlContent.includes('Parameters'));
      assert.ok(htmlContent.includes('repository'));
    });

    it('should generate report with metadata', async () => {
      const options = {
        jobId: 'test-job-789',
        jobType: 'schema-enhancement',
        status: 'completed',
        result: { enhanced: 5 },
        startTime: Date.now() - 2000,
        endTime: Date.now(),
        metadata: {
          version: '1.0.0',
          environment: 'test'
        },
        outputDir: tempDir
      };

      const reportPaths = await generateReport(options);

      const htmlContent = await fs.readFile(reportPaths.html, 'utf-8');
      assert.ok(htmlContent.includes('Metadata'));
    });

    it('should handle failed status', async () => {
      const options = {
        jobId: 'test-job-failed',
        jobType: 'duplicate-detection',
        status: 'failed',
        result: null,
        startTime: Date.now() - 1000,
        endTime: Date.now(),
        outputDir: tempDir
      };

      const reportPaths = await generateReport(options);

      const htmlContent = await fs.readFile(reportPaths.html, 'utf-8');
      assert.ok(htmlContent.includes('status-error'));
    });

    it('should handle warning status', async () => {
      const options = {
        jobId: 'test-job-warning',
        jobType: 'repo-cleanup',
        status: 'warning',
        result: { skipped: 3 },
        startTime: Date.now(),
        endTime: Date.now(),
        outputDir: tempDir
      };

      const reportPaths = await generateReport(options);

      const htmlContent = await fs.readFile(reportPaths.html, 'utf-8');
      assert.ok(htmlContent.includes('status-warning'));
    });

    it('should create output directory if it does not exist', async () => {
      const nestedDir = path.join(tempDir, 'nested', 'output');

      const options = {
        jobId: 'test-job-nested',
        jobType: 'repomix',
        status: 'completed',
        result: {},
        startTime: Date.now(),
        endTime: Date.now(),
        outputDir: nestedDir
      };

      const reportPaths = await generateReport(options);

      const dirExists = await fs.access(nestedDir).then(() => true).catch(() => false);
      assert.ok(dirExists);
    });

    it('should generate valid JSON report', async () => {
      const options = {
        jobId: 'test-json',
        jobType: 'test-refactor',
        status: 'completed',
        result: { testsFixed: 10, coverage: 85 },
        startTime: Date.now() - 10000,
        endTime: Date.now(),
        parameters: { targetDir: '/src' },
        metadata: { runner: 'jest' },
        outputDir: tempDir
      };

      const reportPaths = await generateReport(options);
      const jsonContent = await fs.readFile(reportPaths.json, 'utf-8');
      const jsonData = JSON.parse(jsonContent);

      assert.strictEqual(jsonData.report_version, '1.0.0');
      assert.strictEqual(jsonData.job.id, 'test-json');
      assert.strictEqual(jsonData.job.type, 'test-refactor');
      assert.strictEqual(jsonData.job.status, 'completed');
      assert.ok(jsonData.job.duration_seconds);
      assert.deepStrictEqual(jsonData.parameters, { targetDir: '/src' });
      assert.deepStrictEqual(jsonData.metadata, { runner: 'jest' });
      assert.deepStrictEqual(jsonData.result, { testsFixed: 10, coverage: 85 });
    });

    it('should handle null timestamps gracefully', async () => {
      const options = {
        jobId: 'test-null-times',
        jobType: 'claude-health',
        status: 'completed',
        result: {},
        startTime: null,
        endTime: null,
        outputDir: tempDir
      };

      const reportPaths = await generateReport(options);
      const jsonContent = await fs.readFile(reportPaths.json, 'utf-8');
      const jsonData = JSON.parse(jsonContent);

      assert.strictEqual(jsonData.job.duration_seconds, null);
      assert.strictEqual(jsonData.job.started_at, null);
      assert.strictEqual(jsonData.job.completed_at, null);
    });
  });

  describe('HTML Report Content', () => {
    it('should include job type title', async () => {
      const options = {
        jobId: 'test-title',
        jobType: 'duplicate-detection',
        status: 'completed',
        result: {},
        startTime: Date.now(),
        endTime: Date.now(),
        outputDir: tempDir
      };

      const reportPaths = await generateReport(options);
      const htmlContent = await fs.readFile(reportPaths.html, 'utf-8');

      assert.ok(htmlContent.includes('Duplicate Detection Report'));
    });

    it('should use fallback title for unknown job types', async () => {
      const options = {
        jobId: 'test-unknown',
        jobType: 'custom-job',
        status: 'completed',
        result: {},
        startTime: Date.now(),
        endTime: Date.now(),
        outputDir: tempDir
      };

      const reportPaths = await generateReport(options);
      const htmlContent = await fs.readFile(reportPaths.html, 'utf-8');

      assert.ok(htmlContent.includes('custom-job Report'));
    });

    it('should escape HTML special characters', async () => {
      const options = {
        jobId: 'test<script>alert("xss")</script>',
        jobType: 'claude-health',
        status: 'completed',
        result: {},
        startTime: Date.now(),
        endTime: Date.now(),
        outputDir: tempDir
      };

      const reportPaths = await generateReport(options);
      const htmlContent = await fs.readFile(reportPaths.html, 'utf-8');

      assert.ok(!htmlContent.includes('<script>'));
      assert.ok(htmlContent.includes('&lt;script&gt;'));
    });

    it('should display metrics from result', async () => {
      const options = {
        jobId: 'test-metrics',
        jobType: 'git-activity',
        status: 'completed',
        result: {
          totalCommits: 50,
          linesAdded: 1000,
          linesDeleted: 500
        },
        startTime: Date.now(),
        endTime: Date.now(),
        outputDir: tempDir
      };

      const reportPaths = await generateReport(options);
      const htmlContent = await fs.readFile(reportPaths.html, 'utf-8');

      assert.ok(htmlContent.includes('Key Metrics'));
      assert.ok(htmlContent.includes('50'));
    });

    it('should display nested metrics object', async () => {
      const options = {
        jobId: 'test-nested-metrics',
        jobType: 'duplicate-detection',
        status: 'completed',
        result: {
          metrics: {
            totalFiles: 100,
            duplicates: 10
          }
        },
        startTime: Date.now(),
        endTime: Date.now(),
        outputDir: tempDir
      };

      const reportPaths = await generateReport(options);
      const htmlContent = await fs.readFile(reportPaths.html, 'utf-8');

      assert.ok(htmlContent.includes('100'));
    });

    it('should handle empty parameters', async () => {
      const options = {
        jobId: 'test-empty-params',
        jobType: 'claude-health',
        status: 'completed',
        result: {},
        startTime: Date.now(),
        endTime: Date.now(),
        parameters: {},
        outputDir: tempDir
      };

      const reportPaths = await generateReport(options);
      const htmlContent = await fs.readFile(reportPaths.html, 'utf-8');

      // Should not have parameters section
      assert.ok(!htmlContent.includes('⚙️ Parameters'));
    });

    it('should handle empty metadata', async () => {
      const options = {
        jobId: 'test-empty-meta',
        jobType: 'claude-health',
        status: 'completed',
        result: {},
        startTime: Date.now(),
        endTime: Date.now(),
        metadata: {},
        outputDir: tempDir
      };

      const reportPaths = await generateReport(options);
      const htmlContent = await fs.readFile(reportPaths.html, 'utf-8');

      // Should not have metadata section
      assert.ok(!htmlContent.includes('ℹ️ Metadata'));
    });

    it('should handle null result', async () => {
      const options = {
        jobId: 'test-null-result',
        jobType: 'claude-health',
        status: 'failed',
        result: null,
        startTime: Date.now(),
        endTime: Date.now(),
        outputDir: tempDir
      };

      const reportPaths = await generateReport(options);
      const htmlContent = await fs.readFile(reportPaths.html, 'utf-8');

      assert.ok(htmlContent.includes('No results available'));
    });

    it('should format boolean values', async () => {
      const options = {
        jobId: 'test-bools',
        jobType: 'repo-cleanup',
        status: 'completed',
        result: {},
        startTime: Date.now(),
        endTime: Date.now(),
        parameters: {
          dryRun: true,
          verbose: false
        },
        outputDir: tempDir
      };

      const reportPaths = await generateReport(options);
      const htmlContent = await fs.readFile(reportPaths.html, 'utf-8');

      assert.ok(htmlContent.includes('Yes'));
      assert.ok(htmlContent.includes('No'));
    });

    it('should format array values', async () => {
      const options = {
        jobId: 'test-arrays',
        jobType: 'repomix',
        status: 'completed',
        result: {},
        startTime: Date.now(),
        endTime: Date.now(),
        parameters: {
          repos: ['repo1', 'repo2', 'repo3'],
          emptyArray: []
        },
        outputDir: tempDir
      };

      const reportPaths = await generateReport(options);
      const htmlContent = await fs.readFile(reportPaths.html, 'utf-8');

      assert.ok(htmlContent.includes('repo1, repo2, repo3'));
      assert.ok(htmlContent.includes('None'));
    });

    it('should format null/undefined values', async () => {
      const options = {
        jobId: 'test-nulls',
        jobType: 'git-activity',
        status: 'completed',
        result: {},
        startTime: Date.now(),
        endTime: Date.now(),
        parameters: {
          nullValue: null,
          undefinedValue: undefined
        },
        outputDir: tempDir
      };

      const reportPaths = await generateReport(options);
      const htmlContent = await fs.readFile(reportPaths.html, 'utf-8');

      assert.ok(htmlContent.includes('N/A'));
    });

    it('should include footer with timestamp', async () => {
      const options = {
        jobId: 'test-footer',
        jobType: 'claude-health',
        status: 'completed',
        result: {},
        startTime: Date.now(),
        endTime: Date.now(),
        outputDir: tempDir
      };

      const reportPaths = await generateReport(options);
      const htmlContent = await fs.readFile(reportPaths.html, 'utf-8');

      assert.ok(htmlContent.includes('Generated by AlephAuto Pipeline Framework'));
    });

    it('should include CSS styles', async () => {
      const options = {
        jobId: 'test-styles',
        jobType: 'claude-health',
        status: 'completed',
        result: {},
        startTime: Date.now(),
        endTime: Date.now(),
        outputDir: tempDir
      };

      const reportPaths = await generateReport(options);
      const htmlContent = await fs.readFile(reportPaths.html, 'utf-8');

      assert.ok(htmlContent.includes('<style>'));
      assert.ok(htmlContent.includes('.container'));
      assert.ok(htmlContent.includes('.metrics-grid'));
    });
  });

  describe('Job Type Titles', () => {
    const jobTypes = [
      { type: 'claude-health', expected: 'Claude Health Check Report' },
      { type: 'git-activity', expected: 'Git Activity Report' },
      { type: 'gitignore-update', expected: 'Gitignore Update Report' },
      { type: 'repo-cleanup', expected: 'Repository Cleanup Report' },
      { type: 'repomix', expected: 'Repomix Report' },
      { type: 'schema-enhancement', expected: 'Schema Enhancement Report' },
      { type: 'duplicate-detection', expected: 'Duplicate Detection Report' },
      { type: 'test-refactor', expected: 'Test Refactor Report' }
    ];

    for (const { type, expected } of jobTypes) {
      it(`should use correct title for ${type}`, async () => {
        const options = {
          jobId: `test-${type}`,
          jobType: type,
          status: 'completed',
          result: {},
          startTime: Date.now(),
          endTime: Date.now(),
          outputDir: tempDir
        };

        const reportPaths = await generateReport(options);
        const htmlContent = await fs.readFile(reportPaths.html, 'utf-8');

        assert.ok(htmlContent.includes(expected));
      });
    }
  });

  describe('Duration Calculation', () => {
    it('should calculate duration correctly', async () => {
      const startTime = Date.now() - 45500; // 45.5 seconds ago
      const endTime = Date.now();

      const options = {
        jobId: 'test-duration',
        jobType: 'claude-health',
        status: 'completed',
        result: {},
        startTime,
        endTime,
        outputDir: tempDir
      };

      const reportPaths = await generateReport(options);
      const htmlContent = await fs.readFile(reportPaths.html, 'utf-8');

      assert.ok(htmlContent.includes('45.'));
    });

    it('should handle missing timestamps', async () => {
      const options = {
        jobId: 'test-no-duration',
        jobType: 'claude-health',
        status: 'completed',
        result: {},
        outputDir: tempDir
      };

      const reportPaths = await generateReport(options);
      const htmlContent = await fs.readFile(reportPaths.html, 'utf-8');

      assert.ok(htmlContent.includes('N/A'));
    });
  });
});

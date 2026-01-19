/**
 * Report Coordinator Unit Tests
 *
 * Tests for the unified report generation coordinator.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { ReportCoordinator } from '../../sidequest/pipeline-core/reports/report-coordinator.js';

describe('ReportCoordinator', () => {
  let tempDir;
  let coordinator;

  const createMockScanResult = (type = 'intra-project') => ({
    scan_type: type,
    scan_metadata: {
      scanned_at: new Date().toISOString(),
      duration_seconds: 5.5,
      repository_path: '/path/to/repo'
    },
    metrics: {
      total_code_blocks: 100,
      total_duplicate_groups: 5,
      total_suggestions: 3,
      duplication_rate: 15.5
    },
    repository_info: {
      name: 'test-repo',
      path: '/path/to/repo',
      language: 'javascript'
    },
    duplicate_groups: [
      {
        group_id: 'group-1',
        pattern_id: 'pattern-1',
        member_blocks: [
          { file_path: 'src/a.js', start_line: 10, end_line: 20, source_code: 'function test() {}' },
          { file_path: 'src/b.js', start_line: 15, end_line: 25, source_code: 'function test() {}' }
        ],
        occurrence_count: 2,
        similarity_score: 0.95,
        impact_score: 70
      }
    ],
    suggestions: [
      {
        suggestion_id: 'sug-1',
        duplicate_group_id: 'group-1',
        strategy: 'local_util',
        strategy_rationale: 'Extract to shared utility',
        target_location: 'src/utils/common.js',
        impact_score: 70,
        roi_score: 85,
        complexity: 'simple',
        migration_risk: 'low'
      }
    ]
  });

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'report-test-'));
    coordinator = new ReportCoordinator(tempDir);
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('Constructor', () => {
    it('should initialize with default output directory', () => {
      const defaultCoordinator = new ReportCoordinator();
      assert.ok(defaultCoordinator.outputDir.includes('reports'));
    });

    it('should accept custom output directory', () => {
      const customCoordinator = new ReportCoordinator('/custom/output');
      assert.strictEqual(customCoordinator.outputDir, '/custom/output');
    });
  });

  describe('generateAllReports', () => {
    it('should generate all report formats', async () => {
      const scanResult = createMockScanResult();
      const result = await coordinator.generateAllReports(scanResult);

      assert.ok(result.html);
      assert.ok(result.markdown);
      assert.ok(result.json);
      assert.ok(result.summary);
      assert.ok(result.duration_seconds >= 0);

      // Verify files exist
      const htmlExists = await fs.access(result.html).then(() => true).catch(() => false);
      const mdExists = await fs.access(result.markdown).then(() => true).catch(() => false);
      const jsonExists = await fs.access(result.json).then(() => true).catch(() => false);

      assert.ok(htmlExists, 'HTML file should exist');
      assert.ok(mdExists, 'Markdown file should exist');
      assert.ok(jsonExists, 'JSON file should exist');
    });

    it('should handle inter-project scans', async () => {
      const scanResult = createMockScanResult('inter-project');
      scanResult.scanned_repositories = [
        { name: 'repo1', path: '/path/repo1' },
        { name: 'repo2', path: '/path/repo2' }
      ];

      const result = await coordinator.generateAllReports(scanResult);

      assert.ok(result.html);
      assert.ok(result.json);
    });

    it('should pass options to individual generators', async () => {
      const scanResult = createMockScanResult();
      const options = {
        title: 'Custom Report Title',
        html: { theme: 'dark' },
        markdown: { maxDuplicates: 5 }
      };

      const result = await coordinator.generateAllReports(scanResult, options);

      assert.ok(result.html);
    });
  });

  describe('generateHTMLReport', () => {
    it('should generate HTML report', async () => {
      const scanResult = createMockScanResult();
      const outputPath = await coordinator.generateHTMLReport(scanResult, 'test-report');

      assert.ok(outputPath.endsWith('.html'));

      const exists = await fs.access(outputPath).then(() => true).catch(() => false);
      assert.ok(exists, 'HTML file should exist');

      const content = await fs.readFile(outputPath, 'utf-8');
      assert.ok(content.includes('html'), 'Should contain HTML');
    });

    it('should use generated filename when none provided', async () => {
      const scanResult = createMockScanResult();
      const outputPath = await coordinator.generateHTMLReport(scanResult);

      assert.ok(outputPath.endsWith('.html'));
    });

    it('should accept custom title', async () => {
      const scanResult = createMockScanResult();
      const outputPath = await coordinator.generateHTMLReport(scanResult, 'custom-report', {
        title: 'My Custom Report'
      });

      assert.ok(outputPath);
    });
  });

  describe('generateMarkdownReport', () => {
    it('should generate Markdown report', async () => {
      const scanResult = createMockScanResult();
      const outputPath = await coordinator.generateMarkdownReport(scanResult, 'test-report');

      assert.ok(outputPath.endsWith('.md'));

      const exists = await fs.access(outputPath).then(() => true).catch(() => false);
      assert.ok(exists, 'Markdown file should exist');

      const content = await fs.readFile(outputPath, 'utf-8');
      assert.ok(content.includes('#'), 'Should contain markdown headers');
    });

    it('should respect maxDuplicates option', async () => {
      const scanResult = createMockScanResult();
      const outputPath = await coordinator.generateMarkdownReport(scanResult, 'test-report', {
        maxDuplicates: 5
      });

      assert.ok(outputPath);
    });
  });

  describe('generateJSONReport', () => {
    it('should generate JSON report', async () => {
      const scanResult = createMockScanResult();
      const outputPath = await coordinator.generateJSONReport(scanResult, 'test-report');

      assert.ok(outputPath.endsWith('.json'));

      const exists = await fs.access(outputPath).then(() => true).catch(() => false);
      assert.ok(exists, 'JSON file should exist');

      const content = await fs.readFile(outputPath, 'utf-8');
      const parsed = JSON.parse(content);
      assert.ok(parsed, 'Should be valid JSON');
    });

    it('should respect prettyPrint option', async () => {
      const scanResult = createMockScanResult();
      const outputPath = await coordinator.generateJSONReport(scanResult, 'test-report', {
        prettyPrint: true
      });

      const content = await fs.readFile(outputPath, 'utf-8');
      assert.ok(content.includes('\n'), 'Should be pretty-printed');
    });
  });

  describe('generateJSONSummary', () => {
    it('should generate summary JSON', async () => {
      const scanResult = createMockScanResult();
      const outputPath = await coordinator.generateJSONSummary(scanResult, 'test-report');

      assert.ok(outputPath.endsWith('-summary.json'));

      const exists = await fs.access(outputPath).then(() => true).catch(() => false);
      assert.ok(exists, 'Summary file should exist');

      const content = await fs.readFile(outputPath, 'utf-8');
      const parsed = JSON.parse(content);
      assert.ok('metrics' in parsed || 'summary' in parsed || 'scan_type' in parsed);
    });
  });

  describe('_generateBaseFilename', () => {
    it('should generate filename with repository name', () => {
      const scanResult = createMockScanResult();
      const filename = coordinator._generateBaseFilename(scanResult, false);

      assert.ok(filename.includes('test-repo'));
    });

    it('should generate filename for inter-project scans', () => {
      const scanResult = createMockScanResult('inter-project');
      scanResult.scanned_repositories = [
        { name: 'repo1' },
        { name: 'repo2' }
      ];

      const filename = coordinator._generateBaseFilename(scanResult, true);

      assert.ok(filename.includes('inter-project'));
    });

    it('should include date in filename', () => {
      const scanResult = createMockScanResult();
      const filename = coordinator._generateBaseFilename(scanResult);

      // Should include date pattern
      assert.ok(/\d{4}-\d{2}-\d{2}/.test(filename));
    });
  });

  describe('_generateTitle', () => {
    it('should generate title for intra-project scan', () => {
      const scanResult = createMockScanResult();
      const title = coordinator._generateTitle(scanResult);

      assert.ok(title.includes('Duplicate'));
      assert.ok(title.includes('test-repo'));
    });

    it('should generate title for inter-project scan', () => {
      const scanResult = createMockScanResult('inter-project');
      scanResult.scanned_repositories = [{ name: 'repo1' }, { name: 'repo2' }];

      const title = coordinator._generateTitle(scanResult);

      assert.ok(title.includes('Inter-Project') || title.includes('2 repositories'));
    });
  });
});

describe('ReportCoordinator - Edge Cases', () => {
  let tempDir;
  let coordinator;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'report-edge-test-'));
    coordinator = new ReportCoordinator(tempDir);
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should handle empty duplicate groups', async () => {
    const scanResult = {
      scan_type: 'intra-project',
      scan_metadata: { scanned_at: new Date().toISOString() },
      metrics: { total_duplicate_groups: 0 },
      repository_info: { name: 'empty-repo', path: '/path' },
      duplicate_groups: [],
      suggestions: []
    };

    const result = await coordinator.generateAllReports(scanResult);
    assert.ok(result.html);
  });

  it('should handle missing repository_info', async () => {
    const scanResult = {
      scan_type: 'intra-project',
      scan_metadata: { scanned_at: new Date().toISOString() },
      metrics: {},
      duplicate_groups: [],
      suggestions: []
    };

    // Should not throw
    const result = await coordinator.generateAllReports(scanResult);
    assert.ok(result);
  });

  it('should create output directory if it does not exist', async () => {
    const newDir = path.join(tempDir, 'nested', 'output', 'dir');
    const nestedCoordinator = new ReportCoordinator(newDir);

    const scanResult = {
      scan_type: 'intra-project',
      scan_metadata: { scanned_at: new Date().toISOString() },
      metrics: {},
      repository_info: { name: 'test', path: '/path' },
      duplicate_groups: [],
      suggestions: []
    };

    const result = await nestedCoordinator.generateAllReports(scanResult);

    const dirExists = await fs.access(newDir).then(() => true).catch(() => false);
    assert.ok(dirExists, 'Directory should be created');
  });
});

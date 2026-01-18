#!/usr/bin/env node
/**
 * Markdown Report Generator Tests
 *
 * Tests for Markdown report generation from scan results.
 */

// @ts-nocheck
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { MarkdownReportGenerator } from '../../sidequest/pipeline-core/reports/markdown-report-generator.js';

// Test fixtures
const createIntraProjectScanResult = () => ({
  scan_type: 'intra-project',
  repository_info: {
    name: 'test-repo',
    path: '/path/to/test-repo'
  },
  metrics: {
    total_code_blocks: 100,
    total_duplicate_groups: 10,
    exact_duplicates: 5,
    total_duplicated_lines: 500,
    potential_loc_reduction: 200,
    duplication_percentage: 15.5,
    total_suggestions: 8,
    quick_wins: 3,
    high_priority_suggestions: 2
  },
  duplicate_groups: [
    {
      group_id: 'dup-001',
      pattern_id: 'function-declaration',
      category: 'utility',
      language: 'javascript',
      occurrence_count: 5,
      total_lines: 50,
      impact_score: 85,
      similarity_score: 0.95,
      similarity_method: 'structural',
      affected_files: ['src/utils.js', 'src/helpers.js', 'lib/common.js', 'lib/utils.js', 'shared/utils.js', 'extra/file.js']
    },
    {
      group_id: 'dup-002',
      pattern_id: 'api-handler',
      category: 'api',
      language: 'typescript',
      occurrence_count: 3,
      total_lines: 30,
      impact_score: 60,
      similarity_score: 0.85,
      similarity_method: 'semantic',
      affected_files: ['src/api.ts', 'src/handlers.ts']
    }
  ],
  suggestions: [
    {
      suggestion_id: 'sug-001',
      strategy: 'local_util',
      target_location: 'src/utils/shared.js',
      impact_score: 80,
      roi_score: 90,
      complexity: 'simple',
      migration_risk: 'low',
      affected_files_count: 5,
      breaking_changes: false,
      estimated_effort_hours: 2,
      strategy_rationale: 'Extract shared utility functions',
      migration_steps: [
        { step_number: 1, description: 'Create utility file', estimated_time: '30m', automated: true },
        { step_number: 2, description: 'Move functions', estimated_time: '1h', automated: false },
        { step_number: 3, description: 'Update imports', estimated_time: '30m', automated: true },
        { step_number: 4, description: 'Run tests', estimated_time: '15m', automated: true },
        { step_number: 5, description: 'Code review', estimated_time: '15m', automated: false },
        { step_number: 6, description: 'Deploy', estimated_time: '15m', automated: false }
      ]
    },
    {
      suggestion_id: 'sug-002',
      strategy: 'shared_package',
      target_location: '@org/common-utils',
      impact_score: 70,
      roi_score: 60,
      complexity: 'moderate',
      migration_risk: 'medium',
      affected_files_count: 8,
      breaking_changes: true,
      estimated_effort_hours: 8
    }
  ],
  scan_metadata: {
    scanned_at: '2024-01-15T10:00:00Z',
    duration_seconds: 45.5,
    total_code_blocks: 100
  }
});

const createInterProjectScanResult = () => ({
  scan_type: 'inter-project',
  metrics: {
    total_repositories_scanned: 5,
    total_code_blocks: 500,
    total_intra_project_groups: 20,
    total_cross_repository_groups: 15,
    cross_repository_occurrences: 45,
    cross_repository_duplicated_lines: 1500,
    total_suggestions: 12,
    shared_package_candidates: 5,
    mcp_server_candidates: 3,
    average_repositories_per_duplicate: 2.5
  },
  scanned_repositories: [
    { name: 'repo-a', code_blocks: 100, duplicate_groups: 5, error: null },
    { name: 'repo-b', code_blocks: 150, duplicate_groups: 8, error: null },
    { name: 'repo-c', code_blocks: 50, duplicate_groups: 2, error: 'Scan failed' }
  ],
  cross_repository_duplicates: [
    {
      group_id: 'cross-001',
      pattern_id: 'auth-handler',
      category: 'authentication',
      language: 'typescript',
      occurrence_count: 8,
      repository_count: 4,
      affected_repositories: ['repo-a', 'repo-b', 'repo-c', 'repo-d'],
      total_lines: 200,
      impact_score: 95,
      similarity_score: 0.98,
      similarity_method: 'semantic',
      affected_files: ['src/auth.ts', 'lib/auth.ts']
    }
  ],
  cross_repository_suggestions: [
    {
      suggestion_id: 'cross-sug-001',
      strategy: 'mcp_server',
      target_location: '@org/auth-service',
      impact_score: 90,
      roi_score: 85,
      complexity: 'complex',
      migration_risk: 'high',
      affected_repositories: ['repo-a', 'repo-b'],
      breaking_changes: true,
      estimated_effort_hours: 40,
      strategy_rationale: 'Centralize authentication logic',
      migration_steps: [
        { step_number: 1, description: 'Design service', estimated_time: '4h', automated: false }
      ]
    }
  ],
  scan_metadata: {
    scanned_at: '2024-01-15T10:00:00Z',
    duration_seconds: 120.5,
    repository_count: 5
  }
});

describe('MarkdownReportGenerator', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), 'test-md-report-' + Date.now());
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('generateReport - Intra-project', () => {
    it('should generate complete markdown report', () => {
      const scanResult = createIntraProjectScanResult();
      const report = MarkdownReportGenerator.generateReport(scanResult);

      assert.ok(report.includes('# Intra-Project Duplicate Detection Report'));
      assert.ok(report.includes('test-repo'));
      assert.ok(report.includes('## Metrics'));
      assert.ok(report.includes('## Top Duplicate Groups'));
      assert.ok(report.includes('## Top Consolidation Suggestions'));
    });

    it('should include metrics table', () => {
      const scanResult = createIntraProjectScanResult();
      const report = MarkdownReportGenerator.generateReport(scanResult);

      assert.ok(report.includes('| Metric | Value |'));
      assert.ok(report.includes('Total Code Blocks'));
      assert.ok(report.includes('Duplicate Groups'));
      assert.ok(report.includes('Duplication Percentage'));
    });

    it('should include duplicate groups', () => {
      const scanResult = createIntraProjectScanResult();
      const report = MarkdownReportGenerator.generateReport(scanResult);

      assert.ok(report.includes('dup-001'));
      assert.ok(report.includes('function-declaration'));
      assert.ok(report.includes('Impact Score'));
    });

    it('should include suggestions', () => {
      const scanResult = createIntraProjectScanResult();
      const report = MarkdownReportGenerator.generateReport(scanResult);

      assert.ok(report.includes('sug-001'));
      assert.ok(report.includes('Local Utility'));
      assert.ok(report.includes('ROI Score'));
    });

    it('should limit duplicate groups', () => {
      const scanResult = createIntraProjectScanResult();
      const report = MarkdownReportGenerator.generateReport(scanResult, { maxDuplicates: 1 });

      // Only first group should appear
      assert.ok(report.includes('dup-001'));
      // Second group shouldn't appear (it has lower impact score)
    });

    it('should limit suggestions', () => {
      const scanResult = createIntraProjectScanResult();
      const report = MarkdownReportGenerator.generateReport(scanResult, { maxSuggestions: 1 });

      assert.ok(report.includes('sug-001'));
    });

    it('should include affected files when includeDetails is true', () => {
      const scanResult = createIntraProjectScanResult();
      const report = MarkdownReportGenerator.generateReport(scanResult, { includeDetails: true });

      assert.ok(report.includes('Affected Files'));
      assert.ok(report.includes('src/utils.js'));
    });

    it('should truncate affected files list', () => {
      const scanResult = createIntraProjectScanResult();
      const report = MarkdownReportGenerator.generateReport(scanResult, { includeDetails: true });

      // The first group has 6 files, should show 5 + "and X more"
      assert.ok(report.includes('and 1 more'));
    });

    it('should include migration steps when includeDetails is true', () => {
      const scanResult = createIntraProjectScanResult();
      const report = MarkdownReportGenerator.generateReport(scanResult, { includeDetails: true });

      assert.ok(report.includes('Migration Steps'));
      assert.ok(report.includes('Create utility file'));
    });

    it('should truncate migration steps', () => {
      const scanResult = createIntraProjectScanResult();
      const report = MarkdownReportGenerator.generateReport(scanResult, { includeDetails: true });

      // Has 6 steps, should show 5 + "and X more"
      assert.ok(report.includes('and 1 more steps'));
    });
  });

  describe('generateReport - Inter-project', () => {
    it('should generate complete inter-project report', () => {
      const scanResult = createInterProjectScanResult();
      const report = MarkdownReportGenerator.generateReport(scanResult);

      assert.ok(report.includes('# Inter-Project Duplicate Detection Report'));
      assert.ok(report.includes('**Repositories:** 5'));
      assert.ok(report.includes('## Scanned Repositories'));
      assert.ok(report.includes('## Top Cross-Repository Duplicates'));
      assert.ok(report.includes('## Top Cross-Repository Suggestions'));
    });

    it('should include repository table', () => {
      const scanResult = createInterProjectScanResult();
      const report = MarkdownReportGenerator.generateReport(scanResult);

      assert.ok(report.includes('repo-a'));
      assert.ok(report.includes('repo-b'));
      assert.ok(report.includes('Success'));
      assert.ok(report.includes('Scan failed'));
    });

    it('should include cross-repository metrics', () => {
      const scanResult = createInterProjectScanResult();
      const report = MarkdownReportGenerator.generateReport(scanResult);

      assert.ok(report.includes('Repositories Scanned'));
      assert.ok(report.includes('Cross-Repo Groups'));
      assert.ok(report.includes('Shared Package Candidates'));
      assert.ok(report.includes('MCP Server Candidates'));
    });

    it('should show affected repositories in duplicates', () => {
      const scanResult = createInterProjectScanResult();
      const report = MarkdownReportGenerator.generateReport(scanResult);

      assert.ok(report.includes('Repositories:'));
      assert.ok(report.includes('repo-a, repo-b'));
    });
  });

  describe('generateSummary', () => {
    it('should generate concise summary for intra-project', () => {
      const scanResult = createIntraProjectScanResult();
      const summary = MarkdownReportGenerator.generateSummary(scanResult);

      assert.ok(summary.includes('# Duplicate Detection Summary'));
      assert.ok(summary.includes('Code Blocks'));
      assert.ok(summary.includes('Duplicate Groups'));
      assert.ok(summary.includes('Quick Wins'));
    });

    it('should generate concise summary for inter-project', () => {
      const scanResult = createInterProjectScanResult();
      const summary = MarkdownReportGenerator.generateSummary(scanResult);

      assert.ok(summary.includes('# Duplicate Detection Summary'));
      assert.ok(summary.includes('Scanned:'));
      assert.ok(summary.includes('repositories'));
      assert.ok(summary.includes('Cross-Repo Duplicates'));
      assert.ok(summary.includes('MCP Server Candidates'));
    });
  });

  describe('saveReport', () => {
    it('should save report to file', async () => {
      const scanResult = createIntraProjectScanResult();
      const outputPath = path.join(tempDir, 'report.md');

      const savedPath = await MarkdownReportGenerator.saveReport(scanResult, outputPath);

      assert.strictEqual(savedPath, outputPath);

      const content = await fs.readFile(outputPath, 'utf-8');
      assert.ok(content.includes('Duplicate Detection Report'));
    });

    it('should create directories if needed', async () => {
      const scanResult = createIntraProjectScanResult();
      const outputPath = path.join(tempDir, 'nested', 'dir', 'report.md');

      await MarkdownReportGenerator.saveReport(scanResult, outputPath);

      const exists = await fs.access(outputPath).then(() => true).catch(() => false);
      assert.ok(exists);
    });
  });

  describe('saveSummary', () => {
    it('should save summary to file', async () => {
      const scanResult = createIntraProjectScanResult();
      const outputPath = path.join(tempDir, 'summary.md');

      const savedPath = await MarkdownReportGenerator.saveSummary(scanResult, outputPath);

      assert.strictEqual(savedPath, outputPath);

      const content = await fs.readFile(outputPath, 'utf-8');
      assert.ok(content.includes('Duplicate Detection Summary'));
    });
  });

  describe('_formatScore', () => {
    it('should format high score with red indicator', () => {
      const result = MarkdownReportGenerator._formatScore(85);
      assert.ok(result.includes('🔴'));
      assert.ok(result.includes('High'));
    });

    it('should format medium score with yellow indicator', () => {
      const result = MarkdownReportGenerator._formatScore(60);
      assert.ok(result.includes('🟡'));
      assert.ok(result.includes('Medium'));
    });

    it('should format low score with green indicator', () => {
      const result = MarkdownReportGenerator._formatScore(30);
      assert.ok(result.includes('🟢'));
      assert.ok(result.includes('Low'));
    });
  });

  describe('_formatStrategy', () => {
    it('should format local_util strategy', () => {
      const result = MarkdownReportGenerator._formatStrategy('local_util');
      assert.ok(result.includes('📁'));
      assert.ok(result.includes('Local Utility'));
    });

    it('should format shared_package strategy', () => {
      const result = MarkdownReportGenerator._formatStrategy('shared_package');
      assert.ok(result.includes('📦'));
      assert.ok(result.includes('Shared Package'));
    });

    it('should format mcp_server strategy', () => {
      const result = MarkdownReportGenerator._formatStrategy('mcp_server');
      assert.ok(result.includes('🔌'));
      assert.ok(result.includes('MCP Server'));
    });

    it('should format autonomous_agent strategy', () => {
      const result = MarkdownReportGenerator._formatStrategy('autonomous_agent');
      assert.ok(result.includes('🤖'));
      assert.ok(result.includes('Autonomous Agent'));
    });

    it('should return unknown strategy as-is', () => {
      const result = MarkdownReportGenerator._formatStrategy('unknown_strategy');
      assert.strictEqual(result, 'unknown_strategy');
    });
  });

  describe('_formatComplexity', () => {
    it('should format trivial complexity', () => {
      const result = MarkdownReportGenerator._formatComplexity('trivial');
      assert.ok(result.includes('🟢'));
      assert.ok(result.includes('Trivial'));
    });

    it('should format simple complexity', () => {
      const result = MarkdownReportGenerator._formatComplexity('simple');
      assert.ok(result.includes('🟡'));
      assert.ok(result.includes('Simple'));
    });

    it('should format moderate complexity', () => {
      const result = MarkdownReportGenerator._formatComplexity('moderate');
      assert.ok(result.includes('🟠'));
      assert.ok(result.includes('Moderate'));
    });

    it('should format complex complexity', () => {
      const result = MarkdownReportGenerator._formatComplexity('complex');
      assert.ok(result.includes('🔴'));
      assert.ok(result.includes('Complex'));
    });

    it('should return unknown complexity as-is', () => {
      const result = MarkdownReportGenerator._formatComplexity('unknown');
      assert.strictEqual(result, 'unknown');
    });
  });

  describe('_formatRisk', () => {
    it('should format minimal risk', () => {
      const result = MarkdownReportGenerator._formatRisk('minimal');
      assert.ok(result.includes('🟢'));
      assert.ok(result.includes('Minimal'));
    });

    it('should format low risk', () => {
      const result = MarkdownReportGenerator._formatRisk('low');
      assert.ok(result.includes('🟡'));
      assert.ok(result.includes('Low'));
    });

    it('should format medium risk', () => {
      const result = MarkdownReportGenerator._formatRisk('medium');
      assert.ok(result.includes('🟠'));
      assert.ok(result.includes('Medium'));
    });

    it('should format high risk', () => {
      const result = MarkdownReportGenerator._formatRisk('high');
      assert.ok(result.includes('🔴'));
      assert.ok(result.includes('High'));
    });

    it('should return unknown risk as-is', () => {
      const result = MarkdownReportGenerator._formatRisk('unknown');
      assert.strictEqual(result, 'unknown');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty duplicate groups', () => {
      const scanResult = {
        scan_type: 'intra-project',
        repository_info: { name: 'test', path: '/test' },
        metrics: {},
        duplicate_groups: [],
        suggestions: [],
        scan_metadata: {}
      };

      const report = MarkdownReportGenerator.generateReport(scanResult);
      assert.ok(report.includes('No duplicates detected'));
    });

    it('should handle empty suggestions', () => {
      const scanResult = {
        scan_type: 'intra-project',
        repository_info: { name: 'test', path: '/test' },
        metrics: {},
        duplicate_groups: [],
        suggestions: [],
        scan_metadata: {}
      };

      const report = MarkdownReportGenerator.generateReport(scanResult);
      assert.ok(report.includes('No suggestions generated'));
    });

    it('should handle missing fields gracefully', () => {
      const scanResult = {
        scan_type: 'intra-project'
      };

      assert.doesNotThrow(() => {
        MarkdownReportGenerator.generateReport(scanResult);
      });
    });

    it('should handle breaking changes flag', () => {
      const scanResult = createIntraProjectScanResult();
      const report = MarkdownReportGenerator.generateReport(scanResult, { includeDetails: true });

      // Second suggestion has breaking_changes: true
      assert.ok(report.includes('Breaking Changes'));
    });
  });
});

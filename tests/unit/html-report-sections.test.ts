/**
 * Snapshot tests for html-report-sections.ts generators (AG-M1-T1)
 *
 * Covers all 7 exported section generators + isInterProject helper.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  isInterProject,
  generateHeader,
  generateMetrics,
  generateSummaryCharts,
  generateCrossRepoSection,
  generateDuplicateGroups,
  generateSuggestions,
  generateFooter,
} from '../../sidequest/pipeline-core/reports/html-report-sections.ts';
import type { ScanResult } from '../../sidequest/pipeline-core/reports/json-report-generator.ts';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const INTRA_RESULT: ScanResult = {
  scan_type: 'intra-project',
  scan_metadata: {
    scanned_at: '2026-01-15T10:30:00Z',
    duration_seconds: 12.5,
  },
  metrics: {
    total_code_blocks: 100,
    total_duplicate_groups: 5,
    exact_duplicates: 2,
    total_duplicated_lines: 80,
    potential_loc_reduction: 40,
    quick_wins: 3,
  },
  duplicate_groups: [
    {
      group_id: 'grp-1',
      pattern_id: 'pat-1',
      category: 'function',
      language: 'typescript',
      occurrence_count: 3,
      total_lines: 45,
      impact_score: 85,
      similarity_score: 0.95,
      similarity_method: 'structural',
      affected_files: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
    },
  ],
  suggestions: [
    {
      suggestion_id: 'sug-1',
      duplicate_group_id: 'grp-1',
      strategy: 'local_util',
      target_location: 'src/utils/shared.ts',
      impact_score: 85,
      roi_score: 90,
      complexity: 'simple',
      migration_risk: 'low',
      estimated_effort_hours: 2,
      breaking_changes: false,
      strategy_rationale: 'Extract to shared utility',
    },
  ],
};

const INTER_RESULT: ScanResult = {
  scan_type: 'inter-project',
  scan_metadata: {
    scanned_at: '2026-01-15T10:30:00Z',
    duration_seconds: 30,
  },
  metrics: {
    total_repositories_scanned: 3,
    total_code_blocks: 200,
    total_cross_repository_groups: 7,
    cross_repository_duplicated_lines: 120,
    shared_package_candidates: 2,
    mcp_server_candidates: 1,
  },
  scanned_repositories: [
    { name: 'repo-a', code_blocks: 80, duplicate_groups: 3 },
    { name: 'repo-b', code_blocks: 70, duplicate_groups: 2 },
    { name: 'repo-c', error: 'Clone failed' },
  ],
  cross_repository_duplicates: [
    {
      group_id: 'xgrp-1',
      pattern_id: 'xpat-1',
      category: 'class',
      language: 'typescript',
      occurrence_count: 4,
      total_lines: 90,
      impact_score: 75,
      similarity_score: 0.88,
      similarity_method: 'structural',
      repository_count: 2,
      affected_files: ['repo-a/src/x.ts', 'repo-b/src/y.ts'],
    },
  ],
  cross_repository_suggestions: [
    {
      suggestion_id: 'xsug-1',
      duplicate_group_id: 'xgrp-1',
      strategy: 'shared_package',
      target_location: 'packages/shared',
      impact_score: 75,
      roi_score: 82,
      complexity: 'moderate',
      migration_risk: 'medium',
      breaking_changes: true,
      strategy_rationale: 'Create shared package',
    },
  ],
};

const EMPTY_RESULT: ScanResult = {
  scan_type: 'intra-project',
  scan_metadata: undefined,
  metrics: undefined,
  duplicate_groups: [],
  suggestions: [],
};

// ---------------------------------------------------------------------------
// isInterProject
// ---------------------------------------------------------------------------

describe('isInterProject', () => {
  it('returns true for inter-project scan', () => {
    assert.strictEqual(isInterProject(INTER_RESULT), true);
  });

  it('returns false for intra-project scan', () => {
    assert.strictEqual(isInterProject(INTRA_RESULT), false);
  });
});

// ---------------------------------------------------------------------------
// generateHeader
// ---------------------------------------------------------------------------

describe('generateHeader', () => {
  it('renders intra-project header', () => {
    const html = generateHeader(INTRA_RESULT, 'Test Report');
    assert.ok(html.includes('Test Report'));
    assert.ok(html.includes('Intra-Project'));
    assert.ok(html.includes('12'));
  });

  it('renders inter-project header', () => {
    const html = generateHeader(INTER_RESULT, 'Cross-Repo Report');
    assert.ok(html.includes('Cross-Repo Report'));
    assert.ok(html.includes('Inter-Project'));
  });

  it('escapes HTML in title', () => {
    const html = generateHeader(INTRA_RESULT, '<script>alert(1)</script>');
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });

  it('handles missing metadata gracefully', () => {
    const html = generateHeader(EMPTY_RESULT, 'Empty');
    assert.ok(html.includes('Empty'));
    assert.ok(html.includes('Duration'));
  });
});

// ---------------------------------------------------------------------------
// generateMetrics
// ---------------------------------------------------------------------------

describe('generateMetrics', () => {
  it('renders intra-project metrics', () => {
    const html = generateMetrics(INTRA_RESULT);
    assert.ok(html.includes('100'));
    assert.ok(html.includes('Code Blocks Detected'));
    assert.ok(html.includes('Quick Wins'));
  });

  it('renders inter-project metrics', () => {
    const html = generateMetrics(INTER_RESULT);
    assert.ok(html.includes('Repositories Scanned'));
    assert.ok(html.includes('Cross-Repo Duplicates'));
    assert.ok(html.includes('MCP Server Candidates'));
  });

  it('defaults to 0 for missing metrics', () => {
    const html = generateMetrics(EMPTY_RESULT);
    assert.ok(html.includes('0'));
  });
});

// ---------------------------------------------------------------------------
// generateSummaryCharts
// ---------------------------------------------------------------------------

describe('generateSummaryCharts', () => {
  it('renders strategy and complexity bars for intra-project', () => {
    const html = generateSummaryCharts(INTRA_RESULT);
    assert.ok(html.includes('By Strategy'));
    assert.ok(html.includes('By Complexity'));
    assert.ok(html.includes('local util'));
    assert.ok(html.includes('simple'));
  });

  it('uses cross_repository_suggestions for inter-project', () => {
    const html = generateSummaryCharts(INTER_RESULT);
    assert.ok(html.includes('shared package'));
    assert.ok(html.includes('moderate'));
  });

  it('renders empty state when no suggestions', () => {
    const html = generateSummaryCharts(EMPTY_RESULT);
    assert.ok(html.includes('No suggestions to chart'));
  });
});

// ---------------------------------------------------------------------------
// generateCrossRepoSection
// ---------------------------------------------------------------------------

describe('generateCrossRepoSection', () => {
  it('renders scanned repositories', () => {
    const html = generateCrossRepoSection(INTER_RESULT);
    assert.ok(html.includes('repo-a'));
    assert.ok(html.includes('repo-b'));
    assert.ok(html.includes('80 blocks'));
  });

  it('renders error state for failed repos', () => {
    const html = generateCrossRepoSection(INTER_RESULT);
    assert.ok(html.includes('Clone failed'));
    assert.ok(html.includes('error'));
  });

  it('handles empty repositories array', () => {
    const html = generateCrossRepoSection(EMPTY_RESULT);
    assert.ok(html.includes('Scanned Repositories'));
  });
});

// ---------------------------------------------------------------------------
// generateDuplicateGroups
// ---------------------------------------------------------------------------

describe('generateDuplicateGroups', () => {
  it('renders intra-project duplicate groups', () => {
    const html = generateDuplicateGroups(INTRA_RESULT);
    assert.ok(html.includes('grp-1'));
    assert.ok(html.includes('pat-1'));
    assert.ok(html.includes('85'));
    assert.ok(html.includes('3 occurrences'));
    assert.ok(html.includes('src/a.ts'));
  });

  it('renders inter-project duplicate groups with repo count', () => {
    const html = generateDuplicateGroups(INTER_RESULT);
    assert.ok(html.includes('xgrp-1'));
    assert.ok(html.includes('2 repositories'));
  });

  it('renders empty state when no groups', () => {
    const html = generateDuplicateGroups(EMPTY_RESULT);
    assert.ok(html.includes('No duplicate groups detected'));
  });
});

// ---------------------------------------------------------------------------
// generateSuggestions
// ---------------------------------------------------------------------------

describe('generateSuggestions', () => {
  it('renders intra-project suggestions with ROI', () => {
    const html = generateSuggestions(INTRA_RESULT);
    assert.ok(html.includes('sug-1'));
    assert.ok(html.includes('local util'));
    assert.ok(html.includes('ROI: 90%'));
    assert.ok(html.includes('src/utils/shared.ts'));
    assert.ok(html.includes('~2h effort'));
  });

  it('renders inter-project suggestions with breaking change warning', () => {
    const html = generateSuggestions(INTER_RESULT);
    assert.ok(html.includes('xsug-1'));
    assert.ok(html.includes('Breaking Change'));
    assert.ok(html.includes('breaking'));
  });

  it('renders empty state when no suggestions', () => {
    const html = generateSuggestions(EMPTY_RESULT);
    assert.ok(html.includes('No suggestions generated'));
  });

  it('renders strategy rationale', () => {
    const html = generateSuggestions(INTRA_RESULT);
    assert.ok(html.includes('Extract to shared utility'));
  });
});

// ---------------------------------------------------------------------------
// generateFooter
// ---------------------------------------------------------------------------

describe('generateFooter', () => {
  it('renders footer with timestamp', () => {
    const html = generateFooter(INTRA_RESULT);
    assert.ok(html.includes('Duplicate Detection Pipeline'));
    assert.ok(html.includes('footer'));
  });

  it('handles missing timestamp gracefully', () => {
    const html = generateFooter(EMPTY_RESULT);
    assert.ok(html.includes('footer'));
  });
});

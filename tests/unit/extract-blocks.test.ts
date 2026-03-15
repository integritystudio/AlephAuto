/**
 * Unit Tests for extractors/extract-blocks.ts
 *
 * Tests language detection, function name extraction, dedup, and full pipeline.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectLanguage,
  extractFunctionName,
  deduplicateBlocks,
  extractCodeBlocks,
  groupDuplicates,
  generateSuggestions,
  calculateMetrics,
  runPipeline,
} from '../../sidequest/pipeline-core/extractors/extract-blocks.ts';
import type { CodeBlock, DuplicateGroup } from '../../sidequest/pipeline-core/models/types.ts';

function makeBlock(overrides: Partial<CodeBlock> = {}): CodeBlock {
  return {
    blockId: 'cb_test',
    patternId: 'object-manipulation',
    location: { filePath: 'src/utils.ts', lineStart: 1, lineEnd: 5 },
    relativePath: 'src/utils.ts',
    sourceCode: 'const x = Object.keys(data);',
    language: 'typescript',
    category: 'utility',
    tags: [],
    repositoryPath: '/repo',
    lineCount: 5,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// detectLanguage
// ---------------------------------------------------------------------------

describe('detectLanguage', () => {
  it('should detect TypeScript', () => {
    assert.equal(detectLanguage('src/utils.ts'), 'typescript');
    assert.equal(detectLanguage('src/app.tsx'), 'typescript');
  });

  it('should detect JavaScript', () => {
    assert.equal(detectLanguage('lib/index.js'), 'javascript');
    assert.equal(detectLanguage('lib/app.jsx'), 'javascript');
    assert.equal(detectLanguage('lib/config.mjs'), 'javascript');
    assert.equal(detectLanguage('lib/config.cjs'), 'javascript');
  });

  it('should detect Python', () => {
    assert.equal(detectLanguage('script.py'), 'python');
  });

  it('should return unknown for unrecognized extensions', () => {
    assert.equal(detectLanguage('README.md'), 'unknown');
    assert.equal(detectLanguage('data.csv'), 'unknown');
  });

  it('should handle paths with directories', () => {
    assert.equal(detectLanguage('src/components/Button.tsx'), 'typescript');
  });

  it('should detect Go', () => {
    assert.equal(detectLanguage('main.go'), 'go');
  });

  it('should detect Rust', () => {
    assert.equal(detectLanguage('lib.rs'), 'rust');
  });
});

// ---------------------------------------------------------------------------
// extractFunctionName
// ---------------------------------------------------------------------------

describe('extractFunctionName', () => {
  it('should extract named function', () => {
    assert.equal(extractFunctionName('function myFunc() {}'), 'myFunc');
  });

  it('should extract const arrow function', () => {
    assert.equal(extractFunctionName('const handler = (req, res) => {}'), 'handler');
  });

  it('should extract async function', () => {
    assert.equal(extractFunctionName('async function fetchData() {}'), 'fetchData');
  });

  it('should extract const async arrow', () => {
    assert.equal(extractFunctionName('const getData = async (id) => {}'), 'getData');
  });

  it('should extract export function', () => {
    assert.equal(extractFunctionName('export function processItems() {}'), 'processItems');
  });

  it('should extract export const', () => {
    assert.equal(extractFunctionName('export const validate = (input) => {}'), 'validate');
  });

  it('should return undefined for no function', () => {
    assert.equal(extractFunctionName('const x = 1;'), undefined);
  });

  it('should return undefined for empty string', () => {
    assert.equal(extractFunctionName(''), undefined);
  });
});

// ---------------------------------------------------------------------------
// deduplicateBlocks
// ---------------------------------------------------------------------------

describe('deduplicateBlocks', () => {
  it('should keep unique blocks', () => {
    const blocks = [
      makeBlock({ blockId: 'cb_1', location: { filePath: 'a.ts', lineStart: 1, lineEnd: 5 } }),
      makeBlock({ blockId: 'cb_2', location: { filePath: 'b.ts', lineStart: 1, lineEnd: 5 } }),
    ];
    const result = deduplicateBlocks(blocks);
    assert.equal(result.length, 2);
  });

  it('should remove location duplicates', () => {
    const blocks = [
      makeBlock({ blockId: 'cb_1' }),
      makeBlock({ blockId: 'cb_2' }), // same file:line
    ];
    const result = deduplicateBlocks(blocks);
    assert.equal(result.length, 1);
  });

  it('should remove function duplicates keeping earlier occurrence', () => {
    const blocks = [
      makeBlock({
        blockId: 'cb_1',
        location: { filePath: 'a.ts', lineStart: 10, lineEnd: 15 },
        tags: ['function:doStuff'],
      }),
      makeBlock({
        blockId: 'cb_2',
        location: { filePath: 'a.ts', lineStart: 5, lineEnd: 10 },
        tags: ['function:doStuff'],
      }),
    ];
    const result = deduplicateBlocks(blocks);
    assert.equal(result.length, 1);
    assert.equal(result[0].location.lineStart, 5);
  });
});

// ---------------------------------------------------------------------------
// extractCodeBlocks
// ---------------------------------------------------------------------------

describe('extractCodeBlocks', () => {
  it('should create blocks from pattern matches', () => {
    const matches = [
      { file_path: 'src/utils.ts', rule_id: 'object-manipulation', matched_text: 'Object.keys(data)', line_start: 1, line_end: 1 },
      { file_path: 'src/helpers.ts', rule_id: 'array-map-filter', matched_text: 'items.filter(x => x)', line_start: 5, line_end: 5 },
    ];
    const blocks = extractCodeBlocks(matches, { path: '/repo' });
    assert.equal(blocks.length, 2);
    assert.equal(blocks[0].language, 'typescript');
    assert.equal(blocks[0].category, 'utility');
  });

  it('should handle empty matches', () => {
    const blocks = extractCodeBlocks([], { path: '/repo' });
    assert.equal(blocks.length, 0);
  });
});

// ---------------------------------------------------------------------------
// generateSuggestions
// ---------------------------------------------------------------------------

describe('generateSuggestions', () => {
  it('should generate suggestion for each group', () => {
    const groups: DuplicateGroup[] = [{
      groupId: 'dg_test',
      patternId: 'object-manipulation',
      memberBlockIds: ['cb_1', 'cb_2'],
      similarityScore: 0.95,
      similarityMethod: 'exact_match',
      category: 'utility',
      language: 'typescript',
      occurrenceCount: 2,
      totalLines: 10,
      affectedFiles: ['a.ts', 'b.ts'],
      affectedRepositories: ['/repo'],
    }];
    const suggestions = generateSuggestions(groups);
    assert.equal(suggestions.length, 1);
    assert.ok(suggestions[0].strategy);
    assert.ok(suggestions[0].migrationSteps.length > 0);
  });

  it('should use local_util for single file', () => {
    const groups: DuplicateGroup[] = [{
      groupId: 'dg_test',
      patternId: 'object-manipulation',
      memberBlockIds: ['cb_1', 'cb_2'],
      similarityScore: 0.95,
      similarityMethod: 'exact_match',
      category: 'utility',
      language: 'typescript',
      occurrenceCount: 2,
      totalLines: 10,
      affectedFiles: ['a.ts'],
      affectedRepositories: ['/repo'],
    }];
    const suggestions = generateSuggestions(groups);
    assert.equal(suggestions[0].strategy, 'local_util');
  });
});

// ---------------------------------------------------------------------------
// calculateMetrics
// ---------------------------------------------------------------------------

describe('calculateMetrics', () => {
  it('should calculate basic metrics', () => {
    const blocks = [makeBlock({ lineCount: 5 }), makeBlock({ blockId: 'cb_2', lineCount: 5 })];
    const metrics = calculateMetrics(blocks, [], []);
    assert.equal(metrics.total_code_blocks, 2);
    assert.equal(metrics.total_duplicate_groups, 0);
  });

  it('should count semantic groups correctly when mixed similarity methods are present', () => {
    const groups: DuplicateGroup[] = [
      {
        groupId: 'dg_exact',
        patternId: 'array-filter',
        memberBlockIds: ['cb_1', 'cb_2'],
        similarityScore: 1.0,
        similarityMethod: 'exact_match',
        category: 'utility',
        language: 'typescript',
        occurrenceCount: 2,
        totalLines: 10,
        affectedFiles: ['a.ts', 'b.ts'],
        affectedRepositories: ['/repo'],
      },
      {
        groupId: 'dg_structural',
        patternId: 'array-filter',
        memberBlockIds: ['cb_3', 'cb_4'],
        similarityScore: 0.92,
        similarityMethod: 'structural',
        category: 'utility',
        language: 'typescript',
        occurrenceCount: 2,
        totalLines: 12,
        affectedFiles: ['c.ts', 'd.ts'],
        affectedRepositories: ['/repo'],
      },
      {
        groupId: 'dg_semantic_1',
        patternId: 'array-filter',
        memberBlockIds: ['cb_5', 'cb_6'],
        similarityScore: 0.82,
        similarityMethod: 'semantic',
        category: 'utility',
        language: 'typescript',
        occurrenceCount: 2,
        totalLines: 14,
        affectedFiles: ['e.ts', 'f.ts'],
        affectedRepositories: ['/repo'],
      },
      {
        groupId: 'dg_semantic_2',
        patternId: 'array-filter',
        memberBlockIds: ['cb_7', 'cb_8'],
        similarityScore: 0.75,
        similarityMethod: 'semantic',
        category: 'utility',
        language: 'typescript',
        occurrenceCount: 2,
        totalLines: 16,
        affectedFiles: ['g.ts', 'h.ts'],
        affectedRepositories: ['/repo'],
      },
    ];
    const metrics = calculateMetrics([], groups, []);
    // H4: semantic_duplicates must equal the count of groups with similarityMethod === 'semantic'
    assert.equal(metrics.semantic_duplicates, 2);
    // H4: metrics must also expose semantic_duplicate_lines — total lines across semantic groups only
    const expectedSemanticLines = 14 + 16;
    assert.equal(
      metrics.semantic_duplicate_lines,
      expectedSemanticLines,
      `Expected semantic_duplicate_lines=${expectedSemanticLines}, got ${metrics.semantic_duplicate_lines}`
    );
  });

  it('should return 0 semantic_duplicates and 0 semantic_duplicate_lines when no semantic groups exist', () => {
    const groups: DuplicateGroup[] = [
      {
        groupId: 'dg_exact',
        patternId: 'array-filter',
        memberBlockIds: ['cb_1', 'cb_2'],
        similarityScore: 1.0,
        similarityMethod: 'exact_match',
        category: 'utility',
        language: 'typescript',
        occurrenceCount: 2,
        totalLines: 10,
        affectedFiles: ['a.ts', 'b.ts'],
        affectedRepositories: ['/repo'],
      },
      {
        groupId: 'dg_structural',
        patternId: 'array-filter',
        memberBlockIds: ['cb_3', 'cb_4'],
        similarityScore: 0.93,
        similarityMethod: 'structural',
        category: 'utility',
        language: 'typescript',
        occurrenceCount: 2,
        totalLines: 12,
        affectedFiles: ['c.ts', 'd.ts'],
        affectedRepositories: ['/repo'],
      },
    ];
    const metrics = calculateMetrics([], groups, []);
    assert.equal(metrics.semantic_duplicates, 0);
    // H4: semantic_duplicate_lines must be 0 when no semantic groups exist
    assert.equal(
      metrics.semantic_duplicate_lines,
      0,
      `Expected semantic_duplicate_lines=0, got ${metrics.semantic_duplicate_lines}`
    );
  });
});

// ---------------------------------------------------------------------------
// runPipeline (integration-level)
// ---------------------------------------------------------------------------

describe('runPipeline', () => {
  it('should run full pipeline with no matches', () => {
    const result = runPipeline({
      repository_info: { path: '/repo' },
      pattern_matches: [],
    });
    assert.equal(result.code_blocks.length, 0);
    assert.equal(result.duplicate_groups.length, 0);
    assert.equal(result.suggestions.length, 0);
    assert.equal(result.metrics.total_code_blocks, 0);
  });

  it('should produce output for pattern matches', () => {
    const result = runPipeline({
      repository_info: { path: '/repo' },
      pattern_matches: [
        { file_path: 'src/a.ts', rule_id: 'object-manipulation', matched_text: 'Object.keys(data)', line_start: 1, line_end: 1 },
        { file_path: 'src/b.ts', rule_id: 'object-manipulation', matched_text: 'Object.keys(data)', line_start: 1, line_end: 1 },
      ],
    });
    assert.ok(result.code_blocks.length >= 2);
    assert.ok(typeof result.metrics.total_code_blocks === 'number');
  });

  it('should produce semantic_duplicates >= 1 when blocks are semantically equivalent but not exact or structural matches', () => {
    // Block A: functional style — filter then map
    const functionalCode = [
      'function getActiveNames(items) {',
      '  const active = items.filter(item => item.active === true);',
      '  const names = active.map(item => item.name);',
      '  if (names.length === 0) {',
      '    return [];',
      '  }',
      '  return names;',
      '}',
    ].join('\n');

    // Block B: imperative style — iterate + conditional push — semantically equivalent
    // Uses completely different identifiers and structure so structural similarity < 0.90
    const imperativeCode = [
      'function collectLabels(records) {',
      '  const output = [];',
      '  for (let idx = 0; idx < records.length; idx++) {',
      '    const rec = records[idx];',
      '    if (rec.enabled) {',
      '      output.push(rec.label);',
      '    }',
      '  }',
      '  if (output.length === 0) {',
      '    return [];',
      '  }',
      '  return output;',
      '}',
    ].join('\n');

    const result = runPipeline({
      repository_info: { path: '/repo' },
      pattern_matches: [
        {
          file_path: 'src/utils-a.ts',
          rule_id: 'array-transform',
          matched_text: functionalCode,
          line_start: 1,
          line_end: 8,
        },
        {
          file_path: 'src/utils-b.ts',
          rule_id: 'array-transform',
          matched_text: imperativeCode,
          line_start: 1,
          line_end: 13,
        },
      ],
    });

    const semanticCount = result.metrics.semantic_duplicates as number;
    assert.ok(
      semanticCount >= 1,
      `Expected semantic_duplicates >= 1 but got ${semanticCount}. groups: ${JSON.stringify(result.duplicate_groups.map(g => ({ method: g.similarity_method, score: g.similarity_score })))}`
    );

    // H4: full pipeline must also expose semantic_duplicate_lines in metrics
    const semanticLines = result.metrics.semantic_duplicate_lines as number;
    assert.ok(
      typeof semanticLines === 'number' && semanticLines >= 1,
      `Expected metrics.semantic_duplicate_lines >= 1 but got ${semanticLines}`
    );
  });
});

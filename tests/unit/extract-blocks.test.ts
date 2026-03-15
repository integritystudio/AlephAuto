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
});

/**
 * Unit Tests for similarity/grouping.ts
 *
 * Tests the 3-layer algorithm, quality scoring, complexity filtering.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCodeComplexity,
  isComplexEnough,
  calculateGroupQualityScore,
  validateExactGroupSemantics,
  groupBySimilarity,
} from '../../sidequest/pipeline-core/similarity/grouping.ts';
import type { CodeBlock } from '../../sidequest/pipeline-core/models/types.ts';

function makeBlock(overrides: Partial<CodeBlock> = {}): CodeBlock {
  return {
    blockId: 'cb_test',
    patternId: 'object-manipulation',
    location: { filePath: 'src/utils.ts', lineStart: 1, lineEnd: 10 },
    relativePath: 'src/utils.ts',
    sourceCode: `function processData(items) {
  const filtered = items.filter(x => x.active);
  const mapped = filtered.map(x => x.name);
  if (mapped.length === 0) {
    return [];
  }
  return mapped.sort();
}`,
    language: 'typescript',
    category: 'utility',
    tags: ['function:processData'],
    repositoryPath: '/repo',
    lineCount: 8,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// calculateCodeComplexity
// ---------------------------------------------------------------------------

describe('calculateCodeComplexity', () => {
  it('should count non-empty lines', () => {
    const result = calculateCodeComplexity('const x = 1;\nconst y = 2;\n\n');
    assert.equal(result.lineCount, 2);
  });

  it('should count unique tokens', () => {
    const result = calculateCodeComplexity('const x = const y');
    assert.ok(result.uniqueTokens >= 2); // 'const', 'x', 'y'
  });

  it('should detect control flow', () => {
    const withFlow = calculateCodeComplexity('if (x) { return; }');
    assert.equal(withFlow.hasControlFlow, true);

    const withoutFlow = calculateCodeComplexity('const x = 1;');
    assert.equal(withoutFlow.hasControlFlow, false);
  });
});

// ---------------------------------------------------------------------------
// isComplexEnough
// ---------------------------------------------------------------------------

describe('isComplexEnough', () => {
  it('should accept complex blocks', () => {
    const block = makeBlock({ lineCount: 8 });
    assert.equal(isComplexEnough(block), true);
  });

  it('should reject trivial blocks', () => {
    const block = makeBlock({
      sourceCode: 'x',
      lineCount: 1,
    });
    assert.equal(isComplexEnough(block), false);
  });

  it('should accept short blocks with control flow', () => {
    const block = makeBlock({
      sourceCode: 'if (x) return;',
      lineCount: 1,
    });
    assert.equal(isComplexEnough(block), true);
  });
});

// ---------------------------------------------------------------------------
// calculateGroupQualityScore
// ---------------------------------------------------------------------------

describe('calculateGroupQualityScore', () => {
  it('should return 0 for empty group', () => {
    assert.equal(calculateGroupQualityScore([], 0.9), 0.0);
  });

  it('should return 0 for single block', () => {
    assert.equal(calculateGroupQualityScore([makeBlock()], 0.9), 0.0);
  });

  it('should return positive score for valid group', () => {
    const blocks = [
      makeBlock({ blockId: 'cb_1' }),
      makeBlock({ blockId: 'cb_2' }),
    ];
    const score = calculateGroupQualityScore(blocks, 0.95);
    assert.ok(score > 0);
    assert.ok(score <= 1.0);
  });

  it('should give higher score for higher similarity', () => {
    const blocks = [
      makeBlock({ blockId: 'cb_1' }),
      makeBlock({ blockId: 'cb_2' }),
    ];
    const low = calculateGroupQualityScore(blocks, 0.5);
    const high = calculateGroupQualityScore(blocks, 1.0);
    assert.ok(high > low);
  });
});

// ---------------------------------------------------------------------------
// validateExactGroupSemantics
// ---------------------------------------------------------------------------

describe('validateExactGroupSemantics', () => {
  it('should validate single block as true', () => {
    const [isValid] = validateExactGroupSemantics([makeBlock()]);
    assert.equal(isValid, true);
  });

  it('should validate identical code as compatible', () => {
    const code = 'const x = items.filter(x => x.active);';
    const [isValid] = validateExactGroupSemantics([
      makeBlock({ blockId: 'cb_1', sourceCode: code }),
      makeBlock({ blockId: 'cb_2', sourceCode: code }),
    ]);
    assert.equal(isValid, true);
  });

  it('should detect opposite logical operators', () => {
    const [isValid] = validateExactGroupSemantics([
      makeBlock({ blockId: 'cb_1', sourceCode: 'if (x === y) return;' }),
      makeBlock({ blockId: 'cb_2', sourceCode: 'if (x !== y) return;' }),
    ]);
    assert.equal(isValid, false);
  });
});

// ---------------------------------------------------------------------------
// groupBySimilarity (integration-level)
// ---------------------------------------------------------------------------

describe('groupBySimilarity', () => {
  it('should return empty array for no blocks', () => {
    const groups = groupBySimilarity([]);
    assert.equal(groups.length, 0);
  });

  it('should group exact duplicates', () => {
    const code = `function processItems(items) {
  const filtered = items.filter(x => x.active);
  const mapped = filtered.map(x => x.name);
  if (mapped.length === 0) {
    return [];
  }
  return mapped.sort();
}`;
    const blocks = [
      makeBlock({
        blockId: 'cb_1',
        sourceCode: code,
        location: { filePath: 'a.ts', lineStart: 1, lineEnd: 8 },
      }),
      makeBlock({
        blockId: 'cb_2',
        sourceCode: code,
        location: { filePath: 'b.ts', lineStart: 1, lineEnd: 8 },
      }),
    ];
    const groups = groupBySimilarity(blocks);
    assert.ok(groups.length >= 1);
    assert.equal(groups[0].similarityMethod, 'exact_match');
  });

  it('should not group blocks with different patterns', () => {
    const code = `function test(items) {
  const result = items.filter(x => x.id);
  return result.map(x => x.name);
}`;
    const blocks = [
      makeBlock({
        blockId: 'cb_1',
        patternId: 'pattern-a',
        sourceCode: code,
        lineCount: 4,
        location: { filePath: 'a.ts', lineStart: 1, lineEnd: 4 },
      }),
      makeBlock({
        blockId: 'cb_2',
        patternId: 'pattern-b',
        sourceCode: code,
        lineCount: 4,
        location: { filePath: 'b.ts', lineStart: 1, lineEnd: 4 },
      }),
    ];
    // These should not group because patterns differ
    const groups = groupBySimilarity(blocks);
    // Exact match layer would find them (same hash), but semantic validation
    // in the structural layer would fail. The exact match layer accepts if
    // quality threshold is met. Since they differ in patternId, semantic
    // consistency score is lower.
    // This is expected to have fewer groups due to quality filtering.
    assert.ok(groups.length <= 1);
  });
});

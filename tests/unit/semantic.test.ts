/**
 * Unit Tests for similarity/semantic.ts
 *
 * Tests semantic compatibility, tag overlap, and group validation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  areSemanticallyCompatible,
  calculateTagOverlap,
  validateDuplicateGroup,
} from '../../sidequest/pipeline-core/similarity/semantic.ts';
import type { CodeBlock } from '../../sidequest/pipeline-core/models/types.ts';

function makeBlock(overrides: Partial<CodeBlock> = {}): CodeBlock {
  return {
    blockId: 'cb_test1',
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
// areSemanticallyCompatible
// ---------------------------------------------------------------------------

describe('areSemanticallyCompatible', () => {
  it('should return true for compatible blocks', () => {
    const b1 = makeBlock({ blockId: 'cb_1' });
    const b2 = makeBlock({ blockId: 'cb_2', location: { filePath: 'src/helpers.ts', lineStart: 10, lineEnd: 14 } });
    assert.equal(areSemanticallyCompatible(b1, b2), true);
  });

  it('should return false for different patterns', () => {
    const b1 = makeBlock({ blockId: 'cb_1', patternId: 'object-manipulation' });
    const b2 = makeBlock({ blockId: 'cb_2', patternId: 'array-map-filter' });
    assert.equal(areSemanticallyCompatible(b1, b2), false);
  });

  it('should return false for different categories', () => {
    const b1 = makeBlock({ blockId: 'cb_1', category: 'utility' });
    const b2 = makeBlock({ blockId: 'cb_2', category: 'validator' });
    assert.equal(areSemanticallyCompatible(b1, b2), false);
  });

  it('should return false for same function in same file', () => {
    const b1 = makeBlock({ blockId: 'cb_1', tags: ['function:doStuff'] });
    const b2 = makeBlock({ blockId: 'cb_2', tags: ['function:doStuff'] });
    assert.equal(areSemanticallyCompatible(b1, b2), false);
  });

  it('should return true for same function in different files', () => {
    const b1 = makeBlock({ blockId: 'cb_1', tags: ['function:doStuff'] });
    const b2 = makeBlock({
      blockId: 'cb_2',
      tags: ['function:doStuff'],
      location: { filePath: 'src/other.ts', lineStart: 1, lineEnd: 5 },
    });
    assert.equal(areSemanticallyCompatible(b1, b2), true);
  });

  it('should return false when line ratio is below threshold', () => {
    const b1 = makeBlock({ blockId: 'cb_1', lineCount: 10 });
    const b2 = makeBlock({ blockId: 'cb_2', lineCount: 2 }); // ratio = 0.2 < 0.5
    assert.equal(areSemanticallyCompatible(b1, b2), false);
  });
});

// ---------------------------------------------------------------------------
// calculateTagOverlap
// ---------------------------------------------------------------------------

describe('calculateTagOverlap', () => {
  it('should return 1.0 when both have no tags', () => {
    const b1 = makeBlock({ tags: [] });
    const b2 = makeBlock({ tags: [] });
    assert.equal(calculateTagOverlap(b1, b2), 1.0);
  });

  it('should return 0.5 when one has tags and other does not', () => {
    const b1 = makeBlock({ tags: ['function:foo'] });
    const b2 = makeBlock({ tags: [] });
    assert.equal(calculateTagOverlap(b1, b2), 0.5);
  });

  it('should calculate Jaccard similarity correctly', () => {
    const b1 = makeBlock({ tags: ['a', 'b', 'c'] });
    const b2 = makeBlock({ tags: ['b', 'c', 'd'] });
    // intersection=2, union=4 → 0.5
    assert.equal(calculateTagOverlap(b1, b2), 0.5);
  });

  it('should return 1.0 for identical tags', () => {
    const b1 = makeBlock({ tags: ['a', 'b'] });
    const b2 = makeBlock({ tags: ['a', 'b'] });
    assert.equal(calculateTagOverlap(b1, b2), 1.0);
  });
});

// ---------------------------------------------------------------------------
// validateDuplicateGroup
// ---------------------------------------------------------------------------

describe('validateDuplicateGroup', () => {
  it('should return false for fewer than 2 blocks', () => {
    assert.equal(validateDuplicateGroup([makeBlock()]), false);
    assert.equal(validateDuplicateGroup([]), false);
  });

  it('should return false for different pattern IDs', () => {
    const blocks = [
      makeBlock({ blockId: 'cb_1', patternId: 'a' }),
      makeBlock({ blockId: 'cb_2', patternId: 'b' }),
    ];
    assert.equal(validateDuplicateGroup(blocks), false);
  });

  it('should return true for valid group', () => {
    const blocks = [
      makeBlock({ blockId: 'cb_1', location: { filePath: 'a.ts', lineStart: 1, lineEnd: 5 } }),
      makeBlock({ blockId: 'cb_2', location: { filePath: 'b.ts', lineStart: 1, lineEnd: 5 } }),
    ];
    assert.equal(validateDuplicateGroup(blocks), true);
  });
});

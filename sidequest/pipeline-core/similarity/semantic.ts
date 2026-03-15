/**
 * Semantic Similarity Validation
 *
 * Third layer of the multi-layer similarity algorithm.
 * Validates that structurally similar code blocks are also semantically equivalent.
 *
 * Ports Python semantic.py.
 */

import type { CodeBlock } from '../models/types.ts';
import {
  SEMANTIC_WEIGHTS,
  BLOCK_EXTRACTION,
} from '../pipeline-constants.ts';

export function areSemanticalltyCompatible(
  block1: CodeBlock,
  block2: CodeBlock
): boolean {
  // Check 1: Must match same ast-grep pattern
  if (block1.patternId !== block2.patternId) return false;

  // Check 2: Must be same semantic category
  if (block1.category !== block2.category) return false;

  // Check 3: Tag compatibility
  const tags1 = new Set(block1.tags);
  const tags2 = new Set(block2.tags);

  const func1 = extractFunctionTag(tags1);
  const func2 = extractFunctionTag(tags2);

  if (func1 && func2) {
    // Same function in same file = already deduplicated, should not group
    if (func1 === func2 && block1.location.filePath === block2.location.filePath) {
      return false;
    }
  }

  // Check 4: Complexity similarity (within 50% difference)
  const lineRatio =
    Math.min(block1.lineCount, block2.lineCount) /
    Math.max(block1.lineCount, block2.lineCount);
  if (lineRatio < SEMANTIC_WEIGHTS.LINE_RATIO_THRESHOLD) {
    return false;
  }

  return true;
}

export function calculateTagOverlap(
  block1: CodeBlock,
  block2: CodeBlock
): number {
  const tags1 = new Set(block1.tags);
  const tags2 = new Set(block2.tags);

  if (tags1.size === 0 && tags2.size === 0) return 1.0;
  if (tags1.size === 0 || tags2.size === 0) {
    return SEMANTIC_WEIGHTS.PARTIAL_TAG_OVERLAP;
  }

  // Jaccard similarity
  let intersection = 0;
  for (const tag of tags1) {
    if (tags2.has(tag)) intersection++;
  }
  const union = new Set([...tags1, ...tags2]).size;
  return union > 0 ? intersection / union : 0.0;
}

export function validateDuplicateGroup(blocks: CodeBlock[]): boolean {
  if (blocks.length < 2) return false;

  // All blocks must have same pattern_id
  const patternIds = new Set(blocks.map((b) => b.patternId));
  if (patternIds.size > 1) return false;

  // All blocks must have same category
  const categories = new Set(blocks.map((b) => b.category));
  if (categories.size > 1) return false;

  // Pairwise semantic compatibility
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      if (!areSemanticalltyCompatible(blocks[i], blocks[j])) return false;
    }
  }

  return true;
}

function extractFunctionTag(tags: Set<string>): string | undefined {
  for (const tag of tags) {
    if (tag.startsWith(BLOCK_EXTRACTION.FUNCTION_TAG_PREFIX)) {
      return tag.slice(BLOCK_EXTRACTION.FUNCTION_TAG_PREFIX.length);
    }
  }
  return undefined;
}

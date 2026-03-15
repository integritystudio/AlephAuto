/**
 * Multi-Layer Similarity Grouping
 *
 * Combines:
 * - Layer 0: Complexity filtering
 * - Layer 1: Exact matching (hash-based)
 * - Layer 2: Structural similarity (AST-based)
 * - Layer 3: Semantic equivalence (category + tags)
 *
 * Ports Python grouping.py.
 */

import type {
  CodeBlock,
  DuplicateGroup,
  SemanticAnnotation,
} from '../models/types.ts';
import { computeContentHash } from '../models/types.ts';
import { SIMILARITY_CONFIG } from './config.ts';
import { SEMANTIC_WEIGHTS } from '../pipeline-constants.ts';
import {
  calculateStructuralSimilarity,
  extractLogicalOperators,
  extractHttpStatusCodes,
  extractSemanticMethods,
  extractMethodChain,
} from './structural.ts';
import {
  areSemanticalltyCompatible,
  validateDuplicateGroup,
} from './semantic.ts';
import { SemanticAnnotator } from '../annotators/semantic-annotator.ts';

const DEBUG = SIMILARITY_CONFIG.DEBUG;

function _stderr(message: string): void {
  process.stderr.write(`${message}\n`);
}

// Opposite logical operator pairs for semantic validation
const OPPOSITE_OPERATOR_PAIRS: Array<[Set<string>, Set<string>]> = [
  [new Set(['===']), new Set(['!=='])],
  [new Set(['==']), new Set(['!='])],
];

// ---------------------------------------------------------------------------
// Semantic Check Infrastructure
// ---------------------------------------------------------------------------

interface SemanticCheckResult {
  isValid: boolean;
  reason: string;
  details?: [unknown, unknown];
}

function _checkMethodChain(code1: string, code2: string): SemanticCheckResult {
  const chain1 = extractMethodChain(code1);
  const chain2 = extractMethodChain(code2);
  if (chain1.join(',') !== chain2.join(',')) {
    return { isValid: false, reason: 'method_chain_mismatch', details: [chain1, chain2] };
  }
  return { isValid: true, reason: 'ok' };
}

function _checkHttpStatusCodes(code1: string, code2: string): SemanticCheckResult {
  const status1 = extractHttpStatusCodes(code1);
  const status2 = extractHttpStatusCodes(code2);
  if (status1.size > 0 && status2.size > 0 && !setsEqual(status1, status2)) {
    return { isValid: false, reason: 'status_code_mismatch', details: [[...status1], [...status2]] };
  }
  return { isValid: true, reason: 'ok' };
}

function _checkLogicalOperators(code1: string, code2: string): SemanticCheckResult {
  const ops1 = extractLogicalOperators(code1);
  const ops2 = extractLogicalOperators(code2);
  for (const [pair1, pair2] of OPPOSITE_OPERATOR_PAIRS) {
    const hasOpposite =
      (isSubset(pair1, ops1) && isSubset(pair2, ops2)) ||
      (isSubset(pair2, ops1) && isSubset(pair1, ops2));
    if (hasOpposite) {
      return { isValid: false, reason: 'opposite_logic', details: [[...ops1], [...ops2]] };
    }
  }
  return { isValid: true, reason: 'ok' };
}

function _checkSemanticMethods(code1: string, code2: string): SemanticCheckResult {
  const methods1 = extractSemanticMethods(code1);
  const methods2 = extractSemanticMethods(code2);
  if (methods1.size > 0 && methods2.size > 0 && !setsEqual(methods1, methods2)) {
    return { isValid: false, reason: 'semantic_method_mismatch', details: [[...methods1], [...methods2]] };
  }
  return { isValid: true, reason: 'ok' };
}

type SemanticCheck = (code1: string, code2: string) => SemanticCheckResult;

const SEMANTIC_CHECKS: SemanticCheck[] = [
  _checkMethodChain,
  _checkHttpStatusCodes,
  _checkLogicalOperators,
  _checkSemanticMethods,
];

function _runSemanticChecks(code1: string, code2: string): SemanticCheckResult {
  for (const check of SEMANTIC_CHECKS) {
    const result = check(code1, code2);
    if (!result.isValid) return result;
  }
  return { isValid: true, reason: 'semantically_compatible' };
}

// ---------------------------------------------------------------------------
// Utility Helpers
// ---------------------------------------------------------------------------

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

function isSubset<T>(subset: Set<T>, superset: Set<T>): boolean {
  for (const item of subset) {
    if (!superset.has(item)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Complexity
// ---------------------------------------------------------------------------

export function calculateCodeComplexity(sourceCode: string): {
  lineCount: number;
  uniqueTokens: number;
  hasControlFlow: boolean;
} {
  const lines = sourceCode
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const tokens = sourceCode.match(/\b\w+\b/g) ?? [];
  const uniqueTokens = new Set(tokens).size;

  const controlFlowKeywords = ['if', 'else', 'for', 'while', 'switch', 'case', 'try', 'catch'];
  const hasControlFlow = controlFlowKeywords.some((kw) => sourceCode.includes(kw));

  return { lineCount: lines.length, uniqueTokens, hasControlFlow };
}

export function isComplexEnough(block: CodeBlock): boolean {
  const complexity = calculateCodeComplexity(block.sourceCode);

  if (complexity.lineCount < SIMILARITY_CONFIG.MIN_LINE_COUNT) return false;
  if (complexity.uniqueTokens < SIMILARITY_CONFIG.MIN_UNIQUE_TOKENS) {
    if (!complexity.hasControlFlow) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Group Quality
// ---------------------------------------------------------------------------

export function calculateGroupQualityScore(
  groupBlocks: CodeBlock[],
  similarityScore: number
): number {
  if (!groupBlocks.length || groupBlocks.length < 2) return 0.0;

  const wSim = SIMILARITY_CONFIG.QUALITY_WEIGHT_SIMILARITY;
  const wSize = SIMILARITY_CONFIG.QUALITY_WEIGHT_SIZE;
  const wComplexity = SIMILARITY_CONFIG.QUALITY_WEIGHT_COMPLEXITY;
  const wSemantic = SIMILARITY_CONFIG.QUALITY_WEIGHT_SEMANTIC;

  const similarityFactor = similarityScore * wSim;
  const sizeFactor = Math.min(groupBlocks.length / SIMILARITY_CONFIG.SIZE_NORMALIZATION, 1.0) * wSize;

  const avgLineCount = groupBlocks.reduce((sum, b) => sum + b.lineCount, 0) / groupBlocks.length;
  const complexityFactor = Math.min(avgLineCount / SIMILARITY_CONFIG.COMPLEXITY_NORMALIZATION, 1.0) * wComplexity;

  const categories = new Set(groupBlocks.map((b) => b.category));
  const patternIds = new Set(groupBlocks.map((b) => b.patternId));

  let semanticScore: number;
  if (categories.size === 1 && patternIds.size === 1) {
    semanticScore = SIMILARITY_CONFIG.SEMANTIC_PERFECT_CONSISTENCY;
  } else if (categories.size === 1) {
    semanticScore = SIMILARITY_CONFIG.SEMANTIC_SAME_CATEGORY;
  } else if (patternIds.size === 1) {
    semanticScore = SIMILARITY_CONFIG.SEMANTIC_SAME_PATTERN;
  } else {
    semanticScore = SIMILARITY_CONFIG.SEMANTIC_MIXED;
  }

  const semanticFactor = semanticScore * wSemantic;
  return similarityFactor + sizeFactor + complexityFactor + semanticFactor;
}

// ---------------------------------------------------------------------------
// Exact Group Semantic Validation
// ---------------------------------------------------------------------------

export function validateExactGroupSemantics(
  groupBlocks: CodeBlock[]
): [boolean, string] {
  if (groupBlocks.length < 2) return [true, 'single_block'];

  for (let i = 0; i < groupBlocks.length; i++) {
    for (let j = i + 1; j < groupBlocks.length; j++) {
      const result = _runSemanticChecks(
        groupBlocks[i].sourceCode,
        groupBlocks[j].sourceCode
      );
      if (!result.isValid) {
        if (result.details) {
          _stderr(`       ${result.details[0]} vs ${result.details[1]}`);
        }
        return [false, `${result.reason}: ${result.details?.[0]} vs ${result.details?.[1]}`];
      }
    }
  }
  return [true, 'semantically_compatible'];
}

// ---------------------------------------------------------------------------
// Group Acceptance
// ---------------------------------------------------------------------------

function _tryAcceptGroup(
  groupBlocks: CodeBlock[],
  similarityScore: number,
  similarityMethod: string,
  groups: DuplicateGroup[],
  groupedBlockIds: Set<string>,
  _layerName: string,
  validateSemantics = false
): boolean {
  if (groupBlocks.length < 2) return false;

  if (validateSemantics) {
    const [isValid] = validateExactGroupSemantics(groupBlocks);
    if (!isValid) return false;
  }

  const qualityScore = calculateGroupQualityScore(groupBlocks, similarityScore);
  if (qualityScore < SIMILARITY_CONFIG.MIN_GROUP_QUALITY) return false;

  const group = _createDuplicateGroup(groupBlocks, similarityScore, similarityMethod);
  groups.push(group);

  for (const block of groupBlocks) {
    groupedBlockIds.add(block.blockId);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Main Grouping Algorithm
// ---------------------------------------------------------------------------

export function groupBySimilarity(
  blocks: CodeBlock[],
  threshold = SIMILARITY_CONFIG.STRUCTURAL_THRESHOLD
): DuplicateGroup[] {
  // Layer 0: Filter trivial blocks
  const complexBlocks = blocks.filter(isComplexEnough);
  const trivialCount = blocks.length - complexBlocks.length;

  if (trivialCount > 0) {
    _stderr(`Layer 0: Filtered ${trivialCount} trivial blocks (below complexity threshold)`);
  }

  const groups: DuplicateGroup[] = [];
  const groupedBlockIds = new Set<string>();

  // Layer 1: Exact matching (hash-based)
  const exactGroups = _groupByExactHash(complexBlocks);

  for (const groupBlocks of exactGroups.values()) {
    _tryAcceptGroup(
      groupBlocks,
      SEMANTIC_WEIGHTS.BOTH_EMPTY_SIMILARITY,
      'exact_match',
      groups,
      groupedBlockIds,
      'Layer 1',
      true
    );
  }

  // Layer 2: Structural similarity (for ungrouped blocks)
  const ungroupedL2 = complexBlocks.filter((b) => !groupedBlockIds.has(b.blockId));
  const structuralGroups = _groupByStructuralSimilarity(ungroupedL2, threshold);

  for (const [groupBlocks, simScore] of structuralGroups) {
    _tryAcceptGroup(groupBlocks, simScore, 'structural', groups, groupedBlockIds, 'Layer 2');
  }

  // Layer 3: Semantic similarity (for remaining ungrouped blocks)
  const ungroupedL3 = complexBlocks.filter((b) => !groupedBlockIds.has(b.blockId));

  if (ungroupedL3.length > 0) {
    const annotator = new SemanticAnnotator(DEBUG);
    const annotations = new Map<string, SemanticAnnotation>();
    for (const block of ungroupedL3) {
      annotations.set(block.blockId, annotator.extractAnnotation(block));
    }

    const semanticGroups = _groupBySemanticSimilarity(
      ungroupedL3,
      annotations,
      SIMILARITY_CONFIG.SEMANTIC_SIMILARITY_THRESHOLD
    );

    for (const [groupBlocks, simScore] of semanticGroups) {
      _tryAcceptGroup(groupBlocks, simScore, 'semantic', groups, groupedBlockIds, 'Layer 3');
    }
  } else {
    _stderr('Layer 3: No ungrouped blocks remaining');
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Layer 1: Exact Hash
// ---------------------------------------------------------------------------

function _groupByExactHash(blocks: CodeBlock[]): Map<string, CodeBlock[]> {
  const hashGroups = new Map<string, CodeBlock[]>();

  for (const block of blocks) {
    const hashVal = computeContentHash(block.sourceCode);
    const existing = hashGroups.get(hashVal);
    if (existing) {
      existing.push(block);
    } else {
      hashGroups.set(hashVal, [block]);
    }
  }

  return hashGroups;
}

// ---------------------------------------------------------------------------
// Layer 2: Structural Similarity
// ---------------------------------------------------------------------------

function _groupByStructuralSimilarity(
  blocks: CodeBlock[],
  threshold: number
): Array<[CodeBlock[], number]> {
  if (!blocks.length) return [];

  const n = blocks.length;
  const groups: Array<[CodeBlock[], number]> = [];
  const used = new Set<number>();

  for (let i = 0; i < n; i++) {
    if (used.has(i)) continue;

    const group = [blocks[i]];
    const similarities: number[] = [];

    for (let j = i + 1; j < n; j++) {
      if (used.has(j)) continue;

      if (!areSemanticalltyCompatible(blocks[i], blocks[j])) continue;

      const [similarity] = calculateStructuralSimilarity(
        blocks[i].sourceCode,
        blocks[j].sourceCode,
        threshold
      );

      if (similarity >= threshold) {
        group.push(blocks[j]);
        similarities.push(similarity);
        used.add(j);
      }
    }

    if (group.length >= 2) {
      if (validateDuplicateGroup(group)) {
        used.add(i);
        const avgSimilarity = similarities.length > 0
          ? similarities.reduce((a, b) => a + b, 0) / similarities.length
          : SEMANTIC_WEIGHTS.BOTH_EMPTY_SIMILARITY;
        groups.push([group, avgSimilarity]);
      } else {
        _stderr(`Warning: Group rejected by semantic validation: ${group.map((b) => b.blockId)}`);
      }
    }
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Layer 3: Semantic Similarity
// ---------------------------------------------------------------------------

// Weights for semantic similarity calculation
const SEMANTIC_SIM_WEIGHTS = {
  operations: SEMANTIC_WEIGHTS.OPERATIONS,
  domains: SEMANTIC_WEIGHTS.DOMAINS,
  patterns: SEMANTIC_WEIGHTS.PATTERNS,
  dataTypes: SEMANTIC_WEIGHTS.DATA_TYPES,
} as const;

function _calculateJaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
  if (set1.size === 0 && set2.size === 0) return SEMANTIC_WEIGHTS.BOTH_EMPTY_SIMILARITY;
  if (set1.size === 0 || set2.size === 0) return SEMANTIC_WEIGHTS.EMPTY_SET_SIMILARITY;
  let intersection = 0;
  for (const item of set1) {
    if (set2.has(item)) intersection++;
  }
  const union = new Set([...set1, ...set2]).size;
  return union > 0 ? intersection / union : 0.0;
}

function _calculateSemanticSimilarity(
  ann1: SemanticAnnotation,
  ann2: SemanticAnnotation
): number {
  const opSim = _calculateJaccardSimilarity(ann1.operations, ann2.operations);
  const domainSim = _calculateJaccardSimilarity(ann1.domains, ann2.domains);
  const patternSim = _calculateJaccardSimilarity(ann1.patterns, ann2.patterns);
  const typeSim = _calculateJaccardSimilarity(ann1.dataTypes, ann2.dataTypes);

  return (
    opSim * SEMANTIC_SIM_WEIGHTS.operations +
    domainSim * SEMANTIC_SIM_WEIGHTS.domains +
    patternSim * SEMANTIC_SIM_WEIGHTS.patterns +
    typeSim * SEMANTIC_SIM_WEIGHTS.dataTypes
  );
}

function _intentsCompatible(intent1: string, intent2: string): boolean {
  if (intent1 === 'unknown' || intent2 === 'unknown') return false;

  const opStr1 = intent1.split('|')[0] ?? '';
  const opStr2 = intent2.split('|')[0] ?? '';

  const ops1 = new Set(opStr1.split('+').filter(Boolean));
  const ops2 = new Set(opStr2.split('+').filter(Boolean));

  if (ops1.size === 0 || ops2.size === 0) return false;

  for (const op of ops1) {
    if (ops2.has(op)) return true;
  }
  return false;
}

function _groupBySemanticSimilarity(
  blocks: CodeBlock[],
  annotations: Map<string, SemanticAnnotation>,
  threshold: number
): Array<[CodeBlock[], number]> {
  if (!blocks.length) return [];

  const groups: Array<[CodeBlock[], number]> = [];
  const used = new Set<number>();

  for (let i = 0; i < blocks.length; i++) {
    if (used.has(i)) continue;

    const ann1 = annotations.get(blocks[i].blockId);
    if (!ann1) continue;

    const group = [blocks[i]];
    const similarities: number[] = [];

    for (let j = i + 1; j < blocks.length; j++) {
      if (used.has(j)) continue;

      const ann2 = annotations.get(blocks[j].blockId);
      if (!ann2) continue;

      if (ann1.category !== ann2.category) continue;

      const similarity = _calculateSemanticSimilarity(ann1, ann2);
      if (similarity >= threshold) {
        if (_intentsCompatible(ann1.intent, ann2.intent)) {
          group.push(blocks[j]);
          similarities.push(similarity);
          used.add(j);
        }
      }
    }

    if (group.length >= 2) {
      used.add(i);
      const avgSimilarity = similarities.length > 0
        ? similarities.reduce((a, b) => a + b, 0) / similarities.length
        : SEMANTIC_WEIGHTS.BOTH_EMPTY_SIMILARITY;
      groups.push([group, avgSimilarity]);
    }
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Group Creation
// ---------------------------------------------------------------------------

function _createDuplicateGroup(
  blocks: CodeBlock[],
  similarityScore: number,
  similarityMethod: string
): DuplicateGroup {
  const contentHash = computeContentHash(blocks[0].sourceCode);
  return {
    groupId: `dg_${contentHash.slice(0, 12)}`,
    patternId: blocks[0].patternId,
    memberBlockIds: blocks.map((b) => b.blockId),
    similarityScore,
    similarityMethod,
    category: blocks[0].category,
    language: blocks[0].language,
    occurrenceCount: blocks.length,
    totalLines: blocks.reduce((sum, b) => sum + b.lineCount, 0),
    affectedFiles: [...new Set(blocks.map((b) => b.location.filePath))],
    affectedRepositories: [...new Set(blocks.map((b) => b.repositoryPath))],
  };
}

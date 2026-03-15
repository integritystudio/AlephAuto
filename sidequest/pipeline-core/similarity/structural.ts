import { createHash } from 'node:crypto';

export const STRUCTURAL_DEFAULTS = {
  CHAIN_MISSING_SIMILARITY: 0.5,
  STATUS_CODE_PENALTY: 0.70,
  LOGIC_OPERATOR_PENALTY: 0.80,
  SEMANTIC_METHOD_PENALTY: 0.75,
  NORMALIZED_IDENTICAL: 0.95,
  CHAIN_LEVENSHTEIN_WEIGHT: 0.7,
  CHAIN_STRUCTURE_WEIGHT: 0.3,
  DEFAULT_SIMILARITY_THRESHOLD: 0.90,
} as const;

export const EXTRACTION_DEFAULTS = {
  METHOD_CHAIN_MAX_GAP: 100,
} as const;

const SEMANTIC_METHODS = new Set([
  'map','filter','reduce','forEach','find','some','every','slice','splice',
  'push','pop','shift','unshift','join','split','includes','indexOf','get',
  'set','has','delete','keys','values','entries','then','catch','finally',
  'async','await','reverse','sort','concat','max','min','abs','floor','ceil',
  'round','trim','toLowerCase','toUpperCase','replace','status','json','send',
  'redirect','length','name','id','type',
]);

const SEMANTIC_OBJECTS = new Set([
  'Math','Object','Array','String','Number','Boolean','console','process',
  'JSON','Date','Promise',
]);

export interface SemanticFeatures {
  httpStatusCodes: Set<number>;
  logicalOperators: Set<string>;
  semanticMethods: Set<string>;
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

export function extractSemanticFeatures(sourceCode: string): SemanticFeatures {
  const features: SemanticFeatures = {
    httpStatusCodes: new Set(),
    logicalOperators: new Set(),
    semanticMethods: new Set(),
  };
  if (!sourceCode) return features;

  const statusPattern = /\.status\((\d{3})\)/g;
  let match: RegExpExecArray | null;
  while ((match = statusPattern.exec(sourceCode)) !== null) {
    features.httpStatusCodes.add(parseInt(match[1], 10));
  }

  const operatorPatterns: [RegExp, string][] = [
    [/!==/, '!=='],
    [/===/, '==='],
    [/!=/, '!='],
    [/==/, '=='],
    [/!\s*[^=]/, '!'],
    [/&&/, '&&'],
    [/\|\|/, '||'],
  ];
  for (const [pattern, op] of operatorPatterns) {
    if (pattern.test(sourceCode)) {
      features.logicalOperators.add(op);
    }
  }

  const semanticPatterns: [string, RegExp][] = [
    ['Math.max', /Math\.max\s*\(/],
    ['Math.min', /Math\.min\s*\(/],
    ['Math.floor', /Math\.floor\s*\(/],
    ['Math.ceil', /Math\.ceil\s*\(/],
    ['Math.round', /Math\.round\s*\(/],
    ['console.log', /console\.log\s*\(/],
    ['console.error', /console\.error\s*\(/],
    ['console.warn', /console\.warn\s*\(/],
    ['.reverse', /\.reverse\s*\(/],
    ['.toUpperCase', /\.toUpperCase\s*\(/],
    ['.toLowerCase', /\.toLowerCase\s*\(/],
  ];
  for (const [methodName, pattern] of semanticPatterns) {
    if (pattern.test(sourceCode)) {
      features.semanticMethods.add(methodName);
    }
  }

  return features;
}

export function normalizeCode(sourceCode: string): string {
  if (!sourceCode) return '';

  let normalized = sourceCode.replace(/\/\/.*?$/gm, '');
  normalized = normalized.replace(/\/\*.*?\*\//gs, '');
  normalized = normalized.replace(/\s+/g, ' ');
  normalized = normalized.replace(/'[^']*'/g, "'STR'");
  normalized = normalized.replace(/"[^"]*"/g, '"STR"');
  normalized = normalized.replace(/`[^`]*`/g, '`STR`');
  normalized = normalized.replace(/\b\d+\b/g, 'NUM');

  // Protect STR/NUM placeholders and semantic identifiers before normalization
  normalized = normalized.replace(/\bSTR\b/g, '__PRESERVE_LITERAL_STR__');
  normalized = normalized.replace(/\bNUM\b/g, '__PRESERVE_LITERAL_NUM__');

  for (const obj of SEMANTIC_OBJECTS) {
    normalized = normalized.replace(
      new RegExp(`\\b${obj}\\b`, 'g'),
      `__PRESERVE_OBJ_${obj.toUpperCase()}__`
    );
  }
  for (const method of SEMANTIC_METHODS) {
    normalized = normalized.replace(
      new RegExp(`\\b${method}\\b`, 'g'),
      `__PRESERVE_${method.toUpperCase()}__`
    );
  }

  normalized = normalized.replace(/\b[a-z][a-zA-Z0-9_]*\b/g, 'var');
  normalized = normalized.replace(/\b[A-Z][A-Z0-9_]*\b/g, 'CONST');

  for (const obj of SEMANTIC_OBJECTS) {
    normalized = normalized.split(`__PRESERVE_OBJ_${obj.toUpperCase()}__`).join(obj);
  }
  for (const method of SEMANTIC_METHODS) {
    normalized = normalized.split(`__PRESERVE_${method.toUpperCase()}__`).join(method);
  }
  normalized = normalized.split('__PRESERVE_LITERAL_STR__').join('STR');
  normalized = normalized.split('__PRESERVE_LITERAL_NUM__').join('NUM');

  normalized = normalized.replace(/\s*([(){}[\];,.])\s*/g, '$1');
  normalized = normalized.replace(/\s*(=>|===?|!==?|[+\-*/%<>=&|])\s*/g, ' $1 ');
  normalized = normalized.replace(/\s+/g, ' ');

  return normalized.trim();
}

export function calculateAstHash(sourceCode: string): string {
  const normalized = normalizeCode(sourceCode);
  return createHash('sha256').update(normalized).digest('hex');
}

export function calculateLevenshteinSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0.0;
  if (str1 === str2) return 1.0;

  // SequenceMatcher.ratio() = 2 * M / T where M = matching chars, T = total chars
  // Use dynamic programming to find LCS-based matching blocks length
  const len1 = str1.length;
  const len2 = str2.length;

  // Build DP table for LCS
  const dp: number[] = new Array(len2 + 1).fill(0);

  for (let i = 1; i <= len1; i++) {
    let prev = 0;
    for (let j = 1; j <= len2; j++) {
      const temp = dp[j];
      if (str1[i - 1] === str2[j - 1]) {
        dp[j] = prev + 1;
      } else {
        dp[j] = Math.max(dp[j], dp[j - 1]);
      }
      prev = temp;
    }
  }

  const lcs = dp[len2];
  return (2 * lcs) / (len1 + len2);
}

export function extractLogicalOperators(sourceCode: string): Set<string> {
  const operators = new Set<string>();
  if (!sourceCode) return operators;

  if (sourceCode.includes('!==')) operators.add('!==');
  if (sourceCode.includes('===')) operators.add('===');
  if (sourceCode.includes('!=') && !sourceCode.includes('!==')) operators.add('!=');
  if (sourceCode.includes('==') && !sourceCode.includes('===')) operators.add('==');
  if (/(?<![!=])!(?![=])/.test(sourceCode)) operators.add('!');

  return operators;
}

export function extractHttpStatusCodes(sourceCode: string): Set<number> {
  const statusCodes = new Set<number>();
  if (!sourceCode) return statusCodes;

  const pattern = /(?:res|response)\.status\((\d{3})\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(sourceCode)) !== null) {
    statusCodes.add(parseInt(match[1], 10));
  }

  return statusCodes;
}

export function extractSemanticMethods(sourceCode: string): Set<string> {
  const methods = new Set<string>();
  if (!sourceCode) return methods;

  for (const method of ['max', 'min', 'floor', 'ceil']) {
    if (sourceCode.includes(`Math.${method}`)) {
      methods.add(`Math.${method}`);
    }
  }

  return methods;
}

export function extractMethodChain(sourceCode: string): string[] {
  if (!sourceCode) return [];

  const pattern = /\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
  const matches: Array<{ name: string; index: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(sourceCode)) !== null) {
    matches.push({ name: match[1], index: match.index });
  }

  if (matches.length === 0) return [];

  const chains: string[][] = [];
  let currentChain: string[] = [];
  let lastPos = -1;

  for (let i = 0; i < matches.length; i++) {
    const { name, index } = matches[i];
    if (currentChain.length > 0 && index - lastPos > EXTRACTION_DEFAULTS.METHOD_CHAIN_MAX_GAP) {
      if (currentChain.length > 1) chains.push(currentChain);
      currentChain = [name];
    } else {
      currentChain.push(name);
    }
    if (i < matches.length - 1) {
      lastPos = matches[i + 1].index;
    } else {
      lastPos = sourceCode.length;
    }
  }

  if (currentChain.length > 1) chains.push(currentChain);

  if (chains.length === 0) return [];
  return chains.reduce((longest, chain) => chain.length > longest.length ? chain : longest, chains[0]);
}

export function compareMethodChains(code1: string, code2: string): number {
  const chain1 = extractMethodChain(code1);
  const chain2 = extractMethodChain(code2);

  if (chain1.length === 0 && chain2.length === 0) return 1.0;
  if (chain1.length === 0 || chain2.length === 0) return STRUCTURAL_DEFAULTS.CHAIN_MISSING_SIMILARITY;
  if (chain1.join(',') === chain2.join(',')) return 1.0;

  if (chain1.length !== chain2.length) {
    const shorter = chain1.length < chain2.length ? chain1 : chain2;
    const longer = chain1.length > chain2.length ? chain1 : chain2;
    if (longer.slice(0, shorter.length).join(',') === shorter.join(',')) {
      return shorter.length / longer.length;
    }
    return 0.0;
  }

  const overlap = chain1.reduce((count, m, i) => count + (m === chain2[i] ? 1 : 0), 0);
  return overlap / chain1.length;
}

export function calculateSemanticPenalty(
  features1: SemanticFeatures,
  features2: SemanticFeatures
): number {
  let penalty = 1.0;

  if (features1.httpStatusCodes.size > 0 && features2.httpStatusCodes.size > 0) {
    if (!setsEqual(features1.httpStatusCodes, features2.httpStatusCodes)) {
      penalty *= STRUCTURAL_DEFAULTS.STATUS_CODE_PENALTY;
    }
  }

  if (features1.logicalOperators.size > 0 && features2.logicalOperators.size > 0) {
    if (!setsEqual(features1.logicalOperators, features2.logicalOperators)) {
      penalty *= STRUCTURAL_DEFAULTS.LOGIC_OPERATOR_PENALTY;
    }
  }

  if (features1.semanticMethods.size > 0 && features2.semanticMethods.size > 0) {
    if (!setsEqual(features1.semanticMethods, features2.semanticMethods)) {
      penalty *= STRUCTURAL_DEFAULTS.SEMANTIC_METHOD_PENALTY;
    }
  }

  return penalty;
}

export function calculateStructuralSimilarity(
  code1: string,
  code2: string,
  threshold: number = STRUCTURAL_DEFAULTS.DEFAULT_SIMILARITY_THRESHOLD
): [number, string] {
  if (!code1 || !code2) return [0.0, 'different'];

  const hash1 = createHash('sha256').update(code1).digest('hex');
  const hash2 = createHash('sha256').update(code2).digest('hex');
  if (hash1 === hash2) return [1.0, 'exact'];

  const features1 = extractSemanticFeatures(code1);
  const features2 = extractSemanticFeatures(code2);
  const normalized1 = normalizeCode(code1);
  const normalized2 = normalizeCode(code2);

  let baseSimilarity: number;
  if (normalized1 === normalized2) {
    baseSimilarity = STRUCTURAL_DEFAULTS.NORMALIZED_IDENTICAL;
  } else {
    baseSimilarity = calculateLevenshteinSimilarity(normalized1, normalized2);
    const chainSimilarity = compareMethodChains(code1, code2);
    if (chainSimilarity < 1.0) {
      baseSimilarity =
        baseSimilarity * STRUCTURAL_DEFAULTS.CHAIN_LEVENSHTEIN_WEIGHT +
        chainSimilarity * STRUCTURAL_DEFAULTS.CHAIN_STRUCTURE_WEIGHT;
    }
  }

  const penalty = calculateSemanticPenalty(features1, features2);
  const finalSimilarity = baseSimilarity * penalty;

  if (finalSimilarity >= threshold) {
    return [finalSimilarity, 'structural'];
  }
  return [finalSimilarity, 'different'];
}

export function areStructurallySimilar(
  code1: string,
  code2: string,
  threshold: number = STRUCTURAL_DEFAULTS.DEFAULT_SIMILARITY_THRESHOLD
): boolean {
  const [score] = calculateStructuralSimilarity(code1, code2, threshold);
  return score >= threshold;
}

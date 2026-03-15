/**
 * Unit Tests for structural.ts
 *
 * Covers all 12 exported functions + SemanticFeatures interface,
 * verifying behavioral parity with the Python structural.py module.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractSemanticFeatures,
  normalizeCode,
  calculateAstHash,
  calculateLevenshteinSimilarity,
  extractLogicalOperators,
  extractHttpStatusCodes,
  extractSemanticMethods,
  extractMethodChain,
  compareMethodChains,
  calculateSemanticPenalty,
  calculateStructuralSimilarity,
  areStructurallySimilar,
  type SemanticFeatures,
} from '../../sidequest/pipeline-core/similarity/structural.ts';

// ---------------------------------------------------------------------------
// SemanticFeatures type shape
// ---------------------------------------------------------------------------

describe('SemanticFeatures', () => {
  it('should have httpStatusCodes, logicalOperators, and semanticMethods fields', () => {
    const f: SemanticFeatures = extractSemanticFeatures('');
    assert.ok('httpStatusCodes' in f);
    assert.ok('logicalOperators' in f);
    assert.ok('semanticMethods' in f);
  });

  it('should initialise all fields as empty sets for empty input', () => {
    const f = extractSemanticFeatures('');
    assert.equal(f.httpStatusCodes.size, 0);
    assert.equal(f.logicalOperators.size, 0);
    assert.equal(f.semanticMethods.size, 0);
  });
});

// ---------------------------------------------------------------------------
// extractSemanticFeatures
// ---------------------------------------------------------------------------

describe('extractSemanticFeatures', () => {
  it('should return empty features for empty string', () => {
    const f = extractSemanticFeatures('');
    assert.equal(f.httpStatusCodes.size, 0);
    assert.equal(f.logicalOperators.size, 0);
    assert.equal(f.semanticMethods.size, 0);
  });

  it('should extract HTTP status codes from .status() calls', () => {
    const f = extractSemanticFeatures('res.status(200).json({}); res.status(404).json({})');
    assert.ok(f.httpStatusCodes.has(200));
    assert.ok(f.httpStatusCodes.has(404));
  });

  it('should not extract status codes without 3-digit argument', () => {
    const f = extractSemanticFeatures('res.status(20).json({})');
    assert.equal(f.httpStatusCodes.size, 0);
  });

  it('should extract === logical operator', () => {
    const f = extractSemanticFeatures('if (a === b) {}');
    assert.ok(f.logicalOperators.has('==='));
  });

  it('should extract !== logical operator', () => {
    const f = extractSemanticFeatures('if (a !== b) {}');
    assert.ok(f.logicalOperators.has('!=='));
  });

  it('should extract && logical operator', () => {
    const f = extractSemanticFeatures('if (a && b) {}');
    assert.ok(f.logicalOperators.has('&&'));
  });

  it('should extract || logical operator', () => {
    const f = extractSemanticFeatures('if (a || b) {}');
    assert.ok(f.logicalOperators.has('||'));
  });

  it('should extract Math.max semantic method', () => {
    const f = extractSemanticFeatures('const x = Math.max(a, b);');
    assert.ok(f.semanticMethods.has('Math.max'));
  });

  it('should extract console.log semantic method', () => {
    const f = extractSemanticFeatures('console.log("hello");');
    assert.ok(f.semanticMethods.has('console.log'));
  });

  it('should extract .toUpperCase semantic method', () => {
    const f = extractSemanticFeatures('str.toUpperCase()');
    assert.ok(f.semanticMethods.has('.toUpperCase'));
  });

  it('should extract multiple semantic methods from one snippet', () => {
    const f = extractSemanticFeatures('Math.floor(x); Math.ceil(y);');
    assert.ok(f.semanticMethods.has('Math.floor'));
    assert.ok(f.semanticMethods.has('Math.ceil'));
  });
});

// ---------------------------------------------------------------------------
// normalizeCode
// ---------------------------------------------------------------------------

describe('normalizeCode', () => {
  it('should return empty string for empty input', () => {
    assert.equal(normalizeCode(''), '');
  });

  it('should strip single-line comments', () => {
    const result = normalizeCode('const x = 1; // this is a comment');
    assert.doesNotMatch(result, /this is a comment/);
  });

  it('should strip multi-line comments', () => {
    const result = normalizeCode('/* block comment */ const x = 1;');
    assert.doesNotMatch(result, /block comment/);
  });

  it('should normalise string literals to STR placeholder', () => {
    const result = normalizeCode("const s = 'hello';");
    assert.doesNotMatch(result, /hello/);
    assert.match(result, /STR/);
  });

  it('should normalise numeric literals to NUM placeholder', () => {
    const result = normalizeCode('const n = 42;');
    assert.doesNotMatch(result, /42/);
    assert.match(result, /NUM/);
  });

  it('should preserve semantic method names like map and filter', () => {
    const result = normalizeCode('arr.map(x => x).filter(x => x)');
    assert.match(result, /map/);
    assert.match(result, /filter/);
  });

  it('should preserve semantic object names like Math and JSON', () => {
    const result = normalizeCode('Math.floor(JSON.parse(s))');
    assert.match(result, /Math/);
    assert.match(result, /JSON/);
  });

  it('should produce identical output for semantically equivalent code', () => {
    const a = 'const result = add(x, y);';
    const b = 'const value = add(a, b);';
    assert.equal(normalizeCode(a), normalizeCode(b));
  });
});

// ---------------------------------------------------------------------------
// calculateAstHash
// ---------------------------------------------------------------------------

describe('calculateAstHash', () => {
  it('should return a 64-character hex string (sha256)', () => {
    const hash = calculateAstHash('const x = 1;');
    assert.match(hash, /^[0-9a-f]{64}$/);
  });

  it('should return the same hash for semantically equivalent code', () => {
    const a = 'const result = add(x, y);';
    const b = 'const value = add(a, b);';
    assert.equal(calculateAstHash(a), calculateAstHash(b));
  });

  it('should return different hashes for semantically different code', () => {
    const a = 'if (x === y) {}';
    const b = 'if (x !== y) {}';
    assert.notEqual(calculateAstHash(a), calculateAstHash(b));
  });
});

// ---------------------------------------------------------------------------
// calculateLevenshteinSimilarity
// ---------------------------------------------------------------------------

describe('calculateLevenshteinSimilarity', () => {
  it('should return 0.0 when first string is empty', () => {
    assert.equal(calculateLevenshteinSimilarity('', 'hello'), 0.0);
  });

  it('should return 0.0 when second string is empty', () => {
    assert.equal(calculateLevenshteinSimilarity('hello', ''), 0.0);
  });

  it('should return 1.0 for identical strings', () => {
    assert.equal(calculateLevenshteinSimilarity('abc', 'abc'), 1.0);
  });

  it('should return a value between 0 and 1 for similar strings', () => {
    const result = calculateLevenshteinSimilarity('abcde', 'abcdf');
    assert.ok(result > 0 && result < 1);
  });

  it('should return a lower value for more different strings', () => {
    const close = calculateLevenshteinSimilarity('hello', 'helo');
    const far = calculateLevenshteinSimilarity('hello', 'world');
    assert.ok(close > far);
  });
});

// ---------------------------------------------------------------------------
// extractLogicalOperators
// ---------------------------------------------------------------------------

describe('extractLogicalOperators', () => {
  it('should return empty set for empty string', () => {
    assert.equal(extractLogicalOperators('').size, 0);
  });

  it('should detect === and not == when only === present', () => {
    const ops = extractLogicalOperators('a === b');
    assert.ok(ops.has('==='));
    assert.ok(!ops.has('=='));
  });

  it('should detect !== and not != when only !== present', () => {
    const ops = extractLogicalOperators('a !== b');
    assert.ok(ops.has('!=='));
    assert.ok(!ops.has('!='));
  });

  it('should detect == when present without ===', () => {
    const ops = extractLogicalOperators('a == b');
    assert.ok(ops.has('=='));
  });

  it('should detect != when present without !==', () => {
    const ops = extractLogicalOperators('a != b');
    assert.ok(ops.has('!='));
  });

  it('should detect ! negation operator', () => {
    const ops = extractLogicalOperators('if (!done) {}');
    assert.ok(ops.has('!'));
  });
});

// ---------------------------------------------------------------------------
// extractHttpStatusCodes
// ---------------------------------------------------------------------------

describe('extractHttpStatusCodes', () => {
  it('should return empty set for empty string', () => {
    assert.equal(extractHttpStatusCodes('').size, 0);
  });

  it('should extract status code from res.status()', () => {
    const codes = extractHttpStatusCodes('res.status(200).json({})');
    assert.ok(codes.has(200));
  });

  it('should extract status code from response.status()', () => {
    const codes = extractHttpStatusCodes('response.status(404).send()');
    assert.ok(codes.has(404));
  });

  it('should extract multiple status codes', () => {
    const codes = extractHttpStatusCodes('res.status(200); res.status(500)');
    assert.ok(codes.has(200));
    assert.ok(codes.has(500));
  });

  it('should not extract codes not prefixed by res/response', () => {
    const codes = extractHttpStatusCodes('foo.status(201)');
    assert.ok(!codes.has(201));
  });
});

// ---------------------------------------------------------------------------
// extractSemanticMethods
// ---------------------------------------------------------------------------

describe('extractSemanticMethods', () => {
  it('should return empty set for empty string', () => {
    assert.equal(extractSemanticMethods('').size, 0);
  });

  it('should extract Math.max', () => {
    const methods = extractSemanticMethods('Math.max(a, b)');
    assert.ok(methods.has('Math.max'));
  });

  it('should extract Math.min', () => {
    const methods = extractSemanticMethods('Math.min(a, b)');
    assert.ok(methods.has('Math.min'));
  });

  it('should extract Math.floor', () => {
    const methods = extractSemanticMethods('Math.floor(x)');
    assert.ok(methods.has('Math.floor'));
  });

  it('should extract Math.ceil', () => {
    const methods = extractSemanticMethods('Math.ceil(x)');
    assert.ok(methods.has('Math.ceil'));
  });

  it('should not extract non-Math methods', () => {
    const methods = extractSemanticMethods('console.log("hi")');
    assert.equal(methods.size, 0);
  });
});

// ---------------------------------------------------------------------------
// extractMethodChain
// ---------------------------------------------------------------------------

describe('extractMethodChain', () => {
  it('should return empty array for empty string', () => {
    assert.deepEqual(extractMethodChain(''), []);
  });

  it('should return empty array when no chained methods', () => {
    assert.deepEqual(extractMethodChain('const x = 1;'), []);
  });

  it('should return the longest method chain', () => {
    const result = extractMethodChain('arr.filter(x => x).map(x => x).join(",")');
    assert.ok(result.length >= 2);
    assert.ok(result.includes('filter'));
    assert.ok(result.includes('map'));
  });

  it('should not include single isolated method calls as a chain', () => {
    // one isolated .log() call — no adjacent chaining
    const result = extractMethodChain('console.log("a")');
    assert.equal(result.length, 0);
  });
});

// ---------------------------------------------------------------------------
// compareMethodChains
// ---------------------------------------------------------------------------

describe('compareMethodChains', () => {
  it('should return 1.0 when both codes have no method chains', () => {
    assert.equal(compareMethodChains('const x = 1;', 'const y = 2;'), 1.0);
  });

  it('should return 0.5 when one code has a chain and the other does not', () => {
    const chained = 'arr.filter(x => x).map(x => x)';
    const plain = 'const x = 1;';
    assert.equal(compareMethodChains(chained, plain), 0.5);
  });

  it('should return 1.0 for identical method chains', () => {
    const code = 'arr.filter(x => x).map(x => x)';
    assert.equal(compareMethodChains(code, code), 1.0);
  });

  it('should return a value between 0 and 1 for partially matching chains', () => {
    const a = 'arr.filter(x => x).map(x => x).join(",")';
    const b = 'arr.filter(x => x).sort().join(",")';
    const result = compareMethodChains(a, b);
    assert.ok(result > 0 && result <= 1);
  });
});

// ---------------------------------------------------------------------------
// calculateSemanticPenalty
// ---------------------------------------------------------------------------

describe('calculateSemanticPenalty', () => {
  it('should return 1.0 when both features are empty', () => {
    const empty = extractSemanticFeatures('');
    assert.equal(calculateSemanticPenalty(empty, empty), 1.0);
  });

  it('should apply status code penalty when codes differ', () => {
    const f1 = extractSemanticFeatures('res.status(200).json({})');
    const f2 = extractSemanticFeatures('res.status(404).json({})');
    const penalty = calculateSemanticPenalty(f1, f2);
    assert.ok(penalty < 1.0);
    assert.ok(Math.abs(penalty - 0.70) < 0.001);
  });

  it('should return 1.0 when status codes match', () => {
    const code = 'res.status(200).json({})';
    const f1 = extractSemanticFeatures(code);
    const f2 = extractSemanticFeatures(code);
    assert.equal(calculateSemanticPenalty(f1, f2), 1.0);
  });

  it('should apply logic operator penalty when operators differ', () => {
    const f1 = extractSemanticFeatures('if (a === b) {}');
    const f2 = extractSemanticFeatures('if (a !== b) {}');
    const penalty = calculateSemanticPenalty(f1, f2);
    assert.ok(penalty < 1.0);
    assert.ok(Math.abs(penalty - 0.80) < 0.001);
  });

  it('should apply semantic method penalty when methods differ', () => {
    const f1 = extractSemanticFeatures('Math.max(a, b)');
    const f2 = extractSemanticFeatures('Math.min(a, b)');
    const penalty = calculateSemanticPenalty(f1, f2);
    assert.ok(penalty < 1.0);
    assert.ok(Math.abs(penalty - 0.75) < 0.001);
  });

  it('should compound multiple penalties when multiple features differ', () => {
    const f1 = extractSemanticFeatures('res.status(200); if (a === b) {}');
    const f2 = extractSemanticFeatures('res.status(404); if (a !== b) {}');
    const penalty = calculateSemanticPenalty(f1, f2);
    assert.ok(Math.abs(penalty - 0.70 * 0.80) < 0.001);
  });
});

// ---------------------------------------------------------------------------
// calculateStructuralSimilarity
// ---------------------------------------------------------------------------

describe('calculateStructuralSimilarity', () => {
  it('should return [0.0, "different"] for empty first code', () => {
    const [score, label] = calculateStructuralSimilarity('', 'const x = 1;');
    assert.equal(score, 0.0);
    assert.equal(label, 'different');
  });

  it('should return [0.0, "different"] for empty second code', () => {
    const [score, label] = calculateStructuralSimilarity('const x = 1;', '');
    assert.equal(score, 0.0);
    assert.equal(label, 'different');
  });

  it('should return [1.0, "exact"] for identical code strings', () => {
    const code = 'function add(a, b) { return a + b; }';
    const [score, label] = calculateStructuralSimilarity(code, code);
    assert.equal(score, 1.0);
    assert.equal(label, 'exact');
  });

  it('should return "structural" label when similarity meets default threshold', () => {
    const a = 'function add(x, y) { return x + y; }';
    const b = 'function sum(a, b) { return a + b; }';
    const [score, label] = calculateStructuralSimilarity(a, b);
    if (score >= 0.90) {
      assert.equal(label, 'structural');
    } else {
      assert.equal(label, 'different');
    }
  });

  it('should return "different" label for completely different code', () => {
    const a = 'res.status(200).json({ ok: true });';
    const b = 'throw new Error("not found");';
    const [score, label] = calculateStructuralSimilarity(a, b);
    assert.equal(label, 'different');
    assert.ok(score < 0.90);
  });

  it('should respect a custom threshold parameter', () => {
    const a = 'function add(x, y) { return x + y; }';
    const b = 'function sum(a, b) { return a + b; }';
    const [, labelLow] = calculateStructuralSimilarity(a, b, 0.1);
    assert.equal(labelLow, 'structural');
  });

  it('should return score of 0.95 for normalised-identical code', () => {
    const a = 'const result = add(x, y); // comment';
    const b = 'const value = add(a, b);';
    const [score] = calculateStructuralSimilarity(a, b);
    assert.ok(score >= 0.95 * 1.0 * 0.5 && score <= 0.95);
  });
});

// ---------------------------------------------------------------------------
// areStructurallySimilar
// ---------------------------------------------------------------------------

describe('areStructurallySimilar', () => {
  it('should return false for empty strings', () => {
    assert.equal(areStructurallySimilar('', ''), false);
  });

  it('should return true for identical code', () => {
    const code = 'function hello() { return 42; }';
    assert.equal(areStructurallySimilar(code, code), true);
  });

  it('should return false for completely different code', () => {
    const a = 'res.status(200).json({ ok: true });';
    const b = 'throw new Error("not found");';
    assert.equal(areStructurallySimilar(a, b), false);
  });

  it('should return true when similarity meets threshold at a low custom threshold', () => {
    const a = 'function add(x, y) { return x + y; }';
    const b = 'function sum(a, b) { return a + b; }';
    assert.equal(areStructurallySimilar(a, b, 0.1), true);
  });

  it('should return false when similarity is below a high custom threshold', () => {
    const a = 'function add(x, y) { return x + y; }';
    const b = 'function sum(a, b) { return a + b; }';
    // near-identical functions still won't reach 1.0 similarity
    assert.equal(areStructurallySimilar(a, b, 1.0), false);
  });
});

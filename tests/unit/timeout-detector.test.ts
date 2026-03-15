/**
 * TimeoutDetector Unit Tests
 *
 * Tests for the TypeScript port of sidequest/pipeline-core/scanners/timeout_detector.py
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  FileContext,
  TimeoutDetector,
  TIMEOUT_DETECTOR_DEFAULTS,
  EXCLUDED_DIRS,
} from '../../sidequest/pipeline-core/scanners/timeout-detector.ts';
import type { Finding } from '../../sidequest/pipeline-core/scanners/timeout-detector.ts';

// ---------------------------------------------------------------------------
// FileContext — pure unit tests (no filesystem)
// ---------------------------------------------------------------------------

describe('FileContext', () => {
  const makeCtx = (lines: string[]) =>
    new FileContext('/fake/file.ts', lines.join('\n'), lines);

  describe('hasTextInRange', () => {
    it('should return true when text exists within the look-ahead window', () => {
      const ctx = makeCtx(['line1', 'finally {', 'line3']);
      assert.equal(ctx.hasTextInRange('finally', 1, 20), true);
    });

    it('should return false when text is beyond the look-ahead window', () => {
      const ctx = makeCtx(['setLoading(true)', 'line2', 'line3', 'finally {}']);
      // window of 2 lines from line 1 only covers lines 1-2
      assert.equal(ctx.hasTextInRange('finally', 1, 2), false);
    });

    it('should return false when text is not present at all', () => {
      const ctx = makeCtx(['alpha', 'beta', 'gamma']);
      assert.equal(ctx.hasTextInRange('finally', 1, 20), false);
    });

    it('should not overflow past the last line', () => {
      const ctx = makeCtx(['only line']);
      // large look-ahead should not throw
      assert.equal(ctx.hasTextInRange('only line', 1, 9999), true);
    });
  });

  describe('hasPatternInRange', () => {
    it('should return true when pattern matches within range', () => {
      const ctx = makeCtx(['async function foo() {', '  try {', '  } catch (e) {}']);
      assert.equal(ctx.hasPatternInRange('\\btry\\b', 1, 50), true);
    });

    it('should return false when pattern does not match within range', () => {
      const ctx = makeCtx(['async function foo() {', '  doSomething();']);
      assert.equal(ctx.hasPatternInRange('\\btry\\b', 1, 50), false);
    });

    it('should support anchored regex patterns', () => {
      const ctx = makeCtx(['  catch (err) {']);
      assert.equal(ctx.hasPatternInRange('\\bcatch\\b', 1, 5), true);
    });
  });
});

// ---------------------------------------------------------------------------
// TIMEOUT_DETECTOR_DEFAULTS — constants shape
// ---------------------------------------------------------------------------

describe('TIMEOUT_DETECTOR_DEFAULTS', () => {
  it('should export FINALLY_LOOKAHEAD as 20', () => {
    assert.equal(TIMEOUT_DETECTOR_DEFAULTS.FINALLY_LOOKAHEAD, 20);
  });

  it('should export TRY_CATCH_LOOKAHEAD as 50', () => {
    assert.equal(TIMEOUT_DETECTOR_DEFAULTS.TRY_CATCH_LOOKAHEAD, 50);
  });

  it('should export MAX_FINDINGS_PER_SEVERITY as 10', () => {
    assert.equal(TIMEOUT_DETECTOR_DEFAULTS.MAX_FINDINGS_PER_SEVERITY, 10);
  });
});

// ---------------------------------------------------------------------------
// EXCLUDED_DIRS
// ---------------------------------------------------------------------------

describe('EXCLUDED_DIRS', () => {
  it('should contain node_modules', () => {
    assert.ok(EXCLUDED_DIRS.has('node_modules'));
  });

  it('should contain .git', () => {
    assert.ok(EXCLUDED_DIRS.has('.git'));
  });

  it('should contain dist', () => {
    assert.ok(EXCLUDED_DIRS.has('dist'));
  });

  it('should contain build', () => {
    assert.ok(EXCLUDED_DIRS.has('build'));
  });
});

// ---------------------------------------------------------------------------
// TimeoutDetector — pattern detectors via scan_directory
// ---------------------------------------------------------------------------

describe('TimeoutDetector', () => {
  let tempDir: string;

  before(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'timeout-detector-test-'));
  });

  after(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('scanDirectory — promise_race_no_timeout', () => {
    it('should detect Promise.race() without timeout as high severity', async () => {
      const fixture = path.join(tempDir, 'promise-race.ts');
      await fs.writeFile(fixture, 'const result = await Promise.race([fetch(url)]);\n');

      const detector = new TimeoutDetector();
      const results = await detector.scanDirectory(tempDir);

      const finding = results.findings.find(
        (f: Finding) => f.category === 'promise_race_no_timeout' && f.file_path === fixture
      );
      assert.ok(finding, 'expected a promise_race_no_timeout finding');
      assert.equal(finding.severity, 'high');
    });

    it('should not flag Promise.race() when timeout is present on the same line', async () => {
      const fixture = path.join(tempDir, 'promise-race-safe.ts');
      await fs.writeFile(fixture, 'const result = await Promise.race([fetch(url), timeout(5000)]);\n');

      const detector = new TimeoutDetector();
      const results = await detector.scanDirectory(tempDir);

      const finding = results.findings.find(
        (f: Finding) => f.category === 'promise_race_no_timeout' && f.file_path === fixture
      );
      assert.equal(finding, undefined, 'should not flag when timeout is present');
    });
  });

  describe('scanDirectory — loading_without_finally', () => {
    it('should detect setLoading(true) without a finally block as medium severity', async () => {
      const fixture = path.join(tempDir, 'loading-no-finally.ts');
      await fs.writeFile(fixture, [
        'async function load() {',
        '  setLoading(true);',
        '  const data = await fetch(url);',
        '}',
      ].join('\n') + '\n');

      const detector = new TimeoutDetector();
      const results = await detector.scanDirectory(tempDir);

      const finding = results.findings.find(
        (f: Finding) => f.category === 'loading_without_finally' && f.file_path === fixture
      );
      assert.ok(finding, 'expected a loading_without_finally finding');
      assert.equal(finding.severity, 'medium');
    });

    it('should not flag setLoading(true) when a finally block follows within look-ahead', async () => {
      const fixture = path.join(tempDir, 'loading-with-finally.ts');
      await fs.writeFile(fixture, [
        'async function load() {',
        '  try {',
        '    setLoading(true);',
        '    const data = await fetch(url);',
        '  } finally {',
        '    setLoading(false);',
        '  }',
        '}',
      ].join('\n') + '\n');

      const detector = new TimeoutDetector();
      const results = await detector.scanDirectory(tempDir);

      const finding = results.findings.find(
        (f: Finding) => f.category === 'loading_without_finally' && f.file_path === fixture
      );
      assert.equal(finding, undefined, 'should not flag when finally block is present');
    });
  });

  describe('scanDirectory — async_no_error_handling', () => {
    it('should detect async function without try-catch as low severity', async () => {
      const fixture = path.join(tempDir, 'async-no-catch.ts');
      await fs.writeFile(fixture, [
        'async function fetchData() {',
        '  const res = await fetch(url);',
        '  return res.json();',
        '}',
      ].join('\n') + '\n');

      const detector = new TimeoutDetector();
      const results = await detector.scanDirectory(tempDir);

      const finding = results.findings.find(
        (f: Finding) => f.category === 'async_no_error_handling' && f.file_path === fixture
      );
      assert.ok(finding, 'expected an async_no_error_handling finding');
      assert.equal(finding.severity, 'low');
    });

    it('should not flag async function that has both try and catch', async () => {
      const fixture = path.join(tempDir, 'async-with-catch.ts');
      await fs.writeFile(fixture, [
        'async function fetchData() {',
        '  try {',
        '    const res = await fetch(url);',
        '    return res.json();',
        '  } catch (err) {',
        '    console.error(err);',
        '  }',
        '}',
      ].join('\n') + '\n');

      const detector = new TimeoutDetector();
      const results = await detector.scanDirectory(tempDir);

      const finding = results.findings.find(
        (f: Finding) => f.category === 'async_no_error_handling' && f.file_path === fixture
      );
      assert.equal(finding, undefined, 'should not flag when try-catch is present');
    });
  });

  describe('scanDirectory — settimeout_no_cleanup', () => {
    it('should detect setTimeout used as rejection without clearTimeout as low severity', async () => {
      const fixture = path.join(tempDir, 'settimeout-no-cleanup.ts');
      await fs.writeFile(fixture, [
        'function withTimeout<T>(promise: Promise<T>): Promise<T> {',
        '  return Promise.race([promise, new Promise((_, reject) => setTimeout(reject, 5000))]);',
        '}',
      ].join('\n') + '\n');

      const detector = new TimeoutDetector();
      const results = await detector.scanDirectory(tempDir);

      const finding = results.findings.find(
        (f: Finding) => f.category === 'settimeout_no_cleanup' && f.file_path === fixture
      );
      assert.ok(finding, 'expected a settimeout_no_cleanup finding');
      assert.equal(finding.severity, 'low');
    });
  });

  describe('scanDirectory — statistics shape', () => {
    it('should return statistics with required keys', async () => {
      const fixture = path.join(tempDir, 'stats-check.ts');
      await fs.writeFile(fixture, 'const x = await Promise.race([p1, p2]);\n');

      const detector = new TimeoutDetector();
      const results = await detector.scanDirectory(tempDir);

      assert.ok('statistics' in results, 'results should have statistics key');
      assert.ok('total_findings' in results.statistics);
      assert.ok('files_affected' in results.statistics);
      assert.ok('severity_breakdown' in results.statistics);
      assert.ok('category_breakdown' in results.statistics);
      assert.equal(typeof results.statistics.total_findings, 'number');
      assert.equal(typeof results.statistics.files_affected, 'number');
    });

    it('should count severity_breakdown correctly for high severity findings', async () => {
      const fixture = path.join(tempDir, 'severity-count.ts');
      await fs.writeFile(fixture, 'await Promise.race([a, b]);\n');

      const detector = new TimeoutDetector();
      const results = await detector.scanDirectory(tempDir);

      const highCount = results.statistics.severity_breakdown['high'] ?? 0;
      assert.ok(highCount >= 1, `expected at least 1 high-severity finding, got ${highCount}`);
    });
  });

  describe('generateReport', () => {
    it('should return a string starting with a markdown heading', async () => {
      const detector = new TimeoutDetector();
      const results = {
        findings: [],
        statistics: {
          total_findings: 0,
          files_affected: 0,
          severity_breakdown: {},
          category_breakdown: {},
        },
      };

      const report = detector.generateReport(results);
      assert.equal(typeof report, 'string');
      assert.ok(report.startsWith('#'), 'report should start with a markdown heading');
    });

    it('should include total findings count in the report', async () => {
      const detector = new TimeoutDetector();
      const results = {
        findings: [],
        statistics: {
          total_findings: 42,
          files_affected: 3,
          severity_breakdown: { high: 1, medium: 2, low: 39 },
          category_breakdown: {},
        },
      };

      const report = detector.generateReport(results);
      assert.ok(report.includes('42'), 'report should contain the total findings count');
    });

    it('should include files affected count in the report', async () => {
      const detector = new TimeoutDetector();
      const results = {
        findings: [],
        statistics: {
          total_findings: 5,
          files_affected: 7,
          severity_breakdown: {},
          category_breakdown: {},
        },
      };

      const report = detector.generateReport(results);
      assert.ok(report.includes('7'), 'report should contain the files affected count');
    });
  });

  describe('scanDirectory — excluded dirs are skipped', () => {
    it('should not scan files inside node_modules', async () => {
      const nodeModules = path.join(tempDir, 'node_modules');
      await fs.mkdir(nodeModules, { recursive: true });
      const fixture = path.join(nodeModules, 'lib.ts');
      await fs.writeFile(fixture, 'await Promise.race([a, b]);\n');

      const detector = new TimeoutDetector();
      const results = await detector.scanDirectory(tempDir);

      const inNodeModules = results.findings.some(
        (f: Finding) => f.file_path.includes('node_modules')
      );
      assert.equal(inNodeModules, false, 'should not scan inside node_modules');
    });
  });

  describe('Finding shape', () => {
    it('each finding should have required fields with correct types', async () => {
      const fixture = path.join(tempDir, 'finding-shape.ts');
      await fs.writeFile(fixture, 'const r = await Promise.race([fetchA(), fetchB()]);\n');

      const detector = new TimeoutDetector();
      const results = await detector.scanDirectory(tempDir);

      const finding = results.findings.find(
        (f: Finding) => f.file_path === fixture
      );
      assert.ok(finding, 'expected at least one finding for the fixture file');
      assert.equal(typeof finding.file_path, 'string');
      assert.equal(typeof finding.line_number, 'number');
      assert.equal(typeof finding.severity, 'string');
      assert.equal(typeof finding.category, 'string');
      assert.equal(typeof finding.message, 'string');
      assert.equal(typeof finding.code_snippet, 'string');
      assert.equal(typeof finding.recommendation, 'string');
    });
  });
});

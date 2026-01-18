/**
 * AstGrepPatternDetector Unit Tests
 *
 * Tests for the AST-based pattern detection system.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { AstGrepPatternDetector, PatternDetectionError } from '../../sidequest/pipeline-core/scanners/ast-grep-detector.js';

describe('AstGrepPatternDetector', () => {
  let detector;
  let tempDir;

  beforeEach(async () => {
    // Create temp directory for test rules
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ast-grep-test-'));

    detector = new AstGrepPatternDetector({
      rulesDirectory: tempDir,
      configPath: path.join(tempDir, 'sgconfig.yml')
    });
  });

  afterEach(async () => {
    // Cleanup temp directory
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const defaultDetector = new AstGrepPatternDetector();

      assert.ok(defaultDetector.rulesDirectory.includes('.ast-grep/rules'));
      assert.ok(defaultDetector.configPath.includes('sgconfig.yml'));
    });

    it('should accept custom options', () => {
      assert.strictEqual(detector.rulesDirectory, tempDir);
      assert.strictEqual(detector.configPath, path.join(tempDir, 'sgconfig.yml'));
    });
  });

  describe('normalizeMatch', () => {
    it('should normalize match with all fields', () => {
      const match = {
        ruleId: 'test-rule',
        file: '/path/to/file.js',
        range: {
          start: { line: 10, column: 5 },
          end: { line: 12, column: 20 }
        },
        text: 'matched code',
        message: 'Test message',
        severity: 'warning',
        metaVars: { $VAR: 'value' }
      };

      const normalized = detector.normalizeMatch(match, '/repo/path');

      assert.strictEqual(normalized.rule_id, 'test-rule');
      assert.strictEqual(normalized.file_path, '/path/to/file.js');
      assert.strictEqual(normalized.line_start, 10);
      assert.strictEqual(normalized.line_end, 12);
      assert.strictEqual(normalized.column_start, 5);
      assert.strictEqual(normalized.column_end, 20);
      assert.strictEqual(normalized.matched_text, 'matched code');
      assert.strictEqual(normalized.message, 'Test message');
      assert.strictEqual(normalized.severity, 'warning');
      assert.deepStrictEqual(normalized.meta_variables, { $VAR: 'value' });
      assert.strictEqual(normalized._repoPath, '/repo/path');
    });

    it('should handle alternative field names', () => {
      const match = {
        rule_id: 'alt-rule',
        path: '/alt/path/file.ts',
        line: 5,
        column: 3,
        matched: 'alt matched'
      };

      const normalized = detector.normalizeMatch(match, '/repo');

      assert.strictEqual(normalized.rule_id, 'alt-rule');
      assert.strictEqual(normalized.file_path, '/alt/path/file.ts');
      assert.strictEqual(normalized.line_start, 5);
      assert.strictEqual(normalized.matched_text, 'alt matched');
    });

    it('should prefer lines over text for matched content', () => {
      const match = {
        ruleId: 'test',
        file: 'test.js',
        lines: 'full context with operators !== ===',
        text: 'shorter match'
      };

      const normalized = detector.normalizeMatch(match, '/repo');

      assert.strictEqual(normalized.matched_text, 'full context with operators !== ===');
    });

    it('should default severity to info', () => {
      const match = {
        ruleId: 'test',
        file: 'test.js'
      };

      const normalized = detector.normalizeMatch(match, '/repo');

      assert.strictEqual(normalized.severity, 'info');
    });

    it('should handle missing metaVars', () => {
      const match = {
        ruleId: 'test',
        file: 'test.js'
      };

      const normalized = detector.normalizeMatch(match, '/repo');

      assert.deepStrictEqual(normalized.ast_node, {});
      assert.deepStrictEqual(normalized.meta_variables, {});
    });

    it('should calculate line_end from lines array length', () => {
      const match = {
        ruleId: 'test',
        file: 'test.js',
        line: 10,
        lines: ['line1', 'line2', 'line3']
      };

      const normalized = detector.normalizeMatch(match, '/repo');

      assert.strictEqual(normalized.line_start, 10);
      // line_end should be line + lines.length - 1 = 10 + 3 - 1 = 12
      assert.strictEqual(normalized.line_end, 12);
    });
  });

  describe('loadRules', () => {
    it('should load rules from directory', async () => {
      // Create test rule files
      await fs.writeFile(path.join(tempDir, 'rule1.yml'), 'id: rule1');
      await fs.writeFile(path.join(tempDir, 'rule2.yaml'), 'id: rule2');

      const rules = await detector.loadRules(tempDir);

      assert.strictEqual(rules.length, 2);
      assert.ok(rules.some(r => r.name === 'rule1'));
      assert.ok(rules.some(r => r.name === 'rule2'));
    });

    it('should recursively load rules from subdirectories', async () => {
      // Create subdirectory with rules
      const subDir = path.join(tempDir, 'subdir');
      await fs.mkdir(subDir);
      await fs.writeFile(path.join(tempDir, 'root-rule.yml'), 'id: root');
      await fs.writeFile(path.join(subDir, 'sub-rule.yml'), 'id: sub');

      const rules = await detector.loadRules(tempDir);

      assert.strictEqual(rules.length, 2);
      assert.ok(rules.some(r => r.name === 'root-rule'));
      assert.ok(rules.some(r => r.name === 'sub-rule'));
    });

    it('should ignore non-yaml files', async () => {
      await fs.writeFile(path.join(tempDir, 'rule.yml'), 'id: valid');
      await fs.writeFile(path.join(tempDir, 'readme.md'), '# Readme');
      await fs.writeFile(path.join(tempDir, 'config.json'), '{}');

      const rules = await detector.loadRules(tempDir);

      assert.strictEqual(rules.length, 1);
      assert.strictEqual(rules[0].name, 'rule');
    });

    it('should return empty array for non-existent directory', async () => {
      const rules = await detector.loadRules('/non/existent/path');

      assert.deepStrictEqual(rules, []);
    });

    it('should include full path in rule info', async () => {
      await fs.writeFile(path.join(tempDir, 'test-rule.yml'), 'id: test');

      const rules = await detector.loadRules(tempDir);

      assert.strictEqual(rules.length, 1);
      assert.strictEqual(rules[0].path, path.join(tempDir, 'test-rule.yml'));
      assert.strictEqual(rules[0].name, 'test-rule');
    });
  });

  describe('PatternDetectionError', () => {
    it('should create error with message', () => {
      const error = new PatternDetectionError('Test error message');

      assert.strictEqual(error.message, 'Test error message');
      assert.strictEqual(error.name, 'PatternDetectionError');
    });

    it('should support cause option', () => {
      const cause = new Error('Original error');
      const error = new PatternDetectionError('Wrapped error', { cause });

      assert.strictEqual(error.message, 'Wrapped error');
      assert.strictEqual(error.cause, cause);
    });

    it('should be instanceof Error', () => {
      const error = new PatternDetectionError('Test');

      assert.ok(error instanceof Error);
      assert.ok(error instanceof PatternDetectionError);
    });
  });

  describe('detectPatterns (error handling)', () => {
    it('should throw PatternDetectionError on failure', async () => {
      // Use a non-existent path to trigger error
      await assert.rejects(
        async () => {
          await detector.detectPatterns('/non/existent/repo/path');
        },
        (error) => {
          assert.ok(error instanceof PatternDetectionError);
          return true;
        }
      );
    });
  });
});

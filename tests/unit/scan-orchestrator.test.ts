/**
 * ScanOrchestrator Unit Tests
 *
 * Tests for the scan orchestrator that coordinates the duplicate detection pipeline.
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import { ScanOrchestrator, ScanError, type ScanOrchestratorOptions } from '../../sidequest/pipeline-core/scan-orchestrator.ts';

describe('ScanOrchestrator', () => {
  describe('Constructor', () => {
    it('should initialize with default options', () => {
      const orchestrator = new ScanOrchestrator();

      assert.ok(orchestrator.repositoryScanner, 'Should have repository scanner');
      assert.ok(orchestrator.patternDetector, 'Should have pattern detector');
      assert.strictEqual(orchestrator.autoGenerateReports, true);
    });

    it('should defer Python validation when not provided', () => {
      const orchestrator = new ScanOrchestrator();

      assert.strictEqual(orchestrator.pythonPath, null);
      assert.strictEqual(orchestrator._pythonValidated, false);
    });

    it('should pass scanner and detector options to sub-components', () => {
      const orchestrator = new ScanOrchestrator({
        scanner: { maxFileSize: 10000 },
        detector: { patterns: ['test'] },
      });

      assert.ok(orchestrator.repositoryScanner);
      assert.ok(orchestrator.patternDetector);
    });

    // Parameterized single-option acceptance tests
    type OrchestratorProp = 'pythonPath' | 'extractorScript' | 'outputDir' | 'autoGenerateReports' | 'reportConfig' | 'config';
    const singleOptionCases: Array<{
      name: string;
      options: ScanOrchestratorOptions;
      prop: OrchestratorProp;
      expected: unknown;
      deep?: boolean;
    }> = [
      { name: 'pythonPath', options: { pythonPath: '/custom/python' }, prop: 'pythonPath', expected: '/custom/python' },
      { name: 'extractorScript', options: { extractorScript: '/custom/extractor.py' }, prop: 'extractorScript', expected: '/custom/extractor.py' },
      { name: 'outputDir', options: { outputDir: '/custom/output' }, prop: 'outputDir', expected: '/custom/output' },
      { name: 'autoGenerateReports=false', options: { autoGenerateReports: false }, prop: 'autoGenerateReports', expected: false },
      { name: 'report config', options: { reports: { format: 'html', includeStats: true } }, prop: 'reportConfig', expected: { format: 'html', includeStats: true }, deep: true },
      { name: 'config', options: { config: { key: 'value' } }, prop: 'config', expected: { key: 'value' }, deep: true },
    ];

    for (const { name, options, prop, expected, deep } of singleOptionCases) {
      it(`should accept custom ${name} option`, () => {
        const orchestrator = new ScanOrchestrator(options);
        if (deep) {
          assert.deepStrictEqual(orchestrator[prop], expected);
        } else {
          assert.strictEqual(orchestrator[prop], expected);
        }
      });
    }
  });

  describe('scanRepository validation', () => {
    it('should throw ScanError for undefined repoPath', async () => {
      const orchestrator = new ScanOrchestrator();

      await assert.rejects(
        () => orchestrator.scanRepository(undefined),
        (err) => {
          assert.ok(err instanceof ScanError);
          assert.ok(err.message.includes('undefined'));
          return true;
        }
      );
    });

    it('should throw ScanError for null repoPath', async () => {
      const orchestrator = new ScanOrchestrator();

      await assert.rejects(
        () => orchestrator.scanRepository(null),
        (err) => {
          assert.ok(err instanceof ScanError);
          assert.ok(err.message.includes('null'));
          return true;
        }
      );
    });

    it('should throw ScanError for non-string repoPath', async () => {
      const orchestrator = new ScanOrchestrator();

      await assert.rejects(
        () => orchestrator.scanRepository(123),
        (err) => {
          assert.ok(err instanceof ScanError);
          assert.ok(err.message.includes('number'));
          return true;
        }
      );
    });

    it('should throw ScanError for empty string repoPath', async () => {
      const orchestrator = new ScanOrchestrator();

      await assert.rejects(
        () => orchestrator.scanRepository(''),
        (err) => {
          assert.ok(err instanceof ScanError);
          return true;
        }
      );
    });

    it('should throw ScanError for object repoPath', async () => {
      const orchestrator = new ScanOrchestrator();

      await assert.rejects(
        () => orchestrator.scanRepository({ path: '/repo' }),
        (err) => {
          assert.ok(err instanceof ScanError);
          assert.ok(err.message.includes('object'));
          return true;
        }
      );
    });

    it('should throw ScanError for array repoPath', async () => {
      const orchestrator = new ScanOrchestrator();

      await assert.rejects(
        () => orchestrator.scanRepository(['/repo1', '/repo2']),
        (err) => {
          assert.ok(err instanceof ScanError);
          assert.ok(err.message.includes('object'));
          return true;
        }
      );
    });
  });

  describe('_detectPythonPath', () => {
    it('should skip detection if already validated', () => {
      const orchestrator = new ScanOrchestrator({
        pythonPath: '/usr/bin/python3'
      });

      orchestrator._pythonValidated = true;

      // Should not throw and should return early
      assert.doesNotThrow(() => orchestrator._detectPythonPath());
    });

    it('should set validated flag when pythonPath is provided', () => {
      const orchestrator = new ScanOrchestrator({
        pythonPath: '/usr/bin/python3'
      });

      orchestrator._detectPythonPath();

      assert.strictEqual(orchestrator._pythonValidated, true);
    });
  });
});

describe('ScanError', () => {
  it('should create error with message', () => {
    const error = new ScanError('Test error message');

    assert.strictEqual(error.message, 'Test error message');
    assert.strictEqual(error.name, 'ScanError');
  });

  it('should support cause option', () => {
    const cause = new Error('Original error');
    const error = new ScanError('Wrapped error', { cause });

    assert.strictEqual(error.cause, cause);
  });

  it('should be instanceof Error', () => {
    const error = new ScanError('Test');

    assert.ok(error instanceof Error);
    assert.ok(error instanceof ScanError);
  });
});

describe('ScanOrchestrator - Report Configuration', () => {
  it('should use default output directory', () => {
    const orchestrator = new ScanOrchestrator();

    assert.ok(orchestrator.outputDir.includes('output'));
    assert.ok(orchestrator.outputDir.includes('reports'));
  });

  it('should merge report config with defaults', () => {
    const orchestrator = new ScanOrchestrator({
      reports: {
        format: 'markdown',
        includeCode: true
      }
    });

    assert.strictEqual(orchestrator.reportConfig.format, 'markdown');
    assert.strictEqual(orchestrator.reportConfig.includeCode, true);
  });
});

describe('ScanOrchestrator - Scanner/Detector Integration', () => {
  it('should create RepositoryScanner with options', () => {
    const orchestrator = new ScanOrchestrator({
      scanner: {
        excludePatterns: ['node_modules']
      }
    });

    assert.ok(orchestrator.repositoryScanner);
  });

  it('should create AstGrepPatternDetector with options', () => {
    const orchestrator = new ScanOrchestrator({
      detector: {
        minMatches: 3
      }
    });

    assert.ok(orchestrator.patternDetector);
  });
});

describe('ScanOrchestrator - Default Values', () => {
  it('should have sensible defaults', () => {
    const orchestrator = new ScanOrchestrator();

    // Check that all components are initialized
    assert.ok(orchestrator.repositoryScanner);
    assert.ok(orchestrator.patternDetector);

    // Default extractor script should point to extractors directory
    assert.ok(orchestrator.extractorScript.includes('extract_blocks.py'));

    // Default report config should be empty object
    assert.deepStrictEqual(orchestrator.reportConfig, {});

    // Default config should be empty object
    assert.deepStrictEqual(orchestrator.config, {});

    // Auto-generate reports should be enabled by default
    assert.strictEqual(orchestrator.autoGenerateReports, true);
  });
});

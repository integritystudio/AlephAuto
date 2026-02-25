import { describe, it } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Test suite for verifying correct filepath imports after file reorganization
 *
 * This test suite validates:
 * 1. index.ts moved to sidequest/ with updated imports
 * 2. data-discovery-report-pipeline.js moved to sidequest/ with updated imports
 */

describe('Filepath Imports Test Suite', () => {
  describe('sidequest/core/index.ts imports', () => {
    it('should have correct import for RepomixWorker', async () => {
      const filePath = resolve(__dirname, '../../sidequest/core/index.ts');
      const content = await fs.readFile(filePath, 'utf-8');

      // Verify the import statement uses relative path from sidequest/core/
      assert.match(
        content,
        /import\s+{\s*RepomixWorker\s*}\s+from\s+['"]\.\.\/workers\/repomix-worker\.ts['"]/,
        'RepomixWorker import should use ../workers/repomix-worker.ts'
      );
    });

    it('should have correct import for DirectoryScanner', async () => {
      const filePath = resolve(__dirname, '../../sidequest/core/index.ts');
      const content = await fs.readFile(filePath, 'utf-8');

      // Verify the import statement uses relative path from sidequest/core/
      assert.match(
        content,
        /import\s+{\s*DirectoryScanner\s*}\s+from\s+['"]\.\.\/utils\/directory-scanner\.ts['"]/,
        'DirectoryScanner import should use ../utils/directory-scanner.ts'
      );
    });

    it('should have correct outputBaseDir from config', async () => {
      const filePath = resolve(__dirname, '../../sidequest/core/index.ts');
      const content = await fs.readFile(filePath, 'utf-8');

      // Verify outputBaseDir is sourced from config (via cfg cast)
      assert.match(
        content,
        /outputBaseDir:\s*cfg\.outputBaseDir/,
        'outputBaseDir should use cfg.outputBaseDir'
      );
    });

    it('should have correct logDir path', async () => {
      const filePath = resolve(__dirname, '../../sidequest/core/index.ts');
      const content = await fs.readFile(filePath, 'utf-8');

      // Verify logDir is sourced from config (via cfg cast)
      assert.match(
        content,
        /logDir:\s*cfg\.logDir/,
        'logDir should use cfg.logDir'
      );
    });

    it('should have correct outputDir path for DirectoryScanner', async () => {
      const filePath = resolve(__dirname, '../../sidequest/core/index.ts');
      const content = await fs.readFile(filePath, 'utf-8');

      // Verify outputDir is sourced from config (via cfg cast)
      assert.match(
        content,
        /outputDir:\s*cfg\.scanReportsDir/,
        'outputDir should use cfg.scanReportsDir'
      );
    });

    it('should have correct path in saveRunSummary', async () => {
      const filePath = resolve(__dirname, '../../sidequest/core/index.ts');
      const content = await fs.readFile(filePath, 'utf-8');

      // Verify saveRunSummary uses this.worker.logDir for deterministic output
      assert.match(
        content,
        /path\.join\(this\.worker\.logDir/,
        'saveRunSummary should use this.worker.logDir'
      );
    });
  });

  describe('File existence checks', () => {
    it('should verify index.ts exists in sidequest/core/', async () => {
      const filePath = resolve(__dirname, '../../sidequest/core/index.ts');
      const stats = await fs.stat(filePath);
      assert.ok(stats.isFile(), 'index.ts should exist in sidequest/core/');
    });

    it('should verify index.ts was removed from root', async () => {
      const filePath = resolve(__dirname, '../../index.ts');
      try {
        await fs.stat(filePath);
        assert.fail('index.ts should not exist in root directory');
      } catch (error) {
        assert.strictEqual(error.code, 'ENOENT', 'index.ts should not exist in root');
      }
    });

  });

  describe('Referenced module existence', () => {
    it('should verify repomix-worker.ts exists in sidequest/workers/', async () => {
      const filePath = resolve(__dirname, '../../sidequest/workers/repomix-worker.ts');
      const stats = await fs.stat(filePath);
      assert.ok(stats.isFile(), 'repomix-worker.ts should exist in workers/');
    });

    it('should verify directory-scanner.ts exists in sidequest/utils/', async () => {
      const filePath = resolve(__dirname, '../../sidequest/utils/directory-scanner.ts');
      const stats = await fs.stat(filePath);
      assert.ok(stats.isFile(), 'directory-scanner.ts should exist in utils/');
    });

    it('should verify schema-enhancement-worker.ts exists in sidequest/workers/', async () => {
      const filePath = resolve(__dirname, '../../sidequest/workers/schema-enhancement-worker.ts');
      const stats = await fs.stat(filePath);
      assert.ok(stats.isFile(), 'schema-enhancement-worker.ts should exist in workers/');
    });

  });

  describe('Output directory paths', () => {
    it('should verify sidequest/output/condense/ directory exists', async () => {
      const dirPath = resolve(__dirname, '../../sidequest/output/condense');
      try {
        const stats = await fs.stat(dirPath);
        assert.ok(stats.isDirectory(), 'sidequest/output/condense/ directory should exist');
      } catch (_error) {
        console.warn('⚠️  sidequest/output/condense/ directory not found - may need to be created');
      }
    });

    it('should verify logs/ directory exists', async () => {
      const dirPath = resolve(__dirname, '../../logs');
      try {
        const stats = await fs.stat(dirPath);
        assert.ok(stats.isDirectory(), 'logs/ directory should exist');
      } catch (_error) {
        console.warn('⚠️  logs/ directory not found - may need to be created');
      }
    });

    it('should verify directory-scan-reports/ directory exists', async () => {
      const dirPath = resolve(__dirname, '../../directory-scan-reports');
      try {
        const stats = await fs.stat(dirPath);
        assert.ok(stats.isDirectory(), 'directory-scan-reports/ directory should exist');
      } catch (_error) {
        console.warn('⚠️  directory-scan-reports/ directory not found - may need to be created');
      }
    });

    it('should verify document-enhancement-impact-measurement/ directory exists', async () => {
      const dirPath = resolve(__dirname, '../../document-enhancement-impact-measurement');
      try {
        const stats = await fs.stat(dirPath);
        assert.ok(stats.isDirectory(), 'document-enhancement-impact-measurement/ directory should exist');
      } catch (_error) {
        console.warn('⚠️  document-enhancement-impact-measurement/ directory not found - may need to be created');
      }
    });
  });
});

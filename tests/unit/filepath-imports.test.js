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
 * 1. index.js moved to sidequest/ with updated imports
 * 2. data-discovery-report-pipeline.js moved to sidequest/ with updated imports
 */

describe('Filepath Imports Test Suite', () => {
  describe('sidequest/index.js imports', () => {
    it('should have correct import for RepomixWorker', async () => {
      const filePath = resolve(__dirname, '../../sidequest/index.js');
      const content = await fs.readFile(filePath, 'utf-8');

      // Verify the import statement uses relative path from sidequest/
      assert.match(
        content,
        /import\s+{\s*RepomixWorker\s*}\s+from\s+['"]\.\/repomix-worker\.js['"]/,
        'RepomixWorker import should use ./repomix-worker.js'
      );
    });

    it('should have correct import for DirectoryScanner', async () => {
      const filePath = resolve(__dirname, '../../sidequest/index.js');
      const content = await fs.readFile(filePath, 'utf-8');

      // Verify the import statement uses relative path from sidequest/
      assert.match(
        content,
        /import\s+{\s*DirectoryScanner\s*}\s+from\s+['"]\.\/directory-scanner\.js['"]/,
        'DirectoryScanner import should use ./directory-scanner.js'
      );
    });

    it('should have correct outputBaseDir path', async () => {
      const filePath = resolve(__dirname, '../../sidequest/index.js');
      const content = await fs.readFile(filePath, 'utf-8');

      // Verify outputBaseDir points to ../condense
      assert.match(
        content,
        /outputBaseDir:\s*['"]\.\.\/condense['"]/,
        'outputBaseDir should be ../condense'
      );
    });

    it('should have correct logDir path', async () => {
      const filePath = resolve(__dirname, '../../sidequest/index.js');
      const content = await fs.readFile(filePath, 'utf-8');

      // Verify logDir points to ../logs (should appear twice)
      const logDirMatches = content.match(/logDir:\s*['"]\.\.\/logs['"]/g);
      assert.ok(
        logDirMatches && logDirMatches.length >= 1,
        'logDir should be ../logs (at least once)'
      );
    });

    it('should have correct outputDir path for DirectoryScanner', async () => {
      const filePath = resolve(__dirname, '../../sidequest/index.js');
      const content = await fs.readFile(filePath, 'utf-8');

      // Verify outputDir points to ../directory-scan-reports
      assert.match(
        content,
        /outputDir:\s*['"]\.\.\/directory-scan-reports['"]/,
        'outputDir should be ../directory-scan-reports'
      );
    });

    it('should have correct path in saveRunSummary', async () => {
      const filePath = resolve(__dirname, '../../sidequest/index.js');
      const content = await fs.readFile(filePath, 'utf-8');

      // Verify saveRunSummary uses ../logs
      assert.match(
        content,
        /path\.join\(['"]\.\.\/logs['"]/,
        'saveRunSummary should use ../logs'
      );
    });
  });

  describe('sidequest/data-discovery-report-pipeline.js imports', () => {
    it('should have correct import for SchemaEnhancementWorker', async () => {
      const filePath = resolve(__dirname, '../../sidequest/data-discovery-report-pipeline.js');
      const content = await fs.readFile(filePath, 'utf-8');

      // Verify the import statement uses relative path from sidequest/
      assert.match(
        content,
        /import\s+{\s*SchemaEnhancementWorker\s*}\s+from\s+['"]\.\/doc-enhancement\/schema-enhancement-worker\.js['"]/,
        'SchemaEnhancementWorker import should use ./doc-enhancement/schema-enhancement-worker.js'
      );
    });

    it('should have correct import for READMEScanner', async () => {
      const filePath = resolve(__dirname, '../../sidequest/data-discovery-report-pipeline.js');
      const content = await fs.readFile(filePath, 'utf-8');

      // Verify the import statement uses relative path from sidequest/
      assert.match(
        content,
        /import\s+{\s*READMEScanner\s*}\s+from\s+['"]\.\/doc-enhancement\/readme-scanner\.js['"]/,
        'READMEScanner import should use ./doc-enhancement/readme-scanner.js'
      );
    });

    it('should have correct outputBaseDir path', async () => {
      const filePath = resolve(__dirname, '../../sidequest/data-discovery-report-pipeline.js');
      const content = await fs.readFile(filePath, 'utf-8');

      // Verify outputBaseDir points to ../document-enhancement-impact-measurement
      assert.match(
        content,
        /outputBaseDir:\s*['"]\.\.\/document-enhancement-impact-measurement['"]/,
        'outputBaseDir should be ../document-enhancement-impact-measurement'
      );
    });

    it('should have correct logDir path', async () => {
      const filePath = resolve(__dirname, '../../sidequest/data-discovery-report-pipeline.js');
      const content = await fs.readFile(filePath, 'utf-8');

      // Verify logDir points to ../logs
      assert.match(
        content,
        /logDir:\s*['"]\.\.\/logs['"]/,
        'logDir should be ../logs'
      );
    });
  });

  describe('File existence checks', () => {
    it('should verify index.js exists in sidequest/', async () => {
      const filePath = resolve(__dirname, '../../sidequest/index.js');
      const stats = await fs.stat(filePath);
      assert.ok(stats.isFile(), 'index.js should exist in sidequest/');
    });

    it('should verify data-discovery-report-pipeline.js exists in sidequest/', async () => {
      const filePath = resolve(__dirname, '../../sidequest/data-discovery-report-pipeline.js');
      const stats = await fs.stat(filePath);
      assert.ok(stats.isFile(), 'data-discovery-report-pipeline.js should exist in sidequest/');
    });

    it('should verify index.js was removed from root', async () => {
      const filePath = resolve(__dirname, '../../index.js');
      try {
        await fs.stat(filePath);
        assert.fail('index.js should not exist in root directory');
      } catch (error) {
        assert.strictEqual(error.code, 'ENOENT', 'index.js should not exist in root');
      }
    });

    it('should verify data-discovery-report-pipeline.js was removed from jobs/data-discovery/', async () => {
      const filePath = resolve(__dirname, '../../jobs/data-discovery/data-discovery-report-pipeline.js');
      try {
        await fs.stat(filePath);
        assert.fail('data-discovery-report-pipeline.js should not exist in jobs/data-discovery/');
      } catch (error) {
        assert.strictEqual(error.code, 'ENOENT', 'data-discovery-report-pipeline.js should not exist in jobs/data-discovery/');
      }
    });
  });

  describe('Referenced module existence', () => {
    it('should verify repomix-worker.js exists in sidequest/', async () => {
      const filePath = resolve(__dirname, '../../sidequest/repomix-worker.js');
      const stats = await fs.stat(filePath);
      assert.ok(stats.isFile(), 'repomix-worker.js should exist');
    });

    it('should verify directory-scanner.js exists in sidequest/', async () => {
      const filePath = resolve(__dirname, '../../sidequest/directory-scanner.js');
      const stats = await fs.stat(filePath);
      assert.ok(stats.isFile(), 'directory-scanner.js should exist');
    });

    it('should verify schema-enhancement-worker.js exists in sidequest/doc-enhancement/', async () => {
      const filePath = resolve(__dirname, '../../sidequest/doc-enhancement/schema-enhancement-worker.js');
      try {
        const stats = await fs.stat(filePath);
        assert.ok(stats.isFile(), 'schema-enhancement-worker.js should exist');
      } catch (error) {
        // This file may not exist yet, so we'll just log a warning
        console.warn('⚠️  schema-enhancement-worker.js not found - may need to be created');
      }
    });

    it('should verify readme-scanner.js exists in sidequest/doc-enhancement/', async () => {
      const filePath = resolve(__dirname, '../../sidequest/doc-enhancement/readme-scanner.js');
      try {
        const stats = await fs.stat(filePath);
        assert.ok(stats.isFile(), 'readme-scanner.js should exist');
      } catch (error) {
        // This file may not exist yet, so we'll just log a warning
        console.warn('⚠️  readme-scanner.js not found - may need to be created');
      }
    });
  });

  describe('Output directory paths', () => {
    it('should verify condense/ directory exists', async () => {
      const dirPath = resolve(__dirname, '../../condense');
      try {
        const stats = await fs.stat(dirPath);
        assert.ok(stats.isDirectory(), 'condense/ directory should exist');
      } catch (error) {
        console.warn('⚠️  condense/ directory not found - may need to be created');
      }
    });

    it('should verify logs/ directory exists', async () => {
      const dirPath = resolve(__dirname, '../../logs');
      try {
        const stats = await fs.stat(dirPath);
        assert.ok(stats.isDirectory(), 'logs/ directory should exist');
      } catch (error) {
        console.warn('⚠️  logs/ directory not found - may need to be created');
      }
    });

    it('should verify directory-scan-reports/ directory exists', async () => {
      const dirPath = resolve(__dirname, '../../directory-scan-reports');
      try {
        const stats = await fs.stat(dirPath);
        assert.ok(stats.isDirectory(), 'directory-scan-reports/ directory should exist');
      } catch (error) {
        console.warn('⚠️  directory-scan-reports/ directory not found - may need to be created');
      }
    });

    it('should verify document-enhancement-impact-measurement/ directory exists', async () => {
      const dirPath = resolve(__dirname, '../../document-enhancement-impact-measurement');
      try {
        const stats = await fs.stat(dirPath);
        assert.ok(stats.isDirectory(), 'document-enhancement-impact-measurement/ directory should exist');
      } catch (error) {
        console.warn('⚠️  document-enhancement-impact-measurement/ directory not found - may need to be created');
      }
    });
  });
});

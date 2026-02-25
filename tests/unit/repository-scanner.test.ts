#!/usr/bin/env node
/**
 * Repository Scanner Tests
 *
 * Tests for repository scanning and metadata extraction.
 */

// @ts-nocheck
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { RepositoryScanner, RepositoryScanError } from '../../sidequest/pipeline-core/scanners/repository-scanner.ts';

describe('RepositoryScanner', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), 'test-repo-scanner-' + Date.now());
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('Constructor', () => {
    it('should initialize with default options', () => {
      const scanner = new RepositoryScanner();
      assert.ok(scanner.repomixWorker);
    });

    it('should initialize with custom options', () => {
      const scanner = new RepositoryScanner({
        outputBaseDir: '/custom/output',
        codeBaseDir: '/custom/code',
        maxConcurrent: 5
      });
      assert.ok(scanner.repomixWorker);
    });
  });

  describe('validateRepository', () => {
    it('should validate existing directory', async () => {
      const scanner = new RepositoryScanner();

      // Should not throw for valid directory
      await assert.doesNotReject(async () => {
        await scanner.validateRepository(tempDir);
      });
    });

    it('should reject non-existent path', async () => {
      const scanner = new RepositoryScanner();
      const nonExistent = path.join(tempDir, 'non-existent');

      await assert.rejects(
        async () => scanner.validateRepository(nonExistent),
        /Invalid repository path/
      );
    });

    it('should reject file path (not directory)', async () => {
      const scanner = new RepositoryScanner();
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'content');

      await assert.rejects(
        async () => scanner.validateRepository(filePath),
        /not a directory/
      );
    });

    it('should warn but proceed for non-git repositories', async () => {
      const scanner = new RepositoryScanner();
      // tempDir has no .git folder
      await assert.doesNotReject(async () => {
        await scanner.validateRepository(tempDir);
      });
    });

    it('should not warn for git repositories', async () => {
      const scanner = new RepositoryScanner();
      await fs.mkdir(path.join(tempDir, '.git'));

      await assert.doesNotReject(async () => {
        await scanner.validateRepository(tempDir);
      });
    });
  });

  describe('getRepositoryInfo', () => {
    it('should return basic info for non-git directory', async () => {
      const scanner = new RepositoryScanner();
      const info = await scanner.getRepositoryInfo(tempDir);

      assert.strictEqual(info.path, tempDir);
      assert.strictEqual(info.name, path.basename(tempDir));
      assert.strictEqual(info.git_remote, null);
      assert.strictEqual(info.git_branch, null);
      assert.strictEqual(info.git_commit, null);
    });

    it('should extract git info for git repository', async () => {
      const scanner = new RepositoryScanner();

      // Create minimal git repo structure
      await fs.mkdir(path.join(tempDir, '.git'));

      const info = await scanner.getRepositoryInfo(tempDir);

      assert.strictEqual(info.path, tempDir);
      assert.strictEqual(info.name, path.basename(tempDir));
      // Git commands will fail without proper git init, so these should be null
      // but the function shouldn't throw
    });
  });

  describe('detectLanguages', () => {
    it('should detect JavaScript files', () => {
      const scanner = new RepositoryScanner();
      const files = [
        '/repo/src/app.js',
        '/repo/lib/utils.js'
      ];

      const languages = scanner.detectLanguages(files);
      assert.ok(languages.includes('javascript'));
    });

    it('should detect TypeScript files', () => {
      const scanner = new RepositoryScanner();
      const files = [
        '/repo/src/app.ts',
        '/repo/src/types.tsx'
      ];

      const languages = scanner.detectLanguages(files);
      assert.ok(languages.includes('typescript'));
    });

    it('should detect Python files', () => {
      const scanner = new RepositoryScanner();
      const files = [
        '/repo/main.py',
        '/repo/utils.py'
      ];

      const languages = scanner.detectLanguages(files);
      assert.ok(languages.includes('python'));
    });

    it('should detect multiple languages', () => {
      const scanner = new RepositoryScanner();
      const files = [
        '/repo/app.js',
        '/repo/server.ts',
        '/repo/script.py',
        '/repo/main.go'
      ];

      const languages = scanner.detectLanguages(files);
      assert.ok(languages.includes('javascript'));
      assert.ok(languages.includes('typescript'));
      assert.ok(languages.includes('python'));
      assert.ok(languages.includes('go'));
    });

    it('should return unique languages', () => {
      const scanner = new RepositoryScanner();
      const files = [
        '/repo/app1.js',
        '/repo/app2.js',
        '/repo/app3.js'
      ];

      const languages = scanner.detectLanguages(files);
      assert.strictEqual(languages.filter(l => l === 'javascript').length, 1);
    });

    it('should handle files without recognized extensions', () => {
      const scanner = new RepositoryScanner();
      const files = [
        '/repo/README.md',
        '/repo/config.yml',
        '/repo/.gitignore'
      ];

      const languages = scanner.detectLanguages(files);
      assert.strictEqual(languages.length, 0);
    });

    it('should handle empty file list', () => {
      const scanner = new RepositoryScanner();
      const languages = scanner.detectLanguages([]);
      assert.strictEqual(languages.length, 0);
    });

    it('should detect JSX/TSX as JavaScript/TypeScript', () => {
      const scanner = new RepositoryScanner();
      const files = [
        '/repo/Component.jsx',
        '/repo/Page.tsx'
      ];

      const languages = scanner.detectLanguages(files);
      assert.ok(languages.includes('javascript'));
      assert.ok(languages.includes('typescript'));
    });

    it('should detect Ruby, PHP, Java, and Rust', () => {
      const scanner = new RepositoryScanner();
      const files = [
        '/repo/app.rb',
        '/repo/index.php',
        '/repo/Main.java',
        '/repo/lib.rs'
      ];

      const languages = scanner.detectLanguages(files);
      assert.ok(languages.includes('ruby'));
      assert.ok(languages.includes('php'));
      assert.ok(languages.includes('java'));
      assert.ok(languages.includes('rust'));
    });
  });

  describe('listFiles', () => {
    it('should list all files in directory', async () => {
      const scanner = new RepositoryScanner();

      // Create test files
      await fs.writeFile(path.join(tempDir, 'file1.js'), 'const a = 1;');
      await fs.writeFile(path.join(tempDir, 'file2.ts'), 'const b: number = 2;');

      const files = await scanner.listFiles(tempDir);
      assert.strictEqual(files.length, 2);
      assert.ok(files.some(f => f.endsWith('file1.js')));
      assert.ok(files.some(f => f.endsWith('file2.ts')));
    });

    it('should recursively find files in subdirectories', async () => {
      const scanner = new RepositoryScanner();

      // Create nested structure
      await fs.mkdir(path.join(tempDir, 'src'));
      await fs.writeFile(path.join(tempDir, 'src', 'app.js'), 'code');
      await fs.writeFile(path.join(tempDir, 'root.js'), 'code');

      const files = await scanner.listFiles(tempDir);
      assert.ok(files.length >= 2);
      assert.ok(files.some(f => f.includes('src/app.js') || f.includes('src\\app.js')));
    });

    it('should skip node_modules directory', async () => {
      const scanner = new RepositoryScanner();

      await fs.mkdir(path.join(tempDir, 'node_modules'));
      await fs.writeFile(path.join(tempDir, 'node_modules', 'pkg.js'), 'module');
      await fs.writeFile(path.join(tempDir, 'app.js'), 'code');

      const files = await scanner.listFiles(tempDir);
      assert.ok(!files.some(f => f.includes('node_modules')));
      assert.ok(files.some(f => f.endsWith('app.js')));
    });

    it('should skip .git directory', async () => {
      const scanner = new RepositoryScanner();

      await fs.mkdir(path.join(tempDir, '.git'));
      await fs.writeFile(path.join(tempDir, '.git', 'config'), 'git config');
      await fs.writeFile(path.join(tempDir, 'app.js'), 'code');

      const files = await scanner.listFiles(tempDir);
      assert.ok(!files.some(f => f.includes('.git')));
    });

    it('should skip dist and build directories', async () => {
      const scanner = new RepositoryScanner();

      await fs.mkdir(path.join(tempDir, 'dist'));
      await fs.mkdir(path.join(tempDir, 'build'));
      await fs.writeFile(path.join(tempDir, 'dist', 'bundle.js'), 'bundled');
      await fs.writeFile(path.join(tempDir, 'build', 'out.js'), 'built');
      await fs.writeFile(path.join(tempDir, 'src.js'), 'source');

      const files = await scanner.listFiles(tempDir);
      assert.ok(!files.some(f => f.includes('/dist/') || f.includes('\\dist\\')));
      assert.ok(!files.some(f => f.includes('/build/') || f.includes('\\build\\')));
    });

    it('should filter by language when provided', async () => {
      const scanner = new RepositoryScanner();

      await fs.writeFile(path.join(tempDir, 'app.js'), 'js');
      await fs.writeFile(path.join(tempDir, 'app.py'), 'python');
      await fs.writeFile(path.join(tempDir, 'app.ts'), 'ts');

      const files = await scanner.listFiles(tempDir, { languages: ['javascript'] });
      assert.ok(files.every(f => f.endsWith('.js') || f.endsWith('.jsx')));
      assert.ok(!files.some(f => f.endsWith('.py')));
    });

    it('should return empty array for empty directory', async () => {
      const scanner = new RepositoryScanner();
      const files = await scanner.listFiles(tempDir);
      assert.strictEqual(files.length, 0);
    });
  });

  describe('parseRepomixOutput', () => {
    it('should parse XML format repomix output', async () => {
      const scanner = new RepositoryScanner();
      const outputFile = path.join(tempDir, 'repomix-output.xml');

      const content = `<?xml version="1.0" encoding="UTF-8"?>
<repository>
  <directory_structure>
/project
  src/
    app.js
    utils.ts
  </directory_structure>
  <files>
    <file path="src/app.js">console.log('hello');</file>
    <file path="src/utils.ts">export const util = () => {};</file>
  </files>
</repository>`;

      await fs.writeFile(outputFile, content);

      const metadata = await scanner.parseRepomixOutput(outputFile);
      assert.ok(metadata.totalFiles >= 0);
      assert.ok(Array.isArray(metadata.languages));
    });

    it('should detect languages from file extensions in output', async () => {
      const scanner = new RepositoryScanner();
      const outputFile = path.join(tempDir, 'repomix-output.xml');

      const content = `<repository>
  <files>
    <file path="app.js">code</file>
    <file path="server.ts">code</file>
    <file path="main.py">code</file>
  </files>
</repository>`;

      await fs.writeFile(outputFile, content);

      const metadata = await scanner.parseRepomixOutput(outputFile);
      assert.ok(metadata.languages.includes('javascript'));
      assert.ok(metadata.languages.includes('typescript'));
      assert.ok(metadata.languages.includes('python'));
    });

    it('should handle missing output file gracefully', async () => {
      const scanner = new RepositoryScanner();
      const nonExistent = path.join(tempDir, 'non-existent.xml');

      const metadata = await scanner.parseRepomixOutput(nonExistent);
      assert.strictEqual(metadata.totalFiles, 0);
      assert.strictEqual(metadata.totalLines, 0);
      assert.deepStrictEqual(metadata.languages, []);
    });

    it('should handle malformed XML gracefully', async () => {
      const scanner = new RepositoryScanner();
      const outputFile = path.join(tempDir, 'bad-output.xml');

      await fs.writeFile(outputFile, 'not valid xml {{');

      const metadata = await scanner.parseRepomixOutput(outputFile);
      // Should return defaults, not throw
      assert.ok('totalFiles' in metadata);
      assert.ok('languages' in metadata);
    });
  });

  describe('getFileMetadata', () => {
    // TODO: getFileMetadata always returns [] (not yet implemented in production).
    // Expand this test once the method reads actual file metadata.
    it('should return empty array (placeholder)', async () => {
      const scanner = new RepositoryScanner();
      const metadata = await scanner.getFileMetadata(tempDir, {});
      assert.deepStrictEqual(metadata, []);
    });
  });
});

describe('RepositoryScanError', () => {
  it('should be an Error instance', () => {
    const error = new RepositoryScanError('Test error');
    assert.ok(error instanceof Error);
  });

  it('should have correct name', () => {
    const error = new RepositoryScanError('Test error');
    assert.strictEqual(error.name, 'RepositoryScanError');
  });

  it('should preserve message', () => {
    const error = new RepositoryScanError('Failed to scan');
    assert.strictEqual(error.message, 'Failed to scan');
  });

  it('should support cause option', () => {
    const cause = new Error('Original error');
    const error = new RepositoryScanError('Wrapped error', { cause });
    assert.strictEqual(error.cause, cause);
  });
});

describe('RepositoryScanner integration', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), 'test-scanner-int-' + Date.now());
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should complete scan workflow for simple repository', async () => {
    const scanner = new RepositoryScanner();

    // Create minimal repo structure
    await fs.writeFile(path.join(tempDir, 'index.js'), 'console.log("hello");');
    await fs.writeFile(path.join(tempDir, 'README.md'), '# Test');

    // Validate
    await scanner.validateRepository(tempDir);

    // Get info
    const info = await scanner.getRepositoryInfo(tempDir);
    assert.strictEqual(info.path, tempDir);

    // List files
    const files = await scanner.listFiles(tempDir);
    assert.ok(files.length >= 1);

    // Detect languages
    const languages = scanner.detectLanguages(files);
    assert.ok(languages.includes('javascript'));
  });
});

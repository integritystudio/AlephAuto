import { test, describe } from 'node:test';
import assert from 'node:assert';
import { READMEScanner } from '../../sidequest/doc-enhancement/readme-scanner.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('READMEScanner', () => {
  test('should initialize with default options', () => {
    const scanner = new READMEScanner();
    assert.strictEqual(scanner.baseDir, process.cwd());
    assert.ok(scanner.excludeDirs.has('node_modules'));
    assert.ok(scanner.excludeDirs.has('.git'));
    assert.strictEqual(scanner.maxDepth, 10);
    assert.ok(Array.isArray(scanner.readmePatterns));
  });

  test('should initialize with custom options', () => {
    const customDir = '/custom/path';
    const scanner = new READMEScanner({
      baseDir: customDir,
      maxDepth: 5,
      readmePatterns: ['README.md'],
    });

    assert.strictEqual(scanner.baseDir, customDir);
    assert.strictEqual(scanner.maxDepth, 5);
    assert.strictEqual(scanner.readmePatterns.length, 1);
  });

  test('should identify README files correctly', () => {
    const scanner = new READMEScanner();

    assert.strictEqual(scanner.isREADMEFile('README.md'), true);
    assert.strictEqual(scanner.isREADMEFile('readme.md'), true);
    assert.strictEqual(scanner.isREADMEFile('Readme.md'), true);
    assert.strictEqual(scanner.isREADMEFile('index.js'), false);
    assert.strictEqual(scanner.isREADMEFile('package.json'), false);
  });

  test('should scan for README files', async () => {
    const tempDir = path.join(os.tmpdir(), 'test-readme-scan-' + Date.now());

    try {
      // Create test directory structure with READMEs
      await fs.mkdir(path.join(tempDir, 'project1'), { recursive: true });
      await fs.mkdir(path.join(tempDir, 'project2'), { recursive: true });
      await fs.writeFile(path.join(tempDir, 'README.md'), '# Root');
      await fs.writeFile(path.join(tempDir, 'project1', 'README.md'), '# Project 1');
      await fs.writeFile(path.join(tempDir, 'project2', 'readme.md'), '# Project 2');
      await fs.writeFile(path.join(tempDir, 'project1', 'index.js'), 'console.log("test")');

      const scanner = new READMEScanner({
        baseDir: tempDir,
        excludeDirs: ['node_modules'],
      });

      const readmes = await scanner.scanREADMEs();

      // Should find 3 README files
      assert.strictEqual(readmes.length, 3);
      const fileNames = readmes.map(r => r.fileName);
      assert.ok(fileNames.includes('README.md'));
      assert.ok(fileNames.includes('readme.md'));
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  test('should detect schema markup in README', async () => {
    const tempDir = path.join(os.tmpdir(), 'test-schema-detect-' + Date.now());

    try {
      await fs.mkdir(tempDir, { recursive: true });

      // README without schema
      const readmeWithout = path.join(tempDir, 'README-without.md');
      await fs.writeFile(readmeWithout, '# Test\n\nThis is a test.');

      // README with schema
      const readmeWith = path.join(tempDir, 'README-with.md');
      await fs.writeFile(readmeWith, '# Test\n\n<script type="application/ld+json">\n{}\n</script>');

      const scanner = new READMEScanner();

      const hasSchemaWithout = await scanner.hasSchemaMarkup(readmeWithout);
      const hasSchemaWith = await scanner.hasSchemaMarkup(readmeWith);

      assert.strictEqual(hasSchemaWithout, false);
      assert.strictEqual(hasSchemaWith, true);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  test('should read README content', async () => {
    const tempDir = path.join(os.tmpdir(), 'test-readme-read-' + Date.now());

    try {
      await fs.mkdir(tempDir, { recursive: true });
      const readmePath = path.join(tempDir, 'README.md');
      const content = '# Test README\n\nThis is a test.';
      await fs.writeFile(readmePath, content);

      const scanner = new READMEScanner();
      const readContent = await scanner.readREADME(readmePath);

      assert.strictEqual(readContent, content);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  test('should gather context from directory', async () => {
    const tempDir = path.join(os.tmpdir(), 'test-context-' + Date.now());

    try {
      await fs.mkdir(tempDir, { recursive: true });

      // Create files to detect languages
      await fs.writeFile(path.join(tempDir, 'index.js'), 'console.log("test")');
      await fs.writeFile(path.join(tempDir, 'main.py'), 'print("test")');
      await fs.writeFile(path.join(tempDir, 'package.json'), '{}');

      const scanner = new READMEScanner();
      const context = await scanner.gatherContext(tempDir);

      assert.ok(context.languages.has('JavaScript'));
      assert.ok(context.languages.has('Python'));
      assert.strictEqual(context.hasPackageJson, true);
      assert.strictEqual(context.projectType, 'nodejs');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  test('should detect multiple languages', async () => {
    const tempDir = path.join(os.tmpdir(), 'test-multi-lang-' + Date.now());

    try {
      await fs.mkdir(tempDir, { recursive: true });

      // Create files in different languages
      await fs.writeFile(path.join(tempDir, 'index.ts'), 'const x: string = "test"');
      await fs.writeFile(path.join(tempDir, 'main.go'), 'package main');
      await fs.writeFile(path.join(tempDir, 'app.rs'), 'fn main() {}');

      const scanner = new READMEScanner();
      const context = await scanner.gatherContext(tempDir);

      assert.ok(context.languages.has('TypeScript'));
      assert.ok(context.languages.has('Go'));
      assert.ok(context.languages.has('Rust'));
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  test('should get stats about scanned READMEs', async () => {
    const tempDir = path.join(os.tmpdir(), 'test-readme-stats-' + Date.now());

    try {
      await fs.mkdir(tempDir, { recursive: true });
      await fs.writeFile(path.join(tempDir, 'README.md'), '# Test');
      await fs.writeFile(path.join(tempDir, 'README-with.md'), '# Test\n<script type="application/ld+json">\n{}\n</script>');

      const scanner = new READMEScanner({
        baseDir: tempDir,
        readmePatterns: ['README.md', 'README-with.md']
      });
      const readmes = await scanner.scanREADMEs();
      const stats = await scanner.getStats(readmes);

      assert.strictEqual(stats.total, 2);
      assert.strictEqual(stats.withSchema, 1);
      assert.strictEqual(stats.withoutSchema, 1);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  test('should respect maxDepth limit', async () => {
    const tempDir = path.join(os.tmpdir(), 'test-readme-depth-' + Date.now());

    try {
      // Create deep directory structure with READMEs
      await fs.mkdir(path.join(tempDir, 'level1', 'level2', 'level3'), { recursive: true });
      await fs.writeFile(path.join(tempDir, 'README.md'), '# Root');
      await fs.writeFile(path.join(tempDir, 'level1', 'README.md'), '# Level 1');
      await fs.writeFile(path.join(tempDir, 'level1', 'level2', 'README.md'), '# Level 2');
      await fs.writeFile(path.join(tempDir, 'level1', 'level2', 'level3', 'README.md'), '# Level 3');

      const scanner = new READMEScanner({
        baseDir: tempDir,
        maxDepth: 2,
      });

      const readmes = await scanner.scanREADMEs();

      // Should only find READMEs up to depth 2
      const depths = readmes.map(r => r.depth);
      assert.ok(Math.max(...depths) <= 2);
      assert.ok(readmes.length <= 3); // Root, level1, level2
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  test('should exclude specified directories', async () => {
    const tempDir = path.join(os.tmpdir(), 'test-readme-exclude-' + Date.now());

    try {
      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.mkdir(path.join(tempDir, 'node_modules'), { recursive: true });
      await fs.writeFile(path.join(tempDir, 'src', 'README.md'), '# Src');
      await fs.writeFile(path.join(tempDir, 'node_modules', 'README.md'), '# Node Modules');

      const scanner = new READMEScanner({
        baseDir: tempDir,
        excludeDirs: ['node_modules'],
      });

      const readmes = await scanner.scanREADMEs();

      // Should only find README in src, not in node_modules
      assert.strictEqual(readmes.length, 1);
      assert.ok(readmes[0].relativePath.includes('src'));
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});

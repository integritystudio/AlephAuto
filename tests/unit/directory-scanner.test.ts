import { test, describe } from 'node:test';
import assert from 'node:assert';
import { DirectoryScanner } from '../../sidequest/utils/directory-scanner.ts';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('DirectoryScanner', () => {
  test('should initialize with default options', () => {
    const scanner = new DirectoryScanner();
    assert.strictEqual(scanner.baseDir, path.join(os.homedir(), 'code'));
    assert.strictEqual(scanner.outputDir, './directory-scan-reports');
    assert.ok(scanner.excludeDirs.has('node_modules'));
    assert.ok(scanner.excludeDirs.has('.git'));
    assert.strictEqual(scanner.maxDepth, 10);
  });

  test('should initialize with custom options', () => {
    const customDir = '/custom/path';
    const customOutputDir = '/custom/output';
    const customExclude = ['custom1', 'custom2'];
    const scanner = new DirectoryScanner({
      baseDir: customDir,
      outputDir: customOutputDir,
      excludeDirs: customExclude,
      maxDepth: 5,
    });

    assert.strictEqual(scanner.baseDir, customDir);
    assert.strictEqual(scanner.outputDir, customOutputDir);
    assert.ok(scanner.excludeDirs.has('custom1'));
    assert.strictEqual(scanner.maxDepth, 5);
  });

  test('should create excludeDirs as a Set', () => {
    const scanner = new DirectoryScanner({
      excludeDirs: ['node_modules', 'dist'],
    });

    assert.ok(scanner.excludeDirs instanceof Set);
    assert.strictEqual(scanner.excludeDirs.size, 2);
  });

  test('should scan directories in test fixture', async () => {
    // Create a temporary test directory structure with git repositories
    const tempDir = path.join(os.tmpdir(), 'test-scanner-' + Date.now());

    try {
      await fs.mkdir(tempDir, { recursive: true });

      // Create git repositories (DirectoryScanner only finds git repos)
      await fs.mkdir(path.join(tempDir, 'project1'));
      await fs.mkdir(path.join(tempDir, 'project1', '.git'));

      await fs.mkdir(path.join(tempDir, 'project2'));
      await fs.mkdir(path.join(tempDir, 'project2', '.git'));

      await fs.mkdir(path.join(tempDir, 'project3'));
      await fs.mkdir(path.join(tempDir, 'project3', '.git'));

      // Non-git directory - should be ignored
      await fs.mkdir(path.join(tempDir, 'not-a-repo'));

      // Excluded directory with .git - should be skipped
      await fs.mkdir(path.join(tempDir, 'node_modules'));
      await fs.mkdir(path.join(tempDir, 'node_modules', '.git'));

      const scanner = new DirectoryScanner({
        baseDir: tempDir,
        excludeDirs: ['node_modules'],
      });

      const directories = await scanner.scanDirectories();

      // Should find project1, project2, project3 (all git repos, not node_modules)
      assert.ok(directories.length >= 3, `Expected at least 3 directories, got ${directories.length}`);
      const names = directories.map(d => d.name);
      assert.ok(names.includes('project1'), 'Should include project1');
      assert.ok(names.includes('project2'), 'Should include project2');
      assert.ok(names.includes('project3'), 'Should include project3');
      assert.ok(!names.includes('node_modules'), 'Should not include node_modules');
      assert.ok(!names.includes('not-a-repo'), 'Should not include non-git directory');

      // Verify all found directories are git repos
      directories.forEach(dir => {
        assert.ok(dir.isGitRepo, `${dir.name} should be marked as git repo`);
      });
    } finally {
      // Cleanup
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  test('should respect maxDepth limit', async () => {
    const tempDir = path.join(os.tmpdir(), 'test-depth-' + Date.now());

    try {
      // Create deep directory structure with git repos at different levels
      await fs.mkdir(tempDir, { recursive: true });

      // Git repo at depth 1
      await fs.mkdir(path.join(tempDir, 'level1'));
      await fs.mkdir(path.join(tempDir, 'level1', '.git'));

      // Git repo at depth 2 (should not be found with maxDepth=1)
      await fs.mkdir(path.join(tempDir, 'shallow'));
      await fs.mkdir(path.join(tempDir, 'shallow', 'level2'));
      await fs.mkdir(path.join(tempDir, 'shallow', 'level2', '.git'));

      const scanner = new DirectoryScanner({
        baseDir: tempDir,
        maxDepth: 1,
      });

      const directories = await scanner.scanDirectories();

      // Should only find level1 at depth 1, not level2 at depth 2
      assert.ok(directories.length >= 1, `Expected at least 1 directory, got ${directories.length}`);
      const depths = directories.map(d => d.depth);
      const maxDepth = Math.max(...depths);
      assert.ok(maxDepth <= 1, `Max depth should be <= 1, got ${maxDepth}`);

      // Verify level1 is found
      const names = directories.map(d => d.name);
      assert.ok(names.includes('level1'), 'Should include level1');
      assert.ok(!names.includes('level2'), 'Should not include level2 (exceeds maxDepth)');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  test('should handle permission errors gracefully', async () => {
    const scanner = new DirectoryScanner({
      baseDir: '/nonexistent/path/that/does/not/exist',
    });

    // Should not throw, just return empty array
    const directories = await scanner.scanDirectories();
    assert.strictEqual(directories.length, 0);
  });

  test('shouldProcess should return true for valid directories', async () => {
    const tempDir = path.join(os.tmpdir(), 'test-process-' + Date.now());

    try {
      await fs.mkdir(tempDir, { recursive: true });
      await fs.writeFile(path.join(tempDir, 'file.txt'), 'content');

      const scanner = new DirectoryScanner();
      const result = await scanner.shouldProcess(tempDir);

      assert.strictEqual(result, true);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  test('shouldProcess should return false for non-directories', async () => {
    const tempFile = path.join(os.tmpdir(), 'test-file-' + Date.now() + '.txt');

    try {
      await fs.writeFile(tempFile, 'content');

      const scanner = new DirectoryScanner();
      const result = await scanner.shouldProcess(tempFile);

      assert.strictEqual(result, false);
    } finally {
      await fs.rm(tempFile, { force: true });
    }
  });

  test('should generate scan statistics', () => {
    const scanner = new DirectoryScanner();
    const directories = [
      { name: 'project1', depth: 0, relativePath: 'project1', fullPath: '/test/project1' },
      { name: 'project2', depth: 0, relativePath: 'project2', fullPath: '/test/project2' },
      { name: 'src', depth: 1, relativePath: 'project1/src', fullPath: '/test/project1/src' },
      { name: 'src', depth: 1, relativePath: 'project2/src', fullPath: '/test/project2/src' },
      { name: 'lib', depth: 1, relativePath: 'project1/lib', fullPath: '/test/project1/lib' },
    ];

    const stats = scanner.generateScanStats(directories);

    assert.strictEqual(stats.total, 5);
    assert.strictEqual(stats.byDepth[0], 2);
    assert.strictEqual(stats.byDepth[1], 3);
    assert.strictEqual(stats.byName['src'], 2);
    assert.strictEqual(stats.byName['project1'], 1);
    assert.ok(stats.topDirectoryNames.length > 0);
  });

  test('should generate directory tree', () => {
    const scanner = new DirectoryScanner({ baseDir: '/test/base' });
    const directories = [
      { name: 'project1', depth: 0, relativePath: 'project1', fullPath: '/test/base/project1' },
      { name: 'src', depth: 1, relativePath: 'project1/src', fullPath: '/test/base/project1/src' },
    ];

    const tree = scanner.generateDirectoryTree(directories);

    assert.ok(tree.includes('Directory Tree:'));
    assert.ok(tree.includes('/test/base'));
    assert.ok(tree.includes('project1/'));
    assert.ok(tree.includes('src/'));
  });

  test('should save scan report', async () => {
    const tempOutputDir = path.join(os.tmpdir(), 'test-output-' + Date.now());

    try {
      const scanner = new DirectoryScanner({
        baseDir: '/test',
        outputDir: tempOutputDir,
      });

      const directories = [
        { name: 'project1', depth: 0, relativePath: 'project1', fullPath: '/test/project1' },
      ];

      const stats = scanner.generateScanStats(directories);
      const reportPath = await scanner.saveScanReport(directories, stats);

      // Check that report file was created
      const reportExists = await fs.access(reportPath).then(() => true).catch(() => false);
      assert.ok(reportExists);

      // Check report content
      const reportContent = await fs.readFile(reportPath, 'utf-8');
      const report = JSON.parse(reportContent);

      assert.ok(report.timestamp);
      assert.strictEqual(report.baseDir, '/test');
      assert.strictEqual(report.scanStats.total, 1);
      assert.strictEqual(report.directories.length, 1);
    } finally {
      await fs.rm(tempOutputDir, { recursive: true, force: true });
    }
  });

  test('should save directory tree', async () => {
    const tempOutputDir = path.join(os.tmpdir(), 'test-tree-' + Date.now());

    try {
      const scanner = new DirectoryScanner({
        baseDir: '/test',
        outputDir: tempOutputDir,
      });

      const directories = [
        { name: 'project1', depth: 0, relativePath: 'project1', fullPath: '/test/project1' },
      ];

      const treePath = await scanner.saveDirectoryTree(directories);

      // Check that tree file was created
      const treeExists = await fs.access(treePath).then(() => true).catch(() => false);
      assert.ok(treeExists);

      // Check tree content
      const treeContent = await fs.readFile(treePath, 'utf-8');
      assert.ok(treeContent.includes('Directory Tree:'));
      assert.ok(treeContent.includes('/test'));
    } finally {
      await fs.rm(tempOutputDir, { recursive: true, force: true });
    }
  });

  test('should generate and save complete scan results', async () => {
    const tempOutputDir = path.join(os.tmpdir(), 'test-complete-' + Date.now());

    try {
      const scanner = new DirectoryScanner({
        baseDir: '/test',
        outputDir: tempOutputDir,
      });

      const directories = [
        { name: 'project1', depth: 0, relativePath: 'project1', fullPath: '/test/project1' },
        { name: 'src', depth: 1, relativePath: 'project1/src', fullPath: '/test/project1/src' },
      ];

      const results = await scanner.generateAndSaveScanResults(directories);

      // Check all output files
      assert.ok(results.summary);
      assert.ok(results.reportPath);
      assert.ok(results.treePath);
      assert.ok(results.summaryPath);

      // Verify summary content
      assert.strictEqual(results.summary.totalDirectories, 2);
      assert.strictEqual(results.summary.maxDepth, 1);
      assert.strictEqual(results.summary.baseDir, '/test');

      // Verify all files exist
      const reportExists = await fs.access(results.reportPath).then(() => true).catch(() => false);
      const treeExists = await fs.access(results.treePath).then(() => true).catch(() => false);
      const summaryExists = await fs.access(results.summaryPath).then(() => true).catch(() => false);

      assert.ok(reportExists);
      assert.ok(treeExists);
      assert.ok(summaryExists);

      // Verify summary file content
      const summaryContent = await fs.readFile(results.summaryPath, 'utf-8');
      const summary = JSON.parse(summaryContent);

      assert.strictEqual(summary.totalDirectories, 2);
      assert.ok(summary.stats.topDirectoryNames);
    } finally {
      await fs.rm(tempOutputDir, { recursive: true, force: true });
    }
  });
});

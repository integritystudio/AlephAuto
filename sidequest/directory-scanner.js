import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createComponentLogger } from './logger.js';

const logger = createComponentLogger('DirectoryScanner');

/**
 * DirectoryScanner - Recursively scans directories
 */
export class DirectoryScanner {
  constructor(options = {}) {
    this.baseDir = options.baseDir || path.join(os.homedir(), 'code');
    this.outputDir = options.outputDir || './directory-scan-reports';
    this.excludeDirs = new Set(options.excludeDirs || [
      'node_modules',
      '.git',
      'dist',
      'build',
      'coverage',
      '.next',
      '.nuxt',
      'vendor',
      '__pycache__',
      '.venv',
      'venv',
      'jobs',
      'logs',
      '.claude',
      'python',
      'node',
      'go',
      'php',
      'rust',
      'recovery',
    ]);
    this.maxDepth = options.maxDepth || 10;
  }

  /**
   * Scan for git repository root directories only
   */
  async scanDirectories() {
    const directories = [];
    await this.scanRecursive(this.baseDir, '', 0, directories);
    return directories;
  }

  /**
   * Check if a directory is a git repository root
   */
  async isGitRepository(dirPath) {
    try {
      const gitPath = path.join(dirPath, '.git');
      const stat = await fs.stat(gitPath);
      return stat.isDirectory();
    } catch (error) {
      return false;
    }
  }

  /**
   * Recursively scan for git repository root directories
   */
  async scanRecursive(currentPath, relativePath, depth, results) {
    // Check depth limit
    if (depth > this.maxDepth) {
      return;
    }

    try {
      // Check if current directory is a git repository
      const isGitRepo = await this.isGitRepository(currentPath);

      if (isGitRepo) {
        // This is a git repository root - add it and stop recursing
        results.push({
          fullPath: currentPath,
          relativePath: relativePath || path.basename(currentPath),
          name: path.basename(currentPath),
          depth,
          isGitRepo: true,
        });
        logger.info({ path: currentPath, relativePath }, 'Found git repository');
        return; // Don't scan subdirectories of git repos
      }

      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        // Skip excluded directories
        if (this.excludeDirs.has(entry.name)) {
          continue;
        }

        // Skip hidden directories (except .git is checked separately)
        if (entry.name.startsWith('.')) {
          continue;
        }

        const fullPath = path.join(currentPath, entry.name);
        const newRelativePath = relativePath
          ? path.join(relativePath, entry.name)
          : entry.name;

        // Recurse into subdirectories
        await this.scanRecursive(fullPath, newRelativePath, depth + 1, results);
      }
    } catch (error) {
      // Log but don't fail on permission errors
      logger.warn({ path: currentPath, error: error.message }, 'Cannot access directory');
    }
  }

  /**
   * Check if a directory should be processed
   */
  async shouldProcess(dirPath) {
    try {
      const stat = await fs.stat(dirPath);
      if (!stat.isDirectory()) return false;

      // Check if directory has any files (not just subdirectories)
      const entries = await fs.readdir(dirPath);
      return entries.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get directory info
   */
  async getDirectoryInfo(dirPath) {
    const stat = await fs.stat(dirPath);
    const entries = await fs.readdir(dirPath);

    return {
      path: dirPath,
      size: stat.size,
      fileCount: entries.length,
      modifiedAt: stat.mtime,
    };
  }

  /**
   * Generate scan statistics
   */
  generateScanStats(directories) {
    const stats = {
      total: directories.length,
      byDepth: {},
      totalSize: 0,
      byName: {},
    };

    for (const dir of directories) {
      // Count by depth
      stats.byDepth[dir.depth] = (stats.byDepth[dir.depth] || 0) + 1;

      // Count by name (for detecting common project types)
      stats.byName[dir.name] = (stats.byName[dir.name] || 0) + 1;
    }

    // Get top directory names
    const sortedNames = Object.entries(stats.byName)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    stats.topDirectoryNames = sortedNames.map(([name, count]) => ({ name, count }));

    return stats;
  }

  /**
   * Save scan report to output directory
   */
  async saveScanReport(directories, stats) {
    await fs.mkdir(this.outputDir, { recursive: true });

    const timestamp = Date.now();
    const report = {
      timestamp: new Date().toISOString(),
      baseDir: this.baseDir,
      scanStats: stats,
      directories: directories.map(d => ({
        relativePath: d.relativePath,
        name: d.name,
        depth: d.depth,
      })),
    };

    const reportPath = path.join(this.outputDir, `scan-report-${timestamp}.json`);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    return reportPath;
  }

  /**
   * Generate directory tree visualization
   */
  generateDirectoryTree(directories) {
    const tree = [];

    // Group by depth for easier visualization
    const byDepth = {};
    for (const dir of directories) {
      if (!byDepth[dir.depth]) byDepth[dir.depth] = [];
      byDepth[dir.depth].push(dir);
    }

    // Generate tree structure
    tree.push('Directory Tree:');
    tree.push('==============');
    tree.push('');
    tree.push(this.baseDir);

    for (const dir of directories) {
      const indent = '  '.repeat(dir.depth + 1);
      const prefix = dir.depth === 0 ? '├── ' : '└── ';
      tree.push(`${indent}${prefix}${dir.name}/`);
    }

    return tree.join('\n');
  }

  /**
   * Save directory tree to file
   */
  async saveDirectoryTree(directories) {
    await fs.mkdir(this.outputDir, { recursive: true });

    const tree = this.generateDirectoryTree(directories);
    const timestamp = Date.now();
    const treePath = path.join(this.outputDir, `directory-tree-${timestamp}.txt`);

    await fs.writeFile(treePath, tree);

    return treePath;
  }

  /**
   * Generate and save complete scan results
   */
  async generateAndSaveScanResults(directories) {
    const stats = this.generateScanStats(directories);

    // Save JSON report
    const reportPath = await this.saveScanReport(directories, stats);

    // Save tree visualization
    const treePath = await this.saveDirectoryTree(directories);

    // Create summary
    const summary = {
      timestamp: new Date().toISOString(),
      baseDir: this.baseDir,
      totalDirectories: directories.length,
      maxDepth: Math.max(...directories.map(d => d.depth)),
      reportPath,
      treePath,
      stats,
    };

    const summaryPath = path.join(this.outputDir, `scan-summary-${Date.now()}.json`);
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));

    return {
      summary,
      reportPath,
      treePath,
      summaryPath,
    };
  }
}

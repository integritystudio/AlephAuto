import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createComponentLogger, logWarn } from './logger.ts';

const logger = createComponentLogger('DirectoryScanner');

interface DirectoryScannerOptions {
  baseDir?: string;
  outputDir?: string;
  excludeDirs?: string[];
  maxDepth?: number;
}

interface ScannedDirectory {
  fullPath: string;
  relativePath: string;
  name: string;
  depth: number;
  isGitRepo: boolean;
}

interface ScanStats {
  total: number;
  byDepth: Record<number, number>;
  totalSize: number;
  byName: Record<string, number>;
  topDirectoryNames?: Array<{ name: string; count: number }>;
}

interface ScanReport {
  timestamp: string;
  baseDir: string;
  scanStats: ScanStats;
  directories: Array<{ relativePath: string; name: string; depth: number }>;
}

interface ScanSummary {
  timestamp: string;
  baseDir: string;
  totalDirectories: number;
  maxDepth: number;
  reportPath: string;
  treePath: string;
  stats: ScanStats;
}

interface DirectoryInfo {
  path: string;
  size: number;
  fileCount: number;
  modifiedAt: Date;
}

/**
 * DirectoryScanner - Recursively scans directories
 */
export class DirectoryScanner {
  baseDir: string;
  outputDir: string;
  excludeDirs: Set<string>;
  maxDepth: number;

  constructor(options: DirectoryScannerOptions = {}) {
    this.baseDir = options.baseDir ?? path.join(os.homedir(), 'code');
    this.outputDir = options.outputDir ?? './directory-scan-reports';
    this.excludeDirs = new Set(options.excludeDirs ?? [
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
    this.maxDepth = options.maxDepth ?? 10;
  }

  /**
   * Scan for git repository root directories only
   */
  async scanDirectories(): Promise<ScannedDirectory[]> {
    const directories: ScannedDirectory[] = [];
    await this.scanRecursive(this.baseDir, '', 0, directories);
    return directories;
  }

  /**
   * Check if a directory is a git repository root
   */
  async isGitRepository(dirPath: string): Promise<boolean> {
    try {
      const gitPath = path.join(dirPath, '.git');
      const stat = await fs.stat(gitPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Recursively scan for git repository root directories
   */
  async scanRecursive(currentPath: string, relativePath: string, depth: number, results: ScannedDirectory[]): Promise<void> {
    if (depth > this.maxDepth) {
      return;
    }

    try {
      const isGitRepo = await this.isGitRepository(currentPath);

      if (isGitRepo) {
        results.push({
          fullPath: currentPath,
          relativePath: relativePath || path.basename(currentPath),
          name: path.basename(currentPath),
          depth,
          isGitRepo: true,
        });
        logger.info({ path: currentPath, relativePath }, 'Found git repository');
        return;
      }

      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        if (this.excludeDirs.has(entry.name)) {
          continue;
        }

        if (entry.name.startsWith('.')) {
          continue;
        }

        const fullPath = path.join(currentPath, entry.name);
        const newRelativePath = relativePath
          ? path.join(relativePath, entry.name)
          : entry.name;

        await this.scanRecursive(fullPath, newRelativePath, depth + 1, results);
      }
    } catch (error) {
      logWarn(logger, null, 'Cannot access directory', { path: currentPath, errorMessage: (error as Error).message });
    }
  }

  /**
   * Check if a directory should be processed
   */
  async shouldProcess(dirPath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(dirPath);
      if (!stat.isDirectory()) return false;

      const entries = await fs.readdir(dirPath);
      return entries.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get directory info
   */
  async getDirectoryInfo(dirPath: string): Promise<DirectoryInfo> {
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
  generateScanStats(directories: ScannedDirectory[]): ScanStats {
    const stats: ScanStats = {
      total: directories.length,
      byDepth: {},
      totalSize: 0,
      byName: {},
    };

    for (const dir of directories) {
      stats.byDepth[dir.depth] = (stats.byDepth[dir.depth] ?? 0) + 1;
      stats.byName[dir.name] = (stats.byName[dir.name] ?? 0) + 1;
    }

    const sortedNames = Object.entries(stats.byName)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    stats.topDirectoryNames = sortedNames.map(([name, count]) => ({ name, count }));

    return stats;
  }

  /**
   * Save scan report to output directory
   */
  async saveScanReport(directories: ScannedDirectory[], stats: ScanStats): Promise<string> {
    await fs.mkdir(this.outputDir, { recursive: true });

    const timestamp = Date.now();
    const report: ScanReport = {
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
  generateDirectoryTree(directories: ScannedDirectory[]): string {
    const tree: string[] = [];

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
  async saveDirectoryTree(directories: ScannedDirectory[]): Promise<string> {
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
  async generateAndSaveScanResults(directories: ScannedDirectory[]): Promise<{
    summary: ScanSummary;
    reportPath: string;
    treePath: string;
    summaryPath: string;
  }> {
    const stats = this.generateScanStats(directories);

    const reportPath = await this.saveScanReport(directories, stats);
    const treePath = await this.saveDirectoryTree(directories);

    const summary: ScanSummary = {
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

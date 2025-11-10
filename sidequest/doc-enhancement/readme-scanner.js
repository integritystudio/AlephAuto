import fs from 'fs/promises';
import path from 'path';

/**
 * READMEScanner - Recursively scans for README.md files
 */
export class READMEScanner {
  constructor(options = {}) {
    this.baseDir = options.baseDir || process.cwd();
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
      '_site',
      '.cache',
      'target',
      '.idea',
      '.vscode',
      'jobs',
    ]);
    this.maxDepth = options.maxDepth || 10;
    this.readmePatterns = options.readmePatterns || [
      'README.md',
      'readme.md',
      'Readme.md',
      'README_ENHANCED.md',
    ];
  }

  /**
   * Scan all README files recursively
   */
  async scanREADMEs() {
    const readmes = [];
    await this.scanRecursive(this.baseDir, '', 0, readmes);
    return readmes;
  }

  /**
   * Recursively scan a directory for README files
   */
  async scanRecursive(currentPath, relativePath, depth, results) {
    // Check depth limit
    if (depth > this.maxDepth) {
      return;
    }

    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          // Skip excluded directories
          if (this.excludeDirs.has(entry.name) || entry.name.startsWith('.')) {
            continue;
          }

          const fullPath = path.join(currentPath, entry.name);
          const newRelativePath = relativePath
            ? path.join(relativePath, entry.name)
            : entry.name;

          // Recurse into subdirectories
          await this.scanRecursive(fullPath, newRelativePath, depth + 1, results);
        } else if (entry.isFile() && this.isREADMEFile(entry.name)) {
          const fullPath = path.join(currentPath, entry.name);
          const fileRelativePath = relativePath
            ? path.join(relativePath, entry.name)
            : entry.name;

          results.push({
            fullPath,
            relativePath: fileRelativePath,
            fileName: entry.name,
            dirPath: currentPath,
            depth,
          });
        }
      }
    } catch (error) {
      // Log but don't fail on permission errors
      console.warn(`Warning: Cannot access ${currentPath}:`, error.message);
    }
  }

  /**
   * Check if filename matches README patterns
   */
  isREADMEFile(filename) {
    return this.readmePatterns.includes(filename);
  }

  /**
   * Check if README already has schema markup
   */
  async hasSchemaMarkup(readmePath) {
    try {
      const content = await fs.readFile(readmePath, 'utf-8');
      return content.includes('<script type="application/ld+json">');
    } catch (error) {
      return false;
    }
  }

  /**
   * Read README content
   */
  async readREADME(readmePath) {
    try {
      return await fs.readFile(readmePath, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to read README at ${readmePath}: ${error.message}`);
    }
  }

  /**
   * Gather context about a directory
   */
  async gatherContext(dirPath) {
    const context = {
      languages: new Set(),
      gitRemote: null,
      hasPackageJson: false,
      hasPyproject: false,
      projectType: 'unknown',
    };

    try {
      const entries = await fs.readdir(dirPath);

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry);
        const stat = await fs.stat(fullPath);

        if (stat.isFile()) {
          // Detect languages by file extensions
          const ext = path.extname(entry);

          if (ext === '.py') context.languages.add('Python');
          if (['.ts', '.tsx'].includes(ext)) context.languages.add('TypeScript');
          if (['.js', '.jsx'].includes(ext)) context.languages.add('JavaScript');
          if (['.java'].includes(ext)) context.languages.add('Java');
          if (['.go'].includes(ext)) context.languages.add('Go');
          if (['.rs'].includes(ext)) context.languages.add('Rust');
          if (['.rb'].includes(ext)) context.languages.add('Ruby');

          // Check for project markers
          if (entry === 'package.json') {
            context.hasPackageJson = true;
            context.projectType = 'nodejs';
          }
          if (entry === 'pyproject.toml' || entry === 'setup.py') {
            context.hasPyproject = true;
            context.projectType = 'python';
          }
        }
      }

      // Try to get git remote
      context.gitRemote = await this.getGitRemote(dirPath);
    } catch (error) {
      console.warn(`Warning gathering context for ${dirPath}:`, error.message);
    }

    return context;
  }

  /**
   * Get git remote URL for a directory
   */
  async getGitRemote(dirPath) {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      const { stdout } = await execAsync('git remote get-url origin', {
        cwd: dirPath,
        timeout: 5000,
      });

      return stdout.trim();
    } catch (error) {
      return null;
    }
  }

  /**
   * Get statistics about scanned READMEs
   */
  async getStats(readmes) {
    const stats = {
      total: readmes.length,
      withSchema: 0,
      withoutSchema: 0,
      byDepth: {},
    };

    for (const readme of readmes) {
      const hasSchema = await this.hasSchemaMarkup(readme.fullPath);
      if (hasSchema) {
        stats.withSchema++;
      } else {
        stats.withoutSchema++;
      }

      const depth = readme.depth;
      stats.byDepth[depth] = (stats.byDepth[depth] || 0) + 1;
    }

    return stats;
  }
}

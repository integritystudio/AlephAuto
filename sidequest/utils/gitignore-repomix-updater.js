import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createComponentLogger } from './logger.js';

const logger = createComponentLogger('GitignoreRepomixUpdater');

/**
 * GitignoreRepomixUpdater - Adds repomix-output.xml to .gitignore in all git repositories
 */
export class GitignoreRepomixUpdater {
  constructor(options = {}) {
    this.baseDir = options.baseDir || path.join(os.homedir(), 'code');
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
    ]);
    this.maxDepth = options.maxDepth || 10;
    this.dryRun = options.dryRun || false;
    this.gitignoreEntry = 'repomix-output.xml';
  }

  /**
   * Find all git repositories recursively
   */
  async findGitRepositories() {
    const repositories = [];
    await this.scanForGitRepos(this.baseDir, 0, repositories);
    return repositories;
  }

  /**
   * Recursively scan for git repositories
   */
  async scanForGitRepos(currentPath, depth, results) {
    // Check depth limit
    if (depth > this.maxDepth) {
      return;
    }

    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      // Check if current directory is a git repository
      const hasGit = entries.some(entry => entry.name === '.git' && entry.isDirectory());

      if (hasGit) {
        results.push({
          fullPath: currentPath,
          depth,
        });
        // Don't scan subdirectories of a git repo for nested repos
        // (remove this return if you want to find nested repos)
        return;
      }

      // Scan subdirectories
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        // Skip excluded directories
        if (this.excludeDirs.has(entry.name)) {
          continue;
        }

        // Skip hidden directories except .git
        if (entry.name.startsWith('.') && entry.name !== '.git') {
          continue;
        }

        const fullPath = path.join(currentPath, entry.name);
        await this.scanForGitRepos(fullPath, depth + 1, results);
      }
    } catch (error) {
      // Log but don't fail on permission errors
      logger.warn({ path: currentPath, error: error.message }, 'Cannot access directory');
    }
  }

  /**
   * Check if .gitignore already contains the entry
   */
  async gitignoreContainsEntry(gitignorePath) {
    try {
      const content = await fs.readFile(gitignorePath, 'utf8');
      const lines = content.split('\n').map(line => line.trim());

      // Check for exact match or pattern that would match
      return lines.some(line =>
        line === this.gitignoreEntry ||
        line === `/${this.gitignoreEntry}` ||
        line === `**/${this.gitignoreEntry}` ||
        line === `**/repomix-output.xml`
      );
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false; // File doesn't exist
      }
      throw error;
    }
  }

  /**
   * Add entry to .gitignore file
   */
  async addToGitignore(repoPath) {
    const gitignorePath = path.join(repoPath, '.gitignore');

    try {
      // Check if entry already exists
      const alreadyExists = await this.gitignoreContainsEntry(gitignorePath);

      if (alreadyExists) {
        return {
          path: gitignorePath,
          action: 'skipped',
          reason: 'Entry already exists',
        };
      }

      if (this.dryRun) {
        return {
          path: gitignorePath,
          action: 'would_add',
          reason: 'Dry run mode',
        };
      }

      // Read existing content or start with empty string
      let content = '';
      try {
        content = await fs.readFile(gitignorePath, 'utf8');
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }

      // Ensure content ends with newline before adding new entry
      if (content.length > 0 && !content.endsWith('\n')) {
        content += '\n';
      }

      // Add comment and entry
      if (content.length > 0) {
        content += '\n';
      }
      content += '# Repomix output files\n';
      content += `${this.gitignoreEntry}\n`;

      // Write back to file
      await fs.writeFile(gitignorePath, content, 'utf8');

      return {
        path: gitignorePath,
        action: 'added',
        reason: 'Entry added successfully',
      };
    } catch (error) {
      return {
        path: gitignorePath,
        action: 'error',
        reason: error.message,
      };
    }
  }

  /**
   * Process all repositories
   */
  async processRepositories() {
    logger.info({
      baseDir: this.baseDir,
      dryRun: this.dryRun
    }, 'Scanning for git repositories');

    const repositories = await this.findGitRepositories();
    logger.info({ count: repositories.length }, 'Git repositories found');

    const results = [];

    for (const repo of repositories) {
      logger.info({ repository: repo.fullPath }, 'Processing repository');
      const result = await this.addToGitignore(repo.fullPath);
      results.push({
        repository: repo.fullPath,
        ...result,
      });
      logger.info({
        repository: repo.fullPath,
        action: result.action,
        reason: result.reason
      }, 'Repository processed');
    }

    return {
      totalRepositories: repositories.length,
      results,
      summary: this.generateSummary(results),
    };
  }

  /**
   * Generate summary statistics
   */
  generateSummary(results) {
    const summary = {
      added: 0,
      skipped: 0,
      would_add: 0,
      error: 0,
    };

    for (const result of results) {
      if (summary.hasOwnProperty(result.action)) {
        summary[result.action]++;
      }
    }

    return summary;
  }

  /**
   * Save results to JSON file
   */
  async saveResults(results, outputPath) {
    const report = {
      timestamp: new Date().toISOString(),
      baseDir: this.baseDir,
      dryRun: this.dryRun,
      gitignoreEntry: this.gitignoreEntry,
      ...results,
    };

    await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
    logger.info({ outputPath }, 'Results saved');

    return report;
  }
}

/**
 * Main execution function
 */
export async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || args.includes('-d');
  const baseDir = args.find(arg => !arg.startsWith('-')) || path.join(os.homedir(), 'code');

  const updater = new GitignoreRepomixUpdater({
    baseDir,
    dryRun,
  });

  try {
    const results = await updater.processRepositories();

    // Print summary
    logger.info({
      totalRepositories: results.totalRepositories,
      added: results.summary.added,
      skipped: results.summary.skipped,
      wouldAdd: results.summary.would_add,
      errors: results.summary.error
    }, 'Summary');

    // Save results
    const timestamp = Date.now();
    const outputPath = path.join(
      process.cwd(),
      `gitignore-update-report-${timestamp}.json`
    );
    await updater.saveResults(results, outputPath);

  } catch (error) {
    logger.error({ err: error }, 'Fatal error');
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

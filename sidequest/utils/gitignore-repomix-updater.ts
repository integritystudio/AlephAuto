import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createComponentLogger, logError, logWarn } from './logger.ts';

const logger = createComponentLogger('GitignoreRepomixUpdater');

interface UpdaterOptions {
  baseDir?: string;
  excludeDirs?: string[];
  maxDepth?: number;
  dryRun?: boolean;
}

interface ScannedRepo {
  fullPath: string;
  depth: number;
}

interface UpdateResult {
  path: string;
  action: 'added' | 'skipped' | 'would_add' | 'error';
  reason: string;
}

interface RepoUpdateResult {
  repository: string;
  path: string;
  action: string;
  reason: string;
}

interface UpdateSummary {
  added: number;
  skipped: number;
  would_add: number;
  error: number;
}

interface ProcessResults {
  totalRepositories: number;
  results: RepoUpdateResult[];
  summary: UpdateSummary;
}

/**
 * GitignoreRepomixUpdater - Adds repomix-output.xml to .gitignore in all git repositories
 */
export class GitignoreRepomixUpdater {
  baseDir: string;
  excludeDirs: Set<string>;
  maxDepth: number;
  dryRun: boolean;
  gitignoreEntry: string;

  constructor(options: UpdaterOptions = {}) {
    this.baseDir = options.baseDir ?? path.join(os.homedir(), 'code');
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
    ]);
    this.maxDepth = options.maxDepth ?? 10;
    this.dryRun = options.dryRun ?? false;
    this.gitignoreEntry = 'repomix-output.xml';
  }

  /**
   * Find all git repositories recursively
   */
  async findGitRepositories(): Promise<ScannedRepo[]> {
    const repositories: ScannedRepo[] = [];
    await this.scanForGitRepos(this.baseDir, 0, repositories);
    return repositories;
  }

  /**
   * Recursively scan for git repositories
   */
  async scanForGitRepos(currentPath: string, depth: number, results: ScannedRepo[]): Promise<void> {
    if (depth > this.maxDepth) {
      return;
    }

    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      const hasGit = entries.some(entry => entry.name === '.git' && entry.isDirectory());

      if (hasGit) {
        results.push({
          fullPath: currentPath,
          depth,
        });
        return;
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        if (this.excludeDirs.has(entry.name)) {
          continue;
        }

        if (entry.name.startsWith('.') && entry.name !== '.git') {
          continue;
        }

        const fullPath = path.join(currentPath, entry.name);
        await this.scanForGitRepos(fullPath, depth + 1, results);
      }
    } catch (error) {
      logWarn(logger, null, 'Cannot access directory', { path: currentPath, errorMessage: (error as Error).message });
    }
  }

  /**
   * Check if .gitignore already contains the entry
   */
  async gitignoreContainsEntry(gitignorePath: string): Promise<boolean> {
    try {
      const content = await fs.readFile(gitignorePath, 'utf8');
      const lines = content.split('\n').map(line => line.trim());

      return lines.some(line =>
        line === this.gitignoreEntry ||
        line === `/${this.gitignoreEntry}` ||
        line === `**/${this.gitignoreEntry}` ||
        line === `**/repomix-output.xml`
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Add entry to .gitignore file
   */
  async addToGitignore(repoPath: string): Promise<UpdateResult> {
    const gitignorePath = path.join(repoPath, '.gitignore');

    try {
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

      let content = '';
      try {
        content = await fs.readFile(gitignorePath, 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }

      if (content.length > 0 && !content.endsWith('\n')) {
        content += '\n';
      }

      if (content.length > 0) {
        content += '\n';
      }
      content += '# Repomix output files\n';
      content += `${this.gitignoreEntry}\n`;

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
        reason: (error as Error).message,
      };
    }
  }

  /**
   * Process all repositories
   */
  async processRepositories(): Promise<ProcessResults> {
    logger.info({
      baseDir: this.baseDir,
      dryRun: this.dryRun
    }, 'Scanning for git repositories');

    const repositories = await this.findGitRepositories();
    logger.info({ count: repositories.length }, 'Git repositories found');

    const results: RepoUpdateResult[] = [];

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
  generateSummary(results: RepoUpdateResult[]): UpdateSummary {
    const summary: UpdateSummary = {
      added: 0,
      skipped: 0,
      would_add: 0,
      error: 0,
    };

    for (const result of results) {
      const action = result.action as keyof UpdateSummary;
      if (action in summary) {
        summary[action]++;
      }
    }

    return summary;
  }

  /**
   * Save results to JSON file
   */
  async saveResults(results: ProcessResults, outputPath: string): Promise<object> {
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
export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || args.includes('-d');
  const baseDir = args.find(arg => !arg.startsWith('-')) ?? path.join(os.homedir(), 'code');

  const updater = new GitignoreRepomixUpdater({
    baseDir,
    dryRun,
  });

  try {
    const results = await updater.processRepositories();

    logger.info({
      totalRepositories: results.totalRepositories,
      added: results.summary.added,
      skipped: results.summary.skipped,
      wouldAdd: results.summary.would_add,
      errors: results.summary.error
    }, 'Summary');

    const timestamp = Date.now();
    const outputPath = path.join(
      process.cwd(),
      `gitignore-update-report-${timestamp}.json`
    );
    await updater.saveResults(results, outputPath);

  } catch (error) {
    logError(logger, error, 'Fatal error');
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

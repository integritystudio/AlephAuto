import { RepomixWorker } from '../../workers/repomix-worker.ts';
import { createComponentLogger, logStart } from '../../utils/logger.ts';
import { config } from '../../core/config.ts';
import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';

const logger = createComponentLogger('RepositoryScanner');

// ============================================================================
// Type Definitions
// ============================================================================

export interface RepositoryScannerOptions {
  outputBaseDir?: string;
  codeBaseDir?: string;
  maxConcurrent?: number;
}

export interface ScanConfig {
  [key: string]: unknown;
}

export interface RepositoryInfo {
  path: string;
  name: string;
  git_remote: string | null;
  git_branch: string | null;
  git_commit: string | null;
}

export interface RepomixMetadata {
  totalFiles: number;
  totalLines: number;
  languages: string[];
}

export interface RepositoryScanOutput {
  repository_info: RepositoryInfo & {
    total_files: number;
    total_lines: number;
    languages: string[];
  };
  file_metadata: unknown[];
  scan_metadata: {
    duration_seconds: number;
    repomix_output: string | null;
    timestamp: string;
    used_repomix: boolean;
  };
}

interface FileFilter {
  languages?: string[];
}

// ============================================================================
// RepositoryScanner Class
// ============================================================================

/**
 * Repository Scanner - Discovers files and extracts metadata
 *
 * Uses repomix for context aggregation:
 * - File discovery and metadata
 * - Git change tracking
 * - Token counting
 * - Directory structure
 */
export class RepositoryScanner {
  private readonly repomixWorker: InstanceType<typeof RepomixWorker>;

  constructor(options: RepositoryScannerOptions = {}) {
    this.repomixWorker = new RepomixWorker({
      outputBaseDir: options.outputBaseDir ?? config.outputBaseDir,
      codeBaseDir: options.codeBaseDir ?? config.codeBaseDir,
      maxConcurrent: options.maxConcurrent ?? config.maxConcurrent
    });
  }

  /**
   * Scan repository and extract metadata
   */
  async scanRepository(repoPath: string, scanConfig: ScanConfig = {}): Promise<RepositoryScanOutput> {
    const startTime = Date.now();

    logStart(logger, 'repository scan', { repoPath });

    try {
      // Validate repository path
      await this.validateRepository(repoPath);

      // Get repository info
      const repoInfo = await this.getRepositoryInfo(repoPath);

      // Run repomix scan (optional)
      let metadata: RepomixMetadata = { totalFiles: 0, totalLines: 0, languages: [] };
      let repomixOutput: string | null = null;

      try {
        const repomixResult = await this.runRepomixScan(repoPath);
        metadata = await this.parseRepomixOutput(repomixResult.outputFile as string);
        repomixOutput = repomixResult.outputFile as string;
      } catch (error) {
        logger.warn({ error: (error as Error).message }, 'Repomix scan failed, using basic file discovery');
        // Fall back to basic file discovery
        const files = await this.listFiles(repoPath);
        metadata = {
          totalFiles: files.length,
          totalLines: 0, // Unknown without repomix
          languages: this.detectLanguages(files)
        };
      }

      // Get file metadata
      const fileMetadata = await this.getFileMetadata(repoPath, scanConfig);

      const duration = (Date.now() - startTime) / 1000;

      logger.info({
        repoPath,
        totalFiles: metadata.totalFiles,
        duration
      }, 'Repository scan completed');

      return {
        repository_info: {
          ...repoInfo,
          total_files: metadata.totalFiles,
          total_lines: metadata.totalLines,
          languages: metadata.languages
        },
        file_metadata: fileMetadata,
        scan_metadata: {
          duration_seconds: duration,
          repomix_output: repomixOutput,
          timestamp: new Date().toISOString(),
          used_repomix: repomixOutput !== null
        }
      };

    } catch (error) {
      logger.error({ repoPath, error }, 'Repository scan failed');
      throw new RepositoryScanError(`Failed to scan repository: ${(error as Error).message}`, {
        cause: error
      });
    }
  }

  /**
   * Validate that path is a valid repository
   */
  async validateRepository(repoPath: string): Promise<void> {
    try {
      const stats = await fs.stat(repoPath);
      if (!stats.isDirectory()) {
        throw new Error('Path is not a directory');
      }

      // Check if it's a git repository (optional, not required)
      try {
        await fs.access(path.join(repoPath, '.git'));
      } catch {
        logger.warn({ repoPath }, 'Not a git repository, proceeding anyway');
      }

    } catch (error) {
      throw new Error(`Invalid repository path: ${(error as Error).message}`);
    }
  }

  /**
   * Get repository information
   */
  async getRepositoryInfo(repoPath: string): Promise<RepositoryInfo> {
    const name = path.basename(repoPath);

    const info: RepositoryInfo = {
      path: repoPath,
      name: name,
      git_remote: null,
      git_branch: null,
      git_commit: null
    };

    // Try to get git info
    try {
      const gitDir = path.join(repoPath, '.git');
      await fs.access(gitDir);

      // Get remote
      try {
        info.git_remote = execSync('git config --get remote.origin.url', {
          cwd: repoPath,
          encoding: 'utf-8'
        }).trim();
      } catch {
        logger.debug({ repoPath }, 'No git remote found');
      }

      // Get branch
      try {
        info.git_branch = execSync('git rev-parse --abbrev-ref HEAD', {
          cwd: repoPath,
          encoding: 'utf-8'
        }).trim();
      } catch {
        logger.debug({ repoPath }, 'Could not determine git branch');
      }

      // Get commit
      try {
        info.git_commit = execSync('git rev-parse HEAD', {
          cwd: repoPath,
          encoding: 'utf-8'
        }).trim();
      } catch {
        logger.debug({ repoPath }, 'Could not determine git commit');
      }

    } catch {
      logger.debug({ repoPath }, 'Not a git repository');
    }

    return info;
  }

  /**
   * Run repomix scan
   */
  async runRepomixScan(repoPath: string): Promise<Record<string, unknown>> {
    const relativePath = path.relative(config.codeBaseDir, repoPath) || path.basename(repoPath);

    const job = this.repomixWorker.createRepomixJob(repoPath, relativePath);

    return await this.repomixWorker.runJobHandler(job) as Record<string, unknown>;
  }

  /**
   * Parse repomix output to extract metadata
   */
  async parseRepomixOutput(outputFile: string): Promise<RepomixMetadata> {
    try {
      const content = await fs.readFile(outputFile, 'utf-8');

      const metadata = {
        totalFiles: 0,
        totalLines: 0,
        languages: new Set<string>()
      };

      // Count files in directory_structure section
      const dirStructMatch = content.match(/<directory_structure>([\s\S]*?)<\/directory_structure>/);
      if (dirStructMatch) {
        const structure = dirStructMatch[1];
        // Count file entries (lines without trailing /)
        metadata.totalFiles = (structure.match(/\n\s+[^\s/]+\.[^\s/]+$/gm) ?? []).length;
      }

      // Count file entries
      const fileMatches = content.matchAll(/<file path="([^"]+)">/g);
      const langMap: Record<string, string> = {
        '.js': 'javascript',
        '.ts': 'typescript',
        '.jsx': 'javascript',
        '.tsx': 'typescript',
        '.py': 'python',
        '.go': 'go',
        '.rs': 'rust',
        '.java': 'java',
        '.rb': 'ruby',
        '.php': 'php'
      };
      for (const match of fileMatches) {
        metadata.totalFiles++;

        // Extract language from file extension
        const ext = path.extname(match[1]).toLowerCase();
        if (langMap[ext]) {
          metadata.languages.add(langMap[ext]);
        }
      }

      // Estimate total lines (rough count)
      const linesMatch = content.match(/\n/g);
      metadata.totalLines = linesMatch ? linesMatch.length : 0;

      return {
        totalFiles: metadata.totalFiles,
        totalLines: metadata.totalLines,
        languages: Array.from(metadata.languages)
      };

    } catch (error) {
      logger.warn({ outputFile, error }, 'Failed to parse repomix output');
      return {
        totalFiles: 0,
        totalLines: 0,
        languages: []
      };
    }
  }

  /**
   * Get detailed file metadata
   */
  async getFileMetadata(_repoPath: string, _scanConfig: ScanConfig): Promise<unknown[]> {
    // For now, return empty array
    // Will be populated by ast-grep scan
    return [];
  }

  /**
   * List all files in repository
   */
  async listFiles(repoPath: string, filter: FileFilter = {}): Promise<string[]> {
    const files: string[] = [];

    const ignoredDirs = new Set(['node_modules', '.git', 'dist', 'build', '.next']);
    const langMap: Record<string, string> = {
      '.js': 'javascript',
      '.ts': 'typescript',
      '.jsx': 'javascript',
      '.tsx': 'typescript',
      '.py': 'python'
    };

    async function walk(dir: string): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Skip common ignored directories
        if (entry.isDirectory()) {
          if (ignoredDirs.has(entry.name)) {
            continue;
          }
          await walk(fullPath);
        } else {
          // Apply language filter if provided
          if (filter.languages) {
            const ext = path.extname(entry.name).toLowerCase();
            if (filter.languages.includes(langMap[ext])) {
              files.push(fullPath);
            }
          } else {
            files.push(fullPath);
          }
        }
      }
    }

    await walk(repoPath);
    return files;
  }

  /**
   * Detect languages from file list
   */
  detectLanguages(files: string[]): string[] {
    const langMap: Record<string, string> = {
      '.js': 'javascript',
      '.ts': 'typescript',
      '.jsx': 'javascript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.go': 'go',
      '.rs': 'rust',
      '.java': 'java',
      '.rb': 'ruby',
      '.php': 'php'
    };

    const languages = new Set<string>();
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (langMap[ext]) {
        languages.add(langMap[ext]);
      }
    }

    return Array.from(languages);
  }
}

// ============================================================================
// Error Class
// ============================================================================

/**
 * Custom error class for repository scanning errors
 */
export class RepositoryScanError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    if (options?.cause) {
      (this as unknown as Record<string, unknown>).cause = options.cause;
    }
    this.name = 'RepositoryScanError';
  }
}

import { RepomixWorker } from '../../workers/repomix-worker.js';
import { createComponentLogger } from '../../utils/logger.js';
import { config } from '../../core/config.js';
import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';

const logger = createComponentLogger('RepositoryScanner');

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
  constructor(options = {}) {
    this.repomixWorker = new RepomixWorker({
      outputBaseDir: options.outputBaseDir || config.outputBaseDir,
      codeBaseDir: options.codeBaseDir || config.codeBaseDir,
      maxConcurrent: options.maxConcurrent || config.maxConcurrent
    });
  }

  /**
   * Scan repository and extract metadata
   *
   * @param {string} repoPath - Absolute path to repository
   * @param {object} scanConfig - Scan configuration
   * @returns {Promise<object>}
   */
  async scanRepository(repoPath, scanConfig = {}) {
    const startTime = Date.now();

    logger.info({ repoPath }, 'Starting repository scan');

    try {
      // Validate repository path
      await this.validateRepository(repoPath);

      // Get repository info
      const repoInfo = await this.getRepositoryInfo(repoPath);

      // Run repomix scan (optional)
      /** @type {{ totalFiles: number, totalLines: number, languages: string[] }} */
      let metadata = { totalFiles: 0, totalLines: 0, languages: [] };
      let repomixOutput = null;

      try {
        const repomixResult = await this.runRepomixScan(repoPath);
        metadata = await this.parseRepomixOutput(repomixResult.outputFile);
        repomixOutput = repomixResult.outputFile;
      } catch (error) {
        logger.warn({ error: error.message }, 'Repomix scan failed, using basic file discovery');
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
      throw new RepositoryScanError(`Failed to scan repository: ${error.message}`, {
        cause: error
      });
    }
  }

  /**
   * Validate that path is a valid repository
   */
  async validateRepository(repoPath) {
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
      throw new Error(`Invalid repository path: ${error.message}`);
    }
  }

  /**
   * Get repository information
   */
  async getRepositoryInfo(repoPath) {
    const name = path.basename(repoPath);

    const info = {
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
  async runRepomixScan(repoPath) {
    const relativePath = path.relative(config.codeBaseDir, repoPath) || path.basename(repoPath);

    const job = this.repomixWorker.createRepomixJob(repoPath, relativePath);

    return await this.repomixWorker.runJobHandler(job);
  }

  /**
   * Parse repomix output to extract metadata
   * @returns {Promise<{totalFiles: number, totalLines: number, languages: string[]}>}
   */
  async parseRepomixOutput(outputFile) {
    try {
      const content = await fs.readFile(outputFile, 'utf-8');

      // Parse XML format (default repomix output)
      const metadata = {
        totalFiles: 0,
        totalLines: 0,
        languages: new Set()
      };

      // Count files in directory_structure section
      const dirStructMatch = content.match(/<directory_structure>([\s\S]*?)<\/directory_structure>/);
      if (dirStructMatch) {
        const structure = dirStructMatch[1];
        // Count file entries (lines without trailing /)
        metadata.totalFiles = (structure.match(/\n\s+[^\s/]+\.[^\s/]+$/gm) || []).length;
      }

      // Count file entries
      const fileMatches = content.matchAll(/<file path="([^"]+)">/g);
      for (const match of fileMatches) {
        metadata.totalFiles++;

        // Extract language from file extension
        const ext = path.extname(match[1]).toLowerCase();
        const langMap = {
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
        if (langMap[ext]) {
          metadata.languages.add(langMap[ext]);
        }
      }

      // Estimate total lines (rough count)
      const linesMatch = content.match(/\n/g);
      metadata.totalLines = linesMatch ? linesMatch.length : 0;

      // Convert Set to Array
      /** @type {{totalFiles: number, totalLines: number, languages: string[]}} */
      const result = {
        ...metadata,
        languages: Array.from(metadata.languages)
      };

      return result;

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
  async getFileMetadata(repoPath, scanConfig) {
    // For now, return empty array
    // Will be populated by ast-grep scan
    return [];
  }

  /**
   * List all files in repository
   */
  async listFiles(repoPath, filter = {}) {
    const files = [];

    async function walk(dir) {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Skip common ignored directories
        if (entry.isDirectory()) {
          if (['node_modules', '.git', 'dist', 'build', '.next'].includes(entry.name)) {
            continue;
          }
          await walk(fullPath);
        } else {
          // Apply language filter if provided
          if (filter.languages) {
            const ext = path.extname(entry.name).toLowerCase();
            const langMap = {
              '.js': 'javascript',
              '.ts': 'typescript',
              '.jsx': 'javascript',
              '.tsx': 'typescript',
              '.py': 'python'
            };
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
  detectLanguages(files) {
    const langMap = {
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

    const languages = new Set();
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (langMap[ext]) {
        languages.add(langMap[ext]);
      }
    }

    return Array.from(languages);
  }
}

/**
 * Custom error class for repository scanning errors
 */
export class RepositoryScanError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'RepositoryScanError';
  }
}

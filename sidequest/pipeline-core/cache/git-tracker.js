/**
 * Git Commit Tracker
 *
 * Tracks Git commit hashes to detect repository changes.
 * Used by caching layer to determine if scans need to be refreshed.
 */

// @ts-nocheck
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { createComponentLogger } from '../../utils/logger.ts';

// @ts-ignore - Promisified exec has correct signature
const execPromise = promisify(exec);
const logger = createComponentLogger('GitCommitTracker');

export class GitCommitTracker {
  /**
   * Get the current HEAD commit hash for a repository
   * @param {string} repoPath - Path to repository
   * @returns {Promise<string|null>} - Commit hash or null if not a git repo
   */
  async getRepositoryCommit(repoPath) {
    try {
      const { stdout } = await execPromise('git rev-parse HEAD', {
        cwd: repoPath
      });

      const commitHash = stdout.trim();
      logger.info({ repoPath, commitHash }, 'Retrieved repository commit hash');

      return commitHash;
    } catch (error) {
      logger.warn({ repoPath, error: error.message }, 'Not a git repository or git not available');
      return null;
    }
  }

  /**
   * Get short commit hash (first 7 characters)
   * @param {string} repoPath - Path to repository
   * @returns {Promise<string|null>} - Short commit hash
   */
  async getShortCommit(repoPath) {
    try {
      const { stdout } = await execPromise('git rev-parse --short HEAD', {
        cwd: repoPath
      });

      const shortHash = stdout.trim();
      logger.debug({ repoPath, shortHash }, 'Retrieved short commit hash');

      return shortHash;
    } catch (error) {
      logger.warn({ repoPath, error: error.message }, 'Failed to get short commit hash');
      return null;
    }
  }

  /**
   * Check if repository has changed since a given commit
   * @param {string} repoPath - Path to repository
   * @param {string} lastCommit - Last known commit hash
   * @returns {Promise<boolean>} - True if changed
   */
  async hasChanged(repoPath, lastCommit) {
    if (!lastCommit) {
      return true; // No previous commit, treat as changed
    }

    const currentCommit = await this.getRepositoryCommit(repoPath);

    if (!currentCommit) {
      logger.warn({ repoPath }, 'Cannot determine if repository changed (not a git repo)');
      return true; // Assume changed if not a git repo
    }

    const changed = currentCommit !== lastCommit;

    logger.info({
      repoPath,
      lastCommit: lastCommit.substring(0, 7),
      currentCommit: currentCommit.substring(0, 7),
      changed
    }, 'Checked repository for changes');

    return changed;
  }

  /**
   * Get list of files changed since a given commit
   * @param {string} repoPath - Path to repository
   * @param {string} fromCommit - Starting commit hash
   * @returns {Promise<string[]>} - Array of changed file paths
   */
  async getChangedFiles(repoPath, fromCommit) {
    try {
      const currentCommit = await this.getRepositoryCommit(repoPath);

      if (!currentCommit || !fromCommit) {
        logger.warn({ repoPath }, 'Cannot get changed files (missing commit hash)');
        return [];
      }

      // Get diff between commits
      const { stdout } = await execPromise(
        `git diff --name-only ${fromCommit} ${currentCommit}`,
        { cwd: repoPath }
      );

      const changedFiles = stdout
        .trim()
        .split('\n')
        .filter(file => file.length > 0);

      logger.info({
        repoPath,
        fromCommit: fromCommit.substring(0, 7),
        toCommit: currentCommit.substring(0, 7),
        filesChanged: changedFiles.length
      }, 'Retrieved changed files');

      return changedFiles;
    } catch (error) {
      logger.error({ repoPath, error }, 'Failed to get changed files');
      return [];
    }
  }

  /**
   * Get commit metadata (author, date, message)
   * @param {string} repoPath - Path to repository
   * @param {string} commitHash - Commit hash (defaults to HEAD)
   * @returns {Promise<Object|null>} - Commit metadata
   */
  async getCommitMetadata(repoPath, commitHash = 'HEAD') {
    try {
      const { stdout } = await execPromise(
        `git show -s --format='%H|%an|%ae|%at|%s' ${commitHash}`,
        { cwd: repoPath }
      );

      const [hash, author, email, timestamp, message] = stdout.trim().split('|');

      const metadata = {
        hash,
        shortHash: hash.substring(0, 7),
        author,
        email,
        date: new Date(parseInt(timestamp) * 1000).toISOString(),
        message
      };

      logger.debug({ repoPath, metadata }, 'Retrieved commit metadata');

      return metadata;
    } catch (error) {
      logger.error({ repoPath, commitHash, error }, 'Failed to get commit metadata');
      return null;
    }
  }

  /**
   * Get repository branch name
   * @param {string} repoPath - Path to repository
   * @returns {Promise<string|null>} - Branch name
   */
  async getBranchName(repoPath) {
    try {
      const { stdout } = await execPromise('git rev-parse --abbrev-ref HEAD', {
        cwd: repoPath
      });

      const branchName = stdout.trim();
      logger.debug({ repoPath, branchName }, 'Retrieved branch name');

      return branchName;
    } catch (error) {
      logger.warn({ repoPath, error: error.message }, 'Failed to get branch name');
      return null;
    }
  }

  /**
   * Check if repository has uncommitted changes
   * @param {string} repoPath - Path to repository
   * @returns {Promise<boolean>} - True if has uncommitted changes
   */
  async hasUncommittedChanges(repoPath) {
    try {
      const { stdout } = await execPromise('git status --porcelain', {
        cwd: repoPath
      });

      const hasChanges = stdout.trim().length > 0;

      logger.info({
        repoPath,
        hasUncommittedChanges: hasChanges
      }, 'Checked for uncommitted changes');

      return hasChanges;
    } catch (error) {
      logger.warn({ repoPath, error: error.message }, 'Failed to check for uncommitted changes');
      return false;
    }
  }

  /**
   * Get repository remote URL
   * @param {string} repoPath - Path to repository
   * @param {string} remoteName - Remote name (default: origin)
   * @returns {Promise<string|null>} - Remote URL
   */
  async getRemoteUrl(repoPath, remoteName = 'origin') {
    try {
      const { stdout } = await execPromise(`git remote get-url ${remoteName}`, {
        cwd: repoPath
      });

      const remoteUrl = stdout.trim();
      logger.debug({ repoPath, remoteName, remoteUrl }, 'Retrieved remote URL');

      return remoteUrl;
    } catch (error) {
      logger.warn({ repoPath, remoteName, error: error.message }, 'Failed to get remote URL');
      return null;
    }
  }

  /**
   * Get total number of commits in repository
   * @param {string} repoPath - Path to repository
   * @returns {Promise<number>} - Number of commits
   */
  async getCommitCount(repoPath) {
    try {
      const { stdout } = await execPromise('git rev-list --count HEAD', {
        cwd: repoPath
      });

      const count = parseInt(stdout.trim());
      logger.debug({ repoPath, commitCount: count }, 'Retrieved commit count');

      return count;
    } catch (error) {
      logger.warn({ repoPath, error: error.message }, 'Failed to get commit count');
      return 0;
    }
  }

  /**
   * Check if path is a git repository
   * @param {string} repoPath - Path to check
   * @returns {Promise<boolean>} - True if is a git repository
   */
  async isGitRepository(repoPath) {
    try {
      const gitDir = path.join(repoPath, '.git');
      const stats = await fs.stat(gitDir);
      const isGit = stats.isDirectory();

      logger.debug({ repoPath, isGitRepository: isGit }, 'Checked if path is git repository');

      return isGit;
    } catch (error) {
      logger.debug({ repoPath }, 'Path is not a git repository');
      return false;
    }
  }

  /**
   * Get repository status summary
   * @param {string} repoPath - Path to repository
   * @returns {Promise<Object>} - Repository status
   */
  async getRepositoryStatus(repoPath) {
    const [
      isGit,
      currentCommit,
      branchName,
      hasUncommitted,
      remoteUrl
    ] = await Promise.all([
      this.isGitRepository(repoPath),
      this.getRepositoryCommit(repoPath),
      this.getBranchName(repoPath),
      this.hasUncommittedChanges(repoPath),
      this.getRemoteUrl(repoPath)
    ]);

    const status = {
      is_git_repository: isGit,
      current_commit: currentCommit,
      short_commit: currentCommit ? currentCommit.substring(0, 7) : null,
      branch: branchName,
      has_uncommitted_changes: hasUncommitted,
      remote_url: remoteUrl,
      scanned_at: new Date().toISOString()
    };

    logger.info({ repoPath, status }, 'Retrieved repository status');

    return status;
  }

  /**
   * Get commit history for a repository
   * @param {string} repoPath - Path to repository
   * @param {number} limit - Number of commits to retrieve
   * @returns {Promise<Array>} - Array of commit objects
   */
  async getCommitHistory(repoPath, limit = 10) {
    try {
      const { stdout } = await execPromise(
        `git log -${limit} --format='%H|%an|%ae|%at|%s'`,
        { cwd: repoPath }
      );

      const commits = stdout
        .trim()
        .split('\n')
        .map(line => {
          const [hash, author, email, timestamp, message] = line.split('|');
          return {
            hash,
            shortHash: hash.substring(0, 7),
            author,
            email,
            date: new Date(parseInt(timestamp) * 1000).toISOString(),
            message
          };
        });

      logger.info({
        repoPath,
        commitsRetrieved: commits.length
      }, 'Retrieved commit history');

      return commits;
    } catch (error) {
      logger.error({ repoPath, error }, 'Failed to get commit history');
      return [];
    }
  }
}

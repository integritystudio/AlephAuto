/**
 * Git Commit Tracker
 *
 * Tracks Git commit hashes to detect repository changes.
 * Used by caching layer to determine if scans need to be refreshed.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { createComponentLogger } from '../../utils/logger.ts';

const execPromise = promisify(exec);
const logger = createComponentLogger('GitCommitTracker');

export interface CommitMetadata {
  hash: string;
  shortHash: string;
  author: string;
  email: string;
  date: string;
  message: string;
}

export interface RepositoryStatus {
  is_git_repository: boolean;
  current_commit: string | null;
  short_commit: string | null;
  branch: string | null;
  has_uncommitted_changes: boolean;
  remote_url: string | null;
  scanned_at: string;
}

export class GitCommitTracker {
    /**
   * Get the repository commit.
   *
   * @param {string} repoPath - The repoPath
   *
   * @returns {Promise<string | null>} The repository commit
   * @async
   */
  async getRepositoryCommit(repoPath: string): Promise<string | null> {
    try {
      const { stdout } = await execPromise('git rev-parse HEAD', {
        cwd: repoPath
      });

      const commitHash = stdout.trim();
      logger.info({ repoPath, commitHash }, 'Retrieved repository commit hash');

      return commitHash;
    } catch (error) {
      logger.warn({ repoPath, error: (error as Error).message }, 'Not a git repository or git not available');
      return null;
    }
  }

    /**
   * Get the short commit.
   *
   * @param {string} repoPath - The repoPath
   *
   * @returns {Promise<string | null>} The short commit
   * @async
   */
  async getShortCommit(repoPath: string): Promise<string | null> {
    try {
      const { stdout } = await execPromise('git rev-parse --short HEAD', {
        cwd: repoPath
      });

      const shortHash = stdout.trim();
      logger.debug({ repoPath, shortHash }, 'Retrieved short commit hash');

      return shortHash;
    } catch (error) {
      logger.warn({ repoPath, error: (error as Error).message }, 'Failed to get short commit hash');
      return null;
    }
  }

    /**
   * Check if has changed.
   *
   * @param {string} repoPath - The repoPath
   * @param {string | null} lastCommit - The lastCommit
   *
   * @returns {Promise<boolean>} True if changed, False otherwise
   * @async
   */
  async hasChanged(repoPath: string, lastCommit: string | null): Promise<boolean> {
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
   * Get the changed files.
   *
   * @param {string} repoPath - The repoPath
   * @param {string | null} fromCommit - The fromCommit
   *
   * @returns {Promise<string[]>} The changed files
   * @async
   */
  async getChangedFiles(repoPath: string, fromCommit: string | null): Promise<string[]> {
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
   * Get the commit metadata.
   *
   * @param {string} repoPath - The repoPath
   * @param {*} [commitHash='HEAD'] - The commitHash
   *
   * @returns {Promise<CommitMetadata | null>} The commit metadata
   * @async
   */
  async getCommitMetadata(repoPath: string, commitHash = 'HEAD'): Promise<CommitMetadata | null> {
    try {
      const { stdout } = await execPromise(
        `git show -s --format='%H|%an|%ae|%at|%s' ${commitHash}`,
        { cwd: repoPath }
      );

      const [hash, author, email, timestamp, message] = stdout.trim().split('|');

      const metadata: CommitMetadata = {
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
   * Get the branch name.
   *
   * @param {string} repoPath - The repoPath
   *
   * @returns {Promise<string | null>} The branch name
   * @async
   */
  async getBranchName(repoPath: string): Promise<string | null> {
    try {
      const { stdout } = await execPromise('git rev-parse --abbrev-ref HEAD', {
        cwd: repoPath
      });

      const branchName = stdout.trim();
      logger.debug({ repoPath, branchName }, 'Retrieved branch name');

      return branchName;
    } catch (error) {
      logger.warn({ repoPath, error: (error as Error).message }, 'Failed to get branch name');
      return null;
    }
  }

    /**
   * Check if has uncommitted changes.
   *
   * @param {string} repoPath - The repoPath
   *
   * @returns {Promise<boolean>} True if uncommitted changes, False otherwise
   * @async
   */
  async hasUncommittedChanges(repoPath: string): Promise<boolean> {
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
      logger.warn({ repoPath, error: (error as Error).message }, 'Failed to check for uncommitted changes');
      return false;
    }
  }

    /**
   * Get the remote url.
   *
   * @param {string} repoPath - The repoPath
   * @param {*} [remoteName='origin'] - The remoteName
   *
   * @returns {Promise<string | null>} The remote url
   * @async
   */
  async getRemoteUrl(repoPath: string, remoteName = 'origin'): Promise<string | null> {
    try {
      const { stdout } = await execPromise(`git remote get-url ${remoteName}`, {
        cwd: repoPath
      });

      const remoteUrl = stdout.trim();
      logger.debug({ repoPath, remoteName, remoteUrl }, 'Retrieved remote URL');

      return remoteUrl;
    } catch (error) {
      logger.warn({ repoPath, remoteName, error: (error as Error).message }, 'Failed to get remote URL');
      return null;
    }
  }

    /**
   * Get the commit count.
   *
   * @param {string} repoPath - The repoPath
   *
   * @returns {Promise<number>} The commit count
   * @async
   */
  async getCommitCount(repoPath: string): Promise<number> {
    try {
      const { stdout } = await execPromise('git rev-list --count HEAD', {
        cwd: repoPath
      });

      const count = parseInt(stdout.trim());
      logger.debug({ repoPath, commitCount: count }, 'Retrieved commit count');

      return count;
    } catch (error) {
      logger.warn({ repoPath, error: (error as Error).message }, 'Failed to get commit count');
      return 0;
    }
  }

    /**
   * Check if git repository.
   *
   * @param {string} repoPath - The repoPath
   *
   * @returns {Promise<boolean>} True if git repository, False otherwise
   * @async
   */
  async isGitRepository(repoPath: string): Promise<boolean> {
    try {
      const gitDir = path.join(repoPath, '.git');
      const stats = await fs.stat(gitDir);
      const isGit = stats.isDirectory();

      logger.debug({ repoPath, isGitRepository: isGit }, 'Checked if path is git repository');

      return isGit;
    } catch {
      logger.debug({ repoPath }, 'Path is not a git repository');
      return false;
    }
  }

    /**
   * Get the repository status.
   *
   * @param {string} repoPath - The repoPath
   *
   * @returns {Promise<RepositoryStatus>} The repository status
   * @async
   */
  async getRepositoryStatus(repoPath: string): Promise<RepositoryStatus> {
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

    const status: RepositoryStatus = {
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
   * Get the commit history.
   *
   * @param {string} repoPath - The repoPath
   * @param {*} [limit=10] - The limit
   *
   * @returns {Promise<CommitMetadata[]>} The commit history
   * @async
   */
  async getCommitHistory(repoPath: string, limit = 10): Promise<CommitMetadata[]> {
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

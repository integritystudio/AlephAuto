/**
 * Branch Manager - Generic Git branch and PR management for AlephAuto jobs
 *
 * Provides branch creation, change detection, commit, push, and PR creation
 * for any AlephAuto worker that modifies code.
 *
 * Features:
 * - Create feature branches with job context
 * - Detect git changes automatically
 * - Commit with descriptive messages
 * - Push branches to remote
 * - Create PRs with job details
 * - Clean up on errors
 * - Sentry error tracking
 */

// @ts-check
/** @typedef {import('../errors/error-types').ProcessError} ProcessError */

import { runCommand } from '@shared/process-io';
import { createComponentLogger, logError } from '../../utils/logger.ts';
import * as Sentry from '@sentry/node';

const logger = createComponentLogger('BranchManager');

/**
 * Branch Manager for Git operations
 */
export class BranchManager {
  /**
   * @param {Object} options - Configuration options
   * @param {string} [options.baseBranch='main'] - Base branch for PRs
   * @param {string} [options.branchPrefix='automated'] - Prefix for branch names
   * @param {boolean} [options.dryRun=false] - Skip push and PR creation
   */
  constructor(options = {}) {
    this.baseBranch = options.baseBranch || 'main';
    this.branchPrefix = options.branchPrefix || 'automated';
    this.dryRun = options.dryRun ?? false;
  }

  /**
   * Check if repository has uncommitted changes
   *
   * @param {string} repositoryPath - Path to repository
   * @returns {Promise<boolean>} True if changes exist
   */
  async hasChanges(repositoryPath) {
    try {
      const status = await this._runGitCommand(repositoryPath, ['status', '--porcelain']);
      return status.trim().length > 0;
    } catch (error) {
      logger.warn({ error, repositoryPath }, 'Failed to check git status');
      return false;
    }
  }

  /**
   * Get list of changed files
   *
   * @param {string} repositoryPath - Path to repository
   * @returns {Promise<string[]>} List of changed file paths
   */
  async getChangedFiles(repositoryPath) {
    try {
      const status = await this._runGitCommand(repositoryPath, ['status', '--porcelain']);

      // Parse git status output
      // Format: XY filename
      // X = index status, Y = working tree status
      const files = status
        .split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => {
          // Remove status characters and trim
          return line.substring(3).trim();
        });

      return files;
    } catch (error) {
      logger.warn({ error, repositoryPath }, 'Failed to get changed files');
      return [];
    }
  }

  /**
   * Get current branch name
   *
   * @param {string} repositoryPath - Path to repository
   * @returns {Promise<string>} Current branch name
   */
  async getCurrentBranch(repositoryPath) {
    try {
      const branch = await this._runGitCommand(repositoryPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
      return branch.trim();
    } catch (error) {
      logger.warn({ error, repositoryPath }, 'Failed to get current branch');
      return '';
    }
  }

  /**
   * Check if repository is a git repository
   *
   * @param {string} repositoryPath - Path to check
   * @returns {Promise<boolean>} True if git repository
   */
  async isGitRepository(repositoryPath) {
    try {
      await this._runGitCommand(repositoryPath, ['rev-parse', '--git-dir']);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Create and checkout a new branch for job changes
   *
   * @param {string} repositoryPath - Path to repository
   * @param {Object} jobContext - Job context for branch naming
   * @param {string} jobContext.jobId - Job ID
   * @param {string} jobContext.jobType - Type of job (duplicate-detection, schema-enhancement, etc.)
   * @param {string} [jobContext.description] - Optional description for branch name
   * @returns {Promise<{branchName: string, originalBranch: string}>} Branch info
   */
  async createJobBranch(repositoryPath, jobContext) {
    const span = Sentry.startInactiveSpan({
      op: 'git.create_branch',
      name: 'Create Job Branch',
    });

    try {
      // Check if it's a git repository
      const isGitRepo = await this.isGitRepository(repositoryPath);
      if (!isGitRepo) {
        logger.info({ repositoryPath }, 'Not a git repository, skipping branch creation');
        return { branchName: '', originalBranch: '' };
      }

      // Get current branch
      const originalBranch = await this.getCurrentBranch(repositoryPath);

      logger.info({
        repositoryPath,
        originalBranch,
        jobId: jobContext.jobId
      }, 'Creating job branch');

      // Ensure we're on base branch
      await this._runGitCommand(repositoryPath, ['checkout', this.baseBranch]);

      // Pull latest changes (skip in dry-run)
      if (!this.dryRun) {
        try {
          await this._runGitCommand(repositoryPath, ['pull', 'origin', this.baseBranch]);
        } catch (error) {
          // Non-critical if pull fails (might be local-only repo)
          logger.warn({ error }, 'Failed to pull latest changes, continuing anyway');
        }
      }

      // Generate branch name
      const branchName = this._generateBranchName(jobContext);

      // Create and checkout new branch
      await this._runGitCommand(repositoryPath, ['checkout', '-b', branchName]);

      logger.info({ branchName, repositoryPath }, 'Branch created and checked out');

      span?.setStatus('ok');
      return { branchName, originalBranch };

    } catch (error) {
      span?.setStatus('internal_error');
      logError(logger, error, 'Failed to create job branch', { repositoryPath, jobContext });

      Sentry.captureException(error, {
        tags: {
          component: 'branch-manager',
          operation: 'create_branch',
          jobType: jobContext.jobType
        },
        extra: {
          repositoryPath,
          jobContext
        }
      });

      throw error;
    } finally {
      if (span) span.end();
    }
  }

  /**
   * Commit changes with job context
   *
   * @param {string} repositoryPath - Path to repository
   * @param {Object} commitContext - Commit context
   * @param {string} commitContext.message - Commit message
   * @param {string} commitContext.jobId - Job ID
   * @param {string} [commitContext.description] - Optional detailed description
   * @returns {Promise<string>} Commit SHA
   */
  async commitChanges(repositoryPath, commitContext) {
    const span = Sentry.startInactiveSpan({
      op: 'git.commit',
      name: 'Commit Changes',
    });

    try {
      logger.info({ repositoryPath, jobId: commitContext.jobId }, 'Committing changes');

      // Check if there are changes
      const hasChanges = await this.hasChanges(repositoryPath);
      if (!hasChanges) {
        logger.info({ repositoryPath }, 'No changes to commit');
        span?.setStatus('ok');
        return '';
      }

      // Get changed files for logging
      const changedFiles = await this.getChangedFiles(repositoryPath);
      logger.info({ changedFiles, count: changedFiles.length }, 'Files changed');

      // Stage all changes
      await this._runGitCommand(repositoryPath, ['add', '.']);

      // Create commit message
      const commitMessage = this._generateCommitMessage(commitContext, changedFiles);

      // Commit
      await this._runGitCommand(repositoryPath, ['commit', '-m', commitMessage]);

      // Get commit SHA
      const commitSha = await this._runGitCommand(repositoryPath, ['rev-parse', 'HEAD']);

      logger.info({ commitSha: commitSha.trim(), filesCount: changedFiles.length }, 'Changes committed');

      span?.setStatus('ok');
      return commitSha.trim();

    } catch (error) {
      span?.setStatus('internal_error');
      logError(logger, error, 'Failed to commit changes', { repositoryPath, commitContext });

      Sentry.captureException(error, {
        tags: {
          component: 'branch-manager',
          operation: 'commit',
          jobId: commitContext.jobId
        },
        extra: {
          repositoryPath,
          commitContext
        }
      });

      throw error;
    } finally {
      if (span) span.end();
    }
  }

  /**
   * Push branch to remote
   *
   * @param {string} repositoryPath - Path to repository
   * @param {string} branchName - Branch name to push
   * @returns {Promise<boolean>} True if pushed successfully
   */
  async pushBranch(repositoryPath, branchName) {
    const span = Sentry.startInactiveSpan({
      op: 'git.push',
      name: 'Push Branch',
    });

    try {
      if (this.dryRun) {
        logger.info({ branchName }, 'Dry run: Skipping branch push');
        span?.setStatus('ok');
        return false;
      }

      logger.info({ repositoryPath, branchName }, 'Pushing branch to remote');

      await this._runGitCommand(repositoryPath, ['push', '-u', 'origin', branchName]);

      logger.info({ branchName }, 'Branch pushed successfully');

      span?.setStatus('ok');
      return true;

    } catch (error) {
      span?.setStatus('internal_error');
      logError(logger, error, 'Failed to push branch', { repositoryPath, branchName });

      Sentry.captureException(error, {
        tags: {
          component: 'branch-manager',
          operation: 'push'
        },
        extra: {
          repositoryPath,
          branchName
        }
      });

      // Don't throw - PR creation can still fail gracefully
      return false;
    } finally {
      if (span) span.end();
    }
  }

  /**
   * Create pull request using gh CLI
   *
   * @param {string} repositoryPath - Path to repository
   * @param {Object} prContext - PR context
   * @param {string} prContext.branchName - Branch name
   * @param {string} prContext.title - PR title
   * @param {string} prContext.body - PR description
   * @param {string[]} [prContext.labels] - Optional labels to add
   * @returns {Promise<string|null>} PR URL or null if failed
   */
  async createPullRequest(repositoryPath, prContext) {
    const span = Sentry.startInactiveSpan({
      op: 'git.create_pr',
      name: 'Create Pull Request',
    });

    try {
      if (this.dryRun) {
        logger.info({ branch: prContext.branchName }, 'Dry run: Skipping PR creation');
        span?.setStatus('ok');
        return `dry-run-${prContext.branchName}`;
      }

      logger.info({
        repositoryPath,
        branchName: prContext.branchName,
        title: prContext.title
      }, 'Creating pull request');

      // Build gh pr create command
      const args = [
        'pr',
        'create',
        '--title', prContext.title,
        '--body', prContext.body,
        '--base', this.baseBranch,
        '--head', prContext.branchName
      ];

      // Add labels if provided
      if (prContext.labels && prContext.labels.length > 0) {
        args.push('--label', prContext.labels.join(','));
      }

      const prUrl = await this._runCommand(repositoryPath, 'gh', args);

      logger.info({ prUrl: prUrl.trim() }, 'Pull request created');

      span?.setStatus('ok');
      return prUrl.trim();

    } catch (error) {
      span?.setStatus('internal_error');
      logError(logger, error, 'Failed to create pull request', { repositoryPath, prContext });

      Sentry.captureException(error, {
        tags: {
          component: 'branch-manager',
          operation: 'create_pr'
        },
        extra: {
          repositoryPath,
          prContext
        }
      });

      return null;
    } finally {
      if (span) span.end();
    }
  }

  /**
   * Clean up branch (checkout original and delete job branch)
   *
   * @param {string} repositoryPath - Path to repository
   * @param {string} branchName - Branch to delete
   * @param {string} originalBranch - Original branch to checkout
   * @returns {Promise<void>}
   */
  async cleanupBranch(repositoryPath, branchName, originalBranch) {
    try {
      logger.info({ repositoryPath, branchName, originalBranch }, 'Cleaning up branch');

      // Checkout original branch (or base branch if original not available)
      const targetBranch = originalBranch || this.baseBranch;
      await this._runGitCommand(repositoryPath, ['checkout', targetBranch]);

      // Delete job branch
      await this._runGitCommand(repositoryPath, ['branch', '-D', branchName]);

      logger.info({ branchName }, 'Branch cleaned up');

    } catch (error) {
      logger.warn({ error, branchName }, 'Failed to cleanup branch (non-critical)');
      // Don't throw - cleanup is best-effort
    }
  }

  /**
   * Generate branch name from job context
   *
   * @param {Object} jobContext - Job context
   * @returns {string} Branch name
   * @private
   */
  _generateBranchName(jobContext) {
    const timestamp = Date.now();
    const jobType = jobContext.jobType || 'job';
    const description = jobContext.description
      ? `-${jobContext.description.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 30)}`
      : '';

    return `${this.branchPrefix}/${jobType}${description}-${timestamp}`;
  }

  /**
   * Generate commit message from context
   *
   * @param {Object} commitContext - Commit context
   * @param {string[]} changedFiles - Changed files
   * @returns {string} Commit message
   * @private
   */
  _generateCommitMessage(commitContext, changedFiles) {
    const lines = [
      commitContext.message,
      '',
    ];

    if (commitContext.description) {
      lines.push(commitContext.description, '');
    }

    lines.push(
      `Job ID: ${commitContext.jobId}`,
      `Files changed: ${changedFiles.length}`,
      '',
      '🤖 Generated with [Claude Code](https://claude.com/claude-code)',
      '',
      'Co-Authored-By: Claude <noreply@anthropic.com>'
    );

    return lines.join('\n');
  }

  /**
   * Run a Git command
   *
   * @param {string} cwd - Working directory
   * @param {string[]} args - Git arguments
   * @returns {Promise<string>} Command output
   * @private
   */
  async _runGitCommand(cwd, args) {
    return this._runCommand(cwd, 'git', args);
  }

  /**
   * Run a shell command
   *
   * @param {string} cwd - Working directory
   * @param {string} command - Command to run
   * @param {string[]} args - Command arguments
   * @returns {Promise<string>} Command output
   * @private
   */
  async _runCommand(cwd, command, args) {
    return runCommand(cwd, command, args);
  }
}

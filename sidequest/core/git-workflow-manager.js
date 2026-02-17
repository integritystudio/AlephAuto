/**
 * Git Workflow Manager
 *
 * Encapsulates git operations for automated job workflows:
 * - Branch creation and cleanup
 * - Committing changes
 * - Pushing branches
 * - Creating pull requests
 *
 * @module sidequest/core/git-workflow-manager
 */

import { BranchManager } from '../pipeline-core/git/branch-manager.js';
import { createComponentLogger, logError, logWarn } from '../utils/logger.ts';
import * as Sentry from '@sentry/node';

const logger = createComponentLogger('GitWorkflowManager');

/**
 * GitWorkflowManager - manages git operations for automated workflows
 */
export class GitWorkflowManager {
  /**
   * @param {Object} options - Configuration options
   * @param {string} [options.baseBranch='main'] - Base branch for PRs
   * @param {string} [options.branchPrefix='automated'] - Prefix for branch names
   * @param {boolean} [options.dryRun=false] - If true, skip actual git operations
   */
  constructor(options = {}) {
    this.baseBranch = options.baseBranch || 'main';
    this.branchPrefix = options.branchPrefix || 'automated';
    this.dryRun = options.dryRun ?? false;

    this.branchManager = new BranchManager({
      baseBranch: this.baseBranch,
      branchPrefix: this.branchPrefix,
      dryRun: this.dryRun
    });

    logger.info({
      baseBranch: this.baseBranch,
      branchPrefix: this.branchPrefix,
      dryRun: this.dryRun
    }, 'GitWorkflowManager initialized');
  }

  /**
   * Create a branch for a job
   *
   * @param {string} repositoryPath - Path to the repository
   * @param {Object} jobInfo - Job information for branch naming
   * @param {string} jobInfo.jobId - Job ID
   * @param {string} jobInfo.jobType - Job type
   * @param {string} [jobInfo.description] - Optional description
   * @returns {Promise<{branchName: string, originalBranch: string}|null>}
   */
  async createJobBranch(repositoryPath, jobInfo) {
    try {
      const branchInfo = await this.branchManager.createJobBranch(
        repositoryPath,
        jobInfo
      );

      if (branchInfo.branchName) {
        logger.info({
          jobId: jobInfo.jobId,
          branchName: branchInfo.branchName,
          repositoryPath
        }, 'Created job branch');

        Sentry.addBreadcrumb({
          category: 'git',
          message: `Created branch ${branchInfo.branchName}`,
          level: 'info',
        });
      }

      return branchInfo;
    } catch (error) {
      logWarn(logger, error, 'Failed to create branch', { jobId: jobInfo.jobId });
      return null;
    }
  }

  /**
   * Check if repository has uncommitted changes
   *
   * @param {string} repositoryPath - Path to the repository
   * @returns {Promise<boolean>}
   */
  async hasChanges(repositoryPath) {
    return this.branchManager.hasChanges(repositoryPath);
  }

  /**
   * Get list of changed files
   *
   * @param {string} repositoryPath - Path to the repository
   * @returns {Promise<string[]>}
   */
  async getChangedFiles(repositoryPath) {
    return this.branchManager.getChangedFiles(repositoryPath);
  }

  /**
   * Commit changes to the repository
   *
   * @param {string} repositoryPath - Path to the repository
   * @param {Object} commitContext - Commit information
   * @param {string} commitContext.message - Commit message title
   * @param {string} [commitContext.description] - Commit message body
   * @param {string} [commitContext.jobId] - Job ID for logging
   * @returns {Promise<string|null>} Commit SHA or null on failure
   */
  async commitChanges(repositoryPath, commitContext) {
    try {
      const normalizedContext = {
        message: commitContext.message,
        jobId: commitContext.jobId || 'unknown',
        description: commitContext.description
      };
      const commitSha = await this.branchManager.commitChanges(
        repositoryPath,
        normalizedContext
      );

      logger.info({
        jobId: commitContext.jobId,
        commitSha
      }, 'Changes committed');

      return commitSha;
    } catch (error) {
      logError(logger, error, 'Failed to commit changes', { jobId: commitContext.jobId });
      throw error;
    }
  }

  /**
   * Push branch to remote
   *
   * @param {string} repositoryPath - Path to the repository
   * @param {string} branchName - Branch to push
   * @returns {Promise<boolean>} True if push succeeded
   */
  async pushBranch(repositoryPath, branchName) {
    try {
      const pushed = await this.branchManager.pushBranch(repositoryPath, branchName);

      if (pushed) {
        logger.info({ branchName }, 'Branch pushed to remote');
      } else {
        logWarn(logger, null, 'Failed to push branch', { branchName });
      }

      return pushed;
    } catch (error) {
      logError(logger, error, 'Error pushing branch', { branchName });
      return false;
    }
  }

  /**
   * Create a pull request
   *
   * @param {string} repositoryPath - Path to the repository
   * @param {Object} prContext - PR information
   * @param {string} prContext.branchName - Source branch
   * @param {string} prContext.title - PR title
   * @param {string} prContext.body - PR body
   * @param {string[]} [prContext.labels] - PR labels
   * @returns {Promise<string|null>} PR URL or null on failure
   */
  async createPullRequest(repositoryPath, prContext) {
    try {
      const prUrl = await this.branchManager.createPullRequest(repositoryPath, prContext);

      if (prUrl) {
        logger.info({ prUrl }, 'Pull request created');

        Sentry.addBreadcrumb({
          category: 'git',
          message: `Created PR: ${prUrl}`,
          level: 'info',
        });
      }

      return prUrl;
    } catch (error) {
      logError(logger, error, 'Failed to create pull request');
      return null;
    }
  }

  /**
   * Cleanup a branch (switch back to original and delete)
   *
   * @param {string} repositoryPath - Path to the repository
   * @param {string} branchName - Branch to cleanup
   * @param {string} originalBranch - Branch to switch back to
   * @returns {Promise<void>}
   */
  async cleanupBranch(repositoryPath, branchName, originalBranch) {
    try {
      await this.branchManager.cleanupBranch(repositoryPath, branchName, originalBranch);
      logger.info({ branchName }, 'Branch cleaned up');
    } catch (error) {
      logWarn(logger, error, 'Failed to cleanup branch', { branchName });
    }
  }

  /**
   * Execute the full git workflow after a successful job
   *
   * @param {string} repositoryPath - Path to the repository
   * @param {Object} gitInfo - Git state from job
   * @param {string} gitInfo.branchName - Current branch
   * @param {string} gitInfo.originalBranch - Original branch
   * @param {Object} messageGenerator - Object with methods to generate commit/PR messages
   * @param {Function} messageGenerator.generateCommitMessage - Returns {title, body}
   * @param {Function} messageGenerator.generatePRContext - Returns {branchName, title, body, labels}
   * @returns {Promise<{commitSha?: string, prUrl?: string, changedFiles?: string[]}>}
   */
  async executeWorkflow(repositoryPath, gitInfo, messageGenerator) {
    const result = {
      changedFiles: [],
      commitSha: null,
      prUrl: null
    };

    // Check for changes
    const hasChanges = await this.hasChanges(repositoryPath);

    if (!hasChanges) {
      logger.info('No changes to commit, cleaning up branch');
      await this.cleanupBranch(repositoryPath, gitInfo.branchName, gitInfo.originalBranch);
      return result;
    }

    // Get changed files
    result.changedFiles = await this.getChangedFiles(repositoryPath);

    logger.info({ filesChanged: result.changedFiles.length }, 'Changes detected, committing');

    // Generate commit message
    const commitMessage = await messageGenerator.generateCommitMessage();
    const commitContext = {
      message: commitMessage.title,
      description: commitMessage.body
    };

    // Commit changes
    result.commitSha = await this.commitChanges(repositoryPath, commitContext);

    // Push branch
    const pushed = await this.pushBranch(repositoryPath, gitInfo.branchName);

    if (!pushed) {
      logger.warn('Failed to push branch, skipping PR creation');
      return result;
    }

    // Generate and create PR
    const prContext = await messageGenerator.generatePRContext();
    result.prUrl = await this.createPullRequest(repositoryPath, prContext);

    return result;
  }
}

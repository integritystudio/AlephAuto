/**
 * Git Workflow Manager
 *
 * Encapsulates git operations for automated job workflows:
 * - Branch creation and cleanup
 * - Committing changes
 * - Pushing branches
 * - Creating pull requests
 */

import { BranchManager } from '../pipeline-core/git/branch-manager.ts';
import type { BranchManagerOptions, JobBranchContext, BranchResult, PRContext } from '../pipeline-core/git/branch-manager.ts';
import { createComponentLogger, logError, logWarn } from '../utils/logger.ts';
import * as Sentry from '@sentry/node';

const logger = createComponentLogger('GitWorkflowManager');

export interface CommitMessage {
  title: string;
  body: string;
}

export interface MessageGenerator {
  generateCommitMessage(): Promise<CommitMessage>;
  generatePRContext(): Promise<PRContext>;
}

export interface GitInfo {
  branchName: string;
  originalBranch: string;
}

export interface CommitContext {
  message: string;
  description?: string;
  jobId?: string;
}

export interface WorkflowResult {
  changedFiles: string[];
  commitSha: string | null;
  prUrl: string | null;
}

/**
 * GitWorkflowManager - manages git operations for automated workflows
 */
export class GitWorkflowManager {
  baseBranch: string;
  branchPrefix: string;
  dryRun: boolean;
  branchManager: BranchManager;

  constructor(options: BranchManagerOptions = {}) {
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

  async createJobBranch(repositoryPath: string, jobInfo: JobBranchContext): Promise<BranchResult | null> {
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
      logWarn(logger, error as Error, 'Failed to create branch', { jobId: jobInfo.jobId });
      return null;
    }
  }

  async hasChanges(repositoryPath: string): Promise<boolean> {
    return this.branchManager.hasChanges(repositoryPath);
  }

  async getChangedFiles(repositoryPath: string): Promise<string[]> {
    return this.branchManager.getChangedFiles(repositoryPath);
  }

  async commitChanges(repositoryPath: string, commitContext: CommitContext): Promise<string | null> {
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

  async pushBranch(repositoryPath: string, branchName: string): Promise<boolean> {
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

  async createPullRequest(repositoryPath: string, prContext: PRContext): Promise<string | null> {
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

  async cleanupBranch(repositoryPath: string, branchName: string, originalBranch: string): Promise<void> {
    try {
      await this.branchManager.cleanupBranch(repositoryPath, branchName, originalBranch);
      logger.info({ branchName }, 'Branch cleaned up');
    } catch (error) {
      logWarn(logger, error as Error, 'Failed to cleanup branch', { branchName });
    }
  }

  async executeWorkflow(repositoryPath: string, gitInfo: GitInfo, messageGenerator: MessageGenerator): Promise<WorkflowResult> {
    const result: WorkflowResult = {
      changedFiles: [],
      commitSha: null,
      prUrl: null
    };

    const hasChanges = await this.hasChanges(repositoryPath);

    if (!hasChanges) {
      logger.info('No changes to commit, cleaning up branch');
      await this.cleanupBranch(repositoryPath, gitInfo.branchName, gitInfo.originalBranch);
      return result;
    }

    result.changedFiles = await this.getChangedFiles(repositoryPath);

    logger.info({ filesChanged: result.changedFiles.length }, 'Changes detected, committing');

    const commitMessage = await messageGenerator.generateCommitMessage();
    const commitContext: CommitContext = {
      message: commitMessage.title,
      description: commitMessage.body
    };

    result.commitSha = await this.commitChanges(repositoryPath, commitContext);

    const pushed = await this.pushBranch(repositoryPath, gitInfo.branchName);

    if (!pushed) {
      logger.warn('Failed to push branch, skipping PR creation');
      return result;
    }

    const prContext = await messageGenerator.generatePRContext();
    result.prUrl = await this.createPullRequest(repositoryPath, prContext);

    return result;
  }
}

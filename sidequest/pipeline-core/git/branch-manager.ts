/**
 * Branch Manager - Generic Git branch and PR management for AlephAuto jobs
 *
 * Provides branch creation, change detection, commit, push, and PR creation
 * for any AlephAuto worker that modifies code.
 */

import { runCommand } from '@shared/process-io';
import { createComponentLogger, logError } from '../../utils/logger.ts';
import * as Sentry from '@sentry/node';

const logger = createComponentLogger('BranchManager');

export interface BranchManagerOptions {
  baseBranch?: string;
  branchPrefix?: string;
  dryRun?: boolean;
}

export interface JobBranchContext {
  jobId: string;
  jobType: string;
  description?: string;
}

export interface BranchResult {
  branchName: string;
  originalBranch: string;
}

export interface CommitContext {
  message: string;
  jobId: string;
  description?: string;
}

export interface PRContext {
  branchName: string;
  title: string;
  body: string;
  labels?: string[];
}

/**
 * Branch Manager for Git operations
 */
export class BranchManager {
  baseBranch: string;
  branchPrefix: string;
  dryRun: boolean;

  constructor(options: BranchManagerOptions = {}) {
    this.baseBranch = options.baseBranch || 'main';
    this.branchPrefix = options.branchPrefix || 'automated';
    this.dryRun = options.dryRun ?? false;
  }

  async hasChanges(repositoryPath: string): Promise<boolean> {
    try {
      const status = await this._runGitCommand(repositoryPath, ['status', '--porcelain']);
      return status.trim().length > 0;
    } catch (error) {
      logger.warn({ error, repositoryPath }, 'Failed to check git status');
      return false;
    }
  }

  async getChangedFiles(repositoryPath: string): Promise<string[]> {
    try {
      const status = await this._runGitCommand(repositoryPath, ['status', '--porcelain']);

      const files = status
        .split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => {
          const filePath = line.substring(3).trim();
          // Handle renames: "R  old -> new" → extract the new path
          const renameIdx = filePath.indexOf(' -> ');
          return renameIdx !== -1 ? filePath.substring(renameIdx + 4) : filePath;
        });

      return files;
    } catch (error) {
      logger.warn({ error, repositoryPath }, 'Failed to get changed files');
      return [];
    }
  }

  async getCurrentBranch(repositoryPath: string): Promise<string> {
    try {
      const branch = await this._runGitCommand(repositoryPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
      return branch.trim();
    } catch (error) {
      logger.warn({ error, repositoryPath }, 'Failed to get current branch');
      return '';
    }
  }

  async isGitRepository(repositoryPath: string): Promise<boolean> {
    try {
      await this._runGitCommand(repositoryPath, ['rev-parse', '--git-dir']);
      return true;
    } catch {
      return false;
    }
  }

  async createJobBranch(repositoryPath: string, jobContext: JobBranchContext): Promise<BranchResult> {
    const span = Sentry.startInactiveSpan({
      op: 'git.create_branch',
      name: 'Create Job Branch',
    });

    try {
      const isGitRepo = await this.isGitRepository(repositoryPath);
      if (!isGitRepo) {
        logger.info({ repositoryPath }, 'Not a git repository, skipping branch creation');
        return { branchName: '', originalBranch: '' };
      }

      const originalBranch = await this.getCurrentBranch(repositoryPath);

      logger.info({
        repositoryPath,
        originalBranch,
        jobId: jobContext.jobId
      }, 'Creating job branch');

      await this._runGitCommand(repositoryPath, ['checkout', this.baseBranch]);

      if (!this.dryRun) {
        try {
          await this._runGitCommand(repositoryPath, ['pull', 'origin', this.baseBranch]);
        } catch (error) {
          logger.warn({ error }, 'Failed to pull latest changes, continuing anyway');
        }
      }

      const branchName = this._generateBranchName(jobContext);
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

  async commitChanges(repositoryPath: string, commitContext: CommitContext): Promise<string> {
    const span = Sentry.startInactiveSpan({
      op: 'git.commit',
      name: 'Commit Changes',
    });

    try {
      logger.info({ repositoryPath, jobId: commitContext.jobId }, 'Committing changes');

      const hasChanges = await this.hasChanges(repositoryPath);
      if (!hasChanges) {
        logger.info({ repositoryPath }, 'No changes to commit');
        span?.setStatus('ok');
        return '';
      }

      const changedFiles = await this.getChangedFiles(repositoryPath);
      logger.info({ changedFiles, count: changedFiles.length }, 'Files changed');

      await this._runGitCommand(repositoryPath, ['add', '.']);

      const commitMessage = this._generateCommitMessage(commitContext, changedFiles);
      await this._runGitCommand(repositoryPath, ['commit', '-m', commitMessage]);

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

  async pushBranch(repositoryPath: string, branchName: string): Promise<boolean> {
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

      return false;
    } finally {
      if (span) span.end();
    }
  }

  async createPullRequest(repositoryPath: string, prContext: PRContext): Promise<string | null> {
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

      const args = [
        'pr',
        'create',
        '--title', prContext.title,
        '--body', prContext.body,
        '--base', this.baseBranch,
        '--head', prContext.branchName
      ];

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

  async cleanupBranch(repositoryPath: string, branchName: string, originalBranch: string): Promise<void> {
    try {
      logger.info({ repositoryPath, branchName, originalBranch }, 'Cleaning up branch');

      const targetBranch = originalBranch || this.baseBranch;
      await this._runGitCommand(repositoryPath, ['checkout', targetBranch]);

      await this._runGitCommand(repositoryPath, ['branch', '-D', branchName]);

      logger.info({ branchName }, 'Branch cleaned up');

    } catch (error) {
      logger.warn({ error, branchName }, 'Failed to cleanup branch (non-critical)');
    }
  }

  private _generateBranchName(jobContext: JobBranchContext): string {
    const timestamp = Date.now();
    const jobType = (jobContext.jobType || 'job').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const description = jobContext.description
      ? `-${jobContext.description.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 30)}`
      : '';

    return `${this.branchPrefix}/${jobType}${description}-${timestamp}`;
  }

  private _generateCommitMessage(commitContext: CommitContext, changedFiles: string[]): string {
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
      '\u{1F916} Generated with [Claude Code](https://claude.com/claude-code)',
      '',
      'Co-Authored-By: Claude <noreply@anthropic.com>'
    );

    return lines.join('\n');
  }

  private async _runGitCommand(cwd: string, args: string[]): Promise<string> {
    return this._runCommand(cwd, 'git', args);
  }

  private async _runCommand(cwd: string, command: string, args: string[]): Promise<string> {
    return runCommand(cwd, command, args);
  }
}

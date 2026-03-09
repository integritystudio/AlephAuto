/**
 * Migration Git Manager — handles git stash/unstash and rollback for migration transformations.
 */

import { runCommand } from '@shared/process-io';
import { createComponentLogger, logError } from '../../utils/logger.ts';
import * as Sentry from '@sentry/node';

const logger = createComponentLogger('MigrationGitManager');

export class MigrationGitManager {
  private readonly dryRun: boolean;
  constructor(dryRun: boolean) { this.dryRun = dryRun; }

  async stashChanges(repositoryPath: string): Promise<string | null> {
    if (this.dryRun) {
      logger.info({ repositoryPath }, 'Dry run: Would stash changes');
      return null;
    }

    try {
      const status = await runCommand(repositoryPath, 'git', ['status', '--porcelain']);
      if (!status.trim()) return null;

      await runCommand(repositoryPath, 'git', ['stash', 'push', '-u', '-m', 'migration-transformer-backup']);
      // Note: stash@{N} is positional — assumes exclusive git access while running.
      const stashRef = (await runCommand(repositoryPath, 'git', ['stash', 'list', '--format=%gd', '-n1'])).trim();
      logger.info({ repositoryPath, stashRef }, 'Stashed pre-existing changes');
      return stashRef || 'stash@{0}';
    } catch (error) {
      logger.warn({ error, repositoryPath }, 'Failed to stash changes, continuing without backup');
      return null;
    }
  }

  async unstashChanges(repositoryPath: string, stashRef: string, required = false): Promise<void> {
    try {
      await runCommand(repositoryPath, 'git', ['stash', 'pop', stashRef]);
      logger.info({ repositoryPath, stashRef }, 'Restored stashed changes');
    } catch (error) {
      if (required) {
        logError(logger, error, 'Failed to restore stashed changes — manual git stash pop needed', { repositoryPath, stashRef });
        throw error;
      }
      logger.warn({ error, repositoryPath, stashRef }, 'Failed to restore stashed changes (may need manual git stash pop)');
    }
  }

  async rollback(repositoryPath: string): Promise<void> {
    logger.info({ repositoryPath }, 'Rolling back transformations');

    if (this.dryRun) {
      logger.info('Dry run: Would rollback transformations');
      return;
    }

    try {
      await runCommand(repositoryPath, 'git', ['checkout', '.']);
      await runCommand(repositoryPath, 'git', ['clean', '-fd']);
      logger.info('Rollback completed via git checkout + clean');
    } catch (error) {
      logError(logger, error, 'Rollback failed', { repositoryPath });
      Sentry.captureException(error, {
        tags: { component: 'migration-transformer', operation: 'rollback' },
        extra: { repositoryPath }
      });
      throw error;
    }
  }
}

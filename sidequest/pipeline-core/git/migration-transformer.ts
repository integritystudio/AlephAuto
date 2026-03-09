/**
 * Migration Transformer - Orchestrates AST-based code transformations for consolidation migrations.
 *
 * Delegates to:
 * - MigrationAstTransformer: AST parse, transform, and generate
 * - MigrationFileResolver: detect which files are affected by each migration step
 * - MigrationGitManager: stash/unstash pre-existing changes, rollback on failure
 */

import { createComponentLogger, logError } from '../../utils/logger.ts';
import * as Sentry from '@sentry/node';
import { parseMigrationStep, MigrationAstTransformer } from './migration-ast-transformer.ts';
import { MigrationFileResolver } from './migration-file-resolver.ts';
import { MigrationGitManager } from './migration-git-manager.ts';
import type {
  MigrationSuggestion,
  MigrationResult,
  MigrationTransformerOptions,
  ParsedStep,
} from '../types/migration-types.ts';

const logger = createComponentLogger('MigrationTransformer');

export type { MigrationTransformerOptions };

export class MigrationTransformer {
  dryRun: boolean;
  private readonly astTransformer: MigrationAstTransformer;
  private readonly fileResolver: MigrationFileResolver;
  private readonly gitManager: MigrationGitManager;

  constructor(options: MigrationTransformerOptions = {}) {
    this.dryRun = options.dryRun ?? false;
    this.astTransformer = new MigrationAstTransformer(this.dryRun);
    this.fileResolver = new MigrationFileResolver(this.dryRun);
    this.gitManager = new MigrationGitManager(this.dryRun);
  }

  async applyMigrationSteps(suggestion: MigrationSuggestion, repositoryPath: string): Promise<MigrationResult> {
    logger.info({
      suggestionId: suggestion.suggestion_id,
      stepsCount: suggestion.migration_steps?.length ?? 0,
      repositoryPath
    }, 'Applying migration steps');

    if (!suggestion.migration_steps || suggestion.migration_steps.length === 0) {
      logger.info('No migration steps to apply');
      return { filesModified: [], transformations: [], errors: [], backupPath: null };
    }

    const results: MigrationResult = { filesModified: [], transformations: [], errors: [], backupPath: null };

    const stashRef = await this.gitManager.stashChanges(repositoryPath);
    results.backupPath = stashRef ? 'git-stash' : null;

    try {
      const parsedSteps: ParsedStep[] = suggestion.migration_steps
        .map((step, index) => ({ ...step, parsed: parseMigrationStep(step.description), index }))
        .filter((step): step is ParsedStep & { parsed: NonNullable<ParsedStep['parsed']> } => step.parsed !== null);

      logger.info({
        totalSteps: suggestion.migration_steps.length,
        parseableSteps: parsedSteps.length
      }, 'Parsed migration steps');

      const fileGroups = await this.fileResolver.groupStepsByFile(parsedSteps, suggestion, repositoryPath);

      for (const [filePath, steps] of Object.entries(fileGroups)) {
        await this._applyStepsToFile(filePath, steps, suggestion, repositoryPath, results);
      }

      logger.info({
        filesModified: results.filesModified.length,
        transformations: results.transformations.length,
        errors: results.errors.length
      }, 'Migration steps applied');

      if (stashRef) await this.gitManager.unstashChanges(repositoryPath, stashRef);

      return results;

    } catch (error) {
      logError(logger, error, 'Failed to apply migration steps');

      try {
        if (results.filesModified.length > 0) {
          logger.info('Attempting rollback due to error');
          await this.gitManager.rollback(repositoryPath);
        }
      } finally {
        if (stashRef) {
          try {
            await this.gitManager.unstashChanges(repositoryPath, stashRef, /* required= */ true);
          } catch (unstashError) {
            logError(logger, unstashError, 'Additionally failed to restore stash', { repositoryPath, stashRef });
          }
        }
      }

      throw error;
    }
  }

  async rollback(repositoryPath: string): Promise<void> {
    return this.gitManager.rollback(repositoryPath);
  }

  private async _applyStepsToFile(
    filePath: string,
    steps: ParsedStep[],
    suggestion: MigrationSuggestion,
    repositoryPath: string,
    results: MigrationResult
  ): Promise<void> {
    const { join } = await import('path');
    const { access } = await import('fs/promises');
    const absolutePath = join(repositoryPath, filePath);

    try {
      await access(absolutePath);
    } catch {
      logger.warn({ filePath }, 'File does not exist, skipping');
      return;
    }

    try {
      const transformResult = await this.astTransformer.transformFile(absolutePath, steps);

      if (transformResult.modified) {
        results.filesModified.push(filePath);
        results.transformations.push({ file: filePath, ...transformResult });
      }
    } catch (error) {
      logError(logger, error, 'Failed to transform file', { filePath });
      results.errors.push({ file: filePath, error: (error as Error).message });

      Sentry.captureException(error, {
        tags: { component: 'migration-transformer', file: filePath },
        extra: { suggestionId: suggestion.suggestion_id, steps: steps.map(s => s.description) }
      });
    }
  }
}

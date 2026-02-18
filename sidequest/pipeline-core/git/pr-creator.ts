/**
 * PR Creator - Automated Pull Request creation for consolidation suggestions
 *
 * Automatically creates Git branches and pull requests for duplicate code consolidation.
 * Uses gh CLI for PR creation and Git commands for branch management.
 */

import { runCommand } from '@shared/process-io';
import fs from 'fs/promises';
import path from 'path';
import { createComponentLogger, logError } from '../../utils/logger.ts';
import * as Sentry from '@sentry/node';
import { MigrationTransformer } from './migration-transformer.ts';

const logger = createComponentLogger('PRCreator');

interface MigrationStep {
  description: string;
  step_number: number;
  code_example?: string;
}

interface Suggestion {
  suggestion_id: string;
  automated_refactor_possible: boolean;
  impact_score: number;
  target_location?: string;
  target_name?: string;
  proposed_implementation?: string;
  strategy?: string;
  strategy_rationale: string;
  complexity?: string;
  migration_risk?: string;
  usage_example?: string;
  migration_steps: MigrationStep[];
}

interface ScanResult {
  suggestions?: Suggestion[];
}

export interface PRCreatorOptions {
  baseBranch?: string;
  branchPrefix?: string;
  dryRun?: boolean;
  maxSuggestionsPerPR?: number;
}

export interface PRCreationResults {
  prsCreated: number;
  prUrls: string[];
  errors: Array<{ batch: number; error: string; suggestions: string[] }>;
  skipped: number;
}

/**
 * PR Creator for automated consolidation suggestions
 */
export class PRCreator {
  baseBranch: string;
  branchPrefix: string;
  dryRun: boolean;
  maxSuggestionsPerPR: number;
  migrationTransformer: MigrationTransformer;

  constructor(options: PRCreatorOptions = {}) {
    this.baseBranch = options.baseBranch || 'main';
    this.branchPrefix = options.branchPrefix || 'consolidate';
    this.dryRun = options.dryRun ?? false;
    this.maxSuggestionsPerPR = options.maxSuggestionsPerPR || 5;
    this.migrationTransformer = new MigrationTransformer({
      dryRun: this.dryRun
    });
  }

  async createPRsForSuggestions(
    scanResult: ScanResult,
    repositoryPath: string,
    _options: Record<string, unknown> = {}
  ): Promise<PRCreationResults> {
    logger.info({
      repositoryPath,
      totalSuggestions: scanResult.suggestions?.length || 0
    }, 'Creating PRs for consolidation suggestions');

    if (!scanResult.suggestions || scanResult.suggestions.length === 0) {
      logger.info('No suggestions to process');
      return {
        prsCreated: 0,
        prUrls: [],
        errors: [],
        skipped: 0
      };
    }

    const results: PRCreationResults = {
      prsCreated: 0,
      prUrls: [],
      errors: [],
      skipped: 0
    };

    // Filter suggestions that can be automated
    const automatableSuggestions = scanResult.suggestions.filter(
      s => s.automated_refactor_possible && s.impact_score >= 50
    );

    logger.info({
      total: scanResult.suggestions.length,
      automatable: automatableSuggestions.length
    }, 'Filtered automatable suggestions');

    if (automatableSuggestions.length === 0) {
      logger.info('No automatable suggestions found');
      results.skipped = scanResult.suggestions.length;
      return results;
    }

    // Group suggestions for batching
    const suggestionBatches = this._batchSuggestions(automatableSuggestions);

    logger.info({
      batches: suggestionBatches.length
    }, 'Created suggestion batches');

    for (let i = 0; i < suggestionBatches.length; i++) {
      const batch = suggestionBatches[i];

      try {
        const prUrl = await this._createPRForBatch(
          batch,
          repositoryPath,
          i + 1,
          _options
        );

        if (prUrl) {
          results.prsCreated++;
          results.prUrls.push(prUrl);
        } else {
          results.skipped += batch.length;
        }
      } catch (error) {
        logError(logger, error, 'Failed to create PR for batch', { batch: i + 1 });
        results.errors.push({
          batch: i + 1,
          error: (error as Error).message,
          suggestions: batch.map(s => s.suggestion_id)
        });

        Sentry.captureException(error, {
          tags: {
            component: 'pr-creator',
            batch: i + 1
          },
          extra: {
            repositoryPath,
            suggestions: batch.map(s => s.suggestion_id)
          }
        });
      }
    }

    logger.info(results, 'PR creation completed');
    return results;
  }

  private async _createPRForBatch(
    suggestions: Suggestion[],
    repositoryPath: string,
    batchNumber: number,
    _options: Record<string, unknown>
  ): Promise<string | null> {
    const branchName = this._generateBranchName(suggestions, batchNumber);

    logger.info({
      branchName,
      suggestions: suggestions.length,
      batchNumber
    }, 'Creating PR for suggestion batch');

    try {
      await this._runGitCommand(repositoryPath, ['checkout', this.baseBranch]);

      if (!this.dryRun) {
        await this._runGitCommand(repositoryPath, ['pull', 'origin', this.baseBranch]);
      }

      await this._runGitCommand(repositoryPath, ['checkout', '-b', branchName]);

      const filesModified = await this._applySuggestions(suggestions, repositoryPath);

      if (filesModified.length === 0) {
        logger.warn({ branchName }, 'No files were modified, skipping PR creation');
        await this._runGitCommand(repositoryPath, ['checkout', this.baseBranch]);
        await this._runGitCommand(repositoryPath, ['branch', '-D', branchName]);
        return null;
      }

      await this._runGitCommand(repositoryPath, ['add', '.']);

      const commitMessage = this._generateCommitMessage(suggestions, filesModified);
      await this._runGitCommand(repositoryPath, ['commit', '-m', commitMessage]);

      if (this.dryRun) {
        logger.info({ branchName }, 'Dry run: Skipping push and PR creation');
        await this._runGitCommand(repositoryPath, ['checkout', this.baseBranch]);
        await this._runGitCommand(repositoryPath, ['branch', '-D', branchName]);
        return `dry-run-${branchName}`;
      }

      await this._runGitCommand(repositoryPath, ['push', '-u', 'origin', branchName]);

      const prDescription = this._generatePRDescription(suggestions, filesModified);
      const prTitle = this._generatePRTitle(suggestions, batchNumber);
      const prUrl = await this._createPR(repositoryPath, branchName, prTitle, prDescription);

      logger.info({ prUrl, branchName }, 'PR created successfully');
      return prUrl;

    } catch (error) {
      logError(logger, error, 'Failed to create PR', { branchName });

      try {
        await this._runGitCommand(repositoryPath, ['checkout', this.baseBranch]);
        await this._runGitCommand(repositoryPath, ['branch', '-D', branchName]);
      } catch (cleanupError) {
        logger.warn({ error: cleanupError }, 'Failed to cleanup branch');
      }

      throw error;
    }
  }

  private async _applySuggestions(suggestions: Suggestion[], repositoryPath: string): Promise<string[]> {
    const filesModified: string[] = [];

    for (const suggestion of suggestions) {
      try {
        if (suggestion.target_location && suggestion.proposed_implementation) {
          const targetPath = path.join(repositoryPath, suggestion.target_location);

          await fs.mkdir(path.dirname(targetPath), { recursive: true });
          await fs.writeFile(targetPath, suggestion.proposed_implementation, 'utf-8');
          filesModified.push(suggestion.target_location);

          logger.info({
            file: suggestion.target_location,
            suggestionId: suggestion.suggestion_id
          }, 'Created consolidated file');
        }

        if (suggestion.migration_steps && suggestion.migration_steps.length > 0) {
          try {
            const migrationResult = await this.migrationTransformer.applyMigrationSteps(
              suggestion,
              repositoryPath
            );

            for (const file of migrationResult.filesModified) {
              if (!filesModified.includes(file)) {
                filesModified.push(file);
              }
            }

            logger.info({
              suggestionId: suggestion.suggestion_id,
              filesModified: migrationResult.filesModified.length,
              transformations: migrationResult.transformations.length,
              errors: migrationResult.errors.length,
              backupPath: migrationResult.backupPath
            }, 'Applied migration steps');

            if (migrationResult.errors.length > 0) {
              logger.warn({
                errors: migrationResult.errors
              }, 'Some migration transformations failed');
            }

          } catch (migrationError) {
            logError(logger, migrationError, 'Failed to apply migration steps', {
              suggestionId: suggestion.suggestion_id
            });

            Sentry.captureException(migrationError, {
              tags: {
                component: 'pr-creator',
                operation: 'apply-migration-steps'
              },
              extra: {
                suggestionId: suggestion.suggestion_id,
                repositoryPath
              }
            });
          }
        }

      } catch (error) {
        logError(logger, error, 'Failed to apply suggestion', {
          suggestionId: suggestion.suggestion_id
        });
      }
    }

    return filesModified;
  }

  private async _runGitCommand(cwd: string, args: string[]): Promise<string> {
    return runCommand(cwd, 'git', args);
  }

  private async _createPR(cwd: string, branch: string, title: string, body: string): Promise<string> {
    return runCommand(cwd, 'gh', [
      'pr',
      'create',
      '--title', title,
      '--body', body,
      '--base', this.baseBranch,
      '--head', branch
    ]);
  }

  private _batchSuggestions(suggestions: Suggestion[]): Suggestion[][] {
    const batches: Suggestion[][] = [];

    for (let i = 0; i < suggestions.length; i += this.maxSuggestionsPerPR) {
      batches.push(suggestions.slice(i, i + this.maxSuggestionsPerPR));
    }

    return batches;
  }

  private _generateBranchName(_suggestions: Suggestion[], batchNumber: number): string {
    const timestamp = Date.now();
    return `${this.branchPrefix}/batch-${batchNumber}-${timestamp}`;
  }

  private _generateCommitMessage(suggestions: Suggestion[], filesModified: string[]): string {
    const consolidationCount = suggestions.length;
    const fileCount = filesModified.length;

    return [
      `refactor: consolidate ${consolidationCount} duplicate code pattern${consolidationCount > 1 ? 's' : ''}`,
      '',
      `This commit consolidates ${consolidationCount} identified duplicate code pattern${consolidationCount > 1 ? 's' : ''} across ${fileCount} file${fileCount > 1 ? 's' : ''}.`,
      '',
      'Consolidations:',
      ...suggestions.map((s, i) => `${i + 1}. ${s.target_name || s.suggestion_id}: ${s.strategy_rationale.substring(0, 80)}...`),
      '',
      'Files created:',
      ...filesModified.map(f => `- ${f}`),
      '',
      'Co-Authored-By: Claude <noreply@anthropic.com>'
    ].join('\n');
  }

  private _generatePRTitle(suggestions: Suggestion[], batchNumber: number): string {
    const consolidationCount = suggestions.length;
    return `refactor: consolidate ${consolidationCount} duplicate code pattern${consolidationCount > 1 ? 's' : ''} (batch ${batchNumber})`;
  }

  private _generatePRDescription(suggestions: Suggestion[], filesModified: string[]): string {
    const consolidationCount = suggestions.length;

    return [
      '## Summary',
      '',
      `This PR consolidates ${consolidationCount} identified duplicate code pattern${consolidationCount > 1 ? 's' : ''} to improve code maintainability and reduce duplication.`,
      '',
      '## Consolidations',
      '',
      ...suggestions.map((s, i) => {
        return [
          `### ${i + 1}. ${s.target_name || s.suggestion_id}`,
          '',
          `**Strategy:** ${s.strategy}`,
          `**Impact Score:** ${s.impact_score}/100`,
          `**Complexity:** ${s.complexity}`,
          `**Risk:** ${s.migration_risk}`,
          '',
          `**Rationale:** ${s.strategy_rationale}`,
          '',
          `**Target Location:** \`${s.target_location}\``,
          '',
          s.migration_steps.length > 0 ? '**Migration Steps:**' : '',
          ...s.migration_steps.map(step => `${step.step_number}. ${step.description}`),
          ''
        ].join('\n');
      }),
      '## Files Modified',
      '',
      ...filesModified.map(f => `- \`${f}\``),
      '',
      '## Testing',
      '',
      '- [ ] Unit tests pass',
      '- [ ] Integration tests pass',
      '- [ ] Manual testing completed',
      '- [ ] Code review completed',
      '',
      '## Migration Notes',
      '',
      'This PR creates consolidated utility files. The actual migration of existing code to use these utilities should be done in follow-up PRs.',
      '',
      suggestions.map((s) => {
        if (s.usage_example) {
          return [
            `### ${s.target_name || s.suggestion_id} Usage`,
            '',
            '```javascript',
            s.usage_example,
            '```',
            ''
          ].join('\n');
        }
        return '';
      }).filter(Boolean).join('\n'),
      '---',
      '',
      'Generated with [Claude Code](https://claude.com/claude-code)'
    ].join('\n');
  }
}

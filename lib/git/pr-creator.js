/**
 * PR Creator - Automated Pull Request creation for consolidation suggestions
 *
 * Automatically creates Git branches and pull requests for duplicate code consolidation.
 * Uses gh CLI for PR creation and Git commands for branch management.
 *
 * Features:
 * - Creates feature branches for consolidation suggestions
 * - Applies automated code changes
 * - Commits changes with descriptive messages
 * - Creates PRs with detailed descriptions
 * - Handles multi-file consolidations
 * - Sentry error tracking
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { createComponentLogger } from '../../sidequest/logger.js';
import * as Sentry from '@sentry/node';

const logger = createComponentLogger('PRCreator');

/**
 * PR Creator for automated consolidation suggestions
 */
export class PRCreator {
  constructor(options = {}) {
    this.baseBranch = options.baseBranch || 'main';
    this.branchPrefix = options.branchPrefix || 'consolidate';
    this.dryRun = options.dryRun ?? false;
    this.maxSuggestionsPerPR = options.maxSuggestionsPerPR || 5;
  }

  /**
   * Create PRs for consolidation suggestions
   *
   * @param {Object} scanResult - Scan result with suggestions
   * @param {string} repositoryPath - Path to repository
   * @param {Object} options - PR creation options
   * @returns {Promise<Object>} PR creation results
   */
  async createPRsForSuggestions(scanResult, repositoryPath, options = {}) {
    logger.info({
      repositoryPath,
      totalSuggestions: scanResult.suggestions?.length || 0
    }, 'Creating PRs for consolidation suggestions');

    if (!scanResult.suggestions || scanResult.suggestions.length === 0) {
      logger.info('No suggestions to process');
      return {
        prsCreated: 0,
        errors: [],
        skipped: 0
      };
    }

    const results = {
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

    // Group suggestions for batching (max 5 per PR to keep PRs manageable)
    const suggestionBatches = this._batchSuggestions(automatableSuggestions);

    logger.info({
      batches: suggestionBatches.length
    }, 'Created suggestion batches');

    // Create PR for each batch
    for (let i = 0; i < suggestionBatches.length; i++) {
      const batch = suggestionBatches[i];

      try {
        const prUrl = await this._createPRForBatch(
          batch,
          repositoryPath,
          i + 1,
          options
        );

        if (prUrl) {
          results.prsCreated++;
          results.prUrls.push(prUrl);
        } else {
          results.skipped += batch.length;
        }
      } catch (error) {
        logger.error({ error, batch: i + 1 }, 'Failed to create PR for batch');
        results.errors.push({
          batch: i + 1,
          error: error.message,
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

  /**
   * Create a PR for a batch of suggestions
   *
   * @param {Array} suggestions - Suggestions to include in PR
   * @param {string} repositoryPath - Repository path
   * @param {number} batchNumber - Batch number
   * @param {Object} options - Creation options
   * @returns {Promise<string|null>} PR URL or null
   * @private
   */
  async _createPRForBatch(suggestions, repositoryPath, batchNumber, options) {
    const branchName = this._generateBranchName(suggestions, batchNumber);

    logger.info({
      branchName,
      suggestions: suggestions.length,
      batchNumber
    }, 'Creating PR for suggestion batch');

    try {
      // 1. Ensure we're on base branch
      await this._runGitCommand(repositoryPath, ['checkout', this.baseBranch]);

      // 2. Pull latest changes (skip in dry-run to allow testing without remote)
      if (!this.dryRun) {
        await this._runGitCommand(repositoryPath, ['pull', 'origin', this.baseBranch]);
      }

      // 3. Create new branch
      await this._runGitCommand(repositoryPath, ['checkout', '-b', branchName]);

      // 4. Apply suggested changes
      const filesModified = await this._applySuggestions(suggestions, repositoryPath);

      if (filesModified.length === 0) {
        logger.warn({ branchName }, 'No files were modified, skipping PR creation');
        // Cleanup branch
        await this._runGitCommand(repositoryPath, ['checkout', this.baseBranch]);
        await this._runGitCommand(repositoryPath, ['branch', '-D', branchName]);
        return null;
      }

      // 5. Stage changes
      await this._runGitCommand(repositoryPath, ['add', '.']);

      // 6. Commit changes
      const commitMessage = this._generateCommitMessage(suggestions, filesModified);
      await this._runGitCommand(repositoryPath, ['commit', '-m', commitMessage]);

      if (this.dryRun) {
        logger.info({ branchName }, 'Dry run: Skipping push and PR creation');
        // Cleanup branch
        await this._runGitCommand(repositoryPath, ['checkout', this.baseBranch]);
        await this._runGitCommand(repositoryPath, ['branch', '-D', branchName]);
        return `dry-run-${branchName}`;
      }

      // 7. Push branch
      await this._runGitCommand(repositoryPath, ['push', '-u', 'origin', branchName]);

      // 8. Create PR
      const prDescription = this._generatePRDescription(suggestions, filesModified);
      const prTitle = this._generatePRTitle(suggestions, batchNumber);
      const prUrl = await this._createPR(repositoryPath, branchName, prTitle, prDescription);

      logger.info({ prUrl, branchName }, 'PR created successfully');
      return prUrl;

    } catch (error) {
      logger.error({ error, branchName }, 'Failed to create PR');

      // Attempt cleanup
      try {
        await this._runGitCommand(repositoryPath, ['checkout', this.baseBranch]);
        await this._runGitCommand(repositoryPath, ['branch', '-D', branchName]);
      } catch (cleanupError) {
        logger.warn({ error: cleanupError }, 'Failed to cleanup branch');
      }

      throw error;
    }
  }

  /**
   * Apply consolidation suggestions to files
   *
   * @param {Array} suggestions - Suggestions to apply
   * @param {string} repositoryPath - Repository path
   * @returns {Promise<Array>} List of modified files
   * @private
   */
  async _applySuggestions(suggestions, repositoryPath) {
    const filesModified = [];

    for (const suggestion of suggestions) {
      try {
        // Create consolidated file if target_location is specified
        if (suggestion.target_location && suggestion.proposed_implementation) {
          const targetPath = path.join(repositoryPath, suggestion.target_location);

          // Ensure directory exists
          await fs.mkdir(path.dirname(targetPath), { recursive: true });

          // Write proposed implementation
          await fs.writeFile(targetPath, suggestion.proposed_implementation, 'utf-8');
          filesModified.push(suggestion.target_location);

          logger.info({
            file: suggestion.target_location,
            suggestionId: suggestion.suggestion_id
          }, 'Created consolidated file');
        }

        // TODO: Apply migration steps to affected files
        // This would require parsing migration steps and applying transformations
        // For now, we create the consolidated file and rely on manual migration

      } catch (error) {
        logger.error({
          error,
          suggestionId: suggestion.suggestion_id
        }, 'Failed to apply suggestion');

        // Continue with other suggestions
      }
    }

    return filesModified;
  }

  /**
   * Run a Git command
   *
   * @param {string} cwd - Working directory
   * @param {Array} args - Git arguments
   * @returns {Promise<string>} Command output
   * @private
   */
  async _runGitCommand(cwd, args) {
    return new Promise((resolve, reject) => {
      const proc = spawn('git', args, { cwd });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          const error = new Error(`Git command failed: git ${args.join(' ')}`);
          error.code = code;
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
        }
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Create PR using gh CLI
   *
   * @param {string} cwd - Working directory
   * @param {string} branch - Branch name
   * @param {string} title - PR title
   * @param {string} body - PR description
   * @returns {Promise<string>} PR URL
   * @private
   */
  async _createPR(cwd, branch, title, body) {
    return new Promise((resolve, reject) => {
      const proc = spawn('gh', [
        'pr',
        'create',
        '--title', title,
        '--body', body,
        '--base', this.baseBranch,
        '--head', branch
      ], { cwd });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          // gh CLI returns the PR URL in stdout
          const prUrl = stdout.trim();
          resolve(prUrl);
        } else {
          const error = new Error(`Failed to create PR: ${stderr}`);
          error.code = code;
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
        }
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Batch suggestions for PR creation
   *
   * @param {Array} suggestions - All suggestions
   * @returns {Array<Array>} Batches of suggestions
   * @private
   */
  _batchSuggestions(suggestions) {
    const batches = [];

    for (let i = 0; i < suggestions.length; i += this.maxSuggestionsPerPR) {
      batches.push(suggestions.slice(i, i + this.maxSuggestionsPerPR));
    }

    return batches;
  }

  /**
   * Generate branch name
   *
   * @param {Array} suggestions - Suggestions in batch
   * @param {number} batchNumber - Batch number
   * @returns {string} Branch name
   * @private
   */
  _generateBranchName(suggestions, batchNumber) {
    const timestamp = Date.now();
    return `${this.branchPrefix}/batch-${batchNumber}-${timestamp}`;
  }

  /**
   * Generate commit message
   *
   * @param {Array} suggestions - Suggestions in batch
   * @param {Array} filesModified - Modified files
   * @returns {string} Commit message
   * @private
   */
  _generateCommitMessage(suggestions, filesModified) {
    const consolidationCount = suggestions.length;
    const fileCount = filesModified.length;

    const message = [
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
      '🤖 Generated with [Claude Code](https://claude.com/claude-code)',
      '',
      'Co-Authored-By: Claude <noreply@anthropic.com>'
    ].join('\n');

    return message;
  }

  /**
   * Generate PR title
   *
   * @param {Array} suggestions - Suggestions in batch
   * @param {number} batchNumber - Batch number
   * @returns {string} PR title
   * @private
   */
  _generatePRTitle(suggestions, batchNumber) {
    const consolidationCount = suggestions.length;
    return `refactor: consolidate ${consolidationCount} duplicate code pattern${consolidationCount > 1 ? 's' : ''} (batch ${batchNumber})`;
  }

  /**
   * Generate PR description
   *
   * @param {Array} suggestions - Suggestions in batch
   * @param {Array} filesModified - Modified files
   * @returns {string} PR description
   * @private
   */
  _generatePRDescription(suggestions, filesModified) {
    const consolidationCount = suggestions.length;

    const description = [
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
      '⚠️ **Important:** This PR creates consolidated utility files. The actual migration of existing code to use these utilities should be done in follow-up PRs to keep changes manageable and reviewable.',
      '',
      suggestions.map((s, i) => {
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
      '🤖 Generated with [Claude Code](https://claude.com/claude-code)'
    ].join('\n');

    return description;
  }
}

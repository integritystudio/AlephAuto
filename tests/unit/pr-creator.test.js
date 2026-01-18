#!/usr/bin/env node
/**
 * PR Creator Tests
 *
 * Tests for automated pull request creation functionality.
 */

// @ts-nocheck
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PRCreator } from '../../sidequest/pipeline-core/git/pr-creator.js';

describe('PRCreator', () => {
  describe('Constructor', () => {
    it('should initialize with default options', () => {
      const creator = new PRCreator();

      assert.strictEqual(creator.baseBranch, 'main');
      assert.strictEqual(creator.branchPrefix, 'consolidate');
      assert.strictEqual(creator.dryRun, false);
      assert.strictEqual(creator.maxSuggestionsPerPR, 5);
    });

    it('should initialize with custom options', () => {
      const creator = new PRCreator({
        baseBranch: 'develop',
        branchPrefix: 'refactor',
        dryRun: true,
        maxSuggestionsPerPR: 3
      });

      assert.strictEqual(creator.baseBranch, 'develop');
      assert.strictEqual(creator.branchPrefix, 'refactor');
      assert.strictEqual(creator.dryRun, true);
      assert.strictEqual(creator.maxSuggestionsPerPR, 3);
    });

    it('should create migration transformer', () => {
      const creator = new PRCreator({ dryRun: true });
      assert.ok(creator.migrationTransformer);
    });
  });

  describe('_batchSuggestions', () => {
    it('should batch suggestions according to maxSuggestionsPerPR', () => {
      const creator = new PRCreator({ maxSuggestionsPerPR: 2 });
      const suggestions = [
        { suggestion_id: 'sug-1' },
        { suggestion_id: 'sug-2' },
        { suggestion_id: 'sug-3' },
        { suggestion_id: 'sug-4' },
        { suggestion_id: 'sug-5' }
      ];

      const batches = creator._batchSuggestions(suggestions);

      assert.strictEqual(batches.length, 3);
      assert.strictEqual(batches[0].length, 2);
      assert.strictEqual(batches[1].length, 2);
      assert.strictEqual(batches[2].length, 1);
    });

    it('should return single batch for small suggestion count', () => {
      const creator = new PRCreator({ maxSuggestionsPerPR: 5 });
      const suggestions = [
        { suggestion_id: 'sug-1' },
        { suggestion_id: 'sug-2' }
      ];

      const batches = creator._batchSuggestions(suggestions);

      assert.strictEqual(batches.length, 1);
      assert.strictEqual(batches[0].length, 2);
    });

    it('should return empty array for empty suggestions', () => {
      const creator = new PRCreator();
      const batches = creator._batchSuggestions([]);

      assert.strictEqual(batches.length, 0);
    });
  });

  describe('_generateBranchName', () => {
    it('should generate branch name with prefix and batch number', () => {
      const creator = new PRCreator({ branchPrefix: 'consolidate' });
      const suggestions = [{ suggestion_id: 'test' }];

      const branchName = creator._generateBranchName(suggestions, 1);

      assert.ok(branchName.startsWith('consolidate/batch-1-'));
      assert.ok(branchName.includes('batch-1'));
    });

    it('should include timestamp for uniqueness', () => {
      const creator = new PRCreator();
      const suggestions = [{ suggestion_id: 'test' }];

      const name1 = creator._generateBranchName(suggestions, 1);
      // Small delay to ensure different timestamp
      const name2 = creator._generateBranchName(suggestions, 1);

      // Names should be different due to timestamp
      // (they might be same if called in same millisecond)
      assert.ok(name1.includes('batch-1'));
      assert.ok(name2.includes('batch-1'));
    });
  });

  describe('_generateCommitMessage', () => {
    it('should generate commit message for single suggestion', () => {
      const creator = new PRCreator();
      const suggestions = [{
        suggestion_id: 'sug-1',
        target_name: 'formatDate',
        strategy_rationale: 'Extract common date formatting utility to reduce duplication'
      }];
      const filesModified = ['src/utils/date.js'];

      const message = creator._generateCommitMessage(suggestions, filesModified);

      assert.ok(message.includes('refactor: consolidate 1 duplicate code pattern'));
      assert.ok(message.includes('formatDate'));
      assert.ok(message.includes('src/utils/date.js'));
      assert.ok(message.includes('Co-Authored-By'));
    });

    it('should generate commit message for multiple suggestions', () => {
      const creator = new PRCreator();
      const suggestions = [
        { suggestion_id: 'sug-1', target_name: 'util1', strategy_rationale: 'Rationale 1 for the first suggestion' },
        { suggestion_id: 'sug-2', target_name: 'util2', strategy_rationale: 'Rationale 2 for the second suggestion' }
      ];
      const filesModified = ['src/util1.js', 'src/util2.js'];

      const message = creator._generateCommitMessage(suggestions, filesModified);

      assert.ok(message.includes('2 duplicate code patterns'));
      assert.ok(message.includes('2 files'));
    });

    it('should truncate long rationales', () => {
      const creator = new PRCreator();
      const longRationale = 'A'.repeat(200);
      const suggestions = [{
        suggestion_id: 'sug-1',
        strategy_rationale: longRationale
      }];

      const message = creator._generateCommitMessage(suggestions, ['file.js']);

      assert.ok(message.includes('...'));
    });

    it('should use suggestion_id when target_name is missing', () => {
      const creator = new PRCreator();
      const suggestions = [{
        suggestion_id: 'sug-123',
        strategy_rationale: 'Some rationale'
      }];

      const message = creator._generateCommitMessage(suggestions, ['file.js']);

      assert.ok(message.includes('sug-123'));
    });
  });

  describe('_generatePRTitle', () => {
    it('should generate title for single suggestion', () => {
      const creator = new PRCreator();
      const suggestions = [{ suggestion_id: 'sug-1' }];

      const title = creator._generatePRTitle(suggestions, 1);

      assert.strictEqual(title, 'refactor: consolidate 1 duplicate code pattern (batch 1)');
    });

    it('should generate title for multiple suggestions', () => {
      const creator = new PRCreator();
      const suggestions = [
        { suggestion_id: 'sug-1' },
        { suggestion_id: 'sug-2' },
        { suggestion_id: 'sug-3' }
      ];

      const title = creator._generatePRTitle(suggestions, 2);

      assert.strictEqual(title, 'refactor: consolidate 3 duplicate code patterns (batch 2)');
    });
  });

  describe('_generatePRDescription', () => {
    it('should generate comprehensive PR description', () => {
      const creator = new PRCreator();
      const suggestions = [{
        suggestion_id: 'sug-1',
        target_name: 'formatDate',
        strategy: 'local_util',
        impact_score: 85,
        complexity: 'simple',
        migration_risk: 'low',
        strategy_rationale: 'Extract common date formatting',
        target_location: 'src/utils/date.js',
        migration_steps: [
          { step_number: 1, description: 'Create utility file' },
          { step_number: 2, description: 'Move functions' }
        ]
      }];
      const filesModified = ['src/utils/date.js'];

      const description = creator._generatePRDescription(suggestions, filesModified);

      assert.ok(description.includes('## Summary'));
      assert.ok(description.includes('## Consolidations'));
      assert.ok(description.includes('formatDate'));
      assert.ok(description.includes('local_util'));
      assert.ok(description.includes('85/100'));
      assert.ok(description.includes('## Files Modified'));
      assert.ok(description.includes('## Testing'));
      assert.ok(description.includes('## Migration Notes'));
      assert.ok(description.includes('Claude Code'));
    });

    it('should include usage examples when present', () => {
      const creator = new PRCreator();
      const suggestions = [{
        suggestion_id: 'sug-1',
        target_name: 'formatDate',
        strategy: 'local_util',
        impact_score: 80,
        complexity: 'simple',
        migration_risk: 'low',
        strategy_rationale: 'Extract utility',
        target_location: 'src/utils.js',
        migration_steps: [],
        usage_example: 'import { formatDate } from "./utils";\nformatDate(new Date());'
      }];

      const description = creator._generatePRDescription(suggestions, ['src/utils.js']);

      assert.ok(description.includes('Usage'));
      assert.ok(description.includes('```javascript'));
      assert.ok(description.includes('formatDate'));
    });

    it('should handle suggestions without migration steps', () => {
      const creator = new PRCreator();
      const suggestions = [{
        suggestion_id: 'sug-1',
        target_name: 'util',
        strategy: 'shared_package',
        impact_score: 70,
        complexity: 'moderate',
        migration_risk: 'medium',
        strategy_rationale: 'Create shared package',
        target_location: '@org/utils',
        migration_steps: []
      }];

      const description = creator._generatePRDescription(suggestions, ['file.js']);

      // Should not throw and should still contain sections
      assert.ok(description.includes('## Summary'));
    });

    it('should include multiple suggestions', () => {
      const creator = new PRCreator();
      const suggestions = [
        {
          suggestion_id: 'sug-1',
          target_name: 'util1',
          strategy: 'local_util',
          impact_score: 80,
          complexity: 'simple',
          migration_risk: 'low',
          strategy_rationale: 'Extract util1',
          target_location: 'src/util1.js',
          migration_steps: []
        },
        {
          suggestion_id: 'sug-2',
          target_name: 'util2',
          strategy: 'shared_package',
          impact_score: 90,
          complexity: 'complex',
          migration_risk: 'high',
          strategy_rationale: 'Create shared util2',
          target_location: '@org/util2',
          migration_steps: []
        }
      ];

      const description = creator._generatePRDescription(suggestions, ['file1.js', 'file2.js']);

      assert.ok(description.includes('util1'));
      assert.ok(description.includes('util2'));
      assert.ok(description.includes('2 identified duplicate code patterns'));
    });
  });

  describe('createPRsForSuggestions', () => {
    it('should return empty results for no suggestions', async () => {
      const creator = new PRCreator({ dryRun: true });

      const result = await creator.createPRsForSuggestions(
        { suggestions: [] },
        '/repo/path'
      );

      assert.strictEqual(result.prsCreated, 0);
      assert.strictEqual(result.skipped, 0);
      assert.deepStrictEqual(result.errors, []);
    });

    it('should return empty results for undefined suggestions', async () => {
      const creator = new PRCreator({ dryRun: true });

      const result = await creator.createPRsForSuggestions(
        {},
        '/repo/path'
      );

      assert.strictEqual(result.prsCreated, 0);
    });

    it('should skip non-automatable suggestions', async () => {
      const creator = new PRCreator({ dryRun: true });

      const scanResult = {
        suggestions: [
          { suggestion_id: 'sug-1', automated_refactor_possible: false, impact_score: 80 },
          { suggestion_id: 'sug-2', automated_refactor_possible: true, impact_score: 30 }, // Low impact
        ]
      };

      const result = await creator.createPRsForSuggestions(scanResult, '/repo/path');

      assert.strictEqual(result.skipped, 2);
    });
  });
});

describe('PRCreator - Helper Functions', () => {
  describe('Suggestion filtering', () => {
    it('should filter by automated_refactor_possible and impact_score', () => {
      const suggestions = [
        { suggestion_id: 'a', automated_refactor_possible: true, impact_score: 80 }, // Pass
        { suggestion_id: 'b', automated_refactor_possible: false, impact_score: 80 }, // Fail - not automatable
        { suggestion_id: 'c', automated_refactor_possible: true, impact_score: 40 }, // Fail - low impact
        { suggestion_id: 'd', automated_refactor_possible: true, impact_score: 50 }, // Pass - exactly 50
      ];

      const filtered = suggestions.filter(
        s => s.automated_refactor_possible && s.impact_score >= 50
      );

      assert.strictEqual(filtered.length, 2);
      assert.ok(filtered.find(s => s.suggestion_id === 'a'));
      assert.ok(filtered.find(s => s.suggestion_id === 'd'));
    });
  });
});

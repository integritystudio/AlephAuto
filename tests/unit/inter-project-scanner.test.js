/**
 * InterProjectScanner Unit Tests
 *
 * Tests for the inter-project scanner that detects duplicates across repositories.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { InterProjectScanner } from '../../sidequest/pipeline-core/inter-project-scanner.ts';

describe('InterProjectScanner', () => {
  let scanner;

  beforeEach(() => {
    scanner = new InterProjectScanner();
  });

  describe('Constructor', () => {
    it('should initialize with default options', () => {
      assert.ok(scanner.orchestrator, 'Should have orchestrator');
      assert.ok(scanner.outputDir.includes('inter-project-scans'));
    });

    it('should accept custom outputDir', () => {
      const customScanner = new InterProjectScanner({
        outputDir: '/custom/output'
      });
      assert.strictEqual(customScanner.outputDir, '/custom/output');
    });

    it('should pass orchestrator config to ScanOrchestrator', () => {
      const customScanner = new InterProjectScanner({
        orchestrator: {
          pythonPath: '/usr/bin/python3'
        }
      });
      assert.ok(customScanner.orchestrator);
    });
  });

  describe('_aggregateCodeBlocks', () => {
    it('should aggregate code blocks from multiple repository scans', () => {
      const repositoryScans = [
        {
          repository_name: 'repo1',
          repository_path: '/path/to/repo1',
          code_blocks: [
            { id: 'block1', content_hash: 'hash1', line_count: 10 },
            { id: 'block2', content_hash: 'hash2', line_count: 20 }
          ]
        },
        {
          repository_name: 'repo2',
          repository_path: '/path/to/repo2',
          code_blocks: [
            { id: 'block3', content_hash: 'hash1', line_count: 10 }
          ]
        }
      ];

      const aggregated = scanner._aggregateCodeBlocks(repositoryScans);

      assert.strictEqual(aggregated.length, 3);
      assert.strictEqual(aggregated[0].source_repository, 'repo1');
      assert.strictEqual(aggregated[2].source_repository, 'repo2');
    });

    it('should skip repository scans without code_blocks', () => {
      const repositoryScans = [
        {
          repository_name: 'repo1',
          code_blocks: [{ id: 'block1' }]
        },
        {
          repository_name: 'repo2'
          // No code_blocks
        }
      ];

      const aggregated = scanner._aggregateCodeBlocks(repositoryScans);

      assert.strictEqual(aggregated.length, 1);
    });

    it('should add source repository context to each block', () => {
      const repositoryScans = [
        {
          repository_name: 'myrepo',
          repository_path: '/full/path/to/myrepo',
          code_blocks: [
            { id: 'block1', content_hash: 'abc' }
          ]
        }
      ];

      const aggregated = scanner._aggregateCodeBlocks(repositoryScans);

      assert.strictEqual(aggregated[0].source_repository, 'myrepo');
      assert.strictEqual(aggregated[0].source_repository_path, '/full/path/to/myrepo');
    });

    it('should return empty array for empty input', () => {
      const aggregated = scanner._aggregateCodeBlocks([]);
      assert.deepStrictEqual(aggregated, []);
    });
  });

  describe('_detectCrossRepoDuplicates', () => {
    it('should detect duplicates across repositories', () => {
      const allCodeBlocks = [
        { content_hash: 'hashA', source_repository: 'repo1', pattern_id: 'p1', category: 'util', language: 'js', line_count: 10, relative_path: 'utils.js' },
        { content_hash: 'hashA', source_repository: 'repo2', pattern_id: 'p1', category: 'util', language: 'js', line_count: 10, relative_path: 'utils.js' },
        { content_hash: 'hashB', source_repository: 'repo1', pattern_id: 'p2', category: 'helper', language: 'js', line_count: 5, relative_path: 'helper.js' }
      ];

      const duplicates = scanner._detectCrossRepoDuplicates(allCodeBlocks);

      assert.strictEqual(duplicates.length, 1);
      assert.strictEqual(duplicates[0].content_hash, 'hashA');
      assert.strictEqual(duplicates[0].repository_count, 2);
    });

    it('should not include duplicates within same repository', () => {
      const allCodeBlocks = [
        { content_hash: 'hashA', source_repository: 'repo1', pattern_id: 'p1', category: 'util', language: 'js', line_count: 10, relative_path: 'a.js' },
        { content_hash: 'hashA', source_repository: 'repo1', pattern_id: 'p1', category: 'util', language: 'js', line_count: 10, relative_path: 'b.js' }
      ];

      const duplicates = scanner._detectCrossRepoDuplicates(allCodeBlocks);

      assert.strictEqual(duplicates.length, 0);
    });

    it('should calculate correct occurrence count', () => {
      const allCodeBlocks = [
        { content_hash: 'hashA', source_repository: 'repo1', pattern_id: 'p1', category: 'util', language: 'js', line_count: 10, relative_path: 'a.js' },
        { content_hash: 'hashA', source_repository: 'repo2', pattern_id: 'p1', category: 'util', language: 'js', line_count: 10, relative_path: 'b.js' },
        { content_hash: 'hashA', source_repository: 'repo3', pattern_id: 'p1', category: 'util', language: 'js', line_count: 10, relative_path: 'c.js' }
      ];

      const duplicates = scanner._detectCrossRepoDuplicates(allCodeBlocks);

      assert.strictEqual(duplicates[0].occurrence_count, 3);
      assert.strictEqual(duplicates[0].repository_count, 3);
    });

    it('should include affected repositories and files', () => {
      const allCodeBlocks = [
        { content_hash: 'hashA', source_repository: 'repo1', pattern_id: 'p1', category: 'util', language: 'js', line_count: 10, relative_path: 'src/utils.js' },
        { content_hash: 'hashA', source_repository: 'repo2', pattern_id: 'p1', category: 'util', language: 'js', line_count: 10, relative_path: 'lib/utils.js' }
      ];

      const duplicates = scanner._detectCrossRepoDuplicates(allCodeBlocks);

      assert.ok(duplicates[0].affected_repositories.includes('repo1'));
      assert.ok(duplicates[0].affected_repositories.includes('repo2'));
      assert.ok(duplicates[0].affected_files.includes('repo1/src/utils.js'));
    });

    it('should sort by impact score descending', () => {
      const allCodeBlocks = [
        // Low impact group
        { content_hash: 'hashA', source_repository: 'repo1', pattern_id: 'p1', category: 'util', language: 'js', line_count: 5, relative_path: 'a.js' },
        { content_hash: 'hashA', source_repository: 'repo2', pattern_id: 'p1', category: 'util', language: 'js', line_count: 5, relative_path: 'b.js' },
        // High impact group (more repos, more lines)
        { content_hash: 'hashB', source_repository: 'repo1', pattern_id: 'p1', category: 'api_handler', language: 'js', line_count: 50, relative_path: 'c.js' },
        { content_hash: 'hashB', source_repository: 'repo2', pattern_id: 'p1', category: 'api_handler', language: 'js', line_count: 50, relative_path: 'd.js' },
        { content_hash: 'hashB', source_repository: 'repo3', pattern_id: 'p1', category: 'api_handler', language: 'js', line_count: 50, relative_path: 'e.js' }
      ];

      const duplicates = scanner._detectCrossRepoDuplicates(allCodeBlocks);

      assert.strictEqual(duplicates.length, 2);
      assert.ok(duplicates[0].impact_score >= duplicates[1].impact_score);
    });
  });

  describe('_calculateCrossRepoImpactScore', () => {
    it('should calculate score based on occurrences', () => {
      const group = {
        occurrence_count: 5,
        repository_count: 2,
        total_lines: 20,
        category: 'util'
      };

      const score = scanner._calculateCrossRepoImpactScore(group);

      assert.ok(score > 0);
      assert.ok(score <= 100);
    });

    it('should give higher score for more repositories', () => {
      const smallGroup = {
        occurrence_count: 2,
        repository_count: 2,
        total_lines: 10,
        category: 'util'
      };

      const largeGroup = {
        occurrence_count: 2,
        repository_count: 5,
        total_lines: 10,
        category: 'util'
      };

      const smallScore = scanner._calculateCrossRepoImpactScore(smallGroup);
      const largeScore = scanner._calculateCrossRepoImpactScore(largeGroup);

      assert.ok(largeScore > smallScore);
    });

    it('should apply category bonuses', () => {
      const regularGroup = {
        occurrence_count: 2,
        repository_count: 2,
        total_lines: 10,
        category: 'util'
      };

      const apiHandlerGroup = {
        occurrence_count: 2,
        repository_count: 2,
        total_lines: 10,
        category: 'api_handler'
      };

      const regularScore = scanner._calculateCrossRepoImpactScore(regularGroup);
      const apiScore = scanner._calculateCrossRepoImpactScore(apiHandlerGroup);

      assert.ok(apiScore > regularScore);
    });

    it('should cap score at 100', () => {
      const hugeGroup = {
        occurrence_count: 100,
        repository_count: 10,
        total_lines: 1000,
        category: 'api_handler'
      };

      const score = scanner._calculateCrossRepoImpactScore(hugeGroup);

      assert.strictEqual(score, 100);
    });
  });

  describe('_determineCrossRepoStrategy', () => {
    it('should suggest shared_package for small groups', () => {
      const group = {
        repository_count: 2,
        occurrence_count: 5,
        category: 'util'
      };

      const strategy = scanner._determineCrossRepoStrategy(group);

      assert.strictEqual(strategy, 'shared_package');
    });

    it('should suggest mcp_server for many repositories', () => {
      const group = {
        repository_count: 5,
        occurrence_count: 10,
        category: 'util'
      };

      const strategy = scanner._determineCrossRepoStrategy(group);

      assert.strictEqual(strategy, 'mcp_server');
    });

    it('should suggest autonomous_agent for high occurrence count', () => {
      const group = {
        repository_count: 2,
        occurrence_count: 25,
        category: 'util'
      };

      const strategy = scanner._determineCrossRepoStrategy(group);

      assert.strictEqual(strategy, 'autonomous_agent');
    });
  });

  describe('_generateCrossRepoRationale', () => {
    it('should generate descriptive rationale', () => {
      const group = {
        repository_count: 3,
        occurrence_count: 8,
        category: 'validator'
      };

      const rationale = scanner._generateCrossRepoRationale(group);

      assert.ok(rationale.includes('8 occurrences'));
      assert.ok(rationale.includes('3 repositories'));
      assert.ok(rationale.includes('validator'));
    });
  });

  describe('_generateCrossRepoSuggestions', () => {
    it('should generate suggestions for cross-repo duplicates', () => {
      const crossRepoDuplicates = [
        {
          group_id: 'cross_abc123',
          content_hash: 'abc123',
          repository_count: 2,
          occurrence_count: 4,
          category: 'util',
          affected_repositories: ['repo1', 'repo2'],
          affected_files: ['repo1/a.js', 'repo2/b.js'],
          impact_score: 50
        }
      ];

      const repositoryScans = [];

      const suggestions = scanner._generateCrossRepoSuggestions(
        crossRepoDuplicates,
        repositoryScans
      );

      assert.strictEqual(suggestions.length, 1);
      assert.ok(suggestions[0].suggestion_id.startsWith('cs_'));
      assert.strictEqual(suggestions[0].duplicate_group_id, 'cross_abc123');
    });

    it('should sort suggestions by ROI descending', () => {
      const crossRepoDuplicates = [
        {
          group_id: 'cross_1',
          content_hash: '1',
          repository_count: 2,
          occurrence_count: 2,
          category: 'util',
          affected_repositories: ['repo1', 'repo2'],
          affected_files: ['repo1/a.js', 'repo2/b.js'],
          impact_score: 30
        },
        {
          group_id: 'cross_2',
          content_hash: '2',
          repository_count: 4,
          occurrence_count: 10,
          category: 'api_handler',
          affected_repositories: ['repo1', 'repo2', 'repo3', 'repo4'],
          affected_files: ['repo1/a.js', 'repo2/b.js', 'repo3/c.js', 'repo4/d.js'],
          impact_score: 80
        }
      ];

      const suggestions = scanner._generateCrossRepoSuggestions(crossRepoDuplicates, []);

      assert.ok(suggestions[0].roi_score >= suggestions[1].roi_score);
    });

    it('should include correct metadata in suggestions', () => {
      const crossRepoDuplicates = [
        {
          group_id: 'cross_xyz',
          content_hash: 'xyz',
          repository_count: 3,
          occurrence_count: 6,
          category: 'validator',
          affected_repositories: ['repo1', 'repo2', 'repo3'],
          affected_files: ['repo1/v.js', 'repo2/v.js', 'repo3/v.js'],
          impact_score: 65
        }
      ];

      const suggestions = scanner._generateCrossRepoSuggestions(crossRepoDuplicates, []);

      assert.strictEqual(suggestions[0].affected_repositories_count, 3);
      assert.strictEqual(suggestions[0].affected_files_count, 3);
      assert.ok(suggestions[0].confidence > 0);
    });
  });

  describe('_calculateInterProjectMetrics', () => {
    it('should calculate aggregate metrics', () => {
      const repositoryScans = [
        { code_blocks: [{}, {}, {}], duplicate_groups: [{}] },
        { code_blocks: [{}, {}], duplicate_groups: [] }
      ];
      const crossRepoDuplicates = [
        { repository_count: 2, occurrence_count: 4, total_lines: 20 }
      ];
      const suggestions = [{ roi_score: 50 }];

      const metrics = scanner._calculateInterProjectMetrics(
        repositoryScans,
        crossRepoDuplicates,
        suggestions
      );

      assert.ok(metrics !== undefined, 'Should return metrics object');
      assert.strictEqual(typeof metrics, 'object');
    });
  });
});

describe('InterProjectScanner - Edge Cases', () => {
  let scanner;

  beforeEach(() => {
    scanner = new InterProjectScanner();
  });

  it('should handle empty repository scans', () => {
    const aggregated = scanner._aggregateCodeBlocks([]);
    assert.deepStrictEqual(aggregated, []);
  });

  it('should handle scans with null code_blocks', () => {
    const repositoryScans = [
      { repository_name: 'repo1', code_blocks: null }
    ];

    const aggregated = scanner._aggregateCodeBlocks(repositoryScans);
    assert.deepStrictEqual(aggregated, []);
  });

  it('should handle single repository (no cross-repo duplicates)', () => {
    const allCodeBlocks = [
      { content_hash: 'hash1', source_repository: 'repo1', pattern_id: 'p1', category: 'util', language: 'js', line_count: 10, relative_path: 'a.js' }
    ];

    const duplicates = scanner._detectCrossRepoDuplicates(allCodeBlocks);
    assert.strictEqual(duplicates.length, 0);
  });

  it('should handle blocks with missing properties gracefully', () => {
    const allCodeBlocks = [
      { content_hash: 'hash1', source_repository: 'repo1' },
      { content_hash: 'hash1', source_repository: 'repo2' }
    ];

    // Should not throw
    const duplicates = scanner._detectCrossRepoDuplicates(allCodeBlocks);
    assert.strictEqual(duplicates.length, 1);
  });
});

describe('InterProjectScanner - Strategy Selection', () => {
  let scanner;

  beforeEach(() => {
    scanner = new InterProjectScanner();
  });

  it('should select shared_package for 2-3 repos with few occurrences', () => {
    const group = { repository_count: 3, occurrence_count: 8, category: 'util' };
    assert.strictEqual(scanner._determineCrossRepoStrategy(group), 'shared_package');
  });

  it('should select mcp_server for 4+ repos', () => {
    const group = { repository_count: 4, occurrence_count: 5, category: 'util' };
    assert.strictEqual(scanner._determineCrossRepoStrategy(group), 'mcp_server');
  });

  it('should select autonomous_agent for 20+ occurrences', () => {
    const group = { repository_count: 2, occurrence_count: 20, category: 'util' };
    assert.strictEqual(scanner._determineCrossRepoStrategy(group), 'autonomous_agent');
  });
});

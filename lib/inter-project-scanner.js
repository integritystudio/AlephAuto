/**
 * Inter-Project Scanner
 *
 * Scans multiple repositories to detect duplicate code patterns across projects.
 * Identifies candidates for shared abstractions (packages, MCP servers, etc.).
 */

import { ScanOrchestrator } from './scan-orchestrator.js';
import { createComponentLogger } from '../sidequest/utils/logger.js';
import path from 'path';
import fs from 'fs/promises';

const logger = createComponentLogger('InterProjectScanner');

/**
 * Scanner for detecting duplicates across multiple repositories
 */
export class InterProjectScanner {
  constructor(config = {}) {
    this.orchestrator = new ScanOrchestrator(config.orchestrator || {});
    this.outputDir = config.outputDir || path.join(process.cwd(), 'output', 'inter-project-scans');
  }

  /**
   * Scan multiple repositories and detect cross-project duplicates
   *
   * @param {string[]} repoPaths - Array of repository paths to scan
   * @param {Object} scanConfig - Scan configuration
   * @returns {Promise<Object>} - Inter-project scan results
   */
  async scanRepositories(repoPaths, scanConfig = {}) {
    const startTime = Date.now();

    logger.info({
      repositoryCount: repoPaths.length,
      repositories: repoPaths
    }, 'Starting inter-project scan');

    try {
      // Stage 1: Scan each repository individually
      logger.info('Stage 1: Scanning individual repositories');
      const repositoryScans = [];

      for (const repoPath of repoPaths) {
        try {
          logger.info({ repoPath }, 'Scanning repository');
          const scanResult = await this.orchestrator.scanRepository(repoPath, scanConfig);

          repositoryScans.push({
            repository_path: repoPath,
            repository_name: path.basename(repoPath),
            scan_result: scanResult,
            code_blocks: scanResult.code_blocks || [],
            duplicate_groups: scanResult.duplicate_groups || [],
            suggestions: scanResult.suggestions || []
          });

          logger.info({
            repoPath,
            blocks: scanResult.code_blocks?.length || 0,
            groups: scanResult.duplicate_groups?.length || 0
          }, 'Repository scan completed');

        } catch (error) {
          logger.warn({ repoPath, error: error.message }, 'Failed to scan repository');
          repositoryScans.push({
            repository_path: repoPath,
            repository_name: path.basename(repoPath),
            error: error.message,
            code_blocks: [],
            duplicate_groups: [],
            suggestions: []
          });
        }
      }

      // Stage 2: Aggregate code blocks across all repositories
      logger.info('Stage 2: Aggregating code blocks across repositories');
      const allCodeBlocks = this._aggregateCodeBlocks(repositoryScans);

      logger.info({
        totalBlocks: allCodeBlocks.length,
        repositories: repositoryScans.length
      }, 'Code blocks aggregated');

      // Stage 3: Detect cross-repository duplicates
      logger.info('Stage 3: Detecting cross-repository duplicates');
      const crossRepoDuplicates = this._detectCrossRepoDuplicates(allCodeBlocks);

      logger.info({
        crossRepoGroups: crossRepoDuplicates.length
      }, 'Cross-repository duplicates detected');

      // Stage 4: Generate cross-repository consolidation suggestions
      logger.info('Stage 4: Generating cross-repository suggestions');
      const crossRepoSuggestions = this._generateCrossRepoSuggestions(
        crossRepoDuplicates,
        repositoryScans
      );

      logger.info({
        suggestions: crossRepoSuggestions.length
      }, 'Cross-repository suggestions generated');

      // Stage 5: Calculate inter-project metrics
      const metrics = this._calculateInterProjectMetrics(
        repositoryScans,
        crossRepoDuplicates,
        crossRepoSuggestions
      );

      const duration = (Date.now() - startTime) / 1000;

      const result = {
        scan_type: 'inter-project',
        scanned_repositories: repositoryScans.map(r => ({
          path: r.repository_path,
          name: r.repository_name,
          code_blocks: r.code_blocks.length,
          duplicate_groups: r.duplicate_groups.length,
          error: r.error
        })),
        cross_repository_duplicates: crossRepoDuplicates,
        cross_repository_suggestions: crossRepoSuggestions,
        repository_scans: repositoryScans,
        metrics,
        scan_metadata: {
          duration_seconds: duration,
          scanned_at: new Date().toISOString(),
          repository_count: repoPaths.length,
          total_code_blocks: allCodeBlocks.length
        }
      };

      logger.info({
        duration,
        repositories: repoPaths.length,
        crossRepoGroups: crossRepoDuplicates.length,
        suggestions: crossRepoSuggestions.length
      }, 'Inter-project scan completed');

      return result;

    } catch (error) {
      logger.error({ error }, 'Inter-project scan failed');
      throw error;
    }
  }

  /**
   * Aggregate code blocks from all repository scans
   *
   * @private
   */
  _aggregateCodeBlocks(repositoryScans) {
    const allBlocks = [];

    for (const repoScan of repositoryScans) {
      if (!repoScan.code_blocks) continue;

      for (const block of repoScan.code_blocks) {
        // Add repository context to each block
        allBlocks.push({
          ...block,
          source_repository: repoScan.repository_name,
          source_repository_path: repoScan.repository_path
        });
      }
    }

    return allBlocks;
  }

  /**
   * Detect duplicates that span multiple repositories
   *
   * @private
   */
  _detectCrossRepoDuplicates(allCodeBlocks) {
    // Group by content hash (exact matches across repos)
    const hashGroups = {};

    for (const block of allCodeBlocks) {
      const hash = block.content_hash;
      if (!hashGroups[hash]) {
        hashGroups[hash] = [];
      }
      hashGroups[hash].push(block);
    }

    // Filter for groups that span multiple repositories
    const crossRepoGroups = [];

    for (const [hash, blocks] of Object.entries(hashGroups)) {
      if (blocks.length < 2) continue;

      // Get unique repositories
      const repositories = new Set(blocks.map(b => b.source_repository));

      // Only include if it spans multiple repositories
      if (repositories.size >= 2) {
        const group = {
          group_id: `cross_${hash.substring(0, 12)}`,
          pattern_id: blocks[0].pattern_id,
          content_hash: hash,
          member_blocks: blocks,
          occurrence_count: blocks.length,
          repository_count: repositories.size,
          affected_repositories: Array.from(repositories),
          affected_files: blocks.map(b => `${b.source_repository}/${b.relative_path}`),
          category: blocks[0].category,
          language: blocks[0].language,
          total_lines: blocks.reduce((sum, b) => sum + b.line_count, 0),
          similarity_score: 1.0, // Exact matches
          similarity_method: 'exact_match'
        };

        // Calculate impact score
        group.impact_score = this._calculateCrossRepoImpactScore(group);

        crossRepoGroups.push(group);
      }
    }

    // Sort by impact score descending
    crossRepoGroups.sort((a, b) => b.impact_score - a.impact_score);

    return crossRepoGroups;
  }

  /**
   * Calculate impact score for cross-repository duplicate
   *
   * @private
   */
  _calculateCrossRepoImpactScore(group) {
    // Base score from occurrence count and repository count
    let score = 0;

    // More occurrences = higher impact
    score += Math.min(group.occurrence_count * 5, 40);

    // More repositories = much higher impact (shared code is valuable)
    score += group.repository_count * 15;

    // More lines = higher impact
    score += Math.min(group.total_lines / 2, 20);

    // Bonus for high-value categories
    const categoryBonuses = {
      'api_handler': 10,
      'auth_check': 10,
      'database_operation': 8,
      'validator': 8,
      'error_handler': 6
    };
    score += categoryBonuses[group.category] || 0;

    return Math.min(score, 100);
  }

  /**
   * Generate consolidation suggestions for cross-repository duplicates
   *
   * @private
   */
  _generateCrossRepoSuggestions(crossRepoDuplicates, repositoryScans) {
    const suggestions = [];

    for (const group of crossRepoDuplicates) {
      // Cross-repo duplicates should generally be shared packages or higher
      const strategy = this._determineCrossRepoStrategy(group);
      const rationale = this._generateCrossRepoRationale(group);
      const complexity = this._assessComplexity(group);
      const risk = this._assessRisk(group, strategy);

      const suggestion = {
        suggestion_id: `cs_${group.group_id}`,
        duplicate_group_id: group.group_id,
        strategy,
        strategy_rationale: rationale,
        target_location: this._suggestCrossRepoLocation(group, strategy),
        impact_score: group.impact_score,
        complexity,
        migration_risk: risk,
        affected_repositories: group.affected_repositories,
        affected_repositories_count: group.repository_count,
        affected_files_count: group.affected_files.length,
        breaking_changes: strategy !== 'shared_package',
        confidence: 0.9,
        roi_score: this._calculateCrossRepoROI(group, complexity, risk)
      };

      suggestions.push(suggestion);
    }

    // Sort by ROI descending
    suggestions.sort((a, b) => b.roi_score - a.roi_score);

    return suggestions;
  }

  /**
   * Determine consolidation strategy for cross-repo duplicate
   *
   * @private
   */
  _determineCrossRepoStrategy(group) {
    const repoCount = group.repository_count;
    const occurrences = group.occurrence_count;
    const category = group.category;

    // 2-3 repos: shared package
    if (repoCount <= 3 && occurrences <= 10) {
      return 'shared_package';
    }

    // Many repos or complex logic: MCP server
    if (repoCount >= 4 || category in ['api_handler', 'database_operation']) {
      return 'mcp_server';
    }

    // High complexity cross-language: autonomous agent
    if (occurrences >= 20) {
      return 'autonomous_agent';
    }

    return 'shared_package';
  }

  /**
   * Generate rationale for cross-repo suggestion
   *
   * @private
   */
  _generateCrossRepoRationale(group) {
    const repos = group.repository_count;
    const occurrences = group.occurrence_count;
    const category = group.category;

    return `Found ${occurrences} occurrences across ${repos} repositories. ` +
           `Category: ${category}. Strong candidate for shared abstraction to ` +
           `eliminate duplication and ensure consistency across projects.`;
  }

  /**
   * Assess complexity of cross-repo consolidation
   *
   * @private
   */
  _assessComplexity(group) {
    const repoCount = group.repository_count;

    if (repoCount === 2) return 'simple';
    if (repoCount === 3) return 'moderate';
    return 'complex';
  }

  /**
   * Assess risk of cross-repo consolidation
   *
   * @private
   */
  _assessRisk(group, strategy) {
    if (strategy === 'shared_package') return 'medium';
    if (strategy === 'mcp_server') return 'high';
    return 'high';
  }

  /**
   * Suggest target location for cross-repo consolidation
   *
   * @private
   */
  _suggestCrossRepoLocation(group, strategy) {
    const category = group.category;

    if (strategy === 'shared_package') {
      const categoryPaths = {
        'logger': '@shared/logging',
        'config_access': '@shared/config',
        'api_handler': '@shared/api-middleware',
        'auth_check': '@shared/auth',
        'database_operation': '@shared/database',
        'validator': '@shared/validation',
        'error_handler': '@shared/errors'
      };

      return categoryPaths[category] || `@shared/${category}`;
    }

    if (strategy === 'mcp_server') {
      return `mcp-servers/${group.pattern_id}-server`;
    }

    return `agents/${group.pattern_id}-agent`;
  }

  /**
   * Calculate ROI for cross-repo consolidation
   *
   * @private
   */
  _calculateCrossRepoROI(group, complexity, risk) {
    let roi = group.impact_score;

    // Cross-repo consolidation has high value
    roi *= 1.2;

    // Adjust for complexity
    const complexityMultipliers = {
      'simple': 1.1,
      'moderate': 1.0,
      'complex': 0.8
    };
    roi *= complexityMultipliers[complexity] || 1.0;

    // Adjust for risk
    const riskMultipliers = {
      'low': 1.1,
      'medium': 1.0,
      'high': 0.8
    };
    roi *= riskMultipliers[risk] || 1.0;

    return Math.min(roi, 100);
  }

  /**
   * Calculate inter-project metrics
   *
   * @private
   */
  _calculateInterProjectMetrics(repositoryScans, crossRepoDuplicates, suggestions) {
    const totalCodeBlocks = repositoryScans.reduce(
      (sum, r) => sum + r.code_blocks.length, 0
    );

    const totalIntraProjectGroups = repositoryScans.reduce(
      (sum, r) => sum + r.duplicate_groups.length, 0
    );

    const crossRepoOccurrences = crossRepoDuplicates.reduce(
      (sum, g) => sum + g.occurrence_count, 0
    );

    const crossRepoLines = crossRepoDuplicates.reduce(
      (sum, g) => sum + g.total_lines, 0
    );

    return {
      total_repositories_scanned: repositoryScans.length,
      total_code_blocks: totalCodeBlocks,
      total_intra_project_groups: totalIntraProjectGroups,
      total_cross_repository_groups: crossRepoDuplicates.length,
      cross_repository_occurrences: crossRepoOccurrences,
      cross_repository_duplicated_lines: crossRepoLines,
      total_suggestions: suggestions.length,
      shared_package_candidates: suggestions.filter(s => s.strategy === 'shared_package').length,
      mcp_server_candidates: suggestions.filter(s => s.strategy === 'mcp_server').length,
      average_repositories_per_duplicate: crossRepoDuplicates.length > 0
        ? (crossRepoDuplicates.reduce((sum, g) => sum + g.repository_count, 0) / crossRepoDuplicates.length).toFixed(1)
        : 0
    };
  }

  /**
   * Save inter-project scan results to file
   *
   * @param {Object} results - Scan results
   * @param {string} filename - Output filename
   */
  async saveResults(results, filename = 'inter-project-scan.json') {
    await fs.mkdir(this.outputDir, { recursive: true });
    const outputPath = path.join(this.outputDir, filename);
    await fs.writeFile(outputPath, JSON.stringify(results, null, 2));
    logger.info({ outputPath }, 'Scan results saved');
    return outputPath;
  }
}

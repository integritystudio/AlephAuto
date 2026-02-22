/**
 * Inter-Project Scanner
 *
 * Scans multiple repositories to detect duplicate code patterns across projects.
 * Identifies candidates for shared abstractions (packages, MCP servers, etc.).
 */

import { ScanOrchestrator, ScanResult, CodeBlock, DuplicateGroup, ConsolidationSuggestion } from './scan-orchestrator.ts';
import { createComponentLogger, logError, logStart, logStage } from '../utils/logger.ts';
import path from 'path';
import fs from 'fs/promises';

const logger = createComponentLogger('InterProjectScanner');

// ============================================================================
// Type Definitions
// ============================================================================

export type CrossRepoStrategy = 'shared_package' | 'mcp_server' | 'autonomous_agent';
export type Complexity = 'simple' | 'moderate' | 'complex';
export type MigrationRisk = 'low' | 'medium' | 'high';
export type CategoryBonus = 'api_handler' | 'auth_check' | 'database_operation' | 'validator' | 'error_handler';

export interface CodeBlockWithSource {
  // CodeBlock fields (from ScanOrchestrator)
  block_id?: string;
  file_path?: string;
  line_start?: number;
  line_end?: number;
  source_code?: string;
  tags?: string[];
  // Extended fields for cross-repo tracking
  source_repository: string;
  source_repository_path: string;
  content_hash: string;
  pattern_id?: string;
  relative_path?: string;
  line_count?: number;
  category?: string;
  language?: string;
  semantic_category?: string;
  [key: string]: unknown;
}

export interface RepositoryScanEntry {
  repository_path: string;
  repository_name: string;
  scan_result?: ScanResult;
  code_blocks: CodeBlock[];
  duplicate_groups: DuplicateGroup[];
  suggestions: ConsolidationSuggestion[];
  error?: string;
}

export interface CrossRepoDuplicateGroup {
  group_id: string;
  pattern_id?: string;
  content_hash: string;
  member_blocks: CodeBlockWithSource[];
  occurrence_count: number;
  repository_count: number;
  affected_repositories: string[];
  affected_files: string[];
  category?: string;
  language?: string;
  total_lines: number;
  similarity_score: number;
  similarity_method: string;
  impact_score: number;
}

export interface CrossRepoSuggestion {
  suggestion_id: string;
  duplicate_group_id: string;
  strategy: CrossRepoStrategy;
  strategy_rationale: string;
  target_location: string;
  impact_score: number;
  complexity: Complexity;
  migration_risk: MigrationRisk;
  affected_repositories: string[];
  affected_repositories_count: number;
  affected_files_count: number;
  breaking_changes: boolean;
  confidence: number;
  roi_score: number;
}

export interface InterProjectMetrics {
  total_repositories_scanned: number;
  total_code_blocks: number;
  total_intra_project_groups: number;
  total_cross_repository_groups: number;
  cross_repository_occurrences: number;
  cross_repository_duplicated_lines: number;
  total_suggestions: number;
  shared_package_candidates: number;
  mcp_server_candidates: number;
  average_repositories_per_duplicate: number | string;
}

export interface ScannedRepositorySummary {
  path: string;
  name: string;
  code_blocks: number;
  duplicate_groups: number;
  error?: string;
}

export interface InterProjectScanResult {
  scan_type: 'inter-project';
  scanned_repositories: ScannedRepositorySummary[];
  cross_repository_duplicates: CrossRepoDuplicateGroup[];
  cross_repository_suggestions: CrossRepoSuggestion[];
  repository_scans: RepositoryScanEntry[];
  metrics: InterProjectMetrics;
  scan_metadata: {
    duration_seconds: number;
    scanned_at: string;
    repository_count: number;
    total_code_blocks: number;
  };
}

export interface InterProjectScannerConfig {
  orchestrator?: Record<string, unknown>;
  outputDir?: string;
}

export interface InterProjectScanConfig {
  [key: string]: unknown;
}

const CATEGORY_BONUSES: Partial<Record<string, number>> = {
  api_handler: 10,
  auth_check: 10,
  database_operation: 8,
  validator: 8,
  error_handler: 6
} as const;

const CATEGORY_PATHS: Partial<Record<string, string>> = {
  logger: '@shared/logging',
  config_access: '@shared/config',
  api_handler: '@shared/api-middleware',
  auth_check: '@shared/auth',
  database_operation: '@shared/database',
  validator: '@shared/validation',
  error_handler: '@shared/errors'
} as const;

const COMPLEXITY_MULTIPLIERS: Record<Complexity, number> = {
  simple: 1.1,
  moderate: 1.0,
  complex: 0.8
} as const;

const RISK_MULTIPLIERS: Record<MigrationRisk, number> = {
  low: 1.1,
  medium: 1.0,
  high: 0.8
} as const;

/**
 * Scanner for detecting duplicates across multiple repositories
 */
export class InterProjectScanner {
  private orchestrator: ScanOrchestrator;
  private outputDir: string;

  constructor(config: InterProjectScannerConfig = {}) {
    this.orchestrator = new ScanOrchestrator(config.orchestrator ?? {});
    this.outputDir = config.outputDir ?? path.join(process.cwd(), 'output', 'inter-project-scans');
  }

  /**
   * Scan multiple repositories and detect cross-project duplicates
   */
  async scanRepositories(
    repoPaths: string[],
    scanConfig: InterProjectScanConfig = {}
  ): Promise<InterProjectScanResult> {
    const startTime = Date.now();

    logStart(logger, 'inter-project scan', {
      repositoryCount: repoPaths.length,
      repositories: repoPaths
    });

    try {
      // Stage 1: Scan each repository individually
      logStage(logger, '1/4: Scanning individual repositories');
      const repositoryScans: RepositoryScanEntry[] = [];

      for (const repoPath of repoPaths) {
        try {
          logger.info({ repoPath }, 'Scanning repository');
          const scanResult = await this.orchestrator.scanRepository(repoPath, scanConfig);

          repositoryScans.push({
            repository_path: repoPath,
            repository_name: path.basename(repoPath),
            scan_result: scanResult,
            code_blocks: scanResult.code_blocks ?? [],
            duplicate_groups: scanResult.duplicate_groups ?? [],
            suggestions: scanResult.suggestions ?? []
          });

          logger.info({
            repoPath,
            blocks: scanResult.code_blocks?.length ?? 0,
            groups: scanResult.duplicate_groups?.length ?? 0
          }, 'Repository scan completed');

        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          logger.warn({ repoPath, error: msg }, 'Failed to scan repository');
          repositoryScans.push({
            repository_path: repoPath,
            repository_name: path.basename(repoPath),
            error: msg,
            code_blocks: [],
            duplicate_groups: [],
            suggestions: []
          });
        }
      }

      // Stage 2: Aggregate code blocks across all repositories
      logStage(logger, '2/4: Aggregating code blocks across repositories');
      const allCodeBlocks = this._aggregateCodeBlocks(repositoryScans);

      logger.info({
        totalBlocks: allCodeBlocks.length,
        repositories: repositoryScans.length
      }, 'Code blocks aggregated');

      // Stage 3: Detect cross-repository duplicates
      logStage(logger, '3/4: Detecting cross-repository duplicates');
      const crossRepoDuplicates = this._detectCrossRepoDuplicates(allCodeBlocks);

      logger.info({
        crossRepoGroups: crossRepoDuplicates.length
      }, 'Cross-repository duplicates detected');

      // Stage 4: Generate cross-repository consolidation suggestions
      logStage(logger, '4/4: Generating cross-repository suggestions');
      const crossRepoSuggestions = this._generateCrossRepoSuggestions(
        crossRepoDuplicates,
        repositoryScans
      );

      logger.info({
        suggestions: crossRepoSuggestions.length
      }, 'Cross-repository suggestions generated');

      // Calculate inter-project metrics
      const metrics = this._calculateInterProjectMetrics(
        repositoryScans,
        crossRepoDuplicates,
        crossRepoSuggestions
      );

      const duration = (Date.now() - startTime) / 1000;

      const result: InterProjectScanResult = {
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
      logError(logger, error, 'Inter-project scan failed');
      throw error;
    }
  }

  /**
   * Aggregate code blocks from all repository scans
   */
  private _aggregateCodeBlocks(repositoryScans: RepositoryScanEntry[]): CodeBlockWithSource[] {
    const allBlocks: CodeBlockWithSource[] = [];

    for (const repoScan of repositoryScans) {
      if (!repoScan.code_blocks) continue;

      for (const block of repoScan.code_blocks) {
        allBlocks.push({
          ...(block as unknown as Record<string, unknown>),
          source_repository: repoScan.repository_name,
          source_repository_path: repoScan.repository_path
        } as CodeBlockWithSource);
      }
    }

    return allBlocks;
  }

  /**
   * Detect duplicates that span multiple repositories
   */
  private _detectCrossRepoDuplicates(allCodeBlocks: CodeBlockWithSource[]): CrossRepoDuplicateGroup[] {
    const hashGroups: Record<string, CodeBlockWithSource[]> = {};

    for (const block of allCodeBlocks) {
      const hash = block.content_hash;
      if (!hash) continue;
      if (!hashGroups[hash]) {
        hashGroups[hash] = [];
      }
      hashGroups[hash].push(block);
    }

    const crossRepoGroups: CrossRepoDuplicateGroup[] = [];

    for (const [hash, blocks] of Object.entries(hashGroups)) {
      if (blocks.length < 2) continue;

      const repositories = new Set(blocks.map(b => b.source_repository));

      if (repositories.size >= 2) {
        const firstBlock = blocks[0];
        const group: Omit<CrossRepoDuplicateGroup, 'impact_score'> = {
          group_id: `cross_${hash.substring(0, 12)}`,
          pattern_id: firstBlock.pattern_id,
          content_hash: hash,
          member_blocks: blocks,
          occurrence_count: blocks.length,
          repository_count: repositories.size,
          affected_repositories: Array.from(repositories),
          affected_files: blocks.map(b => `${b.source_repository}/${b.relative_path ?? ''}`),
          category: firstBlock.category,
          language: firstBlock.language,
          total_lines: blocks.reduce((sum, b) => sum + (b.line_count ?? 0), 0),
          similarity_score: 1.0,
          similarity_method: 'exact_match'
        };

        const fullGroup: CrossRepoDuplicateGroup = {
          ...group,
          impact_score: this._calculateCrossRepoImpactScore(group as CrossRepoDuplicateGroup)
        };

        crossRepoGroups.push(fullGroup);
      }
    }

    crossRepoGroups.sort((a, b) => b.impact_score - a.impact_score);

    return crossRepoGroups;
  }

  /**
   * Calculate impact score for cross-repository duplicate
   */
  private _calculateCrossRepoImpactScore(group: CrossRepoDuplicateGroup): number {
    let score = 0;

    score += Math.min(group.occurrence_count * 5, 40);
    score += group.repository_count * 15;
    score += Math.min(group.total_lines / 2, 20);

    score += CATEGORY_BONUSES[group.category ?? ''] ?? 0;

    return Math.min(score, 100);
  }

  /**
   * Generate consolidation suggestions for cross-repository duplicates
   */
  private _generateCrossRepoSuggestions(
    crossRepoDuplicates: CrossRepoDuplicateGroup[],
    _repositoryScans: RepositoryScanEntry[]
  ): CrossRepoSuggestion[] {
    const suggestions: CrossRepoSuggestion[] = [];

    for (const group of crossRepoDuplicates) {
      const strategy = this._determineCrossRepoStrategy(group);
      const rationale = this._generateCrossRepoRationale(group);
      const complexity = this._assessComplexity(group);
      const risk = this._assessRisk(strategy);

      const suggestion: CrossRepoSuggestion = {
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

    suggestions.sort((a, b) => b.roi_score - a.roi_score);

    return suggestions;
  }

  /**
   * Determine consolidation strategy for cross-repo duplicate
   */
  private _determineCrossRepoStrategy(group: CrossRepoDuplicateGroup): CrossRepoStrategy {
    const repoCount = group.repository_count;
    const occurrences = group.occurrence_count;
    const category = group.category ?? '';

    if (repoCount <= 3 && occurrences <= 10) {
      return 'shared_package';
    }

    if (repoCount >= 4 || category === 'api_handler' || category === 'database_operation') {
      return 'mcp_server';
    }

    if (occurrences >= 20) {
      return 'autonomous_agent';
    }

    return 'shared_package';
  }

  /**
   * Generate rationale for cross-repo suggestion
   */
  private _generateCrossRepoRationale(group: CrossRepoDuplicateGroup): string {
    const repos = group.repository_count;
    const occurrences = group.occurrence_count;
    const category = group.category ?? 'unknown';

    return `Found ${occurrences} occurrences across ${repos} repositories. ` +
           `Category: ${category}. Strong candidate for shared abstraction to ` +
           `eliminate duplication and ensure consistency across projects.`;
  }

  /**
   * Assess complexity of cross-repo consolidation
   */
  private _assessComplexity(group: CrossRepoDuplicateGroup): Complexity {
    const repoCount = group.repository_count;

    if (repoCount === 2) return 'simple';
    if (repoCount === 3) return 'moderate';
    return 'complex';
  }

  /**
   * Assess risk of cross-repo consolidation
   */
  private _assessRisk(strategy: CrossRepoStrategy): MigrationRisk {
    if (strategy === 'shared_package') return 'medium';
    return 'high';
  }

  /**
   * Suggest target location for cross-repo consolidation
   */
  private _suggestCrossRepoLocation(group: CrossRepoDuplicateGroup, strategy: CrossRepoStrategy): string {
    const category = group.category ?? '';

    if (strategy === 'shared_package') {
      return CATEGORY_PATHS[category] ?? `@shared/${category}`;
    }

    if (strategy === 'mcp_server') {
      return `mcp-servers/${group.pattern_id ?? category}-server`;
    }

    return `agents/${group.pattern_id ?? category}-agent`;
  }

  /**
   * Calculate ROI for cross-repo consolidation
   */
  private _calculateCrossRepoROI(
    group: CrossRepoDuplicateGroup,
    complexity: Complexity,
    risk: MigrationRisk
  ): number {
    let roi = group.impact_score;

    roi *= 1.2;
    roi *= COMPLEXITY_MULTIPLIERS[complexity];
    roi *= RISK_MULTIPLIERS[risk];

    return Math.min(roi, 100);
  }

  /**
   * Calculate inter-project metrics
   */
  private _calculateInterProjectMetrics(
    repositoryScans: RepositoryScanEntry[],
    crossRepoDuplicates: CrossRepoDuplicateGroup[],
    suggestions: CrossRepoSuggestion[]
  ): InterProjectMetrics {
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
   */
  async saveResults(results: InterProjectScanResult, filename = 'inter-project-scan.json'): Promise<string> {
    await fs.mkdir(this.outputDir, { recursive: true });
    const outputPath = path.join(this.outputDir, filename);
    await fs.writeFile(outputPath, JSON.stringify(results, null, 2));
    logger.info({ outputPath }, 'Scan results saved');
    return outputPath;
  }
}

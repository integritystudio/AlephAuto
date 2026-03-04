/**
 * JSON Report Generator
 *
 * Generates structured JSON exports of duplicate detection scan results.
 * Suitable for programmatic consumption, API integration, and data analysis.
 */

import { saveGeneratedReport } from '../utils/index.ts';
import type { MigrationStep } from '../types/migration-types.ts';

export interface ScanMetadata {
  repository_count?: number;
  scanned_at?: string;
  duration_seconds?: number;
  total_code_blocks?: number;
}

export interface RepositoryInfo {
  name?: string;
  path?: string;
  total_files?: number;
  languages?: string[];
}

export interface ScannedRepository {
  name: string;
  code_blocks?: number;
  duplicate_groups?: number;
  error?: string;
}

export interface MemberBlock {
  source_code?: string;
}

export interface DuplicateGroup {
  group_id: string;
  pattern_id: string;
  category: string;
  language: string;
  occurrence_count: number;
  total_lines: number;
  impact_score: number;
  similarity_score: number;
  similarity_method: string;
  member_block_ids?: string[];
  affected_files?: string[];
  repository_count?: number;
  affected_repositories?: string[];
  member_blocks?: MemberBlock[];
}

export type { MigrationStep };

export interface Suggestion {
  suggestion_id: string;
  duplicate_group_id: string;
  strategy: string;
  target_location: string;
  impact_score: number;
  roi_score: number;
  complexity: string;
  migration_risk: string;
  estimated_effort_hours?: number;
  breaking_changes?: boolean;
  confidence?: number;
  strategy_rationale?: string;
  affected_repositories?: string[];
  affected_repositories_count?: number;
  affected_files_count?: number;
  migration_steps?: MigrationStep[];
}

export interface CodeBlock {
  block_id: string;
  pattern_id: string;
  category: string;
  language: string;
  line_count: number;
  location?: {
    file_path?: string;
    line_start?: number;
    line_end?: number;
  };
  relative_path?: string;
  content_hash?: string;
  semantic_tags?: string[];
  source_code?: string;
}

export interface RepositoryScan {
  repository_name: string;
  repository_path: string;
  code_blocks?: CodeBlock[];
  duplicate_groups?: DuplicateGroup[];
  suggestions?: Suggestion[];
  error?: string;
}

export interface ScanResult {
  scan_type?: string;
  scan_metadata?: ScanMetadata;
  repository_info?: RepositoryInfo;
  metrics?: Record<string, number>;
  duplicate_groups?: DuplicateGroup[];
  suggestions?: Suggestion[];
  cross_repository_duplicates?: DuplicateGroup[];
  cross_repository_suggestions?: Suggestion[];
  scanned_repositories?: ScannedRepository[];
  repository_scans?: RepositoryScan[];
  code_blocks?: CodeBlock[];
}

export interface JSONReportOptions {
  includeSourceCode?: boolean;
  includeCodeBlocks?: boolean;
  maxDuplicates?: number | null;
  maxSuggestions?: number | null;
  prettyPrint?: boolean;
}

export interface StrategyDistribution {
  local_util: number;
  shared_package: number;
  mcp_server: number;
  autonomous_agent: number;
}

export interface ComplexityDistribution {
  trivial: number;
  simple: number;
  moderate: number;
  complex: number;
}

export interface ROIStatistics {
  average: number;
  min: number;
  max: number;
}

export interface ReportSummary {
  total_duplicate_groups: number;
  total_suggestions: number;
  repositories_scanned?: number;
  cross_repo_duplicates?: number;
  top_impact_score?: number;
  code_blocks_detected?: number;
  exact_duplicates?: number;
  structural_duplicates?: number;
  duplicated_lines?: number;
  potential_loc_reduction?: number;
  quick_wins?: number;
  strategy_distribution: StrategyDistribution;
  complexity_distribution: ComplexityDistribution;
  roi_statistics?: ROIStatistics;
}

/**
 * Generate JSON reports from scan results
 */
export class JSONReportGenerator {
  /**
   * Generate a complete JSON report
   */
  static generateReport(scanResult: ScanResult, options: JSONReportOptions = {}): Record<string, unknown> {
    const includeSourceCode = options.includeSourceCode !== false;
    const includeCodeBlocks = options.includeCodeBlocks !== false;
    const maxDuplicates = options.maxDuplicates ?? null;
    const maxSuggestions = options.maxSuggestions ?? null;
    const isInterProject = scanResult.scan_type === 'inter-project';

    const report: Record<string, unknown> = {
      report_version: '1.0.0',
      generated_at: new Date().toISOString(),
      scan_type: isInterProject ? 'inter-project' : 'intra-project',
      metadata: this._generateMetadata(scanResult, isInterProject),
      metrics: scanResult.metrics ?? {},
      summary: this._generateSummary(scanResult, isInterProject),
      duplicate_groups: this._formatDuplicateGroups(
        scanResult,
        isInterProject,
        maxDuplicates,
        includeSourceCode
      ),
      suggestions: this._formatSuggestions(
        scanResult,
        isInterProject,
        maxSuggestions
      )
    };

    // Include repository information for inter-project scans
    if (isInterProject) {
      report.scanned_repositories = scanResult.scanned_repositories ?? [];
      report.repository_scans = this._formatRepositoryScans(
        scanResult,
        includeCodeBlocks,
        includeSourceCode
      );
    } else {
      report.repository_info = scanResult.repository_info ?? {};
    }

    // Optionally include code blocks
    if (includeCodeBlocks) {
      report.code_blocks = this._formatCodeBlocks(
        scanResult,
        includeSourceCode
      );
    }

    return report;
  }

  /**
   * Generate a concise summary (minimal data)
   */
  static generateSummary(scanResult: ScanResult): Record<string, unknown> {
    const isInterProject = scanResult.scan_type === 'inter-project';
    const metrics = scanResult.metrics ?? {};

    return {
      scan_type: isInterProject ? 'inter-project' : 'intra-project',
      generated_at: new Date().toISOString(),
      summary: this._generateSummary(scanResult, isInterProject),
      metrics: {
        ...(isInterProject ? {
          repositories_scanned: metrics.total_repositories_scanned ?? 0,
          total_code_blocks: metrics.total_code_blocks ?? 0,
          cross_repo_duplicates: metrics.total_cross_repository_groups ?? 0,
          cross_repo_duplicated_lines: metrics.cross_repository_duplicated_lines ?? 0,
          total_suggestions: metrics.total_suggestions ?? 0,
          shared_package_candidates: metrics.shared_package_candidates ?? 0,
          mcp_server_candidates: metrics.mcp_server_candidates ?? 0
        } : {
          code_blocks: metrics.total_code_blocks ?? 0,
          duplicate_groups: metrics.total_duplicate_groups ?? 0,
          duplicated_lines: metrics.total_duplicated_lines ?? 0,
          potential_loc_reduction: metrics.potential_loc_reduction ?? 0,
          total_suggestions: metrics.total_suggestions ?? 0,
          quick_wins: metrics.quick_wins ?? 0
        })
      }
    };
  }

  /**
   * Save JSON report to file
   */
  static async saveReport(scanResult: ScanResult, outputPath: string, options: JSONReportOptions = {}): Promise<string> {
    const report = this.generateReport(scanResult, options);
    const json = options.prettyPrint !== false ? JSON.stringify(report, null, 2) : JSON.stringify(report);
    return saveGeneratedReport(outputPath, json);
  }

  /**
   * Save concise summary to file
   */
  static async saveSummary(scanResult: ScanResult, outputPath: string): Promise<string> {
    return saveGeneratedReport(outputPath, JSON.stringify(this.generateSummary(scanResult), null, 2));
  }

  // Private helper methods

  /**
   * Generate metadata section
   * @private
   */
  private static _generateMetadata(scanResult: ScanResult, isInterProject: boolean): Record<string, unknown> {
    const metadata = scanResult.scan_metadata ?? {};
    const repoInfo = scanResult.repository_info ?? {};

    return {
      ...(isInterProject ? {
        repository_count: metadata.repository_count ?? 0,
        repositories: (scanResult.scanned_repositories ?? []).map(r => r.name)
      } : {
        repository_name: repoInfo.name ?? 'Unknown',
        repository_path: repoInfo.path ?? 'Unknown',
        total_files: repoInfo.total_files ?? 0,
        languages: repoInfo.languages ?? []
      }),
      scanned_at: metadata.scanned_at ?? new Date().toISOString(),
      duration_seconds: metadata.duration_seconds ?? 0,
      scanner_version: '2.0.0'
    };
  }

  /**
   * Generate summary section
   * @private
   */
  private static _generateSummary(scanResult: ScanResult, isInterProject: boolean): ReportSummary {
    const metrics = scanResult.metrics ?? {};
    const duplicateGroups = isInterProject
      ? (scanResult.cross_repository_duplicates ?? [])
      : (scanResult.duplicate_groups ?? []);
    const suggestions = isInterProject
      ? (scanResult.cross_repository_suggestions ?? [])
      : (scanResult.suggestions ?? []);

    const summary: ReportSummary = {
      total_duplicate_groups: duplicateGroups.length,
      total_suggestions: suggestions.length,
      strategy_distribution: this._calculateStrategyDistribution(suggestions),
      complexity_distribution: this._calculateComplexityDistribution(suggestions)
    };

    if (isInterProject) {
      summary.repositories_scanned = metrics.total_repositories_scanned ?? 0;
      summary.cross_repo_duplicates = duplicateGroups.length;
      summary.top_impact_score = duplicateGroups.length > 0
        ? Math.max(...duplicateGroups.map(g => g.impact_score))
        : 0;
    } else {
      summary.code_blocks_detected = metrics.total_code_blocks ?? 0;
      summary.exact_duplicates = metrics.exact_duplicates ?? 0;
      summary.structural_duplicates = metrics.structural_duplicates ?? 0;
      summary.duplicated_lines = metrics.total_duplicated_lines ?? 0;
      summary.potential_loc_reduction = metrics.potential_loc_reduction ?? 0;
      summary.quick_wins = metrics.quick_wins ?? 0;
    }

    // ROI statistics
    if (suggestions.length > 0) {
      const roiScores = suggestions.map(s => s.roi_score);
      summary.roi_statistics = {
        average: roiScores.reduce((a, b) => a + b, 0) / roiScores.length,
        min: Math.min(...roiScores),
        max: Math.max(...roiScores)
      };
    }

    return summary;
  }

  /**
   * Format duplicate groups
   * @private
   */
  private static _formatDuplicateGroups(
    scanResult: ScanResult,
    isInterProject: boolean,
    maxGroups: number | null,
    includeSourceCode: boolean
  ): Record<string, unknown>[] {
    const groups = isInterProject
      ? (scanResult.cross_repository_duplicates ?? [])
      : (scanResult.duplicate_groups ?? []);

    let formattedGroups = groups
      .sort((a, b) => b.impact_score - a.impact_score)
      .map(group => ({
        group_id: group.group_id,
        pattern_id: group.pattern_id,
        category: group.category,
        language: group.language,
        occurrence_count: group.occurrence_count,
        total_lines: group.total_lines,
        impact_score: group.impact_score,
        similarity_score: group.similarity_score,
        similarity_method: group.similarity_method,
        member_block_ids: group.member_block_ids ?? [],
        affected_files: group.affected_files ?? [],
        ...(isInterProject ? {
          repository_count: group.repository_count,
          affected_repositories: group.affected_repositories ?? []
        } : {}),
        ...(includeSourceCode && group.member_blocks && group.member_blocks.length > 0 ? {
          example_code: group.member_blocks[0].source_code
        } : {})
      }));

    if (maxGroups !== null && maxGroups > 0) {
      formattedGroups = formattedGroups.slice(0, maxGroups);
    }

    return formattedGroups;
  }

  /**
   * Format suggestions
   * @private
   */
  private static _formatSuggestions(
    scanResult: ScanResult,
    isInterProject: boolean,
    maxSuggestions: number | null
  ): Record<string, unknown>[] {
    const suggestions = isInterProject
      ? (scanResult.cross_repository_suggestions ?? [])
      : (scanResult.suggestions ?? []);

    let formattedSuggestions = suggestions
      .sort((a, b) => b.roi_score - a.roi_score)
      .map(suggestion => ({
        suggestion_id: suggestion.suggestion_id,
        duplicate_group_id: suggestion.duplicate_group_id,
        strategy: suggestion.strategy,
        target_location: suggestion.target_location,
        impact_score: suggestion.impact_score,
        roi_score: suggestion.roi_score,
        complexity: suggestion.complexity,
        migration_risk: suggestion.migration_risk,
        estimated_effort_hours: suggestion.estimated_effort_hours,
        breaking_changes: suggestion.breaking_changes ?? false,
        confidence: suggestion.confidence,
        strategy_rationale: suggestion.strategy_rationale,
        ...(isInterProject ? {
          affected_repositories: suggestion.affected_repositories ?? [],
          affected_repositories_count: suggestion.affected_repositories_count ?? 0
        } : {
          affected_files_count: suggestion.affected_files_count ?? 0
        }),
        migration_steps: (suggestion.migration_steps ?? []).map(step => ({
          step_number: step.step_number,
          description: step.description,
          automated: step.automated,
          estimated_time: step.estimated_time
        }))
      }));

    if (maxSuggestions !== null && maxSuggestions > 0) {
      formattedSuggestions = formattedSuggestions.slice(0, maxSuggestions);
    }

    return formattedSuggestions;
  }

  /**
   * Format repository scans (inter-project only)
   * @private
   */
  private static _formatRepositoryScans(
    scanResult: ScanResult,
    includeCodeBlocks: boolean,
    includeSourceCode: boolean
  ): Record<string, unknown>[] {
    const repositoryScans = scanResult.repository_scans ?? [];

    return repositoryScans.map(repoScan => ({
      repository_name: repoScan.repository_name,
      repository_path: repoScan.repository_path,
      code_blocks_count: repoScan.code_blocks?.length ?? 0,
      duplicate_groups_count: repoScan.duplicate_groups?.length ?? 0,
      suggestions_count: repoScan.suggestions?.length ?? 0,
      error: repoScan.error ?? null,
      ...(includeCodeBlocks && !includeSourceCode ? {
        code_blocks: (repoScan.code_blocks ?? []).map(b => ({
          block_id: b.block_id,
          pattern_id: b.pattern_id,
          category: b.category,
          line_count: b.line_count,
          file_path: b.location?.file_path ?? b.relative_path
        }))
      } : {}),
      ...(includeCodeBlocks && includeSourceCode ? {
        code_blocks: repoScan.code_blocks ?? []
      } : {})
    }));
  }

  /**
   * Format code blocks
   * @private
   */
  private static _formatCodeBlocks(scanResult: ScanResult, includeSourceCode: boolean): Record<string, unknown>[] {
    const codeBlocks = scanResult.code_blocks ?? [];

    return codeBlocks.map(block => ({
      block_id: block.block_id,
      pattern_id: block.pattern_id,
      category: block.category,
      language: block.language,
      line_count: block.line_count,
      location: {
        file_path: block.location?.file_path ?? block.relative_path,
        line_start: block.location?.line_start,
        line_end: block.location?.line_end
      },
      content_hash: block.content_hash,
      semantic_tags: block.semantic_tags ?? [],
      ...(includeSourceCode ? {
        source_code: block.source_code
      } : {})
    }));
  }

  /**
   * Calculate strategy distribution
   * @private
   */
  private static _calculateStrategyDistribution(suggestions: Suggestion[]): StrategyDistribution {
    const distribution: StrategyDistribution = {
      local_util: 0,
      shared_package: 0,
      mcp_server: 0,
      autonomous_agent: 0
    };

    suggestions.forEach(s => {
      if (Object.prototype.hasOwnProperty.call(distribution, s.strategy)) {
        (distribution as unknown as Record<string, number>)[s.strategy]++;
      }
    });

    return distribution;
  }

  /**
   * Calculate complexity distribution
   * @private
   */
  private static _calculateComplexityDistribution(suggestions: Suggestion[]): ComplexityDistribution {
    const distribution: ComplexityDistribution = {
      trivial: 0,
      simple: 0,
      moderate: 0,
      complex: 0
    };

    suggestions.forEach(s => {
      if (Object.prototype.hasOwnProperty.call(distribution, s.complexity)) {
        (distribution as unknown as Record<string, number>)[s.complexity]++;
      }
    });

    return distribution;
  }
}

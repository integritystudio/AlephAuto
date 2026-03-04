/**
 * Markdown Report Generator
 *
 * Generates concise Markdown summaries of duplicate detection scan results.
 * Suitable for terminal viewing, GitHub README integration, and quick reviews.
 */

import { saveGeneratedReport } from '../utils/index.ts';
import type { ScanResult } from './json-report-generator.ts';

export interface MarkdownReportOptions {
  includeDetails?: boolean;
  maxDuplicates?: number;
  maxSuggestions?: number;
}

/**
 * Generate Markdown summary reports from scan results
 */
export class MarkdownReportGenerator {
  /**
   * Generate a complete Markdown report
   */
  static generateReport(scanResult: ScanResult, options: MarkdownReportOptions = {}): string {
    const includeDetails = options.includeDetails !== false;
    const maxDuplicates = options.maxDuplicates ?? 10;
    const maxSuggestions = options.maxSuggestions ?? 10;
    const isInterProject = scanResult.scan_type === 'inter-project';

    let markdown = '';

    // Header
    markdown += this._generateHeader(scanResult, isInterProject);
    markdown += '\n\n';

    // Metrics
    markdown += this._generateMetrics(scanResult, isInterProject);
    markdown += '\n\n';

    // Repository Information (inter-project only)
    if (isInterProject) {
      markdown += this._generateRepositoryInfo(scanResult);
      markdown += '\n\n';
    }

    // Top Duplicate Groups
    markdown += this._generateDuplicateGroups(scanResult, isInterProject, maxDuplicates, includeDetails);
    markdown += '\n\n';

    // Top Suggestions
    markdown += this._generateSuggestions(scanResult, isInterProject, maxSuggestions, includeDetails);
    markdown += '\n\n';

    // Footer
    markdown += this._generateFooter(scanResult);

    return markdown;
  }

  /**
   * Generate a concise summary (for quick overview)
   */
  static generateSummary(scanResult: ScanResult): string {
    const isInterProject = scanResult.scan_type === 'inter-project';
    const metrics = scanResult.metrics ?? {};

    let summary = '# Duplicate Detection Summary\n\n';

    if (isInterProject) {
      summary += `**Scanned:** ${metrics.total_repositories_scanned ?? 0} repositories\n`;
      summary += `**Code Blocks:** ${metrics.total_code_blocks ?? 0}\n`;
      summary += `**Cross-Repo Duplicates:** ${metrics.total_cross_repository_groups ?? 0}\n`;
      summary += `**Suggestions:** ${metrics.total_suggestions ?? 0}\n`;
      summary += `**Shared Package Candidates:** ${metrics.shared_package_candidates ?? 0}\n`;
      summary += `**MCP Server Candidates:** ${metrics.mcp_server_candidates ?? 0}\n`;
    } else {
      summary += `**Code Blocks:** ${metrics.total_code_blocks ?? 0}\n`;
      summary += `**Duplicate Groups:** ${metrics.total_duplicate_groups ?? 0}\n`;
      summary += `**Duplicated Lines:** ${metrics.total_duplicated_lines ?? 0}\n`;
      summary += `**Suggestions:** ${metrics.total_suggestions ?? 0}\n`;
      summary += `**Quick Wins:** ${metrics.quick_wins ?? 0}\n`;
    }

    return summary;
  }

  /**
   * Save Markdown report to file
   */
  static async saveReport(scanResult: ScanResult, outputPath: string, options: MarkdownReportOptions = {}): Promise<string> {
    return saveGeneratedReport(outputPath, this.generateReport(scanResult, options));
  }

  /**
   * Save concise summary to file
   */
  static async saveSummary(scanResult: ScanResult, outputPath: string): Promise<string> {
    return saveGeneratedReport(outputPath, this.generateSummary(scanResult));
  }

  // Private helper methods

  /**
   * Generate report header
   * @private
   */
  private static _generateHeader(scanResult: ScanResult, isInterProject: boolean): string {
    const metadata = scanResult.scan_metadata ?? {};
    const repoInfo = scanResult.repository_info ?? {};
    const scanType = isInterProject ? 'Inter-Project' : 'Intra-Project';

    let header = `# ${scanType} Duplicate Detection Report\n\n`;

    if (isInterProject) {
      header += `**Repositories:** ${metadata.repository_count ?? 0}\n`;
    } else {
      header += `**Repository:** ${repoInfo.name ?? 'Unknown'}\n`;
      header += `**Path:** \`${repoInfo.path ?? 'Unknown'}\`\n`;
    }

    header += `**Scanned:** ${new Date(metadata.scanned_at ?? Date.now()).toLocaleString()}\n`;
    header += `**Duration:** ${metadata.duration_seconds?.toFixed(2) ?? 0}s\n`;

    return header;
  }

  /**
   * Generate metrics table
   * @private
   */
  private static _generateMetrics(scanResult: ScanResult, isInterProject: boolean): string {
    const metrics = scanResult.metrics ?? {};

    let markdown = '## Metrics\n\n';

    if (isInterProject) {
      markdown += '| Metric | Value |\n';
      markdown += '|--------|-------|\n';
      markdown += `| Repositories Scanned | ${metrics.total_repositories_scanned ?? 0} |\n`;
      markdown += `| Total Code Blocks | ${metrics.total_code_blocks ?? 0} |\n`;
      markdown += `| Intra-Project Groups | ${metrics.total_intra_project_groups ?? 0} |\n`;
      markdown += `| Cross-Repo Groups | ${metrics.total_cross_repository_groups ?? 0} |\n`;
      markdown += `| Cross-Repo Occurrences | ${metrics.cross_repository_occurrences ?? 0} |\n`;
      markdown += `| Cross-Repo Duplicated Lines | ${metrics.cross_repository_duplicated_lines ?? 0} |\n`;
      markdown += `| Total Suggestions | ${metrics.total_suggestions ?? 0} |\n`;
      markdown += `| Shared Package Candidates | ${metrics.shared_package_candidates ?? 0} |\n`;
      markdown += `| MCP Server Candidates | ${metrics.mcp_server_candidates ?? 0} |\n`;
      markdown += `| Avg Repos per Duplicate | ${metrics.average_repositories_per_duplicate ?? 0} |\n`;
    } else {
      markdown += '| Metric | Value |\n';
      markdown += '|--------|-------|\n';
      markdown += `| Total Code Blocks | ${metrics.total_code_blocks ?? 0} |\n`;
      markdown += `| Duplicate Groups | ${metrics.total_duplicate_groups ?? 0} |\n`;
      markdown += `| Exact Duplicates | ${metrics.exact_duplicates ?? 0} |\n`;
      markdown += `| Total Duplicated Lines | ${metrics.total_duplicated_lines ?? 0} |\n`;
      markdown += `| Potential LOC Reduction | ${metrics.potential_loc_reduction ?? 0} |\n`;
      markdown += `| Duplication Percentage | ${metrics.duplication_percentage?.toFixed(2) ?? 0}% |\n`;
      markdown += `| Total Suggestions | ${metrics.total_suggestions ?? 0} |\n`;
      markdown += `| Quick Wins | ${metrics.quick_wins ?? 0} |\n`;
      markdown += `| High Priority Suggestions | ${metrics.high_priority_suggestions ?? 0} |\n`;
    }

    return markdown;
  }

  /**
   * Generate repository information (inter-project only)
   * @private
   */
  private static _generateRepositoryInfo(scanResult: ScanResult): string {
    const repos = scanResult.scanned_repositories ?? [];

    let markdown = '## Scanned Repositories\n\n';
    markdown += '| Repository | Code Blocks | Duplicate Groups | Status |\n';
    markdown += '|------------|-------------|------------------|--------|\n';

    for (const repo of repos) {
      const status = repo.error ? `❌ ${repo.error}` : '✅ Success';
      markdown += `| ${repo.name} | ${repo.code_blocks ?? 0} | ${repo.duplicate_groups ?? 0} | ${status} |\n`;
    }

    return markdown;
  }

  /**
   * Generate duplicate groups section
   * @private
   */
  private static _generateDuplicateGroups(
    scanResult: ScanResult,
    isInterProject: boolean,
    maxGroups: number,
    includeDetails: boolean
  ): string {
    const groups = isInterProject
      ? (scanResult.cross_repository_duplicates ?? [])
      : (scanResult.duplicate_groups ?? []);

    let markdown = isInterProject
      ? '## Top Cross-Repository Duplicates\n\n'
      : '## Top Duplicate Groups\n\n';

    if (groups.length === 0) {
      markdown += '*No duplicates detected.*\n';
      return markdown;
    }

    // Sort by impact score descending
    const topGroups = [...groups]
      .sort((a, b) => b.impact_score - a.impact_score)
      .slice(0, maxGroups);

    for (const group of topGroups) {
      markdown += `### ${group.group_id}\n\n`;
      markdown += `- **Pattern:** ${group.pattern_id}\n`;
      markdown += `- **Category:** ${group.category}\n`;
      markdown += `- **Language:** ${group.language}\n`;
      markdown += `- **Occurrences:** ${group.occurrence_count}\n`;

      if (isInterProject) {
        markdown += `- **Repositories:** ${group.repository_count ?? 0} (${group.affected_repositories?.join(', ') ?? 'N/A'})\n`;
      }

      markdown += `- **Total Lines:** ${group.total_lines}\n`;
      markdown += `- **Impact Score:** ${this._formatScore(group.impact_score)}\n`;
      markdown += `- **Similarity:** ${(group.similarity_score * 100).toFixed(0)}% (${group.similarity_method})\n`;

      if (includeDetails) {
        markdown += `- **Affected Files:**\n`;
        const files = group.affected_files ?? [];
        const maxFiles = 5;
        for (let i = 0; i < Math.min(files.length, maxFiles); i++) {
          markdown += `  - \`${files[i]}\`\n`;
        }
        if (files.length > maxFiles) {
          markdown += `  - *... and ${files.length - maxFiles} more*\n`;
        }
      }

      markdown += '\n';
    }

    return markdown;
  }

  /**
   * Generate suggestions section
   * @private
   */
  private static _generateSuggestions(
    scanResult: ScanResult,
    isInterProject: boolean,
    maxSuggestions: number,
    includeDetails: boolean
  ): string {
    const suggestions = isInterProject
      ? (scanResult.cross_repository_suggestions ?? [])
      : (scanResult.suggestions ?? []);

    let markdown = isInterProject
      ? '## Top Cross-Repository Suggestions\n\n'
      : '## Top Consolidation Suggestions\n\n';

    if (suggestions.length === 0) {
      markdown += '*No suggestions generated.*\n';
      return markdown;
    }

    // Sort by ROI score descending
    const topSuggestions = [...suggestions]
      .sort((a, b) => b.roi_score - a.roi_score)
      .slice(0, maxSuggestions);

    for (const suggestion of topSuggestions) {
      markdown += `### ${suggestion.suggestion_id}\n\n`;
      markdown += `- **Strategy:** ${this._formatStrategy(suggestion.strategy)}\n`;
      markdown += `- **Target:** \`${suggestion.target_location}\`\n`;
      markdown += `- **Impact Score:** ${this._formatScore(suggestion.impact_score)}\n`;
      markdown += `- **ROI Score:** ${this._formatScore(suggestion.roi_score)}\n`;
      markdown += `- **Complexity:** ${this._formatComplexity(suggestion.complexity)}\n`;
      markdown += `- **Risk:** ${this._formatRisk(suggestion.migration_risk)}\n`;

      if (isInterProject) {
        const repos = suggestion.affected_repositories ?? [];
        markdown += `- **Repositories:** ${repos.join(', ')}\n`;
      } else {
        markdown += `- **Affected Files:** ${suggestion.affected_files_count ?? 0}\n`;
      }

      if (suggestion.breaking_changes) {
        markdown += `- **⚠️ Breaking Changes:** Yes\n`;
      }

      if (suggestion.estimated_effort_hours != null) {
        markdown += `- **Estimated Effort:** ${suggestion.estimated_effort_hours}h\n`;
      }

      if (includeDetails && suggestion.strategy_rationale) {
        markdown += `\n**Rationale:** ${suggestion.strategy_rationale}\n`;
      }

      if (includeDetails && suggestion.migration_steps && suggestion.migration_steps.length > 0) {
        markdown += '\n**Migration Steps:**\n';
        for (const step of suggestion.migration_steps.slice(0, 5)) {
          const automated = step.automated ? '🤖' : '👤';
          markdown += `${step.step_number}. ${automated} ${step.description} *(${step.estimated_time})*\n`;
        }
        if (suggestion.migration_steps.length > 5) {
          markdown += `*... and ${suggestion.migration_steps.length - 5} more steps*\n`;
        }
      }

      markdown += '\n';
    }

    return markdown;
  }

  /**
   * Generate footer
   * @private
   */
  private static _generateFooter(scanResult: ScanResult): string {
    const metadata = scanResult.scan_metadata ?? {};

    let footer = '---\n\n';
    footer += '*Report generated by Duplicate Detection Pipeline*\n\n';

    if (metadata.total_code_blocks) {
      footer += `*Analyzed ${metadata.total_code_blocks} code blocks*\n`;
    }

    return footer;
  }

  /**
   * Format score with emoji indicator
   * @private
   */
  private static _formatScore(score: number): string {
    if (score >= 75) {
      return `🔴 ${score.toFixed(1)}/100 (High)`;
    } else if (score >= 50) {
      return `🟡 ${score.toFixed(1)}/100 (Medium)`;
    } else {
      return `🟢 ${score.toFixed(1)}/100 (Low)`;
    }
  }

  /**
   * Format strategy with emoji
   * @private
   */
  private static _formatStrategy(strategy: string): string {
    const strategyMap: Record<string, string> = {
      'local_util': '📁 Local Utility',
      'shared_package': '📦 Shared Package',
      'mcp_server': '🔌 MCP Server',
      'autonomous_agent': '🤖 Autonomous Agent'
    };
    return strategyMap[strategy] ?? strategy;
  }

  /**
   * Format complexity with emoji
   * @private
   */
  private static _formatComplexity(complexity: string): string {
    const complexityMap: Record<string, string> = {
      'trivial': '🟢 Trivial',
      'simple': '🟡 Simple',
      'moderate': '🟠 Moderate',
      'complex': '🔴 Complex'
    };
    return complexityMap[complexity] ?? complexity;
  }

  /**
   * Format risk with emoji
   * @private
   */
  private static _formatRisk(risk: string): string {
    const riskMap: Record<string, string> = {
      'minimal': '🟢 Minimal',
      'low': '🟡 Low',
      'medium': '🟠 Medium',
      'high': '🔴 High'
    };
    return riskMap[risk] ?? risk;
  }
}

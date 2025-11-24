/**
 * JSON Report Generator
 *
 * Generates structured JSON exports of duplicate detection scan results.
 * Suitable for programmatic consumption, API integration, and data analysis.
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * Generate JSON reports from scan results
 */
export class JSONReportGenerator {
  /**
   * Generate a complete JSON report
   *
   * @param {Object} scanResult - Scan result data
   * @param {Object} options - Generation options
   * @returns {Object} - JSON report object
   */
  static generateReport(scanResult, options = {}) {
    const includeSourceCode = options.includeSourceCode !== false;
    const includeCodeBlocks = options.includeCodeBlocks !== false;
    const maxDuplicates = options.maxDuplicates || null; // null = all
    const maxSuggestions = options.maxSuggestions || null; // null = all
    const isInterProject = scanResult.scan_type === 'inter-project';

    const report = {
      report_version: '1.0.0',
      generated_at: new Date().toISOString(),
      scan_type: isInterProject ? 'inter-project' : 'intra-project',
      metadata: this._generateMetadata(scanResult, isInterProject),
      metrics: scanResult.metrics || {},
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
      report.scanned_repositories = scanResult.scanned_repositories || [];
      report.repository_scans = this._formatRepositoryScans(
        scanResult,
        includeCodeBlocks,
        includeSourceCode
      );
    } else {
      report.repository_info = scanResult.repository_info || {};
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
   *
   * @param {Object} scanResult - Scan result data
   * @returns {Object} - Concise JSON summary
   */
  static generateSummary(scanResult) {
    const isInterProject = scanResult.scan_type === 'inter-project';
    const metrics = scanResult.metrics || {};

    return {
      scan_type: isInterProject ? 'inter-project' : 'intra-project',
      generated_at: new Date().toISOString(),
      summary: this._generateSummary(scanResult, isInterProject),
      metrics: {
        ...(isInterProject ? {
          repositories_scanned: metrics.total_repositories_scanned || 0,
          total_code_blocks: metrics.total_code_blocks || 0,
          cross_repo_duplicates: metrics.total_cross_repository_groups || 0,
          cross_repo_duplicated_lines: metrics.cross_repository_duplicated_lines || 0,
          total_suggestions: metrics.total_suggestions || 0,
          shared_package_candidates: metrics.shared_package_candidates || 0,
          mcp_server_candidates: metrics.mcp_server_candidates || 0
        } : {
          code_blocks: metrics.total_code_blocks || 0,
          duplicate_groups: metrics.total_duplicate_groups || 0,
          duplicated_lines: metrics.total_duplicated_lines || 0,
          potential_loc_reduction: metrics.potential_loc_reduction || 0,
          total_suggestions: metrics.total_suggestions || 0,
          quick_wins: metrics.quick_wins || 0
        })
      }
    };
  }

  /**
   * Save JSON report to file
   *
   * @param {Object} scanResult - Scan result data
   * @param {string} outputPath - Output file path
   * @param {Object} options - Generation options
   */
  static async saveReport(scanResult, outputPath, options = {}) {
    const report = this.generateReport(scanResult, options);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    const prettyPrint = options.prettyPrint !== false;
    const json = prettyPrint ? JSON.stringify(report, null, 2) : JSON.stringify(report);
    await fs.writeFile(outputPath, json);
    return outputPath;
  }

  /**
   * Save concise summary to file
   *
   * @param {Object} scanResult - Scan result data
   * @param {string} outputPath - Output file path
   */
  static async saveSummary(scanResult, outputPath) {
    const summary = this.generateSummary(scanResult);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(summary, null, 2));
    return outputPath;
  }

  // Private helper methods

  /**
   * Generate metadata section
   *
   * @private
   */
  static _generateMetadata(scanResult, isInterProject) {
    const metadata = scanResult.scan_metadata || {};
    const repoInfo = scanResult.repository_info || {};

    return {
      ...(isInterProject ? {
        repository_count: metadata.repository_count || 0,
        repositories: (scanResult.scanned_repositories || []).map(r => r.name)
      } : {
        repository_name: repoInfo.name || 'Unknown',
        repository_path: repoInfo.path || 'Unknown',
        total_files: repoInfo.total_files || 0,
        languages: repoInfo.languages || []
      }),
      scanned_at: metadata.scanned_at || new Date().toISOString(),
      duration_seconds: metadata.duration_seconds || 0,
      scanner_version: '2.0.0'
    };
  }

  /**
   * Generate summary section
   *
   * @private
   */
  static _generateSummary(scanResult, isInterProject) {
    const metrics = scanResult.metrics || {};
    const duplicateGroups = isInterProject
      ? (scanResult.cross_repository_duplicates || [])
      : (scanResult.duplicate_groups || []);
    const suggestions = isInterProject
      ? (scanResult.cross_repository_suggestions || [])
      : (scanResult.suggestions || []);

    const summary = {
      total_duplicate_groups: duplicateGroups.length,
      total_suggestions: suggestions.length
    };

    if (isInterProject) {
      summary.repositories_scanned = metrics.total_repositories_scanned || 0;
      summary.cross_repo_duplicates = duplicateGroups.length;
      summary.top_impact_score = duplicateGroups.length > 0
        ? Math.max(...duplicateGroups.map(g => g.impact_score))
        : 0;
    } else {
      summary.code_blocks_detected = metrics.total_code_blocks || 0;
      summary.exact_duplicates = metrics.exact_duplicates || 0;
      summary.structural_duplicates = metrics.structural_duplicates || 0;
      summary.duplicated_lines = metrics.total_duplicated_lines || 0;
      summary.potential_loc_reduction = metrics.potential_loc_reduction || 0;
      summary.quick_wins = metrics.quick_wins || 0;
    }

    // Strategy distribution
    summary.strategy_distribution = this._calculateStrategyDistribution(suggestions);

    // Complexity distribution
    summary.complexity_distribution = this._calculateComplexityDistribution(suggestions);

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
   *
   * @private
   */
  static _formatDuplicateGroups(scanResult, isInterProject, maxGroups, includeSourceCode) {
    const groups = isInterProject
      ? (scanResult.cross_repository_duplicates || [])
      : (scanResult.duplicate_groups || []);

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
        affected_files: group.affected_files || [],
        ...(isInterProject ? {
          repository_count: group.repository_count,
          affected_repositories: group.affected_repositories || []
        } : {}),
        ...(includeSourceCode && group.member_blocks && group.member_blocks.length > 0 ? {
          example_code: group.member_blocks[0].source_code
        } : {})
      }));

    if (maxGroups && maxGroups > 0) {
      formattedGroups = formattedGroups.slice(0, maxGroups);
    }

    return formattedGroups;
  }

  /**
   * Format suggestions
   *
   * @private
   */
  static _formatSuggestions(scanResult, isInterProject, maxSuggestions) {
    const suggestions = isInterProject
      ? (scanResult.cross_repository_suggestions || [])
      : (scanResult.suggestions || []);

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
        breaking_changes: suggestion.breaking_changes || false,
        confidence: suggestion.confidence,
        strategy_rationale: suggestion.strategy_rationale,
        ...(isInterProject ? {
          affected_repositories: suggestion.affected_repositories || [],
          affected_repositories_count: suggestion.affected_repositories_count || 0
        } : {
          affected_files_count: suggestion.affected_files_count || 0
        }),
        migration_steps: (suggestion.migration_steps || []).map(step => ({
          step_number: step.step_number,
          description: step.description,
          automated: step.automated,
          estimated_time: step.estimated_time
        }))
      }));

    if (maxSuggestions && maxSuggestions > 0) {
      formattedSuggestions = formattedSuggestions.slice(0, maxSuggestions);
    }

    return formattedSuggestions;
  }

  /**
   * Format repository scans (inter-project only)
   *
   * @private
   */
  static _formatRepositoryScans(scanResult, includeCodeBlocks, includeSourceCode) {
    const repositoryScans = scanResult.repository_scans || [];

    return repositoryScans.map(repoScan => ({
      repository_name: repoScan.repository_name,
      repository_path: repoScan.repository_path,
      code_blocks_count: repoScan.code_blocks?.length || 0,
      duplicate_groups_count: repoScan.duplicate_groups?.length || 0,
      suggestions_count: repoScan.suggestions?.length || 0,
      error: repoScan.error || null,
      ...(includeCodeBlocks && !includeSourceCode ? {
        code_blocks: (repoScan.code_blocks || []).map(b => ({
          block_id: b.block_id,
          pattern_id: b.pattern_id,
          category: b.category,
          line_count: b.line_count,
          file_path: b.location?.file_path || b.relative_path
        }))
      } : {}),
      ...(includeCodeBlocks && includeSourceCode ? {
        code_blocks: repoScan.code_blocks || []
      } : {})
    }));
  }

  /**
   * Format code blocks
   *
   * @private
   */
  static _formatCodeBlocks(scanResult, includeSourceCode) {
    const codeBlocks = scanResult.code_blocks || [];

    return codeBlocks.map(block => ({
      block_id: block.block_id,
      pattern_id: block.pattern_id,
      category: block.category,
      language: block.language,
      line_count: block.line_count,
      location: {
        file_path: block.location?.file_path || block.relative_path,
        line_start: block.location?.line_start,
        line_end: block.location?.line_end
      },
      content_hash: block.content_hash,
      semantic_tags: block.semantic_tags || [],
      ...(includeSourceCode ? {
        source_code: block.source_code
      } : {})
    }));
  }

  /**
   * Calculate strategy distribution
   *
   * @private
   */
  static _calculateStrategyDistribution(suggestions) {
    const distribution = {
      local_util: 0,
      shared_package: 0,
      mcp_server: 0,
      autonomous_agent: 0
    };

    suggestions.forEach(s => {
      if (distribution.hasOwnProperty(s.strategy)) {
        distribution[s.strategy]++;
      }
    });

    return distribution;
  }

  /**
   * Calculate complexity distribution
   *
   * @private
   */
  static _calculateComplexityDistribution(suggestions) {
    const distribution = {
      trivial: 0,
      simple: 0,
      moderate: 0,
      complex: 0
    };

    suggestions.forEach(s => {
      if (distribution.hasOwnProperty(s.complexity)) {
        distribution[s.complexity]++;
      }
    });

    return distribution;
  }
}

/**
 * HTML Report Generator
 *
 * Generates interactive HTML dashboards for duplicate detection results
 */

import fs from 'fs/promises';
import path from 'path';
import { ensureParentDir } from '../utils/index.js';

export class HTMLReportGenerator {
  /**
   * Generate HTML report from scan results
   *
   * @param {Object} scanResult - Scan results (intra-project or inter-project)
   * @param {Object} options - Report options
   * @returns {string} - HTML content
   */
  static generateReport(scanResult, options = {}) {
    const title = options.title || 'Duplicate Detection Report';
    const isInterProject = scanResult.scan_type === 'inter-project';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this._escapeHtml(title)}</title>
    <style>
        ${this._getStyles()}
    </style>
</head>
<body>
    <div class="container">
        ${this._generateHeader(scanResult, title, isInterProject)}
        ${this._generateMetrics(scanResult, isInterProject)}
        ${this._generateSummaryCharts(scanResult, isInterProject)}
        ${isInterProject ? this._generateCrossRepoSection(scanResult) : ''}
        ${this._generateDuplicateGroups(scanResult, isInterProject)}
        ${this._generateSuggestions(scanResult, isInterProject)}
        ${this._generateFooter(scanResult)}
    </div>
    <script>
        ${this._getScripts()}
    </script>
</body>
</html>`;

    return html;
  }

  /**
   * Save HTML report to file
   */
  static async saveReport(scanResult, outputPath, options = {}) {
    const html = this.generateReport(scanResult, options);
    await ensureParentDir(outputPath);
    await fs.writeFile(outputPath, html);
    return outputPath;
  }

  /**
   * Generate header section
   * @private
   */
  static _generateHeader(scanResult, title, isInterProject) {
    const scanDate = new Date(scanResult.scan_metadata?.scanned_at || Date.now());
    const duration = scanResult.scan_metadata?.duration_seconds || 0;

    return `
    <header>
        <h1>🔍 ${this._escapeHtml(title)}</h1>
        <div class="header-meta">
            <span class="meta-item">
                <strong>Scan Type:</strong> ${isInterProject ? 'Inter-Project' : 'Intra-Project'}
            </span>
            <span class="meta-item">
                <strong>Date:</strong> ${scanDate.toLocaleString()}
            </span>
            <span class="meta-item">
                <strong>Duration:</strong> ${duration.toFixed(2)}s
            </span>
        </div>
    </header>`;
  }

  /**
   * Generate metrics cards
   * @private
   */
  static _generateMetrics(scanResult, isInterProject) {
    const metrics = scanResult.metrics || {};

    if (isInterProject) {
      return `
    <section class="metrics">
        <h2>📊 Scan Metrics</h2>
        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-value">${metrics.total_repositories_scanned || 0}</div>
                <div class="metric-label">Repositories Scanned</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${metrics.total_code_blocks || 0}</div>
                <div class="metric-label">Code Blocks</div>
            </div>
            <div class="metric-card highlight">
                <div class="metric-value">${metrics.total_cross_repository_groups || 0}</div>
                <div class="metric-label">Cross-Repo Duplicates</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${metrics.cross_repository_duplicated_lines || 0}</div>
                <div class="metric-label">Duplicated Lines</div>
            </div>
            <div class="metric-card success">
                <div class="metric-value">${metrics.shared_package_candidates || 0}</div>
                <div class="metric-label">Shared Package Candidates</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${metrics.mcp_server_candidates || 0}</div>
                <div class="metric-label">MCP Server Candidates</div>
            </div>
        </div>
    </section>`;
    }

    return `
    <section class="metrics">
        <h2>📊 Scan Metrics</h2>
        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-value">${metrics.total_code_blocks || 0}</div>
                <div class="metric-label">Code Blocks Detected</div>
            </div>
            <div class="metric-card highlight">
                <div class="metric-value">${metrics.total_duplicate_groups || 0}</div>
                <div class="metric-label">Duplicate Groups</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${metrics.exact_duplicates || 0}</div>
                <div class="metric-label">Exact Duplicates</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${metrics.total_duplicated_lines || 0}</div>
                <div class="metric-label">Duplicated Lines</div>
            </div>
            <div class="metric-card success">
                <div class="metric-value">${metrics.potential_loc_reduction || 0}</div>
                <div class="metric-label">Potential LOC Reduction</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${metrics.quick_wins || 0}</div>
                <div class="metric-label">Quick Wins</div>
            </div>
        </div>
    </section>`;
  }

  /**
   * Generate summary charts
   * @private
   */
  static _generateSummaryCharts(scanResult, isInterProject) {
    const suggestions = isInterProject
      ? (scanResult.cross_repository_suggestions || [])
      : (scanResult.suggestions || []);

    // Count by strategy
    const strategyCounts = {};
    suggestions.forEach(s => {
      strategyCounts[s.strategy] = (strategyCounts[s.strategy] || 0) + 1;
    });

    // Count by complexity
    const complexityCounts = {};
    suggestions.forEach(s => {
      complexityCounts[s.complexity] = (complexityCounts[s.complexity] || 0) + 1;
    });

    return `
    <section class="charts">
        <h2>📈 Distribution</h2>
        <div class="charts-grid">
            <div class="chart-card">
                <h3>By Strategy</h3>
                <div class="chart-bars">
                    ${Object.entries(strategyCounts).map(([strategy, count]) => `
                    <div class="chart-bar-row">
                        <span class="chart-label">${strategy.replace('_', ' ')}</span>
                        <div class="chart-bar-container">
                            <div class="chart-bar strategy-${strategy}" style="width: ${(count / suggestions.length * 100).toFixed(1)}%"></div>
                        </div>
                        <span class="chart-count">${count}</span>
                    </div>
                    `).join('')}
                </div>
            </div>
            <div class="chart-card">
                <h3>By Complexity</h3>
                <div class="chart-bars">
                    ${Object.entries(complexityCounts).map(([complexity, count]) => `
                    <div class="chart-bar-row">
                        <span class="chart-label">${complexity}</span>
                        <div class="chart-bar-container">
                            <div class="chart-bar complexity-${complexity}" style="width: ${(count / suggestions.length * 100).toFixed(1)}%"></div>
                        </div>
                        <span class="chart-count">${count}</span>
                    </div>
                    `).join('')}
                </div>
            </div>
        </div>
    </section>`;
  }

  /**
   * Generate cross-repository section
   * @private
   */
  static _generateCrossRepoSection(scanResult) {
    const repos = scanResult.scanned_repositories || [];

    return `
    <section class="cross-repo">
        <h2>🔗 Scanned Repositories</h2>
        <div class="repo-grid">
            ${repos.map(repo => `
            <div class="repo-card ${repo.error ? 'error' : ''}">
                <div class="repo-name">${this._escapeHtml(repo.name)}</div>
                ${repo.error ? `
                <div class="repo-error">❌ ${this._escapeHtml(repo.error)}</div>
                ` : `
                <div class="repo-stats">
                    <span>${repo.code_blocks} blocks</span>
                    <span>${repo.duplicate_groups} groups</span>
                </div>
                `}
            </div>
            `).join('')}
        </div>
    </section>`;
  }

  /**
   * Generate duplicate groups section
   * @private
   */
  static _generateDuplicateGroups(scanResult, isInterProject) {
    const groups = isInterProject
      ? (scanResult.cross_repository_duplicates || [])
      : (scanResult.duplicate_groups || []);

    const topGroups = groups
      .sort((a, b) => b.impact_score - a.impact_score)
      .slice(0, 10);

    if (topGroups.length === 0) {
      return `
    <section class="duplicates">
        <h2>🎯 Duplicate Groups</h2>
        <p class="empty-state">No duplicate groups detected.</p>
    </section>`;
    }

    return `
    <section class="duplicates">
        <h2>🎯 Top Duplicate Groups</h2>
        <div class="duplicates-list">
            ${topGroups.map((group, index) => `
            <div class="duplicate-card">
                <div class="duplicate-header">
                    <div class="duplicate-rank">#${index + 1}</div>
                    <div class="duplicate-title">
                        <strong>${this._escapeHtml(group.group_id)}</strong>
                        <span class="duplicate-pattern">${this._escapeHtml(group.pattern_id)}</span>
                    </div>
                    <div class="duplicate-impact ${this._getImpactClass(group.impact_score)}">
                        ${group.impact_score.toFixed(0)}% impact
                    </div>
                </div>
                <div class="duplicate-stats">
                    <span class="stat-badge">
                        📦 ${group.occurrence_count} occurrences
                    </span>
                    ${isInterProject ? `
                    <span class="stat-badge">
                        🔗 ${group.repository_count} repositories
                    </span>
                    ` : ''}
                    <span class="stat-badge">
                        📄 ${group.affected_files?.length || 0} files
                    </span>
                    <span class="stat-badge">
                        📏 ${group.total_lines} lines
                    </span>
                </div>
                <div class="duplicate-files">
                    <strong>Affected files:</strong>
                    <ul>
                        ${(group.affected_files || []).slice(0, 5).map(file => `
                        <li><code>${this._escapeHtml(file)}</code></li>
                        `).join('')}
                        ${group.affected_files?.length > 5 ? `<li><em>... and ${group.affected_files.length - 5} more</em></li>` : ''}
                    </ul>
                </div>
            </div>
            `).join('')}
        </div>
    </section>`;
  }

  /**
   * Generate suggestions section
   * @private
   */
  static _generateSuggestions(scanResult, isInterProject) {
    const suggestions = isInterProject
      ? (scanResult.cross_repository_suggestions || [])
      : (scanResult.suggestions || []);

    const topSuggestions = suggestions
      .sort((a, b) => b.roi_score - a.roi_score)
      .slice(0, 10);

    if (topSuggestions.length === 0) {
      return `
    <section class="suggestions">
        <h2>💡 Consolidation Suggestions</h2>
        <p class="empty-state">No suggestions generated.</p>
    </section>`;
    }

    return `
    <section class="suggestions">
        <h2>💡 Top Consolidation Suggestions</h2>
        <div class="suggestions-list">
            ${topSuggestions.map((suggestion, index) => `
            <div class="suggestion-card ${suggestion.breaking_changes ? 'breaking' : ''}">
                <div class="suggestion-header">
                    <div class="suggestion-rank">#${index + 1}</div>
                    <div class="suggestion-title">
                        <strong>${this._escapeHtml(suggestion.suggestion_id)}</strong>
                        <span class="suggestion-strategy strategy-${suggestion.strategy}">
                            ${this._escapeHtml(suggestion.strategy.replace('_', ' '))}
                        </span>
                    </div>
                    <div class="suggestion-roi ${this._getROIClass(suggestion.roi_score)}">
                        ROI: ${suggestion.roi_score.toFixed(0)}%
                    </div>
                </div>
                <div class="suggestion-body">
                    <p class="suggestion-rationale">${this._escapeHtml(suggestion.strategy_rationale)}</p>
                    ${suggestion.target_location ? `
                    <p class="suggestion-target">
                        <strong>Target:</strong> <code>${this._escapeHtml(suggestion.target_location)}</code>
                    </p>
                    ` : ''}
                    <div class="suggestion-metrics">
                        <span class="metric-badge">
                            Impact: ${suggestion.impact_score.toFixed(0)}%
                        </span>
                        <span class="metric-badge complexity-${suggestion.complexity}">
                            ${suggestion.complexity} complexity
                        </span>
                        <span class="metric-badge risk-${suggestion.migration_risk}">
                            ${suggestion.migration_risk} risk
                        </span>
                        ${suggestion.estimated_effort_hours ? `
                        <span class="metric-badge">
                            ~${suggestion.estimated_effort_hours}h effort
                        </span>
                        ` : ''}
                    </div>
                    ${suggestion.breaking_changes ? `
                    <div class="warning-box">
                        ⚠️ <strong>Breaking Change:</strong> This consolidation may require API changes
                    </div>
                    ` : ''}
                </div>
            </div>
            `).join('')}
        </div>
    </section>`;
  }

  /**
   * Generate footer
   * @private
   */
  static _generateFooter(scanResult) {
    return `
    <footer>
        <p>Generated by Duplicate Detection Pipeline | ${new Date().toLocaleString()}</p>
    </footer>`;
  }

  /**
   * Get CSS styles
   * @private
   */
  static _getStyles() {
    return `
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f5f7fa;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            border-radius: 10px;
            margin-bottom: 30px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        header h1 { margin-bottom: 15px; font-size: 2em; }
        .header-meta {
            display: flex;
            gap: 20px;
            flex-wrap: wrap;
        }
        .meta-item {
            background: rgba(255,255,255,0.2);
            padding: 8px 15px;
            border-radius: 5px;
        }
        section {
            background: white;
            padding: 25px;
            margin-bottom: 20px;
            border-radius: 10px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        section h2 {
            margin-bottom: 20px;
            color: #2d3748;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 10px;
        }
        .metrics-grid, .charts-grid, .repo-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
        }
        .metric-card {
            padding: 20px;
            text-align: center;
            border-radius: 8px;
            background: #f7fafc;
            border: 2px solid #e2e8f0;
        }
        .metric-card.highlight {
            background: #ebf8ff;
            border-color: #4299e1;
        }
        .metric-card.success {
            background: #f0fff4;
            border-color: #48bb78;
        }
        .metric-value {
            font-size: 2.5em;
            font-weight: bold;
            color: #2d3748;
        }
        .metric-label {
            color: #718096;
            margin-top: 5px;
            font-size: 0.9em;
        }
        .chart-card {
            padding: 20px;
            background: #f7fafc;
            border-radius: 8px;
        }
        .chart-card h3 {
            margin-bottom: 15px;
            color: #4a5568;
        }
        .chart-bars { display: flex; flex-direction: column; gap: 10px; }
        .chart-bar-row {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .chart-label {
            min-width: 120px;
            font-size: 0.9em;
            color: #4a5568;
            text-transform: capitalize;
        }
        .chart-bar-container {
            flex: 1;
            background: #e2e8f0;
            height: 24px;
            border-radius: 4px;
            overflow: hidden;
        }
        .chart-bar {
            height: 100%;
            background: #4299e1;
            transition: width 0.3s ease;
        }
        .chart-bar.strategy-local_util { background: #48bb78; }
        .chart-bar.strategy-shared_package { background: #4299e1; }
        .chart-bar.strategy-mcp_server { background: #9f7aea; }
        .chart-bar.strategy-autonomous_agent { background: #ed8936; }
        .chart-bar.complexity-trivial { background: #48bb78; }
        .chart-bar.complexity-simple { background: #4299e1; }
        .chart-bar.complexity-moderate { background: #ed8936; }
        .chart-bar.complexity-complex { background: #f56565; }
        .chart-count {
            min-width: 30px;
            text-align: right;
            font-weight: bold;
            color: #4a5568;
        }
        .repo-card {
            padding: 15px;
            background: #f7fafc;
            border-radius: 8px;
            border: 2px solid #e2e8f0;
        }
        .repo-card.error {
            background: #fff5f5;
            border-color: #fc8181;
        }
        .repo-name {
            font-weight: bold;
            color: #2d3748;
            margin-bottom: 8px;
        }
        .repo-stats {
            display: flex;
            gap: 15px;
            font-size: 0.9em;
            color: #718096;
        }
        .repo-error {
            color: #e53e3e;
            font-size: 0.9em;
        }
        .duplicates-list, .suggestions-list {
            display: flex;
            flex-direction: column;
            gap: 15px;
        }
        .duplicate-card, .suggestion-card {
            border: 2px solid #e2e8f0;
            border-radius: 8px;
            padding: 20px;
            background: #fafafa;
        }
        .suggestion-card.breaking {
            border-color: #fc8181;
        }
        .duplicate-header, .suggestion-header {
            display: flex;
            align-items: center;
            gap: 15px;
            margin-bottom: 15px;
        }
        .duplicate-rank, .suggestion-rank {
            font-size: 1.5em;
            font-weight: bold;
            color: #a0aec0;
            min-width: 40px;
        }
        .duplicate-title, .suggestion-title {
            flex: 1;
        }
        .duplicate-pattern, .suggestion-strategy {
            display: inline-block;
            background: #edf2f7;
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 0.85em;
            margin-left: 10px;
        }
        .suggestion-strategy.strategy-local_util { background: #c6f6d5; color: #22543d; }
        .suggestion-strategy.strategy-shared_package { background: #bee3f8; color: #2c5282; }
        .suggestion-strategy.strategy-mcp_server { background: #e9d8fd; color: #44337a; }
        .suggestion-strategy.strategy-autonomous_agent { background: #feebc8; color: #7c2d12; }
        .duplicate-impact, .suggestion-roi {
            padding: 6px 12px;
            border-radius: 6px;
            font-weight: bold;
            font-size: 0.9em;
        }
        .impact-high, .roi-high { background: #c6f6d5; color: #22543d; }
        .impact-medium, .roi-medium { background: #feebc8; color: #7c2d12; }
        .impact-low, .roi-low { background: #fed7d7; color: #742a2a; }
        .duplicate-stats, .suggestion-metrics {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-bottom: 15px;
        }
        .stat-badge, .metric-badge {
            background: #edf2f7;
            padding: 6px 12px;
            border-radius: 4px;
            font-size: 0.85em;
            color: #4a5568;
        }
        .metric-badge.complexity-trivial { background: #c6f6d5; color: #22543d; }
        .metric-badge.complexity-simple { background: #bee3f8; color: #2c5282; }
        .metric-badge.complexity-moderate { background: #feebc8; color: #7c2d12; }
        .metric-badge.complexity-complex { background: #fed7d7; color: #742a2a; }
        .metric-badge.risk-minimal { background: #c6f6d5; color: #22543d; }
        .metric-badge.risk-low { background: #bee3f8; color: #2c5282; }
        .metric-badge.risk-medium { background: #feebc8; color: #7c2d12; }
        .metric-badge.risk-high { background: #fed7d7; color: #742a2a; }
        .duplicate-files ul {
            margin-top: 10px;
            padding-left: 20px;
        }
        .duplicate-files li {
            margin: 5px 0;
            font-size: 0.9em;
        }
        .suggestion-rationale {
            margin-bottom: 10px;
            color: #4a5568;
        }
        .suggestion-target {
            margin-bottom: 10px;
            font-size: 0.9em;
        }
        .warning-box {
            background: #fff5f5;
            border: 1px solid #fc8181;
            border-radius: 6px;
            padding: 12px;
            margin-top: 12px;
            color: #742a2a;
        }
        code {
            background: #edf2f7;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
        }
        .empty-state {
            text-align: center;
            color: #a0aec0;
            padding: 40px;
            font-style: italic;
        }
        footer {
            text-align: center;
            color: #a0aec0;
            padding: 30px;
            font-size: 0.9em;
        }
    `;
  }

  /**
   * Get JavaScript
   * @private
   */
  static _getScripts() {
    return `
        // Add interactivity here if needed
        console.log('Duplicate Detection Report loaded');
    `;
  }

  /**
   * Get impact class
   * @private
   */
  static _getImpactClass(score) {
    if (score >= 70) return 'impact-high';
    if (score >= 40) return 'impact-medium';
    return 'impact-low';
  }

  /**
   * Get ROI class
   * @private
   */
  static _getROIClass(score) {
    if (score >= 80) return 'roi-high';
    if (score >= 50) return 'roi-medium';
    return 'roi-low';
  }

  /**
   * Escape HTML
   * @private
   */
  static _escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

/**
 * HTML Report Section Generators
 *
 * Extracted from HTMLReportGenerator to reduce class size (AG-M1).
 * Each function generates one HTML section of the duplicate detection dashboard.
 */

import { REPORT_SCORE_CLASS_THRESHOLDS } from '../../core/score-thresholds.ts';
import { formatDuration } from '../../utils/time-helpers.ts';
import {
  escapeHtml,
  sanitizeCssClass,
  VALID_STRATEGIES,
  VALID_COMPLEXITIES,
  VALID_RISKS
} from '../../utils/html-report-utils.ts';
import { LIMITS, MARKDOWN_REPORT, MAX_SCORE } from '../../core/constants.ts';
import type { ScanResult } from './json-report-generator.ts';

export function generateHeader(scanResult: ScanResult, title: string): string {
  const scanDate = new Date(scanResult.scan_metadata?.scanned_at ?? Date.now());
  const duration = scanResult.scan_metadata?.duration_seconds ?? 0;

  return `
    <header>
        <h1>🔍 ${escapeHtml(title)}</h1>
        <div class="header-meta">
            <span class="meta-item">
                <strong>Scan Type:</strong> ${scanResult.scan_type === 'inter-project' ? 'Inter-Project' : 'Intra-Project'}
            </span>
            <span class="meta-item">
                <strong>Date:</strong> ${scanDate.toLocaleString()}
            </span>
            <span class="meta-item">
                <strong>Duration:</strong> ${formatDuration(duration)}
            </span>
        </div>
    </header>`;
}

export function generateMetrics(scanResult: ScanResult, isInterProject: boolean): string {
  const metrics = scanResult.metrics ?? {};

  if (isInterProject) {
    return `
    <section class="metrics">
        <h2>📊 Scan Metrics</h2>
        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-value">${metrics.total_repositories_scanned ?? 0}</div>
                <div class="metric-label">Repositories Scanned</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${metrics.total_code_blocks ?? 0}</div>
                <div class="metric-label">Code Blocks</div>
            </div>
            <div class="metric-card highlight">
                <div class="metric-value">${metrics.total_cross_repository_groups ?? 0}</div>
                <div class="metric-label">Cross-Repo Duplicates</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${metrics.cross_repository_duplicated_lines ?? 0}</div>
                <div class="metric-label">Duplicated Lines</div>
            </div>
            <div class="metric-card success">
                <div class="metric-value">${metrics.shared_package_candidates ?? 0}</div>
                <div class="metric-label">Shared Package Candidates</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${metrics.mcp_server_candidates ?? 0}</div>
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
                <div class="metric-value">${metrics.total_code_blocks ?? 0}</div>
                <div class="metric-label">Code Blocks Detected</div>
            </div>
            <div class="metric-card highlight">
                <div class="metric-value">${metrics.total_duplicate_groups ?? 0}</div>
                <div class="metric-label">Duplicate Groups</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${metrics.exact_duplicates ?? 0}</div>
                <div class="metric-label">Exact Duplicates</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${metrics.total_duplicated_lines ?? 0}</div>
                <div class="metric-label">Duplicated Lines</div>
            </div>
            <div class="metric-card success">
                <div class="metric-value">${metrics.potential_loc_reduction ?? 0}</div>
                <div class="metric-label">Potential LOC Reduction</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${metrics.quick_wins ?? 0}</div>
                <div class="metric-label">Quick Wins</div>
            </div>
        </div>
    </section>`;
}

export function generateSummaryCharts(scanResult: ScanResult, isInterProject: boolean): string {
  const suggestions = isInterProject
    ? (scanResult.cross_repository_suggestions ?? [])
    : (scanResult.suggestions ?? []);

  const strategyCounts: Record<string, number> = {};
  const complexityCounts: Record<string, number> = {};
  for (const s of suggestions) {
    strategyCounts[s.strategy] = (strategyCounts[s.strategy] ?? 0) + 1;
    complexityCounts[s.complexity] = (complexityCounts[s.complexity] ?? 0) + 1;
  }

  return `
    <section class="charts">
        <h2>📈 Distribution</h2>
        <div class="charts-grid">
            <div class="chart-card">
                <h3>By Strategy</h3>
                <div class="chart-bars">
                    ${Object.entries(strategyCounts).map(([strategy, count]) => `
                    <div class="chart-bar-row">
                        <span class="chart-label">${escapeHtml(strategy.replaceAll('_', ' '))}</span>
                        <div class="chart-bar-container">
                            <div class="chart-bar strategy-${sanitizeCssClass(strategy, VALID_STRATEGIES)}" style="width: ${(count / suggestions.length * MAX_SCORE).toFixed(1)}%"></div>
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
                        <span class="chart-label">${escapeHtml(complexity)}</span>
                        <div class="chart-bar-container">
                            <div class="chart-bar complexity-${sanitizeCssClass(complexity, VALID_COMPLEXITIES)}" style="width: ${(count / suggestions.length * MAX_SCORE).toFixed(1)}%"></div>
                        </div>
                        <span class="chart-count">${count}</span>
                    </div>
                    `).join('')}
                </div>
            </div>
        </div>
    </section>`;
}

export function generateCrossRepoSection(scanResult: ScanResult): string {
  const repos = scanResult.scanned_repositories ?? [];

  return `
    <section class="cross-repo">
        <h2>🔗 Scanned Repositories</h2>
        <div class="repo-grid">
            ${repos.map(repo => `
            <div class="repo-card ${repo.error ? 'error' : ''}">
                <div class="repo-name">${escapeHtml(repo.name)}</div>
                ${repo.error ? `
                <div class="repo-error">❌ ${escapeHtml(repo.error)}</div>
                ` : `
                <div class="repo-stats">
                    <span>${repo.code_blocks ?? 0} blocks</span>
                    <span>${repo.duplicate_groups ?? 0} groups</span>
                </div>
                `}
            </div>
            `).join('')}
        </div>
    </section>`;
}

export function generateDuplicateGroups(scanResult: ScanResult, isInterProject: boolean): string {
  const groups = isInterProject
    ? (scanResult.cross_repository_duplicates ?? [])
    : (scanResult.duplicate_groups ?? []);

  const topGroups = [...groups]
    .sort((a, b) => b.impact_score - a.impact_score)
    .slice(0, LIMITS.DISPLAY_TOP_N);

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
                        <strong>${escapeHtml(group.group_id)}</strong>
                        <span class="duplicate-pattern">${escapeHtml(group.pattern_id)}</span>
                    </div>
                    <div class="duplicate-impact ${getImpactClass(group.impact_score)}">
                        ${group.impact_score.toFixed(0)}% impact
                    </div>
                </div>
                <div class="duplicate-stats">
                    <span class="stat-badge">
                        📦 ${group.occurrence_count} occurrences
                    </span>
                    ${isInterProject ? `
                    <span class="stat-badge">
                        🔗 ${group.repository_count ?? 0} repositories
                    </span>
                    ` : ''}
                    <span class="stat-badge">
                        📄 ${group.affected_files?.length ?? 0} files
                    </span>
                    <span class="stat-badge">
                        📏 ${group.total_lines} lines
                    </span>
                </div>
                <div class="duplicate-files">
                    <strong>Affected files:</strong>
                    <ul>
                        ${(group.affected_files ?? []).slice(0, MARKDOWN_REPORT.MAX_AFFECTED_FILES).map(file => `
                        <li><code>${escapeHtml(file)}</code></li>
                        `).join('')}
                        ${(group.affected_files?.length ?? 0) > MARKDOWN_REPORT.MAX_AFFECTED_FILES ? `<li><em>... and ${(group.affected_files?.length ?? 0) - MARKDOWN_REPORT.MAX_AFFECTED_FILES} more</em></li>` : ''}
                    </ul>
                </div>
            </div>
            `).join('')}
        </div>
    </section>`;
}

export function generateSuggestions(scanResult: ScanResult, isInterProject: boolean): string {
  const suggestions = isInterProject
    ? (scanResult.cross_repository_suggestions ?? [])
    : (scanResult.suggestions ?? []);

  const topSuggestions = [...suggestions]
    .sort((a, b) => b.roi_score - a.roi_score)
    .slice(0, LIMITS.DISPLAY_TOP_N);

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
                        <strong>${escapeHtml(suggestion.suggestion_id)}</strong>
                        <span class="suggestion-strategy strategy-${sanitizeCssClass(suggestion.strategy, VALID_STRATEGIES)}">
                            ${escapeHtml(suggestion.strategy.replaceAll('_', ' '))}
                        </span>
                    </div>
                    <div class="suggestion-roi ${getROIClass(suggestion.roi_score)}">
                        ROI: ${suggestion.roi_score.toFixed(0)}%
                    </div>
                </div>
                <div class="suggestion-body">
                    <p class="suggestion-rationale">${escapeHtml(suggestion.strategy_rationale ?? '')}</p>
                    ${suggestion.target_location ? `
                    <p class="suggestion-target">
                        <strong>Target:</strong> <code>${escapeHtml(suggestion.target_location)}</code>
                    </p>
                    ` : ''}
                    <div class="suggestion-metrics">
                        <span class="metric-badge">
                            Impact: ${suggestion.impact_score.toFixed(0)}%
                        </span>
                        <span class="metric-badge complexity-${sanitizeCssClass(suggestion.complexity, VALID_COMPLEXITIES)}">
                            ${escapeHtml(suggestion.complexity)} complexity
                        </span>
                        <span class="metric-badge risk-${sanitizeCssClass(suggestion.migration_risk, VALID_RISKS)}">
                            ${escapeHtml(suggestion.migration_risk)} risk
                        </span>
                        ${suggestion.estimated_effort_hours != null ? `
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

export function generateFooter(scanResult: ScanResult): string {
  const timestamp = new Date(scanResult.scan_metadata?.scanned_at ?? Date.now());
  return `
    <footer>
        <p>Generated by Duplicate Detection Pipeline | ${timestamp.toLocaleString()}</p>
    </footer>`;
}

function getImpactClass(score: number): string {
  if (score >= REPORT_SCORE_CLASS_THRESHOLDS.IMPACT_HIGH_MIN_SCORE) return 'impact-high';
  if (score >= REPORT_SCORE_CLASS_THRESHOLDS.IMPACT_MEDIUM_MIN_SCORE) return 'impact-medium';
  return 'impact-low';
}

function getROIClass(score: number): string {
  if (score >= REPORT_SCORE_CLASS_THRESHOLDS.ROI_HIGH_MIN_SCORE) return 'roi-high';
  if (score >= REPORT_SCORE_CLASS_THRESHOLDS.ROI_MEDIUM_MIN_SCORE) return 'roi-medium';
  return 'roi-low';
}

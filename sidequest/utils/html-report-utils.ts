/**
 * Shared HTML report utilities.
 *
 * Extracted from report-generator.ts and html-report-generator.ts
 * to eliminate duplicated escapeHtml and base CSS.
 */

/**
 * Escape HTML special characters to prevent XSS.
 */
export function escapeHtml(text: string): string {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Base CSS styles shared across all HTML reports.
 * Covers reset, container, header gradient, sections, metrics, empty state, and footer.
 */
export function getBaseStyles(): string {
  return `
    :root {
        --max-width-container: 1200px;
        --space-xs: 5px;
        --space-sm: 8px;
        --space-md: 15px;
        --space-lg: 20px;
        --space-xl: 25px;
        --space-2xl: 30px;
        --space-3xl: 40px;
        --radius-sm: 5px;
        --radius-md: 8px;
        --radius-lg: 10px;
        --font-size-h1: 2em;
        --font-size-metric: 2.5em;
        --font-size-small: 0.9em;
        --metric-card-min-width: 200px;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        line-height: 1.6;
        color: #333;
        background: #f5f7fa;
    }
    .container {
        max-width: var(--max-width-container);
        margin: 0 auto;
        padding: var(--space-lg);
    }
    header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: var(--space-2xl);
        border-radius: var(--radius-lg);
        margin-bottom: var(--space-2xl);
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    header h1 { margin-bottom: var(--space-md); font-size: var(--font-size-h1); }
    .header-meta {
        display: flex;
        gap: var(--space-lg);
        flex-wrap: wrap;
    }
    .meta-item {
        background: rgba(255,255,255,0.2);
        padding: var(--space-sm) var(--space-md);
        border-radius: var(--radius-sm);
    }
    section {
        background: white;
        padding: var(--space-xl);
        margin-bottom: var(--space-lg);
        border-radius: var(--radius-lg);
        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }
    section h2 {
        margin-bottom: var(--space-lg);
        color: #2d3748;
        border-bottom: 2px solid #e2e8f0;
        padding-bottom: var(--space-sm);
    }
    .metrics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(var(--metric-card-min-width), 1fr));
        gap: var(--space-md);
    }
    .metric-card {
        padding: var(--space-lg);
        text-align: center;
        border-radius: var(--radius-md);
        background: #f7fafc;
        border: 2px solid #e2e8f0;
    }
    .metric-value {
        font-size: var(--font-size-metric);
        font-weight: bold;
        color: #2d3748;
    }
    .metric-label {
        color: #718096;
        margin-top: var(--space-xs);
        font-size: var(--font-size-small);
    }
    .empty-state {
        text-align: center;
        color: #a0aec0;
        padding: var(--space-3xl);
        font-style: italic;
    }
    footer {
        text-align: center;
        color: #a0aec0;
        padding: var(--space-2xl);
        font-size: var(--font-size-small);
    }
  `;
}

/**
 * Scan-report-specific CSS styles for HTMLReportGenerator.
 * Covers charts, repo grid, duplicate/suggestion cards, strategy/complexity/risk badges.
 */
export function getScanReportStyles(): string {
  return `
        ${getBaseStyles()}
        .charts-grid, .repo-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
        }
        .metric-card.highlight {
            background: #ebf8ff;
            border-color: #4299e1;
        }
        .metric-card.success {
            background: #f0fff4;
            border-color: #48bb78;
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
  `;
}

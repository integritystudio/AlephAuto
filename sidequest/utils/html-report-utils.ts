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
        padding-bottom: var(--space-xs);
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

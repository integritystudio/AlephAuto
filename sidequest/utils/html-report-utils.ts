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
    .metrics-grid {
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

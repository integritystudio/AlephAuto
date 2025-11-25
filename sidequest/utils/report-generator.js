/**
 * Generic Report Generator
 *
 * Generates HTML and JSON reports for all pipeline types.
 * Provides a consistent reporting interface across all AlephAuto workers.
 *
 * Usage:
 *   const { generateReport } = await import('./report-generator.js');
 *   const reportPaths = await generateReport({
 *     jobId: 'job-123',
 *     jobType: 'claude-health',
 *     status: 'completed',
 *     result: { ... },
 *     startTime: Date.now(),
 *     endTime: Date.now(),
 *     parameters: { ... }
 *   });
 */

import fs from 'fs/promises';
import path from 'path';
import { createComponentLogger } from './logger.js';

const logger = createComponentLogger('ReportGenerator');

/**
 * Default output directory for reports
 */
const DEFAULT_OUTPUT_DIR = path.join(process.cwd(), 'output/reports');

/**
 * Generate reports for a completed job
 *
 * @param {Object} options - Report generation options
 * @param {string} options.jobId - Job identifier
 * @param {string} options.jobType - Type of job (e.g., 'claude-health', 'git-activity')
 * @param {string} options.status - Job status ('completed', 'failed', etc.)
 * @param {Object} options.result - Job result data
 * @param {number} options.startTime - Job start timestamp
 * @param {number} options.endTime - Job end timestamp
 * @param {Object} [options.parameters] - Job parameters/configuration
 * @param {Object} [options.metadata] - Additional metadata
 * @param {string} [options.outputDir] - Custom output directory
 * @returns {Promise<Object>} - Report paths { html, json, timestamp }
 */
export async function generateReport(options) {
  const {
    jobId,
    jobType,
    status,
    result,
    startTime,
    endTime,
    parameters = {},
    metadata = {},
    outputDir = DEFAULT_OUTPUT_DIR
  } = options;

  // Validate required fields
  if (!jobId || !jobType || !status) {
    throw new Error('Missing required fields: jobId, jobType, status');
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const baseName = `${jobType}-${timestamp}`;

  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  const reportPaths = {
    timestamp: new Date().toISOString()
  };

  try {
    // Generate HTML report
    const htmlPath = path.join(outputDir, `${baseName}.html`);
    const htmlContent = generateHTMLReport({
      jobId,
      jobType,
      status,
      result,
      startTime,
      endTime,
      parameters,
      metadata,
      timestamp
    });
    await fs.writeFile(htmlPath, htmlContent);
    reportPaths.html = htmlPath;
    logger.info({ path: htmlPath }, 'HTML report generated');

    // Generate JSON report
    const jsonPath = path.join(outputDir, `${baseName}.json`);
    const jsonContent = generateJSONReport({
      jobId,
      jobType,
      status,
      result,
      startTime,
      endTime,
      parameters,
      metadata,
      timestamp
    });
    await fs.writeFile(jsonPath, JSON.stringify(jsonContent, null, 2));
    reportPaths.json = jsonPath;
    logger.info({ path: jsonPath }, 'JSON report generated');

    return reportPaths;

  } catch (error) {
    logger.error({ error }, 'Report generation failed');
    throw new Error(`Report generation failed: ${error.message}`);
  }
}

/**
 * Generate HTML report content
 *
 * @private
 */
function generateHTMLReport(data) {
  const {
    jobId,
    jobType,
    status,
    result,
    startTime,
    endTime,
    parameters,
    metadata,
    timestamp
  } = data;

  const duration = endTime && startTime ? ((endTime - startTime) / 1000).toFixed(2) : 'N/A';
  const title = getJobTypeTitle(jobType);
  const statusClass = status === 'completed' ? 'success' : status === 'failed' ? 'error' : 'warning';

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)} - ${escapeHtml(jobId)}</title>
    <style>
        ${getHTMLStyles()}
    </style>
</head>
<body>
    <div class="container">
        ${generateHTMLHeader(title, jobId, status, statusClass, timestamp, duration)}
        ${generateHTMLParameters(parameters)}
        ${generateHTMLMetadata(metadata)}
        ${generateHTMLResults(result, jobType)}
        ${generateHTMLFooter(timestamp)}
    </div>
</body>
</html>`;
}

/**
 * Generate JSON report content
 *
 * @private
 */
function generateJSONReport(data) {
  const {
    jobId,
    jobType,
    status,
    result,
    startTime,
    endTime,
    parameters,
    metadata,
    timestamp
  } = data;

  return {
    report_version: '1.0.0',
    generated_at: timestamp,
    job: {
      id: jobId,
      type: jobType,
      status,
      duration_seconds: endTime && startTime ? (endTime - startTime) / 1000 : null,
      started_at: startTime ? new Date(startTime).toISOString() : null,
      completed_at: endTime ? new Date(endTime).toISOString() : null
    },
    parameters,
    metadata,
    result
  };
}

/**
 * Generate HTML header section
 *
 * @private
 */
function generateHTMLHeader(title, jobId, status, statusClass, timestamp, duration) {
  return `
    <header>
        <h1>📋 ${escapeHtml(title)}</h1>
        <div class="header-meta">
            <span class="meta-item">
                <strong>Job ID:</strong> ${escapeHtml(jobId)}
            </span>
            <span class="meta-item status-${statusClass}">
                <strong>Status:</strong> ${escapeHtml(status)}
            </span>
            <span class="meta-item">
                <strong>Generated:</strong> ${new Date(timestamp).toLocaleString()}
            </span>
            <span class="meta-item">
                <strong>Duration:</strong> ${duration}s
            </span>
        </div>
    </header>`;
}

/**
 * Generate HTML parameters section
 *
 * @private
 */
function generateHTMLParameters(parameters) {
  if (!parameters || Object.keys(parameters).length === 0) {
    return '';
  }

  const paramItems = Object.entries(parameters)
    .map(([key, value]) => `
      <div class="param-item">
        <span class="param-key">${escapeHtml(key)}:</span>
        <span class="param-value">${escapeHtml(formatValue(value))}</span>
      </div>
    `)
    .join('');

  return `
    <section class="parameters">
        <h2>⚙️ Parameters</h2>
        <div class="params-grid">
            ${paramItems}
        </div>
    </section>`;
}

/**
 * Generate HTML metadata section
 *
 * @private
 */
function generateHTMLMetadata(metadata) {
  if (!metadata || Object.keys(metadata).length === 0) {
    return '';
  }

  const metaItems = Object.entries(metadata)
    .map(([key, value]) => `
      <div class="meta-item-detail">
        <span class="meta-key">${escapeHtml(key)}:</span>
        <span class="meta-value">${escapeHtml(formatValue(value))}</span>
      </div>
    `)
    .join('');

  return `
    <section class="metadata">
        <h2>ℹ️ Metadata</h2>
        <div class="meta-grid">
            ${metaItems}
        </div>
    </section>`;
}

/**
 * Generate HTML results section
 *
 * @private
 */
function generateHTMLResults(result, jobType) {
  if (!result) {
    return `
    <section class="results">
        <h2>📊 Results</h2>
        <p class="empty-state">No results available</p>
    </section>`;
  }

  // Try to detect metrics/stats in result
  const metrics = extractMetrics(result);
  const details = extractDetails(result);

  return `
    <section class="results">
        <h2>📊 Results</h2>
        ${metrics ? generateMetricsSection(metrics) : ''}
        ${details ? generateDetailsSection(details, jobType) : ''}
    </section>`;
}

/**
 * Generate metrics cards
 *
 * @private
 */
function generateMetricsSection(metrics) {
  const metricCards = Object.entries(metrics)
    .map(([key, value]) => {
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      return `
        <div class="metric-card">
            <div class="metric-value">${escapeHtml(String(value))}</div>
            <div class="metric-label">${escapeHtml(label)}</div>
        </div>
      `;
    })
    .join('');

  return `
    <div class="metrics-section">
        <h3>Key Metrics</h3>
        <div class="metrics-grid">
            ${metricCards}
        </div>
    </div>`;
}

/**
 * Generate details section
 *
 * @private
 */
function generateDetailsSection(details, jobType) {
  return `
    <div class="details-section">
        <h3>Details</h3>
        <pre class="details-content">${escapeHtml(JSON.stringify(details, null, 2))}</pre>
    </div>`;
}

/**
 * Generate HTML footer
 *
 * @private
 */
function generateHTMLFooter(timestamp) {
  return `
    <footer>
        <p>Generated by AlephAuto Pipeline Framework | ${new Date(timestamp).toLocaleString()}</p>
    </footer>`;
}

/**
 * Extract metrics from result object
 *
 * @private
 */
function extractMetrics(result) {
  // Look for common metric field names
  const metricKeys = [
    'metrics', 'stats', 'statistics', 'summary',
    'totalFiles', 'totalItems', 'totalRepositories',
    'enhanced', 'skipped', 'failed', 'success',
    'totalCommits', 'linesAdded', 'linesDeleted',
    'healthScore', 'issueCount', 'warningCount'
  ];

  const metrics = {};

  for (const key of metricKeys) {
    if (result[key] !== undefined) {
      if (typeof result[key] === 'object' && !Array.isArray(result[key])) {
        // If it's an object, merge its properties
        Object.assign(metrics, result[key]);
      } else {
        metrics[key] = result[key];
      }
    }
  }

  return Object.keys(metrics).length > 0 ? metrics : null;
}

/**
 * Extract details from result object (non-metrics)
 *
 * @private
 */
function extractDetails(result) {
  const metricKeys = [
    'metrics', 'stats', 'statistics', 'summary',
    'totalFiles', 'totalItems', 'totalRepositories',
    'enhanced', 'skipped', 'failed', 'success',
    'totalCommits', 'linesAdded', 'linesDeleted',
    'healthScore', 'issueCount', 'warningCount'
  ];

  const details = {};

  for (const [key, value] of Object.entries(result)) {
    if (!metricKeys.includes(key)) {
      details[key] = value;
    }
  }

  return Object.keys(details).length > 0 ? details : null;
}

/**
 * Get human-readable title for job type
 *
 * @private
 */
function getJobTypeTitle(jobType) {
  const titles = {
    'claude-health': 'Claude Health Check Report',
    'git-activity': 'Git Activity Report',
    'gitignore-update': 'Gitignore Update Report',
    'repo-cleanup': 'Repository Cleanup Report',
    'repomix': 'Repomix Report',
    'schema-enhancement': 'Schema Enhancement Report',
    'duplicate-detection': 'Duplicate Detection Report',
    'test-refactor': 'Test Refactor Report'
  };

  return titles[jobType] || `${jobType} Report`;
}

/**
 * Format value for display
 *
 * @private
 */
function formatValue(value) {
  if (value === null || value === undefined) {
    return 'N/A';
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      return value.length > 0 ? value.join(', ') : 'None';
    }
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Escape HTML special characters
 *
 * @private
 */
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Get HTML styles
 *
 * @private
 */
function getHTMLStyles() {
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
    .status-success { background: rgba(72, 187, 120, 0.3) !important; }
    .status-error { background: rgba(245, 101, 101, 0.3) !important; }
    .status-warning { background: rgba(237, 137, 54, 0.3) !important; }
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
    section h3 {
        margin: 20px 0 15px 0;
        color: #4a5568;
        font-size: 1.2em;
    }
    .params-grid, .meta-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 15px;
    }
    .param-item, .meta-item-detail {
        padding: 12px;
        background: #f7fafc;
        border-radius: 6px;
        border: 1px solid #e2e8f0;
    }
    .param-key, .meta-key {
        font-weight: 600;
        color: #4a5568;
        margin-right: 8px;
    }
    .param-value, .meta-value {
        color: #2d3748;
    }
    .metrics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 15px;
        margin-top: 15px;
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
    .details-content {
        background: #2d3748;
        color: #e2e8f0;
        padding: 20px;
        border-radius: 6px;
        overflow-x: auto;
        font-family: 'Courier New', monospace;
        font-size: 0.9em;
        line-height: 1.5;
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

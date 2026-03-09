/**
 * Generic Report Generator
 *
 * Generates HTML and JSON reports for all pipeline types.
 * Provides a consistent reporting interface across all AlephAuto workers.
 */

import fs from 'fs/promises';
import path from 'path';
import * as Sentry from '@sentry/node';
import { FORMATTING, GIT_ACTIVITY } from '../core/constants.ts';
import { createComponentLogger, logError } from './logger.ts';
import { TIME_MS } from '../core/units.ts';
import { formatDuration } from './time-helpers.ts';
import { escapeHtml, getBaseStyles } from './html-report-utils.ts';

const logger = createComponentLogger('ReportGenerator');

const DEFAULT_OUTPUT_DIR = path.join(process.cwd(), 'output/reports');

const METRIC_KEYS = [
  'metrics', 'stats', 'statistics', 'summary',
  'totalFiles', 'totalItems', 'totalRepositories',
  'enhanced', 'skipped', 'failed', 'success',
  'totalCommits', 'linesAdded', 'linesDeleted',
  'healthScore', 'issueCount', 'warningCount'
] as const;

interface ReportOptions {
  jobId: string;
  jobType: string;
  status: string;
  result: unknown;
  startTime: number;
  endTime: number;
  parameters?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  outputDir?: string;
}

interface ReportPaths {
  timestamp: string;
  html?: string;
  json?: string;
}

interface ReportData {
  jobId: string;
  jobType: string;
  status: string;
  result: unknown;
  startTime: number;
  endTime: number;
  parameters: Record<string, unknown>;
  metadata: Record<string, unknown>;
  timestamp: string;
}

/**
 * Generate reports for a completed job
 */
export async function generateReport(options: ReportOptions): Promise<ReportPaths> {
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

  if (!jobId || !jobType || !status) {
    throw new Error('Missing required fields: jobId, jobType, status');
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const baseName = `${jobType}-${timestamp}`;

  await fs.mkdir(outputDir, { recursive: true });

  const reportPaths: ReportPaths = {
    timestamp: new Date().toISOString()
  };

  try {
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
    await fs.writeFile(jsonPath, JSON.stringify(jsonContent, null, FORMATTING.JSON_INDENT));
    reportPaths.json = jsonPath;
    logger.info({ path: jsonPath }, 'JSON report generated');

    pruneOldReports(outputDir).catch(err => {
      logError(logger, err, 'Report pruning failed');
      Sentry.captureException(err, { tags: { component: 'ReportGenerator', operation: 'pruneOldReports' } });
    });

    return reportPaths;

  } catch (error) {
    logError(logger, error, 'Report generation failed');
    throw new Error(`Report generation failed: ${(error as Error).message}`);
  }
}

/**
 * generateHTMLReport.
 */
function generateHTMLReport(data: ReportData): string {
  const { jobId, jobType, status, result, startTime, endTime, parameters, metadata, timestamp } = data;
  const durationSec = endTime && startTime ? (endTime - startTime) / TIME_MS.SECOND : null;
  const duration = durationSec !== null ? formatDuration(durationSec) : 'N/A';
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
        ${generateHTMLResults(result)}
        ${generateHTMLFooter(timestamp)}
    </div>
</body>
</html>`;
}

/**
 * generateJSONReport.
 */
function generateJSONReport(data: ReportData): object {
  const { jobId, jobType, status, result, startTime, endTime, parameters, metadata, timestamp } = data;

  return {
    report_version: '1.0.0',
    generated_at: timestamp,
    job: {
      id: jobId,
      type: jobType,
      status,
      duration_seconds: endTime && startTime ? (endTime - startTime) / TIME_MS.SECOND : null,
      started_at: startTime ? new Date(startTime).toISOString() : null,
      completed_at: endTime ? new Date(endTime).toISOString() : null
    },
    parameters,
    metadata,
    result
  };
}

/**
 * generateHTMLHeader.
 */
function generateHTMLHeader(title: string, jobId: string, status: string, statusClass: string, timestamp: string, duration: string): string {
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
                <strong>Duration:</strong> ${duration}
            </span>
        </div>
    </header>`;
}

/**
 * generateHTMLParameters.
 */
function generateHTMLParameters(parameters: Record<string, unknown>): string {
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
 * generateHTMLMetadata.
 */
function generateHTMLMetadata(metadata: Record<string, unknown>): string {
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
 * generateHTMLResults.
 */
function generateHTMLResults(result: unknown): string {
  if (!result) {
    return `
    <section class="results">
        <h2>📊 Results</h2>
        <p class="empty-state">No results available</p>
    </section>`;
  }

  const resultObj = result as Record<string, unknown>;
  const metrics = extractMetrics(resultObj);
  const details = extractDetails(resultObj);

  return `
    <section class="results">
        <h2>📊 Results</h2>
        ${metrics ? generateMetricsSection(metrics) : ''}
        ${details ? generateDetailsSection(details) : ''}
    </section>`;
}

/**
 * generateMetricsSection.
 */
function generateMetricsSection(metrics: Record<string, unknown>): string {
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
 * generateDetailsSection.
 */
function generateDetailsSection(details: Record<string, unknown>): string {
  return `
    <div class="details-section">
        <h3>Details</h3>
        <pre class="details-content">${escapeHtml(JSON.stringify(details, null, FORMATTING.JSON_INDENT))}</pre>
    </div>`;
}

/**
 * generateHTMLFooter.
 */
function generateHTMLFooter(timestamp: string): string {
  return `
    <footer>
        <p>Generated by AlephAuto Pipeline Framework | ${new Date(timestamp).toLocaleString()}</p>
    </footer>`;
}

/**
 * extractMetrics.
 */
function extractMetrics(result: Record<string, unknown>): Record<string, unknown> | null {
  const metrics: Record<string, unknown> = {};

  for (const key of METRIC_KEYS) {
    if (result[key] !== undefined) {
      if (typeof result[key] === 'object' && !Array.isArray(result[key]) && result[key] !== null) {
        Object.assign(metrics, result[key] as Record<string, unknown>);
      } else {
        metrics[key] = result[key];
      }
    }
  }

  return Object.keys(metrics).length > 0 ? metrics : null;
}

/**
 * extractDetails.
 */
function extractDetails(result: Record<string, unknown>): Record<string, unknown> | null {
  const details: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(result)) {
    if (!METRIC_KEYS.includes(key as typeof METRIC_KEYS[number])) {
      details[key] = value;
    }
  }

  return Object.keys(details).length > 0 ? details : null;
}

/**
 * getJobTypeTitle.
 */
function getJobTypeTitle(jobType: string): string {
  const titles: Record<string, string> = {
    'claude-health': 'Claude Health Check Report',
    'git-activity': 'Git Activity Report',
    'gitignore-update': 'Gitignore Update Report',
    'repo-cleanup': 'Repository Cleanup Report',
    'repomix': 'Repomix Report',
    'schema-enhancement': 'Schema Enhancement Report',
    'duplicate-detection': 'Duplicate Detection Report',
    'test-refactor': 'Test Refactor Report'
  };

  return titles[jobType] ?? `${jobType} Report`;
}

/**
 * formatValue.
 */
function formatValue(value: unknown): string {
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
 * Remove reports older than the retention period (30 days).
 */
export async function pruneOldReports(outputDir: string = DEFAULT_OUTPUT_DIR, maxAgeMs: number = GIT_ACTIVITY.MONTHLY_WINDOW_DAYS * TIME_MS.DAY): Promise<void> {
  const cutoff = Date.now() - maxAgeMs;
  let entries;
  try {
    entries = await fs.readdir(outputDir, { withFileTypes: true });
  } catch {
    return;
  }

  const fileEntries = entries.filter(entry => entry.isFile());
  const statResults = await Promise.allSettled(
    fileEntries.map(async (entry) => {
      const filePath = path.join(outputDir, entry.name);
      const stat = await fs.stat(filePath);
      return { filePath, isExpired: stat.mtimeMs < cutoff };
    })
  );

  const toDelete = statResults
    .filter((r): r is PromiseFulfilledResult<{ filePath: string; isExpired: boolean }> => r.status === 'fulfilled' && r.value.isExpired)
    .map(r => r.value);

  const deleteResults = await Promise.allSettled(
    toDelete.map(r => fs.unlink(r.filePath))
  );

  const pruned = deleteResults.filter(r => r.status === 'fulfilled').length;
  if (pruned > 0) {
    logger.info({ pruned, dir: outputDir }, 'Pruned old reports');
  }
}

/**
 * getHTMLStyles — extends base styles with report-generator-specific additions.
 */
function getHTMLStyles(): string {
  return `
    ${getBaseStyles()}
    .status-success { background: rgba(72, 187, 120, 0.3) !important; }
    .status-error { background: rgba(245, 101, 101, 0.3) !important; }
    .status-warning { background: rgba(237, 137, 54, 0.3) !important; }
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
    .metrics-grid { margin-top: 15px; }
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
  `;
}

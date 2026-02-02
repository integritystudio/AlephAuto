/**
 * Report Coordinator
 *
 * Unified interface for generating duplicate detection reports in multiple formats.
 * Coordinates HTML, Markdown, and JSON report generation.
 */

import { HTMLReportGenerator } from './html-report-generator.js';
import { MarkdownReportGenerator } from './markdown-report-generator.js';
import { JSONReportGenerator } from './json-report-generator.js';
import { createComponentLogger } from '../../utils/logger.js';
import { createTimer, ensureDir } from '../utils/index.js';
import path from 'path';
import fs from 'fs/promises';

const logger = createComponentLogger('ReportCoordinator');

/**
 * Coordinates report generation across multiple formats
 */
export class ReportCoordinator {
  constructor(outputDir = null) {
    this.outputDir = outputDir || path.join(process.cwd(), 'output', 'reports');
  }

  /**
   * Generate all report formats for a scan
   *
   * @param {Object} scanResult - Scan result data
   * @param {Object} options - Report generation options
   * @returns {Promise<Object>} - Paths to generated reports
   */
  async generateAllReports(scanResult, options = {}) {
    const timer = createTimer();
    const isInterProject = scanResult.scan_type === 'inter-project';
    const scanType = isInterProject ? 'inter-project' : 'intra-project';

    // Generate filename base from repository or timestamp
    const baseFilename = this._generateBaseFilename(scanResult, isInterProject);

    logger.info({
      scanType,
      baseFilename
    }, 'Generating all report formats');

    try {
      // Ensure output directory exists
      await ensureDir(this.outputDir);

      // Generate all formats in parallel
      const [htmlPath, markdownPath, jsonPath, summaryPath] = await Promise.all([
        this.generateHTMLReport(scanResult, baseFilename, options),
        this.generateMarkdownReport(scanResult, baseFilename, options),
        this.generateJSONReport(scanResult, baseFilename, options),
        this.generateJSONSummary(scanResult, baseFilename)
      ]);

      const duration = timer.elapsed();

      const result = {
        html: htmlPath,
        markdown: markdownPath,
        json: jsonPath,
        summary: summaryPath,
        output_dir: this.outputDir,
        duration_seconds: duration
      };

      logger.info({
        ...result,
        duration
      }, 'All reports generated successfully');

      return result;
    } catch (error) {
      logger.error({ error }, 'Failed to generate reports');
      throw error;
    }
  }

  /**
   * Generate HTML report
   *
   * @param {Object} scanResult - Scan result data
   * @param {string} baseFilename - Base filename (without extension)
   * @param {Object} options - Report options
   * @returns {Promise<string>} - Path to generated report
   */
  async generateHTMLReport(scanResult, baseFilename = null, options = {}) {
    const filename = baseFilename || this._generateBaseFilename(scanResult);
    const outputPath = path.join(this.outputDir, `${filename}.html`);

    logger.info({ outputPath }, 'Generating HTML report');

    const htmlOptions = {
      title: options.title || this._generateTitle(scanResult),
      ...options.html
    };

    await HTMLReportGenerator.saveReport(scanResult, outputPath, htmlOptions);

    logger.info({ outputPath }, 'HTML report generated');
    return outputPath;
  }

  /**
   * Generate Markdown report
   *
   * @param {Object} scanResult - Scan result data
   * @param {string} baseFilename - Base filename (without extension)
   * @param {Object} options - Report options
   * @returns {Promise<string>} - Path to generated report
   */
  async generateMarkdownReport(scanResult, baseFilename = null, options = {}) {
    const filename = baseFilename || this._generateBaseFilename(scanResult);
    const outputPath = path.join(this.outputDir, `${filename}.md`);

    logger.info({ outputPath }, 'Generating Markdown report');

    const markdownOptions = {
      includeDetails: options.includeDetails !== false,
      maxDuplicates: options.maxDuplicates || 20,
      maxSuggestions: options.maxSuggestions || 20,
      ...options.markdown
    };

    await MarkdownReportGenerator.saveReport(scanResult, outputPath, markdownOptions);

    logger.info({ outputPath }, 'Markdown report generated');
    return outputPath;
  }

  /**
   * Generate JSON report
   *
   * @param {Object} scanResult - Scan result data
   * @param {string} baseFilename - Base filename (without extension)
   * @param {Object} options - Report options
   * @returns {Promise<string>} - Path to generated report
   */
  async generateJSONReport(scanResult, baseFilename = null, options = {}) {
    const filename = baseFilename || this._generateBaseFilename(scanResult);
    const outputPath = path.join(this.outputDir, `${filename}.json`);

    logger.info({ outputPath }, 'Generating JSON report');

    const jsonOptions = {
      includeSourceCode: options.includeSourceCode !== false,
      includeCodeBlocks: options.includeCodeBlocks !== false,
      prettyPrint: options.prettyPrint !== false,
      maxDuplicates: options.maxDuplicates || null,
      maxSuggestions: options.maxSuggestions || null,
      ...options.json
    };

    await JSONReportGenerator.saveReport(scanResult, outputPath, jsonOptions);

    logger.info({ outputPath }, 'JSON report generated');
    return outputPath;
  }

  /**
   * Generate JSON summary (concise)
   *
   * @param {Object} scanResult - Scan result data
   * @param {string} baseFilename - Base filename (without extension)
   * @returns {Promise<string>} - Path to generated summary
   */
  async generateJSONSummary(scanResult, baseFilename = null) {
    const filename = baseFilename || this._generateBaseFilename(scanResult);
    const outputPath = path.join(this.outputDir, `${filename}-summary.json`);

    logger.info({ outputPath }, 'Generating JSON summary');

    await JSONReportGenerator.saveSummary(scanResult, outputPath);

    logger.info({ outputPath }, 'JSON summary generated');
    return outputPath;
  }

  /**
   * Generate Markdown summary (concise)
   *
   * @param {Object} scanResult - Scan result data
   * @param {string} baseFilename - Base filename (without extension)
   * @returns {Promise<string>} - Path to generated summary
   */
  async generateMarkdownSummary(scanResult, baseFilename = null) {
    const filename = baseFilename || this._generateBaseFilename(scanResult);
    const outputPath = path.join(this.outputDir, `${filename}-summary.md`);

    logger.info({ outputPath }, 'Generating Markdown summary');

    await MarkdownReportGenerator.saveSummary(scanResult, outputPath);

    logger.info({ outputPath }, 'Markdown summary generated');
    return outputPath;
  }

  /**
   * Generate base filename from scan result
   *
   * @private
   */
  _generateBaseFilename(scanResult, isInterProject = null) {
    if (isInterProject === null) {
      isInterProject = scanResult.scan_type === 'inter-project';
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];

    if (isInterProject) {
      const repoCount = scanResult.scan_metadata?.repository_count || 0;
      return `inter-project-scan-${repoCount}repos-${timestamp}`;
    } else {
      const repoInfo = scanResult.repository_info || {};
      const repoName = (repoInfo.name || 'unknown')
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-');
      return `scan-${repoName}-${timestamp}`;
    }
  }

  /**
   * Generate report title
   *
   * @private
   */
  _generateTitle(scanResult) {
    const isInterProject = scanResult.scan_type === 'inter-project';

    if (isInterProject) {
      const repoCount = scanResult.scan_metadata?.repository_count || 0;
      return `Inter-Project Duplicate Detection Report (${repoCount} Repositories)`;
    } else {
      const repoInfo = scanResult.repository_info || {};
      return `Duplicate Detection Report: ${repoInfo.name || 'Unknown'}`;
    }
  }

  /**
   * Generate a quick summary string for terminal output
   *
   * @param {Object} scanResult - Scan result data
   * @returns {string} - Summary string
   */
  static generateQuickSummary(scanResult) {
    const isInterProject = scanResult.scan_type === 'inter-project';
    const metrics = scanResult.metrics || {};

    let summary = '\n';
    summary += '═══════════════════════════════════════════\n';
    summary += `  ${isInterProject ? 'INTER-PROJECT' : 'INTRA-PROJECT'} SCAN SUMMARY\n`;
    summary += '═══════════════════════════════════════════\n\n';

    if (isInterProject) {
      summary += `📚 Repositories Scanned:    ${metrics.total_repositories_scanned || 0}\n`;
      summary += `📦 Total Code Blocks:       ${metrics.total_code_blocks || 0}\n`;
      summary += `🔗 Cross-Repo Duplicates:   ${metrics.total_cross_repository_groups || 0}\n`;
      summary += `📏 Duplicated Lines:        ${metrics.cross_repository_duplicated_lines || 0}\n`;
      summary += `💡 Total Suggestions:       ${metrics.total_suggestions || 0}\n`;
      summary += `  ├─ Shared Package:        ${metrics.shared_package_candidates || 0}\n`;
      summary += `  └─ MCP Server:            ${metrics.mcp_server_candidates || 0}\n`;
    } else {
      summary += `📦 Code Blocks:             ${metrics.total_code_blocks || 0}\n`;
      summary += `🔄 Duplicate Groups:        ${metrics.total_duplicate_groups || 0}\n`;
      summary += `  ├─ Exact:                 ${metrics.exact_duplicates || 0}\n`;
      summary += `  └─ Structural:            ${metrics.structural_duplicates || 0}\n`;
      summary += `📏 Duplicated Lines:        ${metrics.total_duplicated_lines || 0}\n`;
      summary += `📉 Potential LOC Reduction: ${metrics.potential_loc_reduction || 0}\n`;
      summary += `💡 Total Suggestions:       ${metrics.total_suggestions || 0}\n`;
      summary += `⚡ Quick Wins:              ${metrics.quick_wins || 0}\n`;
    }

    summary += '\n═══════════════════════════════════════════\n';

    return summary;
  }

  /**
   * Print quick summary to console
   *
   * @param {Object} scanResult - Scan result data
   */
  static printQuickSummary(scanResult) {
    console.log(ReportCoordinator.generateQuickSummary(scanResult));
  }
}

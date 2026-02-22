/**
 * Report Coordinator
 *
 * Unified interface for generating duplicate detection reports in multiple formats.
 * Coordinates HTML, Markdown, and JSON report generation.
 */

import { HTMLReportGenerator } from './html-report-generator.ts';
import { MarkdownReportGenerator } from './markdown-report-generator.ts';
import { JSONReportGenerator } from './json-report-generator.ts';
import type { ScanResult } from './json-report-generator.ts';
import { createComponentLogger, logError } from '../../utils/logger.ts';
import { createTimer, ensureDir } from '../utils/index.ts';
import path from 'path';

const logger = createComponentLogger('ReportCoordinator');

export interface ReportOptions {
  title?: string;
  includeDetails?: boolean;
  maxDuplicates?: number | null;
  maxSuggestions?: number | null;
  includeSourceCode?: boolean;
  includeCodeBlocks?: boolean;
  prettyPrint?: boolean;
  html?: Record<string, unknown>;
  markdown?: Record<string, unknown>;
  json?: Record<string, unknown>;
}

export interface GeneratedReportPaths {
  html: string;
  markdown: string;
  json: string;
  summary: string;
  output_dir: string;
  duration_seconds: number;
}

/**
 * Coordinates report generation across multiple formats
 */
export class ReportCoordinator {
  outputDir: string;

  constructor(outputDir: string | null = null) {
    this.outputDir = outputDir ?? path.join(process.cwd(), 'output', 'reports');
  }

  /**
   * Generate all report formats for a scan
   */
  async generateAllReports(scanResult: ScanResult, options: ReportOptions = {}): Promise<GeneratedReportPaths> {
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

      const result: GeneratedReportPaths = {
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
      logError(logger, error, 'Failed to generate reports');
      throw error;
    }
  }

  /**
   * Generate HTML report
   */
  async generateHTMLReport(
    scanResult: ScanResult,
    baseFilename: string | null = null,
    options: ReportOptions = {}
  ): Promise<string> {
    const filename = baseFilename ?? this._generateBaseFilename(scanResult);
    const outputPath = path.join(this.outputDir, `${filename}.html`);

    logger.info({ outputPath }, 'Generating HTML report');

    const htmlOptions = {
      title: options.title ?? this._generateTitle(scanResult),
      ...options.html
    };

    await HTMLReportGenerator.saveReport(scanResult, outputPath, htmlOptions);

    logger.info({ outputPath }, 'HTML report generated');
    return outputPath;
  }

  /**
   * Generate Markdown report
   */
  async generateMarkdownReport(
    scanResult: ScanResult,
    baseFilename: string | null = null,
    options: ReportOptions = {}
  ): Promise<string> {
    const filename = baseFilename ?? this._generateBaseFilename(scanResult);
    const outputPath = path.join(this.outputDir, `${filename}.md`);

    logger.info({ outputPath }, 'Generating Markdown report');

    const markdownOptions = {
      includeDetails: options.includeDetails !== false,
      maxDuplicates: options.maxDuplicates ?? 20,
      maxSuggestions: options.maxSuggestions ?? 20,
      ...options.markdown
    };

    await MarkdownReportGenerator.saveReport(scanResult, outputPath, markdownOptions);

    logger.info({ outputPath }, 'Markdown report generated');
    return outputPath;
  }

  /**
   * Generate JSON report
   */
  async generateJSONReport(
    scanResult: ScanResult,
    baseFilename: string | null = null,
    options: ReportOptions = {}
  ): Promise<string> {
    const filename = baseFilename ?? this._generateBaseFilename(scanResult);
    const outputPath = path.join(this.outputDir, `${filename}.json`);

    logger.info({ outputPath }, 'Generating JSON report');

    const jsonOptions = {
      includeSourceCode: options.includeSourceCode !== false,
      includeCodeBlocks: options.includeCodeBlocks !== false,
      prettyPrint: options.prettyPrint !== false,
      maxDuplicates: options.maxDuplicates ?? null,
      maxSuggestions: options.maxSuggestions ?? null,
      ...options.json
    };

    await JSONReportGenerator.saveReport(scanResult, outputPath, jsonOptions);

    logger.info({ outputPath }, 'JSON report generated');
    return outputPath;
  }

  /**
   * Generate JSON summary (concise)
   */
  async generateJSONSummary(
    scanResult: ScanResult,
    baseFilename: string | null = null
  ): Promise<string> {
    const filename = baseFilename ?? this._generateBaseFilename(scanResult);
    const outputPath = path.join(this.outputDir, `${filename}-summary.json`);

    logger.info({ outputPath }, 'Generating JSON summary');

    await JSONReportGenerator.saveSummary(scanResult, outputPath);

    logger.info({ outputPath }, 'JSON summary generated');
    return outputPath;
  }

  /**
   * Generate Markdown summary (concise)
   */
  async generateMarkdownSummary(
    scanResult: ScanResult,
    baseFilename: string | null = null
  ): Promise<string> {
    const filename = baseFilename ?? this._generateBaseFilename(scanResult);
    const outputPath = path.join(this.outputDir, `${filename}-summary.md`);

    logger.info({ outputPath }, 'Generating Markdown summary');

    await MarkdownReportGenerator.saveSummary(scanResult, outputPath);

    logger.info({ outputPath }, 'Markdown summary generated');
    return outputPath;
  }

  /**
   * Generate base filename from scan result
   * @private
   */
  private _generateBaseFilename(scanResult: ScanResult, isInterProject: boolean | null = null): string {
    const isInter = isInterProject ?? (scanResult.scan_type === 'inter-project');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];

    if (isInter) {
      const repoCount = scanResult.scan_metadata?.repository_count ?? 0;
      return `inter-project-scan-${repoCount}repos-${timestamp}`;
    } else {
      const repoInfo = scanResult.repository_info ?? {};
      const repoName = (repoInfo.name ?? 'unknown')
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-');
      return `scan-${repoName}-${timestamp}`;
    }
  }

  /**
   * Generate report title
   * @private
   */
  private _generateTitle(scanResult: ScanResult): string {
    const isInterProject = scanResult.scan_type === 'inter-project';

    if (isInterProject) {
      const repoCount = scanResult.scan_metadata?.repository_count ?? 0;
      return `Inter-Project Duplicate Detection Report (${repoCount} Repositories)`;
    } else {
      const repoInfo = scanResult.repository_info ?? {};
      return `Duplicate Detection Report: ${repoInfo.name ?? 'Unknown'}`;
    }
  }

  /**
   * Generate a quick summary string for terminal output
   */
  static generateQuickSummary(scanResult: ScanResult): string {
    const isInterProject = scanResult.scan_type === 'inter-project';
    const metrics = scanResult.metrics ?? {};

    let summary = '\n';
    summary += '═══════════════════════════════════════════\n';
    summary += `  ${isInterProject ? 'INTER-PROJECT' : 'INTRA-PROJECT'} SCAN SUMMARY\n`;
    summary += '═══════════════════════════════════════════\n\n';

    if (isInterProject) {
      summary += `📚 Repositories Scanned:    ${metrics.total_repositories_scanned ?? 0}\n`;
      summary += `📦 Total Code Blocks:       ${metrics.total_code_blocks ?? 0}\n`;
      summary += `🔗 Cross-Repo Duplicates:   ${metrics.total_cross_repository_groups ?? 0}\n`;
      summary += `📏 Duplicated Lines:        ${metrics.cross_repository_duplicated_lines ?? 0}\n`;
      summary += `💡 Total Suggestions:       ${metrics.total_suggestions ?? 0}\n`;
      summary += `  ├─ Shared Package:        ${metrics.shared_package_candidates ?? 0}\n`;
      summary += `  └─ MCP Server:            ${metrics.mcp_server_candidates ?? 0}\n`;
    } else {
      summary += `📦 Code Blocks:             ${metrics.total_code_blocks ?? 0}\n`;
      summary += `🔄 Duplicate Groups:        ${metrics.total_duplicate_groups ?? 0}\n`;
      summary += `  ├─ Exact:                 ${metrics.exact_duplicates ?? 0}\n`;
      summary += `  └─ Structural:            ${metrics.structural_duplicates ?? 0}\n`;
      summary += `📏 Duplicated Lines:        ${metrics.total_duplicated_lines ?? 0}\n`;
      summary += `📉 Potential LOC Reduction: ${metrics.potential_loc_reduction ?? 0}\n`;
      summary += `💡 Total Suggestions:       ${metrics.total_suggestions ?? 0}\n`;
      summary += `⚡ Quick Wins:              ${metrics.quick_wins ?? 0}\n`;
    }

    summary += '\n═══════════════════════════════════════════\n';

    return summary;
  }

  /**
   * Print quick summary to console
   */
  static printQuickSummary(scanResult: ScanResult): void {
    logger.info(ReportCoordinator.generateQuickSummary(scanResult));
  }
}

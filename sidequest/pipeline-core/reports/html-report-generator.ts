/**
 * HTML Report Generator
 *
 * Generates interactive HTML dashboards for duplicate detection results.
 * Section generators extracted to html-report-sections.ts (AG-M1).
 */

import { saveGeneratedReport } from '../utils/index.ts';
import {
  escapeHtml,
  getScanReportStyles,
} from '../../utils/html-report-utils.ts';
import {
  generateHeader,
  generateMetrics,
  generateSummaryCharts,
  generateCrossRepoSection,
  generateDuplicateGroups,
  generateSuggestions,
  generateFooter,
} from './html-report-sections.ts';
import type { ScanResult } from './json-report-generator.ts';

export interface HTMLReportOptions {
  title?: string;
}

export class HTMLReportGenerator {
  static generateReport(scanResult: ScanResult, options: HTMLReportOptions = {}): string {
    const title = options.title ?? 'Duplicate Detection Report';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <style>
        ${getScanReportStyles()}
    </style>
</head>
<body>
    <div class="container">
        ${generateHeader(scanResult, title)}
        ${generateMetrics(scanResult)}
        ${generateSummaryCharts(scanResult)}
        ${scanResult.scan_type === 'inter-project' ? generateCrossRepoSection(scanResult) : ''}
        ${generateDuplicateGroups(scanResult)}
        ${generateSuggestions(scanResult)}
        ${generateFooter(scanResult)}
    </div>
    <script>
        // Add interactivity hooks here if needed.
    </script>
</body>
</html>`;

    return html;
  }

  static async saveReport(scanResult: ScanResult, outputPath: string, options: HTMLReportOptions = {}): Promise<string> {
    return saveGeneratedReport(outputPath, this.generateReport(scanResult, options));
  }
}

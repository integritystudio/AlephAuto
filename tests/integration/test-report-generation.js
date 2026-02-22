#!/usr/bin/env node

/**
 * Test script for report generation
 *
 * Tests both HTML and Markdown report generators with real scan data.
 * Usage: node test-report-generation.js [scan-results.json]
 */

import { HTMLReportGenerator } from '../../sidequest/pipeline-core/reports/html-report-generator.ts';
import { MarkdownReportGenerator } from '../../sidequest/pipeline-core/reports/markdown-report-generator.ts';
import { createComponentLogger } from '../../sidequest/utils/logger.ts';
import fs from 'fs/promises';
import path from 'path';

const logger = createComponentLogger('TestReports');

async function main() {
  const args = process.argv.slice(2);

  // Default: use inter-project scan results
  const scanResultPath = args.length > 0
    ? args[0]
    : path.join(process.cwd(), 'output', 'inter-project-scans', 'inter-project-scan.json');

  logger.info({ scanResultPath }, 'Loading scan results');

  try {
    // Load scan results
    const scanResultData = await fs.readFile(scanResultPath, 'utf8');
    const scanResult = JSON.parse(scanResultData);

    logger.info({
      scanType: scanResult.scan_type,
      codeBlocks: scanResult.scan_metadata?.total_code_blocks,
      duplicateGroups: scanResult.metrics?.total_duplicate_groups || scanResult.metrics?.total_cross_repository_groups
    }, 'Scan results loaded');

    // Generate output paths
    const baseName = path.basename(scanResultPath, '.json');
    const outputDir = path.join(process.cwd(), 'output', 'reports');
    const htmlPath = path.join(outputDir, `${baseName}.html`);
    const markdownPath = path.join(outputDir, `${baseName}.md`);
    const summaryPath = path.join(outputDir, `${baseName}-summary.md`);

    console.log('\n' + '='.repeat(80));
    console.log('REPORT GENERATION TEST');
    console.log('='.repeat(80));

    // Test 1: Generate HTML report
    console.log('\n1. Generating HTML report...');
    logger.info({ outputPath: htmlPath }, 'Generating HTML report');

    const htmlOutput = await HTMLReportGenerator.saveReport(
      scanResult,
      htmlPath,
      {
        title: scanResult.scan_type === 'inter-project'
          ? 'Inter-Project Duplicate Detection Report'
          : 'Duplicate Detection Report'
      }
    );

    const htmlStats = await fs.stat(htmlOutput);
    console.log(`   ✅ HTML report generated: ${htmlOutput}`);
    console.log(`   📊 Size: ${(htmlStats.size / 1024).toFixed(2)} KB`);

    // Test 2: Generate Markdown report
    console.log('\n2. Generating Markdown report...');
    logger.info({ outputPath: markdownPath }, 'Generating Markdown report');

    const markdownOutput = await MarkdownReportGenerator.saveReport(
      scanResult,
      markdownPath,
      {
        includeDetails: true,
        maxDuplicates: 10,
        maxSuggestions: 10
      }
    );

    const markdownStats = await fs.stat(markdownOutput);
    console.log(`   ✅ Markdown report generated: ${markdownOutput}`);
    console.log(`   📊 Size: ${(markdownStats.size / 1024).toFixed(2)} KB`);

    // Test 3: Generate concise summary
    console.log('\n3. Generating concise summary...');
    logger.info({ outputPath: summaryPath }, 'Generating summary');

    const summaryOutput = await MarkdownReportGenerator.saveSummary(
      scanResult,
      summaryPath
    );

    const summaryStats = await fs.stat(summaryOutput);
    console.log(`   ✅ Summary generated: ${summaryOutput}`);
    console.log(`   📊 Size: ${(summaryStats.size / 1024).toFixed(2)} KB`);

    // Display summary content
    console.log('\n' + '='.repeat(80));
    console.log('QUICK SUMMARY');
    console.log('='.repeat(80));

    const summaryContent = await fs.readFile(summaryOutput, 'utf8');
    console.log('\n' + summaryContent);

    // Display first few lines of Markdown report
    console.log('='.repeat(80));
    console.log('MARKDOWN REPORT PREVIEW');
    console.log('='.repeat(80));

    const markdownContent = await fs.readFile(markdownOutput, 'utf8');
    const lines = markdownContent.split('\n');
    console.log('\n' + lines.slice(0, 30).join('\n'));
    if (lines.length > 30) {
      console.log(`\n... and ${lines.length - 30} more lines`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('REPORT GENERATION COMPLETED');
    console.log('='.repeat(80));
    console.log(`\nHTML:     ${htmlOutput}`);
    console.log(`Markdown: ${markdownOutput}`);
    console.log(`Summary:  ${summaryOutput}`);
    console.log('='.repeat(80) + '\n');

    logger.info('Report generation test completed successfully');

  } catch (error) {
    logger.error({ error }, 'Report generation test failed');
    console.error('\nError:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

main();

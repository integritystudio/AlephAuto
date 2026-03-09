#!/usr/bin/env node

/**
 * Test script for report generation
 *
 * Tests both HTML and Markdown report generators with real scan data.
 * Usage: node test-report-generation.js [scan-results.json]
 */

import { HTMLReportGenerator } from '../../sidequest/pipeline-core/reports/html-report-generator.ts';
import { MarkdownReportGenerator } from '../../sidequest/pipeline-core/reports/markdown-report-generator.ts';
import { BYTES_PER_KB } from '../../sidequest/core/constants.ts';
import { createComponentLogger } from '../../sidequest/utils/logger.ts';
import { TestOutputFormat } from '../constants/output-format-constants.ts';
import fs from 'fs/promises';
import path from 'path';

const logger = createComponentLogger('TestReports');

async function loadScanResults(scanResultPath) {
  const scanResultData = await fs.readFile(scanResultPath, 'utf8');
  const scanResult = JSON.parse(scanResultData);

  logger.info({
    scanType: scanResult.scan_type,
    codeBlocks: scanResult.scan_metadata?.total_code_blocks,
    duplicateGroups: scanResult.metrics?.total_duplicate_groups || scanResult.metrics?.total_cross_repository_groups
  }, 'Scan results loaded');

  return scanResult;
}

async function generateHtmlReport(scanResult, htmlPath) {
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
  console.log(`   📊 Size: ${(htmlStats.size / BYTES_PER_KB).toFixed(2)} KB`);

  return htmlOutput;
}

async function generateMarkdownReport(scanResult, markdownPath) {
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
  console.log(`   📊 Size: ${(markdownStats.size / BYTES_PER_KB).toFixed(2)} KB`);

  return markdownOutput;
}

async function generateSummary(scanResult, summaryPath) {
  console.log('\n3. Generating concise summary...');
  logger.info({ outputPath: summaryPath }, 'Generating summary');

  const summaryOutput = await MarkdownReportGenerator.saveSummary(
    scanResult,
    summaryPath
  );

  const summaryStats = await fs.stat(summaryOutput);
  console.log(`   ✅ Summary generated: ${summaryOutput}`);
  console.log(`   📊 Size: ${(summaryStats.size / BYTES_PER_KB).toFixed(2)} KB`);

  return summaryOutput;
}

async function displayResults(summaryOutput, markdownOutput, htmlOutput) {
  console.log('\n' + '='.repeat(TestOutputFormat.WIDE_SEPARATOR_WIDTH));
  console.log('QUICK SUMMARY');
  console.log('='.repeat(TestOutputFormat.WIDE_SEPARATOR_WIDTH));

  const summaryContent = await fs.readFile(summaryOutput, 'utf8');
  console.log('\n' + summaryContent);

  console.log('='.repeat(TestOutputFormat.WIDE_SEPARATOR_WIDTH));
  console.log('MARKDOWN REPORT PREVIEW');
  console.log('='.repeat(TestOutputFormat.WIDE_SEPARATOR_WIDTH));

  const markdownContent = await fs.readFile(markdownOutput, 'utf8');
  const lines = markdownContent.split('\n');
  console.log('\n' + lines.slice(0, 30).join('\n'));
  if (lines.length > 30) {
    console.log(`\n... and ${lines.length - 30} more lines`);
  }

  console.log('\n' + '='.repeat(TestOutputFormat.WIDE_SEPARATOR_WIDTH));
  console.log('REPORT GENERATION COMPLETED');
  console.log('='.repeat(TestOutputFormat.WIDE_SEPARATOR_WIDTH));
  console.log(`\nHTML:     ${htmlOutput}`);
  console.log(`Markdown: ${markdownOutput}`);
  console.log(`Summary:  ${summaryOutput}`);
  console.log('='.repeat(TestOutputFormat.WIDE_SEPARATOR_WIDTH) + '\n');
}

async function main() {
  const args = process.argv.slice(2);

  // Default: use inter-project scan results
  const scanResultPath = args.length > 0
    ? args[0]
    : path.join(process.cwd(), 'output', 'inter-project-scans', 'inter-project-scan.json');

  logger.info({ scanResultPath }, 'Loading scan results');

  try {
    const scanResult = await loadScanResults(scanResultPath);

    const baseName = path.basename(scanResultPath, '.json');
    const outputDir = path.join(process.cwd(), 'output', 'reports');
    const htmlPath = path.join(outputDir, `${baseName}.html`);
    const markdownPath = path.join(outputDir, `${baseName}.md`);
    const summaryPath = path.join(outputDir, `${baseName}-summary.md`);

    console.log('\n' + '='.repeat(TestOutputFormat.WIDE_SEPARATOR_WIDTH));
    console.log('REPORT GENERATION TEST');
    console.log('='.repeat(TestOutputFormat.WIDE_SEPARATOR_WIDTH));

    const htmlOutput = await generateHtmlReport(scanResult, htmlPath);
    const markdownOutput = await generateMarkdownReport(scanResult, markdownPath);
    const summaryOutput = await generateSummary(scanResult, summaryPath);

    await displayResults(summaryOutput, markdownOutput, htmlOutput);

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

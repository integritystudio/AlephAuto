#!/usr/bin/env node

/**
 * Inter-Project Scanner Test Script
 *
 * Tests the inter-project duplicate detection pipeline by scanning multiple repositories
 * and generating reports in all formats (HTML, Markdown, JSON).
 *
 * Usage:
 *   node test-inter-project-scan.js [repo1] [repo2] [...]
 *   node test-inter-project-scan.js ~/code/project1 ~/code/project2
 *
 * If no arguments provided, defaults to scanning 'sidequest' and 'lib' directories.
 */

import { InterProjectScanner } from '../../sidequest/pipeline-core/inter-project-scanner.ts';
import { ReportCoordinator } from '../../sidequest/pipeline-core/reports/report-coordinator.ts';
import { createComponentLogger } from '../../sidequest/utils/logger.ts';
import path from 'path';

const logger = createComponentLogger('TestInterProject');

/**
 * resolveRepositoryPaths.
 */
function resolveRepositoryPaths(args: string[]) {
  return args.length > 0
    ? args.map(arg => (path.isAbsolute(arg) ? arg : path.resolve(process.cwd(), arg)))
    : [
        path.join(process.cwd(), 'sidequest'),
        path.join(process.cwd(), 'lib')
      ];
}

/**
 * printHeader.
 */
function printHeader(repoPaths: string[]) {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     INTER-PROJECT DUPLICATE DETECTION TEST              ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  console.log('📚 Repositories to scan:');
  repoPaths.forEach((repoPath, index) => {
    console.log(`   ${index + 1}. ${repoPath}`);
  });
  console.log('');
}

/**
 * createInterProjectScanner.
 */
function createInterProjectScanner() {
  return new InterProjectScanner({
    orchestrator: {
      scanner: {
        outputBaseDir: path.join(process.cwd(), 'output', 'scan-tests')
      },
      detector: {
        rulesDirectory: path.join(process.cwd(), '.ast-grep', 'rules'),
        configPath: path.join(process.cwd(), '.ast-grep', 'sgconfig.yml')
      },
      // Let ScanOrchestrator auto-detect Python path
      extractorScript: path.join(process.cwd(), 'sidequest', 'pipeline-core', 'extractors', 'extract_blocks.py')
    },
    outputDir: path.join(process.cwd(), 'output', 'inter-project-scans')
  });
}

/**
 * runScan.
 */
async function runScan(scanner: InterProjectScanner, repoPaths: string[]) {
  console.log('🔍 Starting inter-project scan...\n');
  const startTime = Date.now();
  const result = await scanner.scanRepositories(repoPaths, {
    pattern_config: {
      languages: ['javascript', 'typescript']
    }
  });

  const duration = (Date.now() - startTime) / 1000;
  console.log(`✅ Scan completed in ${duration.toFixed(2)}s\n`);
  return { result, duration };
}

/**
 * generateReports.
 */
async function generateReports(result: Record<string, unknown>, repositoryCount: number) {
  console.log('📝 Generating reports...\n');
  const reportCoordinator = new ReportCoordinator();

  return reportCoordinator.generateAllReports(result, {
    title: `Inter-Project Scan: ${repositoryCount} Repositories`,
    includeDetails: true,
    includeSourceCode: true,
    includeCodeBlocks: true
  });
}

/**
 * printReportLocations.
 */
function printReportLocations(reportPaths: Record<string, string>) {
  console.log('✅ Reports generated successfully:\n');
  console.log(`   📄 HTML:     ${reportPaths.html}`);
  console.log(`   📝 Markdown: ${reportPaths.markdown}`);
  console.log(`   📊 JSON:     ${reportPaths.json}`);
  console.log(`   📋 Summary:  ${reportPaths.summary}\n`);
}

/**
 * printTopCrossRepositoryDuplicates.
 */
function printTopCrossRepositoryDuplicates(result: Record<string, unknown>) {
  const duplicates = result.cross_repository_duplicates as Array<Record<string, unknown>> | undefined;
  if (!duplicates || duplicates.length === 0) {
    return;
  }

  console.log('🔗 Top Cross-Repository Duplicates:\n');
  const topGroups = duplicates
    .sort((a, b) => (b.impact_score as number) - (a.impact_score as number))
    .slice(0, 5);

  topGroups.forEach((group, index) => {
    console.log(`   ${index + 1}. ${group.group_id}`);
    console.log(`      Pattern: ${group.pattern_id}`);
    console.log(`      Repositories: ${group.repository_count} (${(group.affected_repositories as string[]).join(', ')})`);
    console.log(`      Occurrences: ${group.occurrence_count}`);
    console.log(`      Impact Score: ${(group.impact_score as number).toFixed(1)}/100`);
    console.log(`      Files: ${(group.affected_files as string[]).slice(0, 3).join(', ')}${(group.affected_files as string[]).length > 3 ? '...' : ''}`);
    console.log('');
  });
}

/**
 * printTopSuggestions.
 */
function printTopSuggestions(result: Record<string, unknown>) {
  const suggestions = result.cross_repository_suggestions as Array<Record<string, unknown>> | undefined;
  if (!suggestions || suggestions.length === 0) {
    return;
  }

  console.log('💡 Top Consolidation Suggestions:\n');
  const topSuggestions = suggestions
    .sort((a, b) => (b.roi_score as number) - (a.roi_score as number))
    .slice(0, 5);

  topSuggestions.forEach((suggestion, index) => {
    console.log(`   ${index + 1}. ${suggestion.suggestion_id}`);
    console.log(`      Strategy: ${suggestion.strategy}`);
    console.log(`      Target: ${suggestion.target_location}`);
    console.log(`      ROI Score: ${(suggestion.roi_score as number).toFixed(1)}/100`);
    console.log(`      Complexity: ${suggestion.complexity}`);
    console.log(`      Risk: ${suggestion.migration_risk}`);
    console.log(`      Effort: ${suggestion.estimated_effort_hours}h`);
    console.log(`      Repos: ${(suggestion.affected_repositories as string[]).join(', ')}`);
    console.log('');
  });
}

/**
 * printDetailedResults.
 */
function printDetailedResults(result: Record<string, unknown>) {
  const scannedRepositories = (result.scanned_repositories as Array<Record<string, unknown>>) || [];
  const metrics = (result.metrics as Record<string, unknown>) || {};

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║               DETAILED SCAN RESULTS                      ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  console.log('\nScanned Repositories:');
  for (const repo of scannedRepositories) {
    const status = repo.error ? `ERROR: ${repo.error}` : `✓ ${repo.code_blocks} blocks`;
    console.log(`  ${repo.name}: ${status}`);
  }

  console.log('\nMetrics:');
  console.log(`  Total Repositories: ${metrics.total_repositories_scanned}`);
  console.log(`  Total Code Blocks: ${metrics.total_code_blocks}`);
  console.log(`  Intra-Project Groups: ${metrics.total_intra_project_groups}`);
  console.log(`  Cross-Repository Groups: ${metrics.total_cross_repository_groups}`);
  console.log(`  Cross-Repo Occurrences: ${metrics.cross_repository_occurrences}`);
  console.log(`  Cross-Repo Duplicated Lines: ${metrics.cross_repository_duplicated_lines}`);
  console.log(`  Suggestions: ${metrics.total_suggestions}`);
  console.log(`  Shared Package Candidates: ${metrics.shared_package_candidates}`);
  console.log(`  MCP Server Candidates: ${metrics.mcp_server_candidates}`);
  console.log(`  Avg Repos per Duplicate: ${metrics.average_repositories_per_duplicate}`);

  printTopCrossRepositoryDuplicates(result);
  printTopSuggestions(result);
}

/**
 * printCompletionBanner.
 */
function printCompletionBanner() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║                   TEST COMPLETED                         ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
}

/**
 * main.
 */
async function main() {
  const args = process.argv.slice(2);
  const repoPaths = resolveRepositoryPaths(args);
  printHeader(repoPaths);

  logger.info({ repositories: repoPaths }, 'Starting inter-project test scan');

  try {
    const scanner = createInterProjectScanner();
    const { result, duration } = await runScan(scanner, repoPaths);

    ReportCoordinator.printQuickSummary(result);
    const reportPaths = await generateReports(result, repoPaths.length);
    printReportLocations(reportPaths);
    printDetailedResults(result);
    const fullResultsPath = await scanner.saveResults(result);
    console.log(`💾 Full results saved to: ${fullResultsPath}\n`);
    printCompletionBanner();

    logger.info({
      repositoryCount: repoPaths.length,
      duration,
      ...result.metrics
    }, 'Inter-project test scan completed successfully');

  } catch (error) {
    logger.error({ error }, 'Inter-project test scan failed');
    console.error('\nError:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

main();

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

import { InterProjectScanner } from '../../sidequest/pipeline-core/inter-project-scanner.js';
import { ReportCoordinator } from '../../sidequest/pipeline-core/reports/report-coordinator.js';
import { createComponentLogger } from '../../sidequest/logger.js';
import path from 'path';

const logger = createComponentLogger('TestInterProject');

async function main() {
  const args = process.argv.slice(2);

  // Default: scan sidequest and lib directories
  const repoPaths = args.length > 0
    ? args.map(arg => path.isAbsolute(arg) ? arg : path.resolve(process.cwd(), arg))
    : [
        path.join(process.cwd(), 'sidequest'),
        path.join(process.cwd(), 'lib')
      ];

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     INTER-PROJECT DUPLICATE DETECTION TEST              ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  console.log('📚 Repositories to scan:');
  repoPaths.forEach((repoPath, index) => {
    console.log(`   ${index + 1}. ${repoPath}`);
  });
  console.log('');

  logger.info({ repositories: repoPaths }, 'Starting inter-project test scan');

  try {
    // Create scanner
    const scanner = new InterProjectScanner({
      orchestrator: {
        scanner: {
          outputBaseDir: path.join(process.cwd(), 'output', 'scan-tests')
        },
        detector: {
          rulesDirectory: path.join(process.cwd(), '.ast-grep', 'rules'),
          configPath: path.join(process.cwd(), '.ast-grep', 'sgconfig.yml')
        },
        pythonPath: path.join(process.cwd(), 'venv', 'bin', 'python3'),
        extractorScript: path.join(process.cwd(), 'lib', 'extractors', 'extract_blocks.py')
      },
      outputDir: path.join(process.cwd(), 'output', 'inter-project-scans')
    });

    // Run inter-project scan
    console.log('🔍 Starting inter-project scan...\n');
    const startTime = Date.now();

    const result = await scanner.scanRepositories(repoPaths, {
      pattern_config: {
        languages: ['javascript', 'typescript']
      }
    });

    const duration = (Date.now() - startTime) / 1000;
    console.log(`✅ Scan completed in ${duration.toFixed(2)}s\n`);

    // Display quick summary
    ReportCoordinator.printQuickSummary(result);

    // Generate all report formats
    console.log('📝 Generating reports...\n');

    const reportCoordinator = new ReportCoordinator();
    const reportPaths = await reportCoordinator.generateAllReports(result, {
      title: `Inter-Project Scan: ${repoPaths.length} Repositories`,
      includeDetails: true,
      includeSourceCode: true,
      includeCodeBlocks: true
    });

    // Display report locations
    console.log('✅ Reports generated successfully:\n');
    console.log(`   📄 HTML:     ${reportPaths.html}`);
    console.log(`   📝 Markdown: ${reportPaths.markdown}`);
    console.log(`   📊 JSON:     ${reportPaths.json}`);
    console.log(`   📋 Summary:  ${reportPaths.summary}\n`);

    // Display detailed results
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║               DETAILED SCAN RESULTS                      ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    console.log('\nScanned Repositories:');
    for (const repo of result.scanned_repositories) {
      const status = repo.error ? `ERROR: ${repo.error}` : `✓ ${repo.code_blocks} blocks`;
      console.log(`  ${repo.name}: ${status}`);
    }

    console.log('\nMetrics:');
    console.log(`  Total Repositories: ${result.metrics.total_repositories_scanned}`);
    console.log(`  Total Code Blocks: ${result.metrics.total_code_blocks}`);
    console.log(`  Intra-Project Groups: ${result.metrics.total_intra_project_groups}`);
    console.log(`  Cross-Repository Groups: ${result.metrics.total_cross_repository_groups}`);
    console.log(`  Cross-Repo Occurrences: ${result.metrics.cross_repository_occurrences}`);
    console.log(`  Cross-Repo Duplicated Lines: ${result.metrics.cross_repository_duplicated_lines}`);
    console.log(`  Suggestions: ${result.metrics.total_suggestions}`);
    console.log(`  Shared Package Candidates: ${result.metrics.shared_package_candidates}`);
    console.log(`  MCP Server Candidates: ${result.metrics.mcp_server_candidates}`);
    console.log(`  Avg Repos per Duplicate: ${result.metrics.average_repositories_per_duplicate}`);

    if (result.cross_repository_duplicates && result.cross_repository_duplicates.length > 0) {
      console.log('🔗 Top Cross-Repository Duplicates:\n');
      const topGroups = result.cross_repository_duplicates
        .sort((a, b) => b.impact_score - a.impact_score)
        .slice(0, 5);

      topGroups.forEach((group, index) => {
        console.log(`   ${index + 1}. ${group.group_id}`);
        console.log(`      Pattern: ${group.pattern_id}`);
        console.log(`      Repositories: ${group.repository_count} (${group.affected_repositories.join(', ')})`);
        console.log(`      Occurrences: ${group.occurrence_count}`);
        console.log(`      Impact Score: ${group.impact_score.toFixed(1)}/100`);
        console.log(`      Files: ${group.affected_files.slice(0, 3).join(', ')}${group.affected_files.length > 3 ? '...' : ''}`);
        console.log('');
      });
    }

    if (result.cross_repository_suggestions && result.cross_repository_suggestions.length > 0) {
      console.log('💡 Top Consolidation Suggestions:\n');
      const topSuggestions = result.cross_repository_suggestions
        .sort((a, b) => b.roi_score - a.roi_score)
        .slice(0, 5);

      topSuggestions.forEach((suggestion, index) => {
        console.log(`   ${index + 1}. ${suggestion.suggestion_id}`);
        console.log(`      Strategy: ${suggestion.strategy}`);
        console.log(`      Target: ${suggestion.target_location}`);
        console.log(`      ROI Score: ${suggestion.roi_score.toFixed(1)}/100`);
        console.log(`      Complexity: ${suggestion.complexity}`);
        console.log(`      Risk: ${suggestion.migration_risk}`);
        console.log(`      Effort: ${suggestion.estimated_effort_hours}h`);
        console.log(`      Repos: ${suggestion.affected_repositories.join(', ')}`);
        console.log('');
      });
    }

    // Save full results to JSON
    const fullResultsPath = await scanner.saveResults(result);
    console.log(`💾 Full results saved to: ${fullResultsPath}\n`);

    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║                   TEST COMPLETED                         ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

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

#!/usr/bin/env node

/**
 * Test script for duplicate detection pipeline
 *
 * Usage: node test-scan-pipeline.js [repository-path]
 */

import { ScanOrchestrator } from '../../sidequest/pipeline-core/scan-orchestrator.ts';
import { createComponentLogger } from '../../sidequest/utils/logger.ts';
import path from 'path';
import fs from 'fs/promises';

const logger = createComponentLogger('TestPipeline');

function printScanMetrics(metrics: Record<string, number>) {
  console.log('\nMetrics:');
  console.log(`  Code Blocks Detected: ${metrics.total_code_blocks}`);
  console.log(`  Duplicate Groups: ${metrics.total_duplicate_groups}`);
  console.log(`  Exact Duplicates: ${metrics.exact_duplicates}`);
  console.log(`  Duplicated Lines: ${metrics.total_duplicated_lines}`);
  console.log(`  Potential LOC Reduction: ${metrics.potential_loc_reduction}`);
  console.log(`  Suggestions: ${metrics.total_suggestions}`);
  console.log(`  Quick Wins: ${metrics.quick_wins}`);
}

function printTopGroups(groups: any[]) {
  if (!groups?.length) return;
  console.log('\nTop Duplicate Groups:');
  const topGroups = groups.sort((a, b) => b.impact_score - a.impact_score).slice(0, 5);
  for (const group of topGroups) {
    console.log(`\n  Group ${group.group_id}:`);
    console.log(`    Pattern: ${group.pattern_id}`);
    console.log(`    Occurrences: ${group.occurrence_count}`);
    console.log(`    Impact Score: ${group.impact_score.toFixed(2)}/100`);
    const files = group.affected_files.slice(0, 3).join(', ');
    console.log(`    Files: ${files}${group.affected_files.length > 3 ? '...' : ''}`);
  }
}

function printTopSuggestions(suggestions: any[]) {
  if (!suggestions?.length) return;
  console.log('\nTop Suggestions:');
  const top = suggestions.sort((a, b) => b.roi_score - a.roi_score).slice(0, 3);
  for (const s of top) {
    console.log(`\n  ${s.suggestion_id}:`);
    console.log(`    Strategy: ${s.strategy}`);
    console.log(`    Rationale: ${s.strategy_rationale}`);
    console.log(`    Impact: ${s.impact_score.toFixed(2)}/100`);
    console.log(`    ROI: ${s.roi_score.toFixed(2)}/100`);
    console.log(`    Complexity: ${s.complexity}`);
    console.log(`    Risk: ${s.migration_risk}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const repoPath = args[0] || path.join(process.cwd(), 'sidequest');

  logger.info({ repoPath }, 'Starting test scan');

  try {
    await fs.access(repoPath);

    const orchestrator = new ScanOrchestrator({
      scanner: { outputBaseDir: path.join(process.cwd(), 'output', 'scan-tests') },
      detector: {
        rulesDirectory: path.join(process.cwd(), '.ast-grep', 'rules'),
        configPath: path.join(process.cwd(), '.ast-grep', 'sgconfig.yml')
      },
      extractorScript: path.join(process.cwd(), 'sidequest', 'pipeline-core', 'extractors', 'extract_blocks.py')
    });

    logger.info('Running duplicate detection scan...');
    const result = await orchestrator.scanRepository(repoPath, {
      pattern_config: { languages: ['javascript', 'typescript'] }
    });

    console.log('\n' + '='.repeat(80));
    console.log('SCAN RESULTS');
    console.log('='.repeat(80));

    printScanMetrics(result.metrics);
    printTopGroups(result.duplicate_groups);
    printTopSuggestions(result.suggestions);

    const outputPath = path.join(process.cwd(), 'output', 'scan-tests', 'latest-scan.json');
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(result, null, 2));

    console.log(`\n\nFull results saved to: ${outputPath}`);
    console.log('='.repeat(80) + '\n');
    logger.info('Test scan completed successfully');

  } catch (error) {
    logger.error({ error }, 'Test scan failed');
    console.error('\nError:', error.message);
    if (error.cause) console.error('Caused by:', error.cause.message);
    process.exit(1);
  }
}

main();

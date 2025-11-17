#!/usr/bin/env node

/**
 * Test script for duplicate detection pipeline
 *
 * Usage: node test-scan-pipeline.js [repository-path]
 */

import { ScanOrchestrator } from './lib/scan-orchestrator.js';
import { createComponentLogger } from './sidequest/logger.js';
import path from 'path';
import fs from 'fs/promises';

const logger = createComponentLogger('TestPipeline');

async function main() {
  const args = process.argv.slice(2);
  const repoPath = args[0] || path.join(process.cwd(), 'sidequest');

  logger.info({ repoPath }, 'Starting test scan');

  try {
    // Verify repository exists
    await fs.access(repoPath);

    // Create orchestrator
    const orchestrator = new ScanOrchestrator({
      scanner: {
        outputBaseDir: path.join(process.cwd(), 'output', 'scan-tests')
      },
      detector: {
        rulesDirectory: path.join(process.cwd(), '.ast-grep', 'rules'),
        configPath: path.join(process.cwd(), '.ast-grep', 'sgconfig.yml')
      },
      pythonPath: path.join(process.cwd(), 'venv', 'bin', 'python3'),
      extractorScript: path.join(process.cwd(), 'lib', 'extractors', 'extract_blocks.py')
    });

    // Run scan
    logger.info('Running duplicate detection scan...');
    const result = await orchestrator.scanRepository(repoPath, {
      pattern_config: {
        languages: ['javascript', 'typescript']
      }
    });

    // Display results
    console.log('\n' + '='.repeat(80));
    console.log('SCAN RESULTS');
    console.log('='.repeat(80));

    console.log('\nMetrics:');
    console.log(`  Code Blocks Detected: ${result.metrics.total_code_blocks}`);
    console.log(`  Duplicate Groups: ${result.metrics.total_duplicate_groups}`);
    console.log(`  Exact Duplicates: ${result.metrics.exact_duplicates}`);
    console.log(`  Duplicated Lines: ${result.metrics.total_duplicated_lines}`);
    console.log(`  Potential LOC Reduction: ${result.metrics.potential_loc_reduction}`);
    console.log(`  Suggestions: ${result.metrics.total_suggestions}`);
    console.log(`  Quick Wins: ${result.metrics.quick_wins}`);

    if (result.duplicate_groups && result.duplicate_groups.length > 0) {
      console.log('\nTop Duplicate Groups:');
      const topGroups = result.duplicate_groups
        .sort((a, b) => b.impact_score - a.impact_score)
        .slice(0, 5);

      for (const group of topGroups) {
        console.log(`\n  Group ${group.group_id}:`);
        console.log(`    Pattern: ${group.pattern_id}`);
        console.log(`    Occurrences: ${group.occurrence_count}`);
        console.log(`    Impact Score: ${group.impact_score.toFixed(2)}/100`);
        console.log(`    Files: ${group.affected_files.slice(0, 3).join(', ')}${group.affected_files.length > 3 ? '...' : ''}`);
      }
    }

    if (result.suggestions && result.suggestions.length > 0) {
      console.log('\nTop Suggestions:');
      const topSuggestions = result.suggestions
        .sort((a, b) => b.roi_score - a.roi_score)
        .slice(0, 3);

      for (const suggestion of topSuggestions) {
        console.log(`\n  ${suggestion.suggestion_id}:`);
        console.log(`    Strategy: ${suggestion.strategy}`);
        console.log(`    Rationale: ${suggestion.strategy_rationale}`);
        console.log(`    Impact: ${suggestion.impact_score.toFixed(2)}/100`);
        console.log(`    ROI: ${suggestion.roi_score.toFixed(2)}/100`);
        console.log(`    Complexity: ${suggestion.complexity}`);
        console.log(`    Risk: ${suggestion.migration_risk}`);
      }
    }

    // Save full results
    const outputPath = path.join(process.cwd(), 'output', 'scan-tests', 'latest-scan.json');
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(result, null, 2));

    console.log(`\n\nFull results saved to: ${outputPath}`);
    console.log('='.repeat(80) + '\n');

    logger.info('Test scan completed successfully');

  } catch (error) {
    logger.error({ error }, 'Test scan failed');
    console.error('\nError:', error.message);
    if (error.cause) {
      console.error('Caused by:', error.cause.message);
    }
    process.exit(1);
  }
}

main();

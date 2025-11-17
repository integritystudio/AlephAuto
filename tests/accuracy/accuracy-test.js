#!/usr/bin/env node

/**
 * Accuracy Test Suite for Duplicate Detection
 *
 * Tests the duplicate detection pipeline against a repository with known duplicates
 * and measures precision, recall, F1 score, and false positive rate.
 *
 * Usage: node test/accuracy/accuracy-test.js [--verbose] [--save-results]
 */

import { ScanOrchestrator } from '../../lib/scan-orchestrator.js';
import { compareResults, calculateAllMetrics, generateAccuracyReport } from './metrics.js';
import { readFile, writeFile } from 'fs/promises';
import { createComponentLogger } from '../../sidequest/logger.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = createComponentLogger('AccuracyTest');

// Parse command-line arguments
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const saveResults = args.includes('--save-results');

/**
 * Load expected results (ground truth)
 */
async function loadExpectedResults() {
  const expectedPath = path.join(__dirname, 'expected-results.json');
  const content = await readFile(expectedPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Extract function name from code block
 * Looks at semantic_tags first, then source code
 */
function extractFunctionName(block) {
  // Priority 1: Check tags for function name (added by Python extraction)
  const tags = block.tags || block.semantic_tags || [];
  for (const tag of tags) {
    if (tag.startsWith('function:')) {
      const funcName = tag.substring('function:'.length);
      if (funcName) return funcName;
    }
  }

  // Fallback: Extract from source code
  const sourceCode = block.source_code || '';

  // Try various patterns to extract function name
  const patterns = [
    /function\s+(\w+)\s*\(/,          // function name(
    /const\s+(\w+)\s*=/,              // const name =
    /let\s+(\w+)\s*=/,                // let name =
    /var\s+(\w+)\s*=/,                // var name =
    /async\s+function\s+(\w+)\s*\(/,  // async function name(
    /(\w+)\s*:\s*function/,           // name: function
    /(\w+)\s*:\s*async\s+function/,   // name: async function
    /export\s+function\s+(\w+)/,      // export function name
  ];

  for (const pattern of patterns) {
    const match = sourceCode.match(pattern);
    if (match && match[1]) return match[1];
  }

  // Last resort: file:line notation
  const filePath = block.relative_path || block.location?.file_path || '';
  const lineStart = block.location?.line_start;

  if (filePath && lineStart) {
    return `${filePath.split('/').pop()}:${lineStart}`;
  }

  return 'unknown';
}

/**
 * Enhance detected groups with function names for comparison
 */
function enhanceDetectedGroups(scanResult) {
  const groups = scanResult.duplicate_groups || [];

  groups.forEach(group => {
    // Add _blocks reference for easier comparison
    group._blocks = (group.member_block_ids || []).map(blockId => {
      // Find the block in code_blocks
      const block = (scanResult.code_blocks || []).find(b => b.block_id === blockId);
      if (block) {
        // Extract function name from the block
        block._function_name = extractFunctionName(block);
      }
      return block;
    }).filter(Boolean);
  });

  return groups;
}

/**
 * Filter out groups that only contain functions from excluded files
 *
 * edge-cases.js is excluded because it contains test functions designed to test
 * edge cases, not part of the ground truth dataset. Including it would incorrectly
 * count correct detections as false positives.
 */
function filterExcludedFiles(groups) {
  const EXCLUDED_FILES = ['src/utils/edge-cases.js'];

  const filteredGroups = groups.filter(group => {
    // Get all file paths in this group
    const filePaths = group._blocks?.map(block => block.relative_path).filter(Boolean) || [];

    // Keep the group if it contains at least one non-excluded file
    const hasNonExcludedFile = filePaths.some(filePath =>
      !EXCLUDED_FILES.includes(filePath)
    );

    return hasNonExcludedFile;
  });

  const excludedCount = groups.length - filteredGroups.length;
  if (excludedCount > 0) {
    console.log(`Excluded ${excludedCount} group(s) containing only edge-case test functions`);
    console.log();
  }

  return filteredGroups;
}

/**
 * Run accuracy test
 */
async function runAccuracyTest() {
  console.log('='.repeat(70));
  console.log('Duplicate Detection Accuracy Test Suite');
  console.log('='.repeat(70));
  console.log();

  // Load expected results
  logger.info('Loading expected results (ground truth)...');
  const expected = await loadExpectedResults();

  console.log('Ground Truth:');
  console.log(`  Expected duplicate groups: ${expected.duplicate_groups.length}`);
  console.log(`  Expected duplicate functions: ${expected.summary.total_duplicate_functions}`);
  console.log(`  Exact duplicates: ${expected.summary.exact_duplicates}`);
  console.log(`  Structural duplicates: ${expected.summary.structural_duplicates}`);
  console.log(`  False positive candidates: ${expected.false_positives_to_avoid.length}`);
  console.log();

  // Set up test repository path
  const testRepoPath = path.join(__dirname, 'fixtures');
  logger.info({ testRepoPath }, 'Setting up scan orchestrator');

  // Create orchestrator
  const orchestrator = new ScanOrchestrator({
    outputDir: path.join(__dirname, 'results'),
    autoGenerateReports: false, // We'll generate our own report
    pythonPath: path.join(process.cwd(), 'venv/bin/python3')
  });

  // Run scan
  console.log('Running duplicate detection scan...');
  console.log('-'.repeat(70));

  const startTime = Date.now();
  let scanResult;

  try {
    scanResult = await orchestrator.scanRepository(testRepoPath, {
      generateReports: false
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`Scan completed in ${duration}s`);
    console.log();

    if (verbose) {
      console.log('Scan Results:');
      console.log(`  Code blocks detected: ${scanResult.metrics?.total_code_blocks || 0}`);
      console.log(`  Duplicate groups: ${scanResult.metrics?.total_duplicate_groups || 0}`);
      console.log(`  Exact duplicates: ${scanResult.metrics?.exact_duplicates || 0}`);
      console.log(`  Suggestions: ${scanResult.metrics?.total_suggestions || 0}`);
      console.log();
    }

  } catch (error) {
    logger.error({ error }, 'Scan failed');
    console.error('ERROR: Scan failed:', error.message);
    process.exit(1);
  }

  // Enhance detected groups with function names
  let detectedGroups = enhanceDetectedGroups(scanResult);

  // Filter out groups from excluded files (edge-cases.js)
  detectedGroups = filterExcludedFiles(detectedGroups);

  if (verbose && detectedGroups.length > 0) {
    console.log('Detected Groups:');
    detectedGroups.forEach((group, i) => {
      console.log(`  Group ${i + 1}: ${group.member_block_ids?.length || 0} members`);
      group._blocks?.forEach(block => {
        console.log(`    - ${block._function_name} (${block.relative_path}:${block.location?.line_start})`);
      });
    });
    console.log();
  }

  // Compare results
  console.log('Comparing results against ground truth...');
  console.log('-'.repeat(70));

  const comparison = compareResults(
    detectedGroups,
    expected.duplicate_groups,
    expected.false_positives_to_avoid
  );

  // Calculate metrics
  const metrics = calculateAllMetrics(comparison);

  // Generate report
  const report = generateAccuracyReport(metrics, comparison, expected.metrics_targets);

  // Display results
  console.log();
  console.log('ACCURACY METRICS');
  console.log('='.repeat(70));
  console.log();

  console.log(`Precision:  ${metrics.precision.percentage.padStart(8)} - ${metrics.precision.interpretation}`);
  console.log(`            ${metrics.counts.tp} correct / ${metrics.counts.tp + metrics.counts.fp} detected`);
  console.log();

  console.log(`Recall:     ${metrics.recall.percentage.padStart(8)} - ${metrics.recall.interpretation}`);
  console.log(`            ${metrics.counts.tp} detected / ${metrics.counts.tp + metrics.counts.fn} expected`);
  console.log();

  console.log(`F1 Score:   ${metrics.f1Score.percentage.padStart(8)} - ${metrics.f1Score.interpretation}`);
  console.log(`            (harmonic mean of precision and recall)`);
  console.log();

  console.log(`FP Rate:    ${metrics.falsePositiveRate.percentage.padStart(8)} - ${metrics.falsePositiveRate.interpretation}`);
  console.log(`            ${metrics.counts.fp} false alarms / ${metrics.counts.fp + metrics.counts.tn} non-duplicates`);
  console.log();

  // Target comparison
  console.log('TARGET COMPARISON');
  console.log('='.repeat(70));
  console.log();

  const targets = report.targets;
  console.log(`Precision:   ${targets.precision.met ? '✅' : '❌'} Target: ${(targets.precision.target * 100).toFixed(0)}%, Actual: ${(targets.precision.actual * 100).toFixed(2)}% (${targets.precision.delta > 0 ? '+' : ''}${(targets.precision.delta * 100).toFixed(1)}%)`);
  console.log(`Recall:      ${targets.recall.met ? '✅' : '❌'} Target: ${(targets.recall.target * 100).toFixed(0)}%, Actual: ${(targets.recall.actual * 100).toFixed(2)}% (${targets.recall.delta > 0 ? '+' : ''}${(targets.recall.delta * 100).toFixed(1)}%)`);
  console.log(`F1 Score:    ${targets.f1_score.met ? '✅' : '❌'} Target: ${(targets.f1_score.target * 100).toFixed(0)}%, Actual: ${(targets.f1_score.actual * 100).toFixed(2)}% (${targets.f1_score.delta > 0 ? '+' : ''}${(targets.f1_score.delta * 100).toFixed(1)}%)`);
  console.log(`FP Rate:     ${targets.false_positive_rate.met ? '✅' : '❌'} Target: <${(targets.false_positive_rate.target * 100).toFixed(0)}%, Actual: ${(targets.false_positive_rate.actual * 100).toFixed(2)}% (${targets.false_positive_rate.delta > 0 ? '' : ''}${(targets.false_positive_rate.delta * 100).toFixed(1)}%)`);
  console.log();

  // Overall assessment
  console.log('OVERALL ASSESSMENT');
  console.log('='.repeat(70));
  console.log();
  console.log(`Grade:              ${report.overall_assessment.grade}`);
  console.log(`All Targets Met:    ${report.overall_assessment.all_targets_met ? '✅ YES' : '❌ NO'}`);
  console.log();

  // Details
  if (verbose || comparison.falsePositives.length > 0 || comparison.falseNegatives.length > 0) {
    console.log('DETAILS');
    console.log('='.repeat(70));
    console.log();

    if (comparison.truePositives.length > 0) {
      console.log(`✅ True Positives (${comparison.truePositives.length}):`);
      comparison.truePositives.forEach(tp => {
        console.log(`   - ${tp.expected}: ${tp.overlap}/${tp.expected_members} members matched (${(tp.overlap_ratio * 100).toFixed(0)}%)`);
      });
      console.log();
    }

    if (comparison.falseNegatives.length > 0) {
      console.log(`❌ False Negatives (${comparison.falseNegatives.length}) - Missed duplicates:`);
      comparison.falseNegatives.forEach(fn => {
        console.log(`   - ${fn.group_id}: ${fn.description}`);
        console.log(`     Members: ${fn.members.join(', ')}`);
      });
      console.log();
    }

    if (comparison.falsePositives.length > 0) {
      console.log(`⚠️  False Positives (${comparison.falsePositives.length}) - Incorrect detections:`);
      comparison.falsePositives.forEach(fp => {
        if (fp.reason) {
          console.log(`   - ${fp.function}: ${fp.reason}`);
        } else {
          console.log(`   - ${fp.group_id}: ${fp.members.join(', ')}`);
        }
      });
      console.log();
    }

    if (comparison.trueNegatives.length > 0) {
      console.log(`✅ True Negatives (${comparison.trueNegatives.length}) - Correctly ignored:`);
      comparison.trueNegatives.forEach(tn => {
        console.log(`   - ${tn.function}: ${tn.reason}`);
      });
      console.log();
    }
  }

  // Save results if requested
  if (saveResults) {
    const resultsPath = path.join(__dirname, 'results', 'accuracy-report.json');
    await writeFile(resultsPath, JSON.stringify(report, null, 2));
    console.log(`Results saved to: ${resultsPath}`);
    console.log();
  }

  // Exit with appropriate code
  const success = report.overall_assessment.all_targets_met;
  if (success) {
    console.log('✅ All accuracy targets met!');
  } else {
    console.log('❌ Some accuracy targets not met. See details above.');
  }

  console.log('='.repeat(70));

  process.exit(success ? 0 : 1);
}

// Run test
runAccuracyTest().catch(error => {
  logger.error({ error }, 'Test execution failed');
  console.error('Fatal error:', error);
  process.exit(1);
});

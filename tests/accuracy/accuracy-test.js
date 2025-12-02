#!/usr/bin/env node

/**
 * Accuracy Test Suite for Duplicate Detection
 *
 * Tests the duplicate detection pipeline against a repository with known duplicates
 * and measures precision, recall, F1 score, and false positive rate.
 *
 * Usage: node test/accuracy/accuracy-test.js [--verbose] [--save-results]
 */

import { ScanOrchestrator } from '../../sidequest/pipeline-core/scan-orchestrator.js';
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
 * Prepare accuracy test data by loading expected results (ground truth)
 * @returns {Promise<{expected: Object}>} Ground truth data
 */
async function prepareAccuracyTestData() {
  logger.info('Loading expected results (ground truth)...');
  const expected = await loadExpectedResults();

  console.log('Ground Truth:');
  console.log(`  Expected duplicate groups: ${expected.duplicate_groups.length}`);
  console.log(`  Expected duplicate functions: ${expected.summary.total_duplicate_functions}`);
  console.log(`  Exact duplicates: ${expected.summary.exact_duplicates}`);
  console.log(`  Structural duplicates: ${expected.summary.structural_duplicates}`);
  console.log(`  False positive candidates: ${expected.false_positives_to_avoid.length}`);
  console.log();

  return { expected };
}

/**
 * Execute duplicate detection scan on a repository
 * @param {string} testRepoPath - Path to the test repository
 * @returns {Promise<{scanResult: Object, duration: string}>} Scan results and duration
 */
async function executeDuplicateScan(testRepoPath) {
  logger.info({ testRepoPath }, 'Setting up scan orchestrator');

  const orchestrator = new ScanOrchestrator({
    outputDir: path.join(__dirname, 'results'),
    autoGenerateReports: false
  });

  console.log('Running duplicate detection scan...');
  console.log('-'.repeat(70));

  const startTime = Date.now();

  try {
    const scanResult = await orchestrator.scanRepository(testRepoPath, {
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

    return { scanResult, duration };
  } catch (error) {
    logger.error({ error }, 'Scan failed');
    console.error('ERROR: Scan failed:', error.message);
    process.exit(1);
  }
}

/**
 * Process scan results: enhance groups with function names, filter excluded files
 * @param {Object} scanResult - Raw scan results
 * @returns {Array} Processed and filtered duplicate groups
 */
function processDetectedGroups(scanResult) {
  let detectedGroups = enhanceDetectedGroups(scanResult);
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

  return detectedGroups;
}

/**
 * Calculate accuracy metrics by comparing detected groups against expected
 * @param {Array} detectedGroups - Groups found by the scanner
 * @param {Object} expected - Ground truth data
 * @returns {Object} Comparison results, metrics, and report
 */
function calculateAccuracyMetrics(detectedGroups, expected) {
  console.log('Comparing results against ground truth...');
  console.log('-'.repeat(70));

  const comparison = compareResults(
    detectedGroups,
    expected.duplicate_groups,
    expected.false_positives_to_avoid
  );

  const metrics = calculateAllMetrics(comparison);
  const report = generateAccuracyReport(metrics, comparison, expected.metrics_targets);

  return { comparison, metrics, report };
}

/**
 * Print accuracy metrics section
 * @param {Object} metrics - Calculated metrics
 */
function printAccuracyMetrics(metrics) {
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
}

/**
 * Print target comparison section
 * @param {Object} targets - Target comparison data from report
 */
function printTargetComparison(targets) {
  console.log('TARGET COMPARISON');
  console.log('='.repeat(70));
  console.log();

  const formatTarget = (name, target, prefix = '') => {
    const icon = target.met ? '✅' : '❌';
    const sign = target.delta > 0 ? '+' : '';
    const targetPrefix = name === 'FP Rate' ? '<' : '';
    return `${name}:${' '.repeat(12 - name.length)}${icon} Target: ${targetPrefix}${(target.target * 100).toFixed(0)}%, Actual: ${(target.actual * 100).toFixed(2)}% (${sign}${(target.delta * 100).toFixed(1)}%)`;
  };

  console.log(formatTarget('Precision', targets.precision));
  console.log(formatTarget('Recall', targets.recall));
  console.log(formatTarget('F1 Score', targets.f1_score));
  console.log(formatTarget('FP Rate', targets.false_positive_rate));
  console.log();
}

/**
 * Print detailed results (true positives, false negatives, false positives, true negatives)
 * @param {Object} comparison - Comparison results
 */
function printDetailedResults(comparison) {
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

/**
 * Print overall assessment and save results if requested
 * @param {Object} report - Generated accuracy report
 * @param {Object} comparison - Comparison results for details
 * @returns {Promise<boolean>} Whether all targets were met
 */
async function printOverallAssessmentAndSave(report, comparison) {
  console.log('OVERALL ASSESSMENT');
  console.log('='.repeat(70));
  console.log();
  console.log(`Grade:              ${report.overall_assessment.grade}`);
  console.log(`All Targets Met:    ${report.overall_assessment.all_targets_met ? '✅ YES' : '❌ NO'}`);
  console.log();

  // Print details if verbose or there are issues
  if (verbose || comparison.falsePositives.length > 0 || comparison.falseNegatives.length > 0) {
    printDetailedResults(comparison);
  }

  // Save results if requested
  if (saveResults) {
    const resultsPath = path.join(__dirname, 'results', 'accuracy-report.json');
    await writeFile(resultsPath, JSON.stringify(report, null, 2));
    console.log(`Results saved to: ${resultsPath}`);
    console.log();
  }

  return report.overall_assessment.all_targets_met;
}

/**
 * Run accuracy test - main coordinator function
 */
async function runAccuracyTest() {
  console.log('='.repeat(70));
  console.log('Duplicate Detection Accuracy Test Suite');
  console.log('='.repeat(70));
  console.log();

  // Phase 1: Load ground truth
  const { expected } = await prepareAccuracyTestData();

  // Phase 2: Execute scan
  const testRepoPath = path.join(__dirname, 'fixtures');
  const { scanResult } = await executeDuplicateScan(testRepoPath);

  // Phase 3: Process results
  const detectedGroups = processDetectedGroups(scanResult);

  // Phase 4: Calculate metrics
  const { comparison, metrics, report } = calculateAccuracyMetrics(detectedGroups, expected);

  // Phase 5: Display results
  printAccuracyMetrics(metrics);
  printTargetComparison(report.targets);

  // Phase 6: Overall assessment and save
  const success = await printOverallAssessmentAndSave(report, comparison);

  // Final status
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

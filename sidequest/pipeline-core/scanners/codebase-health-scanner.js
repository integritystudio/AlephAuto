#!/usr/bin/env node
/**
 * Codebase Health Scanner CLI
 *
 * Command-line interface for running codebase health scans:
 * - Timeout pattern detection
 * - Root directory analysis
 * - Import dependency analysis
 *
 * Based on AlephAuto debugging session: Nov 18, 2025
 *
 * Usage:
 *   node codebase-health-scanner.js /path/to/repo --scan timeout
 *   node codebase-health-scanner.js /path/to/repo --scan root
 *   node codebase-health-scanner.js /path/to/repo --scan all
 *   node codebase-health-scanner.js /path/to/repo --scan all --output report.md
 *
 * @module lib/scanners/codebase-health-scanner
 */

import { TimeoutPatternDetector } from './timeout-pattern-detector.js';
import { RootDirectoryAnalyzer } from './root-directory-analyzer.js';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Simple logger
 */
const logger = {
  info: (...args) => console.log('[INFO]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args)
};

/**
 * Main CLI function
 */
async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const repoPath = args[0];
  const scanType = args.includes('--scan')
    ? args[args.indexOf('--scan') + 1]
    : 'all';
  const outputFile = args.includes('--output')
    ? args[args.indexOf('--output') + 1]
    : null;
  const jsonOutput = args.includes('--json');

  // Validate repo path
  if (!repoPath) {
    console.error('Usage: node codebase-health-scanner.js <repo-path> [options]');
    console.error('');
    console.error('Options:');
    console.error('  --scan <type>       Scan type: timeout, root, all (default: all)');
    console.error('  --output <file>     Output file path (markdown report)');
    console.error('  --json              Output JSON instead of markdown');
    console.error('');
    console.error('Examples:');
    console.error('  node codebase-health-scanner.js ~/code/myproject --scan timeout');
    console.error('  node codebase-health-scanner.js ~/code/myproject --scan all --output report.md');
    process.exit(1);
  }

  const resolvedPath = path.resolve(repoPath);

  logger.info(`Starting codebase health scan: ${resolvedPath}`);
  logger.info(`Scan type: ${scanType}`);

  const results = {
    repository: resolvedPath,
    timestamp: new Date().toISOString(),
    scans: {}
  };

  try {
    // Run timeout pattern detection
    if (scanType === 'timeout' || scanType === 'all') {
      logger.info('Running timeout pattern detection...');
      const detector = new TimeoutPatternDetector({ logger });
      const findings = await detector.scan(resolvedPath);
      results.scans.timeout = findings;

      logger.info(
        `Timeout scan complete: ${findings.statistics.total_issues} issues in ${findings.statistics.affected_files} files`
      );
    }

    // Run root directory analysis
    if (scanType === 'root' || scanType === 'all') {
      logger.info('Running root directory analysis...');
      const analyzer = new RootDirectoryAnalyzer({ logger });
      const analysis = await analyzer.analyze(resolvedPath);
      results.scans.root = analysis;

      logger.info(
        `Root analysis complete: ${analysis.statistics.total_root_files} files, ${analysis.statistics.reduction_potential} can be moved`
      );
    }

    // Generate output
    if (jsonOutput) {
      const output = JSON.stringify(results, null, 2);
      if (outputFile) {
        await fs.writeFile(outputFile, output);
        logger.info(`JSON report saved to: ${outputFile}`);
      } else {
        console.log(output);
      }
    } else {
      const report = generateMarkdownReport(results);
      if (outputFile) {
        await fs.writeFile(outputFile, report);
        logger.info(`Markdown report saved to: ${outputFile}`);
      } else {
        console.log('\n' + report);
      }
    }

    logger.info('Scan complete!');
    process.exit(0);

  } catch (error) {
    logger.error(`Scan failed: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * Generate markdown report from results
 */
function generateMarkdownReport(results) {
  const lines = [
    '# Codebase Health Report',
    '',
    `**Repository:** ${results.repository}`,
    `**Generated:** ${results.timestamp}`,
    '',
    '---',
    ''
  ];

  // Timeout scan report
  if (results.scans.timeout) {
    const timeout = results.scans.timeout;
    const detector = new TimeoutPatternDetector({ logger });

    lines.push('## Timeout Pattern Detection');
    lines.push('');
    lines.push(detector.generateReport(timeout));
    lines.push('');
  }

  // Root directory analysis report
  if (results.scans.root) {
    const root = results.scans.root;
    const analyzer = new RootDirectoryAnalyzer({ logger });

    lines.push('## Root Directory Analysis');
    lines.push('');
    lines.push(analyzer.generateReport(root));
    lines.push('');
  }

  // Summary
  lines.push('---', '', '## Summary', '');

  if (results.scans.timeout) {
    const stats = results.scans.timeout.statistics;
    lines.push(
      `- **Timeout Issues:** ${stats.total_issues} issues in ${stats.affected_files} files`,
      `  - High: ${stats.severity_breakdown.high || 0}`,
      `  - Medium: ${stats.severity_breakdown.medium || 0}`,
      `  - Low: ${stats.severity_breakdown.low || 0}`,
      ''
    );
  }

  if (results.scans.root) {
    const stats = results.scans.root.statistics;
    lines.push(
      `- **Root Directory:** ${stats.total_root_files} files (${stats.reduction_percentage}% reduction possible)`,
      `  - Can move: ${stats.reduction_potential} files`,
      `  - Final count: ${stats.final_root_files} files`,
      ''
    );
  }

  lines.push(
    '---',
    '',
    '## Next Steps',
    '',
    '1. Review high severity timeout issues first',
    '2. Plan root directory cleanup in phases',
    '3. Create git branch for changes: `git checkout -b health/cleanup`',
    '4. Implement fixes incrementally',
    '5. Test after each phase',
    ''
  );

  return lines.join('\n');
}

/**
 * Export for programmatic use
 */
export async function runHealthScan(repoPath, options = {}) {
  const results = {
    repository: path.resolve(repoPath),
    timestamp: new Date().toISOString(),
    scans: {}
  };

  const loggerInstance = options.logger || logger;

  if (options.scanTimeout !== false) {
    const detector = new TimeoutPatternDetector({ logger: loggerInstance });
    results.scans.timeout = await detector.scan(repoPath);
  }

  if (options.scanRoot !== false) {
    const analyzer = new RootDirectoryAnalyzer({ logger: loggerInstance });
    results.scans.root = await analyzer.analyze(repoPath);
  }

  return results;
}

// Run CLI if executed directly
// @ts-ignore - import.meta is available in ESM
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

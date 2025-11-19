/**
 * Timeout Pattern Detector for AlephAuto
 *
 * Detects common infinite loading patterns in React/TypeScript applications:
 * - Missing timeout wrappers on Promise.race() calls
 * - Loading states that never reset
 * - Async operations without error handling
 * - Missing finally blocks in loading logic
 *
 * Based on debugging session: AnalyticsBot dashboard infinite loading issue
 *
 * @module lib/scanners/timeout-pattern-detector
 */

// @ts-check
/** @typedef {import('../errors/error-types').NodeError} NodeError */

import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Timeout Pattern Detector
 *
 * Scans codebases for common timeout and infinite loading anti-patterns.
 */
export class TimeoutPatternDetector {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.astGrepBinary = options.astGrepBinary || 'sg';
  }

  /**
   * Scan repository for timeout anti-patterns
   *
   * @param {string} repoPath - Absolute path to repository
   * @param {object} options - Scan options
   * @returns {Promise<object>} Scan results with findings
   */
  async scan(repoPath, options = {}) {
    const startTime = Date.now();

    this.logger.info(`[TimeoutPatternDetector] Starting scan: ${repoPath}`);

    try {
      const findings = {
        promiseRaceWithoutTimeout: [],
        loadingWithoutFinally: [],
        asyncWithoutErrorHandling: [],
        missingTimeoutConstants: [],
        setLoadingWithoutReset: [],
        statistics: {}
      };

      // Run parallel pattern searches
      const [
        promiseRaceIssues,
        loadingIssues,
        asyncIssues,
        constantIssues,
        resetIssues
      ] = await Promise.all([
        this.findPromiseRaceWithoutTimeout(repoPath),
        this.findLoadingWithoutFinally(repoPath),
        this.findAsyncWithoutErrorHandling(repoPath),
        this.findMissingTimeoutConstants(repoPath),
        this.findSetLoadingWithoutReset(repoPath)
      ]);

      findings.promiseRaceWithoutTimeout = promiseRaceIssues;
      findings.loadingWithoutFinally = loadingIssues;
      findings.asyncWithoutErrorHandling = asyncIssues;
      findings.missingTimeoutConstants = constantIssues;
      findings.setLoadingWithoutReset = resetIssues;

      // Calculate statistics
      const totalIssues = Object.values(findings)
        .filter(Array.isArray)
        .reduce((sum, arr) => sum + arr.length, 0);

      const affectedFiles = new Set(
        Object.values(findings)
          .filter(Array.isArray)
          .flat()
          .map(f => f.file_path)
      ).size;

      findings.statistics = {
        total_issues: totalIssues,
        affected_files: affectedFiles,
        scan_duration_ms: Date.now() - startTime,
        severity_breakdown: this.calculateSeverityBreakdown(findings)
      };

      this.logger.info(
        `[TimeoutPatternDetector] Scan complete: ${totalIssues} issues in ${affectedFiles} files (${findings.statistics.scan_duration_ms}ms)`
      );

      return findings;
    } catch (error) {
      this.logger.error(`[TimeoutPatternDetector] Scan failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Find Promise.race() calls without proper timeout wrappers
   */
  async findPromiseRaceWithoutTimeout(repoPath) {
    const pattern = 'Promise.race([$$$PROMISES])';
    const matches = await this.searchPattern(repoPath, pattern, {
      language: 'typescript',
      extensions: ['.ts', '.tsx', '.js', '.jsx']
    });

    // Filter out patterns that already have timeout logic
    return matches
      .filter(match => {
        const context = match.matched_text.toLowerCase();
        return !(
          context.includes('timeout') ||
          context.includes('settimeout') ||
          context.includes('withtimeout')
        );
      })
      .map(match => ({
        ...match,
        severity: 'high',
        category: 'promise_race_no_timeout',
        message: 'Promise.race() without timeout wrapper - may hang indefinitely',
        recommendation: 'Wrap with withTimeout() utility or add setTimeout() rejection promise',
        fix_example: `
// Before:
const result = await Promise.race([fetchData(), otherPromise()]);

// After:
import { withTimeout, TIMEOUT } from '../utils/timeout';
const result = await withTimeout(
  Promise.race([fetchData(), otherPromise()]),
  TIMEOUT.NORMAL,
  'Operation timeout'
);`
      }));
  }

  /**
   * Find loading state setters without finally blocks
   */
  async findLoadingWithoutFinally(repoPath) {
    const pattern = 'setLoading(true)';
    const matches = await this.searchPattern(repoPath, pattern, {
      language: 'typescript',
      extensions: ['.ts', '.tsx', '.js', '.jsx']
    });

    return matches.map(match => ({
      ...match,
      severity: 'medium',
      category: 'loading_without_finally',
      message: 'setLoading(true) should be paired with finally block to ensure reset',
      recommendation: 'Add finally block with setLoading(false)',
      fix_example: `
// Pattern:
try {
  setLoading(true);
  await fetchData();
} catch (error) {
  handleError(error);
} finally {
  setLoading(false); // Always reset loading state
}`
    }));
  }

  /**
   * Find async operations without error handling
   */
  async findAsyncWithoutErrorHandling(repoPath) {
    const pattern = 'async $FUNC($$$PARAMS) { $$$BODY }';
    const matches = await this.searchPattern(repoPath, pattern, {
      language: 'typescript',
      extensions: ['.ts', '.tsx', '.js', '.jsx']
    });

    // Filter for functions without try-catch
    return matches
      .filter(match => {
        const body = match.matched_text;
        return !(
          body.includes('try') &&
          body.includes('catch')
        );
      })
      .map(match => ({
        ...match,
        severity: 'medium',
        category: 'async_no_error_handling',
        message: 'Async function without try-catch - errors may be unhandled',
        recommendation: 'Add try-catch block or propagate errors explicitly'
      }));
  }

  /**
   * Find missing timeout constants
   */
  async findMissingTimeoutConstants(repoPath) {
    // Check if timeout utility exists
    const timeoutUtilPath = path.join(repoPath, 'src/utils/timeout.ts');

    try {
      await fs.access(timeoutUtilPath);
      return []; // Timeout utility exists
    } catch {
      return [{
        file_path: 'src/utils/timeout.ts',
        line_start: 0,
        severity: 'info',
        category: 'missing_timeout_utility',
        message: 'No centralized timeout utility found',
        recommendation: 'Create src/utils/timeout.ts with reusable timeout functions',
        fix_example: `
// src/utils/timeout.ts
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMsg: string
): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(errorMsg)), timeoutMs);
  });
  return Promise.race([promise, timeout]);
}

export const TIMEOUT = {
  FAST: 2000,
  NORMAL: 5000,
  SLOW: 10000,
  VERY_SLOW: 15000,
} as const;`
      }];
    }
  }

  /**
   * Find setLoading without corresponding reset in useEffect
   */
  async findSetLoadingWithoutReset(repoPath) {
    const pattern = 'setLoading($VAL)';
    const matches = await this.searchPattern(repoPath, pattern, {
      language: 'typescript',
      extensions: ['.ts', '.tsx']
    });

    const findings = [];

    // Group by file and check for safety net pattern
    const fileGroups = this.groupByFile(matches);

    for (const [filePath, fileMatches] of Object.entries(fileGroups)) {
      const fileContent = await this.readFile(path.join(repoPath, filePath));

      // Check if file has safety net timeout pattern
      const hasSafetyNet =
        fileContent.includes('useEffect') &&
        fileContent.includes('setTimeout') &&
        fileContent.includes('setLoading(false)') &&
        fileContent.includes('return () => clearTimeout');

      if (!hasSafetyNet && fileMatches.some(m => m.matched_text.includes('true'))) {
        findings.push({
          file_path: filePath,
          line_start: fileMatches[0].line_start,
          severity: 'low',
          category: 'missing_loading_safety_net',
          message: 'Consider adding maximum loading timeout safety net',
          recommendation: 'Add useEffect with timeout to force loading=false after max wait time',
          fix_example: `
// Add safety net in useDashboardData or similar hooks:
useEffect(() => {
  if (!loading) return;

  const maxLoadingTimeout = setTimeout(() => {
    console.error('MAXIMUM LOADING TIMEOUT REACHED');
    setLoading(false);
    setError(new Error('Load timeout - please refresh'));
  }, TIMEOUT.VERY_SLOW);

  return () => clearTimeout(maxLoadingTimeout);
}, [loading]);`
        });
      }
    }

    return findings;
  }

  /**
   * Search for pattern using ast-grep
   */
  async searchPattern(repoPath, pattern, options = {}) {
    return new Promise((resolve, reject) => {
      const args = [
        'run',
        '--pattern', pattern,
        '--json'
      ];

      if (options.language) {
        args.push('--lang', options.language);
      }

      const proc = spawn(this.astGrepBinary, args, {
        cwd: repoPath,
        timeout: 30000 // 30 second timeout
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0 || code === null) {
          try {
            const results = stdout.trim() ? JSON.parse(stdout) : [];
            const normalized = results.map(r => ({
              file_path: r.file,
              line_start: r.range?.start?.line || 0,
              line_end: r.range?.end?.line || 0,
              matched_text: r.text || r.lines || '',
              meta_variables: r.metaVars || {}
            }));
            resolve(normalized);
          } catch (error) {
            this.logger.warn(`Failed to parse ast-grep output: ${error.message}`);
            resolve([]);
          }
        } else {
          reject(new Error(`ast-grep exited with code ${code}: ${stderr}`));
        }
      });

      proc.on('error', (error) => {
        const nodeError = /** @type {NodeError} */ (error);
        if (nodeError.code === 'ENOENT') {
          reject(new Error('ast-grep (sg) not found. Install: npm install -g @ast-grep/cli'));
        } else {
          reject(error);
        }
      });
    });
  }

  /**
   * Read file contents
   */
  async readFile(filePath) {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      return '';
    }
  }

  /**
   * Group matches by file
   */
  groupByFile(matches) {
    const groups = {};
    for (const match of matches) {
      if (!groups[match.file_path]) {
        groups[match.file_path] = [];
      }
      groups[match.file_path].push(match);
    }
    return groups;
  }

  /**
   * Calculate severity breakdown
   */
  calculateSeverityBreakdown(findings) {
    const breakdown = { high: 0, medium: 0, low: 0, info: 0 };

    Object.values(findings)
      .filter(Array.isArray)
      .flat()
      .forEach(finding => {
        const severity = finding.severity || 'info';
        breakdown[severity] = (breakdown[severity] || 0) + 1;
      });

    return breakdown;
  }

  /**
   * Generate report
   */
  generateReport(findings) {
    const lines = [
      '# Timeout Pattern Detection Report',
      '',
      `**Generated:** ${new Date().toISOString()}`,
      `**Total Issues:** ${findings.statistics.total_issues}`,
      `**Affected Files:** ${findings.statistics.affected_files}`,
      `**Scan Duration:** ${findings.statistics.scan_duration_ms}ms`,
      '',
      '## Severity Breakdown',
      ''
    ];

    Object.entries(findings.statistics.severity_breakdown).forEach(([severity, count]) => {
      if (count > 0) {
        const emoji = { high: '🔴', medium: '🟡', low: '🟢', info: '🔵' }[severity];
        lines.push(`- ${emoji} **${severity.toUpperCase()}:** ${count}`);
      }
    });

    lines.push('', '## Findings by Category', '');

    const categories = [
      { key: 'promiseRaceWithoutTimeout', title: 'Promise.race() Without Timeout' },
      { key: 'loadingWithoutFinally', title: 'Loading State Without Finally Block' },
      { key: 'asyncWithoutErrorHandling', title: 'Async Without Error Handling' },
      { key: 'missingTimeoutConstants', title: 'Missing Timeout Utilities' },
      { key: 'setLoadingWithoutReset', title: 'Loading Without Safety Net' }
    ];

    categories.forEach(({ key, title }) => {
      const items = findings[key] || [];
      if (items.length > 0) {
        lines.push(`### ${title} (${items.length})`, '');
        items.forEach((item, i) => {
          lines.push(
            `**${i + 1}. ${item.file_path}:${item.line_start}**`,
            `- **Severity:** ${item.severity}`,
            `- **Message:** ${item.message}`,
            `- **Recommendation:** ${item.recommendation}`,
            ''
          );

          if (item.fix_example) {
            lines.push('```typescript', item.fix_example.trim(), '```', '');
          }
        });
      }
    });

    return lines.join('\n');
  }
}

/**
 * Export scanner instance creator
 */
export function createTimeoutPatternDetector(options) {
  return new TimeoutPatternDetector(options);
}

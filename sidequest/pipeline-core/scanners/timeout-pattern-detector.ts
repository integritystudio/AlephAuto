import { spawn, ChildProcess } from 'child_process';
import { captureProcessOutput } from '@shared/process-io';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createComponentLogger } from '../../utils/logger.ts';

// ============================================================================
// Type Definitions
// ============================================================================

export interface TimeoutPatternDetectorOptions {
  logger?: ReturnType<typeof createComponentLogger>;
  astGrepBinary?: string;
}

export interface SearchOptions {
  language?: string;
  extensions?: string[];
}

export interface PatternMatch {
  file_path: string;
  line_start: number;
  line_end: number;
  matched_text: string;
  meta_variables: Record<string, unknown>;
}

export interface TimeoutFinding extends PatternMatch {
  severity: 'high' | 'medium' | 'low' | 'info';
  category: string;
  message: string;
  recommendation: string;
  fix_example?: string;
}

export interface SeverityBreakdown {
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface ScanStatistics {
  total_issues: number;
  affected_files: number;
  scan_duration_ms: number;
  severity_breakdown: SeverityBreakdown;
}

export interface TimeoutFindings {
  promiseRaceWithoutTimeout: TimeoutFinding[];
  loadingWithoutFinally: TimeoutFinding[];
  asyncWithoutErrorHandling: TimeoutFinding[];
  missingTimeoutConstants: TimeoutFinding[];
  setLoadingWithoutReset: TimeoutFinding[];
  statistics: ScanStatistics;
}

// ============================================================================
// TimeoutPatternDetector Class
// ============================================================================

/**
 * Timeout Pattern Detector
 *
 * Scans codebases for common timeout and infinite loading anti-patterns.
 */
export class TimeoutPatternDetector {
  private readonly logger: ReturnType<typeof createComponentLogger>;
  private readonly astGrepBinary: string;

    /**
   * Constructor.
   *
   * @param {TimeoutPatternDetectorOptions} [options={}] - Options dictionary
   */
  constructor(options: TimeoutPatternDetectorOptions = {}) {
    this.logger = options.logger ?? createComponentLogger('TimeoutPatternDetector');
    this.astGrepBinary = options.astGrepBinary ?? 'sg';
  }

    /**
   * Scan.
   *
   * @param {string} repoPath - The repoPath
   * @param {Record<string, unknown>} [_options={}] - Configuration for 
   *
   * @returns {Promise<TimeoutFindings>} The Promise<TimeoutFindings>
   * @async
   */
  async scan(repoPath: string, _options: Record<string, unknown> = {}): Promise<TimeoutFindings> {
    const startTime = Date.now();

    this.logger.info(`[TimeoutPatternDetector] Starting scan: ${repoPath}`);

    try {
      const findings: TimeoutFindings = {
        promiseRaceWithoutTimeout: [],
        loadingWithoutFinally: [],
        asyncWithoutErrorHandling: [],
        missingTimeoutConstants: [],
        setLoadingWithoutReset: [],
        statistics: {
          total_issues: 0,
          affected_files: 0,
          scan_duration_ms: 0,
          severity_breakdown: { high: 0, medium: 0, low: 0, info: 0 }
        }
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
      const allFindings: TimeoutFinding[] = [
        ...findings.promiseRaceWithoutTimeout,
        ...findings.loadingWithoutFinally,
        ...findings.asyncWithoutErrorHandling,
        ...findings.missingTimeoutConstants,
        ...findings.setLoadingWithoutReset
      ];

      const totalIssues = allFindings.length;

      const affectedFiles = new Set(allFindings.map(f => f.file_path)).size;

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
      this.logger.error(`[TimeoutPatternDetector] Scan failed: ${(error as Error).message}`);
      throw error;
    }
  }

    /**
   * Find the promise race without timeout.
   *
   * @param {string} repoPath - The repoPath
   *
   * @returns {Promise<TimeoutFinding[]>} The promise race without timeout
   * @async
   */
  async findPromiseRaceWithoutTimeout(repoPath: string): Promise<TimeoutFinding[]> {
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
        severity: 'high' as const,
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
   * Find the loading without finally.
   *
   * @param {string} repoPath - The repoPath
   *
   * @returns {Promise<TimeoutFinding[]>} The loading without finally
   * @async
   */
  async findLoadingWithoutFinally(repoPath: string): Promise<TimeoutFinding[]> {
    const pattern = 'setLoading(true)';
    const matches = await this.searchPattern(repoPath, pattern, {
      language: 'typescript',
      extensions: ['.ts', '.tsx', '.js', '.jsx']
    });

    return matches.map(match => ({
      ...match,
      severity: 'medium' as const,
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
   * Find the async without error handling.
   *
   * @param {string} repoPath - The repoPath
   *
   * @returns {Promise<TimeoutFinding[]>} The async without error handling
   * @async
   */
  async findAsyncWithoutErrorHandling(repoPath: string): Promise<TimeoutFinding[]> {
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
        severity: 'medium' as const,
        category: 'async_no_error_handling',
        message: 'Async function without try-catch - errors may be unhandled',
        recommendation: 'Add try-catch block or propagate errors explicitly'
      }));
  }

    /**
   * Find the missing timeout constants.
   *
   * @param {string} repoPath - The repoPath
   *
   * @returns {Promise<TimeoutFinding[]>} The missing timeout constants
   * @async
   */
  async findMissingTimeoutConstants(repoPath: string): Promise<TimeoutFinding[]> {
    // Check if timeout utility exists
    const timeoutUtilPath = path.join(repoPath, 'src/utils/timeout.ts');

    try {
      await fs.access(timeoutUtilPath);
      return []; // Timeout utility exists
    } catch {
      return [{
        file_path: 'src/utils/timeout.ts',
        line_start: 0,
        line_end: 0,
        matched_text: '',
        meta_variables: {},
        severity: 'info' as const,
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
   * Find the set loading without reset.
   *
   * @param {string} repoPath - The repoPath
   *
   * @returns {Promise<TimeoutFinding[]>} The set loading without reset
   * @async
   */
  async findSetLoadingWithoutReset(repoPath: string): Promise<TimeoutFinding[]> {
    const pattern = 'setLoading($VAL)';
    const matches = await this.searchPattern(repoPath, pattern, {
      language: 'typescript',
      extensions: ['.ts', '.tsx']
    });

    const findings: TimeoutFinding[] = [];

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
          line_end: fileMatches[0].line_end,
          matched_text: fileMatches[0].matched_text,
          meta_variables: {},
          severity: 'low' as const,
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
   * Search for pattern.
   *
   * @param {string} repoPath - The repoPath
   * @param {string} pattern - The pattern
   * @param {SearchOptions} [options={}] - Options dictionary
   *
   * @returns {Promise<PatternMatch[]>} The pattern
   * @async
   */
  async searchPattern(repoPath: string, pattern: string, options: SearchOptions = {}): Promise<PatternMatch[]> {
    return new Promise<PatternMatch[]>((resolve, reject) => {
      const args = [
        'run',
        '--pattern', pattern,
        '--json'
      ];

      if (options.language) {
        args.push('--lang', options.language);
      }

      const proc: ChildProcess = spawn(this.astGrepBinary, args, {
        cwd: repoPath,
        timeout: 30000 // 30 second timeout
      });

      const output = captureProcessOutput(proc);

      proc.on('close', (code) => {
        const stdout = output.getStdout();
        const stderr = output.getStderr();
        if (code === 0 || code === null) {
          try {
            const results: Array<Record<string, unknown>> = stdout.trim() ? JSON.parse(stdout) : [];
            const normalized: PatternMatch[] = results.map(r => ({
              file_path: r['file'] as string,
              line_start: (r['range'] as Record<string, Record<string, number>> | undefined)?.start?.line ?? 0,
              line_end: (r['range'] as Record<string, Record<string, number>> | undefined)?.end?.line ?? 0,
              matched_text: (r['text'] ?? r['lines'] ?? '') as string,
              meta_variables: (r['metaVars'] ?? {}) as Record<string, unknown>
            }));
            resolve(normalized);
          } catch (error) {
            this.logger.warn(`Failed to parse ast-grep output: ${(error as Error).message}`);
            resolve([]);
          }
        } else {
          reject(new Error(`ast-grep exited with code ${code}: ${stderr}`));
        }
      });

      proc.on('error', (error: Error & { code?: string }) => {
        if (error.code === 'ENOENT') {
          reject(new Error('ast-grep (sg) not found. Install: npm install -g @ast-grep/cli'));
        } else {
          reject(error);
        }
      });
    });
  }

    /**
   * Read the file.
   *
   * @param {string} filePath - The filePath
   *
   * @returns {Promise<string>} The file
   * @async
   */
  async readFile(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      return '';
    }
  }

    /**
   * Group by file.
   *
   * @param {PatternMatch[]} matches - The matches
   *
   * @returns {Record<string, PatternMatch[]>} The resulting string
   */
  groupByFile(matches: PatternMatch[]): Record<string, PatternMatch[]> {
    const groups: Record<string, PatternMatch[]> = {};
    for (const match of matches) {
      if (!groups[match.file_path]) {
        groups[match.file_path] = [];
      }
      groups[match.file_path].push(match);
    }
    return groups;
  }

    /**
   * Calculate severity breakdown.
   *
   * @param {Omit<TimeoutFindings, 'statistics'>} findings - The findings
   *
   * @returns {SeverityBreakdown} The calculated severity breakdown
   */
  calculateSeverityBreakdown(findings: Omit<TimeoutFindings, 'statistics'>): SeverityBreakdown {
    const breakdown: SeverityBreakdown = { high: 0, medium: 0, low: 0, info: 0 };

    const allFindings: TimeoutFinding[] = [
      ...findings.promiseRaceWithoutTimeout,
      ...findings.loadingWithoutFinally,
      ...findings.asyncWithoutErrorHandling,
      ...findings.missingTimeoutConstants,
      ...findings.setLoadingWithoutReset
    ];

    for (const finding of allFindings) {
      const severity = finding.severity ?? 'info';
      breakdown[severity] = (breakdown[severity] ?? 0) + 1;
    }

    return breakdown;
  }

    /**
   * Generate the report.
   *
   * @param {TimeoutFindings} findings - The findings
   *
   * @returns {string} The created report
   */
  generateReport(findings: TimeoutFindings): string {
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

    const severityEmoji: Record<string, string> = {
      high: '🔴',
      medium: '🟡',
      low: '🟢',
      info: '🔵'
    };

    for (const [severity, count] of Object.entries(findings.statistics.severity_breakdown)) {
      if (count > 0) {
        const emoji = severityEmoji[severity] ?? '';
        lines.push(`- ${emoji} **${severity.toUpperCase()}:** ${count}`);
      }
    }

    lines.push('', '## Findings by Category', '');

    const categories: Array<{ key: keyof Omit<TimeoutFindings, 'statistics'>; title: string }> = [
      { key: 'promiseRaceWithoutTimeout', title: 'Promise.race() Without Timeout' },
      { key: 'loadingWithoutFinally', title: 'Loading State Without Finally Block' },
      { key: 'asyncWithoutErrorHandling', title: 'Async Without Error Handling' },
      { key: 'missingTimeoutConstants', title: 'Missing Timeout Utilities' },
      { key: 'setLoadingWithoutReset', title: 'Loading Without Safety Net' }
    ];

    for (const { key, title } of categories) {
      const items = findings[key] ?? [];
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
    }

    return lines.join('\n');
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create the timeout pattern detector.
 *
 * @param {TimeoutPatternDetectorOptions} options? - The options?
 *
 * @returns {TimeoutPatternDetector} The created timeout pattern detector
 */
export function createTimeoutPatternDetector(options?: TimeoutPatternDetectorOptions): TimeoutPatternDetector {
  return new TimeoutPatternDetector(options);
}

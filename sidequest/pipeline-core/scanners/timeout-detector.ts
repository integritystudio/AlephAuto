import fs from 'node:fs/promises';
import path from 'node:path';

export const TIMEOUT_DETECTOR_DEFAULTS = {
  FINALLY_LOOKAHEAD: 20,
  TRY_CATCH_LOOKAHEAD: 50,
  MAX_FINDINGS_PER_SEVERITY: 10,
} as const;

export const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', 'build']);

export type Severity = 'high' | 'medium' | 'low';
export type Category =
  | 'promise_race_no_timeout'
  | 'loading_without_finally'
  | 'async_no_error_handling'
  | 'settimeout_no_cleanup';

export interface Finding {
  file_path: string;
  line_number: number;
  severity: Severity;
  category: Category;
  message: string;
  code_snippet: string;
  recommendation: string;
}

export interface ScanStatistics {
  total_findings: number;
  files_affected: number;
  severity_breakdown: Record<string, number>;
  category_breakdown: Record<string, number>;
}

export class FileContext {
  filePath: string;
  content: string;
  lines: string[];

  constructor(filePath: string, content: string, lines: string[]) {
    this.filePath = filePath;
    this.content = content;
    this.lines = lines;
  }

  hasTextInRange(text: string, startLine: number, numLines: number): boolean {
    const end = Math.min(startLine + numLines, this.lines.length);
    for (let j = startLine - 1; j < end; j++) {
      if (this.lines[j].includes(text)) return true;
    }
    return false;
  }

  hasPatternInRange(pattern: string, startLine: number, numLines: number): boolean {
    const re = new RegExp(pattern);
    const end = Math.min(startLine + numLines, this.lines.length);
    for (let j = startLine - 1; j < end; j++) {
      if (re.test(this.lines[j])) return true;
    }
    return false;
  }
}

type Detector = (ctx: FileContext, lineNum: number, line: string) => Finding | null;

const detectPromiseRaceNoTimeout: Detector = (ctx, lineNum, line) => {
  if (!line.includes('Promise.race')) return null;
  if (line.toLowerCase().includes('timeout')) return null;
  return {
    file_path: ctx.filePath,
    line_number: lineNum,
    severity: 'high',
    category: 'promise_race_no_timeout',
    message: 'Promise.race() without timeout wrapper',
    code_snippet: line.trim(),
    recommendation: 'Wrap with withTimeout() or add setTimeout rejection',
  };
};

const detectLoadingWithoutFinally: Detector = (ctx, lineNum, line) => {
  if (!line.includes('setLoading(true)') && !line.includes('setLoading( true )')) return null;
  if (ctx.hasTextInRange('finally', lineNum, TIMEOUT_DETECTOR_DEFAULTS.FINALLY_LOOKAHEAD)) return null;
  return {
    file_path: ctx.filePath,
    line_number: lineNum,
    severity: 'medium',
    category: 'loading_without_finally',
    message: 'setLoading(true) without finally block',
    code_snippet: line.trim(),
    recommendation: 'Add finally block with setLoading(false)',
  };
};

const detectAsyncNoErrorHandling: Detector = (ctx, lineNum, line) => {
  if (!/^\s*async\s+(function\s+\w+|function|\w+)\s*\(/.test(line)) return null;
  const hasTry = ctx.hasPatternInRange('\\btry\\b', lineNum, TIMEOUT_DETECTOR_DEFAULTS.TRY_CATCH_LOOKAHEAD);
  const hasCatch = ctx.hasPatternInRange('\\bcatch\\b', lineNum, TIMEOUT_DETECTOR_DEFAULTS.TRY_CATCH_LOOKAHEAD);
  if (hasTry && hasCatch) return null;
  return {
    file_path: ctx.filePath,
    line_number: lineNum,
    severity: 'low',
    category: 'async_no_error_handling',
    message: 'Async function without try-catch',
    code_snippet: line.trim(),
    recommendation: 'Add try-catch block for error handling',
  };
};

const detectSetTimeoutNoCleanup: Detector = (ctx, lineNum, line) => {
  if (!line.includes('setTimeout')) return null;
  if (ctx.content.includes('clearTimeout')) return null;
  if (!line.includes('reject') && !line.toLowerCase().includes('timeout')) return null;
  if (ctx.content.includes('return () =>')) return null;
  return {
    file_path: ctx.filePath,
    line_number: lineNum,
    severity: 'low',
    category: 'settimeout_no_cleanup',
    message: 'setTimeout without cleanup in useEffect/cleanup',
    code_snippet: line.trim(),
    recommendation: 'Add cleanup function: return () => clearTimeout(timeoutId)',
  };
};

const PATTERN_DETECTORS: Detector[] = [
  detectPromiseRaceNoTimeout,
  detectLoadingWithoutFinally,
  detectAsyncNoErrorHandling,
  detectSetTimeoutNoCleanup,
];

const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py']);

export class TimeoutDetector {
  private logger: (msg: string) => void;
  findings: Finding[];

  constructor(logger?: (msg: string) => void) {
    this.logger = logger ?? console.log;
    this.findings = [];
  }

  async scanDirectory(repoPath: string): Promise<{ findings: Finding[]; statistics: ScanStatistics }> {
    this.findings = [];
    this.logger(`Scanning: ${repoPath}`);
    const files = await this._findFiles(repoPath);
    this.logger(`Found ${files.length} files to scan`);
    for (const file of files) {
      await this._scanFile(file);
    }
    return { findings: this.findings, statistics: this._calculateStatistics() };
  }

  private async _findFiles(repoPath: string): Promise<string[]> {
    const results: string[] = [];
    await this._walk(repoPath, results);
    return results;
  }

  private async _walk(dir: string, results: string[]): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this._walk(full, results);
      } else if (entry.isFile() && SCAN_EXTENSIONS.has(path.extname(entry.name))) {
        results.push(full);
      }
    }
  }

  private async _scanFile(filePath: string): Promise<void> {
    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch {
      return;
    }
    const lines = content.split('\n');
    const ctx = new FileContext(filePath, content, lines);
    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const line = lines[i];
      for (const detector of PATTERN_DETECTORS) {
        const finding = detector(ctx, lineNum, line);
        if (finding) this.findings.push(finding);
      }
    }
  }

  private _calculateStatistics(): ScanStatistics {
    const severity_breakdown: Record<string, number> = {};
    const category_breakdown: Record<string, number> = {};
    const filesAffected = new Set<string>();
    for (const f of this.findings) {
      severity_breakdown[f.severity] = (severity_breakdown[f.severity] ?? 0) + 1;
      category_breakdown[f.category] = (category_breakdown[f.category] ?? 0) + 1;
      filesAffected.add(f.file_path);
    }
    return {
      total_findings: this.findings.length,
      files_affected: filesAffected.size,
      severity_breakdown,
      category_breakdown,
    };
  }

  generateReport(results: { findings: Finding[]; statistics: ScanStatistics }): string {
    const stats = results.statistics;
    const lines: string[] = [
      '# Timeout Pattern Detection Report', '',
      '## Statistics', '',
      `- **Total Findings:** ${stats.total_findings}`,
      `- **Files Affected:** ${stats.files_affected}`, '',
      '### Severity Breakdown', '',
    ];
    const severityEmoji: Record<string, string> = { high: '🔴', medium: '🟡', low: '🟢' };
    for (const [severity, count] of Object.entries(stats.severity_breakdown)) {
      const emoji = severityEmoji[severity] ?? '⚪';
      lines.push(`- ${emoji} **${severity.toUpperCase()}:** ${count}`);
    }
    lines.push('', '### Category Breakdown', '');
    for (const [category, count] of Object.entries(stats.category_breakdown)) {
      lines.push(`- **${category}:** ${count}`);
    }
    lines.push('', '## Findings', '');
    this._addFindingsBySeverity(lines, results.findings);
    return lines.join('\n');
  }

  private _addFindingsBySeverity(lines: string[], findings: Finding[], maxPerSeverity = TIMEOUT_DETECTOR_DEFAULTS.MAX_FINDINGS_PER_SEVERITY): void {
    const SEVERITY_ORDER: Severity[] = ['high', 'medium', 'low'];
    for (const severity of SEVERITY_ORDER) {
      const severityFindings = findings.filter(f => f.severity === severity);
      if (!severityFindings.length) continue;
      lines.push(`### ${severity.toUpperCase()} Severity (${severityFindings.length})`, '');
      for (const finding of severityFindings.slice(0, maxPerSeverity)) {
        lines.push(
          `**${finding.file_path}:${finding.line_number}**`,
          `- Category: ${finding.category}`,
          `- Message: ${finding.message}`,
          `- Code: \`${finding.code_snippet}\``,
          `- Recommendation: ${finding.recommendation}`,
          ''
        );
      }
      const remaining = severityFindings.length - maxPerSeverity;
      if (remaining > 0) lines.push(`*... and ${remaining} more*\n`);
    }
  }
}

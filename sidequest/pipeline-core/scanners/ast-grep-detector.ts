import { spawn, ChildProcess } from 'child_process';
import { createComponentLogger, logStart } from '../../utils/logger.ts';
import { createTimer, captureProcessOutput } from '../utils/index.ts';
import fs from 'fs/promises';
import path from 'path';

const logger = createComponentLogger('AstGrepDetector');

// ============================================================================
// Type Definitions
// ============================================================================

export interface AstGrepDetectorOptions {
  rulesDirectory?: string;
  configPath?: string;
}

export interface DetectConfig {
  include_patterns?: string[];
  [key: string]: unknown;
}

export interface NormalizedMatch {
  rule_id: string | undefined;
  file_path: string;
  line_start: number;
  line_end: number;
  column_start: number | undefined;
  column_end: number | undefined;
  matched_text: string;
  message: string | undefined;
  severity: string;
  ast_node: Record<string, unknown>;
  meta_variables: Record<string, unknown>;
  _repoPath: string;
}

export interface DetectionStatistics {
  total_matches: number;
  rules_applied: number;
  files_scanned: number;
  scan_duration_ms: number;
}

export interface DetectionResult {
  matches: NormalizedMatch[];
  statistics: DetectionStatistics;
}

export interface RuleEntry {
  path: string;
  name: string;
}

interface RawAstGrepMatch {
  file?: string;
  path?: string;
  range?: {
    start?: { line?: number; column?: number };
    end?: { line?: number; column?: number };
  };
  line?: number;
  lines?: string;
  text?: string;
  matched?: string;
  column?: number;
  ruleId?: string;
  rule_id?: string;
  message?: string;
  severity?: string;
  metaVars?: Record<string, unknown>;
}

interface ProcessError extends Error {
  code?: number | string;
  stdout?: string;
  stderr?: string;
}

// ============================================================================
// AstGrepPatternDetector Class
// ============================================================================

/**
 * AST-Grep Pattern Detector
 *
 * Executes ast-grep scans to detect code patterns using AST matching.
 */
export class AstGrepPatternDetector {
  private readonly rulesDirectory: string;
  private readonly configPath: string;

    /**
   * Constructor.
   *
   * @param {AstGrepDetectorOptions} [options={}] - Options dictionary
   */
  constructor(options: AstGrepDetectorOptions = {}) {
    this.rulesDirectory = options.rulesDirectory ?? path.join(process.cwd(), '.ast-grep/rules');
    this.configPath = options.configPath ?? path.join(process.cwd(), '.ast-grep/sgconfig.yml');
  }

    /**
   * Detect patterns.
   *
   * @param {string} repoPath - The repoPath
   * @param {DetectConfig} [_detectConfig={}] - The  detectConfig
   *
   * @returns {Promise<DetectionResult>} The Promise<DetectionResult>
   * @async
   */
  async detectPatterns(repoPath: string, _detectConfig: DetectConfig = {}): Promise<DetectionResult> {
    const timer = createTimer();

    logStart(logger, 'pattern detection', { repoPath });

    try {
      // Load rules
      const rules = await this.loadRules(this.rulesDirectory);

      logger.info({ rulesCount: rules.length }, 'Loaded ast-grep rules');

      // Run ast-grep scan
      const matches = await this.runAstGrepScan(repoPath, _detectConfig);

      // Normalize matches
      const normalized = matches.map(m => this.normalizeMatch(m, repoPath));

      const duration = timer.elapsed();

      const statistics: DetectionStatistics = {
        total_matches: normalized.length,
        rules_applied: rules.length,
        files_scanned: new Set(normalized.map(m => m.file_path)).size,
        scan_duration_ms: duration * 1000
      };

      logger.info({
        repoPath,
        matches: statistics.total_matches,
        files: statistics.files_scanned,
        duration
      }, 'Pattern detection completed');

      return {
        matches: normalized,
        statistics: statistics
      };

    } catch (error) {
      logger.error({ repoPath, error }, 'Pattern detection failed');
      throw new PatternDetectionError(`Failed to detect patterns: ${(error as Error).message}`, {
        cause: error
      });
    }
  }

    /**
   * Run ast grep scan.
   *
   * @param {string} repoPath - The repoPath
   * @param {DetectConfig} _config - Configuration for 
   *
   * @returns {Promise<RawAstGrepMatch[]>} The Promise<RawAstGrepMatch[]>
   * @async
   */
  async runAstGrepScan(repoPath: string, _config: DetectConfig): Promise<RawAstGrepMatch[]> {
    return new Promise<RawAstGrepMatch[]>((resolve, reject) => {
      const args = [
        'scan',
        '--json',
        '--config', this.configPath
      ];

      // Note: ast-grep doesn't support --lang flag
      // Language filtering is done via rules and file extensions

      logger.debug({ args, cwd: repoPath }, 'Running ast-grep command');

      const proc: ChildProcess = spawn('sg', args, {
        cwd: repoPath
        // Note: spawn() doesn't support maxBuffer (only exec() does)
        // Large output is handled by accumulating stdout chunks
      });

      const output = captureProcessOutput(proc);

      proc.on('close', (code) => {
        const stdout = output.getStdout();
        const stderr = output.getStderr();

        if (code === 0 || code === null) {
          try {
            // Parse JSON output - ast-grep outputs a single JSON array
            const trimmed = stdout.trim();
            const matches: RawAstGrepMatch[] = trimmed ? JSON.parse(trimmed) : [];

            resolve(matches);
          } catch (error) {
            logger.warn({ error: (error as Error).message, stderr }, 'Failed to parse ast-grep output, returning empty results');
            resolve([]);
          }
        } else {
          logger.error({
            code,
            cwd: repoPath,
            args,
            stdout: stdout.slice(-1000),
            stderr: stderr.slice(-1000)
          }, `ast-grep exited with code ${code}`);

          const err: ProcessError = new Error(
            `ast-grep exited with code ${code}\n` +
            `stderr: ${stderr.slice(-200)}\n` +
            (code === 127 ? 'Binary not found. Install: npm install -g @ast-grep/cli\n' : '') +
            `Reproduce: cd ${repoPath} && sg ${args.join(' ')}`
          );
          err.code = code;
          err.stdout = stdout;
          err.stderr = stderr;
          reject(err);
        }
      });

      proc.on('error', (error: Error & { code?: string }) => {
        if (error.code === 'ENOENT') {
          reject(new Error('ast-grep (sg) command not found. Please install: npm install -g @ast-grep/cli'));
        } else {
          reject(error);
        }
      });
    });
  }

    /**
   * Normalize match.
   *
   * @param {RawAstGrepMatch} match - The match
   * @param {string} repoPath - The repoPath
   *
   * @returns {NormalizedMatch} The NormalizedMatch
   */
  normalizeMatch(match: RawAstGrepMatch, repoPath: string): NormalizedMatch {
    const filePath = match.file ?? match.path ?? '';
    const lineStart = match.range?.start?.line ?? match.line ?? 0;
    // Use 'lines' for full context (includes operators like !==, ===), fallback to 'text' for match pattern
    const matchedText = match.lines ?? match.text ?? match.matched ?? '';

    return {
      rule_id: match.ruleId ?? match.rule_id,
      file_path: filePath,
      line_start: lineStart,
      line_end: match.range?.end?.line ?? ((match.line ?? 0) + (match.lines?.length ?? 1) - 1),
      column_start: match.range?.start?.column ?? match.column,
      column_end: match.range?.end?.column,
      matched_text: matchedText,
      message: match.message,
      severity: match.severity ?? 'info',
      ast_node: match.metaVars ?? {},
      meta_variables: match.metaVars ?? {},
      _repoPath: repoPath  // Store for later context enrichment
    };
  }

    /**
   * Load the rules.
   *
   * @param {string} rulesDir - The rulesDir
   *
   * @returns {Promise<RuleEntry[]>} The rules
   * @async
   */
  async loadRules(rulesDir: string): Promise<RuleEntry[]> {
    const rules: RuleEntry[] = [];

        /**
     * Walk rules.
     *
     * @param {string} dir - The dir
     *
     * @returns {Promise<void>} The Promise<void>
     * @async
     */
    async function walkRules(dir: string): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          await walkRules(fullPath);
        } else if (entry.name.endsWith('.yml') || entry.name.endsWith('.yaml')) {
          rules.push({
            path: fullPath,
            name: entry.name.replace(/\.(yml|yaml)$/, '')
          });
        }
      }
    }

    try {
      await walkRules(rulesDir);
    } catch (error) {
      logger.warn({ rulesDir, error }, 'Failed to load rules directory');
    }

    return rules;
  }

    /**
   * Detect in file.
   *
   * @param {string} filePath - The filePath
   * @param {RuleEntry[]} [_rules=[]] - The  rules
   *
   * @returns {Promise<NormalizedMatch[]>} The Promise<NormalizedMatch[]>
   * @async
   */
  async detectInFile(filePath: string, _rules: RuleEntry[] = []): Promise<NormalizedMatch[]> {
    // For now, delegate to full scan
    // Can be optimized later to scan single file
    const dir = path.dirname(filePath);
    const result = await this.detectPatterns(dir, {
      include_patterns: [path.basename(filePath)]
    });

    return result.matches.filter(m => m.file_path === filePath);
  }
}

// ============================================================================
// Error Class
// ============================================================================

/**
 * Custom error class for pattern detection errors
 */
export class PatternDetectionError extends Error {
    /**
   * Constructor.
   *
   * @param {string} message - The message
   * @param {{ cause?: unknown }} options? - The options?
   */
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    if (options?.cause) {
      (this as unknown as Record<string, unknown>).cause = options.cause;
    }
    this.name = 'PatternDetectionError';
  }
}

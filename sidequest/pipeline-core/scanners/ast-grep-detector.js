// @ts-check
/** @typedef {import('../errors/error-types').ProcessError} ProcessError */
/** @typedef {import('../errors/error-types').NodeError} NodeError */

import { spawn } from 'child_process';
import { createComponentLogger } from '../../utils/logger.js';
import { createTimer, captureProcessOutput } from '../utils/index.js';
import fs from 'fs/promises';
import path from 'path';

const logger = createComponentLogger('AstGrepDetector');

/**
 * AST-Grep Pattern Detector
 *
 * Executes ast-grep scans to detect code patterns using AST matching.
 */
export class AstGrepPatternDetector {
  constructor(options = {}) {
    this.rulesDirectory = options.rulesDirectory || path.join(process.cwd(), '.ast-grep/rules');
    this.configPath = options.configPath || path.join(process.cwd(), '.ast-grep/sgconfig.yml');
  }

  /**
   * Detect patterns in repository
   *
   * @param {string} repoPath - Absolute path to repository
   * @param {object} detectConfig - Detection configuration
   * @returns {Promise<object>}
   */
  async detectPatterns(repoPath, detectConfig = {}) {
    const timer = createTimer();

    logger.info({ repoPath }, 'Starting pattern detection');

    try {
      // Load rules
      const rules = await this.loadRules(this.rulesDirectory);

      logger.info({ rulesCount: rules.length }, 'Loaded ast-grep rules');

      // Run ast-grep scan
      const matches = await this.runAstGrepScan(repoPath, detectConfig);

      // Normalize matches
      const normalized = matches.map(m => this.normalizeMatch(m, repoPath));

      const duration = timer.elapsed();

      const statistics = {
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
      throw new PatternDetectionError(`Failed to detect patterns: ${error.message}`, {
        cause: error
      });
    }
  }

  /**
   * Run ast-grep scan command
   */
  async runAstGrepScan(repoPath, config) {
    return new Promise((resolve, reject) => {
      const args = [
        'scan',
        '--json',
        '--config', this.configPath
      ];

      // Note: ast-grep doesn't support --lang flag
      // Language filtering is done via rules and file extensions

      logger.debug({ args, cwd: repoPath }, 'Running ast-grep command');

      const proc = spawn('sg', args, {
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
            const matches = trimmed ? JSON.parse(trimmed) : [];

            resolve(matches);
          } catch (error) {
            logger.warn({ error: error.message, stderr }, 'Failed to parse ast-grep output, returning empty results');
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

          const error = /** @type {ProcessError} */ (new Error(
            `ast-grep exited with code ${code}\n` +
            `stderr: ${stderr.slice(-200)}\n` +
            (code === 127 ? 'Binary not found. Install: npm install -g @ast-grep/cli\n' : '') +
            `Reproduce: cd ${repoPath} && sg ${args.join(' ')}`
          ));
          error.code = code;
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
        }
      });

      proc.on('error', (error) => {
        const nodeError = /** @type {NodeError} */ (error);
        if (nodeError.code === 'ENOENT') {
          reject(new Error('ast-grep (sg) command not found. Please install: npm install -g @ast-grep/cli'));
        } else {
          reject(error);
        }
      });
    });
  }

  /**
   * Normalize ast-grep match to standard format
   * Includes file context to capture function declarations
   */
  normalizeMatch(match, repoPath) {
    const filePath = match.file || match.path;
    const lineStart = match.range?.start?.line || match.line;
    // Use 'lines' for full context (includes operators like !==, ===), fallback to 'text' for match pattern
    const matchedText = match.lines || match.text || match.matched;

    return {
      rule_id: match.ruleId || match.rule_id,
      file_path: filePath,
      line_start: lineStart,
      line_end: match.range?.end?.line || (match.line + (match.lines?.length || 1) - 1),
      column_start: match.range?.start?.column || match.column,
      column_end: match.range?.end?.column,
      matched_text: matchedText,
      message: match.message,
      severity: match.severity || 'info',
      ast_node: match.metaVars || {},
      meta_variables: match.metaVars || {},
      _repoPath: repoPath  // Store for later context enrichment
    };
  }

  /**
   * Load all ast-grep rules from directory
   */
  async loadRules(rulesDir) {
    const rules = [];

    async function walkRules(dir) {
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
   * Detect patterns in a single file
   */
  async detectInFile(filePath, rules = []) {
    // For now, delegate to full scan
    // Can be optimized later to scan single file
    const dir = path.dirname(filePath);
    const result = await this.detectPatterns(dir, {
      include_patterns: [path.basename(filePath)]
    });

    return result.matches.filter(m => m.file_path === filePath);
  }
}

/**
 * Custom error class for pattern detection errors
 */
export class PatternDetectionError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'PatternDetectionError';
  }
}

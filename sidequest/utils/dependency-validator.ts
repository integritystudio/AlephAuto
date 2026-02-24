/**
 * DependencyValidator - Pre-flight validation for external dependencies
 *
 * Validates that required tools (repomix, ast-grep, Python) are available
 * before running the duplicate detection pipeline.
 *
 * @module dependency-validator
 */

import { execSync } from 'child_process';
import { createComponentLogger } from './logger.ts';
import { TIMEOUTS } from '../core/constants.ts';

const logger = createComponentLogger('DependencyValidator');

/**
 * Error thrown when dependency validation fails
 */
export class DependencyValidationError extends Error {
  failures: string[];

  constructor(failures: string[]) {
    super(`Dependency validation failed:\n${failures.map(f => `  - ${f}`).join('\n')}`);
    this.failures = failures;
    this.name = 'DependencyValidationError';
  }
}

/**
 * DependencyValidator - Validates external tool dependencies
 *
 * Checks for:
 * - repomix (via npx)
 * - ast-grep (global binary or via npx)
 * - Python 3.11+ (venv or system)
 */
export class DependencyValidator {
  /**
   * Validate all required dependencies
   */
  static async validateAll(): Promise<void> {
    const results = await Promise.allSettled([
      this.validateRepomix(),
      this.validateAstGrep(),
      this.validatePython()
    ]);

    const failures = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map(r => (r.reason as Error).message);

    if (failures.length > 0) {
      logger.error({ failures }, 'Dependency validation failed');
      throw new DependencyValidationError(failures);
    }

    logger.info('All dependencies validated successfully');
  }

  /**
   * Validate repomix is available
   */
  static async validateRepomix(): Promise<void> {
    try {
      execSync('npx repomix --version', {
        stdio: 'ignore',
        timeout: TIMEOUTS.DEPENDENCY_CHECK_MS,
        env: process.env
      });
      logger.debug('repomix validation passed');
    } catch {
      throw new Error(
        'repomix not available. Install: npm install\n' +
        'Or verify package.json includes "repomix" dependency.'
      );
    }
  }

  /**
   * Validate ast-grep is available
   */
  static async validateAstGrep(): Promise<void> {
    // Try global binary first
    try {
      execSync('sg --version', {
        stdio: 'ignore',
        timeout: TIMEOUTS.VERSION_CHECK_MS
      });
      logger.debug('ast-grep validation passed (global binary)');
      return;
    } catch {
      // Global binary not found, try npx fallback
    }

    // Fallback to npx (slower but works)
    try {
      execSync('npx @ast-grep/cli --version', {
        stdio: 'ignore',
        timeout: TIMEOUTS.DEPENDENCY_CHECK_MS,
        env: process.env
      });
      logger.debug('ast-grep validation passed (via npx)');
    } catch {
      throw new Error(
        'ast-grep not available. Install:\n' +
        '  Global: npm install -g @ast-grep/cli\n' +
        '  Local: npm install (already in optionalDependencies)'
      );
    }
  }

  /**
   * Validate Python 3.11+ is available
   */
  static async validatePython(): Promise<string> {
    const pythonPaths = [
      { path: 'venv/bin/python3', name: 'venv' },
      { path: 'python3', name: 'system' }
    ];

    for (const { path: pythonPath, name } of pythonPaths) {
      try {
        const version = execSync(`${pythonPath} --version`, {
          encoding: 'utf-8',
          timeout: TIMEOUTS.VERSION_CHECK_MS
        });

        const match = version.match(/Python (\d+)\.(\d+)/);
        if (match) {
          const major = parseInt(match[1]);
          const minor = parseInt(match[2]);

          if (major >= 3 && minor >= 11) {
            logger.debug({ pythonPath, version: `${major}.${minor}`, name }, 'Python validation passed');
            return pythonPath;
          }
        }
      } catch {
        // This Python path not available, try next
      }
    }

    throw new Error(
      'Python 3.11+ not available. Install:\n' +
      '  macOS: brew install python@3.11\n' +
      '  Ubuntu: sudo apt install python3.11\n' +
      'Or create venv: python3 -m venv venv'
    );
  }
}

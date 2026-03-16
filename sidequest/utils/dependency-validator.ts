/**
 * DependencyValidator - Pre-flight validation for external dependencies
 *
 * Validates that required tools (repomix, ast-grep) are available
 * before running the duplicate detection pipeline.
 *
 * @module dependency-validator
 */

import { execFileSync } from 'child_process';
import { createComponentLogger } from './logger.ts';
import { TIMEOUTS } from '../core/constants.ts';

const logger = createComponentLogger('DependencyValidator');

/**
 * Error thrown when dependency validation fails
 */
export class DependencyValidationError extends Error {
  failures: string[];

  /**
   * constructor.
   */
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
 */
export class DependencyValidator {
  /**
   * Validate all required dependencies
   */
  static async validateAll(): Promise<void> {
    const results = await Promise.allSettled([
      this.validateRepomix(),
      this.validateAstGrep()
    ]);

    const failures = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map(r => (r.reason instanceof Error ? r.reason.message : String(r.reason)));

    if (failures.length > 0) {
      logger.error({ failures }, 'Dependency validation failed');
      throw new DependencyValidationError(failures);
    }

    logger.info('All dependencies validated successfully');
  }

  /**
   * Validate repomix is available
   */
  static validateRepomix(): void {
    try {
      execFileSync('npx', ['repomix', '--version'], {
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
  static validateAstGrep(): void {
    // Try global binary first
    try {
      execFileSync('sg', ['--version'], {
        stdio: 'ignore',
        timeout: TIMEOUTS.VERSION_CHECK_MS,
        env: process.env
      });
      logger.debug('ast-grep validation passed (global binary)');
      return;
    } catch {
      // Global binary not found, try npx fallback
    }

    // Fallback to npx (slower but works)
    try {
      execFileSync('npx', ['@ast-grep/cli', '--version'], {
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

}

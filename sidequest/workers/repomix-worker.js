// @ts-nocheck
import { SidequestServer } from '../core/server.js';
import { generateReport } from '../utils/report-generator.js';
import { spawn, execSync } from 'child_process';
import { captureProcessOutput } from '@shared/process-io';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createComponentLogger, logError } from '../utils/logger.ts';
import { config } from '../core/config.ts';
import { TIMEOUTS, LIMITS } from '../core/constants.ts';

const logger = createComponentLogger('RepomixWorker');

/**
 * RepomixWorker - Executes repomix jobs
 *
 * Respects .gitignore files by default - any directories or files listed
 * in .gitignore will be automatically excluded from processing.
 *
 * Options:
 * - respectGitignore: Respect .gitignore files (default: true)
 * - additionalIgnorePatterns: Array of additional patterns to ignore (default: [])
 * - outputBaseDir: Base directory for output files
 * - codeBaseDir: Base directory for source code
 */
export class RepomixWorker extends SidequestServer {
  constructor(options = {}) {
    super({
      ...options,
      jobType: 'repomix',
    });
    this.outputBaseDir = options.outputBaseDir || './condense';
    this.codeBaseDir = options.codeBaseDir || path.join(os.homedir(), 'code');

    // Gitignore handling (respects .gitignore by default)
    this.respectGitignore = options.respectGitignore !== false; // Default: true

    // Default ignore patterns from config (includes README.md and markdown files)
    // Can be overridden via options or environment variable
    this.additionalIgnorePatterns = options.additionalIgnorePatterns || config.repomixIgnorePatterns || [];

    if (this.additionalIgnorePatterns.length > 0) {
      logger.info(
        { patterns: this.additionalIgnorePatterns },
        'RepomixWorker configured with ignore patterns (README files will be skipped)'
      );
    }

    // Pre-flight check: Verify repomix is available
    this.#verifyRepomixAvailable();
  }

  /**
   * Verify repomix is available via npx
   * Throws if repomix cannot be found
   * @private
   */
  #verifyRepomixAvailable() {
    try {
      execSync('npx repomix --version', {
        stdio: 'ignore',
        timeout: TIMEOUTS.LONG_MS, // Allow time during heavy system load
        env: process.env, // Inherit full PATH from parent
      });
      logger.info('Pre-flight check: repomix is available');
    } catch (error) {
      // ETIMEDOUT can happen under heavy load - treat as available but warn
      if (error.code === 'ETIMEDOUT') {
        logger.warn('Pre-flight check timed out after 30s - assuming repomix is available');
        return;
      }
      const errorMessage =
        'repomix is not available. Please install it:\n' +
        '  npm install\n' +
        'Or verify package.json includes "repomix" dependency.\n' +
        `PATH: ${process.env.PATH}`;
      logError(logger, error, errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Run repomix for a specific directory
   */
  async runJobHandler(job) {
    const startTime = Date.now();
    const { sourceDir, relativePath } = job.data;

    // Create output directory matching the source structure
    const outputDir = path.join(this.outputBaseDir, relativePath);
    await fs.mkdir(outputDir, { recursive: true });

    const outputFile = path.join(outputDir, 'repomix-output.txt');

    logger.info({ jobId: job.id, sourceDir, outputFile }, 'Running repomix');

    try {
      const { stdout, stderr } = await this.#runRepomixCommand(sourceDir);

      // Save the output to the appropriate location
      await fs.writeFile(outputFile, stdout);

      if (stderr) {
        logger.warn({ jobId: job.id, stderr }, 'Repomix warnings');
      }

      const result = {
        sourceDir,
        outputFile,
        relativePath,
        size: (await fs.stat(outputFile)).size,
        timestamp: new Date().toISOString(),
      };

      // Generate HTML/JSON reports
      const endTime = Date.now();
      const repoName = path.basename(sourceDir);
      const reportPaths = await generateReport({
        jobId: job.id,
        jobType: 'repomix',
        status: 'completed',
        result,
        startTime,
        endTime,
        parameters: job.data,
        metadata: {
          repoName,
          outputSize: result.size
        }
      });

      result.reportPaths = reportPaths;
      logger.info({ reportPaths }, 'Repomix reports generated');

      return result;
    } catch (error) {
      // Even if command fails, try to save any output
      if (error.stdout) {
        await fs.writeFile(outputFile, error.stdout);
      }
      throw error;
    }
  }

  /**
   * Securely run repomix command using npx (prevents command injection)
   * Uses npx to ensure local repomix from node_modules is used
   *
   * By default, repomix respects .gitignore files and excludes:
   * - Files and directories listed in .gitignore
   * - Common patterns (node_modules, .git, etc.)
   *
   * @param {string} cwd - Current working directory to run repomix in
   * @private
   */
  async #runRepomixCommand(cwd) {
    // Pre-flight check: Validate working directory exists before spawning
    // This prevents cryptic 'uv_cwd' ENOENT errors when directory is deleted
    try {
      const stats = await fs.stat(cwd);
      if (!stats.isDirectory()) {
        const error = new Error(`Working directory is not a directory: ${cwd}`);
        error.code = 'ENOTDIR';
        throw error;
      }
    } catch (statError) {
      if (statError.code === 'ENOENT') {
        const error = new Error(
          `Working directory no longer exists: ${cwd}\n` +
          'This can happen when scanning temporary directories that are cleaned up before the scan completes.'
        );
        error.code = 'ENOENT';
        error.originalError = statError;
        logger.error({ cwd, error: statError }, 'Working directory deleted before repomix could run');
        throw error;
      }
      throw statError;
    }

    return new Promise((resolve, reject) => {
      // Build repomix arguments
      const args = ['repomix'];

      // Disable gitignore if requested (NOT recommended)
      if (!this.respectGitignore) {
        args.push('--no-gitignore');
        logger.warn({ cwd }, 'Running repomix with --no-gitignore (not recommended)');
      }

      // Add additional ignore patterns if specified
      if (this.additionalIgnorePatterns.length > 0) {
        args.push('--ignore', this.additionalIgnorePatterns.join(','));
        logger.info(
          { cwd, patterns: this.additionalIgnorePatterns },
          'Adding additional ignore patterns'
        );
      }

      logger.debug({ cwd, args }, 'Spawning repomix with arguments');

      const proc = spawn('npx', args, {
        cwd,
        timeout: TIMEOUTS.REPOMIX_MS,
        maxBuffer: 50 * 1024 * 1024, // 50MB buffer
        env: process.env, // Inherit full PATH from parent to locate npx
      });

      const output = captureProcessOutput(proc);

      proc.on('close', (code) => {
        const stdout = output.getStdout();
        const stderr = output.getStderr();
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          logger.error({
            code,
            cwd,
            args,
            stdout: stdout.slice(-LIMITS.MAX_OUTPUT_CHARS),
            stderr: stderr.slice(-LIMITS.MAX_OUTPUT_CHARS)
          }, `repomix exited with code ${code}`);

          const error = new Error(
            `repomix exited with code ${code}\n` +
            `stderr: ${stderr.slice(-200)}\n` +
            `Reproduce: cd ${cwd} && npx repomix ${args.slice(1).join(' ')}`
          );
          error.code = code;
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
        }
      });

      proc.on('error', (spawnError) => {
        const stdout = output.getStdout();
        const stderr = output.getStderr();
        // Enhance error message for common spawn failures
        let enhancedError = spawnError;
        if (spawnError.syscall === 'uv_cwd' || spawnError.syscall === 'spawn') {
          enhancedError = new Error(
            `Failed to spawn repomix process: ${spawnError.message}\n` +
            `Working directory: ${cwd}\n` +
            'This usually means the directory was deleted during the scan.'
          );
          enhancedError.code = spawnError.code;
          enhancedError.syscall = spawnError.syscall;
          enhancedError.originalError = spawnError;
          logger.error({ cwd, error: spawnError }, 'Spawn failed - directory may have been deleted');
        }
        enhancedError.stdout = stdout;
        enhancedError.stderr = stderr;
        reject(enhancedError);
      });
    });
  }

  /**
   * Create a repomix job for a directory
   */
  createRepomixJob(sourceDir, relativePath) {
    const jobId = `repomix-${relativePath.replace(/\//g, '-')}-${Date.now()}`;

    return this.createJob(jobId, {
      sourceDir,
      relativePath,
      type: 'repomix',
    });
  }
}

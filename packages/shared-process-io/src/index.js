/**
 * Shared Process I/O Utilities
 *
 * Provides utilities for spawning child processes with output capture,
 * timing measurement, and common execution patterns.
 *
 * @module @shared/process-io
 */

import { spawn } from 'child_process';

/**
 * @typedef {Object} OutputAccessors
 * @property {() => string} getStdout - Get captured stdout
 * @property {() => string} getStderr - Get captured stderr
 */

/**
 * @typedef {Object} ExecResult
 * @property {string} stdout - Captured stdout
 * @property {string} stderr - Captured stderr
 * @property {number} code - Exit code
 */

/**
 * Captures stdout and stderr from a spawned process
 *
 * @param {import('child_process').ChildProcess} proc - Spawned process
 * @returns {OutputAccessors} Output accessors
 *
 * @example
 * const proc = spawn('git', ['status']);
 * const output = captureProcessOutput(proc);
 * proc.on('close', () => {
 *   console.log(output.getStdout());
 * });
 */
export function captureProcessOutput(proc) {
  let stdout = '';
  let stderr = '';

  if (proc.stdout) {
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
  }

  if (proc.stderr) {
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
  }

  return {
    getStdout: () => stdout,
    getStderr: () => stderr
  };
}

/**
 * Executes a command and returns a promise with stdout/stderr
 *
 * @param {string} command - Command to execute
 * @param {string[]} args - Command arguments
 * @param {Object} [options] - Spawn options
 * @param {string} [options.cwd] - Working directory
 * @param {NodeJS.ProcessEnv} [options.env] - Environment variables
 * @param {number} [options.timeout] - Timeout in milliseconds
 * @returns {Promise<ExecResult>}
 *
 * @example
 * const result = await execCommand('git', ['status'], { cwd: '/repo' });
 * console.log(result.stdout);
 */
export function execCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env
    });

    const output = captureProcessOutput(proc);

    let timeoutId;
    if (options.timeout) {
      timeoutId = setTimeout(() => {
        proc.kill('SIGTERM');
        reject(new Error(`Command timed out after ${options.timeout}ms: ${command} ${args.join(' ')}`));
      }, options.timeout);
    }

    proc.on('close', (code) => {
      if (timeoutId) clearTimeout(timeoutId);
      resolve({
        stdout: output.getStdout(),
        stderr: output.getStderr(),
        code: code ?? 0
      });
    });

    proc.on('error', (error) => {
      if (timeoutId) clearTimeout(timeoutId);
      reject(error);
    });
  });
}

/**
 * Executes a command and throws on non-zero exit code
 *
 * @param {string} command - Command to execute
 * @param {string[]} args - Command arguments
 * @param {Object} [options] - Spawn options (same as execCommand)
 * @returns {Promise<{ stdout: string, stderr: string }>}
 * @throws {Error} If command exits with non-zero code
 *
 * @example
 * const { stdout } = await execCommandOrThrow('git', ['rev-parse', 'HEAD']);
 */
export async function execCommandOrThrow(command, args, options = {}) {
  const result = await execCommand(command, args, options);

  if (result.code !== 0) {
    const error = new Error(
      `Command failed with code ${result.code}: ${command} ${args.join(' ')}\n` +
      `stderr: ${result.stderr.slice(-500)}`
    );
    /** @type {any} */ (error).code = result.code;
    /** @type {any} */ (error).stdout = result.stdout;
    /** @type {any} */ (error).stderr = result.stderr;
    throw error;
  }

  return { stdout: result.stdout, stderr: result.stderr };
}

/**
 * Run a shell command with output capture (simplified API for common use cases)
 *
 * @param {string} cwd - Working directory
 * @param {string} command - Command to run
 * @param {string[]} args - Command arguments
 * @returns {Promise<string>} Trimmed stdout on success
 * @throws {Error} On non-zero exit code with stderr details
 *
 * @example
 * const status = await runCommand('/repo', 'git', ['status', '--porcelain']);
 */
export async function runCommand(cwd, command, args) {
  const result = await execCommand(command, args, { cwd });

  if (result.code !== 0) {
    const error = new Error(`Command failed: ${command} ${args.join(' ')}\n${result.stderr}`);
    /** @type {any} */ (error).code = result.code;
    /** @type {any} */ (error).stdout = result.stdout;
    /** @type {any} */ (error).stderr = result.stderr;
    throw error;
  }

  return result.stdout.trim();
}

/**
 * Shared Process I/O Utilities
 *
 * Provides utilities for spawning child processes with output capture,
 * timing measurement, and common execution patterns.
 *
 * @module @shared/process-io
 */

import { spawn, type ChildProcess } from 'child_process';

export interface OutputAccessors {
  getStdout: () => string;
  getStderr: () => string;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface ExecOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeout?: number;
}

export interface ProcessError extends Error {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Captures stdout and stderr from a spawned process
 */
export function captureProcessOutput(proc: ChildProcess): OutputAccessors {
  let stdout = '';
  let stderr = '';

  if (proc.stdout) {
    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
  }

  if (proc.stderr) {
    proc.stderr.on('data', (data: Buffer) => {
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
 */
export function execCommand(command: string, args: string[], options: ExecOptions = {}): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env
    });

    const output = captureProcessOutput(proc);

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
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
 */
export async function execCommandOrThrow(command: string, args: string[], options: ExecOptions = {}): Promise<{ stdout: string; stderr: string }> {
  const result = await execCommand(command, args, options);

  if (result.code !== 0) {
    const error = new Error(
      `Command failed with code ${result.code}: ${command} ${args.join(' ')}\n` +
      `stderr: ${result.stderr.slice(-500)}`
    ) as Error & { code: number; stdout: string; stderr: string };
    error.code = result.code;
    error.stdout = result.stdout;
    error.stderr = result.stderr;
    throw error;
  }

  return { stdout: result.stdout, stderr: result.stderr };
}

/**
 * Run a shell command with output capture (simplified API for common use cases)
 */
export async function runCommand(cwd: string, command: string, args: string[]): Promise<string> {
  const result = await execCommand(command, args, { cwd });

  if (result.code !== 0) {
    const error = new Error(`Command failed: ${command} ${args.join(' ')}\n${result.stderr}`) as Error & { code: number; stdout: string; stderr: string };
    error.code = result.code;
    error.stdout = result.stdout;
    error.stderr = result.stderr;
    throw error;
  }

  return result.stdout.trim();
}

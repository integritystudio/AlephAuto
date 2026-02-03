import { ChildProcess } from 'child_process';

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
export function captureProcessOutput(proc: ChildProcess): OutputAccessors;

/**
 * Executes a command and returns a promise with stdout/stderr
 */
export function execCommand(
  command: string,
  args: string[],
  options?: ExecOptions
): Promise<ExecResult>;

/**
 * Executes a command and throws on non-zero exit code
 */
export function execCommandOrThrow(
  command: string,
  args: string[],
  options?: ExecOptions
): Promise<{ stdout: string; stderr: string }>;

/**
 * Run a shell command with output capture (simplified API)
 */
export function runCommand(
  cwd: string,
  command: string,
  args: string[]
): Promise<string>;

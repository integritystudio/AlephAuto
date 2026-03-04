import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

interface ScriptRunResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

const TEST_TIMEOUT_MS = 15_000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const envSensitiveTest = process.env.SKIP_ENV_SENSITIVE_TESTS === '1'
  ? test.skip
  : test;

async function runScript(
  scriptRelativePath: string,
  args: string[],
  envOverrides: Record<string, string>,
  timeoutMs: number = TEST_TIMEOUT_MS
): Promise<ScriptRunResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--strip-types', path.join(REPO_ROOT, scriptRelativePath), ...args],
      {
        cwd: REPO_ROOT,
        env: { ...process.env, ...envOverrides },
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );

    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });

    child.on('exit', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ code, signal, stdout, stderr, timedOut });
    });
  });
}

envSensitiveTest('repo-cleanup --run-now exits after startup job without entering cron mode', async (t) => {
  const cleanupRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-cleanup-once-'));
  await fs.mkdir(path.join(cleanupRoot, 'repo-a', '__pycache__'), { recursive: true });
  await fs.writeFile(path.join(cleanupRoot, 'repo-a', '__pycache__', 'a.pyc'), 'x');

  t.after(async () => {
    await fs.rm(cleanupRoot, { recursive: true, force: true });
  });

  const result = await runScript(
    'pipeline-runners/repo-cleanup-pipeline.ts',
    ['--run-now'],
    {
      CLEANUP_TARGET_DIR: cleanupRoot,
      CLEANUP_DRY_RUN: 'true',
      RUN_ON_STARTUP: 'false',
    }
  );

  assert.equal(result.timedOut, false, `repo-cleanup timed out.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.equal(result.code, 0, `repo-cleanup exit code ${result.code}.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
});

envSensitiveTest('gitignore --run-now exits after startup job without entering cron mode', async (t) => {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitignore-once-'));
  const repoDir = path.join(baseDir, 'repo-a');
  await fs.mkdir(path.join(repoDir, '.git'), { recursive: true });
  await fs.writeFile(path.join(repoDir, '.gitignore'), '# existing\n');

  t.after(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  const result = await runScript(
    'pipeline-runners/gitignore-pipeline.ts',
    ['--run-now'],
    {
      GITIGNORE_BASE_DIR: baseDir,
      GITIGNORE_MAX_DEPTH: '2',
      GITIGNORE_DRY_RUN: 'true',
      RUN_ON_STARTUP: 'false',
    }
  );

  assert.equal(result.timedOut, false, `gitignore timed out.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.equal(result.code, 0, `gitignore exit code ${result.code}.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
});

envSensitiveTest('dashboard populate --run-now surfaces startup job failure and exits non-zero', async (t) => {
  const fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-once-'));

  t.after(async () => {
    await fs.rm(fakeHome, { recursive: true, force: true });
  });

  const result = await runScript(
    'pipeline-runners/dashboard-populate-pipeline.ts',
    ['--run-now', '--skip-sync'],
    {
      HOME: fakeHome,
      RUN_ON_STARTUP: 'false',
    }
  );

  assert.equal(result.timedOut, false, `dashboard timed out.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.notEqual(result.code, 0, `dashboard unexpectedly succeeded.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
});

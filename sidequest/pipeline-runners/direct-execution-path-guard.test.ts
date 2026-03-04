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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const DIRECT_EXEC_TEST_TIMEOUT_MS = 3_000;
const KEEP_ALIVE_CHECK_MS = 1_200;

const GUARDED_PIPELINES = [
  'pipeline-runners/git-activity-pipeline.ts',
  'pipeline-runners/bugfix-audit-pipeline.ts',
  'pipeline-runners/plugin-management-pipeline.ts',
  'pipeline-runners/schema-enhancement-pipeline.ts',
  'pipeline-runners/duplicate-detection-pipeline.ts',
  'pipeline-runners/repo-cleanup-pipeline.ts',
  'pipeline-runners/gitignore-pipeline.ts'
];

async function runViaSymlinkWithSpace(scriptRelativePath: string): Promise<ScriptRunResult> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'direct-exec-guard-'));
  const realScriptPath = path.join(REPO_ROOT, scriptRelativePath);
  const linkPath = path.join(tempDir, `entry with space ${path.basename(scriptRelativePath)}`);
  await fs.symlink(realScriptPath, linkPath);

  try {
    return await new Promise<ScriptRunResult>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ['--strip-types', linkPath],
        {
          cwd: REPO_ROOT,
          env: {
            ...process.env,
            RUN_ON_STARTUP: 'false',
            NODE_ENV: 'test',
            LOG_LEVEL: 'info'
          },
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
      }, KEEP_ALIVE_CHECK_MS);

      const hardTimeout = setTimeout(() => {
        if (!settled) {
          child.kill('SIGKILL');
          reject(new Error(`Timed out waiting for ${scriptRelativePath} to exit`));
        }
      }, DIRECT_EXEC_TEST_TIMEOUT_MS);

      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        clearTimeout(hardTimeout);
        reject(error);
      });

      child.on('exit', (code, signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        clearTimeout(hardTimeout);
        resolve({ code, signal, stdout, stderr, timedOut });
      });
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

for (const scriptRelativePath of GUARDED_PIPELINES) {
  test(`${scriptRelativePath} executes directly via symlink path with spaces`, async () => {
    const result = await runViaSymlinkWithSpace(scriptRelativePath);
    assert.equal(
      result.timedOut,
      true,
      `${scriptRelativePath} exited early (code=${result.code}, signal=${result.signal}). stdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  });
}

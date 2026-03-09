import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { RepoCleanupWorker } from './repo-cleanup-worker.ts';

test('runCleanup treats targetDir as a literal path (no shell interpolation)', async (t) => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-cleanup-worker-'));
  const markerFile = `repo-cleanup-injection-marker-${Date.now()}`;
  const markerPath = path.join(process.cwd(), markerFile);
  const injectedDir = path.join(tmpRoot, `repo-$(touch ${markerFile})`);

  await fs.rm(markerPath, { force: true });
  await fs.mkdir(injectedDir, { recursive: true });

  t.after(async () => {
    await fs.rm(markerPath, { force: true });
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  const worker = new RepoCleanupWorker({ autoStart: false, baseDir: tmpRoot });
  worker.stop();

  const result = await (
    worker as unknown as { runCleanup: (targetDir: string) => Promise<{ totalItems: number }> }
  ).runCleanup(injectedDir);

  assert.equal(result.totalItems, 0);
  await assert.rejects(
    fs.access(markerPath),
    /ENOENT/
  );
});

test('runCleanup succeeds when only temp files are detected', async (t) => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-cleanup-temp-only-'));
  const targetDir = path.join(tmpRoot, 'repo');
  const tempFile = path.join(targetDir, '__pycache__', 'a.pyc');

  await fs.mkdir(path.dirname(tempFile), { recursive: true });
  await fs.writeFile(tempFile, 'x');

  t.after(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  const worker = new RepoCleanupWorker({ autoStart: false, baseDir: tmpRoot });
  worker.stop();

  const result = await (
    worker as unknown as {
      runCleanup: (targetDir: string) => Promise<{ totalItems: number; summary: { tempFiles: number } }>;
    }
  ).runCleanup(targetDir);

  assert.ok(result.totalItems >= 1);
  assert.ok(result.summary.tempFiles >= 1);
  await assert.rejects(
    fs.access(tempFile),
    /ENOENT/
  );
});

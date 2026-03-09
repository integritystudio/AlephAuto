import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { DirectoryScanner } from './directory-scanner.ts';

test('generateAndSaveScanResults uses maxDepth=0 for empty scans', async (t) => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'directory-scanner-test-'));
  const outputDir = path.join(tmpRoot, 'out');

  t.after(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  const scanner = new DirectoryScanner({
    baseDir: tmpRoot,
    outputDir
  });

  const result = await scanner.generateAndSaveScanResults([]);
  const summaryOnDisk = JSON.parse(await fs.readFile(result.summaryPath, 'utf8')) as { maxDepth: number };

  assert.equal(result.summary.maxDepth, 0);
  assert.equal(summaryOnDisk.maxDepth, 0);
});

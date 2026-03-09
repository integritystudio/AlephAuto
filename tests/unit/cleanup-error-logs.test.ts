/**
 * Unit tests for scripts/cleanup-error-logs.ts
 * Covers TC-M1 (getFileAgeDays) and TC-M3 (scanErrorLogs file-filter and recursion).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { TIMEOUTS } from '../../sidequest/core/constants.ts';
import { TIME_MS } from '../../sidequest/core/units.ts';
import { getFileAgeDays, scanErrorLogs } from '../../scripts/cleanup-error-logs.ts';

describe('getFileAgeDays - TC-M1', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-cleanup-'));
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should return age less than 1 for a file created just now', async () => {
    const file = path.join(tempDir, 'new.error.json');
    fs.writeFileSync(file, '{}');
    const age = await getFileAgeDays(file);
    assert.ok(age < 1, `Expected age < 1, got ${age}`);
  });

  it('should return age greater than 7 for a file with mtime 8 days ago', async () => {
    const file = path.join(tempDir, 'old.error.json');
    fs.writeFileSync(file, '{}');
    const eightDaysAgo = new Date(Date.now() - 8 * TIME_MS.DAY);
    fs.utimesSync(file, eightDaysAgo, eightDaysAgo);
    const age = await getFileAgeDays(file);
    assert.ok(age > 7, `Expected age > 7, got ${age}`);
  });

  it('TIMEOUTS.ONE_DAY_MS equals TIME_MS.DAY (regression guard)', () => {
    assert.strictEqual(TIMEOUTS.ONE_DAY_MS, TIME_MS.DAY);
  });

  it('should return age proportional to mtime offset', async () => {
    const file = path.join(tempDir, 'mid.error.json');
    fs.writeFileSync(file, '{}');
    const threeDaysAgo = new Date(Date.now() - 3 * TIME_MS.DAY);
    fs.utimesSync(file, threeDaysAgo, threeDaysAgo);
    const age = await getFileAgeDays(file);
    assert.ok(age >= 2.9 && age <= 3.1, `Expected age ~3, got ${age}`);
  });
});

describe('scanErrorLogs - TC-M3', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-scan-'));
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should return empty array for empty directory', async () => {
    const result = await scanErrorLogs(tempDir);
    assert.deepStrictEqual(result, []);
  });

  it('should collect only .error.json files, skipping .json and .txt', async () => {
    fs.writeFileSync(path.join(tempDir, 'job-1.error.json'), '{}');
    fs.writeFileSync(path.join(tempDir, 'job-2.json'), '{}');
    fs.writeFileSync(path.join(tempDir, 'notes.txt'), 'text');
    const result = await scanErrorLogs(tempDir);
    assert.strictEqual(result.length, 1);
    assert.ok(result[0].name === 'job-1.error.json');
  });

  it('should recurse into subdirectories', async () => {
    const subDir = path.join(tempDir, 'pipeline-a');
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, 'job-nested.error.json'), '{}');
    fs.writeFileSync(path.join(tempDir, 'job-root.error.json'), '{}');
    const result = await scanErrorLogs(tempDir);
    assert.strictEqual(result.length, 2);
    const names = result.map(r => r.name);
    assert.ok(names.includes('job-nested.error.json'));
    assert.ok(names.includes('job-root.error.json'));
  });

  it('should include path, name, ageDays, sizeBytes, directory fields', async () => {
    fs.writeFileSync(path.join(tempDir, 'job.error.json'), '{"id":"test"}');
    const result = await scanErrorLogs(tempDir);
    assert.strictEqual(result.length, 1);
    const entry = result[0];
    assert.ok('path' in entry);
    assert.ok('name' in entry);
    assert.ok('ageDays' in entry);
    assert.ok('sizeBytes' in entry);
    assert.ok('directory' in entry);
    assert.ok(entry.sizeBytes > 0);
  });
});

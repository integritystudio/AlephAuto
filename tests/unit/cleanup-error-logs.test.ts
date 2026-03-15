/**
 * Unit tests for scripts/logs/cleanup-error-logs.ts
 * Covers TC-M1 (getFileAgeDays) and TC-M3 (scanErrorLogs file-filter and recursion).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { TIME_MS } from '../../sidequest/core/units.ts';
import { DEFAULT_RETENTION_DAYS, getFileAgeDays, scanErrorLogs } from '../../scripts/logs/cleanup-error-logs.ts';

/** Days offset beyond retention threshold for "old file" tests */
const DAYS_BEYOND_RETENTION = DEFAULT_RETENTION_DAYS + 1;

/** Days offset for proportional-age test */
const PROPORTIONAL_TEST_DAYS = 3;

/** Tolerance for float age comparison (accounts for sub-second test execution) */
const AGE_TOLERANCE = 0.1;

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

  it('should return age greater than retention for a file beyond retention days', async () => {
    const file = path.join(tempDir, 'old.error.json');
    fs.writeFileSync(file, '{}');
    const pastDate = new Date(Date.now() - DAYS_BEYOND_RETENTION * TIME_MS.DAY);
    fs.utimesSync(file, pastDate, pastDate);
    const age = await getFileAgeDays(file);
    assert.ok(age > DEFAULT_RETENTION_DAYS, `Expected age > ${DEFAULT_RETENTION_DAYS}, got ${age}`);
  });

  it('should return age proportional to mtime offset', async () => {
    const file = path.join(tempDir, 'mid.error.json');
    fs.writeFileSync(file, '{}');
    const pastDate = new Date(Date.now() - PROPORTIONAL_TEST_DAYS * TIME_MS.DAY);
    fs.utimesSync(file, pastDate, pastDate);
    const age = await getFileAgeDays(file);
    assert.ok(
      age >= PROPORTIONAL_TEST_DAYS - AGE_TOLERANCE && age <= PROPORTIONAL_TEST_DAYS + AGE_TOLERANCE,
      `Expected age ~${PROPORTIONAL_TEST_DAYS}, got ${age}`
    );
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

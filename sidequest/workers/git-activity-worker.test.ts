import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  buildGitActivityStatsFromData,
  parseGitActivityStatsFromJsonFiles,
  parseGitActivityStatsFromText,
} from './git-activity-worker.ts';

test('buildGitActivityStatsFromData coerces numeric values safely', () => {
  const stats = buildGitActivityStatsFromData({
    total_commits: '12',
    total_repositories: '3',
    total_additions: 44,
    total_deletions: '9',
    total_files: '18',
  });

  assert.deepEqual(stats, {
    totalCommits: 12,
    totalRepositories: 3,
    linesAdded: 44,
    linesDeleted: 9,
    filesChanged: 18,
  });
});

test('parseGitActivityStatsFromJsonFiles parses valid JSON output files', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-activity-worker-test-'));
  t.after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const jsonPath = path.join(tmpDir, 'report.json');
  await fs.writeFile(jsonPath, JSON.stringify({
    total_commits: 8,
    repositories: [{ name: 'a' }, { name: 'b' }],
    total_additions: 100,
    total_deletions: 20,
    total_files: 14,
  }));

  const stats = await parseGitActivityStatsFromJsonFiles(['report.json'], tmpDir);

  assert.deepEqual(stats, {
    totalCommits: 8,
    totalRepositories: 2,
    linesAdded: 100,
    linesDeleted: 20,
    filesChanged: 14,
  });
});

test('parseGitActivityStatsFromJsonFiles skips invalid JSON and returns null when none parse', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-activity-worker-test-'));
  t.after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  await fs.writeFile(path.join(tmpDir, 'bad.json'), '{not json');

  const stats = await parseGitActivityStatsFromJsonFiles(['bad.json'], tmpDir);

  assert.equal(stats, null);
});

test('parseGitActivityStatsFromJsonFiles skips JSON without total_commits and uses next file', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-activity-worker-test-'));
  t.after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  await fs.writeFile(path.join(tmpDir, 'partial.json'), JSON.stringify({ total_files: 9 }));
  await fs.writeFile(path.join(tmpDir, 'good.json'), JSON.stringify({
    total_commits: 4,
    total_repositories: 2,
    total_additions: 11,
    total_deletions: 3,
    total_files: 9,
  }));

  const stats = await parseGitActivityStatsFromJsonFiles(['partial.json', 'good.json'], tmpDir);

  assert.deepEqual(stats, {
    totalCommits: 4,
    totalRepositories: 2,
    linesAdded: 11,
    linesDeleted: 3,
    filesChanged: 9,
  });
});

test('parseGitActivityStatsFromText parses text summary fallback', () => {
  const stats = parseGitActivityStatsFromText(`
Total commits: 17
Lines added: 222
Lines deleted: 101
Active repositories: 6
File changes: 45
`);

  assert.deepEqual(stats, {
    totalCommits: 17,
    totalRepositories: 6,
    linesAdded: 222,
    linesDeleted: 101,
    filesChanged: 45,
  });
});

test('parseGitActivityStatsFromText defaults missing fields to zero', () => {
  const stats = parseGitActivityStatsFromText('Total commits: 3');

  assert.deepEqual(stats, {
    totalCommits: 3,
    totalRepositories: 0,
    linesAdded: 0,
    linesDeleted: 0,
  });
});

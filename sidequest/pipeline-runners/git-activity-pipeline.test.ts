import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGitActivityCliArgs } from './git-activity-pipeline.ts';

test('parseGitActivityCliArgs parses explicit start/end date and run flag', () => {
  const parsed = parseGitActivityCliArgs(
    ['--run', '--start-date', '2026-03-01', '--end-date', '2026-03-04'],
    false
  );

  assert.equal(parsed.runNow, true);
  assert.deepEqual(parsed.options, {
    sinceDate: '2026-03-01',
    untilDate: '2026-03-04',
  });
  assert.deepEqual(parsed.errors, []);
});

test('parseGitActivityCliArgs accepts legacy --since/--until aliases', () => {
  const parsed = parseGitActivityCliArgs(
    ['--since', '2026-02-01', '--until', '2026-02-10'],
    false
  );

  assert.equal(parsed.runNow, false);
  assert.deepEqual(parsed.options, {
    sinceDate: '2026-02-01',
    untilDate: '2026-02-10',
  });
  assert.deepEqual(parsed.errors, []);
});

test('parseGitActivityCliArgs rejects --end-date without --start-date', () => {
  const parsed = parseGitActivityCliArgs(['--end-date', '2026-03-04'], false);

  assert.ok(parsed.errors.includes('--end-date requires --start-date'));
});

test('parseGitActivityCliArgs rejects invalid --days values', () => {
  const parsed = parseGitActivityCliArgs(['--days', 'abc'], false);

  assert.equal(parsed.options.days, undefined);
  assert.ok(parsed.errors.some((msg) => msg.includes('--days must be a positive integer')));
});

test('parseGitActivityCliArgs rejects invalid date format', () => {
  const parsed = parseGitActivityCliArgs(['--start-date', '03/01/2026'], false);

  assert.ok(parsed.errors.includes('--start-date must match YYYY-MM-DD (received: 03/01/2026)'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { GIT_ACTIVITY } from '../core/constants.ts';
import { parseGitActivityCliArgs, selectGitActivityJob } from './git-activity-pipeline.ts';

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

test('selectGitActivityJob chooses weekly strategy from default report type', () => {
  const selection = selectGitActivityJob({}, GIT_ACTIVITY.WEEKLY_REPORT_TYPE);

  assert.equal(selection.strategy, 'weekly');
  assert.equal(selection.options.reportType, GIT_ACTIVITY.WEEKLY_REPORT_TYPE);
});

test('selectGitActivityJob chooses monthly strategy by days shortcut', () => {
  const selection = selectGitActivityJob(
    { days: GIT_ACTIVITY.MONTHLY_WINDOW_DAYS },
    GIT_ACTIVITY.WEEKLY_REPORT_TYPE
  );

  assert.equal(selection.strategy, 'monthly');
});

test('selectGitActivityJob chooses custom strategy when start and end date exist', () => {
  const selection = selectGitActivityJob(
    { sinceDate: '2026-03-01', untilDate: '2026-03-04' },
    GIT_ACTIVITY.WEEKLY_REPORT_TYPE
  );

  assert.equal(selection.strategy, 'custom');
});

test('selectGitActivityJob chooses generic strategy when only start date exists', () => {
  const selection = selectGitActivityJob(
    { sinceDate: '2026-03-01' },
    GIT_ACTIVITY.WEEKLY_REPORT_TYPE
  );

  assert.equal(selection.strategy, 'generic');
});

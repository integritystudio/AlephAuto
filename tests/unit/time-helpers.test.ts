import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  calculateDurationSeconds,
  formatDuration,
  toISOString,
  DURATION_UNKNOWN_LABEL,
} from '../../sidequest/utils/time-helpers.ts';
import { TIME_MS } from '../../sidequest/core/units.ts';

const FIVE_AND_HALF_SECONDS_MS = 5_500;
const THREE_SECONDS_MS = 3_000;
const NINETY_SECONDS = 90;
const THREE_HOURS_THIRTY_MIN_FIFTEEN_SEC = 3 * 3600 + 30 * 60 + 15;

describe('DURATION_UNKNOWN_LABEL', () => {
  it('should equal the string returned by formatDuration for null', () => {
    assert.strictEqual(formatDuration(null), DURATION_UNKNOWN_LABEL);
  });
});

describe('calculateDurationSeconds', () => {
  it('should return null when startTime is null', () => {
    assert.strictEqual(calculateDurationSeconds(null, new Date()), null);
  });

  it('should return null when endTime is null', () => {
    assert.strictEqual(calculateDurationSeconds(new Date(), null), null);
  });

  it('should return null for invalid date strings', () => {
    assert.strictEqual(calculateDurationSeconds('not-a-date', '2024-01-01T00:00:00Z'), null);
  });

  it('should calculate from Date objects', () => {
    const start = new Date('2024-01-01T10:00:00.000Z');
    const end = new Date('2024-01-01T10:00:03.000Z');
    assert.strictEqual(calculateDurationSeconds(start, end), THREE_SECONDS_MS / TIME_MS.SECOND);
  });

  it('should calculate from ISO string timestamps', () => {
    const start = '2024-01-01T10:00:00.000Z';
    const end = '2024-01-01T10:00:03.000Z';
    assert.strictEqual(calculateDurationSeconds(start, end), THREE_SECONDS_MS / TIME_MS.SECOND);
  });

  it('should round sub-second precision via Math.round', () => {
    const start = new Date('2024-01-01T10:00:00.000Z');
    const end = new Date(start.getTime() + FIVE_AND_HALF_SECONDS_MS);
    const result = calculateDurationSeconds(start, end);
    assert.strictEqual(result, Math.round(FIVE_AND_HALF_SECONDS_MS / TIME_MS.SECOND));
    assert.strictEqual(result, 6);
  });

  it('should round down when fraction < 0.5', () => {
    const start = new Date('2024-01-01T10:00:00.000Z');
    const end = new Date(start.getTime() + 2_400);
    assert.strictEqual(calculateDurationSeconds(start, end), 2);
  });

  it('should handle mixed Date and string inputs', () => {
    const start = new Date('2024-01-01T10:00:00.000Z');
    const end = '2024-01-01T10:00:05.000Z';
    assert.strictEqual(calculateDurationSeconds(start, end), 5);
  });

  it('should return 0 for identical timestamps', () => {
    const ts = '2024-01-01T10:00:00.000Z';
    assert.strictEqual(calculateDurationSeconds(ts, ts), 0);
  });
});

describe('formatDuration', () => {
  it('should return DURATION_UNKNOWN_LABEL for null', () => {
    assert.strictEqual(formatDuration(null), DURATION_UNKNOWN_LABEL);
  });

  it('should return DURATION_UNKNOWN_LABEL for undefined', () => {
    assert.strictEqual(formatDuration(undefined), DURATION_UNKNOWN_LABEL);
  });

  it('should format whole seconds without decimals', () => {
    assert.strictEqual(formatDuration(3), '3s');
  });

  it('should format fractional seconds preserving decimal', () => {
    assert.strictEqual(formatDuration(5.25), '5.25s');
  });

  it('should format 0 seconds', () => {
    assert.strictEqual(formatDuration(0), '0s');
  });

  it('should format minutes and seconds', () => {
    assert.strictEqual(formatDuration(NINETY_SECONDS), '1m 30s');
  });

  it('should format hours, minutes, and seconds', () => {
    assert.strictEqual(
      formatDuration(THREE_HOURS_THIRTY_MIN_FIFTEEN_SEC),
      '3h 30m 15s',
    );
  });

  it('should format exactly 60 seconds as 1m 0s', () => {
    assert.strictEqual(formatDuration(60), '1m 0s');
  });
});

describe('toISOString', () => {
  it('should return null for null input', () => {
    assert.strictEqual(toISOString(null), null);
  });

  it('should return null for undefined input', () => {
    assert.strictEqual(toISOString(undefined), null);
  });

  it('should convert Date to ISO string', () => {
    const d = new Date('2024-06-15T12:00:00.000Z');
    assert.strictEqual(toISOString(d), '2024-06-15T12:00:00.000Z');
  });

  it('should pass through string values unchanged', () => {
    const iso = '2024-06-15T12:00:00.000Z';
    assert.strictEqual(toISOString(iso), iso);
  });
});

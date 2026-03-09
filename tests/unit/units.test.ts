/**
 * Units Constants Tests
 *
 * Validates correctness of derived constant values in units.ts,
 * particularly after enum → as const migration.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  TIME_MS, SECONDS, BITS, PERCENTILE,
  BYTES, BYTES_DECIMAL,
  NANOSECONDS_PER_SECOND, MAX_NANOSECOND_FRACTION,
  MINUTES_PER_HOUR, HOURS_PER_DAY, DAYS_PER_WEEK,
  PERCENT_MULTIPLIER,
} from '../../sidequest/core/units.ts';

describe('units', () => {
  describe('TIME_MS', () => {
    it('has correct millisecond values', () => {
      assert.strictEqual(TIME_MS.MS, 1);
      assert.strictEqual(TIME_MS.SECOND, 1_000);
      assert.strictEqual(TIME_MS.MINUTE, 60_000);
      assert.strictEqual(TIME_MS.HOUR, 3_600_000);
      assert.strictEqual(TIME_MS.DAY, 86_400_000);
      assert.strictEqual(TIME_MS.WEEK, 604_800_000);
    });

    it('maintains consistent derivation chain', () => {
      assert.strictEqual(TIME_MS.MINUTE, TIME_MS.SECOND * MINUTES_PER_HOUR);
      assert.strictEqual(TIME_MS.HOUR, TIME_MS.MINUTE * MINUTES_PER_HOUR);
      assert.strictEqual(TIME_MS.DAY, TIME_MS.HOUR * HOURS_PER_DAY);
      assert.strictEqual(TIME_MS.WEEK, TIME_MS.DAY * DAYS_PER_WEEK);
    });
  });

  describe('SECONDS', () => {
    it('SECOND equals 1 (not 1ms)', () => {
      assert.strictEqual(SECONDS.SECOND, 1);
    });

    it('has correct second values', () => {
      assert.strictEqual(SECONDS.MINUTE, 60);
      assert.strictEqual(SECONDS.HOUR, 3_600);
      assert.strictEqual(SECONDS.DAY, 86_400);
      assert.strictEqual(SECONDS.WEEK, 604_800);
    });

    it('derives correctly from TIME_MS', () => {
      assert.strictEqual(SECONDS.MINUTE, TIME_MS.MINUTE / TIME_MS.SECOND);
      assert.strictEqual(SECONDS.HOUR, TIME_MS.HOUR / TIME_MS.SECOND);
      assert.strictEqual(SECONDS.DAY, TIME_MS.DAY / TIME_MS.SECOND);
      assert.strictEqual(SECONDS.WEEK, TIME_MS.WEEK / TIME_MS.SECOND);
    });
  });

  describe('BITS', () => {
    it('has correct power-of-two values', () => {
      assert.strictEqual(BITS.BIT, 1);
      assert.strictEqual(BITS.BYTE, 8);
      assert.strictEqual(BITS.B16, 16);
      assert.strictEqual(BITS.B32, 32);
      assert.strictEqual(BITS.B64, 64);
      assert.strictEqual(BITS.B128, 128);
      assert.strictEqual(BITS.B256, 256);
      assert.strictEqual(BITS.B512, 512);
    });

    it('aliases match their base values', () => {
      assert.strictEqual(BITS.QUARTER_KB, BITS.B256);
      assert.strictEqual(BITS.HALF_KB, BITS.B512);
    });
  });

  describe('PERCENTILE', () => {
    it('has correct values', () => {
      assert.strictEqual(PERCENTILE.P88, 0.88);
      assert.strictEqual(PERCENTILE.P50, 50);
      assert.strictEqual(PERCENTILE.P95, 95);
      assert.strictEqual(PERCENTILE.P99, 99);
    });
  });

  describe('BYTES', () => {
    it('has correct binary byte values', () => {
      assert.strictEqual(BYTES.B, 1);
      assert.strictEqual(BYTES.KB, 1_024);
      assert.strictEqual(BYTES.MB, 1_048_576);
      assert.strictEqual(BYTES.GB, 1_073_741_824);
    });

    it('each tier is 1024x the previous', () => {
      assert.strictEqual(BYTES.KB, BYTES.B * 1_024);
      assert.strictEqual(BYTES.MB, BYTES.KB * 1_024);
      assert.strictEqual(BYTES.GB, BYTES.MB * 1_024);
      assert.strictEqual(BYTES.TB, BYTES.GB * 1_024);
      assert.strictEqual(BYTES.PB, BYTES.TB * 1_024);
    });
  });

  describe('BYTES_DECIMAL', () => {
    it('has correct decimal byte values', () => {
      assert.strictEqual(BYTES_DECIMAL.B, 1);
      assert.strictEqual(BYTES_DECIMAL.KB, 1_000);
      assert.strictEqual(BYTES_DECIMAL.MB, 1_000_000);
      assert.strictEqual(BYTES_DECIMAL.GB, 1_000_000_000);
    });

    it('each tier is 1000x the previous', () => {
      assert.strictEqual(BYTES_DECIMAL.KB, BYTES_DECIMAL.B * 1_000);
      assert.strictEqual(BYTES_DECIMAL.MB, BYTES_DECIMAL.KB * 1_000);
      assert.strictEqual(BYTES_DECIMAL.GB, BYTES_DECIMAL.MB * 1_000);
      assert.strictEqual(BYTES_DECIMAL.TB, BYTES_DECIMAL.GB * 1_000);
      assert.strictEqual(BYTES_DECIMAL.PB, BYTES_DECIMAL.TB * 1_000);
    });
  });

  describe('nanosecond constants', () => {
    it('has correct values', () => {
      assert.strictEqual(NANOSECONDS_PER_SECOND, 1_000_000_000);
      assert.strictEqual(MAX_NANOSECOND_FRACTION, 999_999_999);
    });
  });

  describe('cross-unit consistency', () => {
    it('SECONDS * 1000 equals TIME_MS', () => {
      assert.strictEqual(SECONDS.MINUTE * TIME_MS.SECOND, TIME_MS.MINUTE);
      assert.strictEqual(SECONDS.HOUR * TIME_MS.SECOND, TIME_MS.HOUR);
      assert.strictEqual(SECONDS.DAY * TIME_MS.SECOND, TIME_MS.DAY);
    });

    it('PERCENT_MULTIPLIER is 100', () => {
      assert.strictEqual(PERCENT_MULTIPLIER, 100);
    });
  });
});

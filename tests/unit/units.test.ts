/**
 * Units Constants Tests
 *
 * Validates derivation chains and cross-unit consistency in units.ts.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  TIME_MS, SECONDS, BITS,
  BYTES, BYTES_DECIMAL,
  MINUTES_PER_HOUR, HOURS_PER_DAY, DAYS_PER_WEEK,
} from '../../sidequest/core/units.ts';

describe('units', () => {
  describe('TIME_MS', () => {
    it('maintains consistent derivation chain', () => {
      assert.strictEqual(TIME_MS.MINUTE, TIME_MS.SECOND * MINUTES_PER_HOUR);
      assert.strictEqual(TIME_MS.HOUR, TIME_MS.MINUTE * MINUTES_PER_HOUR);
      assert.strictEqual(TIME_MS.DAY, TIME_MS.HOUR * HOURS_PER_DAY);
      assert.strictEqual(TIME_MS.WEEK, TIME_MS.DAY * DAYS_PER_WEEK);
    });
  });

  describe('SECONDS', () => {
    it('derives correctly from TIME_MS', () => {
      assert.strictEqual(SECONDS.MINUTE, TIME_MS.MINUTE / TIME_MS.SECOND);
      assert.strictEqual(SECONDS.HOUR, TIME_MS.HOUR / TIME_MS.SECOND);
      assert.strictEqual(SECONDS.DAY, TIME_MS.DAY / TIME_MS.SECOND);
      assert.strictEqual(SECONDS.WEEK, TIME_MS.WEEK / TIME_MS.SECOND);
    });
  });

  describe('BITS', () => {
    it('aliases match their base values', () => {
      assert.strictEqual(BITS.QUARTER_KB, BITS.B256);
      assert.strictEqual(BITS.HALF_KB, BITS.B512);
    });
  });

  describe('BYTES', () => {
    it('each tier is 1024x the previous', () => {
      assert.strictEqual(BYTES.KB, BYTES.B * 1_024);
      assert.strictEqual(BYTES.MB, BYTES.KB * 1_024);
      assert.strictEqual(BYTES.GB, BYTES.MB * 1_024);
      assert.strictEqual(BYTES.TB, BYTES.GB * 1_024);
      assert.strictEqual(BYTES.PB, BYTES.TB * 1_024);
    });
  });

  describe('BYTES_DECIMAL', () => {
    it('each tier is 1000x the previous', () => {
      assert.strictEqual(BYTES_DECIMAL.KB, BYTES_DECIMAL.B * 1_000);
      assert.strictEqual(BYTES_DECIMAL.MB, BYTES_DECIMAL.KB * 1_000);
      assert.strictEqual(BYTES_DECIMAL.GB, BYTES_DECIMAL.MB * 1_000);
      assert.strictEqual(BYTES_DECIMAL.TB, BYTES_DECIMAL.GB * 1_000);
      assert.strictEqual(BYTES_DECIMAL.PB, BYTES_DECIMAL.TB * 1_000);
    });
  });

  describe('cross-unit consistency', () => {
    it('SECONDS * 1000 equals TIME_MS', () => {
      assert.strictEqual(SECONDS.MINUTE * TIME_MS.SECOND, TIME_MS.MINUTE);
      assert.strictEqual(SECONDS.HOUR * TIME_MS.SECOND, TIME_MS.HOUR);
      assert.strictEqual(SECONDS.DAY * TIME_MS.SECOND, TIME_MS.DAY);
    });
  });
});

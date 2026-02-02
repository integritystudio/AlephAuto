/**
 * Timing Helper Utilities
 *
 * Provides utilities for measuring execution duration and timing operations.
 *
 * @module lib/utils/timing-helpers
 */

/**
 * Creates a timer for measuring operation duration
 *
 * @returns {{ elapsed: () => number, elapsedMs: () => number, elapsedFormatted: () => string }}
 *
 * @example
 * const timer = createTimer();
 * // ... do work ...
 * console.log(`Completed in ${timer.elapsed()}s`);
 */
export function createTimer() {
  const startTime = Date.now();

  return {
    /** Returns elapsed time in seconds */
    elapsed: () => (Date.now() - startTime) / 1000,

    /** Returns elapsed time in milliseconds */
    elapsedMs: () => Date.now() - startTime,

    /** Returns formatted elapsed time string */
    elapsedFormatted: () => {
      const ms = Date.now() - startTime;
      if (ms < 1000) return `${ms}ms`;
      if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
      return `${(ms / 60000).toFixed(2)}m`;
    }
  };
}

/**
 * Wraps an async function with timing measurement
 *
 * @template T
 * @param {() => Promise<T>} fn - Async function to time
 * @param {string} [label] - Label for logging
 * @returns {Promise<{ result: T, durationMs: number, durationSec: number }>}
 *
 * @example
 * const { result, durationSec } = await withTiming(
 *   () => fetchData(),
 *   'fetchData'
 * );
 */
export async function withTiming(fn, label) {
  const timer = createTimer();
  const result = await fn();
  const durationMs = timer.elapsedMs();

  return {
    result,
    durationMs,
    durationSec: durationMs / 1000
  };
}

/**
 * Measures sync function execution time
 *
 * @template T
 * @param {() => T} fn - Sync function to time
 * @returns {{ result: T, durationMs: number }}
 */
export function measureSync(fn) {
  const start = performance.now();
  const result = fn();
  const durationMs = performance.now() - start;

  return { result, durationMs };
}

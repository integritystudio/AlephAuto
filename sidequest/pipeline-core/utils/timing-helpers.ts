/**
 * Timing Helper Utilities
 *
 * Provides utilities for measuring execution duration and timing operations.
 *
 * @module lib/utils/timing-helpers
 */

import { TIME_MS } from '../../core/constants.ts';

interface Timer {
  /** Returns elapsed time in seconds */
  elapsed: () => number;
  /** Returns elapsed time in milliseconds */
  elapsedMs: () => number;
  /** Returns formatted elapsed time string */
  elapsedFormatted: () => string;
}

/**
 * Create the timer.
 *
 * @returns {Timer} The created timer
 */
export function createTimer(): Timer {
  const startTime = Date.now();

  return {
    elapsed: () => (Date.now() - startTime) / TIME_MS.SECOND,
    elapsedMs: () => Date.now() - startTime,
    elapsedFormatted: () => {
      const ms = Date.now() - startTime;
      if (ms < TIME_MS.SECOND) return `${ms}ms`;
      if (ms < TIME_MS.MINUTE) return `${(ms / TIME_MS.SECOND).toFixed(2)}s`;
      return `${(ms / TIME_MS.MINUTE).toFixed(2)}m`;
    }
  };
}

/**
 * Wraps an async function with timing measurement
 */
export async function withTiming<T>(fn: () => Promise<T>, _label?: string): Promise<{ result: T; durationMs: number; durationSec: number }> {
  const timer = createTimer();
  const result = await fn();
  const durationMs = timer.elapsedMs();

  return {
    result,
    durationMs,
    durationSec: durationMs / TIME_MS.SECOND
  };
}

/**
 * Measures sync function execution time
 */
export function measureSync<T>(fn: () => T): { result: T; durationMs: number } {
  const start = performance.now();
  const result = fn();
  const durationMs = performance.now() - start;

  return { result, durationMs };
}

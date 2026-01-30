/**
 * Time and Date Utility Functions
 *
 * Shared utilities for timestamp handling across the codebase.
 *
 * @module sidequest/utils/time-helpers
 */

/**
 * Normalize a value to ISO string format
 *
 * Handles Date objects, existing ISO strings, and null/undefined values.
 * Used for consistent timestamp formatting before database persistence.
 *
 * @param {Date|string|null|undefined} val - Value to normalize
 * @returns {string|null} ISO string or null
 *
 * @example
 * toISOString(new Date()) // "2026-01-30T12:00:00.000Z"
 * toISOString("2026-01-30T12:00:00.000Z") // "2026-01-30T12:00:00.000Z"
 * toISOString(null) // null
 * toISOString(undefined) // null
 */
export function toISOString(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  return val; // Already a string
}

/**
 * Calculate duration in seconds between two timestamps
 *
 * @param {Date|string|null} startTime - Start timestamp
 * @param {Date|string|null} endTime - End timestamp
 * @returns {number|null} Duration in seconds, or null if either timestamp is missing
 *
 * @example
 * calculateDurationSeconds("2026-01-30T12:00:00.000Z", "2026-01-30T12:05:30.000Z") // 330
 */
export function calculateDurationSeconds(startTime, endTime) {
  if (!startTime || !endTime) return null;

  const start = startTime instanceof Date ? startTime : new Date(startTime);
  const end = endTime instanceof Date ? endTime : new Date(endTime);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;

  return Math.round((end.getTime() - start.getTime()) / 1000);
}

/**
 * Format duration for human-readable display
 *
 * @param {number|null} seconds - Duration in seconds
 * @returns {string} Formatted duration string
 *
 * @example
 * formatDuration(65) // "1m 5s"
 * formatDuration(3665) // "1h 1m 5s"
 * formatDuration(null) // "unknown"
 */
export function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return 'unknown';

  if (seconds < 60) return `${seconds}s`;

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }

  return `${minutes}m ${secs}s`;
}

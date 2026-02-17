/**
 * Time and Date Utility Functions
 *
 * Shared utilities for timestamp handling across the codebase.
 *
 * @module sidequest/utils/time-helpers
 */

import { TIME } from '../core/constants.ts';

/**
 * Normalize a value to ISO string format
 *
 * Handles Date objects, existing ISO strings, and null/undefined values.
 * Used for consistent timestamp formatting before database persistence.
 */
export function toISOString(val: Date | string | null | undefined): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  return val; // Already a string
}

/**
 * Calculate duration in seconds between two timestamps
 */
export function calculateDurationSeconds(startTime: Date | string | null, endTime: Date | string | null): number | null {
  if (!startTime || !endTime) return null;

  const start = startTime instanceof Date ? startTime : new Date(startTime);
  const end = endTime instanceof Date ? endTime : new Date(endTime);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;

  return Math.round((end.getTime() - start.getTime()) / TIME.SECOND);
}

/**
 * Format duration for human-readable display
 */
export function formatDuration(seconds: number | null | undefined): string {
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

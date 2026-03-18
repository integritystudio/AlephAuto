/**
 * Time and Date Utility Functions
 *
 * Shared utilities for timestamp handling across the codebase.
 *
 * @module sidequest/utils/time-helpers
 */

import { TIME_MS } from '../core/units.ts';

export const DURATION_UNKNOWN_LABEL = 'unknown';
const ISO_DATE_LENGTH = 10;

/**
 * Returns the date portion (YYYY-MM-DD) of an ISO timestamp.
 *
 * @param date Date to format. Defaults to now.
 * @returns Date string in YYYY-MM-DD format.
 */
export function toISODateString(date: Date = new Date()): string {
  return date.toISOString().slice(0, ISO_DATE_LENGTH);
}

/**
 * Returns the current time as an ISO 8601 string.
 */
export function nowISO(): string {
  return new Date().toISOString();
}

const SECONDS_PER_MINUTE = TIME_MS.MINUTE / TIME_MS.SECOND;
const SECONDS_PER_HOUR = TIME_MS.HOUR / TIME_MS.SECOND;

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

export function toDate(time: Date | string | null): Date | null {
  if (!time) return null;

  const dateTime = time instanceof Date ? time : new Date(time);

  if (isNaN(dateTime.getTime())) return null;

  return dateTime;
}

/**
 * Calculate duration in seconds between two timestamps
 */
export function calculateDurationSeconds(startTime: Date | string | null, endTime: Date | string | null): number | null {
  const start = toDate(startTime);
  const end = toDate(endTime);

  if (!start || !end) return null;

  return Math.round((end.getTime() - start.getTime()) / TIME_MS.SECOND);
}

/**
 * Format duration for human-readable display
 */
/**
 * Format a timestamp string for display, returning 'Unknown' for missing or invalid values.
 */
export function formatTimestamp(value: string | null | undefined): string {
  const date = toDate(value);
  return date ? 'Unknown' : date.toLocaleString();
}

/**
 * Format duration for human-readable display
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return DURATION_UNKNOWN_LABEL;

  if (seconds < SECONDS_PER_MINUTE) return `${seconds}s`;

  const hours = Math.floor(seconds / SECONDS_PER_HOUR);
  const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const secs = seconds % SECONDS_PER_MINUTE;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }

  return `${minutes}m ${secs}s`;
}

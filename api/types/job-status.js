/**
 * Job Status Type Definitions
 *
 * Provides type-safe job status enum and validation.
 * Use these instead of string literals for status comparisons.
 *
 * @module api/types/job-status
 */

import { z } from 'zod';

/**
 * Valid job status values
 * @type {Readonly<Object.<string, string>>}
 */
export const JOB_STATUS = Object.freeze({
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  PAUSED: 'paused',
});

/**
 * Job Status Schema - validates status values
 */
export const JobStatusSchema = z.enum([
  JOB_STATUS.QUEUED,
  JOB_STATUS.RUNNING,
  JOB_STATUS.COMPLETED,
  JOB_STATUS.FAILED,
  JOB_STATUS.CANCELLED,
  JOB_STATUS.PAUSED,
]);

/**
 * Check if a value is a valid job status
 *
 * @param {unknown} value - Value to check
 * @returns {boolean} True if value is a valid JobStatus
 */
export function isValidJobStatus(value) {
  return JobStatusSchema.safeParse(value).success;
}

/**
 * Terminal statuses - jobs in these states won't change
 * @type {readonly string[]}
 */
export const TERMINAL_STATUSES = Object.freeze([
  JOB_STATUS.COMPLETED,
  JOB_STATUS.FAILED,
  JOB_STATUS.CANCELLED,
]);

/**
 * Check if a status is terminal (job won't change state)
 *
 * @param {string} status - Status to check
 * @returns {boolean} True if status is terminal
 */
export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.includes(status);
}

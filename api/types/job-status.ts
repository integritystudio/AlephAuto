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
 */
export const JOB_STATUS = Object.freeze({
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  PAUSED: 'paused',
} as const);

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
 * Job Status type - union of valid status strings
 */
export type JobStatus = z.infer<typeof JobStatusSchema>;

/**
 * Check if a value is a valid job status
 *
 * @param value - Value to check
 * @returns True if value is a valid JobStatus
 */
/**
 * Check if valid job status.
 *
 * @param {unknown} value - The value
 *
 * @returns {value is JobStatus} True if valid job status, False otherwise
 */
export function isValidJobStatus(value: unknown): value is JobStatus {
  return JobStatusSchema.safeParse(value).success;
}

/**
 * Terminal statuses - jobs in these states won't change
 */
export const TERMINAL_STATUSES: readonly JobStatus[] = Object.freeze([
  JOB_STATUS.COMPLETED,
  JOB_STATUS.FAILED,
  JOB_STATUS.CANCELLED,
]);

/**
 * Check if a status is terminal (job won't change state)
 *
 * @param status - Status to check
 * @returns True if status is terminal
 */
/**
 * Check if terminal status.
 *
 * @param {JobStatus} status - The status
 *
 * @returns {boolean} True if terminal status, False otherwise
 */
export function isTerminalStatus(status: JobStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

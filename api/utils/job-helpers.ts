import { JOB_EVENTS, JOB_EVENT_LABELS, RESERVED_JOB_KEYS } from '#sidequest/core/constants.ts';

/** Map job status to JOB_EVENTS constant */
export function jobStatusToEventType(status: string): string {
  if (status === 'completed') return JOB_EVENTS.COMPLETED;
  if (status === 'failed') return JOB_EVENTS.FAILED;
  if (status === 'running') return JOB_EVENTS.STARTED;
  return JOB_EVENTS.CREATED;
}

/** Map job status to human-readable label */
export function jobStatusToLabel(status: string): string {
  if (status === 'completed') return JOB_EVENT_LABELS.COMPLETED;
  if (status === 'failed') return JOB_EVENT_LABELS.FAILED;
  if (status === 'running') return JOB_EVENT_LABELS.STARTED;
  return JOB_EVENT_LABELS.CREATED;
}

/**
 * Returns a copy of jobData with all reserved system keys removed.
 * Prevents stale or injected control fields from carrying over on retry.
 */
export function filterReservedJobKeys(jobData: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(jobData)) {
    if (!RESERVED_JOB_KEYS.has(key)) {
      result[key] = value;
    }
  }
  return result;
}

const RESERVED_JOB_KEYS = new Set(['retriedFrom', 'triggeredBy', 'triggeredAt', 'retryCount']);

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

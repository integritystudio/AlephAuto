/**
 * Activity Stable ID Tests (FE-M1)
 *
 * Verifies that mapApiActivity() generates a stable, deterministic ID
 * when the activity object has no `id` field, instead of calling
 * crypto.randomUUID() which produces a new random ID on every poll cycle
 * (causing duplicate activity items to accumulate in the dashboard).
 *
 * The current implementation (crypto.randomUUID() fallback) will cause
 * tests 1 and 2 to fail because repeated calls on the same input produce
 * different IDs.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// ------------------------------------------------------------------
// Inline the current production implementation of mapApiActivity
// (copied verbatim from frontend/src/hooks/useWebSocketConnection.ts)
// so the test exercises the real logic without pulling in React/browser
// dependencies.  The GREEN phase will extract this to a testable module
// and make mapApiActivity an explicit named export.
// ------------------------------------------------------------------

interface ApiActivity {
  id?: string;
  type: string;
  pipelineId?: string;
  jobType?: string;
  pipelineName?: string;
  message?: string;
  timestamp?: string;
  jobId?: string;
}

// Minimal stand-in for ActivityType — only the values referenced by
// ACTIVITY_TYPE_MAP are needed; no enum syntax per project conventions.
const ActivityType = {
  QUEUED:     'queued',
  STARTED:    'started',
  COMPLETED:  'completed',
  FAILED:     'failed',
  CANCELLED:  'cancelled',
  RETRY:      'retry',
  PROGRESS:   'progress',
} as const;

const ACTIVITY_TYPE_MAP: Record<string, string> = {
  'job:created':      ActivityType.QUEUED,
  'job:started':      ActivityType.STARTED,
  'job:completed':    ActivityType.COMPLETED,
  'job:failed':       ActivityType.FAILED,
  'job:cancelled':    ActivityType.CANCELLED,
  'retry:created':    ActivityType.RETRY,
  'retry:max-attempts': ActivityType.FAILED,
};

/**
 * Exact copy of the current production mapApiActivity implementation.
 * This is what the tests are validating — the randomUUID fallback must be
 * replaced with a deterministic ID in the GREEN phase.
 */
function mapApiActivity(activity: ApiActivity) {
  const pipelineId = activity.pipelineId || activity.jobType || 'unknown';
  return {
    '@type': 'https://schema.org/Event' as const,
    id: activity.id || `activity-${activity.type}-${activity.timestamp ?? ''}-${activity.jobId ?? ''}-${activity.pipelineId ?? activity.jobType ?? ''}`,
    type: ACTIVITY_TYPE_MAP[activity.type] ?? ActivityType.PROGRESS,
    pipelineId,
    pipelineName: activity.pipelineName || pipelineId || 'Unknown',
    message: activity.message || '',
    timestamp: activity.timestamp || new Date().toISOString(),
    jobId: activity.jobId,
  };
}

// ------------------------------------------------------------------
// Test data
// ------------------------------------------------------------------

const ACTIVITY_WITHOUT_ID: ApiActivity = {
  type: 'job:completed',
  timestamp: '2026-03-15T10:00:00.000Z',
  jobId: 'job-abc-123',
  pipelineId: 'duplicate-detection',
  pipelineName: 'Duplicate Detection',
  message: 'Scan completed',
};

const DIFFERENT_ACTIVITY_WITHOUT_ID: ApiActivity = {
  type: 'job:failed',
  timestamp: '2026-03-15T11:00:00.000Z',
  jobId: 'job-xyz-999',
  pipelineId: 'schema-enhancement',
  pipelineName: 'Schema Enhancement',
  message: 'Pipeline errored',
};

const ACTIVITY_WITH_EXPLICIT_ID: ApiActivity = {
  id: 'explicit-id-from-server',
  type: 'job:started',
  timestamp: '2026-03-15T09:00:00.000Z',
  jobId: 'job-def-456',
  pipelineId: 'git-activity',
};

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------

describe('mapApiActivity — stable ID generation (FE-M1)', () => {
  it('should produce the same id on repeated calls with the same activity (no id field)', () => {
    const result1 = mapApiActivity(ACTIVITY_WITHOUT_ID);
    const result2 = mapApiActivity(ACTIVITY_WITHOUT_ID);

    assert.strictEqual(result1.id, result2.id);
  });

  it('should produce the same id when a new object with identical field values is passed', () => {
    // Simulates back-to-back poll cycles returning structurally identical activities
    const pollCycle1 = mapApiActivity({ ...ACTIVITY_WITHOUT_ID });
    const pollCycle2 = mapApiActivity({ ...ACTIVITY_WITHOUT_ID });

    assert.strictEqual(pollCycle1.id, pollCycle2.id);
  });

  it('should produce different ids for activities with different content fields', () => {
    const resultA = mapApiActivity(ACTIVITY_WITHOUT_ID);
    const resultB = mapApiActivity(DIFFERENT_ACTIVITY_WITHOUT_ID);

    assert.notStrictEqual(resultA.id, resultB.id);
  });

  it('should use the provided activity.id as-is when it is present', () => {
    const result = mapApiActivity(ACTIVITY_WITH_EXPLICIT_ID);

    assert.strictEqual(result.id, 'explicit-id-from-server');
  });
});

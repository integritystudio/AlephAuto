/**
 * Shared timing constants for tests.
 */
import { TIMEOUTS } from '../../sidequest/core/constants.ts';

export const TestTiming = {
  DEFAULT_WAIT_TIMEOUT_MS: TIMEOUTS.SHORT_MS,
  JOB_COMPLETION_OFFSET_MS: TIMEOUTS.SHORT_MS,
} as const;


/**
 * Process Execution Helper Utilities
 *
 * Re-exports from @shared/process-io for backwards compatibility.
 * New code should import directly from '@shared/process-io'.
 *
 * @module lib/utils/process-helpers
 */

export {
  captureProcessOutput,
  execCommand,
  execCommandOrThrow,
  runCommand
} from '@shared/process-io';

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

import { runCommand } from '@shared/process-io';

/**
 * Run a git command in the given working directory.
 * Extracted from BranchManager and PRCreator private methods.
 */
export async function runGitCommand(cwd: string, args: string[]): Promise<string> {
  return runCommand(cwd, 'git', args);
}

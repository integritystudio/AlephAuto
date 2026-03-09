/**
 * Shared execution helpers for pipeline runners.
 */

import { realpathSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Determine if the current module is being executed directly (not imported).
 * Works with both direct invocation and PM2's dynamic import.
 *
 * @param importMetaUrl - Pass `import.meta.url` from the calling module.
 * @returns `true` when the module is the process entry point.
 */
export function isDirectExecution(importMetaUrl: string): boolean {
  const currentModulePath = fileURLToPath(importMetaUrl);
  const entryPath = process.argv[1] || process.env.pm_exec_path;
  if (!entryPath) return false;
  try {
    return realpathSync(path.resolve(entryPath)) === realpathSync(currentModulePath);
  } catch {
    return false;
  }
}

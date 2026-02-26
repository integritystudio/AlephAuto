/**
 * File System Helper Utilities
 *
 * Provides utilities for common file system operations.
 *
 * @module lib/utils/fs-helpers
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * Ensures a directory exists, creating it and parents if needed
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Ensures the parent directory of a file path exists
 */
export async function ensureParentDir(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Writes a file, ensuring parent directory exists
 */
export async function writeFileWithDir(filePath: string, content: string | Buffer, options: { encoding?: BufferEncoding } = {}): Promise<void> {
  await ensureParentDir(filePath);
  await fs.writeFile(filePath, content, { encoding: options.encoding ?? 'utf-8' });
}

/**
 * Reads a file if it exists, returns null if not found
 */
export async function readFileIfExists(filePath: string, encoding: BufferEncoding = 'utf-8'): Promise<string | null> {
  try {
    return await fs.readFile(filePath, encoding);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Checks if a path exists
 */
export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Saves generated report content to a file, ensuring parent directory exists.
 * Returns the output path for method chaining.
 */
export async function saveGeneratedReport(filePath: string, content: string): Promise<string> {
  await writeFileWithDir(filePath, content);
  return filePath;
}

/**
 * Joins lines with newlines (consolidates repeated pattern)
 */
export function joinLines(lines: string[]): string {
  return lines.join('\n');
}

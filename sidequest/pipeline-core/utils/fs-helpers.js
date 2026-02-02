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
 *
 * @param {string} dirPath - Directory path to ensure exists
 * @returns {Promise<void>}
 *
 * @example
 * await ensureDir('/path/to/output/dir');
 */
export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Ensures the parent directory of a file path exists
 *
 * @param {string} filePath - File path whose parent directory should exist
 * @returns {Promise<void>}
 *
 * @example
 * await ensureParentDir('/path/to/output/file.json');
 * await fs.writeFile('/path/to/output/file.json', data);
 */
export async function ensureParentDir(filePath) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Writes a file, ensuring parent directory exists
 *
 * @param {string} filePath - File path to write
 * @param {string|Buffer} content - Content to write
 * @param {object} [options] - Write options
 * @param {BufferEncoding} [options.encoding='utf-8'] - File encoding
 * @returns {Promise<void>}
 *
 * @example
 * await writeFileWithDir('/path/to/output/file.json', JSON.stringify(data));
 */
export async function writeFileWithDir(filePath, content, options = {}) {
  await ensureParentDir(filePath);
  await fs.writeFile(filePath, content, { encoding: options.encoding ?? 'utf-8' });
}

/**
 * Reads a file if it exists, returns null if not found
 *
 * @param {string} filePath - File path to read
 * @param {BufferEncoding} [encoding='utf-8'] - File encoding
 * @returns {Promise<string|null>}
 *
 * @example
 * const content = await readFileIfExists('/path/to/config.json');
 * if (content) {
 *   const config = JSON.parse(content);
 * }
 */
export async function readFileIfExists(filePath, encoding = 'utf-8') {
  try {
    return await fs.readFile(filePath, encoding);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Checks if a path exists
 *
 * @param {string} filePath - Path to check
 * @returns {Promise<boolean>}
 */
export async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Joins lines with newlines (consolidates repeated pattern)
 *
 * @param {string[]} lines - Lines to join
 * @returns {string}
 */
export function joinLines(lines) {
  return lines.join('\n');
}

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
 * Ensure dir.
 *
 * @param {string} dirPath - The dirPath
 *
 * @returns {Promise<void>} The Promise<void>
 * @async
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Ensure parent dir.
 *
 * @param {string} filePath - The filePath
 *
 * @returns {Promise<void>} The Promise<void>
 * @async
 */
export async function ensureParentDir(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Write file with dir.
 *
 * @param {string} filePath - The filePath
 * @param {string | Buffer} content - The content
 * @param {{ encoding?: BufferEncoding }} [options={}] - Options dictionary
 *
 * @returns {Promise<void>} The Promise<void>
 * @async
 */
export async function writeFileWithDir(filePath: string, content: string | Buffer, options: { encoding?: BufferEncoding } = {}): Promise<void> {
  await ensureParentDir(filePath);
  await fs.writeFile(filePath, content, { encoding: options.encoding ?? 'utf-8' });
}

/**
 * Read the file if exists.
 *
 * @param {string} filePath - The filePath
 * @param {BufferEncoding} [encoding='utf-8'] - Character encoding
 *
 * @returns {Promise<string | null>} The file if exists
 * @async
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
 * Path exists.
 *
 * @param {string} filePath - The filePath
 *
 * @returns {Promise<boolean>} True if successful, False otherwise
 * @async
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
 * Save generated report.
 *
 * @param {string} filePath - The filePath
 * @param {string} content - The content
 *
 * @returns {Promise<string>} The resulting string
 * @async
 */
export async function saveGeneratedReport(filePath: string, content: string): Promise<string> {
  await writeFileWithDir(filePath, content);
  return filePath;
}

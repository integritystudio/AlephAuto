import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get path to the test repository fixture
 * @returns {string} Absolute path to test-repo fixture
 */
export function getTestRepoPath() {
  return path.join(__dirname, 'test-repo');
}

/**
 * Create a temporary test repository
 * Creates a temporary directory with basic git structure
 *
 * @param {string} name - Name for the temp directory (default: 'test-repo')
 * @returns {Promise<{path: string, cleanup: Function}>}
 */
export async function createTempRepository(name = 'test-repo') {
  // Create temp directory
  const tmpDir = await fs.mkdtemp(
    path.join(os.tmpdir(), `alephauto-test-${name}-`)
  );

  // Create basic .git directory to make it look like a git repo
  const gitDir = path.join(tmpDir, '.git');
  await fs.mkdir(gitDir, { recursive: true });

  // Create a basic file structure
  await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
  await fs.writeFile(path.join(tmpDir, 'README.md'), '# Test Repository\n');
  await fs.writeFile(
    path.join(tmpDir, 'src', 'test.js'),
    'export function test() { return true; }\n'
  );

  // Return path and cleanup function
  return {
    path: tmpDir,
    cleanup: async () => {
      try {
        await fs.rm(tmpDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
        console.warn(`Failed to cleanup temp directory ${tmpDir}:`, error.message);
      }
    }
  };
}

/**
 * Create multiple temporary repositories
 * @param {number} count - Number of repositories to create
 * @returns {Promise<Array<{path: string, cleanup: Function}>>}
 */
export async function createMultipleTempRepositories(count = 2) {
  const repos = [];
  for (let i = 0; i < count; i++) {
    repos.push(await createTempRepository(`test-repo-${i + 1}`));
  }
  return repos;
}

/**
 * Cleanup all temporary repositories
 * @param {Array<{cleanup: Function}>} repos - Array of repository objects
 */
export async function cleanupRepositories(repos) {
  await Promise.all(repos.map(repo => repo.cleanup()));
}

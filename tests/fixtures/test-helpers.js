import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Track repositories for cleanup (global to handle cross-test cleanup)
if (!global._testRepositories) {
  global._testRepositories = new Set();
}

// Track active operations on directories to prevent cleanup race conditions
// Maps directory path -> { count: number, waiters: Function[] }
if (!global._activeOperations) {
  global._activeOperations = new Map();
}

/**
 * Register an active operation on a directory
 * Call this before starting async work that uses the directory
 * @param {string} dirPath - The directory path
 * @returns {Function} Release function to call when operation completes
 */
export function trackOperation(dirPath) {
  const normalizedPath = path.resolve(dirPath);

  if (!global._activeOperations.has(normalizedPath)) {
    global._activeOperations.set(normalizedPath, { count: 0, waiters: [] });
  }

  const tracker = global._activeOperations.get(normalizedPath);
  tracker.count++;

  let released = false;
  return function release() {
    if (released) return; // Prevent double-release
    released = true;

    tracker.count--;
    if (tracker.count === 0) {
      // Notify all waiters that directory is free
      tracker.waiters.forEach(resolve => resolve());
      tracker.waiters = [];
    }
  };
}

/**
 * Wait for all active operations on a directory to complete
 * @param {string} dirPath - The directory path
 * @param {number} timeout - Maximum wait time in ms (default: 30000)
 * @returns {Promise<void>}
 */
export async function waitForOperations(dirPath, timeout = 30000) {
  const normalizedPath = path.resolve(dirPath);
  const tracker = global._activeOperations.get(normalizedPath);

  if (!tracker || tracker.count === 0) {
    return; // No active operations
  }

  // Wait for operations to complete
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(
        `Timeout waiting for ${tracker.count} operation(s) to complete on ${dirPath}`
      ));
    }, timeout);

    tracker.waiters.push(() => {
      clearTimeout(timeoutId);
      resolve();
    });
  });
}

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
 * @param {Object} options - Options
 * @param {number} options.cleanupTimeout - Max time to wait for operations before cleanup (default: 30000)
 * @returns {Promise<{path: string, cleanup: Function, trackOperation: Function}>}
 */
export async function createTempRepository(name = 'test-repo', options = {}) {
  const { cleanupTimeout = 30000 } = options;

  // Create temp directory
  const tmpDir = await fs.mkdtemp(
    path.join(os.tmpdir(), `aleph-test-${name}-`)
  );

  // Track for cleanup
  global._testRepositories.add(tmpDir);

  // Verify directory exists before proceeding
  await fs.access(tmpDir);

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

  // Return path, cleanup function, and operation tracking
  return {
    path: tmpDir,

    /**
     * Track an operation on this repository
     * Returns a release function to call when operation completes
     * @returns {Function} Release function
     */
    trackOperation: () => trackOperation(tmpDir),

    /**
     * Cleanup the repository
     * Waits for any tracked operations to complete before deleting
     * @param {Object} cleanupOptions - Cleanup options
     * @param {boolean} cleanupOptions.force - Force cleanup without waiting (default: false)
     */
    cleanup: async (cleanupOptions = {}) => {
      const { force = false } = cleanupOptions;

      try {
        // Wait for active operations unless forced
        if (!force) {
          try {
            await waitForOperations(tmpDir, cleanupTimeout);
          } catch (waitError) {
            console.warn(
              `Cleanup proceeding despite pending operations on ${tmpDir}: ${waitError.message}`
            );
          }
        }

        await fs.rm(tmpDir, { recursive: true, force: true });
        global._testRepositories.delete(tmpDir);

        // Clean up operation tracker
        global._activeOperations.delete(path.resolve(tmpDir));
      } catch (error) {
        // Ignore ENOENT (already cleaned up)
        if (error.code !== 'ENOENT') {
          console.warn(`Failed to cleanup temp directory ${tmpDir}:`, error.message);
        }
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
 * Can be called with an array of repository objects OR without arguments
 * to cleanup all globally tracked repositories
 *
 * Waits for active operations on each directory before cleaning up
 *
 * @param {Array<{cleanup: Function}>} [repos] - Array of repository objects (optional)
 * @param {Object} [options] - Cleanup options
 * @param {boolean} [options.force] - Force cleanup without waiting for operations (default: false)
 * @param {number} [options.timeout] - Max time to wait for operations per repo (default: 30000)
 */
export async function cleanupRepositories(repos, options = {}) {
  const { force = false, timeout = 30000 } = options;

  // If repos array is provided, use it (backward compatible)
  if (repos && Array.isArray(repos)) {
    await Promise.all(repos.map(repo => repo.cleanup({ force })));
    return;
  }

  // Otherwise, cleanup all globally tracked repositories
  if (!global._testRepositories) {
    return;
  }

  const results = await Promise.allSettled(
    Array.from(global._testRepositories).map(async (repo) => {
      try {
        // Wait for active operations unless forced
        if (!force) {
          try {
            await waitForOperations(repo, timeout);
          } catch (waitError) {
            console.warn(
              `Cleanup proceeding despite pending operations on ${repo}: ${waitError.message}`
            );
          }
        }

        await fs.rm(repo, { recursive: true, force: true });

        // Clean up operation tracker
        global._activeOperations.delete(path.resolve(repo));
      } catch (error) {
        // Ignore ENOENT (already cleaned up)
        if (error.code !== 'ENOENT') {
          console.warn(`Failed to cleanup ${repo}:`, error.message);
          throw error;
        }
      }
    })
  );

  global._testRepositories.clear();

  const failures = results.filter(r => r.status === 'rejected');
  if (failures.length > 0) {
    console.warn(`Failed to cleanup ${failures.length} repositories`);
  }
}

/**
 * Wait for a worker's job queue to drain completely
 * Polls the worker until no jobs are queued or active
 *
 * @param {Object} worker - The SidequestServer worker instance
 * @param {Object} options - Options
 * @param {number} options.timeout - Maximum wait time in ms (default: 30000)
 * @param {number} options.pollInterval - Polling interval in ms (default: 100)
 * @returns {Promise<void>}
 * @throws {Error} If timeout is exceeded
 */
export async function waitForQueueDrain(worker, options = {}) {
  const { timeout = 30000, pollInterval = 100 } = options;
  const startTime = Date.now();

  while (true) {
    const stats = worker.getStats();

    // Queue is drained when no jobs are queued or active
    if (stats.queued === 0 && stats.active === 0) {
      return;
    }

    // Check timeout
    if (Date.now() - startTime > timeout) {
      throw new Error(
        `Queue drain timeout after ${timeout}ms. ` +
        `Remaining: ${stats.queued} queued, ${stats.active} active`
      );
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
}

/**
 * Wait for a specific job to complete
 * Polls the worker until the job status is 'completed' or 'failed'
 *
 * @param {Object} worker - The SidequestServer worker instance
 * @param {string} jobId - The job ID to wait for
 * @param {Object} options - Options
 * @param {number} options.timeout - Maximum wait time in ms (default: 30000)
 * @param {number} options.pollInterval - Polling interval in ms (default: 100)
 * @returns {Promise<Object>} The completed job object
 * @throws {Error} If timeout is exceeded or job fails
 */
export async function waitForJobCompletion(worker, jobId, options = {}) {
  const { timeout = 30000, pollInterval = 100 } = options;
  const startTime = Date.now();

  while (true) {
    const job = worker.getJob(jobId);

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    // Job is complete
    if (job.status === 'completed') {
      return job;
    }

    // Job failed
    if (job.status === 'failed') {
      throw new Error(`Job ${jobId} failed: ${job.error?.message || 'Unknown error'}`);
    }

    // Check timeout
    if (Date.now() - startTime > timeout) {
      throw new Error(
        `Job completion timeout after ${timeout}ms. ` +
        `Job status: ${job.status}`
      );
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
}

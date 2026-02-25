import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface OperationTracker {
  count: number;
  waiters: Array<() => void>;
}

declare global {
  var _testRepositories: Set<string> | undefined;
  var _activeOperations: Map<string, OperationTracker> | undefined;
}

// Track repositories for cleanup (global to handle cross-test cleanup)
if (!global._testRepositories) {
  global._testRepositories = new Set();
}

// Track active operations on directories to prevent cleanup race conditions
if (!global._activeOperations) {
  global._activeOperations = new Map();
}

export function trackOperation(dirPath: string): () => void {
  const normalizedPath = path.resolve(dirPath);

  if (!global._activeOperations!.has(normalizedPath)) {
    global._activeOperations!.set(normalizedPath, { count: 0, waiters: [] });
  }

  const tracker = global._activeOperations!.get(normalizedPath)!;
  tracker.count++;

  let released = false;
  return function release() {
    if (released) return;
    released = true;

    tracker.count--;
    if (tracker.count === 0) {
      tracker.waiters.forEach(resolve => resolve());
      tracker.waiters = [];
    }
  };
}

export async function waitForOperations(dirPath: string, timeout = 30000): Promise<void> {
  const normalizedPath = path.resolve(dirPath);
  const tracker = global._activeOperations!.get(normalizedPath);

  if (!tracker || tracker.count === 0) {
    return;
  }

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

export function getTestRepoPath(): string {
  return path.join(__dirname, 'test-repo');
}

interface TempRepositoryOptions {
  cleanupTimeout?: number;
}

interface CleanupOptions {
  force?: boolean;
}

export interface TempRepository {
  path: string;
  trackOperation: () => () => void;
  cleanup: (options?: CleanupOptions) => Promise<void>;
}

export async function createTempRepository(name = 'test-repo', options: TempRepositoryOptions = {}): Promise<TempRepository> {
  const { cleanupTimeout = 30000 } = options;

  const tmpDir = await fs.mkdtemp(
    path.join(os.tmpdir(), `aleph-test-${name}-`)
  );

  global._testRepositories!.add(tmpDir);

  await fs.access(tmpDir);

  const gitDir = path.join(tmpDir, '.git');
  await fs.mkdir(gitDir, { recursive: true });

  await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
  await fs.writeFile(path.join(tmpDir, 'README.md'), '# Test Repository\n');
  await fs.writeFile(
    path.join(tmpDir, 'src', 'test.js'),
    'export function test() { return true; }\n'
  );

  return {
    path: tmpDir,

    trackOperation: () => trackOperation(tmpDir),

    cleanup: async (cleanupOptions: CleanupOptions = {}) => {
      const { force = false } = cleanupOptions;

      try {
        if (!force) {
          try {
            await waitForOperations(tmpDir, cleanupTimeout);
          } catch (waitError) {
            console.warn(
              `Cleanup proceeding despite pending operations on ${tmpDir}: ${(waitError as Error).message}`
            );
          }
        }

        await fs.rm(tmpDir, { recursive: true, force: true });
        global._testRepositories!.delete(tmpDir);
        global._activeOperations!.delete(path.resolve(tmpDir));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.warn(`Failed to cleanup temp directory ${tmpDir}:`, (error as Error).message);
        }
      }
    }
  };
}

export async function createMultipleTempRepositories(count = 2): Promise<TempRepository[]> {
  const repos: TempRepository[] = [];
  for (let i = 0; i < count; i++) {
    repos.push(await createTempRepository(`test-repo-${i + 1}`));
  }
  return repos;
}

interface CleanupRepositoriesOptions {
  force?: boolean;
  timeout?: number;
}

export async function cleanupRepositories(
  repos?: TempRepository[],
  options: CleanupRepositoriesOptions = {}
): Promise<void> {
  const { force = false, timeout = 30000 } = options;

  if (repos && Array.isArray(repos)) {
    await Promise.all(repos.map(repo => repo.cleanup({ force })));
    return;
  }

  if (!global._testRepositories) {
    return;
  }

  const results = await Promise.allSettled(
    Array.from(global._testRepositories).map(async (repo) => {
      try {
        if (!force) {
          try {
            await waitForOperations(repo, timeout);
          } catch (waitError) {
            console.warn(
              `Cleanup proceeding despite pending operations on ${repo}: ${(waitError as Error).message}`
            );
          }
        }

        await fs.rm(repo, { recursive: true, force: true });
        global._activeOperations!.delete(path.resolve(repo));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.warn(`Failed to cleanup ${repo}:`, (error as Error).message);
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

interface WorkerStats {
  queued: number;
  active: number;
}

interface WorkerLike {
  getStats: () => WorkerStats;
}

interface WaitForQueueDrainOptions {
  timeout?: number;
  pollInterval?: number;
}

/**
 * Poll until the worker's queued and active counts are both zero.
 *
 * WARNING: Only safe when `maxRetries === 0` or all retries have fully settled.
 * When retries are enabled, `activeJobs` decrements before the retry re-queue
 * `setTimeout` fires, causing a false-drain window. Use event-based waiting
 * (e.g., `worker.once('retry:created', ...)`) for retry scenarios instead.
 */
export async function waitForQueueDrain(worker: WorkerLike, options: WaitForQueueDrainOptions = {}): Promise<void> {
  const { timeout = 30000, pollInterval = 100 } = options;
  const startTime = Date.now();

  while (true) {
    const stats = worker.getStats();

    if (stats.queued === 0 && stats.active === 0) {
      return;
    }

    if (Date.now() - startTime > timeout) {
      throw new Error(
        `Queue drain timeout after ${timeout}ms. ` +
        `Remaining: ${stats.queued} queued, ${stats.active} active`
      );
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
}

interface JobLike {
  status: string;
  error?: { message?: string } | null;
}

interface WorkerWithJobs {
  getJob: (jobId: string) => JobLike | undefined;
}

interface WaitForJobCompletionOptions {
  timeout?: number;
  pollInterval?: number;
}

export async function waitForJobCompletion(
  worker: WorkerWithJobs,
  jobId: string,
  options: WaitForJobCompletionOptions = {}
): Promise<JobLike> {
  const { timeout = 30000, pollInterval = 100 } = options;
  const startTime = Date.now();

  while (true) {
    const job = worker.getJob(jobId);

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    if (job.status === 'completed') {
      return job;
    }

    if (job.status === 'failed') {
      throw new Error(`Job ${jobId} failed: ${job.error?.message ?? 'Unknown error'}`);
    }

    if (Date.now() - startTime > timeout) {
      throw new Error(
        `Job completion timeout after ${timeout}ms. ` +
        `Job status: ${job.status}`
      );
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
}

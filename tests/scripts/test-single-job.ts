import { RepomixWorker } from '../../sidequest/workers/repomix-worker.ts';
import path from 'path';
import os from 'os';
import { BYTES_PER_KB } from '../../sidequest/core/constants.ts';
import { waitForJobCompletion } from '../utils/test-utilities.ts';

/**
 * Test script to run a single repomix job
 * Usage: node --strip-types test-single-job.ts [directory-path]
 */

function resolveRelativePath(absolutePath: string, codeBase: string): string {
  if (absolutePath.startsWith(codeBase)) {
    return path.relative(codeBase, absolutePath);
  }
  return path.basename(absolutePath);
}

function setupWorkerEventListeners(worker: RepomixWorker) {
  worker.on('job:created', (job) => {
    console.log(`✓ Job created: ${job.id}`);
  });

  worker.on('job:started', (job) => {
    console.log(`▶ Job started: ${job.id}`);
    console.log(`  Source: ${job.data.sourceDir}`);
    console.log(`  Relative path: ${job.data.relativePath}`);
  });

  worker.on('job:completed', (job) => {
    const duration = job.completedAt - job.startedAt;
    console.log(`\n✓ Job completed successfully!`);
    console.log(`  Duration: ${Math.round(duration / 1000)}s`);
    console.log(`  Output file: ${job.result.outputFile}`);
    console.log(`  File size: ${(job.result.size / BYTES_PER_KB).toFixed(2)} KB`);
    console.log(`  Log file: ./logs/${job.id}.json`);
    process.exit(0);
  });

  worker.on('job:failed', (job) => {
    console.error(`\n✗ Job failed!`);
    console.error(`  Error: ${job.error}`);
    console.error(`  Log file: ./logs/${job.id}.error.json`);
    process.exit(1);
  });
}

async function testSingleJob() {
  console.log('=== Single Job Test ===\n');

  const targetDir = process.argv[2] || process.cwd();
  const absolutePath = path.resolve(targetDir);
  const codeBase = path.join(os.homedir(), 'code');
  const relativePath = resolveRelativePath(absolutePath, codeBase);

  console.log(`Target directory: ${absolutePath}`);
  console.log(`Relative path: ${relativePath}`);
  console.log(`Output will be saved to: ./sidequest/output/condense/${relativePath}/repomix-output.txt\n`);

  const worker = new RepomixWorker({
    maxConcurrent: 1,
    outputBaseDir: './sidequest/output/condense',
    codeBaseDir: codeBase,
    logDir: './logs',
    sentryDsn: process.env.SENTRY_DSN,
  });

  setupWorkerEventListeners(worker);

  console.log('Creating job...\n');
  const job = worker.createRepomixJob(absolutePath, relativePath);

  await waitForJobCompletion(worker, job.id);
}

// Run the test
testSingleJob().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

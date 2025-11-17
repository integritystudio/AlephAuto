import { RepomixWorker } from '../sidequest/repomix-worker.js';
import { DirectoryScanner } from '../sidequest/directory-scanner.js';
import path from 'path';
import os from 'os';

/**
 * Test script to run a single repomix job
 * Usage: node test-single-job.js [directory-path]
 */

async function testSingleJob() {
  console.log('=== Single Job Test ===\n');

  // Get target directory from command line or use current directory
  const targetDir = process.argv[2] || process.cwd();
  const absolutePath = path.resolve(targetDir);

  console.log(`Target directory: ${absolutePath}`);

  // Calculate relative path from ~/code
  const codeBase = path.join(os.homedir(), 'code');
  let relativePath;

  if (absolutePath.startsWith(codeBase)) {
    relativePath = path.relative(codeBase, absolutePath);
  } else {
    // If not under ~/code, use the directory name
    relativePath = path.basename(absolutePath);
  }

  console.log(`Relative path: ${relativePath}`);
  console.log(`Output will be saved to: ./condense/${relativePath}/repomix-output.txt\n`);

  // Create worker
  const worker = new RepomixWorker({
    maxConcurrent: 1,
    outputBaseDir: './condense',
    codeBaseDir: codeBase,
    logDir: './logs',
    sentryDsn: process.env.SENTRY_DSN,
  });

  // Setup event listeners
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
    console.log(`  File size: ${(job.result.size / 1024).toFixed(2)} KB`);
    console.log(`  Log file: ./logs/${job.id}.json`);
    process.exit(0);
  });

  worker.on('job:failed', (job) => {
    console.error(`\n✗ Job failed!`);
    console.error(`  Error: ${job.error}`);
    console.error(`  Log file: ./logs/${job.id}.error.json`);
    process.exit(1);
  });

  // Create and run the job
  console.log('Creating job...\n');
  const job = worker.createRepomixJob(absolutePath, relativePath);

  // Wait for job to complete
  await new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      if (job.status === 'completed' || job.status === 'failed') {
        clearInterval(checkInterval);
        resolve();
      }
    }, 100);
  });
}

// Run the test
testSingleJob().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

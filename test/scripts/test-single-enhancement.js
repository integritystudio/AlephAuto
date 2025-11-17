import { SchemaEnhancementWorker } from '../sidequest/doc-enhancement/schema-enhancement-worker.js';
import { READMEScanner } from '../sidequest/doc-enhancement/readme-scanner.js';
import path from 'path';

/**
 * Test script to enhance a single README file
 * Usage: node test-single-enhancement.js [readme-path] [--dry-run]
 */

async function testSingleEnhancement() {
  console.log('=== Single README Enhancement Test ===\n');

  // Parse arguments
  const args = process.argv.slice(2);
  let readmePath = args[0] || 'README.md';
  const dryRun = args.includes('--dry-run');

  // Resolve to absolute path
  readmePath = path.resolve(readmePath);
  console.log(`Target README: ${readmePath}`);
  console.log(`Dry run: ${dryRun}\n`);

  // Create worker
  const worker = new SchemaEnhancementWorker({
    maxConcurrent: 1,
    outputBaseDir: './document-enhancement-impact-measurement',
    logDir: './logs',
    sentryDsn: process.env.SENTRY_DSN,
    dryRun,
  });

  // Create scanner for context gathering
  const scanner = new READMEScanner({
    baseDir: path.dirname(readmePath),
  });

  // Setup event listeners
  worker.on('job:created', (job) => {
    console.log(`✓ Job created: ${job.id}`);
  });

  worker.on('job:started', (job) => {
    console.log(`▶ Job started: ${job.id}`);
    console.log(`  README: ${job.data.readmePath}`);
  });

  worker.on('job:completed', (job) => {
    const duration = job.completedAt - job.startedAt;
    console.log(`\n✓ Job completed successfully!`);
    console.log(`  Duration: ${Math.round(duration / 1000)}s`);

    if (job.result.status === 'enhanced') {
      console.log(`  Schema type: ${job.result.schemaType}`);
      console.log(`  Impact score: ${job.result.impact.impactScore}/100 (${job.result.impact.rating})`);
      console.log(`  SEO improvements: ${job.result.impact.seoImprovements.length}`);
      console.log(`  Rich results: ${job.result.impact.richResultsEligibility.length}`);
      console.log(`\n  Schema generated:`);
      console.log(JSON.stringify(job.result.schema, null, 2));
      console.log(`\n  Impact report saved to: document-enhancement-impact-measurement/impact-reports/`);
      console.log(`  Enhanced copy saved to: document-enhancement-impact-measurement/enhanced-readmes/`);
    } else {
      console.log(`  Status: ${job.result.status}`);
      console.log(`  Reason: ${job.result.reason}`);
    }

    console.log(`\n  Log file: ./logs/${job.id}.json`);
    process.exit(0);
  });

  worker.on('job:failed', (job) => {
    console.error(`\n✗ Job failed!`);
    console.error(`  Error: ${job.error}`);
    console.error(`  Log file: ./logs/${job.id}.error.json`);
    process.exit(1);
  });

  try {
    // Check if README exists
    const fs = await import('fs/promises');
    await fs.access(readmePath);

    // Gather context
    console.log('📂 Gathering context...');
    const dirPath = path.dirname(readmePath);
    const context = await scanner.gatherContext(dirPath);
    console.log(`  Languages: ${Array.from(context.languages).join(', ') || 'None detected'}`);
    console.log(`  Git remote: ${context.gitRemote || 'None'}`);
    console.log(`  Project type: ${context.projectType}\n`);

    // Create README object
    const readme = {
      fullPath: readmePath,
      relativePath: path.basename(readmePath),
      fileName: path.basename(readmePath),
      dirPath,
      depth: 0,
    };

    // Create and run the job
    console.log('🚀 Creating enhancement job...\n');
    const job = worker.createEnhancementJob(readme, context);

    // Wait for job to complete
    await new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (job.status === 'completed' || job.status === 'failed') {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Run the test
testSingleEnhancement().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

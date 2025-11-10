import cron from 'node-cron';
import { SchemaEnhancementWorker } from './doc-enhancement/schema-enhancement-worker.js';
import { READMEScanner } from './doc-enhancement/readme-scanner.js';
import path from 'path';
import os from 'os';

/**
 * Documentation Enhancement Pipeline
 * Automatically adds Schema.org markup to README files
 */
class DocEnhancementPipeline {
  constructor(options = {}) {
    this.targetDir = options.targetDir || path.join(os.homedir(), 'code', 'Inventory');
    this.dryRun = options.dryRun || false;

    this.worker = new SchemaEnhancementWorker({
      maxConcurrent: 2, // Process 2 READMEs at a time
      outputBaseDir: '../document-enhancement-impact-measurement',
      logDir: '../logs',
      sentryDsn: process.env.SENTRY_DSN,
      dryRun: this.dryRun,
    });

    this.scanner = new READMEScanner({
      baseDir: this.targetDir,
      excludeDirs: [
        'node_modules',
        '.git',
        'dist',
        'build',
        'coverage',
        '.next',
        '__pycache__',
        '.venv',
        'venv',
        '_site',
        '.cache',
        'target',
        'jobs',
      ],
    });

    this.setupEventListeners();
  }

  /**
   * Setup event listeners for job events
   */
  setupEventListeners() {
    this.worker.on('job:created', (job) => {
      console.log(`✓ Job created: ${job.id}`);
    });

    this.worker.on('job:started', (job) => {
      console.log(`▶ Job started: ${job.id}`);
      console.log(`  README: ${job.data.relativePath}`);
    });

    this.worker.on('job:completed', (job) => {
      const duration = job.completedAt - job.startedAt;
      console.log(`✓ Job completed: ${job.id} (${duration}ms)`);
      if (job.result.status === 'enhanced') {
        console.log(`  Schema: ${job.result.schemaType}`);
        console.log(`  Impact: ${job.result.impact.impactScore}/100 (${job.result.impact.rating})`);
      } else {
        console.log(`  Status: ${job.result.status} - ${job.result.reason}`);
      }
    });

    this.worker.on('job:failed', (job) => {
      console.error(`✗ Job failed: ${job.id}`);
      console.error(`  Error: ${job.error}`);
    });
  }

  /**
   * Run enhancement on all README files
   */
  async runEnhancementPipeline() {
    console.log('\n=== Documentation Enhancement Pipeline ===');
    console.log(`Target directory: ${this.targetDir}`);
    console.log(`Dry run: ${this.dryRun}`);
    console.log('==========================================\n');

    const startTime = Date.now();

    try {
      // Scan for README files
      console.log('📂 Scanning for README files...');
      const readmes = await this.scanner.scanREADMEs();
      console.log(`Found ${readmes.length} README files\n`);

      if (readmes.length === 0) {
        console.log('No README files found to process');
        return;
      }

      // Get initial stats
      const scanStats = await this.scanner.getStats(readmes);
      console.log('📊 Scan Statistics:');
      console.log(`  Total: ${scanStats.total}`);
      console.log(`  With schema: ${scanStats.withSchema}`);
      console.log(`  Without schema: ${scanStats.withoutSchema}\n`);

      // Create jobs for each README
      console.log('🚀 Creating enhancement jobs...\n');
      for (const readme of readmes) {
        // Skip if already has schema (unless explicitly overriding)
        const hasSchema = await this.scanner.hasSchemaMarkup(readme.fullPath);
        if (hasSchema && !process.env.FORCE_ENHANCEMENT) {
          console.log(`⏭️  Skipping ${readme.relativePath} (already has schema)`);
          continue;
        }

        // Gather context for this README
        const context = await this.scanner.gatherContext(readme.dirPath);

        // Create enhancement job
        this.worker.createEnhancementJob(readme, context);
      }

      console.log('');

      // Wait for all jobs to complete
      await this.waitForCompletion();

      const duration = Date.now() - startTime;
      const stats = this.worker.getEnhancementStats();

      console.log('\n=== Enhancement Complete ===');
      console.log(`Duration: ${Math.round(duration / 1000)}s`);
      console.log(`Enhanced: ${stats.enhanced}`);
      console.log(`Skipped: ${stats.skipped}`);
      console.log(`Failed: ${stats.failed}`);
      console.log(`Success rate: ${stats.successRate}%`);

      // Generate summary report
      const summary = await this.worker.generateSummaryReport();
      console.log(`\n📄 Summary saved to: ${summary.outputDirectory}`);

    } catch (error) {
      console.error('Error during enhancement pipeline:', error);
      throw error;
    }
  }

  /**
   * Wait for all jobs to complete
   */
  async waitForCompletion() {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const stats = this.worker.getStats();
        if (stats.active === 0 && stats.queued === 0) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 1000);
    });
  }

  /**
   * Setup cron job
   */
  setupCronJob(schedule = '0 3 * * *') {
    // Default: Run at 3 AM every day
    console.log(`Setting up cron job with schedule: ${schedule}`);

    cron.schedule(schedule, async () => {
      console.log(`\nCron job triggered at ${new Date().toISOString()}`);
      try {
        await this.runEnhancementPipeline();
      } catch (error) {
        console.error('Cron job failed:', error);
      }
    });

    console.log('Cron job scheduled successfully');
  }

  /**
   * Start the pipeline
   */
  async start() {
    console.log('=== Documentation Enhancement Pipeline Server ===');
    console.log(`Target directory: ${this.targetDir}`);
    console.log(`Output directory: ${this.worker.outputBaseDir}`);
    console.log(`Log directory: ${this.worker.logDir}`);
    console.log(`Dry run: ${this.dryRun}`);

    // Setup cron job
    // Schedule: '0 3 * * *' = 3 AM daily
    // For testing: '*/10 * * * *' = every 10 minutes
    const schedule = process.env.DOC_CRON_SCHEDULE || '0 3 * * *';
    this.setupCronJob(schedule);

    // Run immediately on startup if requested
    if (process.env.RUN_ON_STARTUP === 'true') {
      console.log('\nRunning immediately (RUN_ON_STARTUP=true)...');
      await this.runEnhancementPipeline();
    }

    console.log('\nServer running. Press Ctrl+C to exit.');
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--target-dir' && args[i + 1]) {
    options.targetDir = args[i + 1];
    i++;
  } else if (args[i] === '--dry-run') {
    options.dryRun = true;
  }
}

// Start the pipeline
const pipeline = new DocEnhancementPipeline(options);
pipeline.start().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

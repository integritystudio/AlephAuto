import cron from 'node-cron';
import { RepomixWorker } from './repomix-worker.js';
import { DirectoryScanner } from './directory-scanner.js';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';

/**
 * Main application entry point
 */
class RepomixCronApp {
  constructor() {
    this.worker = new RepomixWorker({
      maxConcurrent: 3, // Process 3 repos at a time
      outputBaseDir: '../condense',
      codeBaseDir: path.join(os.homedir(), 'code'),
      logDir: '../logs',
      sentryDsn: process.env.SENTRY_DSN,
    });

    this.scanner = new DirectoryScanner({
      baseDir: path.join(os.homedir(), 'code'),
      outputDir: '../directory-scan-reports',
      excludeDirs: [
        'node_modules',
        '.git',
        'dist',
        'build',
        'coverage',
        '.next',
        '.nuxt',
        'vendor',
        '__pycache__',
        '.venv',
        'venv',
        'target',
        '.idea',
        '.vscode',
        'jobs',
        '.DS_Store', // OS
        'Thumbs.db',
        '.vscode', //IDE
        '.idea/'
        '*.swp'
        '*.swo'
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
      console.log(`▶ Job started: ${job.id} - ${job.data.relativePath}`);
    });

    this.worker.on('job:completed', (job) => {
      const duration = job.completedAt - job.startedAt;
      console.log(`✓ Job completed: ${job.id} - ${job.data.relativePath} (${duration}ms)`);
    });

    this.worker.on('job:failed', (job) => {
      console.error(`✗ Job failed: ${job.id} - ${job.data.relativePath}`);
      console.error(`  Error: ${job.error}`);
    });
  }

  /**
   * Run repomix on all directories
   */
  async runRepomixOnAllDirectories() {
    console.log('\n=== Starting Repomix Run ===');
    console.log(`Scanning directories in: ${this.scanner.baseDir}`);

    const startTime = Date.now();

    try {
      // Scan all directories
      const directories = await this.scanner.scanDirectories();
      console.log(`Found ${directories.length} directories to process`);

      // Save scan results
      console.log('\n📊 Saving scan results...');
      const scanResults = await this.scanner.generateAndSaveScanResults(directories);
      console.log(`  Scan report: ${scanResults.reportPath}`);
      console.log(`  Directory tree: ${scanResults.treePath}`);
      console.log(`  Summary: ${scanResults.summaryPath}`);
      console.log(`  Max depth: ${scanResults.summary.maxDepth}`);
      console.log(`  Top directories: ${scanResults.summary.stats.topDirectoryNames.slice(0, 3).map(d => d.name).join(', ')}\n`);

      // Create jobs for each directory
      let jobCount = 0;
      for (const dir of directories) {
        this.worker.createRepomixJob(dir.fullPath, dir.relativePath);
        jobCount++;
      }

      console.log(`Created ${jobCount} jobs`);

      // Wait for all jobs to complete
      await this.waitForCompletion();

      const duration = Date.now() - startTime;
      const stats = this.worker.getStats();

      console.log('\n=== Run Complete ===');
      console.log(`Duration: ${Math.round(duration / 1000)}s`);
      console.log(`Total jobs: ${stats.total}`);
      console.log(`Completed: ${stats.completed}`);
      console.log(`Failed: ${stats.failed}`);

      // Save run summary
      await this.saveRunSummary(stats, duration);

    } catch (error) {
      console.error('Error during repomix run:', error);
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
   * Save run summary to logs
   */
  async saveRunSummary(stats, duration) {
    const summary = {
      timestamp: new Date().toISOString(),
      duration,
      stats,
    };

    const summaryPath = path.join('../logs', `run-summary-${Date.now()}.json`);
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
  }

  /**
   * Setup cron job
   */
  setupCronJob(schedule = '0 2 * * *') {
    // Default: Run at 2 AM every day
    console.log(`Setting up cron job with schedule: ${schedule}`);

    cron.schedule(schedule, async () => {
      console.log(`\nCron job triggered at ${new Date().toISOString()}`);
      try {
        await this.runRepomixOnAllDirectories();
      } catch (error) {
        console.error('Cron job failed:', error);
      }
    });

    console.log('Cron job scheduled successfully');
  }

  /**
   * Start the application
   */
  async start() {
    console.log('=== Repomix Cron Sidequest Server ===');
    console.log(`Code directory: ${this.scanner.baseDir}`);
    console.log(`Output directory: ${this.worker.outputBaseDir}`);
    console.log(`Log directory: ${this.worker.logDir}`);

    // Setup cron job
    // Schedule: '0 2 * * *' = 2 AM daily
    // For testing: '*/5 * * * *' = every 5 minutes
    const schedule = process.env.CRON_SCHEDULE || '0 2 * * *';
    this.setupCronJob(schedule);

    // Run immediately on startup if requested
    if (process.env.RUN_ON_STARTUP === 'true') {
      console.log('\nRunning immediately (RUN_ON_STARTUP=true)...');
      await this.runRepomixOnAllDirectories();
    }

    console.log('\nServer running. Press Ctrl+C to exit.');
  }
}

// Start the application
const app = new RepomixCronApp();
app.start().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

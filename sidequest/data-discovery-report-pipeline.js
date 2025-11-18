import cron from 'node-cron';
import { SchemaEnhancementWorker } from './doc-enhancement/schema-enhancement-worker.js';
import { READMEScanner } from './doc-enhancement/readme-scanner.js';
import { config } from './config.js';
import { createComponentLogger } from './logger.js';
import path from 'path';
import os from 'os';

const logger = createComponentLogger('DocEnhancementPipeline');

/**
 * Documentation Enhancement Pipeline
 * Automatically adds Schema.org markup to README files
 */
class DocEnhancementPipeline {
  constructor(options = {}) {
    this.targetDir = options.targetDir || path.join(os.homedir(), 'code', 'Inventory');
    this.dryRun = options.dryRun || false;

    this.worker = new SchemaEnhancementWorker({
      maxConcurrent: config.maxConcurrent,
      outputBaseDir: config.outputBaseDir,
      logDir: config.logDir,
      sentryDsn: config.sentryDsn,
      dryRun: this.dryRun,
    });

    this.scanner = new READMEScanner({
      baseDir: this.targetDir,
      excludeDirs: config.excludeDirs,
    });

    this.setupEventListeners();
  }

  /**
   * Setup event listeners for job events
   */
  setupEventListeners() {
    this.worker.on('job:created', (job) => {
      logger.info({ jobId: job.id }, 'Job created');
    });

    this.worker.on('job:started', (job) => {
      logger.info({
        jobId: job.id,
        relativePath: job.data.relativePath
      }, 'Job started');
    });

    this.worker.on('job:completed', (job) => {
      const duration = job.completedAt - job.startedAt;
      if (job.result.status === 'enhanced') {
        logger.info({
          jobId: job.id,
          duration,
          schemaType: job.result.schemaType,
          impactScore: job.result.impact.impactScore,
          rating: job.result.impact.rating
        }, 'Job completed - enhanced');
      } else {
        logger.info({
          jobId: job.id,
          duration,
          status: job.result.status,
          reason: job.result.reason
        }, 'Job completed - skipped');
      }
    });

    this.worker.on('job:failed', (job) => {
      logger.error({
        jobId: job.id,
        error: job.error
      }, 'Job failed');
    });
  }

  /**
   * Run enhancement on all README files
   */
  async runEnhancementPipeline() {
    // Check if documentation enhancement should be skipped
    if (config.skipDocEnhancement) {
      logger.info('Documentation enhancement is disabled (SKIP_DOC_ENHANCEMENT=true)');
      console.log('\n⏭️  README enhancement pipeline skipped (SKIP_DOC_ENHANCEMENT=true)');
      console.log('To enable: unset SKIP_DOC_ENHANCEMENT or set to false\n');
      return;
    }

    logger.info({
      targetDir: this.targetDir,
      dryRun: this.dryRun
    }, 'Starting documentation enhancement pipeline');

    const startTime = Date.now();

    try {
      // Scan for README files
      logger.info('Scanning for README files');
      const readmes = await this.scanner.scanREADMEs();
      logger.info({ count: readmes.length }, 'README files found');

      if (readmes.length === 0) {
        logger.warn('No README files found to process');
        return;
      }

      // Get initial stats
      const scanStats = await this.scanner.getStats(readmes);
      logger.info({
        total: scanStats.total,
        withSchema: scanStats.withSchema,
        withoutSchema: scanStats.withoutSchema
      }, 'Scan statistics');

      // Create jobs for each README
      logger.info('Creating enhancement jobs');
      for (const readme of readmes) {
        // Skip if already has schema (unless explicitly overriding)
        const hasSchema = await this.scanner.hasSchemaMarkup(readme.fullPath);
        if (hasSchema && !config.forceEnhancement) {
          logger.debug({
            relativePath: readme.relativePath
          }, 'Skipping - already has schema');
          continue;
        }

        // Gather context for this README
        const context = await this.scanner.gatherContext(readme.dirPath);

        // Create enhancement job
        this.worker.createEnhancementJob(readme, context);
      }

      // Wait for all jobs to complete
      await this.waitForCompletion();

      const duration = Date.now() - startTime;
      const stats = this.worker.getEnhancementStats();

      logger.info({
        duration: Math.round(duration / 1000),
        enhanced: stats.enhanced,
        skipped: stats.skipped,
        failed: stats.failed,
        successRate: stats.successRate
      }, 'Enhancement pipeline complete');

      // Generate summary report
      const summary = await this.worker.generateSummaryReport();
      logger.info({
        outputDirectory: summary.outputDirectory
      }, 'Summary report saved');

    } catch (error) {
      logger.error({ err: error }, 'Error during enhancement pipeline');
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
    logger.info({ schedule }, 'Setting up cron job');

    cron.schedule(schedule, async () => {
      logger.info({ timestamp: new Date().toISOString() }, 'Cron job triggered');
      try {
        await this.runEnhancementPipeline();
      } catch (error) {
        logger.error({ err: error }, 'Cron job failed');
      }
    });

    logger.info('Cron job scheduled successfully');
  }

  /**
   * Start the pipeline
   */
  async start() {
    logger.info({
      targetDir: this.targetDir,
      outputBaseDir: this.worker.outputBaseDir,
      logDir: this.worker.logDir,
      dryRun: this.dryRun
    }, 'Documentation Enhancement Pipeline Server starting');

    // Setup cron job
    // Schedule: '0 3 * * *' = 3 AM daily
    // For testing: '*/10 * * * *' = every 10 minutes
    this.setupCronJob(config.docSchedule);

    // Run immediately on startup if requested
    if (config.runOnStartup) {
      logger.info('Running immediately (RUN_ON_STARTUP=true)');
      await this.runEnhancementPipeline();
    }

    logger.info('Server running. Press Ctrl+C to exit.');
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
  logger.error({ err: error }, 'Fatal error');
  process.exit(1);
});

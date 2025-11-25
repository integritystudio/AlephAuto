#!/usr/bin/env node
import { SchemaEnhancementWorker } from '../workers/schema-enhancement-worker.js';
import { config } from '../core/config.js';
import { createComponentLogger } from '../utils/logger.js';
import cron from 'node-cron';
import fs from 'fs/promises';
import path from 'path';

const logger = createComponentLogger('SchemaEnhancementPipeline');

/**
 * Schema Enhancement Pipeline
 * Automatically enhances README files with Schema.org structured data
 */
class SchemaEnhancementPipeline {
  constructor(options = {}) {
    this.worker = new SchemaEnhancementWorker({
      maxConcurrent: config.maxConcurrent || 2,
      logDir: config.logDir,
      sentryDsn: config.sentryDsn,
      gitWorkflowEnabled: options.gitWorkflowEnabled ?? config.enableGitWorkflow,
      gitBranchPrefix: options.gitBranchPrefix || 'docs',
      gitBaseBranch: options.gitBaseBranch || config.gitBaseBranch,
      gitDryRun: options.gitDryRun ?? config.gitDryRun,
      outputBaseDir: options.outputBaseDir || './document-enhancement-impact-measurement',
      dryRun: options.dryRun || false,
      ...options
    });

    this.excludeDirs = new Set([
      'node_modules',
      '.git',
      'dist',
      'build',
      'coverage',
      'venv',
      '__pycache__'
    ]);

    this.baseDir = options.baseDir || config.codeBaseDir || process.env.HOME;
    this.setupEventListeners();
  }

  /**
   * Setup event listeners for job events
   */
  setupEventListeners() {
    this.worker.on('job:created', (job) => {
      logger.info({
        jobId: job.id,
        readmePath: job.data.relativePath
      }, 'Schema enhancement job created');
    });

    this.worker.on('job:started', (job) => {
      logger.info({
        jobId: job.id,
        readmePath: job.data.relativePath
      }, 'Schema enhancement job started');
    });

    this.worker.on('job:completed', (job) => {
      const duration = job.completedAt - job.startedAt;
      logger.info({
        jobId: job.id,
        duration,
        status: job.result.status,
        schemaType: job.result.schemaType,
        impactScore: job.result.impact?.impactScore
      }, 'Schema enhancement job completed');
    });

    this.worker.on('job:failed', (job) => {
      logger.error({
        jobId: job.id,
        readmePath: job.data.relativePath,
        error: job.error
      }, 'Schema enhancement job failed');
    });
  }

  /**
   * Recursively scan directory for README files
   */
  async scanForReadmes(dir, baseDir = dir, results = []) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip excluded directories
          if (this.excludeDirs.has(entry.name)) {
            continue;
          }

          // Recursively scan subdirectories
          await this.scanForReadmes(fullPath, baseDir, results);
        } else if (entry.name === 'README.md') {
          const relativePath = path.relative(baseDir, fullPath);
          results.push({
            fullPath,
            relativePath,
            name: entry.name,
            dirPath: path.dirname(fullPath)
          });
        }
      }
    } catch (error) {
      logger.error({ dir, error: error.message }, 'Error scanning directory');
    }

    return results;
  }

  /**
   * Scan directory for README files
   */
  async scanDirectory(directory) {
    logger.info({ directory }, 'Scanning for README files');

    const readmeFiles = await this.scanForReadmes(directory);

    logger.info({
      readmeFiles: readmeFiles.length
    }, 'Directory scan complete');

    return readmeFiles;
  }

  /**
   * Create enhancement jobs for README files
   */
  async createEnhancementJobs(readmeFiles) {
    const context = {
      totalReadmes: readmeFiles.length,
      baseDir: this.baseDir
    };

    const jobs = [];

    for (const readme of readmeFiles) {
      // Add context about the repository
      const repoContext = {
        ...context,
        hasPackageJson: false, // Would need to check
        hasPyproject: false,   // Would need to check
        gitRemote: null        // Would need to extract
      };

      const job = await this.worker.createEnhancementJob(readme, repoContext);
      jobs.push(job);
    }

    logger.info({
      jobsCreated: jobs.length
    }, 'Enhancement jobs created');

    return jobs;
  }

  /**
   * Run enhancement on directory
   */
  async runEnhancement(directory = this.baseDir) {
    logger.info({ directory }, 'Starting schema enhancement pipeline');

    const startTime = Date.now();

    try {
      // Scan for README files
      const readmeFiles = await this.scanDirectory(directory);

      if (readmeFiles.length === 0) {
        logger.warn({ directory }, 'No README files found');
        return {
          status: 'completed',
          readmesFound: 0,
          enhanced: 0
        };
      }

      // Create enhancement jobs
      await this.createEnhancementJobs(readmeFiles);

      // Wait for completion
      await this.waitForCompletion();

      const duration = Date.now() - startTime;
      const stats = this.worker.getEnhancementStats();
      const jobStats = this.worker.getStats();

      // Generate summary report
      await this.worker.generateSummaryReport();

      logger.info({
        duration,
        stats,
        jobStats
      }, 'Schema enhancement pipeline completed');

      return {
        status: 'completed',
        duration,
        ...stats,
        jobs: jobStats
      };
    } catch (error) {
      logger.error({ error }, 'Schema enhancement pipeline failed');
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
   * Schedule enhancement runs
   */
  scheduleEnhancements(cronSchedule = '0 3 * * 0') {
    logger.info({ cronSchedule }, 'Scheduling schema enhancement runs');

    if (!cron.validate(cronSchedule)) {
      throw new Error(`Invalid cron schedule: ${cronSchedule}`);
    }

    const task = cron.schedule(cronSchedule, async () => {
      logger.info('Cron triggered - starting schema enhancement');
      try {
        await this.runEnhancement();
      } catch (error) {
        logger.error({ error }, 'Scheduled enhancement failed');
      }
    });

    logger.info('Schema enhancement scheduled');
    return task;
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const runOnStartup = process.env.RUN_ON_STARTUP === 'true';
  const cronSchedule = process.env.SCHEMA_ENHANCEMENT_CRON_SCHEDULE || '0 3 * * 0'; // Sunday 3 AM

  // Parse command line arguments
  const args = process.argv.slice(2);
  const options = {
    dryRun: false,
    gitWorkflowEnabled: config.enableGitWorkflow
  };

  let directory = config.codeBaseDir || process.env.HOME;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') {
      options.dryRun = true;
    } else if (args[i] === '--dir' && args[i + 1]) {
      directory = args[i + 1];
      i++;
    } else if (args[i] === '--git-workflow') {
      options.gitWorkflowEnabled = true;
    } else if (args[i] === '--no-git-workflow') {
      options.gitWorkflowEnabled = false;
    }
  }

  const pipeline = new SchemaEnhancementPipeline(options);

  if (runOnStartup) {
    logger.info({ directory, options }, 'Running schema enhancement immediately');

    pipeline.runEnhancement(directory)
      .then((result) => {
        logger.info({ result }, 'Enhancement completed successfully');
        process.exit(0);
      })
      .catch((error) => {
        logger.error({ error }, 'Enhancement failed');
        process.exit(1);
      });
  } else {
    logger.info({ cronSchedule }, 'Starting schema enhancement pipeline in scheduled mode');
    pipeline.scheduleEnhancements(cronSchedule);
    logger.info('Schema enhancement pipeline running. Press Ctrl+C to stop.');
  }
}

export { SchemaEnhancementPipeline };

#!/usr/bin/env -S node --strip-types
import { SchemaEnhancementWorker } from '../workers/schema-enhancement-worker.ts';
import { config } from '../core/config.ts';
import { TIMEOUTS } from '../core/constants.ts';
import { createComponentLogger, logError, logStart } from '../utils/logger.ts';
import cron from 'node-cron';
import fs from 'fs/promises';
import path from 'path';

const logger = createComponentLogger('SchemaEnhancementPipeline');

interface ReadmeFile {
  fullPath: string;
  relativePath: string;
  name: string;
  dirPath: string;
}

interface RepoContext {
  totalReadmes: number;
  baseDir: string;
  hasPackageJson: boolean;
  hasPyproject: boolean;
  gitRemote: string | null;
}

interface EnhancementResult {
  status: string;
  readmesFound?: number;
  enhanced?: number;
  duration?: number;
  jobs?: Record<string, unknown>;
  [key: string]: unknown;
}

interface SchemaEnhancementOptions {
  gitWorkflowEnabled?: boolean;
  gitBranchPrefix?: string;
  gitBaseBranch?: string;
  gitDryRun?: boolean;
  outputBaseDir?: string;
  dryRun?: boolean;
  baseDir?: string;
  [key: string]: unknown;
}

// Cast config to access dynamic properties
const cfg = config as Record<string, unknown>;

//TODO: automatically updates README and CLAUDE files from directory commit data
/**
 * Schema Enhancement Pipeline
 * Automatically enhances README files with Schema.org structured data
 */
class SchemaEnhancementPipeline {
  private worker: SchemaEnhancementWorker;
  private excludeDirs: Set<string>;
  private baseDir: string;
  private options: SchemaEnhancementOptions;

  constructor(options: SchemaEnhancementOptions = {}) {
    this.options = options;
    this.worker = new SchemaEnhancementWorker({
      maxConcurrent: (cfg.maxConcurrent as number) || 2,
      logDir: cfg.logDir as string | undefined,
      sentryDsn: cfg.sentryDsn as string | undefined,
      gitWorkflowEnabled: (options.gitWorkflowEnabled ?? cfg.enableGitWorkflow) as boolean | undefined,
      gitBranchPrefix: options.gitBranchPrefix || 'docs',
      gitBaseBranch: (options.gitBaseBranch || cfg.gitBaseBranch) as string | undefined,
      gitDryRun: (options.gitDryRun ?? cfg.gitDryRun) as boolean | undefined,
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

    this.baseDir = options.baseDir || (cfg.codeBaseDir as string) || process.env.HOME!;
    this.setupEventListeners();
  }

  /**
   * Setup event listeners for job events
   */
  private setupEventListeners(): void {
    this.worker.on('job:created', (job: Record<string, unknown>) => {
      const data = job.data as Record<string, unknown>;
      logger.info({
        jobId: job.id,
        readmePath: data.relativePath
      }, 'Schema enhancement job created');
    });

    this.worker.on('job:started', (job: Record<string, unknown>) => {
      const data = job.data as Record<string, unknown>;
      logger.info({
        jobId: job.id,
        readmePath: data.relativePath
      }, 'Schema enhancement job started');
    });

    this.worker.on('job:completed', (job: Record<string, unknown>) => {
      const result = job.result as Record<string, unknown>;
      const impact = result.impact as Record<string, unknown> | undefined;
      const duration = new Date(job.completedAt as string).getTime() - new Date(job.startedAt as string).getTime();
      logger.info({
        jobId: job.id,
        duration,
        status: result.status,
        schemaType: result.schemaType,
        impactScore: impact?.impactScore
      }, 'Schema enhancement job completed');
    });

    this.worker.on('job:failed', (job: Record<string, unknown>) => {
      const data = job.data as Record<string, unknown>;
      logError(logger, job.error as Error, 'Schema enhancement job failed', {
        jobId: job.id,
        readmePath: data.relativePath
      });
    });
  }

  /**
   * Recursively scan directory for README files
   */
  async scanForReadmes(dir: string, baseDir: string = dir, results: ReadmeFile[] = []): Promise<ReadmeFile[]> {
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
      logger.error({ dir, error: (error as Error).message }, 'Error scanning directory');
    }

    return results;
  }

  /**
   * Scan directory for README files
   */
  async scanDirectory(directory: string): Promise<ReadmeFile[]> {
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
  async createEnhancementJobs(readmeFiles: ReadmeFile[]): Promise<unknown[]> {
    const context = {
      totalReadmes: readmeFiles.length,
      baseDir: this.baseDir
    };

    const jobs: unknown[] = [];

    for (const readme of readmeFiles) {
      // Add context about the repository
      const repoContext: RepoContext = {
        ...context,
        hasPackageJson: false, // Would need to check
        hasPyproject: false,   // Would need to check
        gitRemote: null        // Would need to extract
      };

      const job = await (this.worker as unknown as { createEnhancementJob(readme: ReadmeFile, ctx: RepoContext): Promise<unknown> }).createEnhancementJob(readme, repoContext);
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
  async runEnhancement(directory: string = this.baseDir): Promise<EnhancementResult> {
    logStart(logger, 'schema enhancement pipeline', { directory });

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
      const stats = (this.worker as unknown as { getEnhancementStats(): Record<string, unknown> }).getEnhancementStats();
      const jobStats = (this.worker as unknown as { getStats(): Record<string, unknown> }).getStats();

      // Generate summary report
      await (this.worker as unknown as { generateSummaryReport(): Promise<void> }).generateSummaryReport();

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
      logError(logger, error as Error, 'Schema enhancement pipeline failed');
      throw error;
    }
  }

  /**
   * Wait for all jobs to complete
   */
  async waitForCompletion(): Promise<void> {
    return new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        const stats = (this.worker as unknown as { getStats(): { active: number; queued: number } }).getStats();
        if (stats.active === 0 && stats.queued === 0) {
          clearInterval(checkInterval);
          resolve();
        }
      }, TIMEOUTS.POLL_INTERVAL_MS);
    });
  }

  /**
   * Schedule enhancement runs
   */
  scheduleEnhancements(cronSchedule: string = '0 3 * * 0'): cron.ScheduledTask {
    logger.info({ cronSchedule }, 'Scheduling schema enhancement runs');

    if (!cron.validate(cronSchedule)) {
      throw new Error(`Invalid cron schedule: ${cronSchedule}`);
    }

    const task = cron.schedule(cronSchedule, async () => {
      logger.info('Cron triggered - starting schema enhancement');
      try {
        await this.runEnhancement();
      } catch (error) {
        logError(logger, error as Error, 'Scheduled enhancement failed');
      }
    });

    logger.info('Schema enhancement scheduled');
    return task;
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const cronSchedule = process.env.SCHEMA_ENHANCEMENT_CRON_SCHEDULE || '0 3 * * 0'; // Sunday 3 AM

  // Parse command line arguments
  const args = process.argv.slice(2);
  const options: SchemaEnhancementOptions = {
    dryRun: false,
    gitWorkflowEnabled: cfg.enableGitWorkflow as boolean | undefined
  };

  let directory: string = (cfg.codeBaseDir as string) || process.env.HOME!;
  let runNow = process.env.RUN_ON_STARTUP === 'true';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--run-now' || args[i] === '--run') {
      runNow = true;
    } else if (args[i] === '--dry-run') {
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

  if (runNow) {
    logger.info({ directory, options }, 'Running schema enhancement immediately');

    pipeline.runEnhancement(directory)
      .then((result) => {
        logger.info({ result }, 'Enhancement completed successfully');
        process.exit(0);
      })
      .catch((error: unknown) => {
        logError(logger, error as Error, 'Enhancement failed');
        process.exit(1);
      });
  } else {
    logStart(logger, 'schema enhancement pipeline in scheduled mode', { cronSchedule });
    pipeline.scheduleEnhancements(cronSchedule);
    logger.info('Schema enhancement pipeline running. Press Ctrl+C to stop.');
  }
}

export { SchemaEnhancementPipeline };

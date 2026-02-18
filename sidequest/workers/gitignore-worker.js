// @ts-nocheck
import { SidequestServer } from '../core/server.ts';
import { GitignoreRepomixUpdater } from '../utils/gitignore-repomix-updater.js';
import { generateReport } from '../utils/report-generator.js';
import { createComponentLogger } from '../utils/logger.ts';
import * as Sentry from '@sentry/node';
import path from 'path';
import os from 'os';

const logger = createComponentLogger('GitignoreWorker');

/**
 * GitignoreWorker - Executes gitignore update jobs
 *
 * Integrates GitignoreRepomixUpdater into the AlephAuto framework,
 * providing job queue management, event tracking, and Sentry error monitoring.
 */
export class GitignoreWorker extends SidequestServer {
  constructor(options = {}) {
    super({
      ...options,
      jobType: 'gitignore-manager',
    });
    this.baseDir = options.baseDir || path.join(os.homedir(), 'code');
    this.excludeDirs = options.excludeDirs || [
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
    ];
    this.maxDepth = options.maxDepth || 10;
    this.gitignoreEntry = options.gitignoreEntry || 'repomix-output.xml';
  }

  /**
   * Run gitignore update job
   */
  async runJobHandler(job) {
    const startTime = Date.now();
    const {
      baseDir = this.baseDir,
      excludeDirs = this.excludeDirs,
      maxDepth = this.maxDepth,
      gitignoreEntry = this.gitignoreEntry,
      dryRun = false,
      repositories = null, // Optional: specific repositories to process
    } = job.data;

    logger.info({
      jobId: job.id,
      baseDir,
      dryRun,
      specificRepos: repositories ? repositories.length : 'all'
    }, 'Running gitignore update job');

    try {
      // Create updater instance
      const updater = new GitignoreRepomixUpdater({
        baseDir,
        excludeDirs,
        maxDepth,
        dryRun,
      });

      // Override gitignore entry if specified
      if (gitignoreEntry) {
        updater.gitignoreEntry = gitignoreEntry;
      }

      let results;
      if (repositories && repositories.length > 0) {
        // Process specific repositories
        results = await this.#processSpecificRepositories(updater, repositories);
      } else {
        // Process all repositories
        results = await updater.processRepositories();
      }

      logger.info({
        jobId: job.id,
        totalRepositories: results.totalRepositories,
        added: results.summary.added,
        skipped: results.summary.skipped,
        wouldAdd: results.summary.would_add,
        errors: results.summary.error
      }, 'Gitignore update job completed');

      const result = {
        ...results,
        timestamp: new Date().toISOString(),
        dryRun,
        gitignoreEntry,
      };

      // Generate HTML/JSON reports
      const endTime = Date.now();
      const reportPaths = await generateReport({
        jobId: job.id,
        jobType: 'gitignore-update',
        status: 'completed',
        result,
        startTime,
        endTime,
        parameters: job.data,
        metadata: {
          totalRepositories: results.totalRepositories,
          dryRun
        }
      });

      result.reportPaths = reportPaths;
      logger.info({ reportPaths }, 'Gitignore update reports generated');

      return result;
    } catch (error) {
      logger.error({
        jobId: job.id,
        error: error.message,
        stack: error.stack
      }, 'Gitignore update job failed');

      Sentry.captureException(error, {
        tags: {
          component: 'gitignore-worker',
          job_id: job.id,
        },
        extra: {
          baseDir,
          dryRun,
          gitignoreEntry,
        },
      });

      throw error;
    }
  }

  /**
   * Process specific repositories
   * @private
   */
  async #processSpecificRepositories(updater, repositories) {
    const results = [];

    logger.info({
      count: repositories.length
    }, 'Processing specific repositories');

    for (const repoPath of repositories) {
      logger.info({ repository: repoPath }, 'Processing repository');
      const result = await updater.addToGitignore(repoPath);
      results.push({
        repository: repoPath,
        ...result,
      });
      logger.info({
        repository: repoPath,
        action: result.action,
        reason: result.reason
      }, 'Repository processed');
    }

    return {
      totalRepositories: repositories.length,
      results,
      summary: updater.generateSummary(results),
    };
  }

  /**
   * Create a job to update all repositories
   */
  createUpdateAllJob(options = {}) {
    const jobId = `gitignore-update-all-${Date.now()}`;

    return this.createJob(jobId, {
      type: 'gitignore-update',
      baseDir: options.baseDir || this.baseDir,
      dryRun: options.dryRun ?? false,
      gitignoreEntry: options.gitignoreEntry || this.gitignoreEntry,
      excludeDirs: options.excludeDirs || this.excludeDirs,
      maxDepth: options.maxDepth || this.maxDepth,
    });
  }

  /**
   * Create a job to update specific repositories
   */
  createUpdateRepositoriesJob(repositories, options = {}) {
    const jobId = `gitignore-update-repos-${Date.now()}`;

    return this.createJob(jobId, {
      type: 'gitignore-update',
      repositories,
      dryRun: options.dryRun ?? false,
      gitignoreEntry: options.gitignoreEntry || this.gitignoreEntry,
    });
  }

  /**
   * Create a dry-run job to preview changes
   */
  createDryRunJob(options = {}) {
    const jobId = `gitignore-dryrun-${Date.now()}`;

    return this.createJob(jobId, {
      type: 'gitignore-update',
      baseDir: options.baseDir || this.baseDir,
      dryRun: true,
      gitignoreEntry: options.gitignoreEntry || this.gitignoreEntry,
      excludeDirs: options.excludeDirs || this.excludeDirs,
      maxDepth: options.maxDepth || this.maxDepth,
    });
  }
}

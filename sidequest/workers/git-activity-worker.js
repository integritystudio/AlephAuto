// @ts-nocheck
import { SidequestServer } from '../core/server.js';
import { generateReport } from '../utils/report-generator.js';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createComponentLogger } from '../utils/logger.js';

const logger = createComponentLogger('GitActivityWorker');

/**
 * GitActivityWorker - Executes git activity report jobs
 *
 * Integrates the Python git activity collector into the AlephAuto framework,
 * providing job queue management, event tracking, and Sentry error monitoring.
 */
export class GitActivityWorker extends SidequestServer {
  constructor(options = {}) {
    super(options);
    this.codeBaseDir = options.codeBaseDir || path.join(os.homedir(), 'code');
    this.pythonScript = options.pythonScript || path.join(
      path.dirname(new URL(import.meta.url).pathname),
      '..',
      'pipeline-runners',
      'collect_git_activity.py'
    );
    this.personalSiteDir = options.personalSiteDir || path.join(
      os.homedir(),
      'code',
      'PersonalSite'
    );
    this.outputDir = options.outputDir || '/tmp';
    this.logDir = options.logDir || path.join(
      path.dirname(new URL(import.meta.url).pathname),
      'logs'
    );
  }

  /**
   * Run git activity report job
   */
  async runJobHandler(job) {
    const startTime = Date.now();
    const {
      reportType,
      days,
      sinceDate,
      untilDate,
      outputFormat = 'json',
      generateVisualizations = true
    } = job.data;

    logger.info({
      jobId: job.id,
      reportType,
      days,
      sinceDate,
      untilDate
    }, 'Running git activity report');

    try {
      // Build command arguments
      const args = this.#buildPythonArgs({
        reportType,
        days,
        sinceDate,
        untilDate,
        outputFormat,
        generateVisualizations
      });

      // Execute Python script
      const { stdout, stderr, outputFiles } = await this.#runPythonScript(args);

      if (stderr) {
        logger.warn({ jobId: job.id, stderr }, 'Git activity warnings');
      }

      // Parse JSON output to get statistics
      const stats = this.#parseStats(stdout);

      // Verify output files exist
      const verifiedFiles = await this.#verifyOutputFiles(outputFiles);

      logger.info({
        jobId: job.id,
        stats,
        filesGenerated: verifiedFiles.length
      }, 'Git activity report completed');

      const result = {
        reportType,
        days: days || this.#calculateDays(sinceDate, untilDate),
        sinceDate,
        untilDate,
        stats,
        outputFiles: verifiedFiles,
        timestamp: new Date().toISOString(),
      };

      // Generate HTML/JSON reports
      const endTime = Date.now();
      const reportPaths = await generateReport({
        jobId: job.id,
        jobType: 'git-activity',
        status: 'completed',
        result,
        startTime,
        endTime,
        parameters: job.data,
        metadata: {
          reportType,
          filesGenerated: verifiedFiles.length
        }
      });

      result.reportPaths = reportPaths;
      logger.info({ reportPaths }, 'Git activity reports generated');

      return result;
    } catch (error) {
      logger.error({
        jobId: job.id,
        error: error.message,
        stack: error.stack
      }, 'Git activity report failed');
      throw error;
    }
  }

  /**
   * Build Python script arguments
   * @private
   */
  #buildPythonArgs({ reportType, days, sinceDate, untilDate, outputFormat, generateVisualizations }) {
    const args = [];

    // Add date range arguments
    if (sinceDate && untilDate) {
      args.push('--since', sinceDate);
      args.push('--until', untilDate);
    } else if (reportType === 'weekly' || days === 7) {
      args.push('--weekly');
    } else if (reportType === 'monthly' || days === 30) {
      args.push('--monthly');
    } else if (days) {
      args.push('--days', String(days));
    } else {
      // Default to weekly
      args.push('--weekly');
    }

    // Add output format
    if (outputFormat !== 'json') {
      args.push('--output-format', outputFormat);
    }

    // Add visualization flag
    if (!generateVisualizations) {
      args.push('--no-visualizations');
    }

    return args;
  }

  /**
   * Execute Python script
   * @private
   */
  #runPythonScript(args) {
    return new Promise((resolve, reject) => {
      logger.debug({ args }, 'Executing Python script');

      const proc = spawn('python3', [this.pythonScript, ...args], {
        cwd: path.dirname(this.pythonScript),
        timeout: 300000, // 5 minute timeout
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          // Extract output files from stdout if present
          const outputFiles = this.#extractOutputFiles(stdout);
          resolve({ stdout, stderr, outputFiles });
        } else {
          const error = new Error(`Python script exited with code ${code}`);
          error.code = code;
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
        }
      });

      proc.on('error', (error) => {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      });
    });
  }

  /**
   * Extract output file paths from script output
   * @private
   */
  #extractOutputFiles(stdout) {
    const files = [];

    // Look for JSON output file
    const jsonMatch = stdout.match(/(?:Saving|Saved) (?:to|data to):\s*(.+\.json)/i);
    if (jsonMatch) {
      files.push(jsonMatch[1].trim());
    }

    // Look for visualization files
    const svgMatches = stdout.matchAll(/(?:Generating|Generated|Saving).*?:\s*(.+\.svg)/gi);
    for (const match of svgMatches) {
      files.push(match[1].trim());
    }

    return files;
  }

  /**
   * Parse statistics from script output
   * @private
   */
  #parseStats(stdout) {
    const stats = {
      totalCommits: 0,
      totalRepositories: 0,
      linesAdded: 0,
      linesDeleted: 0,
    };

    // Try to parse from JSON output in stdout
    try {
      const jsonMatch = stdout.match(/\{[\s\S]*"total_commits"[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        stats.totalCommits = data.total_commits || 0;
        stats.totalRepositories = data.repositories?.length || 0;
        stats.linesAdded = data.total_additions || 0;
        stats.linesDeleted = data.total_deletions || 0;
      }
    } catch (error) {
      logger.warn({ error: error.message }, 'Could not parse stats from output');
    }

    return stats;
  }

  /**
   * Calculate days between two dates
   * @private
   */
  #calculateDays(sinceDate, untilDate) {
    if (!sinceDate || !untilDate) return null;

    const since = new Date(sinceDate);
    const until = new Date(untilDate);
    const diffTime = Math.abs(until - since);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
  }

  /**
   * Verify output files exist
   * @private
   */
  async #verifyOutputFiles(files) {
    const verified = [];

    for (const file of files) {
      try {
        await fs.access(file);
        const stats = await fs.stat(file);
        verified.push({
          path: file,
          size: stats.size,
          exists: true,
        });
      } catch (error) {
        logger.warn({ file, error: error.message }, 'Output file not found');
        verified.push({
          path: file,
          exists: false,
        });
      }
    }

    return verified;
  }

  /**
   * Create a weekly report job
   */
  createWeeklyReportJob() {
    const jobId = `git-activity-weekly-${Date.now()}`;

    return this.createJob(jobId, {
      reportType: 'weekly',
      days: 7,
      type: 'git-activity-report',
    });
  }

  /**
   * Create a monthly report job
   */
  createMonthlyReportJob() {
    const jobId = `git-activity-monthly-${Date.now()}`;

    return this.createJob(jobId, {
      reportType: 'monthly',
      days: 30,
      type: 'git-activity-report',
    });
  }

  /**
   * Create a custom date range report job
   */
  createCustomReportJob(sinceDate, untilDate) {
    const jobId = `git-activity-custom-${Date.now()}`;

    return this.createJob(jobId, {
      reportType: 'custom',
      sinceDate,
      untilDate,
      type: 'git-activity-report',
    });
  }

  /**
   * Create a report job with custom parameters
   */
  createReportJob(options = {}) {
    const jobId = options.jobId || `git-activity-${Date.now()}`;

    return this.createJob(jobId, {
      reportType: options.reportType || 'weekly',
      days: options.days,
      sinceDate: options.sinceDate,
      untilDate: options.untilDate,
      outputFormat: options.outputFormat || 'json',
      generateVisualizations: options.generateVisualizations !== false,
      type: 'git-activity-report',
    });
  }
}

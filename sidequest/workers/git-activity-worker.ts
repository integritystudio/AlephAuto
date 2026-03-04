import { SidequestServer, type Job, type SidequestServerOptions } from '../core/server.ts';
import { generateReport } from '../utils/report-generator.ts';
import { spawn } from 'child_process';
import { captureProcessOutput } from '@shared/process-io';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { createComponentLogger } from '../utils/logger.ts';
import { TIMEOUTS, TIME } from '../core/constants.ts';

const logger = createComponentLogger('GitActivityWorker');

interface GitActivityWorkerOptions extends SidequestServerOptions {
  codeBaseDir?: string;
  pythonScript?: string;
  personalSiteDir?: string;
  outputDir?: string;
}

interface PythonArgs {
  reportType?: string;
  days?: number;
  sinceDate?: string;
  untilDate?: string;
  outputFormat?: string;
  generateVisualizations?: boolean;
}

interface PythonScriptResult {
  stdout: string;
  stderr: string;
  outputFiles: string[];
}

interface GitActivityStats {
  totalCommits: number;
  totalRepositories: number;
  linesAdded: number;
  linesDeleted: number;
  filesChanged?: number;
}

interface VerifiedFile {
  path: string;
  size?: number;
  exists: boolean;
}

interface ReportJobOptions {
  jobId?: string;
  reportType?: string;
  days?: number;
  sinceDate?: string;
  untilDate?: string;
  outputFormat?: string;
  generateVisualizations?: boolean;
}

/**
 * GitActivityWorker - Executes git activity report jobs
 *
 * Integrates the Python git activity collector into the AlephAuto framework,
 * providing job queue management, event tracking, and Sentry error monitoring.
 */
export class GitActivityWorker extends SidequestServer {
  codeBaseDir: string;
  pythonScript: string;
  personalSiteDir: string;
  outputDir: string;

  /**
   * Initialize a git activity worker with project and output paths.
   *
   * @param options Optional worker configuration.
   */
  constructor(options: GitActivityWorkerOptions = {}) {
    super({
      ...options,
      jobType: 'git-activity',
    });
    this.codeBaseDir = options.codeBaseDir ?? path.join(os.homedir(), 'code');
    const moduleDir = path.dirname(fileURLToPath(import.meta.url));
    this.pythonScript = options.pythonScript ?? path.join(
      moduleDir,
      '..',
      'pipeline-runners',
      'collect_git_activity.py'
    );
    this.personalSiteDir = options.personalSiteDir ?? path.join(
      os.homedir(),
      'code',
      'PersonalSite'
    );
    this.outputDir = options.outputDir ?? path.join(os.homedir(), 'code', 'PersonalSite', '_reports');
  }

  /**
   * Run git activity report job
   */
  async runJobHandler(job: Job): Promise<unknown> {
    const startTime = Date.now();
    const {
      reportType,
      days,
      sinceDate,
      untilDate,
      outputFormat = 'both',
      generateVisualizations = true
    } = job.data as {
      reportType?: string;
      days?: number;
      sinceDate?: string;
      untilDate?: string;
      outputFormat?: string;
      generateVisualizations?: boolean;
    };

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

      const result: Record<string, unknown> = {
        reportType,
        days: days ?? this.#calculateDays(sinceDate, untilDate),
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
      const err = error as Error;
      logger.error({
        jobId: job.id,
        error: err.message,
        stack: err.stack
      }, 'Git activity report failed');
      throw error;
    }
  }

  /**
   * Build Python script arguments
   */
  #buildPythonArgs({ reportType, days, sinceDate, untilDate, outputFormat, generateVisualizations }: PythonArgs): string[] {
    const args: string[] = [];

    // Add date range arguments
    if (sinceDate) {
      args.push('--start-date', sinceDate);
      if (untilDate) {
        args.push('--end-date', untilDate);
      }
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

    // Always pass output format explicitly so Python defaults cannot drift.
    if (outputFormat) {
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
   */
  #runPythonScript(args: string[]): Promise<PythonScriptResult> {
    return new Promise((resolve, reject) => {
      logger.debug({ args }, 'Executing Python script');

      const proc = spawn('python3', [this.pythonScript, ...args], {
        cwd: path.dirname(this.pythonScript),
        timeout: TIMEOUTS.GIT_REPORT_MS,
      });

      const output = captureProcessOutput(proc);

      proc.on('close', (code) => {
        const stdout = output.getStdout();
        const stderr = output.getStderr();
        if (code === 0) {
          // Extract output files from stdout if present
          const outputFiles = this.#extractOutputFiles(stdout);
          resolve({ stdout, stderr, outputFiles });
        } else {
          const error = new Error(`Python script exited with code ${code}`) as Error & {
            code: number | null;
            stdout: string;
            stderr: string;
          };
          error.code = code;
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
        }
      });

      proc.on('error', (error) => {
        const augmented = error as Error & { stdout: string; stderr: string };
        augmented.stdout = output.getStdout();
        augmented.stderr = output.getStderr();
        reject(augmented);
      });
    });
  }

  /**
   * Extract output file paths from script output
   */
  #extractOutputFiles(stdout: string): string[] {
    const files = new Set<string>();
    const pendingSvgBasenames: string[] = [];

    // JSON output lines emitted by the Python script.
    const jsonPatterns = [
      /JSON data saved to:\s*(.+\.json)/gi,
      /(?:Saving|Saved)\s+(?:to|data to):\s*(.+\.json)/gi,
    ];
    for (const pattern of jsonPatterns) {
      for (const match of stdout.matchAll(pattern)) {
        files.add(match[1].trim());
      }
    }

    // Markdown output line emitted by the Python script.
    for (const match of stdout.matchAll(/Jekyll report saved to:\s*(.+\.md)/gi)) {
      files.add(match[1].trim());
    }

    // SVG output lines (supports "Created:", "Saving:", "Generated:", etc).
    for (const match of stdout.matchAll(/(?:Generating|Generated|Saving|Created).*?:\s*(.+\.svg)/gi)) {
      const rawPath = match[1].trim();
      if (path.isAbsolute(rawPath) || rawPath.includes('/')) {
        files.add(rawPath);
      } else {
        pendingSvgBasenames.push(rawPath);
      }
    }

    // When Python logs only SVG basenames, recover full paths from summary output.
    const visualizationDirMatch = stdout.match(/Visualizations saved to:\s*(.+)/i);
    if (visualizationDirMatch) {
      const visualizationDir = visualizationDirMatch[1].trim();
      for (const svgName of pendingSvgBasenames) {
        files.add(path.join(visualizationDir, svgName));
      }
    }

    return Array.from(files);
  }

  /**
   * Parse statistics from script output
   */
  #parseStats(stdout: string): GitActivityStats {
    const stats: GitActivityStats = {
      totalCommits: 0,
      totalRepositories: 0,
      linesAdded: 0,
      linesDeleted: 0,
    };

    // Try to parse from JSON output in stdout
    try {
      const jsonMatch = stdout.match(/\{[\s\S]*"total_commits"[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
        stats.totalCommits = (data.total_commits as number) ?? 0;
        stats.totalRepositories = (Array.isArray(data.repositories) ? data.repositories.length : 0);
        stats.linesAdded = (data.total_additions as number) ?? 0;
        stats.linesDeleted = (data.total_deletions as number) ?? 0;
        return stats;
      }
    } catch (error) {
      const err = error as Error;
      logger.debug({ error: err.message }, 'Could not parse JSON stats, trying text format');
    }

    // Fallback: parse from text summary output
    const commitsMatch = stdout.match(/Total commits:\s*(\d+)/i);
    if (commitsMatch) {
      stats.totalCommits = parseInt(commitsMatch[1], 10);
    }

    const additionsMatch = stdout.match(/Lines added:\s*(\d+)/i);
    if (additionsMatch) {
      stats.linesAdded = parseInt(additionsMatch[1], 10);
    }

    const deletionsMatch = stdout.match(/Lines deleted:\s*(\d+)/i);
    if (deletionsMatch) {
      stats.linesDeleted = parseInt(deletionsMatch[1], 10);
    }

    const reposMatch = stdout.match(/Active repositories:\s*(\d+)/i);
    if (reposMatch) {
      stats.totalRepositories = parseInt(reposMatch[1], 10);
    }

    const filesMatch = stdout.match(/File changes:\s*(\d+)/i);
    if (filesMatch) {
      stats.filesChanged = parseInt(filesMatch[1], 10);
    }

    return stats;
  }

  /**
   * Calculate days between two dates
   */
  #calculateDays(sinceDate?: string, untilDate?: string): number | null {
    if (!sinceDate || !untilDate) return null;

    const since = new Date(sinceDate);
    const until = new Date(untilDate);
    const diffTime = Math.abs(until.getTime() - since.getTime());
    const diffDays = Math.ceil(diffTime / TIME.DAY);

    return diffDays;
  }

  /**
   * Verify output files exist
   */
  async #verifyOutputFiles(files: string[]): Promise<VerifiedFile[]> {
    const verified: VerifiedFile[] = [];
    const scriptDir = path.dirname(this.pythonScript);

    for (const file of files) {
      const resolvedPath = path.isAbsolute(file)
        ? file
        : path.resolve(scriptDir, file);
      try {
        await fs.access(resolvedPath);
        const stats = await fs.stat(resolvedPath);
        verified.push({
          path: resolvedPath,
          size: stats.size,
          exists: true,
        });
      } catch (error) {
        const err = error as Error;
        logger.warn({ file: resolvedPath, error: err.message }, 'Output file not found');
        verified.push({
          path: resolvedPath,
          exists: false,
        });
      }
    }

    return verified;
  }

  /**
   * Create a weekly report job
   */
  createWeeklyReportJob(): Job {
    const jobId = `git-activity-weekly-${Date.now()}`;

    return this.createJob(jobId, {
      reportType: 'weekly',
      days: 7,
      outputFormat: 'both',
      type: 'git-activity-report',
    });
  }

  /**
   * Create a monthly report job
   */
  createMonthlyReportJob(): Job {
    const jobId = `git-activity-monthly-${Date.now()}`;

    return this.createJob(jobId, {
      reportType: 'monthly',
      days: 30,
      outputFormat: 'both',
      type: 'git-activity-report',
    });
  }

  /**
   * Create a custom date range report job
   */
  createCustomReportJob(sinceDate: string, untilDate: string): Job {
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
  createReportJob(options: ReportJobOptions = {}): Job {
    const jobId = options.jobId ?? `git-activity-${Date.now()}`;

    return this.createJob(jobId, {
      reportType: options.reportType ?? 'weekly',
      days: options.days,
      sinceDate: options.sinceDate,
      untilDate: options.untilDate,
      outputFormat: options.outputFormat ?? 'both',
      generateVisualizations: options.generateVisualizations !== false,
      type: 'git-activity-report',
    });
  }
}

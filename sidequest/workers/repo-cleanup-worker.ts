/**
 * RepoCleanupWorker - Executes repository cleanup jobs
 *
 * Integrates universal-repo-cleanup.sh into the AlephAuto framework,
 * providing job queue management, event tracking, and Sentry error monitoring.
 *
 * Cleanup targets:
 * - Python virtual environments (venv, .venv, etc.)
 * - Temporary/cache files (.DS_Store, __pycache__, .swp)
 * - Build artifacts (.jekyll-cache, dist, build, node_modules/.cache)
 * - Output files (repomix-output.xml, *.log)
 * - Redundant directories (drafts, temp, tmp, backup)
 */

import { SidequestServer, type Job, type SidequestServerOptions } from '../core/server.ts';
import { generateReport } from '../utils/report-generator.js';
import { createComponentLogger } from '../utils/logger.ts';
import * as Sentry from '@sentry/node';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);
const logger = createComponentLogger('RepoCleanupWorker');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Type definitions

interface RepoCleanupWorkerOptions extends SidequestServerOptions {
  baseDir?: string;
}

interface CleanupJobData {
  targetDir?: string;
  dryRun?: boolean;
  type?: string;
}

interface ScanCategories {
  venvs: string[];
  tempFiles: string[];
  outputFiles: string[];
  buildArtifacts: string[];
  redundantDirs: string[];
}

interface CleanupSummary {
  venvs: number;
  tempFiles: number;
  outputFiles: number;
  buildArtifacts: number;
  redundantDirs: number;
}

interface ScanResult {
  categories: ScanCategories;
  totalItems: number;
  summary: CleanupSummary;
}

interface CleanupResult {
  totalItems: number;
  summary: CleanupSummary;
  rawOutput: string;
}

interface CleanupOutput {
  targetDir: string;
  dryRun: boolean;
  initialSize: string;
  finalSize: string;
  savedSpace: string;
  totalItems: number;
  summary: CleanupSummary;
  categories?: ScanCategories;
  rawOutput?: string;
  timestamp: string;
  reportPaths?: unknown;
}

interface CleanupJobOptions {
  dryRun?: boolean;
}

export class RepoCleanupWorker extends SidequestServer {
  baseDir: string;
  scriptPath: string;

  constructor(options: RepoCleanupWorkerOptions = {}) {
    super({
      ...options,
      jobType: 'repo-cleanup',
    });
    this.baseDir = options.baseDir ?? path.join(os.homedir(), 'code');
    this.scriptPath = path.join(__dirname, '../pipeline-runners/universal-repo-cleanup.sh');
  }

  /**
   * Run repository cleanup job
   */
  async runJobHandler(job: Job): Promise<CleanupOutput> {
    const startTime = Date.now();
    const {
      targetDir = this.baseDir,
      dryRun = false,
    } = job.data as unknown as CleanupJobData;

    logger.info({
      jobId: job.id,
      targetDir,
      dryRun,
    }, 'Running repository cleanup job');

    try {
      // Check script exists
      await fs.access(this.scriptPath);

      // Get initial size
      const initialSize = await this.getDirectorySize(targetDir);

      let result: ScanResult | CleanupResult;
      if (dryRun) {
        // Scan only, don't clean
        result = await this.scanRepository(targetDir);
      } else {
        // Run actual cleanup
        result = await this.runCleanup(targetDir);
      }

      // Get final size
      const finalSize = await this.getDirectorySize(targetDir);

      const output: CleanupOutput = {
        targetDir,
        dryRun,
        initialSize,
        finalSize,
        savedSpace: dryRun ? 'N/A (dry run)' : this.formatSizeDiff(initialSize, finalSize),
        ...result,
        timestamp: new Date().toISOString(),
      };

      logger.info({
        jobId: job.id,
        targetDir,
        initialSize,
        finalSize,
        itemsFound: result.totalItems,
      }, 'Repository cleanup job completed');

      // Generate HTML/JSON reports
      const endTime = Date.now();
      const reportPaths = await generateReport({
        jobId: job.id,
        jobType: 'repo-cleanup',
        status: 'completed',
        result: output,
        startTime,
        endTime,
        parameters: job.data,
        metadata: {
          targetDir,
          dryRun,
          totalItems: result.totalItems
        }
      });

      output.reportPaths = reportPaths;
      logger.info({ reportPaths }, 'Repository cleanup reports generated');

      return output;
    } catch (error) {
      logger.error({
        jobId: job.id,
        error: (error as Error).message,
        stack: (error as Error).stack,
      }, 'Repository cleanup job failed');

      Sentry.captureException(error, {
        tags: {
          component: 'repo-cleanup-worker',
          job_id: job.id,
        },
        extra: {
          targetDir,
          dryRun,
        },
      });

      throw error;
    }
  }

  /**
   * Scan repository without cleaning
   */
  private async scanRepository(targetDir: string): Promise<ScanResult> {
    const categories: ScanCategories = {
      venvs: [],
      tempFiles: [],
      outputFiles: [],
      buildArtifacts: [],
      redundantDirs: [],
    };

    // Python venvs
    const venvPatterns = ['venv', '.venv', 'env', 'virtualenv'];
    for (const pattern of venvPatterns) {
      try {
        const { stdout } = await execFileAsync('find', [
          targetDir, '-maxdepth', '3', '-type', 'd', '-name', pattern
        ], { maxBuffer: 10 * 1024 * 1024 });
        const dirs = stdout.trim().split('\n').filter(Boolean);
        categories.venvs.push(...dirs);
      } catch {
        // Pattern not found
      }
    }

    // Temp files
    const tempPatterns = ['.DS_Store', '__pycache__', '*.pyc', '*.swp'];
    for (const pattern of tempPatterns) {
      try {
        const { stdout } = await execFileAsync('find', [
          targetDir, '-name', pattern
        ], { maxBuffer: 10 * 1024 * 1024 });
        const files = stdout.trim().split('\n').filter(Boolean);
        categories.tempFiles.push(...files);
      } catch {
        // Pattern not found
      }
    }

    // Build artifacts
    const buildArtifacts = ['.jekyll-cache', 'dist', 'build', '.next', 'node_modules/.cache'];
    for (const artifact of buildArtifacts) {
      const artifactPath = path.join(targetDir, artifact);
      try {
        await fs.access(artifactPath);
        categories.buildArtifacts.push(artifactPath);
      } catch {
        // Not found
      }
    }

    // Redundant dirs
    const redundantDirs = ['drafts', 'temp', 'tmp', 'backup', 'backups'];
    for (const dir of redundantDirs) {
      const dirPath = path.join(targetDir, dir);
      try {
        await fs.access(dirPath);
        categories.redundantDirs.push(dirPath);
      } catch {
        // Not found
      }
    }

    const totalItems = Object.values(categories).reduce((sum, arr) => sum + arr.length, 0);

    return {
      categories,
      totalItems,
      summary: {
        venvs: categories.venvs.length,
        tempFiles: categories.tempFiles.length,
        outputFiles: categories.outputFiles.length,
        buildArtifacts: categories.buildArtifacts.length,
        redundantDirs: categories.redundantDirs.length,
      },
    };
  }

  /**
   * Run actual cleanup using bash script
   */
  private async runCleanup(targetDir: string): Promise<CleanupResult> {
    // Run cleanup non-interactively by piping "yes"
    const { stdout, stderr } = await execFileAsync('bash', [
      '-c',
      `echo "yes" | ${this.scriptPath} "${targetDir}"`
    ], { maxBuffer: 10 * 1024 * 1024 });

    // Parse output to extract results
    const result = this.parseCleanupOutput(stdout);

    if (stderr) {
      logger.warn({ stderr }, 'Cleanup script stderr');
    }

    return result;
  }

  /**
   * Parse cleanup script output
   */
  private parseCleanupOutput(output: string): CleanupResult {
    const summary: CleanupSummary = {
      venvs: 0,
      tempFiles: 0,
      outputFiles: 0,
      buildArtifacts: 0,
      redundantDirs: 0,
    };

    // Extract counts from output
    const venvMatch = output.match(/Removed (\d+) virtual environment/);
    if (venvMatch) summary.venvs = parseInt(venvMatch[1], 10);

    const tempMatch = output.match(/Removed (\d+) temporary file/);
    if (tempMatch) summary.tempFiles = parseInt(tempMatch[1], 10);

    const outputMatch = output.match(/Removed (\d+) output file/);
    if (outputMatch) summary.outputFiles = parseInt(outputMatch[1], 10);

    const buildMatch = output.match(/Removed (\d+) build artifact/);
    if (buildMatch) summary.buildArtifacts = parseInt(buildMatch[1], 10);

    const dirMatch = output.match(/Removed (\d+) redundant director/);
    if (dirMatch) summary.redundantDirs = parseInt(dirMatch[1], 10);

    const totalItems = Object.values(summary).reduce((sum, val) => sum + val, 0);

    return {
      totalItems,
      summary,
      rawOutput: output,
    };
  }

  /**
   * Get directory size
   */
  private async getDirectorySize(dirPath: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync('du', ['-sh', dirPath]);
      return stdout.trim().split('\t')[0] ?? 'N/A';
    } catch {
      return 'N/A';
    }
  }

  /**
   * Format size difference
   */
  private formatSizeDiff(initial: string, final: string): string {
    // Simple string comparison for now
    return `${initial} -> ${final}`;
  }

  /**
   * Create a job to clean a specific repository
   */
  createCleanupJob(targetDir?: string, options: CleanupJobOptions = {}): Job {
    const jobId = `repo-cleanup-${Date.now()}`;

    return this.createJob(jobId, {
      type: 'repo-cleanup',
      targetDir: targetDir ?? this.baseDir,
      dryRun: options.dryRun ?? false,
    });
  }

  /**
   * Create a dry-run job to preview cleanup
   */
  createDryRunJob(targetDir?: string, _options: CleanupJobOptions = {}): Job {
    const jobId = `repo-cleanup-dryrun-${Date.now()}`;

    return this.createJob(jobId, {
      type: 'repo-cleanup',
      targetDir: targetDir ?? this.baseDir,
      dryRun: true,
    });
  }
}

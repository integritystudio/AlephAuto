import { SidequestServer, type Job, type SidequestServerOptions } from '../core/server.ts';
import { generateReport } from '../utils/report-generator.ts';
import { runCommand } from '@shared/process-io';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import * as Sentry from '@sentry/node';
import { createComponentLogger, logError } from '../utils/logger.ts';
import { GIT_ACTIVITY, NUMBER_BASE } from '../core/constants.ts';
import { TIME_MS } from '../core/units.ts';
import { nowISO, toISODateString } from '../utils/time-helpers.ts';
import {
  loadGitReportConfig,
  resolveConfig,
  findGitRepos,
  getRepoStats,
  compileActivityData,
  findProjectWebsites,
  generateVisualizations,
  generateJekyllReport,
  resolveOutputDir,
  type ActivityData,
} from './git-activity-collector.ts';

const logger = createComponentLogger('GitActivityWorker');

const JSON_INDENT = 2;
const DEFAULT_OUTPUT_FORMAT = 'both';
const JOB_TYPE_REPORT = 'git-activity-report';

interface GitActivityWorkerOptions extends SidequestServerOptions {
  codeBaseDir?: string;
  personalSiteDir?: string;
  outputDir?: string;
}

export interface GitActivityStats {
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

function toFiniteNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

export function buildGitActivityStatsFromData(data: Record<string, unknown>): GitActivityStats {
  return {
    totalCommits: toFiniteNumber(data.total_commits),
    totalRepositories: Array.isArray(data.repositories)
      ? data.repositories.length
      : toFiniteNumber(data.total_repositories),
    linesAdded: toFiniteNumber(data.total_additions),
    linesDeleted: toFiniteNumber(data.total_deletions),
    filesChanged: toFiniteNumber(data.total_files),
  };
}

export async function parseGitActivityStatsFromJsonFiles(
  outputFiles: string[],
  scriptDir: string,
  readFile: (path: string, encoding: BufferEncoding) => Promise<string> = fs.readFile
): Promise<GitActivityStats | null> {
  const jsonFiles = outputFiles.filter((file) => file.toLowerCase().endsWith('.json'));

  for (const file of jsonFiles) {
    const resolvedPath = path.isAbsolute(file)
      ? file
      : path.resolve(scriptDir, file);
    try {
      const content = await readFile(resolvedPath, 'utf-8');
      const data = JSON.parse(content) as Record<string, unknown>;
      if (Object.prototype.hasOwnProperty.call(data, 'total_commits')) {
        return buildGitActivityStatsFromData(data);
      }
    } catch (error) {
      const err = error as Error;
      logger.warn({ file: resolvedPath, error: err.message }, 'Failed to parse git activity stats JSON file');
      Sentry.captureException(err, {
        tags: {
          component: 'git-activity-worker',
          operation: 'parse-stats-json',
        },
        extra: {
          file: resolvedPath,
        },
      });
    }
  }

  return null;
}

export function parseGitActivityStatsFromText(stdout: string): GitActivityStats {
  const stats: GitActivityStats = {
    totalCommits: 0,
    totalRepositories: 0,
    linesAdded: 0,
    linesDeleted: 0,
  };

  const commitsMatch = stdout.match(/Total commits:\s*(\d+)/i);
  if (commitsMatch) {
    stats.totalCommits = parseInt(commitsMatch[1], NUMBER_BASE.DECIMAL);
  }

  const additionsMatch = stdout.match(/Lines added:\s*(\d+)/i);
  if (additionsMatch) {
    stats.linesAdded = parseInt(additionsMatch[1], NUMBER_BASE.DECIMAL);
  }

  const deletionsMatch = stdout.match(/Lines deleted:\s*(\d+)/i);
  if (deletionsMatch) {
    stats.linesDeleted = parseInt(deletionsMatch[1], NUMBER_BASE.DECIMAL);
  }

  const reposMatch = stdout.match(/Active repositories:\s*(\d+)/i);
  if (reposMatch) {
    stats.totalRepositories = parseInt(reposMatch[1], NUMBER_BASE.DECIMAL);
  }

  const filesMatch = stdout.match(/File changes:\s*(\d+)/i);
  if (filesMatch) {
    stats.filesChanged = parseInt(filesMatch[1], NUMBER_BASE.DECIMAL);
  }

  return stats;
}

function buildStatsFromActivityData(data: ActivityData): GitActivityStats {
  return {
    totalCommits: data.total_commits,
    totalRepositories: data.total_repositories,
    linesAdded: data.total_additions,
    linesDeleted: data.total_deletions,
    filesChanged: data.total_files,
  };
}

/**
 * GitActivityWorker - Executes git activity report jobs
 *
 * Collects git activity across repositories, generates reports and visualizations.
 */
export class GitActivityWorker extends SidequestServer {
  codeBaseDir: string;
  personalSiteDir: string;
  outputDir: string;

  constructor(options: GitActivityWorkerOptions = {}) {
    super({
      ...options,
      jobType: 'git-activity',
    });
    this.codeBaseDir = options.codeBaseDir ?? path.join(os.homedir(), 'code');
    this.personalSiteDir = options.personalSiteDir ?? path.join(
      os.homedir(),
      'code',
      'PersonalSite'
    );
    this.outputDir = options.outputDir ?? path.join(os.homedir(), 'code', 'PersonalSite', '_reports');
  }

  async runJobHandler(job: Job): Promise<unknown> {
    const startTime = Date.now();
    const {
      reportType,
      days,
      sinceDate: rawSinceDate,
      untilDate: rawUntilDate,
      outputFormat = DEFAULT_OUTPUT_FORMAT,
      generateVisualizations: doVisualizations = true
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
      sinceDate: rawSinceDate,
      untilDate: rawUntilDate
    }, 'Running git activity report');

    try {
      // Resolve date range
      const { sinceDate, untilDate } = this.#resolveDateRange({
        reportType, days, sinceDate: rawSinceDate, untilDate: rawUntilDate,
      });

      // Load config and discover repos
      const rawConfig = await loadGitReportConfig();
      const config = resolveConfig(rawConfig);
      const repos = await findGitRepos(config);

      // Collect stats from all repos
      const repositories = [];
      const allFiles: string[] = [];
      for (const repoPath of repos) {
        try {
          const stats = await getRepoStats(repoPath, sinceDate, untilDate, config);
          if (stats.commits > 0) {
            repositories.push(stats);
            allFiles.push(...stats.files);
          }
        } catch (err) {
          logger.warn({ repoPath, error: (err as Error).message }, 'Failed to get repo stats, skipping');
        }
      }
      repositories.sort((a, b) => b.commits - a.commits);

      // Compile activity data
      const data = compileActivityData(repositories, allFiles, sinceDate, untilDate, config);
      data.websites = await findProjectWebsites(repositories);

      const stats = buildStatsFromActivityData(data);
      const outputFiles: string[] = [];

      // Generate outputs based on format
      const wantsMarkdown = outputFormat === 'markdown' || outputFormat === DEFAULT_OUTPUT_FORMAT;
      const wantsJson = outputFormat === 'json' || outputFormat === DEFAULT_OUTPUT_FORMAT;

      const reportDate = toISODateString();

      let articleUrl: string | null = null;

      if (wantsMarkdown) {
        const reportDir = path.join(config.personalSiteDir, config.workCollection);
        const reportFile = path.join(reportDir, `${reportDate}-git-activity-report.md`);
        const jekyllResult = await generateJekyllReport(data, reportFile);
        articleUrl = `https://www.aledlie.com${jekyllResult.permalink}`;
        outputFiles.push(reportFile);
      }

      if (wantsJson) {
        const reportDir = path.join(config.personalSiteDir, config.workCollection);
        const jsonFile = path.join(reportDir, `${reportDate}-git-activity-report.json`);
        await fs.mkdir(path.dirname(jsonFile), { recursive: true });
        await fs.writeFile(jsonFile, JSON.stringify(data, null, JSON_INDENT));
        outputFiles.push(jsonFile);
      }

      if (doVisualizations) {
        const vizDir = resolveOutputDir(config);
        const vizFiles = await generateVisualizations(data, vizDir);
        outputFiles.push(...vizFiles);
      }

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
        articleUrl,
        outputFiles: verifiedFiles,
        timestamp: nowISO(),
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

      // Stage, commit, and push generated files to PersonalSite repo
      const publishResult = await this.#publishToPersonalSite(
        config.personalSiteDir,
        verifiedFiles.filter(f => f.exists).map(f => f.path),
        reportType,
        sinceDate,
        untilDate ?? toISODateString()
      );
      result.published = publishResult;

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

  #resolveDateRange(opts: {
    reportType?: string;
    days?: number;
    sinceDate?: string;
    untilDate?: string;
  }): { sinceDate: string; untilDate: string | undefined } {
    if (opts.sinceDate) {
      return { sinceDate: opts.sinceDate, untilDate: opts.untilDate };
    }

    let daysBack: number;
    if (opts.reportType === GIT_ACTIVITY.WEEKLY_REPORT_TYPE || opts.days === GIT_ACTIVITY.WEEKLY_WINDOW_DAYS) {
      daysBack = GIT_ACTIVITY.WEEKLY_WINDOW_DAYS;
    } else if (opts.reportType === GIT_ACTIVITY.MONTHLY_REPORT_TYPE || opts.days === GIT_ACTIVITY.MONTHLY_WINDOW_DAYS) {
      daysBack = GIT_ACTIVITY.MONTHLY_WINDOW_DAYS;
    } else if (opts.days) {
      daysBack = opts.days;
    } else {
      daysBack = GIT_ACTIVITY.WEEKLY_WINDOW_DAYS;
    }

    const start = new Date(Date.now() - daysBack * TIME_MS.DAY);
    return {
      sinceDate: toISODateString(start),
      untilDate: toISODateString(),
    };
  }

  #calculateDays(sinceDate?: string, untilDate?: string): number | null {
    if (!sinceDate || !untilDate) return null;

    const since = new Date(sinceDate);
    const until = new Date(untilDate);
    const diffTime = Math.abs(until.getTime() - since.getTime());
    const diffDays = Math.ceil(diffTime / TIME_MS.DAY);

    return diffDays;
  }

  async #verifyOutputFiles(files: string[]): Promise<VerifiedFile[]> {
    const verified: VerifiedFile[] = [];

    for (const file of files) {
      try {
        await fs.access(file);
        const fileStat = await fs.stat(file);
        verified.push({
          path: file,
          size: fileStat.size,
          exists: true,
        });
      } catch (error) {
        const err = error as Error;
        logger.warn({ file, error: err.message }, 'Output file not found');
        verified.push({
          path: file,
          exists: false,
        });
      }
    }

    return verified;
  }

  async #publishToPersonalSite(
    repoDir: string,
    filePaths: string[],
    reportType: string | undefined,
    sinceDate: string,
    untilDate: string
  ): Promise<{ committed: boolean; pushed: boolean; commitSha?: string; error?: string }> {
    if (filePaths.length === 0) {
      return { committed: false, pushed: false, error: 'No files to publish' };
    }

    try {
      // Pull latest to avoid push rejections
      try {
        await runCommand(repoDir, 'git', ['pull', '--rebase', '--autostash']);
      } catch (pullErr) {
        logger.warn({ error: (pullErr as Error).message }, 'git pull --rebase failed, attempting merge pull');
        await runCommand(repoDir, 'git', ['rebase', '--abort']).catch(() => {});
        await runCommand(repoDir, 'git', ['pull', '--no-rebase']);
      }

      // Stage only the generated files (relative to the repo)
      for (const filePath of filePaths) {
        const relativePath = path.relative(repoDir, filePath);
        await runCommand(repoDir, 'git', ['add', relativePath]);
      }

      // Check if there are staged changes
      const diffOutput = await runCommand(repoDir, 'git', ['diff', '--cached', '--name-only']);
      if (!diffOutput.trim()) {
        logger.info('No changes to commit to PersonalSite');
        return { committed: false, pushed: false };
      }

      // Commit
      const period = `${sinceDate} to ${untilDate}`;
      const commitMsg = `Add ${reportType ?? 'git activity'} report: ${period}\n\nGenerated by AlephAuto Git Activity Pipeline\n\nCo-Authored-By: Claude <noreply@anthropic.com>`;
      await runCommand(repoDir, 'git', ['commit', '-m', commitMsg]);

      const commitSha = (await runCommand(repoDir, 'git', ['rev-parse', 'HEAD'])).trim();
      logger.info({ commitSha, files: filePaths.length }, 'Committed report to PersonalSite');

      // Push
      await runCommand(repoDir, 'git', ['push']);
      logger.info({ commitSha }, 'Pushed report to PersonalSite remote');

      return { committed: true, pushed: true, commitSha };
    } catch (error) {
      logError(logger, error, 'Failed to publish report to PersonalSite');
      Sentry.captureException(error, {
        tags: { component: 'git-activity-worker', operation: 'publish' }
      });
      return { committed: false, pushed: false, error: (error as Error).message };
    }
  }

  createWeeklyReportJob(): Job {
    const jobId = `git-activity-weekly-${Date.now()}`;

    return this.createJob(jobId, {
      reportType: GIT_ACTIVITY.WEEKLY_REPORT_TYPE,
      days: GIT_ACTIVITY.WEEKLY_WINDOW_DAYS,
      outputFormat: DEFAULT_OUTPUT_FORMAT,
      type: JOB_TYPE_REPORT,
    });
  }

  createMonthlyReportJob(): Job {
    const jobId = `git-activity-monthly-${Date.now()}`;

    return this.createJob(jobId, {
      reportType: GIT_ACTIVITY.MONTHLY_REPORT_TYPE,
      days: GIT_ACTIVITY.MONTHLY_WINDOW_DAYS,
      outputFormat: DEFAULT_OUTPUT_FORMAT,
      type: JOB_TYPE_REPORT,
    });
  }

  createCustomReportJob(sinceDate: string, untilDate: string): Job {
    const jobId = `git-activity-custom-${Date.now()}`;

    return this.createJob(jobId, {
      reportType: GIT_ACTIVITY.CUSTOM_REPORT_TYPE,
      sinceDate,
      untilDate,
      type: JOB_TYPE_REPORT,
    });
  }

  createReportJob(options: ReportJobOptions = {}): Job {
    const jobId = options.jobId ?? `git-activity-${Date.now()}`;

    return this.createJob(jobId, {
      reportType: options.reportType ?? GIT_ACTIVITY.DEFAULT_REPORT_TYPE,
      days: options.days,
      sinceDate: options.sinceDate,
      untilDate: options.untilDate,
      outputFormat: options.outputFormat ?? DEFAULT_OUTPUT_FORMAT,
      generateVisualizations: options.generateVisualizations !== false,
      type: JOB_TYPE_REPORT,
    });
  }
}

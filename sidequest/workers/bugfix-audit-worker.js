import { SidequestServer } from '../core/server.js';
import { GitWorkflowManager } from '../core/git-workflow-manager.js';
import { execCommand } from '@shared/process-io';
import { createComponentLogger, logError, logStage } from '../utils/logger.ts';
import { config } from '../core/config.ts';
import fs from 'fs/promises';
import path from 'path';

const logger = createComponentLogger('BugfixAuditWorker');

/**
 * BugfixAuditWorker - Automated bug detection and fixing workflow
 *
 * Orchestrates multiple tools in sequence:
 * 1. bugfix-planner agent - Create comprehensive bug fix plans
 * 2. bug-detective plugin - Systematic debugging
 * 3. audit plugin - Security audit
 * 4. ceo-quality-controller-agent - Quality validation
 * 5. refractor plugin - Implement fixes
 *
 * Git workflow:
 * - Creates feature branch before changes
 * - Commits after each stage
 * - Pushes branch and creates PR when complete
 *
 * Uses GitWorkflowManager directly (not gitWorkflowEnabled) because
 * this pipeline makes multiple intermediate commits rather than the
 * base class's single commit-at-end pattern.
 */
export class BugfixAuditWorker extends SidequestServer {
  constructor(options = {}) {
    super({
      ...options,
      jobType: 'bugfix-audit',
      // Explicitly disable base-class git workflow — we manage commits ourselves
      gitWorkflowEnabled: false,
    });

    this.activeDocsDir = options.activeDocsDir ?? path.join(config.homeDir, 'dev', 'active');
    this.outputBaseDir = options.outputBaseDir ?? path.join(config.homeDir, 'code', 'jobs', 'sidequest', 'bug-fixes', 'output');

    this.gitWorkflowManager = new GitWorkflowManager({
      baseBranch: options.gitBaseBranch ?? config.gitBaseBranch,
      branchPrefix: options.gitBranchPrefix ?? 'bugfix',
      dryRun: options.gitDryRun ?? config.gitDryRun,
    });

    logger.info({
      activeDocsDir: this.activeDocsDir,
      outputBaseDir: this.outputBaseDir,
    }, 'BugfixAuditWorker initialized');
  }

  /**
   * Find all markdown files in active docs directory
   */
  async findMarkdownFiles() {
    logger.info({ dir: this.activeDocsDir }, 'Scanning for markdown files');

    const markdownFiles = [];

    async function scanDirectory(dir) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await scanDirectory(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          markdownFiles.push(fullPath);
        }
      }
    }

    await scanDirectory(this.activeDocsDir);

    logger.info({ count: markdownFiles.length }, 'Markdown files found');
    return markdownFiles;
  }

  /**
   * Extract repository path from markdown file location
   */
  getRepositoryFromPath(markdownPath) {
    const parts = markdownPath.split(path.sep);
    const activeIndex = parts.indexOf('active');

    if (activeIndex !== -1 && parts.length > activeIndex + 1) {
      const projectName = parts[activeIndex + 1];
      const possibleRepoPaths = [
        path.join(config.homeDir, 'code', projectName),
        path.join(config.homeDir, 'code', 'jobs', projectName),
        path.join(config.homeDir, 'code', projectName.replace(/^bugfix-/, '').replace(/-\d{4}-\d{2}-\d{2}$/, '')),
      ];
      return { projectName, possibleRepoPaths };
    }

    return { projectName: null, possibleRepoPaths: [] };
  }

  /**
   * Run Claude Code agent via CLI
   */
  async runClaudeAgent(agentType, prompt, cwd) {
    logger.info({ agentType, cwd }, 'Running Claude Code agent');

    const result = await execCommand('claude', ['--agent', agentType, '--prompt', prompt], {
      cwd,
    });

    if (result.code !== 0) {
      throw new Error(`Agent ${agentType} failed with code ${result.code}: ${result.stderr}`);
    }

    return { stdout: result.stdout, stderr: result.stderr };
  }

  /**
   * Run Claude Code slash command
   */
  async runSlashCommand(command, cwd) {
    logger.info({ command, cwd }, 'Running slash command');

    const result = await execCommand('claude', ['--command', command], {
      cwd,
    });

    if (result.code !== 0) {
      throw new Error(`Command ${command} failed with code ${result.code}: ${result.stderr}`);
    }

    return { stdout: result.stdout, stderr: result.stderr };
  }

  /**
   * Main job handler - orchestrates the entire bug fix workflow
   */
  async runJobHandler(job) {
    const { markdownFile, projectName, repoPath } = job.data;

    logger.info({
      jobId: job.id,
      markdownFile,
      projectName,
      repoPath,
    }, 'Starting bug fix audit workflow');

    // Create feature branch at job start
    const branchInfo = await this.gitWorkflowManager.createJobBranch(repoPath, {
      jobId: job.id,
      jobType: 'bugfix-audit',
      description: `automated-audit-${projectName}`,
    });

    const branchName = branchInfo?.branchName;
    if (!branchName) {
      throw new Error(`Failed to create git branch for ${projectName}`);
    }

    const outputDir = path.join(this.outputBaseDir, projectName, new Date().toISOString().split('T')[0]);
    await fs.mkdir(outputDir, { recursive: true });

    const results = {
      markdownFile,
      projectName,
      repoPath,
      stages: [],
      branchName,
      pullRequestUrl: null,
      timestamp: new Date().toISOString(),
    };

    try {
      const markdownContent = await fs.readFile(markdownFile, 'utf-8');

      // Stage 1: bugfix-planner agent
      logStage(logger, '1/5: Running bugfix-planner agent');
      const plannerPrompt = `Analyze this markdown file and create a comprehensive bug fix plan:\n\n${markdownContent}`;
      const plannerResult = await this.runClaudeAgent('bugfix-planner', plannerPrompt, repoPath);
      results.stages.push({ name: 'bugfix-planner', status: 'completed', output: plannerResult.stdout });
      await fs.writeFile(path.join(outputDir, '01-bugfix-plan.md'), plannerResult.stdout);

      // Stage 2: bug-detective plugin
      logStage(logger, '2/5: Running bug-detective plugin');
      const detectiveResult = await this.runSlashCommand('/bug-detective:bug-detective', repoPath);
      results.stages.push({ name: 'bug-detective', status: 'completed', output: detectiveResult.stdout });
      await fs.writeFile(path.join(outputDir, '02-bug-detective-report.md'), detectiveResult.stdout);

      // Stage 3: audit plugin
      logStage(logger, '3/5: Running audit plugin');
      const auditResult = await this.runSlashCommand('/audit:audit', repoPath);
      results.stages.push({ name: 'audit', status: 'completed', output: auditResult.stdout });
      await fs.writeFile(path.join(outputDir, '03-security-audit.md'), auditResult.stdout);

      // Commit audit results
      await this.gitWorkflowManager.commitChanges(repoPath, {
        message: 'chore(audit): automated bugfix plan, detective report, security audit',
        description: 'Generated with Claude Code AlephAuto',
        jobId: job.id,
      });

      // Stage 4: ceo-quality-controller-agent
      logStage(logger, '4/5: Running ceo-quality-controller-agent');
      const qualityPrompt = 'Review all audit reports and validate quality standards before implementing fixes';
      const qualityResult = await this.runClaudeAgent('ceo-quality-controller-agent', qualityPrompt, repoPath);
      results.stages.push({ name: 'ceo-quality-controller', status: 'completed', output: qualityResult.stdout });
      await fs.writeFile(path.join(outputDir, '04-quality-control.md'), qualityResult.stdout);

      // Commit quality control
      await this.gitWorkflowManager.commitChanges(repoPath, {
        message: 'chore(audit): quality control validation complete',
        description: 'Generated with Claude Code AlephAuto',
        jobId: job.id,
      });

      // Stage 5: refractor plugin - implement fixes
      logStage(logger, '5/5: Running refractor plugin to implement fixes');
      const refractorResult = await this.runSlashCommand('/refractor:refractor', repoPath);
      results.stages.push({ name: 'refractor', status: 'completed', output: refractorResult.stdout });
      await fs.writeFile(path.join(outputDir, '05-refactor-implementation.md'), refractorResult.stdout);

      // Commit refactored code
      await this.gitWorkflowManager.commitChanges(repoPath, {
        message: 'fix: automated refactoring and bug fixes implemented',
        description: 'Generated with Claude Code AlephAuto',
        jobId: job.id,
      });

      // Push branch + create PR
      await this.gitWorkflowManager.pushBranch(repoPath, branchName);

      const prBody = [
        '## Automated Bug Fix Workflow',
        '',
        'This PR was automatically generated by the BugfixAuditWorker (AlephAuto framework).',
        '',
        '### Workflow Stages Completed:',
        ...results.stages.map((stage, i) => `${i + 1}. **${stage.name}**: ${stage.status}`),
        '',
        '### Reports Generated:',
        '- Bug Fix Plan',
        '- Bug Detective Analysis',
        '- Security Audit',
        '- Quality Control Validation',
        '- Refactor Implementation',
        '',
        '### Testing:',
        '- [ ] All automated tests pass',
        '- [ ] Manual review of security audit findings',
        '- [ ] Code quality meets standards',
        '',
        '---',
        '',
        'Generated with [Claude Code](https://claude.com/claude-code) AlephAuto',
      ].join('\n');

      const prUrl = await this.gitWorkflowManager.createPullRequest(repoPath, {
        branchName,
        title: `fix: automated bug fixes for ${projectName}`,
        body: prBody,
        labels: ['automated', 'bugfix'],
      });

      results.pullRequestUrl = prUrl;
      logger.info({ prUrl }, 'Pull request created');

      // Save final results summary
      await fs.writeFile(path.join(outputDir, 'workflow-summary.json'), JSON.stringify(results, null, 2));

      return results;
    } catch (error) {
      logError(logger, error, 'Bug fix workflow failed', { jobId: job.id });

      await fs.writeFile(
        path.join(outputDir, 'workflow-error.json'),
        JSON.stringify({ ...results, error: error.message, stack: error.stack }, null, 2)
      );

      throw error;
    }
  }

  /**
   * Create a single bugfix job for a specific markdown file
   */
  createBugfixJob(markdownFile, projectName, repoPath) {
    const jobId = `bugfix-${projectName}-${Date.now()}`;
    return this.createJob(jobId, {
      markdownFile,
      projectName,
      repoPath,
    });
  }

  /**
   * Create jobs for all markdown files in the active docs directory
   */
  async createJobsForAllMarkdownFiles() {
    const markdownFiles = await this.findMarkdownFiles();

    logger.info({ count: markdownFiles.length }, 'Creating jobs for markdown files');

    const jobs = [];

    for (const markdownFile of markdownFiles) {
      const { projectName, possibleRepoPaths } = this.getRepositoryFromPath(markdownFile);

      if (!projectName) {
        logger.warn({ markdownFile }, 'Could not determine project name, skipping');
        continue;
      }

      // Find the first existing repo path
      let repoPath = null;
      for (const possiblePath of possibleRepoPaths) {
        try {
          await fs.access(possiblePath);
          repoPath = possiblePath;
          break;
        } catch {
          // Path doesn't exist, try next
        }
      }

      if (!repoPath) {
        logger.warn({ markdownFile, possibleRepoPaths }, 'Could not find repository, skipping');
        continue;
      }

      // Check if it's a git repository
      try {
        await fs.access(path.join(repoPath, '.git'));
      } catch {
        logger.warn({ repoPath }, 'Not a git repository, skipping');
        continue;
      }

      const job = this.createBugfixJob(markdownFile, projectName, repoPath);
      jobs.push(job);
    }

    logger.info({ jobCount: jobs.length }, 'Jobs created');
    return jobs;
  }
}

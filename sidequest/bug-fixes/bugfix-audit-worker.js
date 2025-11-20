// @ts-nocheck
import { SidequestServer } from '../server.js';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { createComponentLogger } from '../logger.js';
import { config } from '../config.js';

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
 * - Creates PR to main when complete
 */
export class BugfixAuditWorker extends SidequestServer {
  constructor(options = {}) {
    super(options);
    this.activeDocsDir = options.activeDocsDir || path.join(process.env.HOME, 'dev', 'active');
    this.outputBaseDir = options.outputBaseDir || path.join(process.env.HOME, 'code', 'jobs', 'sidequest', 'bug-fixes', 'output');

    logger.info({
      activeDocsDir: this.activeDocsDir,
      outputBaseDir: this.outputBaseDir
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
    // Extract the project directory from path like:
    // /Users/*/dev/active/bugfix-project-name/context.md
    const parts = markdownPath.split(path.sep);
    const activeIndex = parts.indexOf('active');

    if (activeIndex !== -1 && parts.length > activeIndex + 1) {
      const projectName = parts[activeIndex + 1];

      // Try to find corresponding repo in ~/code/
      const possibleRepoPaths = [
        path.join(process.env.HOME, 'code', projectName),
        path.join(process.env.HOME, 'code', 'jobs', projectName),
        // Extract repo name from bugfix- prefix
        path.join(process.env.HOME, 'code', projectName.replace(/^bugfix-/, '').replace(/-\d{4}-\d{2}-\d{2}$/, ''))
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

    return new Promise((resolve, reject) => {
      // Use claude CLI to run agent
      // Note: This is a placeholder - actual implementation would use Claude Code API
      const child = spawn('claude', ['--agent', agentType, '--prompt', prompt], {
        cwd,
        stdio: 'pipe',
        shell: true
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Agent ${agentType} failed with code ${code}: ${stderr}`));
        }
      });

      child.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Run Claude Code slash command
   */
  async runSlashCommand(command, cwd) {
    logger.info({ command, cwd }, 'Running slash command');

    return new Promise((resolve, reject) => {
      const child = spawn('claude', ['--command', command], {
        cwd,
        stdio: 'pipe',
        shell: true
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Command ${command} failed with code ${code}: ${stderr}`));
        }
      });

      child.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Create a git branch for bug fixes
   */
  async createGitBranch(repoPath, branchName) {
    logger.info({ repoPath, branchName }, 'Creating git branch');

    return new Promise((resolve, reject) => {
      const child = spawn('git', ['checkout', '-b', branchName], {
        cwd: repoPath,
        stdio: 'pipe'
      });

      let stderr = '';

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Git branch creation failed: ${stderr}`));
        }
      });

      child.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Commit changes with descriptive message
   */
  async commitChanges(repoPath, message) {
    logger.info({ repoPath, message }, 'Committing changes');

    // Stage all changes
    await new Promise((resolve, reject) => {
      const child = spawn('git', ['add', '.'], {
        cwd: repoPath,
        stdio: 'pipe'
      });

      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error('Git add failed'));
      });

      child.on('error', reject);
    });

    // Commit
    return new Promise((resolve, reject) => {
      const child = spawn('git', ['commit', '-m', message], {
        cwd: repoPath,
        stdio: 'pipe'
      });

      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error('Git commit failed'));
      });

      child.on('error', reject);
    });
  }

  /**
   * Create pull request using gh CLI
   */
  async createPullRequest(repoPath, title, body) {
    logger.info({ repoPath, title }, 'Creating pull request');

    return new Promise((resolve, reject) => {
      const child = spawn('gh', [
        'pr', 'create',
        '--title', title,
        '--body', body,
        '--base', 'main'
      ], {
        cwd: repoPath,
        stdio: 'pipe'
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ url: stdout.trim() });
        } else {
          reject(new Error(`PR creation failed: ${stderr}`));
        }
      });

      child.on('error', (error) => {
        reject(error);
      });
    });
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
      repoPath
    }, 'Starting bug fix audit workflow');

    const outputDir = path.join(this.outputBaseDir, projectName, new Date().toISOString().split('T')[0]);
    await fs.mkdir(outputDir, { recursive: true });

    const results = {
      markdownFile,
      projectName,
      repoPath,
      stages: [],
      branchName: null,
      pullRequestUrl: null,
      timestamp: new Date().toISOString()
    };

    try {
      // Read markdown content
      const markdownContent = await fs.readFile(markdownFile, 'utf-8');

      // Stage 1: bugfix-planner agent
      logger.info({ stage: 1 }, 'Running bugfix-planner agent');
      const plannerPrompt = `Analyze this markdown file and create a comprehensive bug fix plan:\n\n${markdownContent}`;

      try {
        const plannerResult = await this.runClaudeAgent('bugfix-planner', plannerPrompt, repoPath);
        results.stages.push({
          name: 'bugfix-planner',
          status: 'completed',
          output: plannerResult.stdout
        });

        // Save plan to output
        const planPath = path.join(outputDir, '01-bugfix-plan.md');
        await fs.writeFile(planPath, plannerResult.stdout);
        logger.info({ planPath }, 'Bug fix plan saved');
      } catch (error) {
        logger.error({ error }, 'bugfix-planner failed');
        results.stages.push({
          name: 'bugfix-planner',
          status: 'failed',
          error: error.message
        });
        throw error;
      }

      // Stage 2: bug-detective plugin
      logger.info({ stage: 2 }, 'Running bug-detective plugin');
      try {
        const detectiveResult = await this.runSlashCommand('/bug-detective:bug-detective', repoPath);
        results.stages.push({
          name: 'bug-detective',
          status: 'completed',
          output: detectiveResult.stdout
        });

        const detectivePath = path.join(outputDir, '02-bug-detective-report.md');
        await fs.writeFile(detectivePath, detectiveResult.stdout);
        logger.info({ detectivePath }, 'Bug detective report saved');
      } catch (error) {
        logger.error({ error }, 'bug-detective failed');
        results.stages.push({
          name: 'bug-detective',
          status: 'failed',
          error: error.message
        });
        throw error;
      }

      // Stage 3: audit plugin
      logger.info({ stage: 3 }, 'Running audit plugin');
      try {
        const auditResult = await this.runSlashCommand('/audit:audit', repoPath);
        results.stages.push({
          name: 'audit',
          status: 'completed',
          output: auditResult.stdout
        });

        const auditPath = path.join(outputDir, '03-security-audit.md');
        await fs.writeFile(auditPath, auditResult.stdout);
        logger.info({ auditPath }, 'Security audit saved');
      } catch (error) {
        logger.error({ error }, 'audit failed');
        results.stages.push({
          name: 'audit',
          status: 'failed',
          error: error.message
        });
        throw error;
      }

      // Commit audit results
      await this.commitChanges(repoPath, '🔍 Automated audit: bugfix plan, detective report, security audit\n\n🤖 Generated with Claude Code AlephAuto\n\nCo-Authored-By: Claude <noreply@anthropic.com>');

      // Stage 4: ceo-quality-controller-agent
      logger.info({ stage: 4 }, 'Running ceo-quality-controller-agent');
      try {
        const qualityPrompt = 'Review all audit reports and validate quality standards before implementing fixes';
        const qualityResult = await this.runClaudeAgent('ceo-quality-controller-agent', qualityPrompt, repoPath);
        results.stages.push({
          name: 'ceo-quality-controller',
          status: 'completed',
          output: qualityResult.stdout
        });

        const qualityPath = path.join(outputDir, '04-quality-control.md');
        await fs.writeFile(qualityPath, qualityResult.stdout);
        logger.info({ qualityPath }, 'Quality control report saved');
      } catch (error) {
        logger.error({ error }, 'quality-controller failed');
        results.stages.push({
          name: 'ceo-quality-controller',
          status: 'failed',
          error: error.message
        });
        throw error;
      }

      // Commit quality control
      await this.commitChanges(repoPath, '✅ Quality control validation complete\n\n🤖 Generated with Claude Code AlephAuto\n\nCo-Authored-By: Claude <noreply@anthropic.com>');

      // Stage 5: refractor plugin - implement fixes
      logger.info({ stage: 5 }, 'Running refractor plugin to implement fixes');
      try {
        const refractorResult = await this.runSlashCommand('/refractor:refractor', repoPath);
        results.stages.push({
          name: 'refractor',
          status: 'completed',
          output: refractorResult.stdout
        });

        const refractorPath = path.join(outputDir, '05-refactor-implementation.md');
        await fs.writeFile(refractorPath, refractorResult.stdout);
        logger.info({ refractorPath }, 'Refactor implementation saved');
      } catch (error) {
        logger.error({ error }, 'refractor failed');
        results.stages.push({
          name: 'refractor',
          status: 'failed',
          error: error.message
        });
        throw error;
      }

      // Commit refactored code
      await this.commitChanges(repoPath, '♻️ Automated refactoring and bug fixes implemented\n\n🤖 Generated with Claude Code AlephAuto\n\nCo-Authored-By: Claude <noreply@anthropic.com>');

      // Create pull request
      const prTitle = `🤖 Automated Bug Fixes: ${projectName}`;
      const prBody = `## Automated Bug Fix Workflow

This PR was automatically generated by the BugfixAuditWorker (AlephAuto framework).

### Workflow Stages Completed:
${results.stages.map((stage, i) => `${i + 1}. **${stage.name}**: ${stage.status}`).join('\n')}

### Reports Generated:
- Bug Fix Plan
- Bug Detective Analysis
- Security Audit
- Quality Control Validation
- Refactor Implementation

### Testing:
- [ ] All automated tests pass
- [ ] Manual review of security audit findings
- [ ] Code quality meets standards

---
🤖 Generated with [Claude Code](https://claude.com/claude-code) AlephAuto

Co-Authored-By: Claude <noreply@anthropic.com>`;

      const pr = await this.createPullRequest(repoPath, prTitle, prBody);
      results.pullRequestUrl = pr.url;

      logger.info({ prUrl: pr.url }, 'Pull request created');

      // Save final results summary
      const summaryPath = path.join(outputDir, 'workflow-summary.json');
      await fs.writeFile(summaryPath, JSON.stringify(results, null, 2));

      return results;

    } catch (error) {
      logger.error({ error, jobId: job.id }, 'Bug fix workflow failed');

      // Save partial results
      const errorPath = path.join(outputDir, 'workflow-error.json');
      await fs.writeFile(errorPath, JSON.stringify({
        ...results,
        error: error.message,
        stack: error.stack
      }, null, 2));

      throw error;
    }
  }

  /**
   * Create jobs for all markdown files
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

      // Create feature branch name
      const branchName = `bugfix/automated-audit-${Date.now()}`;

      // Create branch before adding job
      try {
        await this.createGitBranch(repoPath, branchName);
        logger.info({ repoPath, branchName }, 'Branch created');
      } catch (error) {
        logger.error({ error, repoPath }, 'Failed to create branch, skipping');
        continue;
      }

      const job = this.createJob({
        markdownFile,
        projectName,
        repoPath,
        branchName
      });

      jobs.push(job);
    }

    logger.info({ jobCount: jobs.length }, 'Jobs created');
    return jobs;
  }
}

export default BugfixAuditWorker;

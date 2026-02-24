/**
 * Claude Health Check Worker - AlephAuto Integration
 *
 * Comprehensive health monitoring for Claude Code environment including:
 * - Skills, hooks, agents, commands inventory
 * - Configuration validation (settings.json, skill-rules.json)
 * - Hook permissions and registration
 * - Plugin analysis and duplicate detection
 * - Directory structure verification
 * - Environment variable status
 * - Performance log analysis
 *
 * @extends SidequestServer
 */

import { SidequestServer, type Job } from '../core/server.ts';
import { config } from '../core/config.ts';
import { TIMEOUTS } from '../core/constants.ts';
import { createComponentLogger, logError, logWarn, logStart } from '../utils/logger.ts';
import { generateReport } from '../utils/report-generator.ts';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);
const logger = createComponentLogger('ClaudeHealth');

// --- Type definitions ---

interface ClaudeHealthWorkerOptions {
  maxConcurrent?: number;
  logDir?: string;
  gitWorkflowEnabled?: boolean;
  gitBranchPrefix?: string;
  gitBaseBranch?: string;
  gitDryRun?: boolean;
  sentryDsn?: string;
}

interface Thresholds {
  maxPlugins: number;
  warnPlugins: number;
  maxHookExecutionTime: number;
  minDiskSpace: number;
  maxLogSize: number;
}

interface CheckOptions {
  detailed?: boolean;
  validateConfig?: boolean;
  checkPerformance?: boolean;
  analyzePlugins?: boolean;
}

interface EnvironmentCheck {
  direnv: boolean;
  direnvConfigured: boolean;
  direnvAllowed: boolean;
  nodeVersion: string | null;
  npmVersion: string | null;
  envVars: Record<string, string | null>;
}

interface DirectoryInfo {
  exists: boolean;
  path: string;
  size?: number | null;
  error?: string;
}

interface ConfigCheck {
  settingsJson: Record<string, unknown>;
  skillRulesJson: Record<string, unknown>;
  packageJson: Record<string, unknown>;
  envrc: Record<string, unknown>;
}

interface HookInfo {
  name: string;
  executable: boolean;
  size: number;
}

interface HooksCheck {
  totalHooks: number;
  executableHooks: number;
  registeredHooks: number;
  hooks: HookInfo[];
}

interface ComponentCounts {
  skills: number;
  agents: number;
  commands: number;
  activeTasks: number;
  archivedTasks: number;
  templates: number;
}

interface DuplicateCategory {
  category: string;
  plugins: string[];
  count: number;
}

interface PluginsCheck {
  totalPlugins: number;
  enabledPlugins: string[];
  duplicateCategories: DuplicateCategory[];
  exceededThresholds: {
    maxPlugins: boolean;
    warnPlugins: boolean;
  };
}

interface SlowHookDetail {
  hook: string;
  duration: number;
}

interface PerformanceCheck {
  logExists: boolean;
  logSize?: number;
  totalEntries?: number;
  recentEntries?: number;
  slowHooks?: number;
  failures?: number;
  slowHookDetails?: SlowHookDetail[];
  message?: string;
}

interface AllChecks {
  environment: EnvironmentCheck;
  directories: Record<string, DirectoryInfo>;
  configuration: ConfigCheck | null;
  hooks: HooksCheck;
  components: ComponentCounts;
  plugins: PluginsCheck | null;
  performance: PerformanceCheck | null;
}

interface Issue {
  type: string;
  message: string;
  action?: string;
}

interface Analysis {
  issues: Issue[];
  warnings: Issue[];
  successes: Issue[];
  healthScore: number;
}

interface Recommendation {
  priority: 'high' | 'medium' | 'info';
  type: string;
  message: string;
  action: string;
}

interface Summary {
  healthScore: number;
  status: 'healthy' | 'warning' | 'critical';
  criticalIssues: number;
  warnings: number;
  message: string;
}

interface HealthCheckResult {
  success: boolean;
  timestamp: string;
  duration: number;
  checks: AllChecks;
  analysis: Analysis;
  recommendations: Recommendation[];
  summary: Summary;
  reportPaths?: unknown;
}

class ClaudeHealthWorker extends SidequestServer {
  claudeDir: string;
  devDir: string;
  healthScriptPath: string;
  thresholds: Thresholds;

  constructor(options: ClaudeHealthWorkerOptions = {}) {
    super({
      ...options,
      jobType: 'claude-health',
      maxConcurrent: options.maxConcurrent ?? 1, // Single concurrent health check
    });

    this.claudeDir = path.join(config.homeDir, '.claude');
    this.devDir = path.join(config.homeDir, 'dev');
    this.healthScriptPath = path.join(
      config.homeDir,
      'code/jobs/sidequest/claude-health-check.sh'
    );

    this.thresholds = {
      maxPlugins: 30,
      warnPlugins: 20,
      maxHookExecutionTime: TIMEOUTS.POLL_INTERVAL_MS, // Max hook execution time
      minDiskSpace: 1024 * 1024 * 100, // 100MB
      maxLogSize: 1024 * 1024 * 10 // 10MB
    };

    logger.info({
      claudeDir: this.claudeDir,
      healthScriptPath: this.healthScriptPath
    }, 'Claude Health Worker initialized');
  }

  /**
   * Run comprehensive health check job
   */
  async runJobHandler(job: Job): Promise<HealthCheckResult> {
    const startTime = Date.now();
    logStart(logger, 'Claude health check', { jobId: job.id });

    try {
      const checks = await this.runAllChecks((job.data as CheckOptions) ?? {});
      const analysis = this.analyzeResults(checks);
      const recommendations = this.generateRecommendations(analysis);

      const result: HealthCheckResult = {
        success: true,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        checks,
        analysis,
        recommendations,
        summary: this.generateSummary(analysis, recommendations)
      };

      logger.info({
        jobId: job.id,
        issueCount: recommendations.filter(r => r.priority === 'high').length,
        duration: result.duration
      }, 'Claude health check completed');

      // Generate HTML/JSON reports
      const endTime = Date.now();
      const reportPaths = await generateReport({
        jobId: job.id,
        jobType: 'claude-health',
        status: 'completed',
        result,
        startTime,
        endTime,
        parameters: job.data ?? {},
        metadata: {
          healthScore: analysis.healthScore,
          criticalIssues: recommendations.filter(r => r.priority === 'high').length,
          warnings: recommendations.filter(r => r.priority === 'medium').length
        }
      });

      result.reportPaths = reportPaths;
      logger.info({ reportPaths }, 'Health check reports generated');

      return result;
    } catch (error) {
      logError(logger, error as Error, 'Claude health check failed', { jobId: job.id });
      throw error;
    }
  }

  /**
   * Run all health checks
   */
  async runAllChecks(options: CheckOptions = {}): Promise<AllChecks> {
    // Run checks in parallel where possible
    const [
      environment,
      directories,
      configuration,
      hooks,
      components,
      plugins,
      performance
    ] = await Promise.all([
      this.checkEnvironment(),
      this.checkDirectories(),
      options.validateConfig !== false ? this.checkConfiguration() : null,
      this.checkHooks(),
      this.checkComponents(options.detailed),
      options.analyzePlugins !== false ? this.checkPlugins() : null,
      options.checkPerformance !== false ? this.checkPerformance() : null
    ]);

    return {
      environment,
      directories,
      configuration,
      hooks,
      components,
      plugins,
      performance
    };
  }

  /**
   * Check environment variables and dependencies
   */
  async checkEnvironment(): Promise<EnvironmentCheck> {
    const checks: EnvironmentCheck = {
      direnv: false,
      direnvConfigured: false,
      direnvAllowed: false,
      nodeVersion: null,
      npmVersion: null,
      envVars: {}
    };

    try {
      // Check direnv
      try {
        await execAsync('which direnv');
        checks.direnv = true;
      } catch {
        checks.direnv = false;
      }

      // Check if direnv hook is in shell config
      try {
        const { stdout } = await execAsync('grep -q "direnv hook" ~/.zshrc && echo "configured" || echo "not configured"');
        checks.direnvConfigured = stdout.trim() === 'configured';
      } catch {
        checks.direnvConfigured = false;
      }

      // Check Node.js version
      const { stdout: nodeVersion } = await execAsync('node --version');
      checks.nodeVersion = nodeVersion.trim();

      // Check npm version
      const { stdout: npmVersion } = await execAsync('npm --version');
      checks.npmVersion = npmVersion.trim();

      // Check critical environment variables
      const varNames = [
        'CLAUDE_CONFIG_DIR',
        'CLAUDE_PROJECT_DIR',
        'CLAUDE_ACTIVE_DOCS',
        'CLAUDE_HOOKS_DIR'
      ];

      for (const varName of varNames) {
        checks.envVars[varName] = process.env[varName] ?? null;
      }

      checks.direnvAllowed = Object.values(checks.envVars).every(v => v !== null);

    } catch (error) {
      logWarn(logger, error as Error, 'Error checking environment');
    }

    return checks;
  }

  /**
   * Check directory structure
   */
  async checkDirectories(): Promise<Record<string, DirectoryInfo>> {
    const requiredDirs: Record<string, string> = {
      '.claude': this.claudeDir,
      'skills': path.join(this.claudeDir, 'skills'),
      'hooks': path.join(this.claudeDir, 'hooks'),
      'agents': path.join(this.claudeDir, 'agents'),
      'commands': path.join(this.claudeDir, 'commands'),
      'scripts': path.join(this.claudeDir, 'scripts'),
      'logs': path.join(this.claudeDir, 'logs'),
      'dev': this.devDir,
      'dev/active': path.join(this.devDir, 'active'),
      'dev/archive': path.join(this.devDir, 'archive'),
      'dev/templates': path.join(this.devDir, 'templates')
    };

    const checks: Record<string, DirectoryInfo> = {};

    for (const [name, dirPath] of Object.entries(requiredDirs)) {
      try {
        const stats = await fs.stat(dirPath);
        checks[name] = {
          exists: stats.isDirectory(),
          path: dirPath,
          size: null
        };
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        checks[name] = {
          exists: false,
          path: dirPath,
          error: err.code
        };
      }
    }

    return checks;
  }

  /**
   * Check configuration files
   */
  async checkConfiguration(): Promise<ConfigCheck> {
    const checks: ConfigCheck = {
      settingsJson: {},
      skillRulesJson: {},
      packageJson: {},
      envrc: {}
    };

    // Check settings.json
    const settingsPath = path.join(this.claudeDir, 'settings.json');
    try {
      const data = await fs.readFile(settingsPath, 'utf-8');
      const settings = JSON.parse(data) as Record<string, unknown>;
      checks.settingsJson = {
        exists: true,
        valid: true,
        hooks: settings.hooks ? Object.keys(settings.hooks as Record<string, unknown>).length : 0,
        enabledPlugins: settings.enabledPlugins ? Object.keys(settings.enabledPlugins as Record<string, unknown>).length : 0
      };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      checks.settingsJson = {
        exists: err.code !== 'ENOENT',
        valid: false,
        error: err.message
      };
    }

    // Check skill-rules.json
    const skillRulesPath = path.join(this.claudeDir, 'skills', 'skill-rules.json');
    try {
      const data = await fs.readFile(skillRulesPath, 'utf-8');
      const skillRules = JSON.parse(data) as Record<string, unknown>;
      checks.skillRulesJson = {
        exists: true,
        valid: true,
        skillCount: skillRules.skills ? Object.keys(skillRules.skills as Record<string, unknown>).length : 0
      };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      checks.skillRulesJson = {
        exists: err.code !== 'ENOENT',
        valid: false,
        error: err.message
      };
    }

    // Check package.json
    const packagePath = path.join(this.claudeDir, 'package.json');
    try {
      const data = await fs.readFile(packagePath, 'utf-8');
      const pkg = JSON.parse(data) as Record<string, unknown>;
      checks.packageJson = {
        exists: true,
        valid: true,
        scripts: pkg.scripts ? Object.keys(pkg.scripts as Record<string, unknown>).length : 0
      };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      checks.packageJson = {
        exists: err.code !== 'ENOENT',
        valid: false,
        error: err.message
      };
    }

    // Check .envrc
    const envrcPath = path.join(this.claudeDir, '.envrc');
    try {
      await fs.access(envrcPath);
      checks.envrc = { exists: true };
    } catch {
      checks.envrc = { exists: false };
    }

    return checks;
  }

  /**
   * Check hooks
   */
  async checkHooks(): Promise<HooksCheck> {
    const hooksDir = path.join(this.claudeDir, 'hooks');
    const checks: HooksCheck = {
      totalHooks: 0,
      executableHooks: 0,
      registeredHooks: 0,
      hooks: []
    };

    try {
      const files = await fs.readdir(hooksDir);
      const shellHooks = files.filter(f => f.endsWith('.sh'));

      checks.totalHooks = shellHooks.length;

      for (const hook of shellHooks) {
        const hookPath = path.join(hooksDir, hook);
        const stats = await fs.stat(hookPath);
        const isExecutable = (stats.mode & 0o111) !== 0;

        if (isExecutable) checks.executableHooks++;

        checks.hooks.push({
          name: hook,
          executable: isExecutable,
          size: stats.size
        });
      }

      // Check registered hooks
      const settingsPath = path.join(this.claudeDir, 'settings.json');
      try {
        const data = await fs.readFile(settingsPath, 'utf-8');
        const settings = JSON.parse(data) as Record<string, unknown>;
        checks.registeredHooks = settings.hooks ? Object.keys(settings.hooks as Record<string, unknown>).length : 0;
      } catch (e) {
        logWarn(logger, e as Error, 'Could not check registered hooks');
      }

    } catch (error) {
      logWarn(logger, error as Error, 'Error checking hooks');
    }

    return checks;
  }

  /**
   * Check component counts
   */
  async checkComponents(detailed = false): Promise<ComponentCounts> {
    const counts: ComponentCounts = {
      skills: 0,
      agents: 0,
      commands: 0,
      activeTasks: 0,
      archivedTasks: 0,
      templates: 0
    };

    try {
      // Count skills
      const skillsDir = path.join(this.claudeDir, 'skills');
      const skillFiles = await fs.readdir(skillsDir);
      counts.skills = skillFiles.filter(f => f.endsWith('.md')).length;

      // Count agents
      const agentsDir = path.join(this.claudeDir, 'agents');
      const agentFiles = await fs.readdir(agentsDir);
      counts.agents = agentFiles.filter(f => f.endsWith('.md')).length;

      // Count commands
      const commandsDir = path.join(this.claudeDir, 'commands');
      const commandFiles = await fs.readdir(commandsDir);
      counts.commands = commandFiles.filter(f => f.endsWith('.md')).length;

      // Count active tasks
      const activeDir = path.join(this.devDir, 'active');
      try {
        const activeTasks = await fs.readdir(activeDir);
        counts.activeTasks = activeTasks.filter(f => !f.startsWith('.')).length;
      } catch {
        counts.activeTasks = 0;
      }

      // Count archived tasks
      const archiveDir = path.join(this.devDir, 'archive');
      try {
        const archivedTasks = await fs.readdir(archiveDir);
        counts.archivedTasks = archivedTasks.filter(f => !f.startsWith('.')).length;
      } catch {
        counts.archivedTasks = 0;
      }

      // Count templates
      const templatesDir = path.join(this.devDir, 'templates');
      try {
        const templates = await fs.readdir(templatesDir);
        counts.templates = templates.filter(f => f.endsWith('.md')).length;
      } catch {
        counts.templates = 0;
      }

    } catch (error) {
      logWarn(logger, error as Error, 'Error checking components');
    }

    return counts;
  }

  /**
   * Check plugins (integrate with plugin manager)
   */
  async checkPlugins(): Promise<PluginsCheck | null> {
    try {
      const settingsPath = path.join(this.claudeDir, 'settings.json');
      const data = await fs.readFile(settingsPath, 'utf-8');
      const settings = JSON.parse(data) as Record<string, unknown>;

      const enabledPlugins = (settings.enabledPlugins ?? {}) as Record<string, unknown>;
      const totalPlugins = Object.keys(enabledPlugins).length;

      // Basic duplicate detection (category-based)
      const categories: Record<string, string[]> = {};
      for (const plugin of Object.keys(enabledPlugins)) {
        const category = plugin.split(/[@-]/)[0];
        if (!categories[category]) categories[category] = [];
        categories[category].push(plugin);
      }

      const duplicateCategories: DuplicateCategory[] = Object.entries(categories)
        .filter(([, plugins]) => plugins.length > 1)
        .map(([category, plugins]) => ({ category, plugins, count: plugins.length }));

      return {
        totalPlugins,
        enabledPlugins: Object.keys(enabledPlugins),
        duplicateCategories,
        exceededThresholds: {
          maxPlugins: totalPlugins > this.thresholds.maxPlugins,
          warnPlugins: totalPlugins > this.thresholds.warnPlugins
        }
      };
    } catch (error) {
      logWarn(logger, error as Error, 'Error checking plugins');
      return null;
    }
  }

  /**
   * Check performance logs
   */
  async checkPerformance(): Promise<PerformanceCheck | null> {
    const perfLogPath = path.join(this.claudeDir, 'logs', 'hook-performance.log');

    try {
      const stats = await fs.stat(perfLogPath);
      const logSize = stats.size;

      // Read recent entries
      const data = await fs.readFile(perfLogPath, 'utf-8');
      const lines = data.split('\n').filter(l => l.trim());
      const recentEntries = lines.slice(-100); // Last 100 entries

      // Parse slow hooks
      const slowHooks: SlowHookDetail[] = recentEntries
        .filter(line => line.includes('SLOW'))
        .map(line => {
          const match = line.match(/\[([^\]]+)\].*?(\d+)ms/);
          return match ? { hook: match[1], duration: parseInt(match[2]) } : null;
        })
        .filter((entry): entry is SlowHookDetail => entry !== null);

      // Parse failures
      const failures = recentEntries.filter(line => line.includes('failed')).length;

      return {
        logExists: true,
        logSize,
        totalEntries: lines.length,
        recentEntries: recentEntries.length,
        slowHooks: slowHooks.length,
        failures,
        slowHookDetails: slowHooks.slice(0, 5) // Top 5 slowest
      };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return {
          logExists: false,
          message: 'Performance log not created yet'
        };
      }
      logWarn(logger, err, 'Error checking performance');
      return null;
    }
  }

  /**
   * Analyze health check results
   */
  analyzeResults(checks: AllChecks): Analysis {
    const issues: Issue[] = [];
    const warnings: Issue[] = [];
    const successes: Issue[] = [];

    // Environment analysis
    if (!checks.environment?.direnv) {
      warnings.push({ type: 'environment', message: 'direnv not installed' });
    } else if (!checks.environment?.direnvConfigured) {
      warnings.push({ type: 'environment', message: 'direnv hook not configured in shell' });
    } else if (!checks.environment?.direnvAllowed) {
      warnings.push({ type: 'environment', message: 'Environment variables not loaded (run: direnv allow)' });
    } else {
      successes.push({ type: 'environment', message: 'Environment properly configured' });
    }

    // Directory analysis
    const missingDirs = Object.entries(checks.directories ?? {})
      .filter(([, info]) => !info.exists)
      .map(([name]) => name);

    if (missingDirs.length > 0) {
      issues.push({ type: 'directories', message: `Missing directories: ${missingDirs.join(', ')}` });
    } else {
      successes.push({ type: 'directories', message: 'All required directories exist' });
    }

    // Configuration analysis
    if (!(checks.configuration?.settingsJson as Record<string, unknown>)?.valid) {
      issues.push({ type: 'configuration', message: 'settings.json is invalid or missing' });
    }
    if (!(checks.configuration?.skillRulesJson as Record<string, unknown>)?.valid) {
      issues.push({ type: 'configuration', message: 'skill-rules.json is invalid or missing' });
    }
    if ((checks.configuration?.settingsJson as Record<string, unknown>)?.valid && (checks.configuration?.skillRulesJson as Record<string, unknown>)?.valid) {
      successes.push({ type: 'configuration', message: 'Configuration files valid' });
    }

    // Hooks analysis
    const nonExecutableHooks = (checks.hooks?.totalHooks ?? 0) - (checks.hooks?.executableHooks ?? 0);
    if (nonExecutableHooks > 0) {
      issues.push({
        type: 'hooks',
        message: `${nonExecutableHooks} hook(s) not executable`,
        action: 'Run: chmod +x ~/.claude/hooks/*.sh'
      });
    }

    if ((checks.hooks?.registeredHooks ?? 0) === 0) {
      warnings.push({ type: 'hooks', message: 'No hooks registered in settings.json' });
    }

    // Plugin analysis
    if (checks.plugins?.exceededThresholds?.maxPlugins) {
      issues.push({
        type: 'plugins',
        message: `Too many plugins enabled (${checks.plugins.totalPlugins} > ${this.thresholds.maxPlugins})`,
        action: 'Review and disable unused plugins'
      });
    } else if (checks.plugins?.exceededThresholds?.warnPlugins) {
      warnings.push({
        type: 'plugins',
        message: `High plugin count (${checks.plugins.totalPlugins})`,
        action: 'Consider reviewing plugin usage'
      });
    }

    if ((checks.plugins?.duplicateCategories?.length ?? 0) > 0) {
      warnings.push({
        type: 'plugins',
        message: `Found ${checks.plugins!.duplicateCategories.length} categories with duplicate plugins`,
        action: 'Review and consolidate duplicate plugins'
      });
    }

    // Performance analysis
    if (checks.performance?.logExists) {
      if ((checks.performance.slowHooks ?? 0) > 0) {
        warnings.push({
          type: 'performance',
          message: `${checks.performance.slowHooks} slow hook executions detected`,
          action: 'Review hook performance'
        });
      }
      if ((checks.performance.failures ?? 0) > 0) {
        issues.push({
          type: 'performance',
          message: `${checks.performance.failures} hook failures detected`,
          action: 'Check hook logs for errors'
        });
      }
    }

    return {
      issues,
      warnings,
      successes,
      healthScore: this.calculateHealthScore(issues, warnings, successes)
    };
  }

  /**
   * Calculate overall health score (0-100)
   */
  calculateHealthScore(issues: Issue[], warnings: Issue[], successes: Issue[]): number {
    const totalChecks = issues.length + warnings.length + successes.length;
    if (totalChecks === 0) return 100;

    const issueWeight = 20;
    const warningWeight = 5;
    const successWeight = 10;

    const deductions = (issues.length * issueWeight) + (warnings.length * warningWeight);
    const additions = successes.length * successWeight;

    return Math.max(0, Math.min(100, 100 - deductions + (additions / totalChecks)));
  }

  /**
   * Generate recommendations
   */
  generateRecommendations(analysis: Analysis): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Critical issues first
    for (const issue of analysis.issues) {
      recommendations.push({
        priority: 'high',
        type: issue.type,
        message: issue.message,
        action: issue.action ?? 'Review and fix'
      });
    }

    // Warnings
    for (const warning of analysis.warnings) {
      recommendations.push({
        priority: 'medium',
        type: warning.type,
        message: warning.message,
        action: warning.action ?? 'Review recommended'
      });
    }

    // Success message if health score is high
    if (analysis.healthScore >= 90 && recommendations.length === 0) {
      recommendations.push({
        priority: 'info',
        type: 'healthy',
        message: `Claude environment is healthy (Score: ${analysis.healthScore}/100)`,
        action: 'No action needed'
      });
    }

    return recommendations;
  }

  /**
   * Generate summary
   */
  generateSummary(analysis: Analysis, recommendations: Recommendation[]): Summary {
    const critical = recommendations.filter(r => r.priority === 'high').length;
    const warningCount = recommendations.filter(r => r.priority === 'medium').length;

    return {
      healthScore: analysis.healthScore,
      status: analysis.healthScore >= 90 ? 'healthy' : analysis.healthScore >= 70 ? 'warning' : 'critical',
      criticalIssues: critical,
      warnings: warningCount,
      message: this.getStatusMessage(analysis.healthScore, critical, warningCount)
    };
  }

  /**
   * Get status message based on health score
   */
  getStatusMessage(healthScore: number, critical: number, warnings: number): string {
    if (healthScore >= 90 && critical === 0 && warnings === 0) {
      return 'Claude environment is healthy';
    } else if (healthScore >= 70) {
      return `Claude environment has ${warnings} warning(s)`;
    } else {
      return `Claude environment has ${critical} critical issue(s)`;
    }
  }

  /**
   * Create a health check job
   */
  addJob(options: CheckOptions = {}): Job {
    const jobId = `claude-health-${Date.now()}`;
    return this.createJob(jobId, {
      detailed: options.detailed ?? false,
      validateConfig: options.validateConfig !== false,
      checkPerformance: options.checkPerformance !== false,
      analyzePlugins: options.analyzePlugins !== false
    });
  }
}

// Export worker class
export { ClaudeHealthWorker };

// @ts-nocheck
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

import { SidequestServer } from './server.js';
import { config } from './config.js';
import { createComponentLogger } from './logger.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);
const logger = createComponentLogger('ClaudeHealth');

class ClaudeHealthWorker extends SidequestServer {
  constructor(options = {}) {
    super({
      maxConcurrent: options.maxConcurrent ?? 1, // Single concurrent health check
      ...options
    });

    this.claudeDir = path.join(process.env.HOME, '.claude');
    this.devDir = path.join(process.env.HOME, 'dev');
    this.healthScriptPath = path.join(
      process.env.HOME,
      'code/jobs/sidequest/claude-health-check.sh'
    );

    this.thresholds = {
      maxPlugins: 30,
      warnPlugins: 20,
      maxHookExecutionTime: 1000, // ms
      minDiskSpace: 1024 * 1024 * 100, // 100MB
      maxLogSize: 1024 * 1024 * 10 // 10MB
    };

    logger.info('Claude Health Worker initialized', {
      claudeDir: this.claudeDir,
      healthScriptPath: this.healthScriptPath
    });
  }

  /**
   * Run comprehensive health check job
   * @param {Object} job - Job configuration
   * @param {boolean} job.detailed - Include detailed component listing
   * @param {boolean} job.validateConfig - Run configuration validation
   * @param {boolean} job.checkPerformance - Analyze hook performance logs
   * @param {boolean} job.analyzePlugins - Run plugin duplicate detection
   * @returns {Promise<Object>} Health check results
   */
  async runJobHandler(job) {
    const startTime = Date.now();
    logger.info('Starting Claude health check', { jobId: job.id });

    try {
      const checks = await this.runAllChecks(job.data || {});
      const analysis = this.analyzeResults(checks);
      const recommendations = this.generateRecommendations(analysis);

      const result = {
        success: true,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        checks,
        analysis,
        recommendations,
        summary: this.generateSummary(analysis, recommendations)
      };

      logger.info('Claude health check completed', {
        jobId: job.id,
        issueCount: recommendations.filter(r => r.priority === 'high').length,
        duration: result.duration
      });

      return result;
    } catch (error) {
      logger.error({ err: error, jobId: job.id }, 'Claude health check failed');
      throw error;
    }
  }

  /**
   * Run all health checks
   * @param {Object} options - Check options
   * @returns {Promise<Object>} Check results
   */
  async runAllChecks(options = {}) {
    const checks = {};

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
   * @returns {Promise<Object>}
   */
  async checkEnvironment() {
    const checks = {
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
      } catch (e) {
        checks.direnv = false;
      }

      // Check if direnv hook is in shell config
      try {
        const { stdout } = await execAsync('grep -q "direnv hook" ~/.zshrc && echo "configured" || echo "not configured"');
        checks.direnvConfigured = stdout.trim() === 'configured';
      } catch (e) {
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
        checks.envVars[varName] = process.env[varName] || null;
      }

      checks.direnvAllowed = Object.values(checks.envVars).every(v => v !== null);

    } catch (error) {
      logger.warn({ err: error }, 'Error checking environment');
    }

    return checks;
  }

  /**
   * Check directory structure
   * @returns {Promise<Object>}
   */
  async checkDirectories() {
    const requiredDirs = {
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

    const checks = {};

    for (const [name, dirPath] of Object.entries(requiredDirs)) {
      try {
        const stats = await fs.stat(dirPath);
        checks[name] = {
          exists: stats.isDirectory(),
          path: dirPath,
          size: null
        };
      } catch (error) {
        checks[name] = {
          exists: false,
          path: dirPath,
          error: error.code
        };
      }
    }

    return checks;
  }

  /**
   * Check configuration files
   * @returns {Promise<Object>}
   */
  async checkConfiguration() {
    const checks = {
      settingsJson: {},
      skillRulesJson: {},
      packageJson: {},
      envrc: {}
    };

    // Check settings.json
    const settingsPath = path.join(this.claudeDir, 'settings.json');
    try {
      const data = await fs.readFile(settingsPath, 'utf-8');
      const settings = JSON.parse(data);
      checks.settingsJson = {
        exists: true,
        valid: true,
        hooks: settings.hooks ? Object.keys(settings.hooks).length : 0,
        enabledPlugins: settings.enabledPlugins ? Object.keys(settings.enabledPlugins).length : 0
      };
    } catch (error) {
      checks.settingsJson = {
        exists: error.code !== 'ENOENT',
        valid: false,
        error: error.message
      };
    }

    // Check skill-rules.json
    const skillRulesPath = path.join(this.claudeDir, 'skills', 'skill-rules.json');
    try {
      const data = await fs.readFile(skillRulesPath, 'utf-8');
      const skillRules = JSON.parse(data);
      checks.skillRulesJson = {
        exists: true,
        valid: true,
        skillCount: skillRules.skills ? Object.keys(skillRules.skills).length : 0
      };
    } catch (error) {
      checks.skillRulesJson = {
        exists: error.code !== 'ENOENT',
        valid: false,
        error: error.message
      };
    }

    // Check package.json
    const packagePath = path.join(this.claudeDir, 'package.json');
    try {
      const data = await fs.readFile(packagePath, 'utf-8');
      const pkg = JSON.parse(data);
      checks.packageJson = {
        exists: true,
        valid: true,
        scripts: pkg.scripts ? Object.keys(pkg.scripts).length : 0
      };
    } catch (error) {
      checks.packageJson = {
        exists: error.code !== 'ENOENT',
        valid: false,
        error: error.message
      };
    }

    // Check .envrc
    const envrcPath = path.join(this.claudeDir, '.envrc');
    try {
      await fs.access(envrcPath);
      checks.envrc = { exists: true };
    } catch (error) {
      checks.envrc = { exists: false };
    }

    return checks;
  }

  /**
   * Check hooks
   * @returns {Promise<Object>}
   */
  async checkHooks() {
    const hooksDir = path.join(this.claudeDir, 'hooks');
    const checks = {
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
        const settings = JSON.parse(data);
        checks.registeredHooks = settings.hooks ? Object.keys(settings.hooks).length : 0;
      } catch (e) {
        logger.warn({ err: e }, 'Could not check registered hooks');
      }

    } catch (error) {
      logger.warn({ err: error }, 'Error checking hooks');
    }

    return checks;
  }

  /**
   * Check component counts
   * @param {boolean} detailed - Include detailed listing
   * @returns {Promise<Object>}
   */
  async checkComponents(detailed = false) {
    const counts = {
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
      counts.skills = skillFiles.filter(f => f.endsWith('.md') || fs.stat(path.join(skillsDir, f)).then(s => s.isDirectory())).length;

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
      } catch (e) {
        counts.activeTasks = 0;
      }

      // Count archived tasks
      const archiveDir = path.join(this.devDir, 'archive');
      try {
        const archivedTasks = await fs.readdir(archiveDir);
        counts.archivedTasks = archivedTasks.filter(f => !f.startsWith('.')).length;
      } catch (e) {
        counts.archivedTasks = 0;
      }

      // Count templates
      const templatesDir = path.join(this.devDir, 'templates');
      try {
        const templates = await fs.readdir(templatesDir);
        counts.templates = templates.filter(f => f.endsWith('.md')).length;
      } catch (e) {
        counts.templates = 0;
      }

    } catch (error) {
      logger.warn({ err: error }, 'Error checking components');
    }

    return counts;
  }

  /**
   * Check plugins (integrate with plugin manager)
   * @returns {Promise<Object>}
   */
  async checkPlugins() {
    try {
      const settingsPath = path.join(this.claudeDir, 'settings.json');
      const data = await fs.readFile(settingsPath, 'utf-8');
      const settings = JSON.parse(data);

      const enabledPlugins = settings.enabledPlugins || {};
      const totalPlugins = Object.keys(enabledPlugins).length;

      // Basic duplicate detection (category-based)
      const categories = {};
      for (const plugin of Object.keys(enabledPlugins)) {
        const category = plugin.split(/[@-]/)[0];
        if (!categories[category]) categories[category] = [];
        categories[category].push(plugin);
      }

      const duplicateCategories = Object.entries(categories)
        .filter(([_, plugins]) => plugins.length > 1)
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
      logger.warn({ err: error }, 'Error checking plugins');
      return null;
    }
  }

  /**
   * Check performance logs
   * @returns {Promise<Object>}
   */
  async checkPerformance() {
    const perfLogPath = path.join(this.claudeDir, 'logs', 'hook-performance.log');

    try {
      const stats = await fs.stat(perfLogPath);
      const logSize = stats.size;

      // Read recent entries
      const data = await fs.readFile(perfLogPath, 'utf-8');
      const lines = data.split('\n').filter(l => l.trim());
      const recentEntries = lines.slice(-100); // Last 100 entries

      // Parse slow hooks
      const slowHooks = recentEntries
        .filter(line => line.includes('SLOW'))
        .map(line => {
          const match = line.match(/\[([^\]]+)\].*?(\d+)ms/);
          return match ? { hook: match[1], duration: parseInt(match[2]) } : null;
        })
        .filter(Boolean);

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
      if (error.code === 'ENOENT') {
        return {
          logExists: false,
          message: 'Performance log not created yet'
        };
      }
      logger.warn({ err: error }, 'Error checking performance');
      return null;
    }
  }

  /**
   * Analyze health check results
   * @param {Object} checks - All check results
   * @returns {Object} Analysis
   */
  analyzeResults(checks) {
    const issues = [];
    const warnings = [];
    const successes = [];

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
    const missingDirs = Object.entries(checks.directories || {})
      .filter(([_, info]) => !info.exists)
      .map(([name, _]) => name);

    if (missingDirs.length > 0) {
      issues.push({ type: 'directories', message: `Missing directories: ${missingDirs.join(', ')}` });
    } else {
      successes.push({ type: 'directories', message: 'All required directories exist' });
    }

    // Configuration analysis
    if (!checks.configuration?.settingsJson?.valid) {
      issues.push({ type: 'configuration', message: 'settings.json is invalid or missing' });
    }
    if (!checks.configuration?.skillRulesJson?.valid) {
      issues.push({ type: 'configuration', message: 'skill-rules.json is invalid or missing' });
    }
    if (checks.configuration?.settingsJson?.valid && checks.configuration?.skillRulesJson?.valid) {
      successes.push({ type: 'configuration', message: 'Configuration files valid' });
    }

    // Hooks analysis
    const nonExecutableHooks = (checks.hooks?.totalHooks || 0) - (checks.hooks?.executableHooks || 0);
    if (nonExecutableHooks > 0) {
      issues.push({
        type: 'hooks',
        message: `${nonExecutableHooks} hook(s) not executable`,
        action: 'Run: chmod +x ~/.claude/hooks/*.sh'
      });
    }

    if ((checks.hooks?.registeredHooks || 0) === 0) {
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

    if (checks.plugins?.duplicateCategories?.length > 0) {
      warnings.push({
        type: 'plugins',
        message: `Found ${checks.plugins.duplicateCategories.length} categories with duplicate plugins`,
        action: 'Review and consolidate duplicate plugins'
      });
    }

    // Performance analysis
    if (checks.performance?.logExists) {
      if (checks.performance.slowHooks > 0) {
        warnings.push({
          type: 'performance',
          message: `${checks.performance.slowHooks} slow hook executions detected`,
          action: 'Review hook performance'
        });
      }
      if (checks.performance.failures > 0) {
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
   * @param {Array} issues - Critical issues
   * @param {Array} warnings - Warnings
   * @param {Array} successes - Successful checks
   * @returns {number} Health score
   */
  calculateHealthScore(issues, warnings, successes) {
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
   * @param {Object} analysis - Analysis results
   * @returns {Array<Object>} Recommendations
   */
  generateRecommendations(analysis) {
    const recommendations = [];

    // Critical issues first
    for (const issue of analysis.issues) {
      recommendations.push({
        priority: 'high',
        type: issue.type,
        message: issue.message,
        action: issue.action || 'Review and fix'
      });
    }

    // Warnings
    for (const warning of analysis.warnings) {
      recommendations.push({
        priority: 'medium',
        type: warning.type,
        message: warning.message,
        action: warning.action || 'Review recommended'
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
   * @param {Object} analysis - Analysis results
   * @param {Array} recommendations - Recommendations
   * @returns {Object} Summary
   */
  generateSummary(analysis, recommendations) {
    const critical = recommendations.filter(r => r.priority === 'high').length;
    const warnings = recommendations.filter(r => r.priority === 'medium').length;

    return {
      healthScore: analysis.healthScore,
      status: analysis.healthScore >= 90 ? 'healthy' : analysis.healthScore >= 70 ? 'warning' : 'critical',
      criticalIssues: critical,
      warnings,
      message: this.getStatusMessage(analysis.healthScore, critical, warnings)
    };
  }

  /**
   * Get status message based on health score
   * @param {number} healthScore - Health score
   * @param {number} critical - Critical issue count
   * @param {number} warnings - Warning count
   * @returns {string} Status message
   */
  getStatusMessage(healthScore, critical, warnings) {
    if (healthScore >= 90 && critical === 0 && warnings === 0) {
      return '✅ Claude environment is healthy';
    } else if (healthScore >= 70) {
      return `⚠️  Claude environment has ${warnings} warning(s)`;
    } else {
      return `🔴 Claude environment has ${critical} critical issue(s)`;
    }
  }

  /**
   * Create a health check job
   * @param {Object} options - Job options
   * @returns {Object} Created job
   */
  addJob(options = {}) {
    const jobId = `claude-health-${Date.now()}`;
    return this.createJob(jobId, {
      detailed: options.detailed || false,
      validateConfig: options.validateConfig !== false,
      checkPerformance: options.checkPerformance !== false,
      analyzePlugins: options.analyzePlugins !== false
    });
  }
}

// Export worker class
export { ClaudeHealthWorker };

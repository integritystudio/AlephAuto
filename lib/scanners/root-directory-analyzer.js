/**
 * Root Directory Analyzer for AlephAuto
 *
 * Analyzes project root directories for organization issues:
 * - Too many files in root
 * - Misplaced configuration files
 * - Database files in root
 * - Scripts that should be in scripts/
 * - Library code in root
 *
 * Generates cleanup recommendations with zero import breakage.
 *
 * Based on debugging session: AnalyticsBot root directory cleanup
 *
 * @module lib/scanners/root-directory-analyzer
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';

/**
 * Root Directory Analyzer
 *
 * Scans project root directories and identifies cleanup opportunities.
 */
export class RootDirectoryAnalyzer {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.maxRootFiles = options.maxRootFiles || 20;
    this.thresholds = {
      pythonFiles: 3,
      shellScripts: 3,
      jsFiles: 3,
      configFiles: 5,
      dataFiles: 0 // No data files in root
    };
  }

  /**
   * Analyze repository root directory
   *
   * @param {string} repoPath - Absolute path to repository
   * @param {object} options - Analysis options
   * @returns {Promise<object>} Analysis results with recommendations
   */
  async analyze(repoPath, options = {}) {
    const startTime = Date.now();

    this.logger.info(`[RootDirectoryAnalyzer] Starting analysis: ${repoPath}`);

    try {
      // Get all files in root
      const rootFiles = await this.getRootFiles(repoPath);

      // Categorize files
      const categorized = this.categorizeFiles(rootFiles);

      // Analyze import dependencies
      const dependencies = await this.analyzeImportDependencies(repoPath, categorized);

      // Generate recommendations
      const recommendations = this.generateRecommendations(categorized, dependencies);

      // Calculate statistics
      const statistics = {
        total_root_files: rootFiles.length,
        reduction_potential: recommendations.reduce((sum, r) => sum + r.files.length, 0),
        final_root_files: rootFiles.length - recommendations.reduce((sum, r) => sum + r.files.length, 0),
        reduction_percentage: Math.round(
          (recommendations.reduce((sum, r) => sum + r.files.length, 0) / rootFiles.length) * 100
        ),
        scan_duration_ms: Date.now() - startTime
      };

      const result = {
        root_files: rootFiles,
        categorized,
        dependencies,
        recommendations,
        statistics
      };

      this.logger.info(
        `[RootDirectoryAnalyzer] Analysis complete: ${rootFiles.length} files, ${statistics.reduction_potential} can be moved (${statistics.reduction_percentage}% reduction)`
      );

      return result;
    } catch (error) {
      this.logger.error(`[RootDirectoryAnalyzer] Analysis failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all files in root directory (depth 1)
   */
  async getRootFiles(repoPath) {
    const entries = await fs.readdir(repoPath, { withFileTypes: true });

    return entries
      .filter(entry => entry.isFile() && !entry.name.startsWith('.'))
      .map(entry => ({
        name: entry.name,
        path: path.join(repoPath, entry.name),
        extension: path.extname(entry.name)
      }));
  }

  /**
   * Categorize files by type
   */
  categorizeFiles(files) {
    const categories = {
      python: [],
      shell: [],
      javascript: [],
      typescript: [],
      config: [],
      data: [],
      documentation: [],
      packageManager: [],
      deployment: [],
      other: []
    };

    const extensionMap = {
      '.py': 'python',
      '.sh': 'shell',
      '.bash': 'shell',
      '.js': 'javascript',
      '.mjs': 'javascript',
      '.cjs': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.json': 'config',
      '.yml': 'config',
      '.yaml': 'config',
      '.toml': 'config',
      '.ini': 'config',
      '.db': 'data',
      '.sqlite': 'data',
      '.sqlite3': 'data',
      '.md': 'documentation',
      '.txt': 'documentation'
    };

    const packageFiles = [
      'package.json',
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      'requirements.txt',
      'Pipfile',
      'Pipfile.lock',
      'pyproject.toml',
      'poetry.lock',
      'Cargo.toml',
      'Cargo.lock',
      'go.mod',
      'go.sum'
    ];

    const deploymentFiles = [
      'Dockerfile',
      'docker-compose.yml',
      'docker-compose.yaml',
      'render.yaml',
      'vercel.json',
      'netlify.toml',
      'Procfile',
      'doppler.yaml',
      '.env.example'
    ];

    for (const file of files) {
      // Special cases
      if (packageFiles.includes(file.name)) {
        categories.packageManager.push(file);
      } else if (deploymentFiles.includes(file.name)) {
        categories.deployment.push(file);
      } else {
        // Categorize by extension
        const category = extensionMap[file.extension] || 'other';
        categories[category].push(file);
      }
    }

    return categories;
  }

  /**
   * Analyze import dependencies for Python files
   */
  async analyzeImportDependencies(repoPath, categorized) {
    const dependencies = {
      python: {},
      javascript: {}
    };

    // Analyze Python imports
    for (const file of categorized.python) {
      const imports = await this.analyzePythonImports(file.path, repoPath);
      dependencies.python[file.name] = {
        imports_from_root: imports.fromRoot,
        imported_by: [],
        can_move: imports.fromRoot.length === 0
      };
    }

    // Build reverse dependency graph (who imports this file)
    for (const [fileName, data] of Object.entries(dependencies.python)) {
      for (const imported of data.imports_from_root) {
        const importedFile = imported.replace(/^from /, '').replace(/ import.*/, '') + '.py';
        if (dependencies.python[importedFile]) {
          dependencies.python[importedFile].imported_by.push(fileName);
        }
      }
    }

    return dependencies;
  }

  /**
   * Analyze Python imports in a file
   */
  async analyzePythonImports(filePath, repoPath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      const imports = {
        fromRoot: [],
        fromPackages: [],
        relative: []
      };

      for (const line of lines) {
        const trimmed = line.trim();

        // Match: from module import ...
        const fromMatch = trimmed.match(/^from\s+([^\s]+)\s+import/);
        if (fromMatch) {
          const module = fromMatch[1];

          if (module.startsWith('.')) {
            imports.relative.push(trimmed);
          } else if (!module.includes('.') && this.isLocalModule(module, repoPath)) {
            imports.fromRoot.push(trimmed);
          } else {
            imports.fromPackages.push(trimmed);
          }
        }

        // Match: import module
        const importMatch = trimmed.match(/^import\s+([^\s]+)/);
        if (importMatch) {
          const module = importMatch[1];

          if (this.isLocalModule(module, repoPath)) {
            imports.fromRoot.push(trimmed);
          } else {
            imports.fromPackages.push(trimmed);
          }
        }
      }

      return imports;
    } catch {
      return { fromRoot: [], fromPackages: [], relative: [] };
    }
  }

  /**
   * Check if module is local (exists as .py file in root)
   */
  isLocalModule(moduleName, repoPath) {
    const filePath = path.join(repoPath, `${moduleName}.py`);
    try {
      fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate cleanup recommendations
   */
  generateRecommendations(categorized, dependencies) {
    const recommendations = [];

    // Recommendation 1: Move Python library files to lib/
    const pythonLibFiles = categorized.python.filter(f => {
      const baseName = f.name.replace('.py', '');
      const dep = dependencies.python[f.name];

      // Identify as library if:
      // - Has "lib", "utils", "helper", "middleware", "config" in name
      // - Is imported by other root files
      // - Is not a main entry point (server, app, main)
      const isLibrary =
        /(lib|util|helper|middleware|config|auth|rate|sentry)/.test(baseName) ||
        (dep && dep.imported_by.length > 0);

      const isEntryPoint = /(server|app|main|run|start)/.test(baseName);

      return isLibrary && !isEntryPoint;
    });

    if (pythonLibFiles.length > 0) {
      recommendations.push({
        id: 'move_python_lib',
        title: 'Move Python Library Files to lib/',
        description: 'Move shared Python modules to lib/ directory for better organization',
        files: pythonLibFiles,
        target_directory: 'lib',
        impact: 'medium',
        requires_import_updates: true,
        import_changes: this.calculateImportChanges(pythonLibFiles, 'lib', dependencies),
        commands: this.generateMoveCommands(pythonLibFiles, 'lib')
      });
    }

    // Recommendation 2: Move scripts to scripts/
    const scriptFiles = [
      ...categorized.python.filter(f => {
        const baseName = f.name.replace('.py', '');
        return /(migrate|configure|inject|setup|test|script)/.test(baseName);
      }),
      ...categorized.shell
    ];

    if (scriptFiles.length > 0) {
      recommendations.push({
        id: 'move_scripts',
        title: 'Move Scripts to scripts/',
        description: 'Move utility scripts and shell scripts to scripts/ directory',
        files: scriptFiles,
        target_directory: 'scripts',
        impact: 'low',
        requires_import_updates: false,
        commands: this.generateMoveCommands(scriptFiles, 'scripts')
      });
    }

    // Recommendation 3: Move data files to data/
    if (categorized.data.length > 0) {
      recommendations.push({
        id: 'move_data',
        title: 'Move Data Files to data/',
        description: 'Move database and data files to data/ directory',
        files: categorized.data,
        target_directory: 'data',
        impact: 'medium',
        requires_import_updates: true,
        path_updates_required: 'Update hardcoded paths to data files',
        commands: this.generateMoveCommands(categorized.data, 'data')
      });
    }

    // Recommendation 4: Move config files to config/
    const movableConfigs = categorized.config.filter(f =>
      !['package.json', 'package-lock.json', 'tsconfig.json'].includes(f.name)
    );

    if (movableConfigs.length > this.thresholds.configFiles) {
      recommendations.push({
        id: 'move_configs',
        title: 'Move Configuration Files to config/',
        description: 'Move project-specific config files to config/ directory',
        files: movableConfigs,
        target_directory: 'config',
        impact: 'medium',
        requires_import_updates: true,
        path_updates_required: 'Update config file path references in code',
        commands: this.generateMoveCommands(movableConfigs, 'config')
      });
    }

    // Recommendation 5: Remove temporary/generated files
    const tempFiles = categorized.other.filter(f =>
      f.name.includes('repomix-output') ||
      f.name.endsWith('.log') ||
      f.name.endsWith('.tmp')
    );

    if (tempFiles.length > 0) {
      recommendations.push({
        id: 'remove_temp',
        title: 'Remove or Move Temporary Files',
        description: 'Remove generated files or add to .gitignore',
        files: tempFiles,
        target_directory: 'docs (or delete)',
        impact: 'low',
        requires_import_updates: false,
        commands: tempFiles.map(f => `mv ${f.name} docs/ # or add to .gitignore`)
      });
    }

    return recommendations;
  }

  /**
   * Calculate import changes needed for moving files
   */
  calculateImportChanges(files, targetDir, dependencies) {
    const changes = [];

    for (const file of files) {
      const dep = dependencies.python[file.name];
      if (!dep) continue;

      // Files that import this module need updating
      for (const importer of dep.imported_by) {
        const baseName = file.name.replace('.py', '');
        changes.push({
          file: importer,
          old_import: `from ${baseName} import`,
          new_import: `from ${targetDir}.${baseName} import`
        });
      }

      // This module's imports from other root files need updating
      for (const imported of dep.imports_from_root) {
        const match = imported.match(/from\s+([^\s]+)/);
        if (match) {
          const module = match[1];
          changes.push({
            file: file.name,
            old_import: `from ${module}`,
            new_import: `from ${targetDir}.${module}`
          });
        }
      }
    }

    return changes;
  }

  /**
   * Generate move commands
   */
  generateMoveCommands(files, targetDir) {
    return files.map(f => `git mv ${f.name} ${targetDir}/`);
  }

  /**
   * Generate markdown report
   */
  generateReport(analysis) {
    const lines = [
      '# Root Directory Cleanup Analysis',
      '',
      `**Generated:** ${new Date().toISOString()}`,
      `**Total Root Files:** ${analysis.statistics.total_root_files}`,
      `**Reduction Potential:** ${analysis.statistics.reduction_potential} files (${analysis.statistics.reduction_percentage}%)`,
      `**Final Root Files:** ${analysis.statistics.final_root_files}`,
      '',
      '## Current State',
      '',
      '### Files by Category',
      ''
    ];

    // Category breakdown
    Object.entries(analysis.categorized).forEach(([category, files]) => {
      if (files.length > 0) {
        lines.push(`**${category}:** ${files.length} files`);
        files.forEach(f => lines.push(`  - ${f.name}`));
        lines.push('');
      }
    });

    lines.push('## Recommendations', '');

    // Recommendations
    analysis.recommendations.forEach((rec, i) => {
      lines.push(
        `### ${i + 1}. ${rec.title}`,
        '',
        `**Files to Move:** ${rec.files.length}`,
        `**Target:** \`${rec.target_directory}/\``,
        `**Impact:** ${rec.impact}`,
        `**Requires Import Updates:** ${rec.requires_import_updates ? 'Yes' : 'No'}`,
        ''
      );

      if (rec.import_changes && rec.import_changes.length > 0) {
        lines.push('**Import Changes Required:**', '');
        rec.import_changes.slice(0, 5).forEach(change => {
          lines.push(`- \`${change.file}\`: \`${change.old_import}\` → \`${change.new_import}\``);
        });
        if (rec.import_changes.length > 5) {
          lines.push(`- ... and ${rec.import_changes.length - 5} more`);
        }
        lines.push('');
      }

      lines.push('**Commands:**', '```bash');
      lines.push(`mkdir -p ${rec.target_directory}`);
      rec.commands.slice(0, 10).forEach(cmd => lines.push(cmd));
      if (rec.commands.length > 10) {
        lines.push(`# ... and ${rec.commands.length - 10} more files`);
      }
      lines.push('```', '');
    });

    lines.push(
      '## Implementation Steps',
      '',
      '1. Create backup branch: `git checkout -b cleanup/root-directory`',
      '2. Run tests to establish baseline',
      '3. Execute recommendations in order',
      '4. Update imports after each phase',
      '5. Test after each phase',
      '6. Commit incrementally',
      ''
    );

    return lines.join('\n');
  }
}

/**
 * Export analyzer instance creator
 */
export function createRootDirectoryAnalyzer(options) {
  return new RootDirectoryAnalyzer(options);
}

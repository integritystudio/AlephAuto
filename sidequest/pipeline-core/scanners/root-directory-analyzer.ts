import * as fs from 'fs/promises';
import * as path from 'path';

// ============================================================================
// Type Definitions
// ============================================================================

export interface RootDirectoryAnalyzerOptions {
  logger?: Pick<Console, 'info' | 'error'>;
  maxRootFiles?: number;
}

export interface AnalyzeOptions {
  [key: string]: unknown;
}

export interface RootFile {
  name: string;
  path: string;
  extension: string;
}

export interface CategorizedFiles {
  python: RootFile[];
  shell: RootFile[];
  javascript: RootFile[];
  typescript: RootFile[];
  config: RootFile[];
  data: RootFile[];
  documentation: RootFile[];
  packageManager: RootFile[];
  deployment: RootFile[];
  other: RootFile[];
}

export interface PythonDependencyInfo {
  imports_from_root: string[];
  imported_by: string[];
  can_move: boolean;
}

export interface PythonImports {
  fromRoot: string[];
  fromPackages: string[];
  relative: string[];
}

export interface Dependencies {
  python: Record<string, PythonDependencyInfo>;
  javascript: Record<string, unknown>;
}

export interface ImportChange {
  file: string;
  old_import: string;
  new_import: string;
}

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  files: RootFile[];
  target_directory: string;
  impact: 'low' | 'medium' | 'high';
  requires_import_updates: boolean;
  import_changes?: ImportChange[];
  commands: string[];
  path_updates_required?: string;
}

export interface AnalysisStatistics {
  total_root_files: number;
  reduction_potential: number;
  final_root_files: number;
  reduction_percentage: number;
  scan_duration_ms: number;
}

export interface RootDirectoryAnalysis {
  root_files: RootFile[];
  categorized: CategorizedFiles;
  dependencies: Dependencies;
  recommendations: Recommendation[];
  statistics: AnalysisStatistics;
}

type FileCategoryKey = keyof CategorizedFiles;

// ============================================================================
// RootDirectoryAnalyzer Class
// ============================================================================

/**
 * Root Directory Analyzer
 *
 * Scans project root directories and identifies cleanup opportunities.
 */
export class RootDirectoryAnalyzer {
  private readonly logger: Pick<Console, 'info' | 'error'>;
  private readonly maxRootFiles: number;
  private readonly thresholds: {
    pythonFiles: number;
    shellScripts: number;
    jsFiles: number;
    configFiles: number;
    dataFiles: number;
  };

    /**
   * Constructor.
   *
   * @param {RootDirectoryAnalyzerOptions} [options={}] - Options dictionary
   */
  constructor(options: RootDirectoryAnalyzerOptions = {}) {
    this.logger = options.logger ?? console;
    this.maxRootFiles = options.maxRootFiles ?? 20;
    this.thresholds = {
      pythonFiles: 3,
      shellScripts: 3,
      jsFiles: 3,
      configFiles: 5,
      dataFiles: 0 // No data files in root
    };
  }

    /**
   * Analyze.
   *
   * @param {string} repoPath - The repoPath
   * @param {AnalyzeOptions} [_options={}] - Configuration for 
   *
   * @returns {Promise<RootDirectoryAnalysis>} The Promise<RootDirectoryAnalysis>
   * @async
   */
  async analyze(repoPath: string, _options: AnalyzeOptions = {}): Promise<RootDirectoryAnalysis> {
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
      const reductionPotential = recommendations.reduce((sum, r) => sum + r.files.length, 0);
      const statistics: AnalysisStatistics = {
        total_root_files: rootFiles.length,
        reduction_potential: reductionPotential,
        final_root_files: rootFiles.length - reductionPotential,
        reduction_percentage: rootFiles.length > 0
          ? Math.round((reductionPotential / rootFiles.length) * 100)
          : 0,
        scan_duration_ms: Date.now() - startTime
      };

      const result: RootDirectoryAnalysis = {
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
      this.logger.error(`[RootDirectoryAnalyzer] Analysis failed: ${(error as Error).message}`);
      throw error;
    }
  }

    /**
   * Get the root files.
   *
   * @param {string} repoPath - The repoPath
   *
   * @returns {Promise<RootFile[]>} The root files
   * @async
   */
  async getRootFiles(repoPath: string): Promise<RootFile[]> {
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
   * Categorize files.
   *
   * @param {RootFile[]} files - The files
   *
   * @returns {CategorizedFiles} The CategorizedFiles
   */
  categorizeFiles(files: RootFile[]): CategorizedFiles {
    const categories: CategorizedFiles = {
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

    const extensionMap: Record<string, FileCategoryKey> = {
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

    const packageFiles = new Set([
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
    ]);

    const deploymentFiles = new Set([
      'Dockerfile',
      'docker-compose.yml',
      'docker-compose.yaml',
      'render.yaml',
      'vercel.json',
      'netlify.toml',
      'Procfile',
      'doppler.yaml',
      '.env.example'
    ]);

    for (const file of files) {
      // Special cases
      if (packageFiles.has(file.name)) {
        categories.packageManager.push(file);
      } else if (deploymentFiles.has(file.name)) {
        categories.deployment.push(file);
      } else {
        // Categorize by extension
        const category: FileCategoryKey = extensionMap[file.extension] ?? 'other';
        categories[category].push(file);
      }
    }

    return categories;
  }

    /**
   * Analyze import dependencies.
   *
   * @param {string} repoPath - The repoPath
   * @param {CategorizedFiles} categorized - The categorized
   *
   * @returns {Promise<Dependencies>} The Promise<Dependencies>
   * @async
   */
  async analyzeImportDependencies(repoPath: string, categorized: CategorizedFiles): Promise<Dependencies> {
    const dependencies: Dependencies = {
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
   * Analyze python imports.
   *
   * @param {string} filePath - The filePath
   * @param {string} repoPath - The repoPath
   *
   * @returns {Promise<PythonImports>} The Promise<PythonImports>
   * @async
   */
  async analyzePythonImports(filePath: string, repoPath: string): Promise<PythonImports> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      const imports: PythonImports = {
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
   * Check if local module.
   *
   * @param {string} moduleName - The moduleName
   * @param {string} repoPath - The repoPath
   *
   * @returns {boolean} True if local module, False otherwise
   */
  isLocalModule(moduleName: string, repoPath: string): boolean {
    const filePath = path.join(repoPath, `${moduleName}.py`);
    try {
      // Note: intentionally sync-like check via fire-and-forget (matches original behavior)
      fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

    /**
   * Generate the recommendations.
   *
   * @param {CategorizedFiles} categorized - The categorized
   * @param {Dependencies} dependencies - The dependencies
   *
   * @returns {Recommendation[]} The created recommendations
   */
  generateRecommendations(categorized: CategorizedFiles, dependencies: Dependencies): Recommendation[] {
    const recommendations: Recommendation[] = [];

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
        (dep !== undefined && dep.imported_by.length > 0);

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
    const scriptFiles: RootFile[] = [
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
   * Calculate import changes.
   *
   * @param {RootFile[]} files - The files
   * @param {string} targetDir - The targetDir
   * @param {Dependencies} dependencies - The dependencies
   *
   * @returns {ImportChange[]} The calculated import changes
   */
  calculateImportChanges(files: RootFile[], targetDir: string, dependencies: Dependencies): ImportChange[] {
    const changes: ImportChange[] = [];

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
   * Generate the move commands.
   *
   * @param {RootFile[]} files - The files
   * @param {string} targetDir - The targetDir
   *
   * @returns {string[]} The created move commands
   */
  generateMoveCommands(files: RootFile[], targetDir: string): string[] {
    return files.map(f => `git mv ${f.name} ${targetDir}/`);
  }

    /**
   * Generate the report.
   *
   * @param {RootDirectoryAnalysis} analysis - The analysis
   *
   * @returns {string} The created report
   */
  generateReport(analysis: RootDirectoryAnalysis): string {
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
    for (const [category, files] of Object.entries(analysis.categorized)) {
      if (files.length > 0) {
        lines.push(`**${category}:** ${files.length} files`);
        for (const f of files) {
          lines.push(`  - ${f.name}`);
        }
        lines.push('');
      }
    }

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
          lines.push(`- \`${change.file}\`: \`${change.old_import}\` -> \`${change.new_import}\``);
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

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create the root directory analyzer.
 *
 * @param {RootDirectoryAnalyzerOptions} options? - The options?
 *
 * @returns {RootDirectoryAnalyzer} The created root directory analyzer
 */
export function createRootDirectoryAnalyzer(options?: RootDirectoryAnalyzerOptions): RootDirectoryAnalyzer {
  return new RootDirectoryAnalyzer(options);
}

/**
 * Scan Orchestrator - TypeScript version
 *
 * Coordinates the entire duplicate detection pipeline:
 * 1. Repository scanning (repomix)
 * 2. Pattern detection (ast-grep)
 * 3. Code block extraction (Python/pydantic)
 * 4. Semantic annotation (Python)
 * 5. Duplicate grouping (Python)
 * 6. Suggestion generation (Python)
 * 7. Report generation (Python)
 */

import { RepositoryScanner } from './scanners/repository-scanner.js';
import { AstGrepPatternDetector } from './scanners/ast-grep-detector.js';
import { HTMLReportGenerator } from './reports/html-report-generator.js';
import { MarkdownReportGenerator } from './reports/markdown-report-generator.js';
import { InterProjectScanner } from './inter-project-scanner.js';
import { createComponentLogger } from '../utils/logger.js';
import { DependencyValidator } from '../utils/dependency-validator.js';
import { spawn, ChildProcess, execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as Sentry from '@sentry/node';

const logger = createComponentLogger('ScanOrchestrator');

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Repository information from scanner
 */
export interface RepositoryInfo {
  path: string;
  name: string;
  gitRemote?: string;
  gitBranch?: string;
  gitCommit?: string;
  totalFiles: number;
  totalLines: number;
  languages: string[];
}

/**
 * Pattern match from ast-grep
 */
export interface PatternMatch {
  file_path: string;
  rule_id: string;
  matched_text: string;
  line_start: number;
  line_end: number;
  column_start?: number;
  column_end?: number;
  severity?: string;
  confidence?: number;
}

/**
 * Scan configuration options
 */
export interface ScanConfig {
  scan_config?: {
    includeTests?: boolean;
    maxDepth?: number;
    excludePaths?: string[];
    [key: string]: any;
  };
  pattern_config?: {
    rulesDirectory?: string;
    configPath?: string;
    [key: string]: any;
  };
  generateReports?: boolean;
  [key: string]: any;
}

/**
 * Python pipeline input data structure
 */
export interface PythonPipelineInput {
  repository_info: RepositoryInfo;
  pattern_matches: PatternMatch[];
  scan_config: ScanConfig;
}

/**
 * Code block from Python pipeline
 */
export interface CodeBlock {
  block_id: string;
  file_path: string;
  line_start: number;
  line_end: number;
  source_code: string;
  language: string;
  semantic_category?: string;
  tags: string[];
  complexity_metrics?: {
    cyclomatic: number;
    cognitive: number;
    halstead: Record<string, number>;
  };
}

/**
 * Duplicate group from Python pipeline
 */
export interface DuplicateGroup {
  group_id: string;
  block_ids: string[];
  similarity_score: number;
  group_type: 'exact' | 'structural' | 'semantic';
  total_lines: number;
  potential_reduction: number;
  impact_score?: number;
}

/**
 * Consolidation suggestion from Python pipeline
 */
export interface ConsolidationSuggestion {
  suggestion_id: string;
  group_id: string;
  suggestion_type: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  estimated_effort: 'minimal' | 'low' | 'medium' | 'high';
  potential_reduction: number;
  implementation_notes?: string;
  migration_steps?: Array<{
    order: number;
    description: string;
    code_snippet?: string;
  }>;
}

/**
 * Scan metrics from Python pipeline
 */
export interface ScanMetrics {
  total_code_blocks: number;
  code_blocks_by_category?: Record<string, number>;
  code_blocks_by_language?: Record<string, number>;
  total_duplicate_groups: number;
  exact_duplicates: number;
  structural_duplicates: number;
  semantic_duplicates: number;
  total_duplicated_lines: number;
  potential_loc_reduction: number;
  duplication_percentage: number;
  total_suggestions: number;
  quick_wins?: number;
  high_priority_suggestions?: number;
}

/**
 * Python pipeline output structure
 */
export interface PythonPipelineOutput {
  code_blocks: CodeBlock[];
  duplicate_groups: DuplicateGroup[];
  suggestions: ConsolidationSuggestion[];
  metrics: ScanMetrics;
  repository_info: RepositoryInfo;
  scan_type?: 'single-project' | 'inter-project';
  error?: string;
  warnings?: string[];
}

/**
 * Scan result with metadata
 */
export interface ScanResult extends PythonPipelineOutput {
  scan_metadata: {
    duration_seconds: number;
    scanned_at: string;
    repository_path: string;
  };
  report_paths?: ReportPaths;
}

/**
 * Report generation paths
 */
export interface ReportPaths {
  html?: string;
  markdown?: string;
  summary?: string;
  json?: string;
}

/**
 * Report generation options
 */
export interface ReportOptions {
  outputDir?: string;
  baseName?: string;
  title?: string;
  html?: boolean;
  markdown?: boolean;
  summary?: boolean;
  json?: boolean;
  includeDetails?: boolean;
  maxDuplicates?: number;
  maxSuggestions?: number;
}

/**
 * Scan orchestrator constructor options
 */
export interface ScanOrchestratorOptions {
  scanner?: Record<string, any>;
  detector?: Record<string, any>;
  pythonPath?: string;
  extractorScript?: string;
  reports?: ReportOptions;
  outputDir?: string;
  autoGenerateReports?: boolean;
  config?: Record<string, any>;
}

/**
 * Cross-repository duplicate group
 */
export interface CrossRepositoryDuplicate {
  group_id: string;
  pattern_id: string;
  content_hash: string;
  member_blocks: CodeBlock[];
  occurrence_count: number;
  repository_count: number;
  affected_repositories: string[];
  affected_files: string[];
  category: string;
  language: string;
  total_lines: number;
  similarity_score: number;
  similarity_method: string;
  impact_score: number;
}

/**
 * Cross-repository consolidation suggestion
 */
export interface CrossRepositorySuggestion {
  suggestion_id: string;
  group_id: string;
  suggestion_type: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  estimated_effort: 'minimal' | 'low' | 'medium' | 'high';
  potential_reduction: number;
  affected_repositories: string[];
  implementation_notes?: string;
  migration_steps?: Array<{
    order: number;
    description: string;
    code_snippet?: string;
  }>;
}

/**
 * Multi-repository scan result
 */
export interface MultiRepositoryScanResult {
  repositories: Array<ScanResult | { error: string; repository_path: string }>;
  total_scanned: number;
  successful: number;
  failed: number;
  cross_repository_duplicates?: CrossRepositoryDuplicate[];
  cross_repository_suggestions?: CrossRepositorySuggestion[];
  scan_type?: 'single-project' | 'inter-project';
  metrics?: ScanMetrics & {
    total_cross_repository_groups?: number;
    cross_repository_occurrences?: number;
    cross_repository_duplicated_lines?: number;
  };
}

/**
 * Repository scan output from RepositoryScanner
 */
interface RepositoryScanOutput {
  repository_info: RepositoryInfo;
  metadata?: {
    totalFiles: number;
    totalLines: number;
    languages: string[];
  };
  repomix_output?: any;
}

/**
 * Pattern detection output from AstGrepPatternDetector
 */
interface PatternDetectionOutput {
  matches: PatternMatch[];
  statistics: {
    total_matches: number;
    rules_applied: number;
    files_scanned: number;
    scan_duration_ms: number;
  };
}

// ============================================================================
// Main ScanOrchestrator Class
// ============================================================================

/**
 * Scan Orchestrator - Coordinates the duplicate detection pipeline
 */
export class ScanOrchestrator {
  private readonly repositoryScanner: RepositoryScanner;
  private readonly patternDetector: AstGrepPatternDetector;
  private pythonPath: string | null;
  private _pythonValidated: boolean;
  private _dependenciesValidated: boolean = false;
  private readonly extractorScript: string;
  private readonly reportConfig: ReportOptions;
  private readonly outputDir: string;
  private readonly autoGenerateReports: boolean;
  private readonly config: Record<string, any>;

  constructor(options: ScanOrchestratorOptions = {}) {
    // JavaScript components
    this.repositoryScanner = new RepositoryScanner(options.scanner || {});
    this.patternDetector = new AstGrepPatternDetector(options.detector || {});

    // Python components (called via subprocess)
    // Intelligent Python path detection (lazy - validated on first use):
    // 1. Use explicitly provided pythonPath if given
    // 2. Try venv Python (local development)
    // 3. Fall back to system Python (CI/production)
    if (options.pythonPath) {
      this.pythonPath = options.pythonPath;
      this._pythonValidated = false; // Will validate on first use
    } else {
      // Defer Python detection/validation until first scan
      // This allows server to start without Python for health checks
      this.pythonPath = null as any;
      this._pythonValidated = false;
    }

    this.extractorScript = options.extractorScript || path.join(process.cwd(), 'sidequest/pipeline-core/extractors/extract_blocks.py');

    // Report generation configuration
    this.reportConfig = options.reports || {};
    this.outputDir = options.outputDir || path.join(process.cwd(), 'output', 'reports');
    this.autoGenerateReports = options.autoGenerateReports !== false; // Default: true

    // Configuration
    this.config = options.config || {};
  }

  /**
   * Detect Python path (lazy initialization)
   * Only called when Python is actually needed for a scan
   * Note: DependencyValidator.validateAll() handles the actual validation
   */
  private _detectPythonPath(): void {
    if (this._pythonValidated) {
      return; // Already detected
    }

    if (this.pythonPath) {
      // Explicitly provided path - use it
      this._pythonValidated = true;
      return;
    }

    // Auto-detect Python path (validation done by DependencyValidator)
    const venvPython = path.join(process.cwd(), 'venv/bin/python3');
    const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

    if (existsSync(venvPython) && !isCI) {
      // Local development: use venv Python
      this.pythonPath = venvPython;
      logger.info({ pythonPath: venvPython }, 'Using venv Python');
    } else {
      // CI/production: use system Python
      this.pythonPath = 'python3';
      logger.info({
        pythonPath: 'python3',
        isCI,
        reason: existsSync(venvPython) ? 'CI environment detected' : 'venv not found'
      }, 'Using system Python');
    }

    this._pythonValidated = true;
  }

  /**
   * Scan a single repository for duplicates
   */
  async scanRepository(repoPath: string, scanConfig: ScanConfig = {}): Promise<ScanResult> {
    const startTime = Date.now();

    // Validate repoPath
    if (!repoPath || typeof repoPath !== 'string') {
      const error = new ScanError(
        `Invalid repository path: ${repoPath === undefined ? 'undefined' : repoPath === null ? 'null' : typeof repoPath}. ` +
        `Expected a valid file system path string.`
      );
      logger.error({ repoPath, type: typeof repoPath }, 'Invalid repository path provided');
      Sentry.captureException(error, {
        tags: {
          error_type: 'validation_error',
          component: 'ScanOrchestrator'
        },
        extra: {
          repoPath,
          repoPathType: typeof repoPath,
          scanConfig
        }
      });
      throw error;
    }

    logger.info({ repoPath }, 'Starting repository duplicate scan');

    try {
      // Validate dependencies once per scanner instance
      if (!this._dependenciesValidated) {
        await DependencyValidator.validateAll();
        this._dependenciesValidated = true;
      }

      // Stage 1: Repository scanning
      logger.info('Stage 1/7: Scanning repository with repomix');
      const repoScan: RepositoryScanOutput = await this.repositoryScanner.scanRepository(
        repoPath,
        scanConfig.scan_config || {}
      );

      // Stage 2: Pattern detection
      logger.info('Stage 2/7: Detecting patterns with ast-grep');
      const patterns: PatternDetectionOutput = await this.patternDetector.detectPatterns(
        repoPath,
        scanConfig.pattern_config || {}
      );

      // Stage 3-7: Python pipeline
      logger.info('Stage 3-7: Running Python extraction and analysis pipeline');
      const pythonResult = await this.runPythonPipeline({
        repository_info: repoScan.repository_info,
        pattern_matches: patterns.matches,
        scan_config: scanConfig
      });

      const duration = (Date.now() - startTime) / 1000;

      logger.info({
        repoPath,
        duration,
        blocks: pythonResult.metrics?.total_code_blocks || 0,
        groups: pythonResult.metrics?.total_duplicate_groups || 0,
        suggestions: pythonResult.metrics?.total_suggestions || 0
      }, 'Repository scan completed successfully');

      const scanResult: ScanResult = {
        ...pythonResult,
        scan_metadata: {
          duration_seconds: duration,
          scanned_at: new Date().toISOString(),
          repository_path: repoPath
        }
      };

      // Auto-generate reports if enabled
      if (this.autoGenerateReports && scanConfig.generateReports !== false) {
        logger.info('Auto-generating reports');
        try {
          const reportPaths = await this.generateReports(scanResult, this.reportConfig);
          scanResult.report_paths = reportPaths;
          logger.info({ reportPaths }, 'Reports auto-generated successfully');
        } catch (error) {
          logger.warn({ error }, 'Report auto-generation failed, continuing');
        }
      }

      return scanResult;

    } catch (error) {
      logger.error({ repoPath, error }, 'Repository scan failed');
      throw new ScanError(`Scan failed for ${repoPath}: ${(error as Error).message}`, {
        cause: error
      });
    }
  }

  /**
   * Run Python pipeline for extraction, grouping, and reporting
   */
  private async runPythonPipeline(data: PythonPipelineInput): Promise<PythonPipelineOutput> {
    // Lazy detection: Only detect Python path when actually needed
    this._detectPythonPath();

    return new Promise<PythonPipelineOutput>((resolve, reject) => {
      logger.debug('Launching Python extraction pipeline');

      const proc: ChildProcess = spawn(this.pythonPath!, [this.extractorScript], {
        timeout: 600000, // 10 minute timeout
      });

      let stdout = '';
      let stderr = '';

      // Send input data via stdin
      const jsonData = JSON.stringify(data);
      logger.debug({
        patternMatchCount: data.pattern_matches?.length,
        repoPath: data.repository_info?.path
      }, 'Sending data to Python pipeline');

      proc.stdin?.write(jsonData);
      proc.stdin?.end();

      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data: Buffer) => {
        const stderrText = data.toString();
        stderr += stderrText;
        // Log warnings at warn level so they're visible
        if (stderrText.includes('Warning:')) {
          logger.warn({ stderr: stderrText }, 'Python pipeline warning');
        } else {
          logger.debug({ stderr: stderrText }, 'Python pipeline stderr');
        }
      });

      proc.on('close', (code: number | null) => {
        if (code === 0) {
          try {
            const result: PythonPipelineOutput = JSON.parse(stdout);
            resolve(result);
          } catch (error) {
            logger.error({ stdout, stderr }, 'Failed to parse Python pipeline output');
            reject(new Error(`Failed to parse Python output: ${(error as Error).message}`));
          }
        } else {
          logger.error({ code, stderr }, 'Python pipeline failed');
          reject(new Error(`Python pipeline exited with code ${code}: ${stderr}`));
        }
      });

      proc.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
          reject(new Error(`Python not found at: ${this.pythonPath}`));
        } else {
          reject(error);
        }
      });
    });
  }

  /**
   * Generate reports from scan results
   */
  async generateReports(scanResult: ScanResult, options: ReportOptions = {}): Promise<ReportPaths> {
    const repoInfo = scanResult.repository_info || {} as RepositoryInfo;
    const repoName = repoInfo.name || 'scan';
    const isInterProject = scanResult.scan_type === 'inter-project';

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const baseName = options.baseName || `${repoName}-${timestamp}`;

    const outputDir = options.outputDir || this.outputDir;
    await fs.mkdir(outputDir, { recursive: true });

    const reportPaths: ReportPaths = {};

    try {
      // Generate HTML report
      if (options.html !== false) {
        logger.info({ outputDir }, 'Generating HTML report');
        const htmlPath = path.join(outputDir, `${baseName}.html`);

        await HTMLReportGenerator.saveReport(scanResult, htmlPath, {
          title: options.title || (isInterProject
            ? 'Inter-Project Duplicate Detection Report'
            : `Duplicate Detection Report - ${repoName}`)
        });

        reportPaths.html = htmlPath;
        logger.info({ path: htmlPath }, 'HTML report generated');
      }

      // Generate Markdown report
      if (options.markdown !== false) {
        logger.info({ outputDir }, 'Generating Markdown report');
        const markdownPath = path.join(outputDir, `${baseName}.md`);

        await MarkdownReportGenerator.saveReport(scanResult, markdownPath, {
          includeDetails: options.includeDetails !== false,
          maxDuplicates: options.maxDuplicates || 10,
          maxSuggestions: options.maxSuggestions || 10
        });

        reportPaths.markdown = markdownPath;
        logger.info({ path: markdownPath }, 'Markdown report generated');
      }

      // Generate concise summary
      if (options.summary !== false) {
        logger.info({ outputDir }, 'Generating summary');
        const summaryPath = path.join(outputDir, `${baseName}-summary.md`);

        await MarkdownReportGenerator.saveSummary(scanResult, summaryPath);

        reportPaths.summary = summaryPath;
        logger.info({ path: summaryPath }, 'Summary generated');
      }

      return reportPaths;

    } catch (error) {
      logger.error({ error }, 'Report generation failed');
      throw new ScanError(`Report generation failed: ${(error as Error).message}`, {
        cause: error
      });
    }
  }

  /**
   * Scan multiple repositories (inter-project analysis)
   */
  async scanMultipleRepositories(
    repoPaths: string[],
    scanConfig: ScanConfig = {}
  ): Promise<MultiRepositoryScanResult> {
    logger.info({ count: repoPaths.length }, 'Starting multi-repository scan');

    // Use InterProjectScanner for cross-repository analysis
    const interProjectScanner = new InterProjectScanner({
      orchestrator: {
        scanner: {},
        detector: {},
        pythonPath: this.pythonPath,
        extractorScript: this.extractorScript,
        outputDir: this.outputDir,
        autoGenerateReports: this.autoGenerateReports,
        reports: this.reportConfig
      },
      outputDir: this.outputDir
    });

    try {
      // Delegate to InterProjectScanner for full cross-repository analysis
      const interProjectResult = await interProjectScanner.scanRepositories(repoPaths, scanConfig);

      // Transform InterProjectScanner result to MultiRepositoryScanResult
      const results: Array<ScanResult | { error: string; repository_path: string }> = [];

      for (const repoScan of interProjectResult.repository_scans) {
        if (repoScan.error) {
          results.push({
            error: repoScan.error,
            repository_path: repoScan.repository_path
          });
        } else if (repoScan.scan_result) {
          results.push(repoScan.scan_result);
        }
      }

      return {
        repositories: results,
        total_scanned: repoPaths.length,
        successful: results.filter(r => !('error' in r)).length,
        failed: results.filter(r => 'error' in r).length,
        cross_repository_duplicates: interProjectResult.cross_repository_duplicates,
        cross_repository_suggestions: interProjectResult.cross_repository_suggestions,
        scan_type: 'inter-project',
        metrics: interProjectResult.metrics
      };
    } catch (error) {
      logger.error({ error }, 'Multi-repository scan failed');

      // Fallback: scan each repository individually without cross-repo analysis
      logger.warn('Falling back to individual repository scans without cross-repository analysis');

      const results: Array<ScanResult | { error: string; repository_path: string }> = [];

      for (const repoPath of repoPaths) {
        try {
          const result = await this.scanRepository(repoPath, scanConfig);
          results.push(result);
        } catch (scanError) {
          logger.warn({ repoPath, error: scanError }, 'Repository scan failed, continuing');
          results.push({
            error: (scanError as Error).message,
            repository_path: repoPath
          });
        }
      }

      return {
        repositories: results,
        total_scanned: repoPaths.length,
        successful: results.filter(r => !('error' in r)).length,
        failed: results.filter(r => 'error' in r).length,
        scan_type: 'single-project'
      };
    }
  }
}

// ============================================================================
// Error Class
// ============================================================================

/**
 * Custom error class for scan orchestration errors
 */
export class ScanError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    if (options?.cause) {
      (this as any).cause = options.cause;
    }
    this.name = 'ScanError';
  }
}
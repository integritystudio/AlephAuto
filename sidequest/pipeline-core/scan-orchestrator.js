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
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as Sentry from '@sentry/node';
const logger = createComponentLogger('ScanOrchestrator');
// ============================================================================
// Main ScanOrchestrator Class
// ============================================================================
/**
 * Scan Orchestrator - Coordinates the duplicate detection pipeline
 */
export class ScanOrchestrator {
    repositoryScanner;
    patternDetector;
    pythonPath;
    extractorScript;
    reportConfig;
    outputDir;
    autoGenerateReports;
    config;
    constructor(options = {}) {
        // JavaScript components
        this.repositoryScanner = new RepositoryScanner(options.scanner || {});
        this.patternDetector = new AstGrepPatternDetector(options.detector || {});
        // Python components (called via subprocess)
        // Use venv python by default if it exists, otherwise fall back to system python3
        const venvPython = path.join(process.cwd(), 'venv/bin/python3');
        this.pythonPath = options.pythonPath || venvPython;
        this.extractorScript = options.extractorScript || path.join(process.cwd(), 'sidequest/pipeline-core/extractors/extract_blocks.py');
        // Report generation configuration
        this.reportConfig = options.reports || {};
        this.outputDir = options.outputDir || path.join(process.cwd(), 'output', 'reports');
        this.autoGenerateReports = options.autoGenerateReports !== false; // Default: true
        // Configuration
        this.config = options.config || {};
    }
    /**
     * Scan a single repository for duplicates
     */
    async scanRepository(repoPath, scanConfig = {}) {
        const startTime = Date.now();
        // Validate repoPath
        if (!repoPath || typeof repoPath !== 'string') {
            const error = new ScanError(`Invalid repository path: ${repoPath === undefined ? 'undefined' : repoPath === null ? 'null' : typeof repoPath}. ` +
                `Expected a valid file system path string.`);
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
            // Stage 1: Repository scanning
            logger.info('Stage 1/7: Scanning repository with repomix');
            const repoScan = await this.repositoryScanner.scanRepository(repoPath, scanConfig.scan_config || {});
            // Stage 2: Pattern detection
            logger.info('Stage 2/7: Detecting patterns with ast-grep');
            const patterns = await this.patternDetector.detectPatterns(repoPath, scanConfig.pattern_config || {});
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
            const scanResult = {
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
                }
                catch (error) {
                    logger.warn({ error }, 'Report auto-generation failed, continuing');
                }
            }
            return scanResult;
        }
        catch (error) {
            logger.error({ repoPath, error }, 'Repository scan failed');
            throw new ScanError(`Scan failed for ${repoPath}: ${error.message}`, {
                cause: error
            });
        }
    }
    /**
     * Run Python pipeline for extraction, grouping, and reporting
     */
    async runPythonPipeline(data) {
        return new Promise((resolve, reject) => {
            logger.debug('Launching Python extraction pipeline');
            const proc = spawn(this.pythonPath, [this.extractorScript], {
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
            proc.stdout?.on('data', (data) => {
                stdout += data.toString();
            });
            proc.stderr?.on('data', (data) => {
                const stderrText = data.toString();
                stderr += stderrText;
                // Log warnings at warn level so they're visible
                if (stderrText.includes('Warning:')) {
                    logger.warn({ stderr: stderrText }, 'Python pipeline warning');
                }
                else {
                    logger.debug({ stderr: stderrText }, 'Python pipeline stderr');
                }
            });
            proc.on('close', (code) => {
                if (code === 0) {
                    try {
                        const result = JSON.parse(stdout);
                        resolve(result);
                    }
                    catch (error) {
                        logger.error({ stdout, stderr }, 'Failed to parse Python pipeline output');
                        reject(new Error(`Failed to parse Python output: ${error.message}`));
                    }
                }
                else {
                    logger.error({ code, stderr }, 'Python pipeline failed');
                    reject(new Error(`Python pipeline exited with code ${code}: ${stderr}`));
                }
            });
            proc.on('error', (error) => {
                if (error.code === 'ENOENT') {
                    reject(new Error(`Python not found at: ${this.pythonPath}`));
                }
                else {
                    reject(error);
                }
            });
        });
    }
    /**
     * Generate reports from scan results
     */
    async generateReports(scanResult, options = {}) {
        const repoInfo = scanResult.repository_info || {};
        const repoName = repoInfo.name || 'scan';
        const isInterProject = scanResult.scan_type === 'inter-project';
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const baseName = options.baseName || `${repoName}-${timestamp}`;
        const outputDir = options.outputDir || this.outputDir;
        await fs.mkdir(outputDir, { recursive: true });
        const reportPaths = {};
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
        }
        catch (error) {
            logger.error({ error }, 'Report generation failed');
            throw new ScanError(`Report generation failed: ${error.message}`, {
                cause: error
            });
        }
    }
    /**
     * Scan multiple repositories (inter-project analysis)
     */
    async scanMultipleRepositories(repoPaths, scanConfig = {}) {
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
            const results = [];
            for (const repoScan of interProjectResult.repository_scans) {
                if (repoScan.error) {
                    results.push({
                        error: repoScan.error,
                        repository_path: repoScan.repository_path
                    });
                }
                else if (repoScan.scan_result) {
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
        }
        catch (error) {
            logger.error({ error }, 'Multi-repository scan failed');
            // Fallback: scan each repository individually without cross-repo analysis
            logger.warn('Falling back to individual repository scans without cross-repository analysis');
            const results = [];
            for (const repoPath of repoPaths) {
                try {
                    const result = await this.scanRepository(repoPath, scanConfig);
                    results.push(result);
                }
                catch (scanError) {
                    logger.warn({ repoPath, error: scanError }, 'Repository scan failed, continuing');
                    results.push({
                        error: scanError.message,
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
    constructor(message, options) {
        super(message);
        if (options?.cause) {
            this.cause = options.cause;
        }
        this.name = 'ScanError';
    }
}

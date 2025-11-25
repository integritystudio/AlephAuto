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
    repositories: Array<ScanResult | {
        error: string;
        repository_path: string;
    }>;
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
 * Scan Orchestrator - Coordinates the duplicate detection pipeline
 */
export declare class ScanOrchestrator {
    private readonly repositoryScanner;
    private readonly patternDetector;
    private readonly pythonPath;
    private readonly extractorScript;
    private readonly reportConfig;
    private readonly outputDir;
    private readonly autoGenerateReports;
    private readonly config;
    constructor(options?: ScanOrchestratorOptions);
    /**
     * Scan a single repository for duplicates
     */
    scanRepository(repoPath: string, scanConfig?: ScanConfig): Promise<ScanResult>;
    /**
     * Run Python pipeline for extraction, grouping, and reporting
     */
    private runPythonPipeline;
    /**
     * Generate reports from scan results
     */
    generateReports(scanResult: ScanResult, options?: ReportOptions): Promise<ReportPaths>;
    /**
     * Scan multiple repositories (inter-project analysis)
     */
    scanMultipleRepositories(repoPaths: string[], scanConfig?: ScanConfig): Promise<MultiRepositoryScanResult>;
}
/**
 * Custom error class for scan orchestration errors
 */
export declare class ScanError extends Error {
    constructor(message: string, options?: {
        cause?: unknown;
    });
}

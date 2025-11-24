/**
 * Zod Schemas for ScanOrchestrator
 *
 * Following TypeScript Type Validator skill best practices:
 * - Single source of truth: Derive TypeScript types from Zod schemas
 * - Runtime validation for external inputs
 * - Clear error messages
 * - Strict validation with .strict()
 */
import { z } from 'zod';
// ============================================================================
// Zod Schemas for Runtime Validation
// ============================================================================
/**
 * Repository information schema
 */
export const RepositoryInfoSchema = z.object({
    path: z.string()
        .min(1, 'Repository path must not be empty'),
    name: z.string()
        .min(1, 'Repository name must not be empty'),
    gitRemote: z.string().url().optional(),
    gitBranch: z.string().optional(),
    gitCommit: z.string().optional(),
    totalFiles: z.number()
        .int('Total files must be an integer')
        .nonnegative('Total files must be non-negative'),
    totalLines: z.number()
        .int('Total lines must be an integer')
        .nonnegative('Total lines must be non-negative'),
    languages: z.array(z.string())
}).strict();
/**
 * Pattern match schema from ast-grep
 */
export const PatternMatchSchema = z.object({
    file_path: z.string()
        .min(1, 'File path must not be empty'),
    rule_id: z.string()
        .min(1, 'Rule ID must not be empty'),
    matched_text: z.string(),
    line_start: z.number()
        .int('Line start must be an integer')
        .positive('Line start must be positive'),
    line_end: z.number()
        .int('Line end must be an integer')
        .positive('Line end must be positive'),
    column_start: z.number().int().nonnegative().optional(),
    column_end: z.number().int().nonnegative().optional(),
    severity: z.string().optional(),
    confidence: z.number().min(0).max(1).optional()
}).strict();
/**
 * Scan configuration schema
 */
export const ScanConfigSchema = z.object({
    scan_config: z.object({
        includeTests: z.boolean().optional(),
        maxDepth: z.number()
            .int('Max depth must be an integer')
            .positive('Max depth must be positive')
            .optional(),
        excludePaths: z.array(z.string()).optional()
    }).passthrough().optional(), // Allow additional properties
    pattern_config: z.object({
        rulesDirectory: z.string().optional(),
        configPath: z.string().optional()
    }).passthrough().optional(), // Allow additional properties
    generateReports: z.boolean().optional()
}).passthrough(); // Allow additional top-level properties for extensibility
/**
 * Python pipeline input schema
 */
export const PythonPipelineInputSchema = z.object({
    repository_info: RepositoryInfoSchema,
    pattern_matches: z.array(PatternMatchSchema),
    scan_config: ScanConfigSchema
}).strict();
/**
 * Code block schema
 */
export const CodeBlockSchema = z.object({
    block_id: z.string()
        .min(1, 'Block ID must not be empty'),
    file_path: z.string()
        .min(1, 'File path must not be empty'),
    line_start: z.number()
        .int('Line start must be an integer')
        .positive('Line start must be positive'),
    line_end: z.number()
        .int('Line end must be an integer')
        .positive('Line end must be positive'),
    source_code: z.string(),
    language: z.string()
        .min(1, 'Language must not be empty'),
    semantic_category: z.string().optional(),
    tags: z.array(z.string()),
    complexity_metrics: z.object({
        cyclomatic: z.number().int().nonnegative(),
        cognitive: z.number().int().nonnegative(),
        lines: z.number().int().nonnegative()
    }).optional(),
    similarity_hash: z.string().optional()
}).strict();
/**
 * Duplicate group schema
 */
export const DuplicateGroupSchema = z.object({
    group_id: z.string()
        .min(1, 'Group ID must not be empty'),
    block_ids: z.array(z.string())
        .min(2, 'Duplicate group must have at least 2 blocks'),
    similarity_score: z.number()
        .min(0, 'Similarity score must be between 0 and 1')
        .max(1, 'Similarity score must be between 0 and 1'),
    group_type: z.enum(['exact', 'structural', 'semantic']),
    impact_score: z.number()
        .min(0, 'Impact score must be non-negative')
        .optional()
}).strict();
/**
 * Consolidation suggestion schema
 */
export const ConsolidationSuggestionSchema = z.object({
    suggestion_id: z.string()
        .min(1, 'Suggestion ID must not be empty'),
    group_id: z.string()
        .min(1, 'Group ID must not be empty'),
    target_location: z.string()
        .min(1, 'Target location must not be empty'),
    affected_files: z.array(z.string())
        .min(1, 'Must have at least one affected file'),
    estimated_loc_reduction: z.number()
        .int('LOC reduction must be an integer')
        .nonnegative('LOC reduction must be non-negative'),
    priority: z.enum(['high', 'medium', 'low']),
    reasoning: z.string().optional()
}).strict();
/**
 * Scan metrics schema
 */
export const ScanMetricsSchema = z.object({
    total_code_blocks: z.number()
        .int('Total code blocks must be an integer')
        .nonnegative('Total code blocks must be non-negative'),
    total_duplicate_groups: z.number()
        .int('Total duplicate groups must be an integer')
        .nonnegative('Total duplicate groups must be non-negative'),
    total_suggestions: z.number()
        .int('Total suggestions must be an integer')
        .nonnegative('Total suggestions must be non-negative'),
    potential_loc_reduction: z.number()
        .int('Potential LOC reduction must be an integer')
        .nonnegative('Potential LOC reduction must be non-negative'),
    duplication_percentage: z.number()
        .min(0, 'Duplication percentage must be between 0 and 100')
        .max(100, 'Duplication percentage must be between 0 and 100').optional(),
    total_cross_repository_groups: z.number()
        .int().nonnegative().optional()
}).strict();
/**
 * Python pipeline output schema
 */
export const PythonPipelineOutputSchema = z.object({
    code_blocks: z.array(CodeBlockSchema),
    duplicate_groups: z.array(DuplicateGroupSchema),
    suggestions: z.array(ConsolidationSuggestionSchema),
    metrics: ScanMetricsSchema
}).strict();
/**
 * Scan result schema
 */
export const ScanResultSchema = z.object({
    code_blocks: z.array(CodeBlockSchema),
    duplicate_groups: z.array(DuplicateGroupSchema),
    suggestions: z.array(ConsolidationSuggestionSchema),
    metrics: ScanMetricsSchema,
    scan_metadata: z.object({
        duration_seconds: z.number().nonnegative(),
        scanned_at: z.string(), // ISO date string
        repository_path: z.string()
    }).strict(),
    report_paths: z.object({
        html: z.string().optional(),
        markdown: z.string().optional(),
        json: z.string().optional()
    }).strict().optional()
}).strict();
/**
 * Report options schema
 */
export const ReportOptionsSchema = z.object({
    outputDir: z.string()
        .min(1, 'Output directory must not be empty'),
    title: z.string().optional(),
    includeSourceCode: z.boolean().optional(),
    includeDetails: z.boolean().optional(),
    includeCodeBlocks: z.boolean().optional()
}).passthrough(); // Allow additional options
/**
 * ScanOrchestrator options schema
 */
export const ScanOrchestratorOptionsSchema = z.object({
    scanner: z.any().optional(), // RepositoryScanner options
    detector: z.any().optional(), // AstGrepPatternDetector options
    pythonPath: z.string().optional(),
    extractorScript: z.string().optional(),
    autoGenerateReports: z.boolean().optional(),
    reportConfig: ReportOptionsSchema.optional()
}).passthrough();

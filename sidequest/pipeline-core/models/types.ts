/**
 * Internal TypeScript interfaces and computed field functions
 * for the duplicate detection pipeline.
 *
 * Ports Python Pydantic models: CodeBlock, DuplicateGroup,
 * ConsolidationSuggestion, and supporting types.
 */

import { createHash } from 'node:crypto';
import {
  SCAN_DEFAULTS,
  IMPACT_WEIGHTS,
  SCORING_THRESHOLDS,
} from '../pipeline-constants.ts';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum LanguageType {
  JAVASCRIPT = 'javascript',
  TYPESCRIPT = 'typescript',
  PYTHON = 'python',
  JAVA = 'java',
  GO = 'go',
  RUST = 'rust',
  C = 'c',
  CPP = 'cpp',
  CSHARP = 'csharp',
  PHP = 'php',
  RUBY = 'ruby',
  KOTLIN = 'kotlin',
  SWIFT = 'swift',
  SCALA = 'scala',
  VUE = 'vue',
  SVELTE = 'svelte',
  UNKNOWN = 'unknown',
}

export enum SemanticCategory {
  UTILITY = 'utility',
  HELPER = 'helper',
  VALIDATOR = 'validator',
  API_HANDLER = 'api_handler',
  AUTH_CHECK = 'auth_check',
  DATABASE_OPERATION = 'database_operation',
  ERROR_HANDLER = 'error_handler',
  LOGGER = 'logger',
  CONFIG_ACCESS = 'config_access',
  FILE_OPERATION = 'file_operation',
  ASYNC_PATTERN = 'async_pattern',
  PROCESS_IO = 'process_io',
  TIMING = 'timing',
  TRACING = 'tracing',
  UNKNOWN = 'unknown',
}

export enum SimilarityMethod {
  EXACT_MATCH = 'exact_match',
  STRUCTURAL = 'structural',
  SEMANTIC = 'semantic',
  HYBRID = 'hybrid',
}

export enum ConsolidationStrategy {
  LOCAL_UTIL = 'local_util',
  SHARED_PACKAGE = 'shared_package',
  MCP_SERVER = 'mcp_server',
  AUTONOMOUS_AGENT = 'autonomous_agent',
  NO_ACTION = 'no_action',
}

export enum ImplementationComplexity {
  TRIVIAL = 'trivial',
  SIMPLE = 'simple',
  MODERATE = 'moderate',
  COMPLEX = 'complex',
  VERY_COMPLEX = 'very_complex',
}

export enum MigrationRisk {
  MINIMAL = 'minimal',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface SourceLocation {
  filePath: string;
  lineStart: number;
  lineEnd: number;
  columnStart?: number;
  columnEnd?: number;
}

export interface ASTNode {
  nodeType: string;
  children: ASTNode[];
  properties: Record<string, unknown>;
}

export interface CodeBlock {
  blockId: string;
  patternId: string;
  location: SourceLocation;
  relativePath: string;
  sourceCode: string;
  normalizedCode?: string;
  astStructure?: ASTNode;
  astHash?: string;
  language: string;
  category: string;
  tags: string[];
  matchContext?: Record<string, unknown>;
  repositoryPath: string;
  repositoryName?: string;
  gitCommit?: string;
  detectedAt?: string;
  lineCount: number;
  complexityScore?: number;
}

export interface DuplicateGroup {
  groupId: string;
  patternId: string;
  memberBlockIds: string[];
  similarityScore: number;
  similarityMethod: string;
  canonicalBlockId?: string;
  category: string;
  language: string;
  occurrenceCount: number;
  totalLines: number;
  affectedFiles: string[];
  affectedRepositories: string[];
  consolidationComplexity?: string;
  breakingChangesRisk?: string;
  createdAt?: string;
  updatedAt?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface MigrationStep {
  stepNumber: number;
  description: string;
  codeExample?: string;
  automated: boolean;
  estimatedTime?: string;
}

export interface ConsolidationSuggestion {
  suggestionId: string;
  duplicateGroupId: string;
  strategy: string;
  strategyRationale: string;
  impactScore: number;
  complexity: string;
  migrationRisk: string;
  breakingChanges: boolean;
  migrationSteps: MigrationStep[];
  targetLocation?: string;
  targetName?: string;
  proposedImplementation?: string;
  usageExample?: string;
  codeExample?: string;
  estimatedEffortHours?: number;
  locReduction?: number;
  affectedFilesCount: number;
  affectedRepositoriesCount: number;
  dependencies?: string[];
  prerequisiteSuggestions?: string[];
  testStrategy?: string;
  rollbackPlan?: string;
  confidence: number;
  automatedRefactorPossible?: boolean;
  requiresHumanReview?: boolean;
  benefits?: string[];
  drawbacks?: string[];
  notes?: string;
  roiScore?: number;
}

export interface SemanticAnnotation {
  category: string;
  operations: Set<string>;
  domains: Set<string>;
  patterns: Set<string>;
  dataTypes: Set<string>;
  intent: string;
}

// ---------------------------------------------------------------------------
// Computed Field Functions
// ---------------------------------------------------------------------------

export function computeContentHash(sourceCode: string): string {
  const normalized = sourceCode.split(/\s+/).join(' ');
  return createHash('sha256')
    .update(normalized)
    .digest('hex')
    .slice(0, SCAN_DEFAULTS.CONTENT_HASH_LENGTH);
}

export function computeStructuralHash(block: CodeBlock): string {
  if (block.astHash) return block.astHash;
  return computeContentHash(block.sourceCode);
}

export function computeImpactScore(group: DuplicateGroup): number {
  const occurrenceFactor = Math.min(
    group.occurrenceCount / IMPACT_WEIGHTS.OCCURRENCE_CAP,
    1.0
  );
  const similarityFactor = group.similarityScore;
  const locFactor = Math.min(group.totalLines / IMPACT_WEIGHTS.LOC_CAP, 1.0);

  const score =
    occurrenceFactor * IMPACT_WEIGHTS.OCCURRENCE +
    similarityFactor * IMPACT_WEIGHTS.SIMILARITY +
    locFactor * IMPACT_WEIGHTS.SIZE;

  return Math.round(score * 100) / 100;
}

export function computeDeduplicationPotential(group: DuplicateGroup): number {
  if (group.occurrenceCount <= 1) return 0;
  const avgLines = group.totalLines / group.occurrenceCount;
  return Math.floor((group.occurrenceCount - 1) * avgLines);
}

export function computePriorityLevel(impactScore: number): string {
  if (impactScore >= SCORING_THRESHOLDS.CRITICAL) return 'critical';
  if (impactScore >= SCORING_THRESHOLDS.HIGH) return 'high';
  if (impactScore >= SCORING_THRESHOLDS.MEDIUM) return 'medium';
  return 'low';
}

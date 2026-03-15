/**
 * Code Block Extraction Pipeline (TypeScript)
 *
 * Ports Python extract_blocks.py. Orchestrates stages 3-7:
 * - Stage 3: Extract code blocks from pattern matches
 * - Stage 3.5: Deduplicate blocks
 * - Stage 4: Semantic annotation (via grouping Layer 3)
 * - Stage 5: Group duplicates (Layers 1-3)
 * - Stage 6: Generate consolidation suggestions
 * - Stage 7: Calculate metrics
 *
 * Can be used as a library (runPipeline) or standalone CLI.
 */

import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import type {
  CodeBlock,
  DuplicateGroup,
  ConsolidationSuggestion,
  MigrationStep,
} from '../models/types.ts';
import { computeContentHash, computeImpactScore } from '../models/types.ts';
import { PipelineInputSchema } from '../models/validation.ts';
import type { PipelineInput } from '../models/validation.ts';
import { groupBySimilarity } from '../similarity/grouping.ts';
import { SIMILARITY_CONFIG } from '../similarity/config.ts';
import {
  BLOCK_EXTRACTION,
  CONFIDENCE_THRESHOLDS,
  EFFORT_IMPLEMENTATION_DEFAULT_HOURS,
  EFFORT_IMPLEMENTATION_HOURS_BY_TIER,
  EFFORT_IMPLEMENTATION_PER_FILE_INCREMENT_HOURS,
  EFFORT_IMPLEMENTATION_TESTING_OVERHEAD_HOURS,
  EffortTier,
  EXTRACTION_DEFAULTS,
  ROI_MULTIPLIERS,
  SCAN_DEFAULTS,
  SCORING_THRESHOLDS,
  STRATEGY_THRESHOLDS,
  SUGGESTION_DEFAULTS,
} from '../pipeline-constants.ts';

const DEBUG = SIMILARITY_CONFIG.DEBUG;

function _debug(msg: string): void {
  if (DEBUG) process.stderr.write(`DEBUG ${msg}\n`);
}

// ---------------------------------------------------------------------------
// Language Detection
// ---------------------------------------------------------------------------

const LANGUAGE_MAP: Record<string, string> = {
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.py': 'python',
  '.rb': 'ruby',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.kt': 'kotlin',
  '.swift': 'swift',
  '.c': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.php': 'php',
  '.scala': 'scala',
  '.vue': 'vue',
  '.svelte': 'svelte',
};

export function detectLanguage(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return LANGUAGE_MAP[ext] ?? 'unknown';
}

// ---------------------------------------------------------------------------
// Pattern to Category Mapping
// ---------------------------------------------------------------------------

const PATTERN_CATEGORY_MAP: Record<string, string> = {
  'object-manipulation': 'utility',
  'array-map-filter': 'utility',
  'string-manipulation': 'utility',
  'type-checking': 'utility',
  'validation': 'validator',
  'express-route-handlers': 'api_handler',
  'auth-checks': 'auth_check',
  'error-responses': 'error_handler',
  'request-validation': 'validator',
  'prisma-operations': 'database_operation',
  'query-builders': 'database_operation',
  'connection-handling': 'database_operation',
  'await-patterns': 'async_pattern',
  'promise-chains': 'async_pattern',
  'env-variables': 'config_access',
  'config-objects': 'config_access',
  'console-statements': 'logger',
  'logger-patterns': 'logger',
  'process-io': 'process_io',
  'timing-patterns': 'timing',
  'tracing-patterns': 'tracing',
};

// ---------------------------------------------------------------------------
// Function Name Extraction
// ---------------------------------------------------------------------------

const FUNCTION_NAME_PATTERNS: RegExp[] = [
  /function\s+(\w+)\s*\(/,
  /const\s+(\w+)\s*=\s*(?:async\s+)?function/,
  /const\s+(\w+)\s*=\s*(?:async\s+)?\(/,
  /let\s+(\w+)\s*=\s*(?:async\s+)?function/,
  /let\s+(\w+)\s*=\s*(?:async\s+)?\(/,
  /var\s+(\w+)\s*=\s*(?:async\s+)?function/,
  /var\s+(\w+)\s*=\s*(?:async\s+)?\(/,
  /async\s+function\s+(\w+)\s*\(/,
  /(\w+)\s*:\s*function/,
  /(\w+)\s*:\s*async\s+function/,
  /export\s+function\s+(\w+)/,
  /export\s+const\s+(\w+)\s*=/,
];

function _matchFunctionPattern(text: string, multiline = false): string | undefined {
  for (const pattern of FUNCTION_NAME_PATTERNS) {
    const flags = multiline ? 'gm' : 'g';
    const re = new RegExp(pattern.source, flags);
    const match = re.exec(text);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

function _searchFileForFunctionName(
  filePath: string,
  lineStart: number,
  repoPath: string
): string | undefined {
  const fullPath = join(repoPath, filePath);
  _debug(`attempting to read ${fullPath} at line ${lineStart}`);

  if (!existsSync(fullPath)) {
    _debug(`file does not exist: ${fullPath}`);
    return undefined;
  }

  try {
    const lines = readFileSync(fullPath, 'utf-8').split('\n');
    const searchStart = Math.max(0, lineStart - EXTRACTION_DEFAULTS.SEARCH_WINDOW - 1);

    for (let i = lineStart - 1; i >= searchStart; i--) {
      if (i < 0 || i >= lines.length) continue;
      const funcName = _matchFunctionPattern(lines[i]);
      if (funcName) {
        _debug(`found function name '${funcName}' at line ${i + 1} (match was at ${lineStart})`);
        return funcName;
      }
    }

    _debug(`no function name found in lines ${searchStart + 1}-${lineStart} for ${filePath}:${lineStart}`);
  } catch {
    // readFileSync failed (encoding error, etc.)
  }
  return undefined;
}

export function extractFunctionName(
  sourceCode: string,
  filePath?: string,
  lineStart?: number,
  repoPath?: string
): string | undefined {
  _debug(`extract_function_name called: file_path=${filePath}, line_start=${lineStart}`);

  if (!sourceCode) return undefined;

  const funcName = _matchFunctionPattern(sourceCode, true);
  if (funcName) return funcName;

  if (filePath && lineStart && repoPath) {
    return _searchFileForFunctionName(filePath, lineStart, repoPath);
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

function _getFunctionNameFromTags(tags: string[]): string | undefined {
  for (const tag of tags) {
    if (tag.startsWith(BLOCK_EXTRACTION.FUNCTION_TAG_PREFIX)) {
      return tag.slice(BLOCK_EXTRACTION.FUNCTION_TAG_PREFIX.length);
    }
  }
  return undefined;
}

export function deduplicateBlocks(blocks: CodeBlock[]): CodeBlock[] {
  const seenLocations = new Set<string>();
  const seenFunctions = new Map<string, CodeBlock>();
  const uniqueBlocks: CodeBlock[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const functionName = _getFunctionNameFromTags(block.tags);

    if (i < BLOCK_EXTRACTION.DEBUG_LOG_DEDUP_LIMIT) {
      _debug(`dedup block ${i}: ${block.location.filePath}:${block.location.lineStart}, func=${functionName}`);
    }

    if (functionName) {
      const functionKey = `${block.location.filePath}:${functionName}`;
      const existing = seenFunctions.get(functionKey);

      if (!existing) {
        seenFunctions.set(functionKey, block);
        uniqueBlocks.push(block);
      } else if (block.location.lineStart < existing.location.lineStart) {
        const idx = uniqueBlocks.indexOf(existing);
        if (idx !== -1) uniqueBlocks.splice(idx, 1);
        seenFunctions.set(functionKey, block);
        uniqueBlocks.push(block);
      } else {
        _debug(`dedup: skipping duplicate ${functionName} at line ${block.location.lineStart} (kept line ${existing.location.lineStart})`);
      }
    } else {
      const locationKey = `${block.location.filePath}:${block.location.lineStart}`;
      if (!seenLocations.has(locationKey)) {
        seenLocations.add(locationKey);
        uniqueBlocks.push(block);
      }
    }
  }

  const removed = blocks.length - uniqueBlocks.length;
  if (removed > 0) {
    process.stderr.write(
      `Deduplication: Removed ${removed} duplicate blocks (${seenFunctions.size} unique functions, ${seenLocations.size} unique locations)\n`
    );
  }

  return uniqueBlocks;
}

// ---------------------------------------------------------------------------
// Code Block Extraction
// ---------------------------------------------------------------------------

interface MatchDict {
  file_path: string;
  rule_id: string;
  matched_text: string;
  line_start: number;
  line_end?: number;
  column_start?: number;
  column_end?: number;
  severity?: string;
  confidence?: number;
}

interface RepoInfoDict {
  path: string;
  name?: string;
  [key: string]: unknown;
}

function _createCodeBlock(match: MatchDict, repositoryInfo: RepoInfoDict): CodeBlock {
  const blockKey = `${match.file_path}:${match.line_start}`;
  const blockHash = createHash('sha256')
    .update(blockKey)
    .digest('hex')
    .slice(0, BLOCK_EXTRACTION.BLOCK_HASH_LENGTH);
  const blockId = `cb_${blockHash}`;

  const category = PATTERN_CATEGORY_MAP[match.rule_id] ?? 'utility';
  const sourceCode = match.matched_text ?? '';
  const lineEnd = match.line_end ?? match.line_start;

  const functionName = extractFunctionName(
    sourceCode,
    match.file_path,
    match.line_start,
    repositoryInfo.path
  );

  return {
    blockId,
    patternId: match.rule_id,
    location: {
      filePath: match.file_path,
      lineStart: match.line_start,
      lineEnd,
    },
    relativePath: match.file_path,
    sourceCode,
    language: detectLanguage(match.file_path),
    category,
    repositoryPath: repositoryInfo.path,
    lineCount: lineEnd - match.line_start + 1,
    tags: functionName ? [`${BLOCK_EXTRACTION.FUNCTION_TAG_PREFIX}${functionName}`] : [],
  };
}

export function extractCodeBlocks(
  patternMatches: MatchDict[],
  repositoryInfo: RepoInfoDict
): CodeBlock[] {
  _debug(`extract_code_blocks: repository_info=${JSON.stringify(repositoryInfo)}`);
  _debug(`extract_code_blocks: got ${patternMatches.length} pattern matches`);

  const blocks: CodeBlock[] = [];

  for (let i = 0; i < patternMatches.length; i++) {
    const match = patternMatches[i];
    if (i === 0) {
      _debug(`first match: file_path=${match.file_path}, line_start=${match.line_start}`);
    }

    try {
      const block = _createCodeBlock(match, repositoryInfo);
      if (i < BLOCK_EXTRACTION.DEBUG_LOG_BLOCK_LIMIT) {
        _debug(`block created: file=${block.relativePath}, line=${block.location.lineStart}, tags=${block.tags}`);
      }
      blocks.push(block);
    } catch (e) {
      process.stderr.write(`Error creating block: ${e}\n`);
    }
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

export function groupDuplicates(blocks: CodeBlock[]): DuplicateGroup[] {
  return groupBySimilarity(blocks, SUGGESTION_DEFAULTS.GROUPING_SIMILARITY_THRESHOLD);
}

// ---------------------------------------------------------------------------
// Strategy Determination
// ---------------------------------------------------------------------------

interface StrategyRule {
  maxOccurrences: number | null;
  strategy: string;
  rationaleTemplate: string;
  complexity: string;
  risk: string;
}

const CATEGORY_STRATEGY_RULES: Record<string, StrategyRule[]> = {
  logger: [
    { maxOccurrences: STRATEGY_THRESHOLDS.LOGGER_LOCAL_MAX, strategy: 'local_util', rationaleTemplate: 'Logger/config pattern used {occ} times - extract to module constant', complexity: 'trivial', risk: 'minimal' },
    { maxOccurrences: null, strategy: 'shared_package', rationaleTemplate: 'Logger/config pattern used {occ} times across {files} files - centralize configuration', complexity: 'simple', risk: 'low' },
  ],
  config_access: [
    { maxOccurrences: STRATEGY_THRESHOLDS.LOGGER_LOCAL_MAX, strategy: 'local_util', rationaleTemplate: 'Logger/config pattern used {occ} times - extract to module constant', complexity: 'trivial', risk: 'minimal' },
    { maxOccurrences: null, strategy: 'shared_package', rationaleTemplate: 'Logger/config pattern used {occ} times across {files} files - centralize configuration', complexity: 'simple', risk: 'low' },
  ],
  api_handler: [
    { maxOccurrences: STRATEGY_THRESHOLDS.API_LOCAL_MAX, strategy: 'local_util', rationaleTemplate: 'API pattern used {occ} times - extract to middleware/util', complexity: 'simple', risk: 'low' },
    { maxOccurrences: STRATEGY_THRESHOLDS.API_SHARED_MAX, strategy: 'shared_package', rationaleTemplate: 'API pattern used {occ} times across {files} files - create shared middleware', complexity: 'moderate', risk: 'medium' },
    { maxOccurrences: null, strategy: 'mcp_server', rationaleTemplate: 'API pattern used {occ} times - candidate for framework/MCP abstraction', complexity: 'complex', risk: 'high' },
  ],
  auth_check: [
    { maxOccurrences: STRATEGY_THRESHOLDS.API_LOCAL_MAX, strategy: 'local_util', rationaleTemplate: 'API pattern used {occ} times - extract to middleware/util', complexity: 'simple', risk: 'low' },
    { maxOccurrences: STRATEGY_THRESHOLDS.API_SHARED_MAX, strategy: 'shared_package', rationaleTemplate: 'API pattern used {occ} times across {files} files - create shared middleware', complexity: 'moderate', risk: 'medium' },
    { maxOccurrences: null, strategy: 'mcp_server', rationaleTemplate: 'API pattern used {occ} times - candidate for framework/MCP abstraction', complexity: 'complex', risk: 'high' },
  ],
  error_handler: [
    { maxOccurrences: STRATEGY_THRESHOLDS.API_LOCAL_MAX, strategy: 'local_util', rationaleTemplate: 'API pattern used {occ} times - extract to middleware/util', complexity: 'simple', risk: 'low' },
    { maxOccurrences: STRATEGY_THRESHOLDS.API_SHARED_MAX, strategy: 'shared_package', rationaleTemplate: 'API pattern used {occ} times across {files} files - create shared middleware', complexity: 'moderate', risk: 'medium' },
    { maxOccurrences: null, strategy: 'mcp_server', rationaleTemplate: 'API pattern used {occ} times - candidate for framework/MCP abstraction', complexity: 'complex', risk: 'high' },
  ],
  database_operation: [
    { maxOccurrences: STRATEGY_THRESHOLDS.DB_LOCAL_MAX, strategy: 'local_util', rationaleTemplate: 'Database pattern used {occ} times - extract to repository method', complexity: 'moderate', risk: 'medium' },
    { maxOccurrences: null, strategy: 'shared_package', rationaleTemplate: 'Database pattern used {occ} times - create shared query builder', complexity: 'complex', risk: 'high' },
  ],
};

const DEFAULT_STRATEGY_RULES: StrategyRule[] = [
  { maxOccurrences: STRATEGY_THRESHOLDS.DEFAULT_LOCAL_MAX, strategy: 'local_util', rationaleTemplate: 'Utility pattern used {occ} times in {files} files - extract to local util', complexity: 'simple', risk: 'minimal' },
  { maxOccurrences: STRATEGY_THRESHOLDS.DEFAULT_SHARED_MAX, strategy: 'shared_package', rationaleTemplate: 'Utility pattern used {occ} times across {files} files - create shared utility', complexity: 'simple', risk: 'low' },
  { maxOccurrences: null, strategy: 'mcp_server', rationaleTemplate: 'Utility pattern used {occ} times - consider MCP tool or shared package', complexity: 'moderate', risk: 'medium' },
];

function _applyStrategyRules(
  rules: StrategyRule[],
  occurrences: number,
  files: number
): [string, string, string, string] {
  for (const rule of rules) {
    if (rule.maxOccurrences === null || occurrences <= rule.maxOccurrences) {
      const rationale = rule.rationaleTemplate
        .replace('{occ}', String(occurrences))
        .replace('{files}', String(files));
      return [rule.strategy, rationale, rule.complexity, rule.risk];
    }
  }
  const last = rules[rules.length - 1];
  return [
    last.strategy,
    last.rationaleTemplate.replace('{occ}', String(occurrences)).replace('{files}', String(files)),
    last.complexity,
    last.risk,
  ];
}

function _determineStrategy(group: DuplicateGroup): [string, string, string, string] {
  const occurrences = group.occurrenceCount;
  const files = group.affectedFiles.length;
  const category = group.category;

  if (files === 1) {
    return [
      'local_util',
      `All ${occurrences} occurrences in same file - extract to local function`,
      'trivial',
      'minimal',
    ];
  }

  const rules = CATEGORY_STRATEGY_RULES[category] ?? DEFAULT_STRATEGY_RULES;
  return _applyStrategyRules(rules, occurrences, files);
}

// ---------------------------------------------------------------------------
// Suggestion Generation
// ---------------------------------------------------------------------------

function _generateMigrationSteps(
  _group: DuplicateGroup,
  strategy: string
): MigrationStep[] {
  let steps: Array<[string, boolean, string]>;

  if (strategy === 'local_util') {
    steps = [
      ['Create utility function in local utils module', true, '15min'],
      ['Extract common logic from duplicate blocks', false, '30min'],
      ['Replace each occurrence with function call', true, '20min'],
      ['Add unit tests for extracted function', false, '30min'],
      ['Run existing tests to verify behavior', true, '10min'],
    ];
  } else if (strategy === 'shared_package') {
    steps = [
      ['Create shared package/module for utility', false, '1h'],
      ['Extract and parameterize common logic', false, '1h'],
      ['Add comprehensive tests to shared package', false, '45min'],
      ['Update each file to import from shared package', true, '30min'],
      ['Replace duplicates with shared function calls', true, '30min'],
      ['Update package.json/requirements.txt dependencies', false, '15min'],
      ['Run full test suite across affected projects', true, '20min'],
    ];
  } else if (strategy === 'mcp_server') {
    steps = [
      ['Design MCP tool interface for functionality', false, '2h'],
      ['Create MCP server with tool implementation', false, '4h'],
      ['Add MCP tool schema and documentation', false, '1h'],
      ['Test MCP tool independently', false, '1h'],
      ['Update projects to use MCP client', false, '2h'],
      ['Replace duplicates with MCP tool calls', true, '1h'],
      ['Add integration tests', false, '2h'],
      ['Document MCP tool usage', false, '1h'],
    ];
  } else {
    steps = [
      ['Define agent capabilities and workflow', false, '3h'],
      ['Design agent prompt and tool access', false, '2h'],
      ['Implement agent logic and orchestration', false, '8h'],
      ['Create agent tests and safety checks', false, '3h'],
      ['Integrate agent with existing systems', false, '4h'],
      ['Replace complex duplicate logic with agent calls', false, '2h'],
      ['Monitor agent performance and behavior', false, 'ongoing'],
      ['Document agent usage and limitations', false, '2h'],
    ];
  }

  return steps.map(([description, automated, estimatedTime], i) => ({
    stepNumber: i + 1,
    description,
    automated,
    estimatedTime,
  }));
}

function _generateCodeExample(group: DuplicateGroup, strategy: string): string {
  const category = group.category;

  if (strategy === 'local_util') {
    if (category === 'logger') {
      return `// Before:
logger.info({ userId }, 'User action');
logger.info({ userId }, 'User action');

// After:
const logUserAction = (userId) => logger.info({ userId }, 'User action');
logUserAction(userId);
logUserAction(userId);`;
    }
    return `// Before: Duplicated code in multiple places
function foo() {
  // ... duplicate logic ...
}

// After: Extracted to utility function
import { sharedUtil } from './utils';
function foo() {
  sharedUtil();
}`;
  }

  if (strategy === 'shared_package') {
    return `// Before: Duplicated across files
// file1.js: { check logic }
// file2.js: { check logic }

// After: Shared package
import { validateInput } from '@shared/validators';
validateInput(data);`;
  }

  if (strategy === 'mcp_server') {
    return `// Before: Complex duplicated logic
async function processData() {
  // ... complex logic ...
}

// After: MCP tool
const result = await mcp.callTool('process-data', { input });`;
  }

  return '// Refactoring example not available';
}

function _calculateRoi(group: DuplicateGroup, complexity: string, risk: string): number {
  const impactScore = computeImpactScore(group);
  let roi = impactScore;

  const complexityMultipliers: Record<string, number> = {
    trivial: ROI_MULTIPLIERS.COMPLEXITY_TRIVIAL,
    simple: ROI_MULTIPLIERS.COMPLEXITY_SIMPLE,
    moderate: ROI_MULTIPLIERS.COMPLEXITY_MODERATE,
    complex: ROI_MULTIPLIERS.COMPLEXITY_COMPLEX,
  };
  roi *= complexityMultipliers[complexity] ?? 1.0;

  const riskMultipliers: Record<string, number> = {
    minimal: ROI_MULTIPLIERS.RISK_MINIMAL,
    low: ROI_MULTIPLIERS.RISK_LOW,
    medium: ROI_MULTIPLIERS.RISK_MEDIUM,
    high: ROI_MULTIPLIERS.RISK_HIGH,
  };
  roi *= riskMultipliers[risk] ?? 1.0;

  return Math.min(roi, SCAN_DEFAULTS.PERCENTAGE_MAX);
}

function _isBreakingChange(group: DuplicateGroup, strategy: string): boolean {
  if (strategy === 'local_util') return false;
  if (strategy === 'shared_package') {
    return group.category === 'api_handler' || group.category === 'auth_check';
  }
  return true;
}

function _suggestTargetLocation(group: DuplicateGroup, strategy: string): string {
  if (strategy === 'local_util') {
    const firstFile = group.affectedFiles[0] ?? '';
    if (firstFile.includes('/')) {
      const dirPath = firstFile.split('/').slice(0, -1).join('/');
      return `${dirPath}/utils.js`;
    }
    return 'utils.js';
  }

  if (strategy === 'shared_package') {
    const category = group.category;
    if (category === 'logger') return 'shared/logging/logger-utils.js';
    if (category === 'api_handler' || category === 'auth_check') return 'shared/middleware/auth-middleware.js';
    if (category === 'database_operation') return 'shared/database/query-builder.js';
    if (category === 'validator') return 'shared/validation/validators.js';
    return `shared/utils/${category}.js`;
  }

  if (strategy === 'mcp_server') return `mcp-servers/${group.patternId}-server/`;
  return `agents/${group.patternId}-agent/`;
}

function _estimateEffort(group: DuplicateGroup, complexity: string): number {
  let hours: number;
  try {
    const tier = complexity as EffortTier;
    hours = EFFORT_IMPLEMENTATION_HOURS_BY_TIER[tier] ?? EFFORT_IMPLEMENTATION_DEFAULT_HOURS;
  } catch {
    hours = EFFORT_IMPLEMENTATION_DEFAULT_HOURS;
  }

  hours += group.affectedFiles.length * EFFORT_IMPLEMENTATION_PER_FILE_INCREMENT_HOURS;
  hours += EFFORT_IMPLEMENTATION_TESTING_OVERHEAD_HOURS;

  return Math.round(hours * 10) / 10;
}

export function generateSuggestions(groups: DuplicateGroup[]): ConsolidationSuggestion[] {
  const suggestions: ConsolidationSuggestion[] = [];

  for (const group of groups) {
    const [strategy, rationale, complexity, risk] = _determineStrategy(group);
    const migrationSteps = _generateMigrationSteps(group, strategy);
    const codeExample = _generateCodeExample(group, strategy);
    const roiScore = _calculateRoi(group, complexity, risk);
    const breakingChanges = _isBreakingChange(group, strategy);
    const impactScore = computeImpactScore(group);

    suggestions.push({
      suggestionId: `cs_${group.groupId}`,
      duplicateGroupId: group.groupId,
      strategy,
      strategyRationale: rationale,
      targetLocation: _suggestTargetLocation(group, strategy),
      migrationSteps,
      codeExample,
      impactScore: Math.min(impactScore, SCAN_DEFAULTS.PERCENTAGE_MAX),
      complexity,
      migrationRisk: risk,
      estimatedEffortHours: _estimateEffort(group, complexity),
      breakingChanges,
      affectedFilesCount: group.affectedFiles.length,
      affectedRepositoriesCount: group.affectedRepositories.length,
      confidence:
        group.similarityScore >= CONFIDENCE_THRESHOLDS.HIGH_SIMILARITY
          ? CONFIDENCE_THRESHOLDS.HIGH_CONFIDENCE
          : CONFIDENCE_THRESHOLDS.LOW_CONFIDENCE,
      roiScore,
    });
  }

  return suggestions;
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export function calculateMetrics(
  blocks: CodeBlock[],
  groups: DuplicateGroup[],
  suggestions: ConsolidationSuggestion[],
  totalRepoLines = 0
): Record<string, unknown> {
  const exactGroups = groups.filter((g) => g.similarityMethod === 'exact_match');
  const structuralGroups = groups.filter((g) => g.similarityMethod === 'structural');
  const semanticGroups = groups.filter((g) => g.similarityMethod === 'semantic');

  const totalDuplicatedLines = groups.reduce((sum, g) => sum + g.totalLines, 0);
  const semanticDuplicateLines = semanticGroups.reduce((sum, g) => sum + g.totalLines, 0);
  const potentialLocReduction = groups.reduce(
    (sum, g) => sum + g.totalLines - Math.floor(g.totalLines / g.occurrenceCount),
    0
  );

  let repoLines = totalRepoLines;
  if (repoLines <= 0) {
    repoLines = blocks.reduce((sum, b) => sum + b.lineCount, 0);
  }

  const duplicationPercentage =
    repoLines > 0 ? (totalDuplicatedLines / repoLines) * 100 : 0.0;

  const quickWins = groups.filter(
    (g) =>
      g.occurrenceCount <= EXTRACTION_DEFAULTS.QUICK_WIN_MAX_OCCURRENCES &&
      g.affectedFiles.length === 1
  );

  const highImpact = groups.filter(
    (g) =>
      g.totalLines >= EXTRACTION_DEFAULTS.HIGH_IMPACT_MIN_LINES ||
      g.occurrenceCount >= EXTRACTION_DEFAULTS.HIGH_IMPACT_MIN_OCCURRENCES
  );

  const blocksWithTags = blocks.filter((b) => b.tags.length > 0).length;
  const totalTags = blocks.reduce((sum, b) => sum + b.tags.length, 0);
  const blocksWithTagsPercentage = blocks.length > 0
    ? Math.round((blocksWithTags / blocks.length) * 10000) / 100
    : 0.0;
  const avgTagsPerBlock = blocks.length > 0
    ? Math.round((totalTags / blocks.length) * 100) / 100
    : 0.0;

  return {
    total_code_blocks: blocks.length,
    total_duplicate_groups: groups.length,
    exact_duplicates: exactGroups.length,
    structural_duplicates: structuralGroups.length,
    semantic_duplicates: semanticGroups.length,
    semantic_duplicate_lines: semanticDuplicateLines,
    total_duplicated_lines: totalDuplicatedLines,
    potential_loc_reduction: potentialLocReduction,
    duplication_percentage: Math.round(duplicationPercentage * 100) / 100,
    total_suggestions: suggestions.length,
    quick_wins: quickWins.length,
    high_impact_suggestions: highImpact.length,
    trivial_suggestions: suggestions.filter((s) => s.complexity === 'trivial').length,
    simple_suggestions: suggestions.filter((s) => s.complexity === 'simple').length,
    moderate_suggestions: suggestions.filter((s) => s.complexity === 'moderate').length,
    complex_suggestions: suggestions.filter((s) => s.complexity === 'complex').length,
    high_priority_suggestions: suggestions.filter(
      (s) => s.impactScore >= SCORING_THRESHOLDS.CRITICAL
    ).length,
    blocks_with_tags: blocksWithTags,
    blocks_with_tags_percentage: blocksWithTagsPercentage,
    avg_tags_per_block: avgTagsPerBlock,
  };
}

// ---------------------------------------------------------------------------
// Pipeline Orchestrator
// ---------------------------------------------------------------------------

export interface PipelineOutput {
  code_blocks: Record<string, unknown>[];
  duplicate_groups: Record<string, unknown>[];
  suggestions: Record<string, unknown>[];
  metrics: Record<string, unknown>;
}

/** Convert camelCase CodeBlock to snake_case for JSON output parity */
function blockToJson(b: CodeBlock): Record<string, unknown> {
  return {
    block_id: b.blockId,
    pattern_id: b.patternId,
    location: {
      file_path: b.location.filePath,
      line_start: b.location.lineStart,
      line_end: b.location.lineEnd,
      column_start: b.location.columnStart,
      column_end: b.location.columnEnd,
    },
    relative_path: b.relativePath,
    source_code: b.sourceCode,
    normalized_code: b.normalizedCode ?? null,
    language: b.language,
    category: b.category,
    tags: b.tags,
    repository_path: b.repositoryPath,
    repository_name: b.repositoryName ?? null,
    git_commit: b.gitCommit ?? null,
    line_count: b.lineCount,
    complexity_score: b.complexityScore ?? null,
    content_hash: computeContentHash(b.sourceCode),
    structural_hash: b.astHash ?? computeContentHash(b.sourceCode),
  };
}

function groupToJson(g: DuplicateGroup): Record<string, unknown> {
  return {
    group_id: g.groupId,
    pattern_id: g.patternId,
    member_block_ids: g.memberBlockIds,
    similarity_score: g.similarityScore,
    similarity_method: g.similarityMethod,
    category: g.category,
    language: g.language,
    occurrence_count: g.occurrenceCount,
    total_lines: g.totalLines,
    affected_files: g.affectedFiles,
    affected_repositories: g.affectedRepositories,
    deduplication_potential: computeDeduplicationPotentialFromGroup(g),
    impact_score: computeImpactScore(g),
  };
}

function computeDeduplicationPotentialFromGroup(g: DuplicateGroup): number {
  if (g.occurrenceCount <= 1) return 0;
  const avgLines = g.totalLines / g.occurrenceCount;
  return Math.floor((g.occurrenceCount - 1) * avgLines);
}

function suggestionToJson(s: ConsolidationSuggestion): Record<string, unknown> {
  return {
    suggestion_id: s.suggestionId,
    duplicate_group_id: s.duplicateGroupId,
    strategy: s.strategy,
    strategy_rationale: s.strategyRationale,
    target_location: s.targetLocation ?? null,
    migration_steps: s.migrationSteps.map((step) => ({
      step_number: step.stepNumber,
      description: step.description,
      automated: step.automated,
      estimated_time: step.estimatedTime ?? null,
    })),
    code_example: s.codeExample ?? null,
    impact_score: s.impactScore,
    complexity: s.complexity,
    migration_risk: s.migrationRisk,
    estimated_effort_hours: s.estimatedEffortHours ?? null,
    breaking_changes: s.breakingChanges,
    affected_files_count: s.affectedFilesCount,
    affected_repositories_count: s.affectedRepositoriesCount,
    confidence: s.confidence,
    roi_score: s.roiScore ?? null,
  };
}

/**
 * Run the full extraction + grouping + suggestion pipeline.
 *
 * Accepts validated pipeline input and returns JSON-serializable output.
 */
export function runPipeline(input: PipelineInput): PipelineOutput {
  const repositoryInfo = input.repository_info;
  const patternMatches = input.pattern_matches as MatchDict[];

  _debug(`Validated ${patternMatches.length} pattern matches from ${repositoryInfo.path}`);

  // Stage 3: Extract code blocks
  let blocks = extractCodeBlocks(patternMatches, repositoryInfo);

  // Stage 3.5: Deduplicate
  blocks = deduplicateBlocks(blocks);

  // Stage 5: Group duplicates (includes Layer 3 semantic annotation)
  const groups = groupDuplicates(blocks);

  // Stage 6: Generate suggestions
  const suggestions = generateSuggestions(groups);

  // Stage 7: Calculate metrics
  const totalRepoLines = input.total_repo_lines ?? 0;
  const metrics = calculateMetrics(blocks, groups, suggestions, totalRepoLines);

  return {
    code_blocks: blocks.map(blockToJson),
    duplicate_groups: groups.map(groupToJson),
    suggestions: suggestions.map(suggestionToJson),
    metrics,
  };
}

/**
 * Run the pipeline with raw (unvalidated) input.
 * Validates via Zod schema first.
 */
export function runPipelineFromRaw(rawInput: unknown): PipelineOutput {
  const validated = PipelineInputSchema.parse(rawInput);
  return runPipeline(validated);
}

// ---------------------------------------------------------------------------
// CLI Entry Point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer);
    }
    const rawInput = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
    const result = runPipelineFromRaw(rawInput);
    process.stdout.write(JSON.stringify(result, null, 2));
  } catch (e) {
    process.stderr.write(`Pipeline error: ${e}\n`);
    process.exit(1);
  }
}

// Only run main when executed directly
const isMainModule =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('extract-blocks.ts') || process.argv[1].endsWith('extract-blocks.js'));

if (isMainModule) {
  main();
}

/**
 * Pipeline-specific constants for the duplicate detection pipeline.
 *
 * Ports Python constants.py values not already in sidequest/core/constants.ts.
 * Uses `as const` pattern matching structural.ts.
 */

export const EffortTier = {
  TRIVIAL: 'trivial',
  SIMPLE: 'simple',
  MODERATE: 'moderate',
  COMPLEX: 'complex',
  VERY_COMPLEX: 'very_complex',
} as const;
export type EffortTier = (typeof EffortTier)[keyof typeof EffortTier];

export const SCAN_DEFAULTS = {
  MIN_SIMILARITY_THRESHOLD: 0.8,
  MIN_DUPLICATE_SIZE: 3,
  CONTENT_HASH_LENGTH: 16,
  QUICK_WINS_RECOMMEND_THRESHOLD: 5,
  HIGH_DUPLICATION_PCT: 10,
  DEBUG_HASH_DISPLAY_LIMIT: 20,
  PERCENTAGE_MAX: 100.0,
} as const;

export const SCORING_THRESHOLDS = {
  CRITICAL: 75,
  HIGH: 50,
  MEDIUM: 25,
} as const;

export const IMPACT_WEIGHTS = {
  OCCURRENCE: 40,
  SIMILARITY: 35,
  SIZE: 25,
  OCCURRENCE_CAP: 20.0,
  LOC_CAP: 100.0,
} as const;

export const DUPLICATION_THRESHOLDS = {
  MINIMAL_PCT: 5,
  LOW_PCT: 10,
  MODERATE_PCT: 20,
  HIGH_PCT: 40,
  QUICK_WIN_CAP: 10,
} as const;

export const EXTRACTION_DEFAULTS = {
  SEARCH_WINDOW: 10,
  MIN_GROUP_SIZE: 2,
  QUICK_WIN_MAX_OCCURRENCES: 3,
  HIGH_IMPACT_MIN_LINES: 20,
  HIGH_IMPACT_MIN_OCCURRENCES: 5,
  HIGH_PRIORITY_SCORE: 75,
  METHOD_CHAIN_MAX_GAP: 100,
} as const;

export const BLOCK_EXTRACTION = {
  FUNCTION_TAG_PREFIX: 'function:',
  BLOCK_HASH_LENGTH: 12,
  DEBUG_LOG_DEDUP_LIMIT: 10,
  DEBUG_LOG_BLOCK_LIMIT: 3,
} as const;

export const SEMANTIC_WEIGHTS = {
  OPERATIONS: 0.40,
  DOMAINS: 0.25,
  PATTERNS: 0.20,
  DATA_TYPES: 0.15,
  EMPTY_SET_SIMILARITY: 0.5,
  BOTH_EMPTY_SIMILARITY: 1.0,
  LINE_RATIO_THRESHOLD: 0.5,
  PARTIAL_TAG_OVERLAP: 0.5,
} as const;

export const CONFIDENCE_THRESHOLDS = {
  HIGH_SIMILARITY: 0.95,
  HIGH_CONFIDENCE: 0.9,
  LOW_CONFIDENCE: 0.7,
} as const;

export const ROI_MULTIPLIERS = {
  COMPLEXITY_TRIVIAL: 1.3,
  COMPLEXITY_SIMPLE: 1.1,
  COMPLEXITY_MODERATE: 0.9,
  COMPLEXITY_COMPLEX: 0.7,
  RISK_MINIMAL: 1.2,
  RISK_LOW: 1.1,
  RISK_MEDIUM: 0.9,
  RISK_HIGH: 0.7,
} as const;

export const STRATEGY_THRESHOLDS = {
  LOGGER_LOCAL_MAX: 5,
  API_LOCAL_MAX: 3,
  API_SHARED_MAX: 10,
  DEFAULT_LOCAL_MAX: 3,
  DEFAULT_SHARED_MAX: 8,
  DB_LOCAL_MAX: 3,
} as const;

export const SUGGESTION_DEFAULTS = {
  GROUPING_SIMILARITY_THRESHOLD: 0.85,
  DEFAULT_EFFORT_FALLBACK: 10,
  ROI_NORMALIZER: 10,
  QUICK_WIN_MIN_IMPACT: 60,
} as const;

export const VALIDATION_LIMITS = {
  FILE_PATH_MAX: 500,
  MATCHED_TEXT_MAX: 100_000,
  LINE_NUMBER_MAX: 1_000_000,
  COLUMN_MAX: 10_000,
  SEVERITY_MAX: 20,
  REPO_PATH_MAX: 1000,
  REPO_NAME_MAX: 200,
  GIT_REMOTE_MAX: 500,
  GIT_BRANCH_MAX: 200,
  GIT_COMMIT_MAX: 50,
  RULE_ID_MAX: 100,
  PATTERN_MATCHES_MAX: 50_000,
} as const;

/** ROI model: broader strategic effort estimates (hours) */
export const EFFORT_ROI_HOURS_BY_TIER: Record<EffortTier, number> = {
  [EffortTier.TRIVIAL]: 0.5,
  [EffortTier.SIMPLE]: 2.5,
  [EffortTier.MODERATE]: 12.0,
  [EffortTier.COMPLEX]: 40.0,
  [EffortTier.VERY_COMPLEX]: 80.0,
};

/** Refactor implementation model: concrete engineering effort (hours) */
export const EFFORT_IMPLEMENTATION_HOURS_BY_TIER: Partial<Record<EffortTier, number>> = {
  [EffortTier.TRIVIAL]: 0.5,
  [EffortTier.SIMPLE]: 1.0,
  [EffortTier.MODERATE]: 3.0,
  [EffortTier.COMPLEX]: 8.0,
};

export const EFFORT_IMPLEMENTATION_DEFAULT_HOURS = 2.0;
export const EFFORT_IMPLEMENTATION_PER_FILE_INCREMENT_HOURS = 0.25;
export const EFFORT_IMPLEMENTATION_TESTING_OVERHEAD_HOURS = 0.5;

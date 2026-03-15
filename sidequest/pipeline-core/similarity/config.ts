/**
 * Similarity Algorithm Configuration
 *
 * Centralized configuration for all similarity thresholds and parameters.
 * Ports Python config.py with env var overrides.
 */

function envFloat(key: string, fallback: number): number {
  const val = process.env[key];
  if (val === undefined) return fallback;
  const parsed = parseFloat(val);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function envInt(key: string, fallback: number): number {
  const val = process.env[key];
  if (val === undefined) return fallback;
  const parsed = parseInt(val, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function envBool(key: string): boolean {
  const val = (process.env[key] ?? '').toLowerCase();
  return val === '1' || val === 'true' || val === 'yes';
}

export const SIMILARITY_CONFIG = {
  /** Debug mode - set PIPELINE_DEBUG=1 to enable verbose output */
  DEBUG: envBool('PIPELINE_DEBUG'),

  // Layer 0: Complexity filtering
  MIN_LINE_COUNT: envInt('MIN_LINE_COUNT', 1),
  MIN_UNIQUE_TOKENS: envInt('MIN_UNIQUE_TOKENS', 5),

  // Layer 2: Structural similarity
  STRUCTURAL_THRESHOLD: envFloat('STRUCTURAL_THRESHOLD', 0.90),

  // Penalties
  OPPOSITE_LOGIC_PENALTY: envFloat('OPPOSITE_LOGIC_PENALTY', 0.8),
  STATUS_CODE_PENALTY: envFloat('STATUS_CODE_PENALTY', 0.7),
  SEMANTIC_METHOD_PENALTY: envFloat('SEMANTIC_METHOD_PENALTY', 0.85),

  // Method chain validation
  CHAIN_WEIGHT_LEVENSHTEIN: envFloat('CHAIN_WEIGHT_LEVENSHTEIN', 0.7),
  CHAIN_WEIGHT_CHAIN: envFloat('CHAIN_WEIGHT_CHAIN', 0.3),

  // Layer 3: Semantic validation
  MIN_COMPLEXITY_RATIO: envFloat('MIN_COMPLEXITY_RATIO', 0.5),
  SEMANTIC_SIMILARITY_THRESHOLD: envFloat('SEMANTIC_SIMILARITY_THRESHOLD', 0.70),

  // Layer 4: Quality filtering
  MIN_GROUP_QUALITY: envFloat('MIN_GROUP_QUALITY', 0.70),

  // Quality score weights
  QUALITY_WEIGHT_SIMILARITY: envFloat('QUALITY_WEIGHT_SIMILARITY', 0.4),
  QUALITY_WEIGHT_SIZE: envFloat('QUALITY_WEIGHT_SIZE', 0.2),
  QUALITY_WEIGHT_COMPLEXITY: envFloat('QUALITY_WEIGHT_COMPLEXITY', 0.2),
  QUALITY_WEIGHT_SEMANTIC: envFloat('QUALITY_WEIGHT_SEMANTIC', 0.2),

  // Quality normalization factors
  SIZE_NORMALIZATION: envFloat('SIZE_NORMALIZATION', 4.0),
  COMPLEXITY_NORMALIZATION: envFloat('COMPLEXITY_NORMALIZATION', 10.0),

  // Semantic consistency scores
  SEMANTIC_PERFECT_CONSISTENCY: 1.0,
  SEMANTIC_SAME_CATEGORY: 0.7,
  SEMANTIC_SAME_PATTERN: 0.5,
  SEMANTIC_MIXED: 0.3,
} as const;

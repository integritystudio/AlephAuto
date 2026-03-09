/**
 * Shared scoring thresholds used across health, reporting, and schema utilities.
 */
export const HEALTH_SCORE_THRESHOLDS = {
  HEALTHY_MIN_SCORE: 90,
  WARNING_MIN_SCORE: 70,
} as const;

export const REPORT_SCORE_CLASS_THRESHOLDS = {
  IMPACT_HIGH_MIN_SCORE: 70,
  IMPACT_MEDIUM_MIN_SCORE: 40,
  ROI_HIGH_MIN_SCORE: 80,
  ROI_MEDIUM_MIN_SCORE: 50,
} as const;

export const SCHEMA_RATING_THRESHOLDS = {
  EXCELLENT_MIN_SCORE: 80,
  GOOD_MIN_SCORE: 60,
  FAIR_MIN_SCORE: 40,
} as const;


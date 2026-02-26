/**
 * Shared types for migration step data used across report generators, PR creator,
 * and migration transformer.
 */

export interface MigrationStep {
  description: string;
  step_number?: number;
  code_example?: string;
  automated?: boolean;
  estimated_time?: string;
}

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

export type ParsedMigrationStep =
  | { type: 'update-import'; oldPath: string; newPath: string }
  | { type: 'replace-call'; oldName: string; newName: string }
  | { type: 'remove-declaration'; name: string }
  | { type: 'add-import'; imported: string; source: string };

export interface ParsedStep extends MigrationStep {
  parsed: ParsedMigrationStep | null;
  index: number;
}

export interface TransformResult {
  modified: boolean;
  transformations?: Array<Record<string, string>>;
  originalLength?: number;
  newLength?: number;
  reason?: string;
  error?: string;
}

export interface MigrationResult {
  filesModified: string[];
  transformations: Array<Record<string, unknown>>;
  errors: Array<{ file: string; error: string }>;
  backupPath: string | null;
}

export interface MigrationSuggestion {
  suggestion_id?: string;
  migration_steps?: MigrationStep[];
}

export interface MigrationTransformerOptions {
  dryRun?: boolean;
}

/**
 * Pipeline ID to Display Name Mapping
 *
 * Centralized mapping for all pipeline identifiers to human-readable names.
 * Used by API endpoints and dashboard UI for consistent naming.
 *
 * @module sidequest/utils/pipeline-names
 */

/**
 * Pipeline display name mappings
 */
export const PIPELINE_NAMES = {
  'duplicate-detection': 'Duplicate Detection',
  'repomix': 'Repomix Automation',
  'git-activity': 'Git Activity Reporter',
  'claude-health': 'Claude Health Monitor',
  'gitignore-manager': 'Gitignore Manager',
  'plugin-manager': 'Plugin Manager',
  'doc-enhancement': 'Doc Enhancement',
  'test-refactor': 'Test Refactor',
  'schema-enhancement': 'Schema Enhancement',
  'bugfix-audit': 'Bugfix Audit',
  'dashboard-populate': 'Dashboard Populate',
  'repo-cleanup': 'Repository Cleanup',
  'unknown': 'Unknown Pipeline'
} as const;

/**
 * Get human-readable display name for a pipeline ID
 */
export function getPipelineName(id: string): string {
  return (PIPELINE_NAMES as Record<string, string>)[id] || id;
}

/**
 * Get all known pipeline IDs
 */
export function getAllKnownPipelineIds(): string[] {
  return Object.keys(PIPELINE_NAMES);
}

/**
 * Check if a pipeline ID is known
 */
export function isKnownPipeline(id: string): boolean {
  return id in PIPELINE_NAMES;
}

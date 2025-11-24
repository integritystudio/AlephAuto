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
 * @type {Object.<string, string>}
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
  'unknown': 'Unknown Pipeline'
};

/**
 * Get human-readable display name for a pipeline ID
 *
 * @param {string} id - Pipeline identifier (e.g., 'duplicate-detection')
 * @returns {string} Display name (e.g., 'Duplicate Detection')
 *
 * @example
 * getPipelineName('duplicate-detection')
 * // Returns: 'Duplicate Detection'
 *
 * getPipelineName('custom-pipeline')
 * // Returns: 'custom-pipeline' (fallback to ID)
 */
export function getPipelineName(id) {
  return PIPELINE_NAMES[id] || id;
}

/**
 * Get all known pipeline IDs
 *
 * @returns {string[]} Array of pipeline identifiers
 */
export function getAllKnownPipelineIds() {
  return Object.keys(PIPELINE_NAMES);
}

/**
 * Check if a pipeline ID is known
 *
 * @param {string} id - Pipeline identifier
 * @returns {boolean} True if pipeline is in the known list
 */
export function isKnownPipeline(id) {
  return id in PIPELINE_NAMES;
}

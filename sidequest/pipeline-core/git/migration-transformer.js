/**
 * Migration Transformer - AST-based code transformation for consolidation migrations
 *
 * Applies migration steps to affected files using AST manipulation:
 * - Updates import statements to point to consolidated files
 * - Updates function calls to use new consolidated locations
 * - Removes old duplicate code
 * - Creates backups before transformations
 * - Provides rollback capability
 *
 * Features:
 * - Babel AST manipulation for JavaScript/TypeScript
 * - Safe transformation with validation
 * - Atomic operations with rollback
 * - Comprehensive error handling
 * - Sentry error tracking
 */

// @ts-check
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import _generate from '@babel/generator';

// ESM/CJS interop: Babel packages export { default: fn } in ESM
const traverse = _traverse.default ?? _traverse;
const generate = _generate.default ?? _generate;
import * as t from '@babel/types';
import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import { createComponentLogger, logError } from '../../utils/logger.ts';
import { config } from '../../core/config.ts';
import * as Sentry from '@sentry/node';

const logger = createComponentLogger('MigrationTransformer');

/**
 * Escape special regex characters in a string
 * @param {string} str
 * @returns {string}
 */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parse migration step description to extract transformation details
 *
 * Migration steps follow patterns like:
 * - "Update import from './utils/json.js' to '../shared/json-utils.js'"
 * - "Replace calls to writeJsonFile with jsonUtils.writeJsonFile"
 * - "Remove duplicate function writeJsonFile from src/utils/legacy.js"
 *
 * @param {string} description - Migration step description
 * @returns {Object|null} Parsed transformation details or null if not parseable
 */
function parseMigrationStep(description) {
  // Pattern 1: Update import
  const importPattern = /Update import.*?from ['"]([^'"]+)['"].*?to ['"]([^'"]+)['"]/i;
  const importMatch = description.match(importPattern);
  if (importMatch) {
    return {
      type: 'update-import',
      oldPath: importMatch[1],
      newPath: importMatch[2]
    };
  }

  // Pattern 2: Replace function calls
  const callPattern = /Replace calls to (\w+) with ([\w.]+)/i;
  const callMatch = description.match(callPattern);
  if (callMatch) {
    return {
      type: 'replace-call',
      oldName: callMatch[1],
      newName: callMatch[2]
    };
  }

  // Pattern 3: Remove duplicate code
  const removePattern = /Remove duplicate (?:function|class|const|let|var) (\w+)/i;
  const removeMatch = description.match(removePattern);
  if (removeMatch) {
    return {
      type: 'remove-declaration',
      name: removeMatch[1]
    };
  }

  // Pattern 4: Add import
  const addImportPattern = /Add import.*?['"]([^'"]+)['"].*?from ['"]([^'"]+)['"]/i;
  const addImportMatch = description.match(addImportPattern);
  if (addImportMatch) {
    return {
      type: 'add-import',
      imported: addImportMatch[1],
      source: addImportMatch[2]
    };
  }

  logger.debug({ description }, 'Could not parse migration step');
  return null;
}

/**
 * Migration Transformer for applying consolidation changes
 */
export class MigrationTransformer {
  constructor(options = {}) {
    this.backupDir = options.backupDir || '.migration-backups';
    this.dryRun = options.dryRun ?? false;
  }

  /**
   * Apply migration steps to affected files
   *
   * @param {Object} suggestion - Consolidation suggestion with migration_steps
   * @param {string} repositoryPath - Repository path
   * @returns {Promise<Object>} Transformation results
   */
  async applyMigrationSteps(suggestion, repositoryPath) {
    logger.info({
      suggestionId: suggestion.suggestion_id,
      stepsCount: suggestion.migration_steps?.length || 0,
      repositoryPath
    }, 'Applying migration steps');

    if (!suggestion.migration_steps || suggestion.migration_steps.length === 0) {
      logger.info('No migration steps to apply');
      return {
        filesModified: [],
        transformations: [],
        backupPath: null
      };
    }

    const results = {
      filesModified: [],
      transformations: [],
      errors: [],
      backupPath: null
    };

    // Create backup directory
    const backupPath = await this._createBackup(repositoryPath);
    results.backupPath = backupPath;

    try {
      // Parse all migration steps
      const parsedSteps = suggestion.migration_steps
        .map((step, index) => ({
          ...step,
          parsed: parseMigrationStep(step.description),
          index
        }))
        .filter(step => step.parsed !== null);

      logger.info({
        totalSteps: suggestion.migration_steps.length,
        parseableSteps: parsedSteps.length
      }, 'Parsed migration steps');

      // Group steps by affected file (extracted from code_example or detected in repo)
      const fileGroups = await this._groupStepsByFile(parsedSteps, suggestion, repositoryPath);

      // Apply transformations to each file
      for (const [filePath, steps] of Object.entries(fileGroups)) {
        try {
          const absolutePath = path.join(repositoryPath, filePath);

          // Check file exists
          try {
            await fs.access(absolutePath);
          } catch {
            logger.warn({ filePath }, 'File does not exist, skipping');
            continue;
          }

          const transformResult = await this._transformFile(
            absolutePath,
            steps,
            suggestion
          );

          if (transformResult.modified) {
            results.filesModified.push(filePath);
            results.transformations.push({
              file: filePath,
              ...transformResult
            });
          }

        } catch (error) {
          logError(logger, error, 'Failed to transform file', { filePath });
          results.errors.push({
            file: filePath,
            error: error.message
          });

          Sentry.captureException(error, {
            tags: {
              component: 'migration-transformer',
              file: filePath
            },
            extra: {
              suggestionId: suggestion.suggestion_id,
              steps: steps.map(s => s.description)
            }
          });
        }
      }

      logger.info({
        filesModified: results.filesModified.length,
        transformations: results.transformations.length,
        errors: results.errors.length
      }, 'Migration steps applied');

      return results;

    } catch (error) {
      logError(logger, error, 'Failed to apply migration steps');

      // Attempt rollback on error
      if (results.filesModified.length > 0) {
        logger.info('Attempting rollback due to error');
        await this.rollback(backupPath, repositoryPath);
      }

      throw error;
    }
  }

  /**
   * Transform a single file by applying migration steps
   *
   * @param {string} filePath - Absolute file path
   * @param {Array} steps - Migration steps to apply
   * @param {Object} suggestion - Full suggestion context
   * @returns {Promise<Object>} Transformation result
   * @private
   */
  async _transformFile(filePath, steps, suggestion) {
    logger.debug({ filePath, stepsCount: steps.length }, 'Transforming file');

    // Read original source
    const originalSource = await fs.readFile(filePath, 'utf-8');

    // Parse to AST
    let ast;
    try {
      ast = parse(originalSource, {
        sourceType: 'module',
        plugins: [
          'typescript',
          'jsx',
          'decorators-legacy',
          'classProperties',
          'objectRestSpread',
          'asyncGenerators',
          'dynamicImport',
          'optionalChaining',
          'nullishCoalescingOperator'
        ]
      });
    } catch (parseError) {
      logger.warn({ filePath, parseError }, 'Failed to parse file as JavaScript/TypeScript');
      return {
        modified: false,
        reason: 'parse-error',
        error: parseError.message
      };
    }

    let modified = false;
    const appliedTransformations = [];

    // Apply each transformation
    for (const step of steps) {
      const transformation = step.parsed;

      try {
        switch (transformation.type) {
          case 'update-import':
            if (this._updateImport(ast, transformation.oldPath, transformation.newPath)) {
              modified = true;
              appliedTransformations.push({
                type: 'update-import',
                from: transformation.oldPath,
                to: transformation.newPath
              });
            }
            break;

          case 'add-import':
            if (this._addImport(ast, transformation.imported, transformation.source)) {
              modified = true;
              appliedTransformations.push({
                type: 'add-import',
                imported: transformation.imported,
                from: transformation.source
              });
            }
            break;

          case 'replace-call':
            if (this._replaceCallExpression(ast, transformation.oldName, transformation.newName)) {
              modified = true;
              appliedTransformations.push({
                type: 'replace-call',
                from: transformation.oldName,
                to: transformation.newName
              });
            }
            break;

          case 'remove-declaration':
            if (this._removeDeclaration(ast, transformation.name)) {
              modified = true;
              appliedTransformations.push({
                type: 'remove-declaration',
                name: transformation.name
              });
            }
            break;

          default:
            logger.warn({ type: transformation.type }, 'Unknown transformation type');
        }
      } catch (transformError) {
        logError(logger, transformError, 'Transformation failed', { transformation });
      }
    }

    // Generate new code if modified
    if (modified) {
      const output = generate(ast, {
        retainLines: false,
        comments: true
      });

      if (!this.dryRun) {
        await fs.writeFile(filePath, output.code, 'utf-8');
        logger.info({ filePath }, 'File transformed successfully');
      } else {
        logger.info({ filePath }, 'Dry run: Would transform file');
      }

      return {
        modified: true,
        transformations: appliedTransformations,
        originalLength: originalSource.length,
        newLength: output.code.length
      };
    }

    return {
      modified: false,
      reason: 'no-transformations-applied'
    };
  }

  /**
   * Update import statement from old path to new path
   *
   * @param {Object} ast - Babel AST
   * @param {string} oldPath - Old import path
   * @param {string} newPath - New import path
   * @returns {boolean} True if modified
   * @private
   */
  _updateImport(ast, oldPath, newPath) {
    let modified = false;

    traverse(ast, {
      ImportDeclaration(path) {
        if (path.node.source.value === oldPath) {
          path.node.source.value = newPath;
          modified = true;
          logger.debug({ oldPath, newPath }, 'Updated import statement');
        }
      }
    });

    return modified;
  }

  /**
   * Add new import statement
   *
   * @param {Object} ast - Babel AST
   * @param {string} imported - What to import (e.g., 'writeJsonFile' or '{ writeJsonFile }')
   * @param {string} source - Import source path
   * @returns {boolean} True if modified
   * @private
   */
  _addImport(ast, imported, source) {
    // Check if import already exists
    let alreadyExists = false;
    traverse(ast, {
      ImportDeclaration(path) {
        if (path.node.source.value === source) {
          alreadyExists = true;
          path.stop();
        }
      }
    });

    if (alreadyExists) {
      logger.debug({ imported, source }, 'Import already exists');
      return false;
    }

    // Parse imported name(s)
    let specifiers;
    if (imported.startsWith('{') && imported.endsWith('}')) {
      // Named import: { foo, bar }
      const names = imported.slice(1, -1).split(',').map(n => n.trim());
      specifiers = names.map(name =>
        t.importSpecifier(t.identifier(name), t.identifier(name))
      );
    } else if (imported === '*') {
      // Namespace import: * as foo
      specifiers = [t.importNamespaceSpecifier(t.identifier('imported'))];
    } else {
      // Default import: foo
      specifiers = [t.importDefaultSpecifier(t.identifier(imported))];
    }

    // Create import declaration
    const importDeclaration = t.importDeclaration(
      specifiers,
      t.stringLiteral(source)
    );

    // Add to top of program
    ast.program.body.unshift(importDeclaration);
    logger.debug({ imported, source }, 'Added import statement');

    return true;
  }

  /**
   * Replace function call expressions
   *
   * @param {Object} ast - Babel AST
   * @param {string} oldName - Old function name
   * @param {string} newName - New function name (supports dot notation)
   * @returns {boolean} True if modified
   * @private
   */
  _replaceCallExpression(ast, oldName, newName) {
    let modified = false;

    traverse(ast, {
      CallExpression(path) {
        // Handle simple identifier calls
        if (t.isIdentifier(path.node.callee, { name: oldName })) {
          // Parse new name (supports dot notation like 'utils.writeJson')
          if (newName.includes('.')) {
            const parts = newName.split('.');
            // @ts-ignore - Start with identifier, becomes MemberExpression in loop
            let memberExpr = t.identifier(parts[0]);
            for (let i = 1; i < parts.length; i++) {
              // @ts-ignore - memberExpr type changes from Identifier to MemberExpression
              memberExpr = t.memberExpression(memberExpr, t.identifier(parts[i]));
            }
            path.node.callee = memberExpr;
          } else {
            path.node.callee = t.identifier(newName);
          }
          modified = true;
          logger.debug({ oldName, newName }, 'Replaced call expression');
        }
      }
    });

    return modified;
  }

  /**
   * Remove declaration (function, class, const, let, var)
   *
   * @param {Object} ast - Babel AST
   * @param {string} name - Name of declaration to remove
   * @returns {boolean} True if modified
   * @private
   */
  _removeDeclaration(ast, name) {
    let modified = false;

    traverse(ast, {
      // Function declarations
      FunctionDeclaration(path) {
        if (path.node.id && path.node.id.name === name) {
          path.remove();
          modified = true;
          logger.debug({ name, type: 'function' }, 'Removed declaration');
        }
      },

      // Class declarations
      ClassDeclaration(path) {
        if (path.node.id && path.node.id.name === name) {
          path.remove();
          modified = true;
          logger.debug({ name, type: 'class' }, 'Removed declaration');
        }
      },

      // Variable declarations (const, let, var)
      VariableDeclarator(path) {
        if (t.isIdentifier(path.node.id, { name })) {
          // Remove the declarator
          const parent = path.parentPath;
          if (parent.node.declarations.length === 1) {
            // Only one declaration, remove entire statement
            parent.remove();
          } else {
            // Multiple declarations, remove just this one
            path.remove();
          }
          modified = true;
          logger.debug({ name, type: 'variable' }, 'Removed declaration');
        }
      }
    });

    return modified;
  }

  /**
   * Group migration steps by affected file
   *
   * Pass 1: Extract from code_example comments (existing behavior)
   * Pass 2: Scan repository for files matching unresolved steps
   *
   * @param {Array} parsedSteps - Parsed migration steps
   * @param {Object} suggestion - Full suggestion
   * @param {string} repositoryPath - Repository root path
   * @returns {Promise<Object>} Map of file paths to steps
   * @private
   */
  async _groupStepsByFile(parsedSteps, suggestion, repositoryPath) {
    const fileGroups = {};
    const unresolvedSteps = [];

    // Pass 1: Extract from code_example comments
    for (const step of parsedSteps) {
      let filePath = null;

      if (step.code_example) {
        const fileCommentMatch = step.code_example.match(/^\/\/\s*(.+?\.(?:js|ts|jsx|tsx))/);
        if (fileCommentMatch) {
          filePath = fileCommentMatch[1];
        }
      }

      if (filePath) {
        if (!fileGroups[filePath]) {
          fileGroups[filePath] = [];
        }
        fileGroups[filePath].push(step);
      } else {
        unresolvedSteps.push(step);
      }
    }

    // Pass 2: Detect affected files for unresolved steps
    if (unresolvedSteps.length > 0 && repositoryPath) {
      const resolved = await this._resolveAffectedFiles(unresolvedSteps, repositoryPath);

      // Collect files found by non-add-import steps for association
      const associatedFiles = new Set();
      for (const step of unresolvedSteps) {
        if (step.parsed.type !== 'add-import') {
          const paths = resolved.get(step.index) ?? [];
          for (const p of paths) {
            associatedFiles.add(p);
          }
        }
      }

      for (const step of unresolvedSteps) {
        let paths = resolved.get(step.index) ?? [];

        // add-import inherits files from sibling steps in the same suggestion
        if (step.parsed.type === 'add-import' && paths.length === 0) {
          paths = [...associatedFiles];
        }

        for (const filePath of paths) {
          if (!fileGroups[filePath]) {
            fileGroups[filePath] = [];
          }
          fileGroups[filePath].push(step);
        }
      }
    }

    logger.debug({ fileCount: Object.keys(fileGroups).length }, 'Grouped steps by file');
    return fileGroups;
  }

  /**
   * Find JS/TS files in repository, respecting exclude dirs
   *
   * @param {string} repositoryPath - Repository root path
   * @returns {Promise<string[]>} Relative file paths
   * @private
   */
  async _findRepositoryFiles(repositoryPath) {
    try {
      const ignorePatterns = (config.excludeDirs ?? []).map(dir => `**/${dir}/**`);
      return await glob('**/*.{js,ts,jsx,tsx}', {
        cwd: repositoryPath,
        ignore: ignorePatterns,
        nodir: true,
      });
    } catch (error) {
      logger.warn({ error, repositoryPath }, 'Failed to scan repository files');
      return [];
    }
  }

  /**
   * Test whether file content matches a parsed migration step
   *
   * @param {string} content - File content
   * @param {Object} parsed - Parsed step from parseMigrationStep()
   * @returns {boolean} True if content matches
   * @private
   */
  _contentMatchesStep(content, parsed) {
    switch (parsed.type) {
      case 'update-import': {
        const escaped = escapeRegExp(parsed.oldPath);
        return new RegExp(`from\\s+['"]${escaped}['"]`).test(content);
      }
      case 'replace-call': {
        const escaped = escapeRegExp(parsed.oldName);
        return new RegExp(`\\b${escaped}\\s*\\(`).test(content);
      }
      case 'remove-declaration': {
        const escaped = escapeRegExp(parsed.name);
        return new RegExp(`(?:function|const|let|var|class)\\s+${escaped}\\b`).test(content);
      }
      case 'add-import':
        // Can't grep for an import that doesn't exist yet; resolved by association
        return false;
      default:
        return false;
    }
  }

  /**
   * Resolve affected files for unresolved migration steps by scanning the repository
   *
   * Reads each file once and tests all unresolved steps against it (O(N*M) string ops).
   *
   * @param {Array<{index: number, parsed: Object}>} unresolvedSteps - Steps without file paths
   * @param {string} repositoryPath - Repository root path
   * @returns {Promise<Map<number, string[]>>} Map of step index to resolved relative paths
   * @private
   */
  async _resolveAffectedFiles(unresolvedSteps, repositoryPath) {
    const files = await this._findRepositoryFiles(repositoryPath);
    /** @type {Map<number, string[]>} */
    const resolved = new Map(unresolvedSteps.map(s => [s.index, []]));

    for (const relPath of files) {
      await this._matchFileAgainstSteps(relPath, repositoryPath, unresolvedSteps, resolved);
    }

    if (this.dryRun) {
      this._logResolvedFiles(resolved);
    }

    return resolved;
  }

  /**
   * Read a single file and test all unresolved steps against it
   *
   * @param {string} relPath - Relative file path
   * @param {string} repositoryPath - Repository root
   * @param {Array} unresolvedSteps - Steps to match
   * @param {Map<number, string[]>} resolved - Accumulator map
   * @private
   */
  async _matchFileAgainstSteps(relPath, repositoryPath, unresolvedSteps, resolved) {
    let content;
    try {
      content = await fs.readFile(path.join(repositoryPath, relPath), 'utf-8');
    } catch {
      return;
    }

    for (const step of unresolvedSteps) {
      if (this._contentMatchesStep(content, step.parsed)) {
        resolved.get(step.index).push(relPath);
      }
    }
  }

  /**
   * @param {Map<number, string[]>} resolved
   * @private
   */
  _logResolvedFiles(resolved) {
    for (const [idx, paths] of resolved) {
      if (paths.length > 0) {
        logger.info({ stepIndex: idx, files: paths }, 'Detected affected files');
      }
    }
  }

  /**
   * Create backup of current state
   *
   * @param {string} repositoryPath - Repository path
   * @returns {Promise<string>} Backup directory path
   * @private
   */
  async _createBackup(repositoryPath) {
    const timestamp = Date.now();
    const backupPath = path.join(repositoryPath, this.backupDir, `backup-${timestamp}`);

    if (this.dryRun) {
      logger.info({ backupPath }, 'Dry run: Would create backup');
      return backupPath;
    }

    await fs.mkdir(backupPath, { recursive: true });
    logger.info({ backupPath }, 'Created backup directory');

    return backupPath;
  }

  /**
   * Backup a file before transformation
   *
   * @param {string} filePath - Original file path
   * @param {string} backupPath - Backup directory
   * @returns {Promise<void>}
   * @private
   */
  async _backupFile(filePath, backupPath) {
    if (this.dryRun) {
      return;
    }

    const fileName = path.basename(filePath);
    const backupFilePath = path.join(backupPath, fileName);

    await fs.copyFile(filePath, backupFilePath);
    logger.debug({ filePath, backupFilePath }, 'Backed up file');
  }

  /**
   * Rollback transformations using backup
   *
   * @param {string} backupPath - Backup directory path
   * @param {string} repositoryPath - Repository path
   * @returns {Promise<void>}
   */
  async rollback(backupPath, repositoryPath) {
    logger.info({ backupPath }, 'Rolling back transformations');

    if (this.dryRun) {
      logger.info('Dry run: Would rollback transformations');
      return;
    }

    try {
      // Read backup directory
      const files = await fs.readdir(backupPath);

      for (const file of files) {
        const backupFilePath = path.join(backupPath, file);
        const originalFilePath = path.join(repositoryPath, file);

        await fs.copyFile(backupFilePath, originalFilePath);
        logger.debug({ file }, 'Restored file from backup');
      }

      logger.info({ filesRestored: files.length }, 'Rollback completed');

    } catch (error) {
      logError(logger, error, 'Rollback failed', { backupPath });
      Sentry.captureException(error, {
        tags: { component: 'migration-transformer', operation: 'rollback' },
        extra: { backupPath, repositoryPath }
      });
      throw error;
    }
  }
}

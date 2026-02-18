/**
 * Migration Transformer - AST-based code transformation for consolidation migrations
 *
 * Applies migration steps to affected files using AST manipulation:
 * - Updates import statements to point to consolidated files
 * - Updates function calls to use new consolidated locations
 * - Removes old duplicate code
 * - Creates backups before transformations
 * - Provides rollback capability
 */

import { parse } from '@babel/parser';
import type { ParseResult, ParserPlugin } from '@babel/parser';
// @ts-ignore -- no declaration file for @babel/traverse
import _traverse from '@babel/traverse';
// @ts-ignore -- no declaration file for @babel/generator
import _generate from '@babel/generator';

// ESM/CJS interop: Babel packages export { default: fn } in ESM
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const traverse: any = (_traverse as any).default ?? _traverse;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const generate: any = (_generate as any).default ?? _generate;
import * as t from '@babel/types';
import type { File as BabelFile, Expression, Identifier, MemberExpression } from '@babel/types';
import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import { createComponentLogger, logError } from '../../utils/logger.ts';
import { config } from '../../core/config.ts';
import * as Sentry from '@sentry/node';

const logger = createComponentLogger('MigrationTransformer');

/** Parsed migration step types */
type ParsedMigrationStep =
  | { type: 'update-import'; oldPath: string; newPath: string }
  | { type: 'replace-call'; oldName: string; newName: string }
  | { type: 'remove-declaration'; name: string }
  | { type: 'add-import'; imported: string; source: string };

interface MigrationStep {
  description: string;
  code_example?: string;
  step_number?: number;
}

interface MigrationSuggestion {
  suggestion_id?: string;
  migration_steps?: MigrationStep[];
}

interface ParsedStep extends MigrationStep {
  parsed: ParsedMigrationStep | null;
  index: number;
}

interface TransformResult {
  modified: boolean;
  transformations?: Array<Record<string, string>>;
  originalLength?: number;
  newLength?: number;
  reason?: string;
  error?: string;
}

interface MigrationResult {
  filesModified: string[];
  transformations: Array<Record<string, unknown>>;
  errors: Array<{ file: string; error: string }>;
  backupPath: string | null;
}

export interface MigrationTransformerOptions {
  backupDir?: string;
  dryRun?: boolean;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parse migration step description to extract transformation details
 */
function parseMigrationStep(description: string): ParsedMigrationStep | null {
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

const PARSER_PLUGINS: ParserPlugin[] = [
  'typescript',
  'jsx',
  'decorators-legacy',
  'classProperties',
  'objectRestSpread',
  'asyncGenerators',
  'dynamicImport',
  'optionalChaining',
  'nullishCoalescingOperator'
];

/**
 * Migration Transformer for applying consolidation changes
 */
export class MigrationTransformer {
  backupDir: string;
  dryRun: boolean;

  constructor(options: MigrationTransformerOptions = {}) {
    this.backupDir = options.backupDir || '.migration-backups';
    this.dryRun = options.dryRun ?? false;
  }

  async applyMigrationSteps(suggestion: MigrationSuggestion, repositoryPath: string): Promise<MigrationResult> {
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
        errors: [],
        backupPath: null
      };
    }

    const results: MigrationResult = {
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
      const parsedSteps: ParsedStep[] = suggestion.migration_steps
        .map((step, index) => ({
          ...step,
          parsed: parseMigrationStep(step.description),
          index
        }))
        .filter((step): step is ParsedStep & { parsed: ParsedMigrationStep } => step.parsed !== null);

      logger.info({
        totalSteps: suggestion.migration_steps.length,
        parseableSteps: parsedSteps.length
      }, 'Parsed migration steps');

      // Group steps by affected file
      const fileGroups = await this._groupStepsByFile(parsedSteps, suggestion, repositoryPath);

      // Apply transformations to each file
      for (const [filePath, steps] of Object.entries(fileGroups)) {
        try {
          const absolutePath = path.join(repositoryPath, filePath);

          try {
            await fs.access(absolutePath);
          } catch {
            logger.warn({ filePath }, 'File does not exist, skipping');
            continue;
          }

          const transformResult = await this._transformFile(absolutePath, steps, suggestion);

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
            error: (error as Error).message
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

      if (results.filesModified.length > 0) {
        logger.info('Attempting rollback due to error');
        await this.rollback(backupPath, repositoryPath);
      }

      throw error;
    }
  }

  private async _transformFile(filePath: string, steps: ParsedStep[], _suggestion: MigrationSuggestion): Promise<TransformResult> {
    logger.debug({ filePath, stepsCount: steps.length }, 'Transforming file');

    const originalSource = await fs.readFile(filePath, 'utf-8');

    let ast: ParseResult<BabelFile>;
    try {
      ast = parse(originalSource, {
        sourceType: 'module',
        plugins: PARSER_PLUGINS
      });
    } catch (parseError) {
      logger.warn({ filePath, parseError }, 'Failed to parse file as JavaScript/TypeScript');
      return {
        modified: false,
        reason: 'parse-error',
        error: (parseError as Error).message
      };
    }

    let modified = false;
    const appliedTransformations: Array<Record<string, string>> = [];

    for (const step of steps) {
      const transformation = step.parsed;
      if (!transformation) continue;

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

          default: {
            const _exhaustive: never = transformation;
            logger.warn({ type: (_exhaustive as ParsedMigrationStep).type }, 'Unknown transformation type');
          }
        }
      } catch (transformError) {
        logError(logger, transformError, 'Transformation failed', { transformation });
      }
    }

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

  private _updateImport(ast: ParseResult<BabelFile>, oldPath: string, newPath: string): boolean {
    let modified = false;

    traverse(ast, {
      ImportDeclaration(path: any) {
        if (path.node.source.value === oldPath) {
          path.node.source.value = newPath;
          modified = true;
          logger.debug({ oldPath, newPath }, 'Updated import statement');
        }
      }
    });

    return modified;
  }

  private _addImport(ast: ParseResult<BabelFile>, imported: string, source: string): boolean {
    let alreadyExists = false;
    traverse(ast, {
      ImportDeclaration(path: any) {
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

    let specifiers: t.ImportSpecifier[] | [t.ImportNamespaceSpecifier] | [t.ImportDefaultSpecifier];
    if (imported.startsWith('{') && imported.endsWith('}')) {
      const names = imported.slice(1, -1).split(',').map(n => n.trim());
      specifiers = names.map(name =>
        t.importSpecifier(t.identifier(name), t.identifier(name))
      );
    } else if (imported === '*') {
      specifiers = [t.importNamespaceSpecifier(t.identifier('imported'))];
    } else {
      specifiers = [t.importDefaultSpecifier(t.identifier(imported))];
    }

    const importDeclaration = t.importDeclaration(
      specifiers,
      t.stringLiteral(source)
    );

    ast.program.body.unshift(importDeclaration);
    logger.debug({ imported, source }, 'Added import statement');

    return true;
  }

  private _replaceCallExpression(ast: ParseResult<BabelFile>, oldName: string, newName: string): boolean {
    let modified = false;

    traverse(ast, {
      CallExpression(path: any) {
        if (t.isIdentifier(path.node.callee, { name: oldName })) {
          if (newName.includes('.')) {
            const parts = newName.split('.');
            let memberExpr: Identifier | MemberExpression = t.identifier(parts[0]);
            for (let i = 1; i < parts.length; i++) {
              memberExpr = t.memberExpression(memberExpr, t.identifier(parts[i]));
            }
            path.node.callee = memberExpr as Expression;
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

  private _removeDeclaration(ast: ParseResult<BabelFile>, name: string): boolean {
    let modified = false;

    traverse(ast, {
      FunctionDeclaration(path: any) {
        if (path.node.id && path.node.id.name === name) {
          path.remove();
          modified = true;
          logger.debug({ name, type: 'function' }, 'Removed declaration');
        }
      },

      ClassDeclaration(path: any) {
        if (path.node.id && path.node.id.name === name) {
          path.remove();
          modified = true;
          logger.debug({ name, type: 'class' }, 'Removed declaration');
        }
      },

      VariableDeclarator(path: any) {
        if (t.isIdentifier(path.node.id, { name })) {
          const parent = path.parentPath;
          if (parent && t.isVariableDeclaration(parent.node) && parent.node.declarations.length === 1) {
            parent.remove();
          } else {
            path.remove();
          }
          modified = true;
          logger.debug({ name, type: 'variable' }, 'Removed declaration');
        }
      }
    });

    return modified;
  }

  private async _groupStepsByFile(
    parsedSteps: ParsedStep[],
    _suggestion: MigrationSuggestion,
    repositoryPath: string
  ): Promise<Record<string, ParsedStep[]>> {
    const fileGroups: Record<string, ParsedStep[]> = {};
    const unresolvedSteps: ParsedStep[] = [];

    // Pass 1: Extract from code_example comments
    for (const step of parsedSteps) {
      let filePath: string | null = null;

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

      const associatedFiles = new Set<string>();
      for (const step of unresolvedSteps) {
        if (step.parsed && step.parsed.type !== 'add-import') {
          const paths = resolved.get(step.index) ?? [];
          for (const p of paths) {
            associatedFiles.add(p);
          }
        }
      }

      for (const step of unresolvedSteps) {
        let paths = resolved.get(step.index) ?? [];

        if (step.parsed && step.parsed.type === 'add-import' && paths.length === 0) {
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

  private async _findRepositoryFiles(repositoryPath: string): Promise<string[]> {
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

  private _contentMatchesStep(content: string, parsed: ParsedMigrationStep): boolean {
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
        return false;
      default:
        return false;
    }
  }

  private async _resolveAffectedFiles(
    unresolvedSteps: ParsedStep[],
    repositoryPath: string
  ): Promise<Map<number, string[]>> {
    const files = await this._findRepositoryFiles(repositoryPath);
    const resolved = new Map<number, string[]>(unresolvedSteps.map(s => [s.index, []]));

    for (const relPath of files) {
      await this._matchFileAgainstSteps(relPath, repositoryPath, unresolvedSteps, resolved);
    }

    if (this.dryRun) {
      this._logResolvedFiles(resolved);
    }

    return resolved;
  }

  private async _matchFileAgainstSteps(
    relPath: string,
    repositoryPath: string,
    unresolvedSteps: ParsedStep[],
    resolved: Map<number, string[]>
  ): Promise<void> {
    let content: string;
    try {
      content = await fs.readFile(path.join(repositoryPath, relPath), 'utf-8');
    } catch {
      return;
    }

    for (const step of unresolvedSteps) {
      if (step.parsed && this._contentMatchesStep(content, step.parsed)) {
        resolved.get(step.index)!.push(relPath);
      }
    }
  }

  private _logResolvedFiles(resolved: Map<number, string[]>): void {
    for (const [idx, paths] of resolved) {
      if (paths.length > 0) {
        logger.info({ stepIndex: idx, files: paths }, 'Detected affected files');
      }
    }
  }

  private async _createBackup(repositoryPath: string): Promise<string> {
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

  async rollback(backupPath: string, repositoryPath: string): Promise<void> {
    logger.info({ backupPath }, 'Rolling back transformations');

    if (this.dryRun) {
      logger.info('Dry run: Would rollback transformations');
      return;
    }

    try {
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

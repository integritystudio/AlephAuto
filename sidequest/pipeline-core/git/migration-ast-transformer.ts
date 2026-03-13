/**
 * Migration AST Transformer — Babel-based code transformations for consolidation migrations.
 * Handles update-import, add-import, replace-call, and remove-declaration operations.
 */

import { parse } from '@babel/parser';
import type { ParseResult, ParserPlugin } from '@babel/parser';
import _traverse from '@babel/traverse';
import type { NodePath, TraverseOptions } from '@babel/traverse';
import _generate from '@babel/generator';
import type { GeneratorOptions, GeneratorResult } from '@babel/generator';

// ESM/CJS interop: Babel packages nest the callable under .default at runtime
type TraverseFn = (node: t.Node, opts?: TraverseOptions) => void;
type GenerateFn = (ast: t.Node, opts?: GeneratorOptions) => GeneratorResult;
const traverse = ((_traverse as unknown as { default: TraverseFn }).default ?? _traverse) as TraverseFn;
const generate = ((_generate as unknown as { default: GenerateFn }).default ?? _generate) as GenerateFn;

import * as t from '@babel/types';
import type { File as BabelFile, Expression, Identifier, MemberExpression } from '@babel/types';
import fs from 'fs/promises';
import path from 'path';
import { createComponentLogger, logError } from '../../utils/logger.ts';
import type { ParsedMigrationStep, ParsedStep, TransformResult } from '../types/migration-types.ts';

const logger = createComponentLogger('MigrationAstTransformer');

export const PARSER_PLUGINS: ParserPlugin[] = [
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

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseMigrationStep(description: string): ParsedMigrationStep | null {
  const importPattern = /Update import.*?from ['"]([^'"]+)['"].*?to ['"]([^'"]+)['"]/i;
  const importMatch = description.match(importPattern);
  if (importMatch) {
    return { type: 'update-import', oldPath: importMatch[1], newPath: importMatch[2] };
  }

  const callPattern = /Replace calls to (\w+) with ([\w.]+)/i;
  const callMatch = description.match(callPattern);
  if (callMatch) {
    return { type: 'replace-call', oldName: callMatch[1], newName: callMatch[2] };
  }

  const removePattern = /Remove duplicate (?:function|class|const|let|var) (\w+)/i;
  const removeMatch = description.match(removePattern);
  if (removeMatch) {
    return { type: 'remove-declaration', name: removeMatch[1] };
  }

  const addImportPattern = /Add import.*?['"]([^'"]+)['"].*?from ['"]([^'"]+)['"]/i;
  const addImportMatch = description.match(addImportPattern);
  if (addImportMatch) {
    return { type: 'add-import', imported: addImportMatch[1], source: addImportMatch[2] };
  }

  logger.debug({ description }, 'Could not parse migration step');
  return null;
}

export class MigrationAstTransformer {
  private readonly dryRun: boolean;
  constructor(dryRun: boolean) { this.dryRun = dryRun; }

  async transformFile(filePath: string, steps: ParsedStep[]): Promise<TransformResult> {
    logger.debug({ filePath, stepsCount: steps.length }, 'Transforming file');

    const originalSource = await fs.readFile(filePath, 'utf-8');

    let ast: ParseResult<BabelFile>;
    try {
      ast = parse(originalSource, { sourceType: 'module', plugins: PARSER_PLUGINS });
    } catch (parseError) {
      logger.warn({ filePath, parseError }, 'Failed to parse file as JavaScript/TypeScript');
      return { modified: false, reason: 'parse-error', error: (parseError as Error).message };
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
              appliedTransformations.push({ type: 'update-import', from: transformation.oldPath, to: transformation.newPath });
            }
            break;

          case 'add-import':
            if (this._addImport(ast, transformation.imported, transformation.source)) {
              modified = true;
              appliedTransformations.push({ type: 'add-import', imported: transformation.imported, from: transformation.source });
            }
            break;

          case 'replace-call':
            if (this._replaceCallExpression(ast, transformation.oldName, transformation.newName)) {
              modified = true;
              appliedTransformations.push({ type: 'replace-call', from: transformation.oldName, to: transformation.newName });
            }
            break;

          case 'remove-declaration':
            if (this._removeDeclaration(ast, transformation.name)) {
              modified = true;
              appliedTransformations.push({ type: 'remove-declaration', name: transformation.name });
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
      const output = generate(ast, { retainLines: false, comments: true });

      if (!this.dryRun) {
        await fs.writeFile(filePath, output.code, 'utf-8');
        logger.info({ filePath }, 'File transformed successfully');
      } else {
        logger.info({ filePath }, 'Dry run: Would transform file');
      }

      return { modified: true, transformations: appliedTransformations, originalLength: originalSource.length, newLength: output.code.length };
    }

    return { modified: false, reason: 'no-transformations-applied' };
  }

  private _updateImport(ast: ParseResult<BabelFile>, oldPath: string, newPath: string): boolean {
    let modified = false;
    traverse(ast, {
      ImportDeclaration(nodePath: NodePath<t.ImportDeclaration>) {
        if (nodePath.node.source.value === oldPath) {
          nodePath.node.source.value = newPath;
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
      ImportDeclaration(nodePath: NodePath<t.ImportDeclaration>) {
        if (nodePath.node.source.value === source) {
          alreadyExists = true;
          nodePath.stop();
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
      specifiers = names.map(name => t.importSpecifier(t.identifier(name), t.identifier(name)));
    } else if (imported === '*') {
      const alias = path.basename(source).replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_$]/g, '_') || 'ns';
      specifiers = [t.importNamespaceSpecifier(t.identifier(alias))];
    } else {
      specifiers = [t.importDefaultSpecifier(t.identifier(imported))];
    }

    // Insert after any leading directive prologues (e.g. 'use strict') so the
    // import lands at the first non-directive position instead of position 0.
    // When all nodes are directives (findIndex returns -1), append at the end
    // so 'use strict' remains before the new import (spec-compliant).
    const firstNonDirective = ast.program.body.findIndex(
      (node): boolean => !(t.isExpressionStatement(node) && t.isStringLiteral((node as t.ExpressionStatement).expression))
    );
    const insertIdx = firstNonDirective === -1 ? ast.program.body.length : firstNonDirective;
    ast.program.body.splice(insertIdx, 0, t.importDeclaration(specifiers, t.stringLiteral(source)));
    logger.debug({ imported, source }, 'Added import statement');
    return true;
  }

  private _replaceCallExpression(ast: ParseResult<BabelFile>, oldName: string, newName: string): boolean {
    let modified = false;
    traverse(ast, {
      CallExpression(nodePath: NodePath<t.CallExpression>) {
        if (t.isIdentifier(nodePath.node.callee, { name: oldName })) {
          if (newName.includes('.')) {
            const parts = newName.split('.');
            let memberExpr: Identifier | MemberExpression = t.identifier(parts[0]);
            for (let i = 1; i < parts.length; i++) {
              memberExpr = t.memberExpression(memberExpr, t.identifier(parts[i]));
            }
            nodePath.node.callee = memberExpr as Expression;
          } else {
            nodePath.node.callee = t.identifier(newName);
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

    const stripComments = (node: t.Node | null | undefined): void => {
      if (!node) return;
      node.leadingComments = [];
      node.innerComments = [];
      node.trailingComments = [];
    };

    traverse(ast, {
      FunctionDeclaration(nodePath: NodePath<t.FunctionDeclaration>) {
        if (nodePath.node.id && nodePath.node.id.name === name) {
          stripComments(nodePath.node);
          nodePath.remove();
          modified = true;
          logger.debug({ name, type: 'function' }, 'Removed declaration');
        }
      },
      ClassDeclaration(nodePath: NodePath<t.ClassDeclaration>) {
        if (nodePath.node.id && nodePath.node.id.name === name) {
          stripComments(nodePath.node);
          nodePath.remove();
          modified = true;
          logger.debug({ name, type: 'class' }, 'Removed declaration');
        }
      },
      VariableDeclarator(nodePath: NodePath<t.VariableDeclarator>) {
        if (t.isIdentifier(nodePath.node.id, { name })) {
          const parent = nodePath.parentPath;
          if (parent && t.isVariableDeclaration(parent.node) && parent.node.declarations.length === 1) {
            stripComments(parent.node);
            parent.remove();
          } else {
            stripComments(nodePath.node);
            nodePath.remove();
          }
          modified = true;
          logger.debug({ name, type: 'variable' }, 'Removed declaration');
        }
      }
    });

    return modified;
  }

  contentMatchesStep(content: string, parsed: ParsedMigrationStep): boolean {
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
}

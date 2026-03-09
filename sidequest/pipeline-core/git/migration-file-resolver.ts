/**
 * Migration File Resolver — detects which repository files are affected by migration steps.
 * Groups steps by file path using code_example comments or content-based pattern matching.
 */

import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import { createComponentLogger } from '../../utils/logger.ts';
import { config } from '../../core/config.ts';
import type { ParsedStep, MigrationSuggestion } from '../types/migration-types.ts';
import { MigrationAstTransformer } from './migration-ast-transformer.ts';

const logger = createComponentLogger('MigrationFileResolver');

export class MigrationFileResolver {
  private readonly dryRun: boolean;
  private readonly astTransformer: MigrationAstTransformer;

  constructor(dryRun: boolean) {
    this.dryRun = dryRun;
    this.astTransformer = new MigrationAstTransformer(dryRun);
  }

  async groupStepsByFile(
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
        if (!fileGroups[filePath]) fileGroups[filePath] = [];
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
          for (const p of resolved.get(step.index) ?? []) {
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
          if (!fileGroups[filePath]) fileGroups[filePath] = [];
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
      return await glob('**/*.{js,ts,jsx,tsx}', { cwd: repositoryPath, ignore: ignorePatterns, nodir: true });
    } catch (error) {
      logger.warn({ error, repositoryPath }, 'Failed to scan repository files');
      return [];
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
      for (const [idx, paths] of resolved) {
        if (paths.length > 0) {
          logger.info({ stepIndex: idx, files: paths }, 'Detected affected files');
        }
      }
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
      if (step.parsed && this.astTransformer.contentMatchesStep(content, step.parsed)) {
        const arr = resolved.get(step.index);
        if (arr) arr.push(relPath);
      }
    }
  }
}

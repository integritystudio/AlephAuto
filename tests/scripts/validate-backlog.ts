#!/usr/bin/env node

/**
 * Backlog Validation Script
 *
 * Detects two classes of staleness in docs/BACKLOG.md:
 *   1. File references that no longer exist in the repo
 *   2. Sections where every item is marked Done (should migrate to CHANGELOG.md)
 *
 * Skips file-existence checks for:
 *   - Deferred/Blocked sections (files intentionally missing)
 *   - Cross-repo sections (declared via `> **Repo:** ...`)
 *
 * Usage:
 *   node --strip-types tests/scripts/validate-backlog.ts
 *   npm run test:validate-backlog
 *
 * Exit codes:
 *   0 - No issues found
 *   1 - Stale references or unmigrated completed sections detected
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');
const BACKLOG_PATH = path.join(ROOT, 'docs/BACKLOG.md');

interface Issue {
  line: number;
  type: 'stale-file' | 'completed-section';
  message: string;
}

interface LineRange {
  start: number;
  end: number;
}

/**
 * Build line ranges for ## sections that should skip file-existence checks.
 * A section is skipped if its heading contains "deferred" or "blocked" (case-insensitive),
 * or if it contains a `> **Repo:**` blockquote (cross-repo references).
 */
function buildSkipRanges(lines: string[]): LineRange[] {
  const ranges: LineRange[] = [];
  const sectionStarts: number[] = [];

  // Find all ## section boundaries
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) {
      sectionStarts.push(i);
    }
  }

  for (let s = 0; s < sectionStarts.length; s++) {
    const start = sectionStarts[s];
    const end = s + 1 < sectionStarts.length ? sectionStarts[s + 1] - 1 : lines.length - 1;
    const heading = lines[start];

    // Skip deferred/blocked by heading
    if (/deferred|blocked/i.test(heading)) {
      ranges.push({ start: start + 1, end: end + 1 }); // 1-indexed
      continue;
    }

    // Skip cross-repo sections (have `> **Repo:**` metadata)
    for (let i = start; i <= Math.min(start + 5, end); i++) {
      if (/^>\s*\*\*Repo:\*\*/.test(lines[i])) {
        ranges.push({ start: start + 1, end: end + 1 }); // 1-indexed
        break;
      }
    }
  }

  return ranges;
}

function isInSkipRange(line: number, ranges: LineRange[]): boolean {
  return ranges.some(r => line >= r.start && line <= r.end);
}

/**
 * Extract file paths referenced in backtick-quoted code spans.
 * Matches patterns like `api/types/foo.js`, `server/src/bar.ts`, etc.
 */
function extractFileRefs(content: string): Array<{ path: string; line: number }> {
  const refs: Array<{ path: string; line: number }> = [];
  const lines = content.split('\n');

  const filePattern = /`([a-zA-Z][a-zA-Z0-9._/-]+\.[a-z]{1,4})(?::\d+(?:-\d+)?)?`/g;
  const sourceExtensions = new Set(['.js', '.ts', '.tsx', '.jsx', '.py', '.cjs', '.mjs']);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match;
    filePattern.lastIndex = 0;

    while ((match = filePattern.exec(line)) !== null) {
      const filePath = match[1];
      const ext = path.extname(filePath);
      if (sourceExtensions.has(ext) && filePath.includes('/')) {
        refs.push({ path: filePath, line: i + 1 });
      }
    }
  }

  return refs;
}

/**
 * Detect table sections where every row has Done but no "Deferred" or "Blocked" heading.
 */
function detectCompletedSections(content: string): Issue[] {
  const issues: Issue[] = [];
  const lines = content.split('\n');

  let currentSection = '';
  let sectionLine = 0;
  let tableRows: Array<{ done: boolean; line: number }> = [];
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const headingMatch = line.match(/^#{2,3}\s+(.+)/);
    if (headingMatch) {
      if (inTable && tableRows.length > 0) {
        checkSection(currentSection, sectionLine, tableRows, issues);
      }
      currentSection = headingMatch[1];
      sectionLine = i + 1;
      tableRows = [];
      inTable = false;
      continue;
    }

    // Skip deferred/blocked and summary sections
    if (/deferred|blocked|summary/i.test(currentSection)) continue;

    if (line.startsWith('|') && !line.match(/^\|\s*-/)) {
      if (!inTable) {
        inTable = true;
        continue;
      }
      const isDone = /✅\s*Done/i.test(line);
      tableRows.push({ done: isDone, line: i + 1 });
    } else if (inTable && line.trim() === '') {
      if (tableRows.length > 0) {
        checkSection(currentSection, sectionLine, tableRows, issues);
      }
      tableRows = [];
      inTable = false;
    }
  }

  if (inTable && tableRows.length > 0) {
    checkSection(currentSection, sectionLine, tableRows, issues);
  }

  return issues;
}

function checkSection(
  name: string,
  line: number,
  rows: Array<{ done: boolean; line: number }>,
  issues: Issue[],
) {
  const allDone = rows.length > 0 && rows.every(r => r.done);
  if (allDone) {
    issues.push({
      line,
      type: 'completed-section',
      message: `Section "${name}" has ${rows.length} item(s) all marked Done -- migrate to CHANGELOG.md`,
    });
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(path.join(ROOT, filePath));
    return true;
  } catch {
    return false;
  }
}

async function validate(): Promise<{ success: boolean; issues: Issue[] }> {
  let content: string;
  try {
    content = await fs.readFile(BACKLOG_PATH, 'utf-8');
  } catch {
    console.log('No docs/BACKLOG.md found, skipping.\n');
    return { success: true, issues: [] };
  }

  console.log('Scanning docs/BACKLOG.md for staleness...\n');
  const issues: Issue[] = [];
  const lines = content.split('\n');
  const skipRanges = buildSkipRanges(lines);

  // Check 1: stale file references (skip deferred + cross-repo sections)
  const refs = extractFileRefs(content);
  for (const ref of refs) {
    if (isInSkipRange(ref.line, skipRanges)) continue;
    if (!(await fileExists(ref.path))) {
      issues.push({
        line: ref.line,
        type: 'stale-file',
        message: `Referenced file \`${ref.path}\` does not exist`,
      });
    }
  }

  // Check 2: fully-completed sections
  issues.push(...detectCompletedSections(content));

  if (issues.length === 0) {
    console.log('No stale references or unmigrated sections found.\n');
    return { success: true, issues: [] };
  }

  console.log(`Found ${issues.length} issue(s) in docs/BACKLOG.md:\n`);
  for (const issue of issues) {
    const tag = issue.type === 'stale-file' ? 'STALE FILE' : 'COMPLETED';
    console.log(`  Line ${issue.line} [${tag}]: ${issue.message}`);
  }
  console.log('');

  return { success: false, issues };
}

async function main() {
  try {
    const result = await validate();
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('Error during backlog validation:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { validate, extractFileRefs, detectCompletedSections };

#!/usr/bin/env node --strip-types
/**
 * Analyze duplicate detection scan results.
 *
 * Usage:
 *   node --strip-types scripts/analysis/analyze-duplicates.ts [report_path]
 *
 * If no report path provided, uses the most recent scan report.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';

interface Location {
  file_path?: string;
}

interface CodeBlock {
  content_hash: string;
  location: Location | string;
  source_code: string;
}

interface ScanReport {
  code_blocks?: CodeBlock[];
}

const MAX_GROUPS_SHOWN = 15;
const MAX_FILES_INLINE = 4;
const MIN_DUPLICATE_COUNT = 2;

function getFilePath(location: Location | string): string {
  if (typeof location === 'object' && location !== null) {
    return location.file_path ?? 'unknown';
  }
  if (typeof location === 'string') {
    return location.split(':')[0];
  }
  return 'unknown';
}

function analyzeReport(reportPath: string): void {
  const raw = readFileSync(reportPath, 'utf-8');
  const data: ScanReport = JSON.parse(raw);
  const codeBlocks = data.code_blocks ?? [];

  const hashToBlocks = new Map<string, CodeBlock[]>();
  for (const block of codeBlocks) {
    const existing = hashToBlocks.get(block.content_hash);
    if (existing) {
      existing.push(block);
    } else {
      hashToBlocks.set(block.content_hash, [block]);
    }
  }

  const exactDups = [...hashToBlocks.entries()]
    .filter(([, blocks]) => blocks.length >= MIN_DUPLICATE_COUNT)
    .sort((a, b) => b[1].length - a[1].length);

  console.log(`Report: ${reportPath}`);
  console.log(`Total code blocks: ${codeBlocks.length}`);
  console.log(`Exact duplicate patterns: ${exactDups.length}`);
  console.log();

  for (let i = 0; i < Math.min(exactDups.length, MAX_GROUPS_SHOWN); i++) {
    const [, blocks] = exactDups[i];
    const files = [...new Set(blocks.map(b => getFilePath(b.location)))];
    const code = blocks[0].source_code;
    const shortFiles = files.slice(0, MAX_FILES_INLINE).map(f => basename(f));

    console.log(`=== Group ${i + 1}: ${blocks.length}x in ${files.length} files ===`);
    console.log(`Files: ${shortFiles.join(', ')}`);
    if (files.length > MAX_FILES_INLINE) {
      console.log(`       +${files.length - MAX_FILES_INLINE} more`);
    }
    console.log(`Code:\n${code}\n`);
  }
}

function findLatestReport(): string | null {
  const outputDir = 'output/reports';
  if (!existsSync(outputDir)) return null;

  const reports = readdirSync(outputDir)
    .filter(f => f.startsWith('scan-') && f.endsWith('.json'))
    .map(f => join(outputDir, f));

  if (reports.length === 0) return null;

  return reports.reduce((latest, current) =>
    statSync(current).mtimeMs > statSync(latest).mtimeMs ? current : latest
  );
}

const reportPath = process.argv[2] ?? findLatestReport();
if (!reportPath) {
  console.error('No scan reports found in output/reports/');
  process.exit(1);
}

analyzeReport(reportPath);

#!/usr/bin/env -S node --strip-types

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

interface CliOptions {
  eslintJson: string | null;
  outPath: string;
  contextLines: number;
  maxCandidates: number;
  minSemanticScore: number;
  peerSimilarityThreshold: number;
}

interface EslintMessage {
  ruleId?: string | null;
  message: string;
  line?: number;
  column?: number;
}

interface EslintResult {
  filePath: string;
  messages: EslintMessage[];
}

interface MagicOccurrence {
  id: string;
  filePath: string;
  relativePath: string;
  line: number;
  column: number;
  literal: string;
  numericValue: number;
  message: string;
  snippet: string;
  context: string[];
  tokens: Set<string>;
}

interface ConstantDef {
  id: string;
  name: string;
  filePath: string;
  relativePath: string;
  line: number;
  literal: string;
  numericValue: number;
  snippet: string;
  tokens: Set<string>;
}

interface ConstantCandidate {
  constantId: string;
  name: string;
  path: string;
  line: number;
  literal: string;
  numericValue: number;
  semanticScore: number;
  valueMatch: boolean;
}

interface OccurrenceSummary {
  path: string;
  line: number;
  column: number;
  snippet: string;
}

interface PeerClusterSummary {
  clusterId: string;
  size: number;
  sharedTokens: string[];
  sampleOccurrences: OccurrenceSummary[];
}

interface LiteralGroupSummary {
  literal: string;
  numericValue: number;
  count: number;
  occurrences: OccurrenceSummary[];
  exactConstantMatches: ConstantCandidate[];
  semanticConstantMatches: ConstantCandidate[];
  peerClusters: PeerClusterSummary[];
}

interface SummaryReport {
  generatedAt: string;
  input: {
    eslintJson: string | null;
    contextLines: number;
    maxCandidates: number;
    minSemanticScore: number;
    peerSimilarityThreshold: number;
  };
  summary: {
    totalOccurrences: number;
    uniqueLiterals: number;
    constantsCatalogSize: number;
    groupsWithExactConstantMatch: number;
    groupsWithSemanticConstantMatch: number;
  };
  literals: LiteralGroupSummary[];
}

const STOPWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'true', 'false', 'null', 'undefined',
  'import', 'from', 'export', 'default', 'async', 'await', 'new', 'class', 'extends',
  'public', 'private', 'protected', 'static', 'readonly', 'string', 'number', 'boolean',
  'object', 'record', 'array', 'json', 'parse', 'stringify', 'error', 'warn', 'info',
  'debug', 'log', 'if', 'else', 'for', 'while', 'switch', 'case', 'try', 'catch',
  'finally', 'this', 'that', 'with', 'without', 'into', 'then', 'than', 'and', 'or',
  'file', 'path', 'line', 'column', 'message', 'type', 'value', 'values',
]);

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    eslintJson: null,
    outPath: path.join(process.cwd(), 'docs', 'magic-number-categories.json'),
    contextLines: 2,
    maxCandidates: 5,
    minSemanticScore: 0.2,
    peerSimilarityThreshold: 0.35,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--eslint-json') {
      options.eslintJson = argv[++i] ?? null;
    } else if (arg === '--out') {
      const out = argv[++i];
      if (!out) throw new Error('--out requires a value');
      options.outPath = path.resolve(out);
    } else if (arg === '--context') {
      const val = Number(argv[++i]);
      if (!Number.isInteger(val) || val < 0) throw new Error('--context must be a non-negative integer');
      options.contextLines = val;
    } else if (arg === '--max-candidates') {
      const val = Number(argv[++i]);
      if (!Number.isInteger(val) || val < 1) throw new Error('--max-candidates must be >= 1');
      options.maxCandidates = val;
    } else if (arg === '--min-semantic-score') {
      const val = Number(argv[++i]);
      if (!Number.isFinite(val) || val < 0 || val > 1) {
        throw new Error('--min-semantic-score must be between 0 and 1');
      }
      options.minSemanticScore = val;
    } else if (arg === '--peer-threshold') {
      const val = Number(argv[++i]);
      if (!Number.isFinite(val) || val < 0 || val > 1) {
        throw new Error('--peer-threshold must be between 0 and 1');
      }
      options.peerSimilarityThreshold = val;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printUsage(): void {
  const msg = `
Usage:
  node --strip-types scripts/categorize-magic-numbers.ts [options]

Options:
  --eslint-json <path>         Use an existing ESLint JSON report.
                               If omitted, runs: ./node_modules/.bin/eslint . -f json
  --out <path>                 Output JSON path (default: docs/magic-number-categories.json)
  --context <n>                Context lines per occurrence (default: 2)
  --max-candidates <n>         Top constant matches per literal group (default: 5)
  --min-semantic-score <0..1>  Minimum semantic score to keep candidate (default: 0.2)
  --peer-threshold <0..1>      Similarity threshold for clustering magic numbers by each other (default: 0.35)
  --help, -h                   Show this help
`;
  console.log(msg.trim());
}

function runCommand(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with status ${result.status}\n${result.stderr}`);
  }
  return result.stdout;
}

function loadEslintResults(options: CliOptions): EslintResult[] {
  if (options.eslintJson) {
    const raw = fs.readFileSync(options.eslintJson, 'utf8');
    return JSON.parse(raw) as EslintResult[];
  }

  const stdout = runCommand('./node_modules/.bin/eslint', ['.', '-f', 'json'], process.cwd());
  return JSON.parse(stdout) as EslintResult[];
}

function parseMessageLiteral(message: string): string | null {
  const match = /No magic number:\s*([^\s]+)\.?/u.exec(message);
  if (!match) return null;
  return match[1].trim();
}

function parseNumericLiteral(literal: string): number | null {
  let candidate = literal.trim();
  candidate = candidate.replace(/[,;:]$/u, '');
  candidate = candidate.replace(/n$/u, '');
  if (candidate.endsWith('.') && candidate !== '.') candidate = candidate.slice(0, -1);
  candidate = candidate.replace(/_/g, '');
  if (!candidate) return null;
  const value = Number(candidate);
  return Number.isFinite(value) ? value : null;
}

function splitIdentifier(value: string): string[] {
  const step1 = value.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  const step2 = step1.replace(/[_\-.\\/]/g, ' ');
  const parts = step2.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  return parts.map((p) => p.toLowerCase());
}

function textToTokens(value: string): string[] {
  const raw = splitIdentifier(value);
  return raw.filter((token) => {
    if (token.length < 2) return false;
    if (/^\d+$/u.test(token)) return false;
    if (STOPWORDS.has(token)) return false;
    return true;
  });
}

function buildTokenSet(...values: string[]): Set<string> {
  const result = new Set<string>();
  for (const value of values) {
    for (const token of textToTokens(value)) {
      result.add(token);
    }
  }
  return result;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function normalizeLiteralForGrouping(literal: string): string {
  return literal.trim();
}

function gatherOccurrences(results: EslintResult[], contextLines: number): MagicOccurrence[] {
  const contentCache = new Map<string, string[]>();
  const occurrences: MagicOccurrence[] = [];
  let idCounter = 0;

  for (const result of results) {
    const filePath = path.resolve(result.filePath);
    const relativePath = path.relative(process.cwd(), filePath);
    let lines = contentCache.get(filePath);
    if (!lines) {
      if (!fs.existsSync(filePath)) continue;
      lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/u);
      contentCache.set(filePath, lines);
    }

    for (const message of result.messages) {
      if (message.ruleId !== 'no-magic-numbers') continue;
      const literalRaw = parseMessageLiteral(message.message);
      if (!literalRaw) continue;
      const numeric = parseNumericLiteral(literalRaw);
      if (numeric === null) continue;

      const line = message.line ?? 1;
      const column = message.column ?? 1;
      const lineText = lines[line - 1] ?? '';
      const start = Math.max(1, line - contextLines);
      const end = Math.min(lines.length, line + contextLines);
      const context: string[] = [];
      for (let ln = start; ln <= end; ln += 1) {
        context.push(`${ln}: ${lines[ln - 1] ?? ''}`);
      }

      const tokens = buildTokenSet(relativePath, lineText, context.join('\n'));
      occurrences.push({
        id: `m${idCounter++}`,
        filePath,
        relativePath,
        line,
        column,
        literal: normalizeLiteralForGrouping(literalRaw),
        numericValue: numeric,
        message: message.message,
        snippet: lineText.trim(),
        context,
        tokens,
      });
    }
  }

  return occurrences;
}

function listConstantFiles(): string[] {
  const stdout = runCommand('rg', [
    '--files',
    '-g', '*constants*.ts',
    '-g', '*constants*.py',
    '-g', '*units.ts',
    '-g', '*score-thresholds.ts',
    '-g', '*http-status.ts',
    '-g', '!docs/repomix/**',
    '-g', '!node_modules/**',
  ], process.cwd());

  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((rel) => path.resolve(process.cwd(), rel));
}

function extractConstantsFromFile(filePath: string): ConstantDef[] {
  const relativePath = path.relative(process.cwd(), filePath);
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/u);
  const constants: ConstantDef[] = [];
  let idCounter = 0;

  const numberPattern = '(-?(?:0x[0-9A-Fa-f_]+|0o[0-7_]+|0b[01_]+|(?:\\d[\\d_]*\\.?\\d*|\\.\\d+)(?:e[+-]?\\d+)?n?))';

  const regexes: RegExp[] = [
    new RegExp(`^\\s*(?:export\\s+)?(?:const|let|var)\\s+([A-Z][A-Z0-9_]+)\\s*=\\s*${numberPattern}`),
    new RegExp(`^\\s*([A-Z][A-Z0-9_]+)\\s*:\\s*${numberPattern}`),
    new RegExp(`^\\s*([A-Z][A-Z0-9_]+)\\s*=\\s*${numberPattern}`),
  ];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) continue;

    for (const re of regexes) {
      const match = re.exec(line);
      if (!match) continue;
      const [, name, literal] = match;
      const numericValue = parseNumericLiteral(literal);
      if (numericValue === null) continue;
      const tokens = buildTokenSet(name, relativePath, line);
      constants.push({
        id: `c${path.basename(filePath)}_${idCounter++}`,
        name,
        filePath,
        relativePath,
        line: index + 1,
        literal,
        numericValue,
        snippet: trimmed,
        tokens,
      });
      break;
    }
  }

  return constants;
}

function gatherConstants(): ConstantDef[] {
  const files = listConstantFiles();
  const constants: ConstantDef[] = [];
  for (const filePath of files) {
    constants.push(...extractConstantsFromFile(filePath));
  }

  const seen = new Set<string>();
  const deduped: ConstantDef[] = [];
  for (const constant of constants) {
    const key = `${constant.relativePath}:${constant.line}:${constant.name}:${constant.numericValue}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(constant);
  }

  return deduped;
}

function numbersEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}

function scoreCandidate(
  literalValue: number,
  groupTokens: Set<string>,
  constant: ConstantDef
): ConstantCandidate {
  const valueMatch = numbersEqual(literalValue, constant.numericValue);
  const semanticScore = jaccardSimilarity(groupTokens, constant.tokens);
  return {
    constantId: constant.id,
    name: constant.name,
    path: constant.relativePath,
    line: constant.line,
    literal: constant.literal,
    numericValue: constant.numericValue,
    semanticScore,
    valueMatch,
  };
}

class UnionFind {
  private parent: number[];
  private rank: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
    this.rank = new Array(size).fill(0);
  }

  find(x: number): number {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]);
    }
    return this.parent[x];
  }

  union(a: number, b: number): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) return;

    if (this.rank[rootA] < this.rank[rootB]) {
      this.parent[rootA] = rootB;
    } else if (this.rank[rootA] > this.rank[rootB]) {
      this.parent[rootB] = rootA;
    } else {
      this.parent[rootB] = rootA;
      this.rank[rootA] += 1;
    }
  }
}

function clusterPeers(occurrences: MagicOccurrence[], threshold: number): PeerClusterSummary[] {
  if (occurrences.length === 0) return [];

  const uf = new UnionFind(occurrences.length);
  for (let i = 0; i < occurrences.length; i += 1) {
    for (let j = i + 1; j < occurrences.length; j += 1) {
      const similarity = jaccardSimilarity(occurrences[i].tokens, occurrences[j].tokens);
      if (similarity >= threshold) {
        uf.union(i, j);
      }
    }
  }

  const buckets = new Map<number, MagicOccurrence[]>();
  for (let i = 0; i < occurrences.length; i += 1) {
    const root = uf.find(i);
    const arr = buckets.get(root) ?? [];
    arr.push(occurrences[i]);
    buckets.set(root, arr);
  }

  let clusterIdx = 0;
  const clusters: PeerClusterSummary[] = [];
  for (const members of buckets.values()) {
    const tokenFreq = new Map<string, number>();
    for (const member of members) {
      for (const token of member.tokens) {
        tokenFreq.set(token, (tokenFreq.get(token) ?? 0) + 1);
      }
    }

    const minFreq = Math.max(1, Math.ceil(members.length * 0.6));
    const sharedTokens = Array.from(tokenFreq.entries())
      .filter(([, freq]) => freq >= minFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([token]) => token);

    clusters.push({
      clusterId: `cluster-${clusterIdx++}`,
      size: members.length,
      sharedTokens,
      sampleOccurrences: members.slice(0, 5).map((o) => ({
        path: o.relativePath,
        line: o.line,
        column: o.column,
        snippet: o.snippet,
      })),
    });
  }

  clusters.sort((a, b) => b.size - a.size);
  return clusters;
}

function summarizeGroups(
  occurrences: MagicOccurrence[],
  constants: ConstantDef[],
  options: CliOptions
): LiteralGroupSummary[] {
  const byLiteral = new Map<string, MagicOccurrence[]>();
  for (const occurrence of occurrences) {
    const arr = byLiteral.get(occurrence.literal) ?? [];
    arr.push(occurrence);
    byLiteral.set(occurrence.literal, arr);
  }

  const groups: LiteralGroupSummary[] = [];
  for (const [literal, items] of byLiteral.entries()) {
    const numericValue = items[0].numericValue;
    const tokenFreq = new Map<string, number>();
    for (const item of items) {
      for (const token of item.tokens) {
        tokenFreq.set(token, (tokenFreq.get(token) ?? 0) + 1);
      }
    }
    const topTokens = Array.from(tokenFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([token]) => token);
    const groupTokens = new Set(topTokens);

    const scored = constants
      .map((constant) => scoreCandidate(numericValue, groupTokens, constant))
      .sort((a, b) => {
        if (b.valueMatch !== a.valueMatch) return Number(b.valueMatch) - Number(a.valueMatch);
        return b.semanticScore - a.semanticScore;
      });

    const exactMatches = scored
      .filter((candidate) => candidate.valueMatch)
      .slice(0, options.maxCandidates);

    const semanticMatches = scored
      .filter((candidate) => candidate.semanticScore >= options.minSemanticScore)
      .slice(0, options.maxCandidates);

    const peerClusters = clusterPeers(items, options.peerSimilarityThreshold);

    groups.push({
      literal,
      numericValue,
      count: items.length,
      occurrences: items.slice(0, 20).map((item) => ({
        path: item.relativePath,
        line: item.line,
        column: item.column,
        snippet: item.snippet,
      })),
      exactConstantMatches: exactMatches,
      semanticConstantMatches: semanticMatches,
      peerClusters,
    });
  }

  groups.sort((a, b) => b.count - a.count);
  return groups;
}

function toSerializableReport(report: SummaryReport): JsonValue {
  return report as unknown as JsonValue;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));

  const eslintResults = loadEslintResults(options);
  const occurrences = gatherOccurrences(eslintResults, options.contextLines);
  const constants = gatherConstants();
  const literals = summarizeGroups(occurrences, constants, options);

  const summary: SummaryReport = {
    generatedAt: new Date().toISOString(),
    input: {
      eslintJson: options.eslintJson,
      contextLines: options.contextLines,
      maxCandidates: options.maxCandidates,
      minSemanticScore: options.minSemanticScore,
      peerSimilarityThreshold: options.peerSimilarityThreshold,
    },
    summary: {
      totalOccurrences: occurrences.length,
      uniqueLiterals: literals.length,
      constantsCatalogSize: constants.length,
      groupsWithExactConstantMatch: literals.filter((group) => group.exactConstantMatches.length > 0).length,
      groupsWithSemanticConstantMatch: literals.filter((group) => group.semanticConstantMatches.length > 0).length,
    },
    literals,
  };

  fs.mkdirSync(path.dirname(options.outPath), { recursive: true });
  fs.writeFileSync(options.outPath, JSON.stringify(toSerializableReport(summary), null, 2), 'utf8');

  console.log(`Magic-number categorization written to ${options.outPath}`);
  console.log(`Occurrences: ${summary.summary.totalOccurrences}`);
  console.log(`Unique literals: ${summary.summary.uniqueLiterals}`);
  console.log(`Constants catalog entries: ${summary.summary.constantsCatalogSize}`);
  console.log(`Groups with exact constant matches: ${summary.summary.groupsWithExactConstantMatch}`);
  console.log(`Groups with semantic constant matches: ${summary.summary.groupsWithSemanticConstantMatch}`);
}

main();

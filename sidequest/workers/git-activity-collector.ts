/**
 * Git Activity Collector
 *
 * Pure-logic module that replaces collect_git_activity.py.
 * Scans repositories, collects git stats, generates SVG charts and Jekyll reports.
 */
import { execCommandOrThrow } from '@shared/process-io';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { createComponentLogger } from '../utils/logger.ts';
import { TIME_MS } from '../core/units.ts';
import { z } from 'zod';

const logger = createComponentLogger('GitActivityCollector');

// ---------------------------------------------------------------------------
// Chart constants (from Python's ChartDefaults / ChartColors)
// ---------------------------------------------------------------------------
const CHART = {
  WIDTH: 800,
  WIDE_WIDTH: 900,
  HEIGHT: 600,
  BAR_HEIGHT: 30,
  BAR_SPACING: 10,
  MARGIN_TOP: 50,
  MARGIN_LEFT: 250,
  MARGIN_RIGHT: 100,
  MARGIN_BOTTOM: 50,
  LEGEND_OFFSET_X: 200,
  LEGEND_SPACING_Y: 25,
  LEGEND_ICON_SIZE: 15,
  LEGEND_TEXT_OFFSET_X: 20,
  LEGEND_TEXT_OFFSET_Y: 12,
  LEGEND_FONT_SIZE: 12,
  TITLE_FONT_SIZE: 20,
  TITLE_Y: 30,
  LABEL_FONT_SIZE: 14,
  LABEL_GAP: 10,
  VALUE_GAP: 5,
  TEXT_VERTICAL_OFFSET: 5,
  STROKE_WIDTH_PATH: 2,
  STROKE_WIDTH_BAR: 1,
  RADIUS_DIVISOR: 3,
  SVG_ANGLE_OFFSET: 90,
  LARGE_ARC_THRESHOLD: 180,
  FULL_CIRCLE_DEGREES: 360,
} as const;

const CHART_COLORS = {
  BAR_FILL: '#0066cc',
  BAR_STROKE: '#333',
  PIE_STROKE: 'white',
  PALETTE: [
    '#0066cc', '#4da6ff', '#99ccff', '#00994d', '#ffcc00',
    '#ff6600', '#cc0000', '#9966cc', '#66cc99', '#ff6699',
  ],
} as const;

const REPORT_DEFAULTS = {
  LEGACY_COMMIT_THRESHOLD: 5,
  TOP_N_DISPLAY: 5,
  TOP_N_TABLE_DISPLAY: 10,
  WEEKLY_WINDOW_DAYS: 7,
  MONTHLY_WINDOW_DAYS: 30,
  MONTHLY_BUCKET_MAX_DAYS: 31,
  SEPARATOR_LENGTH: 60,
  ISO_DATE_FORMAT: 'yyyy-MM-dd',
  DEFAULT_MAX_DEPTH: 3,
} as const;

const MATH = {
  HALF: 2,
  PERCENT: 100,
  DEGREES_PER_HALF_CIRCLE: 180,
  PAD_WIDTH: 2,
  MIN_NUMSTAT_PARTS: 2,
  MS_PER_DAY: TIME_MS.DAY,
} as const;

// ---------------------------------------------------------------------------
// Default language extensions (fallback when config has none)
// ---------------------------------------------------------------------------
const DEFAULT_LANGUAGE_EXTENSIONS: Record<string, string[]> = {
  'Python': ['.py', '.pyw'],
  'JavaScript': ['.js', '.mjs', '.cjs'],
  'TypeScript': ['.ts', '.tsx'],
  'Ruby': ['.rb', '.rake', '.gemspec'],
  'HTML': ['.html', '.htm'],
  'CSS/SCSS': ['.css', '.scss', '.sass', '.less'],
  'Markdown': ['.md', '.markdown'],
  'JSON': ['.json'],
  'YAML': ['.yml', '.yaml'],
  'Shell': ['.sh', '.bash', '.zsh'],
  'SQL': ['.sql'],
  'Go': ['.go'],
  'Rust': ['.rs'],
  'C/C++': ['.c', '.cpp', '.cc', '.h', '.hpp'],
  'Java': ['.java'],
  'PHP': ['.php'],
  'Lock Files': ['.lock', 'package-lock.json', 'Gemfile.lock', 'yarn.lock', 'pnpm-lock.yaml'],
  'SVG': ['.svg'],
  'Images': ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp'],
  'Data Files': ['.csv', '.xml', '.tsv', '.parquet'],
  'Text Files': ['.txt', '.log', '.ini', '.conf'],
};

// ---------------------------------------------------------------------------
// Config schema
// ---------------------------------------------------------------------------
const ScanningConfigSchema = z.object({
  code_directory: z.string().optional(),
  reports_directory: z.string().optional(),
  additional_repositories: z.array(z.string()).optional(),
  include_dotfiles: z.boolean().optional(),
  max_depth: z.number().optional(),
  exclude_patterns: z.array(z.string()).optional(),
}).optional();

const OutputConfigSchema = z.object({
  personalsite_dir: z.string().optional(),
  work_collection: z.string().optional(),
  visualization_dir: z.string().optional(),
}).optional();

const CategoryConfigSchema = z.record(z.object({
  keywords: z.array(z.string()),
  description: z.string().optional(),
  min_commits: z.number().optional(),
  max_commits: z.number().optional(),
}));

const GitReportConfigSchema = z.object({
  scanning: ScanningConfigSchema,
  output: OutputConfigSchema,
  project_categories: CategoryConfigSchema.optional(),
  language_mapping: z.record(z.array(z.string())).optional(),
}).passthrough();

export type GitReportConfig = z.infer<typeof GitReportConfigSchema>;

// ---------------------------------------------------------------------------
// Resolved config (paths expanded, defaults applied)
// ---------------------------------------------------------------------------
export interface ResolvedConfig {
  codeDir: string;
  reportsDir: string;
  additionalRepos: string[];
  includeDotfiles: boolean;
  maxDepth: number;
  excludePatterns: string[];
  personalSiteDir: string;
  workCollection: string;
  visualizationDirTemplate: string;
  projectCategories: Record<string, { keywords: string[]; minCommits?: number; maxCommits?: number }>;
  languageMapping: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------
export interface RepoStats {
  path: string;
  name: string;
  parent: string | null;
  commits: number;
  monthlyCommits: Record<string, number>;
  files: string[];
  additions: number;
  deletions: number;
}

export interface ActivityData {
  date_range: { start: string; end: string };
  total_commits: number;
  total_additions: number;
  total_deletions: number;
  total_repositories: number;
  total_files: number;
  repositories: RepoStats[];
  languages: Record<string, number>;
  websites: Record<string, string>;
  monthly: Record<string, number>;
  categories: Record<string, Array<{ name: string; commits: number }>>;
}

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------
export async function loadGitReportConfig(): Promise<GitReportConfig> {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const configPath = path.join(moduleDir, '..', 'git-report-config.json');
  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return GitReportConfigSchema.parse(parsed);
  } catch (err) {
    logger.warn({ error: (err as Error).message }, 'Failed to load git-report-config.json, using defaults');
    return {};
  }
}

export function resolveConfig(config: GitReportConfig): ResolvedConfig {
  const homeDir = os.homedir();
  const scanning = config.scanning ?? {};
  const output = config.output ?? {};

  const resolvePath = (val: string | undefined, fallback: string): string => {
    if (val && val.trim()) {
      return val.startsWith('~') ? path.join(homeDir, val.slice(1)) : val;
    }
    return fallback;
  };

  const defaultAdditional = [
    path.join(homeDir, 'schema-org-file-system'),
    path.join(homeDir, 'claude-tool-use'),
    path.join(homeDir, 'dotfiles'),
  ];

  const additionalRaw = scanning.additional_repositories ?? defaultAdditional.map(String);
  const additionalRepos = additionalRaw
    .filter((r) => typeof r === 'string' && r.trim())
    .map((r) => r.startsWith('~') ? path.join(homeDir, r.slice(1)) : r);

  return {
    codeDir: resolvePath(scanning.code_directory, path.join(homeDir, 'code')),
    reportsDir: resolvePath(scanning.reports_directory, path.join(homeDir, 'reports')),
    additionalRepos,
    includeDotfiles: scanning.include_dotfiles ?? true,
    maxDepth: scanning.max_depth ?? REPORT_DEFAULTS.DEFAULT_MAX_DEPTH,
    excludePatterns: scanning.exclude_patterns ?? ['vim/bundle', 'node_modules', '.git', 'venv', '.venv'],
    personalSiteDir: resolvePath(output.personalsite_dir, path.join(homeDir, 'code', 'PersonalSite')),
    workCollection: output.work_collection && output.work_collection.trim() ? output.work_collection : '_reports',
    visualizationDirTemplate: output.visualization_dir && output.visualization_dir.trim()
      ? output.visualization_dir
      : 'assets/images/git-activity-{year}',
    projectCategories: config.project_categories ?? {},
    languageMapping: config.language_mapping ?? DEFAULT_LANGUAGE_EXTENSIONS,
  };
}

// ---------------------------------------------------------------------------
// Repository discovery
// ---------------------------------------------------------------------------
async function scanDirForGitRepos(dir: string, maxDepth: number, excludePatterns: string[]): Promise<string[]> {
  try {
    await fs.access(dir);
  } catch {
    return [];
  }

  const { stdout } = await execCommandOrThrow('find', [
    dir, '-maxdepth', String(maxDepth), '-name', '.git', '-type', 'd',
  ]);

  return stdout.trim().split('\n')
    .filter((line) => line.trim())
    .map((line) => path.dirname(line.trim()))
    .filter((repoPath) => !excludePatterns.some((pat) => repoPath.includes(pat)));
}

async function scanDotfileRepos(homeDir: string, excludePatterns: string[]): Promise<string[]> {
  const repos: string[] = [];
  let entries: string[];
  try {
    entries = await fs.readdir(homeDir);
  } catch {
    return repos;
  }

  for (const entry of entries) {
    if (!entry.startsWith('.') || entry === '.git') continue;
    const fullPath = path.join(homeDir, entry);
    try {
      const stat = await fs.stat(fullPath);
      if (!stat.isDirectory()) continue;
    } catch {
      continue;
    }

    if (excludePatterns.some((pat) => fullPath.includes(pat))) continue;

    // Check if directory itself is a git repo
    try {
      await fs.access(path.join(fullPath, '.git'));
      repos.push(fullPath);
    } catch {
      // not a repo, check subdirs (depth 1)
    }

    try {
      const subEntries = await fs.readdir(fullPath);
      for (const sub of subEntries) {
        const subPath = path.join(fullPath, sub);
        try {
          const subStat = await fs.stat(subPath);
          if (!subStat.isDirectory()) continue;
          await fs.access(path.join(subPath, '.git'));
          if (!excludePatterns.some((pat) => subPath.includes(pat))) {
            repos.push(subPath);
          }
        } catch {
          // skip
        }
      }
    } catch {
      // skip permission errors
    }
  }

  return repos;
}

export async function findGitRepos(config: ResolvedConfig): Promise<string[]> {
  const { codeDir, reportsDir, additionalRepos, includeDotfiles, maxDepth, excludePatterns } = config;
  const repoSet = new Set<string>();

  logger.info({ codeDir, maxDepth }, 'Scanning for repositories');

  // Scan code directory
  const codeRepos = await scanDirForGitRepos(codeDir, maxDepth, excludePatterns);
  for (const r of codeRepos) repoSet.add(r);

  // Scan reports directory
  const reportRepos = await scanDirForGitRepos(reportsDir, maxDepth, excludePatterns);
  for (const r of reportRepos) repoSet.add(r);

  // Scan dotfiles
  if (includeDotfiles) {
    const dotRepos = await scanDotfileRepos(os.homedir(), excludePatterns);
    for (const r of dotRepos) repoSet.add(r);
  }

  // Add explicit additional repos
  for (const repoPath of additionalRepos) {
    try {
      await fs.access(path.join(repoPath, '.git'));
      repoSet.add(repoPath);
    } catch {
      // repo doesn't exist or isn't a git repo
    }
  }

  const sorted = [...repoSet].sort();
  logger.info({ count: sorted.length }, 'Found repositories');
  return sorted;
}

// ---------------------------------------------------------------------------
// Repository stats
// ---------------------------------------------------------------------------
export async function getRepoStats(
  repoPath: string,
  sinceDate: string,
  untilDate?: string,
  config?: ResolvedConfig,
): Promise<RepoStats> {
  const baseArgs = ['log', `--since=${sinceDate}`, '--all'];
  if (untilDate) baseArgs.push(`--until=${untilDate}`);

  const cwd = repoPath;

  // Commit count
  const { stdout: onelineOut } = await execCommandOrThrow('git', [...baseArgs, '--oneline'], { cwd });
  const commits = onelineOut.trim() ? onelineOut.trim().split('\n').length : 0;

  // Monthly distribution
  const { stdout: monthlyOut } = await execCommandOrThrow('git', [
    ...baseArgs, '--date=format:%Y-%m', '--pretty=format:%ad',
  ], { cwd });
  const monthlyCommits: Record<string, number> = {};
  for (const line of monthlyOut.trim().split('\n')) {
    const month = line.trim();
    if (month) {
      monthlyCommits[month] = (monthlyCommits[month] ?? 0) + 1;
    }
  }

  // File names
  const { stdout: namesOut } = await execCommandOrThrow('git', [
    ...baseArgs, '--name-only', '--pretty=format:',
  ], { cwd });
  const files = namesOut.trim().split('\n').filter((f) => f.trim());

  // Line stats
  const { stdout: numstatOut } = await execCommandOrThrow('git', [
    ...baseArgs, '--numstat', '--pretty=format:',
  ], { cwd });
  let additions = 0;
  let deletions = 0;
  for (const line of numstatOut.trim().split('\n')) {
    const parts = line.split('\t');
    if (parts.length < MATH.MIN_NUMSTAT_PARTS) continue;
    if (/^\d+$/.test(parts[0])) additions += Number(parts[0]);
    if (/^\d+$/.test(parts[1])) deletions += Number(parts[1]);
  }

  // Determine parent grouping
  const homeDir = os.homedir();
  const codeDir = config?.codeDir ?? path.join(homeDir, 'code');
  const reportsDir = config?.reportsDir ?? path.join(homeDir, 'reports');
  const parentDir = path.dirname(repoPath);
  let parent: string | null;

  if (parentDir === codeDir || parentDir === reportsDir) {
    parent = null;
  } else if (parentDir === homeDir) {
    parent = '~';
  } else if (parentDir.startsWith(homeDir) && path.dirname(parentDir) === homeDir) {
    parent = path.basename(parentDir);
  } else {
    parent = path.basename(parentDir);
  }

  return {
    path: repoPath,
    name: path.basename(repoPath),
    parent,
    commits,
    monthlyCommits,
    files,
    additions,
    deletions,
  };
}

// ---------------------------------------------------------------------------
// Language analysis
// ---------------------------------------------------------------------------
export function analyzeLanguages(
  allFiles: string[],
  languageMapping: Record<string, string[]>,
): Record<string, number> {
  const stats: Record<string, number> = {};

  for (const filePath of allFiles) {
    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath);
    let found = false;

    for (const [language, extensions] of Object.entries(languageMapping)) {
      if (extensions.includes(ext) || extensions.includes(fileName)) {
        stats[language] = (stats[language] ?? 0) + 1;
        found = true;
        break;
      }
    }

    if (!found && ext) {
      stats['Other'] = (stats['Other'] ?? 0) + 1;
    }
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Website discovery
// ---------------------------------------------------------------------------
export async function findProjectWebsites(
  repositories: RepoStats[],
): Promise<Record<string, string>> {
  const websites: Record<string, string> = {};
  for (const repo of repositories) {
    const cnamePath = path.join(repo.path, 'CNAME');
    try {
      const content = await fs.readFile(cnamePath, 'utf-8');
      const website = content.trim();
      if (website && website.includes('.')) {
        websites[repo.name] = `https://${website}`;
      }
    } catch {
      // no CNAME file
    }
  }
  return websites;
}

// ---------------------------------------------------------------------------
// Repository categorization
// ---------------------------------------------------------------------------
export function categorizeRepositories(
  repositories: RepoStats[],
  projectCategories: ResolvedConfig['projectCategories'],
): Record<string, Array<{ name: string; commits: number }>> {
  const defaultCategories: Record<string, { keywords: string[] }> = {
    'Data & Analytics': { keywords: ['scraper', 'analytics', 'bot'] },
    'Personal Sites': { keywords: ['personalsite', 'github.io'] },
    'Infrastructure': { keywords: ['integrity', 'studio', 'visualizer'] },
    'MCP Servers': { keywords: ['mcp', 'server'] },
    'Client Work': { keywords: [] },
    'Business Apps': { keywords: ['inventory', 'financial'] },
    'Legacy': { keywords: [] },
  };

  const categories = Object.keys(projectCategories).length > 0 ? projectCategories : defaultCategories;
  const result: Record<string, Array<{ name: string; commits: number }>> = {};
  for (const cat of Object.keys(categories)) {
    result[cat] = [];
  }

  for (const repo of repositories) {
    const nameLower = repo.name.toLowerCase();
    let categorized = false;

    for (const [cat, catConfig] of Object.entries(categories)) {
      if (cat === 'Legacy') continue; // handle Legacy last
      const keywords = catConfig.keywords;
      if (keywords.length > 0 && keywords.some((kw) => nameLower.includes(kw))) {
        result[cat].push({ name: repo.name, commits: repo.commits });
        categorized = true;
        break;
      }
    }

    if (!categorized) {
      const legacyConfig = categories['Legacy'];
      const maxCommits = legacyConfig && 'maxCommits' in legacyConfig
        ? legacyConfig.maxCommits
        : undefined;
      const threshold = typeof maxCommits === 'number'
        ? maxCommits
        : REPORT_DEFAULTS.LEGACY_COMMIT_THRESHOLD;

      if (repo.commits < threshold) {
        result['Legacy'] = result['Legacy'] ?? [];
        result['Legacy'].push({ name: repo.name, commits: repo.commits });
      } else {
        result['Client Work'] = result['Client Work'] ?? [];
        result['Client Work'].push({ name: repo.name, commits: repo.commits });
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Data compilation
// ---------------------------------------------------------------------------
export function compileActivityData(
  repositories: RepoStats[],
  allFiles: string[],
  sinceDate: string,
  untilDate: string | undefined,
  config: ResolvedConfig,
): ActivityData {
  const languages = analyzeLanguages(allFiles, config.languageMapping);

  const monthlyTotals: Record<string, number> = {};
  for (const repo of repositories) {
    for (const [month, count] of Object.entries(repo.monthlyCommits)) {
      monthlyTotals[month] = (monthlyTotals[month] ?? 0) + count;
    }
  }

  const sortedMonthly: Record<string, number> = {};
  for (const key of Object.keys(monthlyTotals).sort()) {
    sortedMonthly[key] = monthlyTotals[key];
  }

  const categories = categorizeRepositories(repositories, config.projectCategories);

  return {
    date_range: {
      start: sinceDate,
      end: untilDate ?? formatDate(new Date()),
    },
    total_commits: repositories.reduce((sum, r) => sum + r.commits, 0),
    total_additions: repositories.reduce((sum, r) => sum + r.additions, 0),
    total_deletions: repositories.reduce((sum, r) => sum + r.deletions, 0),
    total_repositories: repositories.length,
    total_files: allFiles.length,
    repositories,
    languages,
    websites: {}, // populated async separately
    monthly: sortedMonthly,
    categories,
  };
}

// ---------------------------------------------------------------------------
// SVG chart generation
// ---------------------------------------------------------------------------
export function createPieChartSvg(
  data: Record<string, number>,
  title: string,
  width: number = CHART.WIDTH,
  height: number = CHART.HEIGHT,
): string {
  const cx = width / MATH.HALF;
  const cy = height / MATH.HALF;
  const radius = Math.min(width, height) / CHART.RADIUS_DIVISOR;
  const total = Object.values(data).reduce((sum, v) => sum + v, 0);
  if (total === 0) return '';

  const parts: string[] = [
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`,
    `<text x="${cx}" y="${CHART.TITLE_Y}" text-anchor="middle" font-size="${CHART.TITLE_FONT_SIZE}" font-weight="bold">${title}</text>`,
  ];

  let startAngle = 0;
  let legendY = CHART.MARGIN_TOP;
  let i = 0;

  for (const [label, value] of Object.entries(data)) {
    if (value === 0) continue;

    const percent = (value / total) * MATH.PERCENT;
    const angle = (value / total) * CHART.FULL_CIRCLE_DEGREES;
    const endAngle = startAngle + angle;

    const startRad = (startAngle - CHART.SVG_ANGLE_OFFSET) * Math.PI / MATH.DEGREES_PER_HALF_CIRCLE;
    const endRad = (endAngle - CHART.SVG_ANGLE_OFFSET) * Math.PI / MATH.DEGREES_PER_HALF_CIRCLE;

    const x1 = cx + radius * Math.cos(startRad);
    const y1 = cy + radius * Math.sin(startRad);
    const x2 = cx + radius * Math.cos(endRad);
    const y2 = cy + radius * Math.sin(endRad);

    const largeArc = angle > CHART.LARGE_ARC_THRESHOLD ? 1 : 0;
    const pathD = `M ${cx},${cy} L ${x1},${y1} A ${radius},${radius} 0 ${largeArc},1 ${x2},${y2} Z`;
    const color = CHART_COLORS.PALETTE[i % CHART_COLORS.PALETTE.length];

    parts.push(`<path d="${pathD}" fill="${color}" stroke="${CHART_COLORS.PIE_STROKE}" stroke-width="${CHART.STROKE_WIDTH_PATH}"/>`);

    const legendX = width - CHART.LEGEND_OFFSET_X;
    parts.push(`<rect x="${legendX}" y="${legendY}" width="${CHART.LEGEND_ICON_SIZE}" height="${CHART.LEGEND_ICON_SIZE}" fill="${color}"/>`);
    parts.push(`<text x="${legendX + CHART.LEGEND_TEXT_OFFSET_X}" y="${legendY + CHART.LEGEND_TEXT_OFFSET_Y}" font-size="${CHART.LEGEND_FONT_SIZE}">${label}: ${value} (${percent.toFixed(1)}%)</text>`);
    legendY += CHART.LEGEND_SPACING_Y;

    startAngle = endAngle;
    i++;
  }

  parts.push('</svg>');
  return parts.join('\n');
}

export function createBarChartSvg(
  data: Record<string, number>,
  title: string,
  width = CHART.WIDTH,
  _height = CHART.HEIGHT,
): string {
  const maxValue = Math.max(...Object.values(data), 1);
  const barHeight = CHART.BAR_HEIGHT;
  const spacing = CHART.BAR_SPACING;
  const chartHeight = Object.keys(data).length * (barHeight + spacing);
  const marginLeft = CHART.MARGIN_LEFT;
  const marginTop = CHART.MARGIN_TOP;
  const actualHeight = chartHeight + marginTop + CHART.MARGIN_BOTTOM;

  const parts: string[] = [
    `<svg width="${width}" height="${actualHeight}" xmlns="http://www.w3.org/2000/svg">`,
    `<text x="${width / MATH.HALF}" y="${CHART.TITLE_Y}" text-anchor="middle" font-size="${CHART.TITLE_FONT_SIZE}" font-weight="bold">${title}</text>`,
  ];

  let idx = 0;
  for (const [label, value] of Object.entries(data)) {
    const y = marginTop + idx * (barHeight + spacing);
    const barWidth = (width - marginLeft - CHART.MARGIN_RIGHT) * value / maxValue;

    parts.push(`<rect x="${marginLeft}" y="${y}" width="${barWidth}" height="${barHeight}" fill="${CHART_COLORS.BAR_FILL}" stroke="${CHART_COLORS.BAR_STROKE}" stroke-width="${CHART.STROKE_WIDTH_BAR}"/>`);
    parts.push(`<text x="${marginLeft - CHART.LABEL_GAP}" y="${y + barHeight / MATH.HALF + CHART.TEXT_VERTICAL_OFFSET}" text-anchor="end" font-size="${CHART.LABEL_FONT_SIZE}">${label}</text>`);
    parts.push(`<text x="${marginLeft + barWidth + CHART.VALUE_GAP}" y="${y + barHeight / MATH.HALF + CHART.TEXT_VERTICAL_OFFSET}" font-size="${CHART.LABEL_FONT_SIZE}" font-weight="bold">${value}</text>`);
    idx++;
  }

  parts.push('</svg>');
  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Visualization orchestrator
// ---------------------------------------------------------------------------
export async function generateVisualizations(
  data: ActivityData,
  outputDir: string,
): Promise<string[]> {
  logger.info({ outputDir }, 'Generating SVG visualizations');
  await fs.mkdir(outputDir, { recursive: true });
  const files: string[] = [];

  // Monthly commits pie chart
  if (Object.keys(data.monthly).length > 0) {
    const svg = createPieChartSvg(
      data.monthly,
      `Commits by Month (${data.total_commits} total)`,
    );
    if (svg) {
      const filePath = path.join(outputDir, 'monthly-commits.svg');
      await fs.writeFile(filePath, svg);
      files.push(filePath);
    }
  }

  // Top repositories bar chart
  const top10: Record<string, number> = {};
  for (const repo of data.repositories.slice(0, REPORT_DEFAULTS.TOP_N_TABLE_DISPLAY)) {
    const name = repo.parent ? `${repo.parent}/${repo.name}` : repo.name;
    top10[name] = repo.commits;
  }
  const barSvg = createBarChartSvg(
    top10,
    `Top ${REPORT_DEFAULTS.TOP_N_TABLE_DISPLAY} Repositories by Commits`,
  );
  if (barSvg) {
    const filePath = path.join(outputDir, 'top-10-repos.svg');
    await fs.writeFile(filePath, barSvg);
    files.push(filePath);
  }

  // Category pie chart
  const categoryData: Record<string, number> = {};
  for (const [cat, repos] of Object.entries(data.categories)) {
    if (repos.length > 0) categoryData[cat] = repos.length;
  }
  if (Object.keys(categoryData).length > 0) {
    const svg = createPieChartSvg(
      categoryData,
      `Project Categories (${data.total_repositories} repos)`,
    );
    if (svg) {
      const filePath = path.join(outputDir, 'project-categories.svg');
      await fs.writeFile(filePath, svg);
      files.push(filePath);
    }
  }

  // Language distribution pie chart
  if (Object.keys(data.languages).length > 0) {
    const total = Object.values(data.languages).reduce((s, v) => s + v, 0);
    const svg = createPieChartSvg(
      data.languages,
      `File Changes by Language (${total} total)`,
      CHART.WIDE_WIDTH,
    );
    if (svg) {
      const filePath = path.join(outputDir, 'language-distribution.svg');
      await fs.writeFile(filePath, svg);
      files.push(filePath);
    }
  }

  return files;
}

// ---------------------------------------------------------------------------
// Jekyll report generation
// ---------------------------------------------------------------------------
function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(MATH.PAD_WIDTH, '0');
  const d = String(date.getDate()).padStart(MATH.PAD_WIDTH, '0');
  return `${y}-${m}-${d}`;
}

function formatDateTime(date: Date): string {
  return `${formatDate(date)} ${String(date.getHours()).padStart(MATH.PAD_WIDTH, '0')}:${String(date.getMinutes()).padStart(MATH.PAD_WIDTH, '0')}`;
}

export async function generateJekyllReport(
  data: ActivityData,
  outputFile: string,
): Promise<void> {
  const { start: startDate, end: endDate } = data.date_range;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.round((end.getTime() - start.getTime()) / MATH.MS_PER_DAY);

  let reportType: string;
  if (days <= REPORT_DEFAULTS.WEEKLY_WINDOW_DAYS) {
    reportType = 'Weekly';
  } else if (days <= REPORT_DEFAULTS.MONTHLY_BUCKET_MAX_DAYS) {
    reportType = 'Monthly';
  } else {
    reportType = `${days}-Day`;
  }

  const reportDate = formatDate(new Date());
  const now = formatDateTime(new Date());

  const frontmatter = `---
layout: single
title: "${reportType} Git Activity Report: ${startDate} to ${endDate}"
date: ${reportDate}
author_profile: true
breadcrumbs: true
categories: [git-activity, development-metrics]
tags: [git, commits, repositories, weekly-report, automation]
excerpt: "${data.total_commits} commits across ${data.total_repositories} repositories with ${data.total_files} file changes."
header:
  image: /assets/images/cover-reports.png
---
`;

  let content = `
**Report Period**: ${startDate} to ${endDate}
**Generated**: ${now}
**Report Type**: Automated Git Activity Analysis

## Executive Summary

| Metric | Value |
|--------|-------|
| Total Commits | ${data.total_commits} |
| Active Repositories | ${data.total_repositories} |
| Files Changed | ${data.total_files} |
| Languages Detected | ${Object.keys(data.languages).length} |

## Top Repositories by Commits

| Repository | Commits |
|------------|---------|
`;

  for (const repo of data.repositories.slice(0, REPORT_DEFAULTS.TOP_N_TABLE_DISPLAY)) {
    const prefix = repo.parent ? `${repo.parent}/` : '';
    content += `| ${prefix}${repo.name} | ${repo.commits} |\n`;
  }

  // Language breakdown
  if (Object.keys(data.languages).length > 0) {
    content += '\n## Language Distribution\n\n';
    content += '| Language | File Changes |\n';
    content += '|----------|-------------|\n';

    const sorted = Object.entries(data.languages).sort((a, b) => b[1] - a[1]);
    for (const [lang, count] of sorted.slice(0, REPORT_DEFAULTS.TOP_N_TABLE_DISPLAY)) {
      content += `| ${lang} | ${count} |\n`;
    }
  }

  // Categories
  if (Object.keys(data.categories).length > 0) {
    content += '\n## Project Categories\n\n';
    content += '| Category | Repositories |\n';
    content += '|----------|-------------|\n';

    for (const [category, repos] of Object.entries(data.categories)) {
      if (repos.length > 0) {
        content += `| ${category} | ${repos.length} |\n`;
      }
    }
  }

  // Detailed repo list
  content += '\n## Repository Details\n\n';
  for (const repo of data.repositories) {
    const prefix = repo.parent ? `${repo.parent}/` : '';
    content += `### ${prefix}${repo.name}\n\n`;
    content += `- **Path**: \`${repo.path}\`\n`;
    content += `- **Commits**: ${repo.commits}\n`;
    content += `- **Files Changed**: ${repo.files.length}\n\n`;
  }

  // Websites
  if (Object.keys(data.websites).length > 0) {
    content += '\n## Project Websites\n\n';
    for (const [name, url] of Object.entries(data.websites)) {
      content += `- [${name}](${url})\n`;
    }
  }

  content += '\n---\n\n';
  content += '*This report was automatically generated by the AlephAuto Git Activity Pipeline.*\n';

  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, frontmatter + content);
  logger.info({ outputFile }, 'Jekyll report saved');
}

// ---------------------------------------------------------------------------
// Output directory resolution
// ---------------------------------------------------------------------------
export function resolveOutputDir(config: ResolvedConfig): string {
  const year = new Date().getFullYear();
  const relOrAbs = config.visualizationDirTemplate.replace('{year}', String(year));
  if (path.isAbsolute(relOrAbs)) return relOrAbs;
  return path.join(config.personalSiteDir, relOrAbs);
}

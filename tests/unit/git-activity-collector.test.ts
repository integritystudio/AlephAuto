import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeLanguages,
  categorizeRepositories,
  createPieChartSvg,
  createBarChartSvg,
  resolveConfig,
  compileActivityData,
  type RepoStats,
  type ResolvedConfig,
} from '../../sidequest/workers/git-activity-collector.ts';

// ---------------------------------------------------------------------------
// resolveConfig
// ---------------------------------------------------------------------------
test('resolveConfig applies defaults when config is empty', () => {
  const config = resolveConfig({});
  assert.ok(config.codeDir.endsWith('/code'));
  assert.ok(config.reportsDir.endsWith('/reports'));
  assert.equal(config.includeDotfiles, true);
  assert.equal(config.maxDepth, 3);
  assert.ok(config.excludePatterns.includes('node_modules'));
  assert.ok(Object.keys(config.languageMapping).length > 0);
});

test('resolveConfig respects provided scanning values', () => {
  const config = resolveConfig({
    scanning: {
      code_directory: '/custom/code',
      max_depth: 5,
      include_dotfiles: false,
      exclude_patterns: ['foo'],
    },
  });
  assert.equal(config.codeDir, '/custom/code');
  assert.equal(config.maxDepth, 5);
  assert.equal(config.includeDotfiles, false);
  assert.deepEqual(config.excludePatterns, ['foo']);
});

test('resolveConfig expands tilde in paths', () => {
  const config = resolveConfig({
    scanning: { code_directory: '~/mycode' },
    output: { personalsite_dir: '~/site' },
  });
  assert.ok(!config.codeDir.includes('~'));
  assert.ok(!config.personalSiteDir.includes('~'));
});

// ---------------------------------------------------------------------------
// analyzeLanguages
// ---------------------------------------------------------------------------
test('analyzeLanguages maps extensions to languages', () => {
  const mapping = {
    'TypeScript': ['.ts', '.tsx'],
    'Python': ['.py'],
    'JSON': ['.json'],
  };

  const result = analyzeLanguages([
    'src/index.ts',
    'src/app.tsx',
    'main.py',
    'package.json',
    'README.md',
  ], mapping);

  assert.equal(result['TypeScript'], 2);
  assert.equal(result['Python'], 1);
  assert.equal(result['JSON'], 1);
  assert.equal(result['Other'], 1);
});

test('analyzeLanguages handles full filename matches (lock files)', () => {
  const mapping = {
    'Lock Files': ['.lock', 'package-lock.json'],
  };

  const result = analyzeLanguages(['package-lock.json', 'Gemfile.lock'], mapping);
  assert.equal(result['Lock Files'], 2);
});

test('analyzeLanguages returns empty for no files', () => {
  const result = analyzeLanguages([], { 'TypeScript': ['.ts'] });
  assert.deepEqual(result, {});
});

test('analyzeLanguages skips files with no extension', () => {
  const result = analyzeLanguages(['Makefile', 'Dockerfile'], { 'Python': ['.py'] });
  assert.deepEqual(result, {});
});

// ---------------------------------------------------------------------------
// categorizeRepositories
// ---------------------------------------------------------------------------
function makeRepo(name: string, commits: number): RepoStats {
  return {
    path: `/code/${name}`,
    name,
    parent: null,
    commits,
    monthlyCommits: {},
    files: [],
    additions: 0,
    deletions: 0,
  };
}

test('categorizeRepositories matches keywords', () => {
  const repos = [
    makeRepo('my-scraper', 20),
    makeRepo('personalsite', 15),
    makeRepo('mcp-proxy', 10),
  ];

  const categories = {
    'Data & Analytics': { keywords: ['scraper', 'analytics'] },
    'Personal Sites': { keywords: ['personalsite'] },
    'MCP Servers': { keywords: ['mcp'] },
    'Legacy': { keywords: [] },
    'Client Work': { keywords: [] },
  };

  const result = categorizeRepositories(repos, categories);
  assert.equal(result['Data & Analytics'].length, 1);
  assert.equal(result['Data & Analytics'][0].name, 'my-scraper');
  assert.equal(result['Personal Sites'].length, 1);
  assert.equal(result['MCP Servers'].length, 1);
});

test('categorizeRepositories puts low-commit repos in Legacy', () => {
  const repos = [makeRepo('old-project', 2)];
  const categories = {
    'Legacy': { keywords: [], maxCommits: 5 },
    'Client Work': { keywords: [] },
  };

  const result = categorizeRepositories(repos, categories);
  assert.equal(result['Legacy'].length, 1);
  assert.equal(result['Client Work'].length, 0);
});

test('categorizeRepositories falls back to Client Work for unmatched repos', () => {
  const repos = [makeRepo('random-project', 50)];
  const categories = {
    'Data & Analytics': { keywords: ['scraper'] },
    'Legacy': { keywords: [] },
    'Client Work': { keywords: [] },
  };

  const result = categorizeRepositories(repos, categories);
  assert.equal(result['Client Work'].length, 1);
});

// ---------------------------------------------------------------------------
// createPieChartSvg
// ---------------------------------------------------------------------------
test('createPieChartSvg generates valid SVG', () => {
  const svg = createPieChartSvg(
    { 'TypeScript': 50, 'Python': 30, 'Go': 20 },
    'Test Chart',
  );

  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('</svg>'));
  assert.ok(svg.includes('Test Chart'));
  assert.ok(svg.includes('TypeScript'));
  assert.ok(svg.includes('Python'));
  assert.ok(svg.includes('Go'));
  // Should have pie slices (path elements)
  assert.ok(svg.includes('<path'));
  // Should have legend entries (rect elements)
  assert.ok(svg.includes('<rect'));
});

test('createPieChartSvg returns empty string for zero total', () => {
  const svg = createPieChartSvg({ 'A': 0, 'B': 0 }, 'Empty');
  assert.equal(svg, '');
});

test('createPieChartSvg skips zero-value entries', () => {
  const svg = createPieChartSvg({ 'A': 10, 'B': 0, 'C': 5 }, 'Test');
  assert.ok(!svg.includes('>B:'));
});

test('createPieChartSvg respects custom width', () => {
  const svg = createPieChartSvg({ 'A': 10 }, 'Wide', 1200, 800);
  assert.ok(svg.includes('width="1200"'));
  assert.ok(svg.includes('height="800"'));
});

// ---------------------------------------------------------------------------
// createBarChartSvg
// ---------------------------------------------------------------------------
test('createBarChartSvg generates valid SVG', () => {
  const svg = createBarChartSvg(
    { 'repo-a': 100, 'repo-b': 50 },
    'Bar Chart',
  );

  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('</svg>'));
  assert.ok(svg.includes('Bar Chart'));
  assert.ok(svg.includes('repo-a'));
  assert.ok(svg.includes('repo-b'));
  assert.ok(svg.includes('<rect'));
});

test('createBarChartSvg handles single entry', () => {
  const svg = createBarChartSvg({ 'only': 42 }, 'Single');
  assert.ok(svg.includes('only'));
  assert.ok(svg.includes('42'));
});

// ---------------------------------------------------------------------------
// compileActivityData
// ---------------------------------------------------------------------------
test('compileActivityData aggregates stats correctly', () => {
  const repos: RepoStats[] = [
    {
      path: '/code/a',
      name: 'a',
      parent: null,
      commits: 10,
      monthlyCommits: { '2026-01': 6, '2026-02': 4 },
      files: ['a.ts', 'b.ts'],
      additions: 100,
      deletions: 20,
    },
    {
      path: '/code/b',
      name: 'b',
      parent: null,
      commits: 5,
      monthlyCommits: { '2026-01': 3, '2026-02': 2 },
      files: ['c.py'],
      additions: 50,
      deletions: 10,
    },
  ];

  const config = resolveConfig({});
  const data = compileActivityData(repos, ['a.ts', 'b.ts', 'c.py'], '2026-01-01', '2026-02-28', config);

  assert.equal(data.total_commits, 15);
  assert.equal(data.total_additions, 150);
  assert.equal(data.total_deletions, 30);
  assert.equal(data.total_repositories, 2);
  assert.equal(data.total_files, 3);
  assert.equal(data.monthly['2026-01'], 9);
  assert.equal(data.monthly['2026-02'], 6);
  assert.equal(data.date_range.start, '2026-01-01');
  assert.equal(data.date_range.end, '2026-02-28');
});

test('compileActivityData uses current date when untilDate is undefined', () => {
  const config = resolveConfig({});
  const data = compileActivityData([], [], '2026-01-01', undefined, config);
  assert.ok(data.date_range.end.match(/^\d{4}-\d{2}-\d{2}$/));
});

#!/usr/bin/env node

/**
 * Test Path Validation Script
 *
 * Scans test files for hardcoded paths that should use test fixtures instead.
 * Detects common anti-patterns like /tmp/test, /tmp/repo, etc.
 *
 * Usage:
 *   node --strip-types tests/scripts/validate-test-paths.ts              # Scan all tests
 *   node --strip-types tests/scripts/validate-test-paths.ts --fix        # Auto-fix issues
 *   npm run test:validate-paths                            # npm script
 *
 * Exit codes:
 *   0 - No issues found
 *   1 - Hardcoded paths detected
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TESTS_DIR = path.join(__dirname, '..');

/**
 * Hardcoded path patterns to detect
 */
const HARDCODED_PATH_PATTERNS = [
  {
    pattern: /['"`]\/tmp\/test[^'"`]*['"`]/g,
    description: 'Hardcoded /tmp/test paths',
    suggestion: 'Use testRepo.path from test fixtures'
  },
  {
    pattern: /['"`]\/tmp\/repo[^'"`]*['"`]/g,
    description: 'Hardcoded /tmp/repo paths',
    suggestion: 'Use testRepo.path or multiRepos[n].path from test fixtures'
  },
  {
    pattern: /repositoryPath:\s*['"`]\/tmp\/[^'"`]*['"`]/g,
    description: 'Hardcoded repositoryPath in /tmp',
    suggestion: 'Use testRepo.path from test fixtures'
  },
  {
    pattern: /repositoryPaths:\s*\[['"`]\/tmp\/[^\]]*\]/g,
    description: 'Hardcoded repositoryPaths array in /tmp',
    suggestion: 'Use multiRepos.map(r => r.path) from test fixtures'
  },
  {
    pattern: /path:\s*['"`]\/tmp\/[^'"`]*['"`]/g,
    description: 'Hardcoded path property in /tmp',
    suggestion: 'Use testRepo.path from test fixtures'
  }
];

/**
 * Files to skip (fixtures, helpers, etc.)
 */
const SKIP_FILES = [
  'test-helpers.ts',
  'validate-test-paths.ts',
  'test-fixture'
];

/**
 * Scan a file for hardcoded paths
 */
async function scanFile(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  const issues = [];

  for (const patternInfo of HARDCODED_PATH_PATTERNS) {
    const { pattern, description, suggestion } = patternInfo;
    let match;

    // Reset regex
    pattern.lastIndex = 0;

    while ((match = pattern.exec(content)) !== null) {
      // Find line number
      const beforeMatch = content.substring(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const line = lines[lineNumber - 1];

      issues.push({
        file: path.relative(process.cwd(), filePath),
        line: lineNumber,
        column: match.index - beforeMatch.lastIndexOf('\n'),
        pattern: description,
        suggestion,
        code: line.trim(),
        match: match[0]
      });
    }
  }

  return issues;
}

/**
 * Scan all test files
 */
async function scanAllTests(dir = TESTS_DIR) {
  const issues = [];

  async function scanDir(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        await scanDir(fullPath);
      } else if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.ts')) {
        // Skip certain files
        if (SKIP_FILES.some(skip => entry.name.includes(skip))) {
          continue;
        }

        const fileIssues = await scanFile(fullPath);
        issues.push(...fileIssues);
      }
    }
  }

  await scanDir(dir);
  return issues;
}

/**
 * Format issue for display
 */
function formatIssue(issue, index) {
  return `
${index + 1}. ${issue.file}:${issue.line}:${issue.column}
   Pattern: ${issue.pattern}
   Code: ${issue.code}
   Match: ${issue.match}
   Suggestion: ${issue.suggestion}
`;
}

/**
 * Main validation function
 */
async function validate(_options = {}) {
  console.log('🔍 Scanning test files for hardcoded paths...\n');

  const issues = await scanAllTests();

  if (issues.length === 0) {
    console.log('✅ No hardcoded paths detected!\n');
    return { success: true, issues: [] };
  }

  console.log(`❌ Found ${issues.length} hardcoded path(s):\n`);
  console.log('='.repeat(70));

  issues.forEach((issue, index) => {
    console.log(formatIssue(issue, index));
  });

  console.log('='.repeat(70));
  console.log('\n📝 Recommended Actions:\n');
  console.log('1. Import test fixtures:');
  console.log('   import { createTempRepository } from \'../fixtures/test-helpers.ts\';\n');
  console.log('2. Create temp repos in beforeEach:');
  console.log('   beforeEach(async () => {');
  console.log('     testRepo = await createTempRepository(\'test\');');
  console.log('   });\n');
  console.log('3. Replace hardcoded paths with:');
  console.log('   testRepo.path\n');
  console.log('4. Cleanup in afterEach:');
  console.log('   afterEach(async () => {');
  console.log('     if (testRepo) await testRepo.cleanup();');
  console.log('   });\n');

  return { success: false, issues };
}

/**
 * Main entry point
 */
async function main() {
  const options = {
    fix: process.argv.includes('--fix')
  };

  try {
    const result = await validate(options);

    if (result.success) {
      process.exit(0);
    } else {
      console.error('❌ Test validation failed. Fix hardcoded paths before committing.\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error during validation:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { validate, scanFile, scanAllTests };

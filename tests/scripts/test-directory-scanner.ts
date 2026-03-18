import { DirectoryScanner } from '../../sidequest/utils/directory-scanner.ts';
import path from 'path';

/**
 * Test script for directory scanner with output generation
 * Usage: node --strip-types test-directory-scanner.ts [directory-path]
 */

const TREE_PREVIEW_LINES = 20;

const EXCLUDED_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '__pycache__',
  '.venv',
  'venv',
];

function createScanner(absolutePath: string) {
  return new DirectoryScanner({
    baseDir: absolutePath,
    outputDir: './directory-scan-reports',
    excludeDirs: EXCLUDED_DIRS,
    maxDepth: 5,
  });
}

function logStats(stats: { total: number; byDepth: Record<string, number>; topDirectoryNames?: Array<{ name: string; count: number }> }) {
  console.log('\nScan Statistics:');
  console.log('================');
  console.log(`Total directories: ${stats.total}`);
  console.log(`\nDirectories by depth:`);
  for (const [depth, count] of Object.entries(stats.byDepth)) {
    console.log(`  Depth ${depth}: ${count} directories`);
  }
  console.log(`\nTop 10 directory names:`);
  for (const { name, count } of stats.topDirectoryNames ?? []) {
    console.log(`  ${name}: ${count} occurrences`);
  }
}

function logTreePreview(tree: string) {
  console.log(`\n📁 Directory Tree Preview (first ${TREE_PREVIEW_LINES} lines):`);
  console.log('===========================================');
  const allLines = tree.split('\n');
  console.log(allLines.slice(0, TREE_PREVIEW_LINES).join('\n'));
  if (allLines.length > TREE_PREVIEW_LINES) {
    console.log(`... (${allLines.length - TREE_PREVIEW_LINES} more lines)`);
  }
}

async function testDirectoryScanner() {
  console.log('=== Directory Scanner Test ===\n');

  const targetDir = process.argv[2] || process.cwd();
  const absolutePath = path.resolve(targetDir);
  console.log(`Target directory: ${absolutePath}\n`);

  const scanner = createScanner(absolutePath);

  try {
    const startTime = Date.now();

    console.log('📂 Scanning directories...');
    const directories = await scanner.scanDirectories();
    console.log(`✓ Found ${directories.length} directories in ${Date.now() - startTime}ms\n`);

    if (directories.length === 0) {
      console.log('No directories found to process');
      return;
    }

    console.log('📊 Generating statistics...');
    logStats(scanner.generateScanStats(directories));

    console.log('\n💾 Saving scan results...');
    const results = await scanner.generateAndSaveScanResults(directories);
    console.log('\n✓ Scan results saved:');
    console.log(`  Report: ${results.reportPath}`);
    console.log(`  Tree: ${results.treePath}`);
    console.log(`  Summary: ${results.summaryPath}`);

    logTreePreview(scanner.generateDirectoryTree(directories));

    console.log('\n✓ Test completed successfully!');
    console.log(`\nTotal duration: ${Date.now() - startTime}ms`);
  } catch (error) {
    console.error('Error during directory scan:', error);
    process.exit(1);
  }
}

// Run the test
testDirectoryScanner().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

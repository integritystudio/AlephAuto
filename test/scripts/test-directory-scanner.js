import { DirectoryScanner } from '../sidequest/directory-scanner.js';
import path from 'path';

/**
 * Test script for directory scanner with output generation
 * Usage: node test-directory-scanner.js [directory-path]
 */

async function testDirectoryScanner() {
  console.log('=== Directory Scanner Test ===\n');

  // Get target directory from command line or use current directory
  const targetDir = process.argv[2] || process.cwd();
  const absolutePath = path.resolve(targetDir);

  console.log(`Target directory: ${absolutePath}\n`);

  // Create scanner
  const scanner = new DirectoryScanner({
    baseDir: absolutePath,
    outputDir: './directory-scan-reports',
    excludeDirs: [
      'node_modules',
      '.git',
      'dist',
      'build',
      'coverage',
      '.next',
      '__pycache__',
      '.venv',
      'venv',
    ],
    maxDepth: 5, // Limit depth for testing
  });

  try {
    const startTime = Date.now();

    // Scan directories
    console.log('📂 Scanning directories...');
    const directories = await scanner.scanDirectories();
    const scanDuration = Date.now() - startTime;

    console.log(`✓ Found ${directories.length} directories in ${scanDuration}ms\n`);

    if (directories.length === 0) {
      console.log('No directories found to process');
      return;
    }

    // Generate statistics
    console.log('📊 Generating statistics...');
    const stats = scanner.generateScanStats(directories);

    console.log('\nScan Statistics:');
    console.log('================');
    console.log(`Total directories: ${stats.total}`);
    console.log(`\nDirectories by depth:`);
    for (const [depth, count] of Object.entries(stats.byDepth)) {
      console.log(`  Depth ${depth}: ${count} directories`);
    }

    console.log(`\nTop 10 directory names:`);
    for (const { name, count } of stats.topDirectoryNames) {
      console.log(`  ${name}: ${count} occurrences`);
    }

    // Generate and save scan results
    console.log('\n💾 Saving scan results...');
    const results = await scanner.generateAndSaveScanResults(directories);

    console.log('\n✓ Scan results saved:');
    console.log(`  Report: ${results.reportPath}`);
    console.log(`  Tree: ${results.treePath}`);
    console.log(`  Summary: ${results.summaryPath}`);

    // Show tree preview (first 20 lines)
    console.log('\n📁 Directory Tree Preview (first 20 lines):');
    console.log('===========================================');
    const tree = scanner.generateDirectoryTree(directories);
    const treeLines = tree.split('\n').slice(0, 20);
    console.log(treeLines.join('\n'));
    if (tree.split('\n').length > 20) {
      console.log(`... (${tree.split('\n').length - 20} more lines)`);
    }

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

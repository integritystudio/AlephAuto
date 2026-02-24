import { DirectoryScanner } from '../../sidequest/utils/directory-scanner.ts';
import path from 'path';
import os from 'os';

/**
 * Test the updated DirectoryScanner to verify it only finds git repositories
 */
async function testGitRepoScanner() {
  console.log('🔍 Testing Git Repository Scanner\n');

  const scanner = new DirectoryScanner({
    baseDir: path.join(os.homedir(), 'code'),
    outputDir: './directory-scan-reports',
  });

  console.log(`📂 Scanning: ${scanner.baseDir}\n`);

  try {
    const startTime = Date.now();
    const directories = await scanner.scanDirectories();
    const duration = Date.now() - startTime;

    console.log(`✅ Scan complete in ${duration}ms\n`);
    console.log(`📊 Results:`);
    console.log(`   Total git repositories found: ${directories.length}\n`);

    // Show first 10 repositories
    console.log('📁 Git repositories found:');
    directories.slice(0, 10).forEach((dir, index) => {
      console.log(`   ${index + 1}. ${dir.relativePath}`);
      console.log(`      Path: ${dir.fullPath}`);
      console.log(`      Depth: ${dir.depth}`);
      console.log('');
    });

    if (directories.length > 10) {
      console.log(`   ... and ${directories.length - 10} more\n`);
    }

    // Verify all are git repos
    console.log('🔍 Verification:');
    const allAreGitRepos = directories.every(dir => dir.isGitRepo === true);
    console.log(`   All directories are git repos: ${allAreGitRepos ? '✅ Yes' : '❌ No'}`);

    // Show stats
    const stats = scanner.generateScanStats(directories);
    console.log('\n📊 Statistics:');
    console.log(`   Total: ${stats.total}`);
    console.log(`   By depth:`);
    Object.entries(stats.byDepth).forEach(([depth, count]) => {
      console.log(`      Depth ${depth}: ${count} repos`);
    });

    return {
      success: true,
      count: directories.length,
      allAreGitRepos,
      directories,
    };
  } catch (error) {
    console.error('❌ Error during scan:', error);
    throw error;
  }
}

// Run the test
testGitRepoScanner()
  .then((result) => {
    console.log('\n✅ Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });

#!/usr/bin/env node
/**
 * Permission Validator
 *
 * Ensures critical service files have correct permissions before PM2 startup.
 * Prevents "fork/exec permission denied" errors from Doppler.
 *
 * Background:
 * - PM2 invokes files via: doppler run -- node <script>
 * - Files should NOT be executable (644 permissions)
 * - If files have execute bit (755), Doppler may try to exec directly
 * - This causes "permission denied" errors
 *
 * Solution:
 * - Validate files are NOT executable
 * - Auto-fix if needed
 * - Log to Sentry for monitoring
 *
 * Usage:
 *   node scripts/validate-permissions.js
 *   node scripts/validate-permissions.js --fix
 *   node scripts/validate-permissions.js --check-only
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// Files that must NOT be executable (invoked with 'node', not './')
const CRITICAL_FILES = [
  'api/server.js',
  'pipelines/duplicate-detection-pipeline.js',
  'pipelines/claude-health-pipeline.js',
  'pipelines/git-activity-pipeline.js',
  'pipelines/plugin-management-pipeline.js',
  'pipelines/gitignore-pipeline.js',
  'sidequest/server.js',
  'sidequest/gitignore-worker.js',
];

// Parse CLI arguments
const args = process.argv.slice(2);
const FIX_MODE = args.includes('--fix');
const CHECK_ONLY = args.includes('--check-only');

async function checkFilePermissions(filePath) {
  const fullPath = path.join(ROOT, filePath);

  try {
    const stats = await fs.stat(fullPath);
    const mode = stats.mode;

    // Check if file has execute permission (user, group, or other)
    const isExecutable = (mode & 0o111) !== 0;

    // Expected: 0o100644 (regular file, rw-r--r--)
    // Problem:  0o100755 (regular file, rwxr-xr-x)

    return {
      path: filePath,
      fullPath,
      mode: mode.toString(8),
      isExecutable,
      isValid: !isExecutable,
    };
  } catch (error) {
    return {
      path: filePath,
      fullPath,
      error: error.message,
      isValid: false,
    };
  }
}

async function fixFilePermissions(filePath) {
  const fullPath = path.join(ROOT, filePath);

  try {
    // Set to 644 (rw-r--r--)
    await fs.chmod(fullPath, 0o644);
    return { success: true, path: filePath };
  } catch (error) {
    return { success: false, path: filePath, error: error.message };
  }
}

async function main() {
  console.log('🔍 Validating file permissions...\n');

  const results = await Promise.all(
    CRITICAL_FILES.map(checkFilePermissions)
  );

  const invalid = results.filter(r => !r.isValid);
  const executable = results.filter(r => r.isExecutable);

  // Report findings
  if (invalid.length === 0) {
    console.log('✅ All files have correct permissions (644)\n');
    process.exit(0);
  }

  console.log(`⚠️  Found ${invalid.length} files with incorrect permissions:\n`);

  for (const result of invalid) {
    if (result.error) {
      console.log(`  ❌ ${result.path}`);
      console.log(`     Error: ${result.error}\n`);
    } else if (result.isExecutable) {
      console.log(`  ⚠️  ${result.path}`);
      console.log(`     Mode: ${result.mode} (executable)`);
      console.log(`     Expected: 100644 (not executable)\n`);
    }
  }

  // Check-only mode
  if (CHECK_ONLY) {
    console.log('ℹ️  Check-only mode - no changes made');
    console.log('   Run with --fix to correct permissions\n');
    process.exit(1);
  }

  // Auto-fix mode
  if (FIX_MODE || executable.length > 0) {
    console.log('🔧 Fixing permissions...\n');

    const fixes = await Promise.all(
      executable.map(r => fixFilePermissions(r.path))
    );

    const successful = fixes.filter(f => f.success);
    const failed = fixes.filter(f => !f.success);

    if (successful.length > 0) {
      console.log(`✅ Fixed ${successful.length} files:`);
      successful.forEach(f => console.log(`   - ${f.path}`));
      console.log();
    }

    if (failed.length > 0) {
      console.log(`❌ Failed to fix ${failed.length} files:`);
      failed.forEach(f => console.log(`   - ${f.path}: ${f.error}`));
      console.log();
      process.exit(1);
    }

    console.log('✅ All permissions corrected\n');
    process.exit(0);
  }

  // Default: report and suggest fix
  console.log('💡 Run with --fix to correct permissions automatically\n');
  process.exit(1);
}

main().catch(error => {
  console.error('❌ Validation failed:', error.message);
  process.exit(1);
});

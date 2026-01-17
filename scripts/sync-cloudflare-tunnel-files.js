#!/usr/bin/env node

/**
 * Sync Cloudflare Tunnel Files
 *
 * Automatically syncs files from api/middleware/ and api/routes/ to their
 * Cloudflare tunnel counterparts in api/routes/middleware/ and api/routes/routes/
 * with adjusted import paths.
 *
 * This ensures the Cloudflare secure tunnel application stays in sync with
 * the main application code.
 *
 * Usage:
 *   node scripts/sync-cloudflare-tunnel-files.js [--check-only]
 *
 * Options:
 *   --check-only  Only check if files are in sync, don't modify files
 *   --verbose     Show detailed sync information
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// File mappings: source -> destination
const FILE_MAPPINGS = [
  {
    source: 'api/middleware/validation.js',
    dest: 'api/routes/middleware/validation.js',
    importAdjustments: [
      { from: "'../../sidequest/", to: "'../../../sidequest/" },
      { from: '"../../sidequest/', to: '"../../../sidequest/' },
    ]
  },
  {
    source: 'api/routes/pipelines.js',
    dest: 'api/routes/routes/pipelines.js',
    importAdjustments: [
      { from: "'./scans.js'", to: "'../scans.js'" },
      { from: '"./scans.js"', to: '"../scans.js"' },
      { from: "'../types/", to: "'../../types/" },
      { from: '"../types/', to: '"../../types/' },
      { from: "'../utils/", to: "'../../utils/" },
      { from: '"../utils/', to: '"../../utils/' },
      { from: "'../../sidequest/", to: "'../../../sidequest/" },
      { from: '"../../sidequest/', to: '"../../../sidequest/' },
    ]
  }
];

const args = process.argv.slice(2);
const checkOnly = args.includes('--check-only');
const verbose = args.includes('--verbose');

/**
 * Adjust import paths in content
 */
function adjustImportPaths(content, adjustments) {
  let adjusted = content;

  for (const { from, to } of adjustments) {
    adjusted = adjusted.replaceAll(from, to);
  }

  return adjusted;
}

/**
 * Check if two files are in sync (ignoring import path differences)
 */
function filesInSync(sourcePath, destPath, adjustments) {
  if (!fs.existsSync(sourcePath)) {
    console.error(`❌ Source file not found: ${sourcePath}`);
    return false;
  }

  if (!fs.existsSync(destPath)) {
    console.warn(`⚠️  Destination file not found: ${destPath}`);
    return false;
  }

  const sourceContent = fs.readFileSync(sourcePath, 'utf8');
  const destContent = fs.readFileSync(destPath, 'utf8');
  const expectedContent = adjustImportPaths(sourceContent, adjustments);

  return destContent === expectedContent;
}

/**
 * Validate that all imports in a file are correctly adjusted
 * Returns {valid, issues} where issues is an array of validation problems
 */
function validateImports(filePath, expectedAdjustments) {
  if (!fs.existsSync(filePath)) {
    return { valid: false, issues: ['File does not exist'] };
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const issues = [];

  // Check for unadjusted import patterns (look for exact "from" patterns that shouldn't exist)
  for (const { from } of expectedAdjustments) {
    if (content.includes(from)) {
      issues.push(`Found unadjusted import: ${from}`);
    }
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

/**
 * Sync a single file pair
 */
function syncFile(mapping) {
  const sourcePath = path.join(rootDir, mapping.source);
  const destPath = path.join(rootDir, mapping.dest);

  if (!fs.existsSync(sourcePath)) {
    console.error(`❌ Source file not found: ${mapping.source}`);
    return false;
  }

  const sourceContent = fs.readFileSync(sourcePath, 'utf8');
  const adjustedContent = adjustImportPaths(sourceContent, mapping.importAdjustments);

  // Ensure destination directory exists
  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  if (checkOnly) {
    const inSync = filesInSync(sourcePath, destPath, mapping.importAdjustments);
    if (!inSync) {
      console.log(`❌ OUT OF SYNC: ${mapping.source} → ${mapping.dest}`);
      return false;
    } else {
      if (verbose) {
        console.log(`✅ IN SYNC: ${mapping.source} → ${mapping.dest}`);
      }
      return true;
    }
  } else {
    fs.writeFileSync(destPath, adjustedContent, 'utf8');
    console.log(`✅ SYNCED: ${mapping.source} → ${mapping.dest}`);

    // Validate the synced file
    const validation = validateImports(destPath, mapping.importAdjustments);
    if (!validation.valid) {
      console.warn(`⚠️  Validation warnings for ${mapping.dest}:`);
      validation.issues.forEach(issue => console.warn(`   - ${issue}`));
    } else if (verbose) {
      console.log(`   ✓ Import paths validated`);
    }

    return true;
  }
}

/**
 * Main execution
 */
function main() {
  console.log('🔄 Cloudflare Tunnel Files Sync\n');

  if (checkOnly) {
    console.log('📋 Checking if files are in sync...\n');
  } else {
    console.log('🔧 Syncing files...\n');
  }

  let allInSync = true;

  for (const mapping of FILE_MAPPINGS) {
    const result = syncFile(mapping);
    if (!result) {
      allInSync = false;
    }
  }

  console.log('');

  if (checkOnly) {
    if (allInSync) {
      console.log('✅ All files are in sync!');
      process.exit(0);
    } else {
      console.log('❌ Some files are out of sync. Run without --check-only to sync them.');
      process.exit(1);
    }
  } else {
    if (allInSync) {
      console.log('✅ All files synced successfully!');
      process.exit(0);
    } else {
      console.log('❌ Some files failed to sync.');
      process.exit(1);
    }
  }
}

main();

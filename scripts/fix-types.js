#!/usr/bin/env node

/**
 * Fix missing @types/node installation issue
 *
 * This script ensures @types/node and other dev dependencies are properly installed.
 * It handles the case where npm install might skip dev dependencies due to NODE_ENV
 * or other configuration issues.
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const typesNodePath = join(projectRoot, 'node_modules', '@types', 'node');

console.log('🔍 Checking @types/node installation...');

if (existsSync(typesNodePath)) {
  console.log('✅ @types/node is already installed');

  // Verify it's working
  try {
    execSync('npm run typecheck', {
      cwd: projectRoot,
      stdio: 'pipe'
    });
    console.log('✅ TypeScript compilation working correctly');
  } catch (error) {
    console.log('⚠️  TypeScript compilation has errors (but @types/node is installed)');
  }
} else {
  console.log('❌ @types/node is missing');
  console.log('🔧 Fixing installation...\n');

  try {
    // Remove package-lock.json to force fresh resolution
    console.log('1️⃣  Removing package-lock.json...');
    execSync('rm -f package-lock.json', { cwd: projectRoot });

    // Clear npm cache
    console.log('2️⃣  Clearing npm cache...');
    execSync('npm cache clean --force', {
      cwd: projectRoot,
      stdio: 'inherit'
    });

    // Remove node_modules
    console.log('3️⃣  Removing node_modules...');
    execSync('rm -rf node_modules', { cwd: projectRoot });

    // Install with NODE_ENV=development to ensure dev deps are included
    console.log('4️⃣  Installing dependencies with NODE_ENV=development...');
    execSync('NODE_ENV=development npm install', {
      cwd: projectRoot,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'development' }
    });

    // Verify installation
    if (existsSync(typesNodePath)) {
      console.log('\n✅ @types/node successfully installed');

      // Test TypeScript compilation
      console.log('🧪 Testing TypeScript compilation...');
      try {
        execSync('npm run typecheck', {
          cwd: projectRoot,
          stdio: 'pipe'
        });
        console.log('✅ TypeScript compilation working correctly');
      } catch (error) {
        console.log('⚠️  TypeScript compilation has errors (but @types/node is installed)');
        console.log('   This is expected if there are other type errors in the codebase');
      }
    } else {
      console.error('❌ Failed to install @types/node');
      console.error('   Please try running: NODE_ENV=development npm ci --include=dev');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error fixing installation:', error.message);
    console.error('\nTroubleshooting steps:');
    console.error('1. Check your npm version: npm --version');
    console.error('2. Try manual installation: NODE_ENV=development npm ci --include=dev');
    console.error('3. Check for .npmrc files that might override settings');
    process.exit(1);
  }
}

console.log('\n📝 Notes:');
console.log('- In CI/CD, use: NODE_ENV=development npm ci --include=dev');
console.log('- For production deployment, dev dependencies are not needed');
console.log('- TypeScript compilation should happen during CI testing, not in production');
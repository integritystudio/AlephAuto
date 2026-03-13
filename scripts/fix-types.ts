#!/usr/bin/env -S node --strip-types

/**
 * Fix missing @types/node installation issue
 *
 * This script ensures @types/node and other dev dependencies are properly installed.
 * It handles the case where pnpm install might skip dev dependencies due to NODE_ENV
 * or other configuration issues.
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const typesNodePath = join(projectRoot, 'node_modules', '@types', 'node');

console.log('Checking @types/node installation...');

if (existsSync(typesNodePath)) {
  console.log('@types/node is already installed');

  // Verify it's working
  try {
    execSync('pnpm run typecheck', {
      cwd: projectRoot,
      stdio: 'pipe'
    });
    console.log('TypeScript compilation working correctly');
  } catch {
    console.log('TypeScript compilation has errors (but @types/node is installed)');
  }
} else {
  console.log('@types/node is missing — fixing installation...\n');

  try {
    // Prune unreferenced packages from the global pnpm store
    console.log('1. Clearing pnpm cache...');
    execSync('pnpm store prune', {
      cwd: projectRoot,
      stdio: 'inherit'
    });

    // Remove node_modules
    console.log('2. Removing node_modules...');
    execSync('rm -rf node_modules', { cwd: projectRoot });

    // Install with NODE_ENV=development to ensure dev deps are included
    console.log('3. Installing dependencies with NODE_ENV=development...');
    execSync('NODE_ENV=development pnpm install', {
      cwd: projectRoot,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'development' }
    });

    // Verify installation
    if (existsSync(typesNodePath)) {
      console.log('\n@types/node successfully installed');

      // Test TypeScript compilation
      console.log('Testing TypeScript compilation...');
      try {
        execSync('pnpm run typecheck', {
          cwd: projectRoot,
          stdio: 'pipe'
        });
        console.log('TypeScript compilation working correctly');
      } catch {
        console.log('TypeScript compilation has errors (but @types/node is installed)');
        console.log('This is expected if there are other type errors in the codebase');
      }
    } else {
      console.error('Failed to install @types/node');
      console.error('Please try running: NODE_ENV=development pnpm install');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error fixing installation:', (error as Error).message);
    console.error('\nTroubleshooting steps:');
    console.error('1. Check your pnpm version: pnpm --version');
    console.error('2. Try manual installation: NODE_ENV=development pnpm install');
    console.error('3. Check for .npmrc files that might override settings');
    process.exit(1);
  }
}

console.log('\nNotes:');
console.log('- In CI/CD, use: NODE_ENV=development pnpm install');
console.log('- For production deployment, dev dependencies are not needed');
console.log('- TypeScript compilation should happen during CI testing, not in production');

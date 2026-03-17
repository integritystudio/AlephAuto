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
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const EXIT_FAILURE = 1;

function findProjectRoot(startDir: string): string {
  let dir = resolve(startDir);
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    dir = dirname(dir);
  }
  console.error('Could not locate project root (no package.json found)');
  process.exit(EXIT_FAILURE);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = findProjectRoot(__dirname);

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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log('TypeScript compilation has errors (but @types/node is installed):', msg);
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
    execSync('rm -rf node_modules', { cwd: projectRoot, stdio: 'inherit' });

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
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log('TypeScript compilation has errors (but @types/node is installed):', msg);
        console.log('This is expected if there are other type errors in the codebase');
      }
    } else {
      console.error('Failed to install @types/node');
      console.error('Please try running: NODE_ENV=development pnpm install');
      process.exit(EXIT_FAILURE);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error fixing installation:', message);
    console.error('\nTroubleshooting steps:');
    console.error('1. Check your pnpm version: pnpm --version');
    console.error('2. Try manual installation: NODE_ENV=development pnpm install');
    console.error('3. Check for .npmrc files that might override settings');
    process.exit(EXIT_FAILURE);
  }
}

console.log('\nNotes:');
console.log('- In CI/CD, use: NODE_ENV=development pnpm install');
console.log('- For production deployment, dev dependencies are not needed');
console.log('- TypeScript compilation should happen during CI testing, not in production');

#!/usr/bin/env -S node --strip-types

/**
 * Setup Verification Script
 * Verifies all required dependencies and binaries are available
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { TIMEOUTS } from '../../sidequest/core/constants.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../..');

interface Check {
  name: string;
  fn: () => void;
}

const checks: Check[] = [];
let passed = 0;
let failed = 0;

function check(name: string, fn: () => void): void {
  checks.push({ name, fn });
}

function runCheck(checkItem: Check): boolean {
  try {
    checkItem.fn();
    console.log(`✅ ${checkItem.name}`);
    passed++;
    return true;
  } catch (error) {
    console.error(`❌ ${checkItem.name}`);
    const message = error instanceof Error ? error.message : String(error);
    console.error(`   ${message}`);
    failed++;
    return false;
  }
}

// Define all checks

check('Node.js version (>=18.0.0)', () => {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0]);
  if (major < 18) {
    throw new Error(`Node.js ${version} found, requires >=18.0.0`);
  }
});

check('package.json exists', () => {
  const packagePath = join(projectRoot, 'package.json');
  if (!existsSync(packagePath)) {
    throw new Error('package.json not found');
  }
});

check('node_modules exists', () => {
  const nodeModulesPath = join(projectRoot, 'node_modules');
  if (!existsSync(nodeModulesPath)) {
    throw new Error('node_modules not found. Run: npm install');
  }
});

check('@types/node installed (TypeScript support)', () => {
  const typesNodePath = join(projectRoot, 'node_modules', '@types', 'node');
  if (!existsSync(typesNodePath)) {
    throw new Error('@types/node not found. Run: npm run fix:types OR NODE_ENV=development npm ci --include=dev');
  }
  // Check version
  try {
    const packageJsonPath = join(typesNodePath, 'package.json');
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    console.log(`   Version: ${pkg.version}`);
  } catch {
    // Version check optional
  }
});

check('repomix available via npx', () => {
  try {
    const version = execSync('npx repomix --version', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: TIMEOUTS.SHORT_MS,
    }).trim();
    console.log(`   Version: ${version}`);
  } catch (error) {
    throw new Error('repomix not available. Run: npm install');
  }
});

check('git available', () => {
  try {
    const version = execSync('git --version', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: TIMEOUTS.SHORT_MS,
    }).trim();
    console.log(`   ${version}`);
  } catch (error) {
    throw new Error('git not found. Please install git');
  }
});

check('ast-grep available', () => {
  const possiblePaths: { bin: string; args: string[]; label: string }[] = [
    { bin: join(projectRoot, 'node_modules/.bin/ast-grep'), args: ['--version'], label: 'local install' },
    { bin: 'npx', args: ['ast-grep', '--version'], label: 'npx' },
    { bin: 'ast-grep', args: ['--version'], label: 'global' },
    { bin: '/opt/homebrew/bin/ast-grep', args: ['--version'], label: 'global' },
    { bin: '/usr/local/bin/ast-grep', args: ['--version'], label: 'global' },
    { bin: 'sg', args: ['--version'], label: 'global' },
  ];

  let found = false;

  for (const { bin, args, label } of possiblePaths) {
    const result = spawnSync(bin, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: TIMEOUTS.TWO_SECONDS_MS,
    });
    if (result.status === 0) {
      found = true;
      console.log(`   ${result.stdout.trim()} (${label})`);
      break;
    }
  }

  if (!found) {
    console.log('   ⚠️  ast-grep not found (optional for pattern detection)');
  }
});

check('Redis available (optional)', () => {
  try {
    execSync('redis-cli ping', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    });
    console.log('   Redis is running');
  } catch (error) {
    console.log('   ⚠️  Redis not available (optional for caching)');
  }
});

check('Doppler CLI available (optional)', () => {
  try {
    const version = execSync('doppler --version', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: TIMEOUTS.SHORT_MS,
    }).trim();
    console.log(`   ${version}`);
  } catch (error) {
    console.log('   ⚠️  Doppler not available (optional for secrets management)');
  }
});

// Run all checks
console.log('🔍 Running setup verification...\n');

for (const item of checks) {
  runCheck(item);
}

console.log('\n' + '='.repeat(50));
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);

if (failed > 0) {
  console.log('\n⚠️  Some checks failed. Please fix the issues above.');
  process.exit(1);
} else {
  console.log('\n✨ All checks passed! System is ready.');
  process.exit(0);
}

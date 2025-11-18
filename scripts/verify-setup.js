#!/usr/bin/env node

/**
 * Setup Verification Script
 * Verifies all required dependencies and binaries are available
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const checks = [];
let passed = 0;
let failed = 0;

function check(name, fn) {
  checks.push({ name, fn });
}

function runCheck(checkItem) {
  try {
    checkItem.fn();
    console.log(`✅ ${checkItem.name}`);
    passed++;
    return true;
  } catch (error) {
    console.error(`❌ ${checkItem.name}`);
    console.error(`   ${error.message}`);
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

check('repomix available via npx', () => {
  try {
    const version = execSync('npx repomix --version', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
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
    }).trim();
    console.log(`   ${version}`);
  } catch (error) {
    throw new Error('git not found. Please install git');
  }
});

check('python3 available', () => {
  try {
    const version = execSync('python3 --version', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    console.log(`   ${version}`);
  } catch (error) {
    throw new Error('python3 not found. Required for duplicate detection pipeline');
  }
});

check('Python virtual environment exists', () => {
  const venvPath = join(projectRoot, 'venv');
  if (!existsSync(venvPath)) {
    throw new Error('venv not found. Run: python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt');
  }
});

check('ast-grep available', () => {
  try {
    execSync('ast-grep --version', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (error) {
    throw new Error('ast-grep not found. Install: npm install -g @ast-grep/cli or brew install ast-grep');
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
    }).trim();
    console.log(`   ${version}`);
  } catch (error) {
    console.log('   ⚠️  Doppler not available (optional for secrets management)');
  }
});

// Run all checks
console.log('🔍 Running setup verification...\n');

checks.forEach(runCheck);

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

#!/usr/bin/env node
/**
 * Magic number report — extracts and categorizes magic numbers from ESLint output.
 * Usage: npx eslint --rule '{"no-magic-numbers": "warn"}' --format json <files> | node scripts/magic-number-report.mjs
 */
import { readFileSync } from 'fs';

const data = JSON.parse(readFileSync('/dev/stdin', 'utf8'));
const details = {};

for (const file of data) {
  for (const msg of file.messages) {
    if (msg.ruleId === 'no-magic-numbers') {
      const match = msg.message.match(/No magic number: (-?[\d.]+)/);
      if (match) {
        const num = match[1];
        if (!details[num]) details[num] = [];
        const rel = file.filePath.replace(process.cwd() + '/', '');
        details[num].push({ file: rel, line: msg.line });
      }
    }
  }
}

const sorted = Object.entries(details).sort((a, b) => b[1].length - a[1].length);

for (const [num, locs] of sorted) {
  console.log(`\n=== ${num} (${locs.length} occurrences) ===`);
  for (const loc of locs) {
    console.log(`  ${loc.file}:${loc.line}`);
  }
}

#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');

const sourcePath = path.join(rootDir, 'shared', 'constants', 'http-status.yaml');
const tsTargetPath = path.join(rootDir, 'shared', 'constants', 'http-status.ts');
const pyTargetPath = path.join(rootDir, 'sidequest', 'pipeline-core', 'constants.py');

const pyStartMarker = '# BEGIN GENERATED HTTP STATUS CONSTANTS';
const pyEndMarker = '# END GENERATED HTTP STATUS CONSTANTS';

type StatusMap = Record<string, number>;

function loadStatusMap(): StatusMap {
  const rawYaml = fs.readFileSync(sourcePath, 'utf8');
  const parsed = yaml.load(rawYaml) as { http_status?: unknown };

  if (!parsed || typeof parsed !== 'object' || parsed.http_status === undefined) {
    throw new Error(`Missing "http_status" map in ${sourcePath}`);
  }

  if (parsed.http_status === null || typeof parsed.http_status !== 'object' || Array.isArray(parsed.http_status)) {
    throw new Error(`"http_status" in ${sourcePath} must be a key/value map`);
  }

  const entries = Object.entries(parsed.http_status as Record<string, unknown>);
  if (entries.length === 0) {
    throw new Error(`"http_status" in ${sourcePath} cannot be empty`);
  }

  const statusMap: StatusMap = {};
  for (const [name, value] of entries) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
      throw new Error(`Invalid status key "${name}" in ${sourcePath}; expected UPPER_SNAKE_CASE`);
    }
    if (!Number.isInteger(value)) {
      throw new Error(`Invalid numeric value for "${name}" in ${sourcePath}; expected integer`);
    }
    statusMap[name] = value;
  }

  return statusMap;
}

function renderTs(statusMap: StatusMap): string {
  const entries = Object.entries(statusMap)
    .map(([name, code]) => `  ${name}: ${code},`)
    .join('\n');

  return `/**
 * Shared HTTP status code constants.
 * GENERATED from shared/constants/http-status.yaml by scripts/generate-http-status-constants.ts.
 * Do not edit manually.
 */
export const HttpStatus = {
${entries}
} as const;

export type HttpStatusCode = (typeof HttpStatus)[keyof typeof HttpStatus];
`;
}

function renderPythonGeneratedBlock(statusMap: StatusMap): string {
  const entries = Object.entries(statusMap)
    .map(([name, code]) => `    ${name} = ${code}`)
    .join('\n');

  return `${pyStartMarker}
class HTTPCodes(IntEnum):
    """Standard HTTP status codes referenced in structural similarity analysis."""

${entries}
${pyEndMarker}`;
}

function writeTs(statusMap: StatusMap): void {
  fs.writeFileSync(tsTargetPath, renderTs(statusMap), 'utf8');
}

function updatePython(statusMap: StatusMap): void {
  const original = fs.readFileSync(pyTargetPath, 'utf8');
  const startIndex = original.indexOf(pyStartMarker);
  const endIndex = original.indexOf(pyEndMarker);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error(`Expected markers not found in ${pyTargetPath}. Add ${pyStartMarker}/${pyEndMarker} first.`);
  }

  const before = original.slice(0, startIndex).trimEnd();
  const after = original.slice(endIndex + pyEndMarker.length).trimStart();
  const generated = renderPythonGeneratedBlock(statusMap);
  const normalizedAfter = after.replace(/\n+$/u, '');

  fs.writeFileSync(pyTargetPath, `${before}\n\n${generated}\n\n${normalizedAfter}\n`, 'utf8');
}

function main(): void {
  const statusMap = loadStatusMap();
  writeTs(statusMap);
  updatePython(statusMap);
  console.log(`Generated HTTP status constants from ${sourcePath}`);
}

main();

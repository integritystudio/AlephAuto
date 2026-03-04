#!/usr/bin/env bash
# Runs repomix --compressand writes docs/repomix/repo-compressed.xml
set -euo pipefail

# filepaths
PARENT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

ROOT="${1}"
OUTPUT_FILE="${2}"

raw=$(NO_COLOR=1 timeout 60 npx repomix $ROOT -o "$OUTPUT_FILE")
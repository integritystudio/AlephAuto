#!/usr/bin/env bash
# Runs repomix --token-count-tree and writes the "📈 Top 5..." section onward to OUTPUT_FILE
set -euo pipefail

ROOT="${1:?Usage: $0 <root_dir> <output_file>}"
OUTPUT_FILE="${2:?Usage: $0 <root_dir> <output_file>}"

# Ensure output directory exists
mkdir -p "$(dirname "$OUTPUT_FILE")"

# Capture token tree output (repomix may print to stderr; keep 2>&1)
tree_lines="$(npx repomix "$ROOT" --token-count-tree --no-files --no-file-summary 2>&1 || true)"

# Keep only from the header onward (fallback to whole output if header not found)
tree_lines_filtered="$(
  printf '%s\n' "$tree_lines" | awk '
    BEGIN { keep=0 }
    /^📈 Top 5 Files by Token Count:/ { keep=1 }
    keep { print }
  '
)"

# If the header wasn’t found, still write something useful
if [[ -z "$tree_lines_filtered" ]]; then
  tree_lines_filtered="$tree_lines"
fi

printf '%s\n' "$tree_lines_filtered" > "$OUTPUT_FILE"

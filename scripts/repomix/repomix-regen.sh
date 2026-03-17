#!/usr/bin/env bash
# Wrapper: generates token tree + compressed repomix output
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUTPUT_PATH="docs/repomix"
OUT_DIR="$ROOT/$OUTPUT_PATH"
PROJECT_DIR="$(basename "$ROOT")"
GIT_RANKED_INCLUDE_LOGS_COUNT="${REPOMIX_GIT_RANKED_INCLUDE_LOGS_COUNT:-100}"

# Each entry: name|ext|script|extra_args
ARTIFACTS=(
  "token-tree|txt|scripts/repomix/generate-token-tree.sh|"
  "repo-compressed|xml|scripts/repomix/generate-repo-compressed.sh|"
  "repomix|xml|scripts/repomix/generate-repomix.sh|"
  "repomix-docs|xml|scripts/repomix/generate-repomix-docs.sh|"
  "repomix-git-ranked|xml|scripts/repomix/generate-repomix-git-ranked.sh|$GIT_RANKED_INCLUDE_LOGS_COUNT"
  "gitlog-top20|txt|scripts/analysis/generate-diff-summary.sh|--no-root-args"
)

mkdir -p "$OUT_DIR"

# clean previous artifacts
for entry in "${ARTIFACTS[@]}"; do
  IFS='|' read -r name ext _ _ <<< "$entry"
  rm -f "$OUT_DIR/$name.$ext"
done

# generate each artifact
for entry in "${ARTIFACTS[@]}"; do
  IFS='|' read -r name ext script extra <<< "$entry"
  out_file="$OUT_DIR/$name.$ext"
  display="$OUTPUT_PATH/$name.$ext"

  echo "Generating $name for $PROJECT_DIR at $display"
  if [[ "$extra" == "--no-root-args" ]]; then
    (cd "$ROOT" && bash "$ROOT/$script")
  elif [[ -n "$extra" ]]; then
    bash "$ROOT/$script" "$ROOT" "$out_file" "$extra"
  else
    bash "$ROOT/$script" "$ROOT" "$out_file"
  fi
  echo "Success!"
  echo
done

print_artifact() {
  local file_path="$1"
  local display_name="$2"

  if [[ -f "$file_path" ]]; then
    chars=$(wc -c < "$file_path" | tr -d ' ')
    echo " - $display_name (~$((chars / 4)) tokens, $chars chars)"
  else
    echo " - $display_name (missing)"
  fi
}

echo "Artifacts:"
for entry in "${ARTIFACTS[@]}"; do
  IFS='|' read -r name ext _ _ <<< "$entry"
  print_artifact "$OUT_DIR/$name.$ext" "$OUTPUT_PATH/$name.$ext"
done

#!/usr/bin/env bash
# Wrapper: generates token tree + compressed repomix output
set -euo pipefail

# Optional input directory (defaults to repo root)
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# repomix compression variant names
TREE_FILE="token-tree"
COMPRESSED_FILE="repo-compressed"
LOSSLESS_FILE="repomix"

# output filepaths
OUTPUT_PATH="docs/repomix"
OUT_DIR="$ROOT/$OUTPUT_PATH"
TOKEN_TREE_FILE="$OUT_DIR/$TREE_FILE.txt"
COMPRESSED_REPO_FILE="$OUT_DIR/$COMPRESSED_FILE.xml"
LOSSLESS_REPO_FILE="$OUT_DIR/$LOSSLESS_FILE.xml"
TREE_FILE_NAME="$OUTPUT_PATH/$TREE_FILE.txt"
COMPRESSED_FILE_NAME="$OUTPUT_PATH/$COMPRESSED_FILE.xml"
LOSSLESS_FILE_NAME="$OUTPUT_PATH/$LOSSLESS_FILE.xml"

# input file paths
INPUT_DIR="$ROOT/scripts/generate-"
TOKEN_TREE_SCRIPT="$INPUT_DIR$TREE_FILE.sh"
COMPRESS_SCRIPT="$INPUT_DIR$COMPRESSED_FILE.sh"
LOSSLESS_SCRIPT="$INPUT_DIR$LOSSLESS_FILE.sh"

echo "File set up..."
# make output dir if not exists
mkdir -p "$OUT_DIR"

# delete existing generated artifacts, but keep hand-authored inputs
# (repomix-instruction.md is required by repomix config)
find "$OUT_DIR" -maxdepth 1 -type f \
  ! -name 'repomix-instruction.md' \
  ! -name '.gitkeep' \
  -exec rm -f {} +

# project-level logging
PROJECT_DIR="$(basename "$ROOT")"

echo "Generating token count tree for $PROJECT_DIR at $TREE_FILE_NAME"
bash "$TOKEN_TREE_SCRIPT" "$ROOT" "$TOKEN_TREE_FILE"
echo "Success!"
echo

echo "Generating compressed repomix file for $PROJECT_DIR at $COMPRESSED_FILE_NAME"
bash "$COMPRESS_SCRIPT" "$ROOT" "$COMPRESSED_REPO_FILE"
echo "Success!"
echo

echo "Generating repomix file for $PROJECT_DIR at $LOSSLESS_FILE_NAME"
bash "$LOSSLESS_SCRIPT" "$ROOT" "$LOSSLESS_REPO_FILE"
echo "Success!"
echo
echo "Artifacts:"

print_artifact() {
  local file_path="$1"
  local display_name="$2"

  if [[ -f "$file_path" ]]; then
    chars=$(wc -c < "$file_path" | tr -d ' ')
    tokens=$((chars / 4))
    echo " - $display_name (~$tokens tokens, $chars chars)"
  else
    echo " - $display_name (missing)"
  fi
}

print_artifact "$TOKEN_TREE_FILE" "$TREE_FILE_NAME"
print_artifact "$COMPRESSED_REPO_FILE" "$COMPRESSED_FILE_NAME"
print_artifact "$LOSSLESS_REPO_FILE" "$LOSSLESS_FILE_NAME"
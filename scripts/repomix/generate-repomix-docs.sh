#!/usr/bin/env bash
# Runs repomix with docs-only include rules and writes a docs-focused XML bundle.
set -euo pipefail

ROOT="${1:?Usage: $0 <root_dir> <output_file>}"
OUTPUT_FILE="${2:?Usage: $0 <root_dir> <output_file>}"
CONFIG_FILE="$ROOT/scripts/repomix/repomix-docs.config.json"
BASE_CONFIG_FILE="$ROOT/repomix.config.json"
TMP_CONFIG="$(mktemp "${TMPDIR:-/tmp}/repomix-docs.XXXXXX.json")"

# shellcheck source=scripts/repomix/repomix-lib.sh
source "$(dirname "$0")/repomix-lib.sh"

cleanup() {
  rm -f "$TMP_CONFIG"
}
trap cleanup EXIT

BUNDLE_IGNORE_PATTERNS_JSON="$(get_bundle_ignore_patterns "$BASE_CONFIG_FILE")"

jq \
  --argjson bundleIgnorePatterns "$BUNDLE_IGNORE_PATTERNS_JSON" \
  '
    .ignore.customPatterns = ((.ignore.customPatterns // []) + $bundleIgnorePatterns | unique)
  ' \
  "$CONFIG_FILE" > "$TMP_CONFIG"

FORCE_COLOR=0 NO_COLOR=1 timeout 60 \
npx repomix "$ROOT" -c "$TMP_CONFIG" -o "$OUTPUT_FILE" >/dev/null 2>&1

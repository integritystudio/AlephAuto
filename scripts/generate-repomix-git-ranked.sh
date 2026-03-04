#!/usr/bin/env bash
# Generate a repomix bundle ranked by file change frequency using git metadata.
# Output is restricted to files that appear in the selected commit window.
set -euo pipefail

ROOT="${1:?Usage: $0 <root_dir> <output_file> [include_logs_count]}"
OUTPUT_FILE="${2:?Usage: $0 <root_dir> <output_file> [include_logs_count]}"
INCLUDE_LOGS_COUNT="${3:-200}"

# Optional overrides via environment variables.
INCLUDE_DIFFS="${REPOMIX_INCLUDE_DIFFS:-true}"
INCLUDE_LOGS="${REPOMIX_INCLUDE_LOGS:-true}"
SORT_BY_CHANGES_MAX_COMMITS="${REPOMIX_SORT_BY_CHANGES_MAX_COMMITS:-1000}"
TIMEOUT_SECONDS="${REPOMIX_TIMEOUT_SECONDS:-120}"

if ! [[ "$INCLUDE_LOGS_COUNT" =~ ^[0-9]+$ ]] || [[ "$INCLUDE_LOGS_COUNT" -lt 0 ]]; then
  echo "include_logs_count must be a non-negative integer: $INCLUDE_LOGS_COUNT" >&2
  exit 1
fi

if ! [[ "$SORT_BY_CHANGES_MAX_COMMITS" =~ ^[0-9]+$ ]] || [[ "$SORT_BY_CHANGES_MAX_COMMITS" -lt 1 ]]; then
  echo "REPOMIX_SORT_BY_CHANGES_MAX_COMMITS must be a positive integer: $SORT_BY_CHANGES_MAX_COMMITS" >&2
  exit 1
fi

if [[ "$INCLUDE_DIFFS" != "true" && "$INCLUDE_DIFFS" != "false" ]]; then
  echo "REPOMIX_INCLUDE_DIFFS must be true|false: $INCLUDE_DIFFS" >&2
  exit 1
fi

if [[ "$INCLUDE_LOGS" != "true" && "$INCLUDE_LOGS" != "false" ]]; then
  echo "REPOMIX_INCLUDE_LOGS must be true|false: $INCLUDE_LOGS" >&2
  exit 1
fi

TMP_CONFIG="$(mktemp "${TMPDIR:-/tmp}/repomix-git-ranked.XXXXXX.json")"
cleanup() {
  rm -f "$TMP_CONFIG"
}
trap cleanup EXIT

# Generated bundle patterns sourced from base repomix config.
BUNDLE_IGNORE_PATTERNS_FILE="$ROOT/repomix.config.json"
BUNDLE_IGNORE_PATTERNS_JSON="$(
  jq -c '
    [
      .ignore.customPatterns[]?
      | select(
          . == "docs/repomix/**"
          or . == "**/repomix-output.*"
          or . == "**/repo-compressed.*"
          or . == "**/repomix.xml"
          or . == "**/repo-compressed.xml"
        )
    ] | unique
  ' "$BUNDLE_IGNORE_PATTERNS_FILE" 2>/dev/null || echo '[]'
)"

# Generated artifacts that should never be re-ingested into ranked bundles.
is_generated_bundle_artifact() {
  local rel_path="$1"
  case "$rel_path" in
    sidequest/docs/gitlog-sidequest.txt)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

# Build include list from files touched in the selected commit window.
declare -A seen=()
include_files=()
while IFS= read -r -d '' rel_path; do
  [[ -z "$rel_path" ]] && continue
  if is_generated_bundle_artifact "$rel_path"; then
    continue
  fi
  [[ -n "${seen[$rel_path]:-}" ]] && continue
  # Keep only files that still exist on disk so repomix can resolve them.
  if [[ -f "$ROOT/$rel_path" ]]; then
    seen["$rel_path"]=1
    include_files+=("$rel_path")
  fi
done < <(git -C "$ROOT" log --name-only --pretty=format: -z -n "$SORT_BY_CHANGES_MAX_COMMITS")

if [[ "${#include_files[@]}" -eq 0 ]]; then
  echo "No existing files found in the selected commit window." >&2
  exit 1
fi

include_files_json="$(printf '%s\0' "${include_files[@]}" | jq -Rs 'split("\u0000")[:-1]')"

jq -n \
  --argjson includeFiles "$include_files_json" \
  --argjson bundleIgnorePatterns "$BUNDLE_IGNORE_PATTERNS_JSON" \
  --argjson includeLogsCount "$INCLUDE_LOGS_COUNT" \
  --argjson sortByChangesMaxCommits "$SORT_BY_CHANGES_MAX_COMMITS" \
  --arg includeDiffs "$INCLUDE_DIFFS" \
  --arg includeLogs "$INCLUDE_LOGS" '
{
  "$schema": "https://repomix.com/schemas/latest/schema.json",
  "output": {
    "style": "xml",
    "parsableStyle": true,
    "removeComments": true,
    "removeEmptyLines": true,
    "fileSummary": false,
    "directoryStructure": false,
    "files": true,
    "includeEmptyDirectories": false,
    "git": {
      "sortByChanges": true,
      "sortByChangesMaxCommits": $sortByChangesMaxCommits,
      "includeDiffs": ($includeDiffs == "true"),
      "includeLogs": ($includeLogs == "true"),
      "includeLogsCount": $includeLogsCount
    }
  },
  "ignore": {
    "useGitignore": true,
    "useDotIgnore": true,
    "useDefaultPatterns": true,
    "customPatterns": $bundleIgnorePatterns
  },
  "include": $includeFiles
}' > "$TMP_CONFIG"

FORCE_COLOR=0 NO_COLOR=1 timeout "$TIMEOUT_SECONDS" \
  npx repomix "$ROOT" -c "$TMP_CONFIG" -o "$OUTPUT_FILE" >/dev/null 2>&1

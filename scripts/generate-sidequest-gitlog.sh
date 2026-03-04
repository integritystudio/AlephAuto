#!/usr/bin/env bash
set -euo pipefail

# Resolve repo root (parent of scripts/)
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMMITS="${1:-200}"
OUT="${2:-"$REPO_ROOT"/sidequest/docs/gitlog-sidequest.txt}"
mkdir -p "$(dirname "$OUT")"

git -C "$REPO_ROOT" log -n "$COMMITS" \
  --date=short \
  --pretty='format:%h %ad %s' \
  --name-only \
  -- sidequest/ \
| awk '
    NF==0 { print ""; next }              # blank line between commits
    /^[0-9a-f]{7,40} / { print; next }    # commit header
    { print "  " $0 }                     # indent filenames
  ' > "$OUT"

echo "Wrote: $OUT"

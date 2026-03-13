#!/usr/bin/env bash
# Shared shell functions for repomix scripts.

# Extract bundle-ignore patterns from a repomix config file.
# These patterns identify generated bundle artifacts that should be excluded
# from repomix output to prevent self-referential ingestion.
#
# Usage: get_bundle_ignore_patterns <config_file>
# Outputs: JSON array of matching customPatterns (may be empty array on error)
get_bundle_ignore_patterns() {
  local config_file="$1"
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
  ' "$config_file" 2>/dev/null || echo '[]'
}

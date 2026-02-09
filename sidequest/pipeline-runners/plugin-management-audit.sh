#!/usr/bin/env bash
#
# Plugin Management Audit Script
# Analyzes enabled plugins and identifies potential cleanup opportunities
#
# Usage: ./plugin-management-audit.sh [--json] [--detailed]
#
# Note: Requires bash 4+ for associative arrays
#       macOS users: brew install bash
# TODO: make sure integrated with sidequest core library
set -euo pipefail

# Check bash version
if [[ "${BASH_VERSINFO[0]}" -lt 4 ]]; then
    echo "Error: This script requires bash 4 or higher (current: $BASH_VERSION)"
    echo "macOS users can install with: brew install bash"
    echo "Then run with: /usr/local/bin/bash $0 $@"
    exit 1
fi

CLAUDE_CONFIG="${HOME}/.claude/settings.json"
OUTPUT_FORMAT="human"
DETAILED=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --json)
            OUTPUT_FORMAT="json"
            shift
            ;;
        --detailed)
            DETAILED=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--json] [--detailed]"
            exit 1
            ;;
    esac
done

# Check if config exists
if [[ ! -f "$CLAUDE_CONFIG" ]]; then
    echo "Error: Claude config not found at $CLAUDE_CONFIG"
    exit 1
fi

# Get enabled plugins
ENABLED_PLUGINS=$(jq -r '.enabledPlugins | keys[]' "$CLAUDE_CONFIG" 2>/dev/null || echo "")
PLUGIN_COUNT=$(echo "$ENABLED_PLUGINS" | grep -v '^$' | wc -l | tr -d ' ')

# Identify potential duplicates by category
declare -A categories
while IFS= read -r plugin; do
    [[ -z "$plugin" ]] && continue

    # Extract category hints from plugin names
    if [[ "$plugin" =~ documentation|document ]]; then
        categories["documentation"]+="$plugin "
    elif [[ "$plugin" =~ git|github ]]; then
        categories["git"]+="$plugin "
    elif [[ "$plugin" =~ test|testing ]]; then
        categories["testing"]+="$plugin "
    elif [[ "$plugin" =~ deploy|deployment ]]; then
        categories["deployment"]+="$plugin "
    elif [[ "$plugin" =~ lint|format ]]; then
        categories["linting"]+="$plugin "
    elif [[ "$plugin" =~ docker|container ]]; then
        categories["containers"]+="$plugin "
    elif [[ "$plugin" =~ api|rest|graphql ]]; then
        categories["api"]+="$plugin "
    elif [[ "$plugin" =~ db|database|sql ]]; then
        categories["database"]+="$plugin "
    fi
done <<< "$ENABLED_PLUGINS"

# Generate output
if [[ "$OUTPUT_FORMAT" == "json" ]]; then
    # JSON output
    echo "{"
    echo "  \"total_enabled\": $PLUGIN_COUNT,"
    echo "  \"enabled_plugins\": ["
    first=true
    while IFS= read -r plugin; do
        [[ -z "$plugin" ]] && continue
        [[ "$first" == false ]] && echo ","
        echo -n "    \"$plugin\""
        first=false
    done <<< "$ENABLED_PLUGINS"
    echo ""
    echo "  ],"
    echo "  \"potential_duplicates\": {"
    first=true
    for category in "${!categories[@]}"; do
        count=$(echo "${categories[$category]}" | wc -w | tr -d ' ')
        if [[ $count -gt 1 ]]; then
            [[ "$first" == false ]] && echo ","
            echo -n "    \"$category\": ["
            inner_first=true
            for plugin in ${categories[$category]}; do
                [[ "$inner_first" == false ]] && echo -n ", "
                echo -n "\"$plugin\""
                inner_first=false
            done
            echo -n "]"
            first=false
        fi
    done
    echo ""
    echo "  }"
    echo "}"
else
    # Human-readable output
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║          Claude Code Plugin Management Audit                   ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    echo "Total Enabled Plugins: $PLUGIN_COUNT"
    echo ""

    if [[ "$DETAILED" == true ]]; then
        echo "Enabled Plugins:"
        echo "────────────────────────────────────────────────────────────────"
        while IFS= read -r plugin; do
            [[ -z "$plugin" ]] && continue
            echo "  • $plugin"
        done <<< "$ENABLED_PLUGINS"
        echo ""
    fi

    # Show potential duplicates
    has_duplicates=false
    for category in "${!categories[@]}"; do
        count=$(echo "${categories[$category]}" | wc -w | tr -d ' ')
        if [[ $count -gt 1 ]]; then
            has_duplicates=true
        fi
    done

    if [[ "$has_duplicates" == true ]]; then
        echo "⚠️  Potential Duplicate Categories:"
        echo "────────────────────────────────────────────────────────────────"
        for category in "${!categories[@]}"; do
            count=$(echo "${categories[$category]}" | wc -w | tr -d ' ')
            if [[ $count -gt 1 ]]; then
                echo ""
                echo "  Category: $category ($count plugins)"
                for plugin in ${categories[$category]}; do
                    echo "    • $plugin"
                done
            fi
        done
        echo ""
        echo "💡 Consider reviewing these categories for consolidation."
    else
        echo "✅ No obvious duplicate categories detected."
    fi

    echo ""
    echo "Recommendations:"
    echo "────────────────────────────────────────────────────────────────"

    if [[ $PLUGIN_COUNT -gt 30 ]]; then
        echo "  • High plugin count ($PLUGIN_COUNT). Consider disabling unused plugins."
    fi

    if [[ "$has_duplicates" == true ]]; then
        echo "  • Review duplicate categories above."
        echo "  • Keep only the plugins you actively use in each category."
    fi

    echo "  • Run: npm run status to see plugin usage statistics"
    echo "  • Backup before changes: npm run backup"
    echo ""
fi

# Exit with status
if [[ "$has_duplicates" == true ]] || [[ $PLUGIN_COUNT -gt 30 ]]; then
    exit 1
else
    exit 0
fi

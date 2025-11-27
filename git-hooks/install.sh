#!/bin/bash
#
# Install Git hooks from git-hooks directory to .git/hooks
#
# Usage: bash git-hooks/install.sh
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git rev-parse --show-toplevel)"
GIT_HOOKS_DIR="$REPO_ROOT/.git/hooks"

# Verify we're in a git repo
if [ ! -d "$GIT_HOOKS_DIR" ]; then
    echo "❌ Error: Not in a git repository (no .git/hooks directory found)"
    exit 1
fi

# Copy each hook
echo "📦 Installing Git hooks..."

INSTALLED=0
for hook_file in "$SCRIPT_DIR"/*; do
    hook_name=$(basename "$hook_file")

    # Skip non-executable files and directories
    if [ "$hook_name" = "install.sh" ] || [ "$hook_name" = "README.md" ]; then
        continue
    fi

    # Skip if it's a directory
    if [ -d "$hook_file" ]; then
        continue
    fi

    # Copy and make executable
    cp "$hook_file" "$GIT_HOOKS_DIR/$hook_name"
    chmod +x "$GIT_HOOKS_DIR/$hook_name"

    echo "   ✅ Installed: $hook_name"
    ((INSTALLED++))
done

if [ $INSTALLED -eq 0 ]; then
    echo "⚠️  No hooks found to install"
    exit 1
fi

echo ""
echo "✨ Successfully installed $INSTALLED hook(s)"
echo "📖 For more information, see: git-hooks/README.md"

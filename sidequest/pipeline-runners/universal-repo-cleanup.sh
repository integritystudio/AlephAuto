#!/bin/bash

################################################################################
# Universal Repository Cleanup Script
#
# Purpose: Remove common bloat files and directories from any repository
# Created: 2025-11-17
#
# This script performs cleanup tasks common to most repositories:
# 1. Remove Python virtual environments
# 2. Remove .DS_Store files (macOS system files)
# 3. Remove build artifacts and temporary files
# 4. Remove common duplicate/redundant directories
#
# Usage:
#   ./universal-repo-cleanup.sh [directory]
#
#   If no directory is provided, uses current working directory
#
# Examples:
#   ./universal-repo-cleanup.sh                    # Clean current directory
#   ./universal-repo-cleanup.sh /path/to/repo      # Clean specific directory
#   ./universal-repo-cleanup.sh ~/projects/myapp   # Clean using home path
################################################################################

set -e  # Exit on error
set -u  # Exit on undefined variable

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Target directory (first argument or current directory)
TARGET_DIR="${1:-$(pwd)}"

# Resolve to absolute path
TARGET_DIR="$(cd "$TARGET_DIR" 2>/dev/null && pwd)" || {
    echo -e "${RED}✗ Error: Directory '$1' does not exist${NC}"
    exit 1
}

################################################################################
# Configuration - Customize what gets cleaned
################################################################################

# Python virtual environment directory names (common patterns)
VENV_PATTERNS=(
    "venv"
    ".venv"
    "env"
    ".env"
    "virtualenv"
    "*.venv"
    "personal_site"  # Example from original repo
)

# Build artifact patterns
BUILD_ARTIFACTS=(
    ".jekyll-cache"
    ".sass-cache"
    ".bundle"
    "node_modules/.cache"
    "dist"
    "build"
    ".next"
    ".nuxt"
    "out"
    ".output"
    "target"
    ".gradle"
)

# Temporary/cache file patterns
TEMP_FILE_PATTERNS=(
    ".DS_Store"
    "*.pyc"
    "*.pyo"
    "__pycache__"
    "*.swp"
    "*.swo"
    "*~"
    ".*.swp"
    "Thumbs.db"
    "desktop.ini"
)

# Output file patterns (files that are generated)
OUTPUT_FILE_PATTERNS=(
    "repomix-output.xml"
    "*.log"
    "npm-debug.log*"
    "yarn-debug.log*"
    "yarn-error.log*"
)

# Common redundant directory names
REDUNDANT_DIRS=(
    "drafts"
    "temp"
    "tmp"
    "backup"
    "backups"
    "old"
    "archive"
    "deprecated"
)

################################################################################
# Helper Functions
################################################################################

print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${BLUE}→ $1${NC}"
}

# Get directory/file size in human readable format
get_size() {
    local path="$1"
    if [ -e "$path" ]; then
        du -sh "$path" 2>/dev/null | cut -f1
    else
        echo "N/A"
    fi
}

# Count files in directory or matching pattern
count_files() {
    local path="$1"
    if [ -d "$path" ]; then
        find "$path" -type f 2>/dev/null | wc -l | tr -d ' '
    else
        echo "0"
    fi
}

################################################################################
# Scanning Functions
################################################################################

scan_venvs() {
    print_info "Scanning for Python virtual environments..." >&2
    local found=()

    for pattern in "${VENV_PATTERNS[@]}"; do
        while IFS= read -r -d '' dir; do
            # Skip if inside node_modules
            if [[ ! "$dir" =~ node_modules ]]; then
                found+=("$dir")
            fi
        done < <(find "$TARGET_DIR" -maxdepth 3 -type d -name "$pattern" -print0 2>/dev/null)
    done

    # Remove duplicates (handle empty array safely)
    [ ${#found[@]} -gt 0 ] && printf '%s\n' "${found[@]}" | sort -u
}

scan_temp_files() {
    print_info "Scanning for temporary/cache files..." >&2
    local found=()

    for pattern in "${TEMP_FILE_PATTERNS[@]}"; do
        while IFS= read -r -d '' file; do
            found+=("$file")
        done < <(find "$TARGET_DIR" -name "$pattern" -print0 2>/dev/null)
    done

    [ ${#found[@]} -gt 0 ] && printf '%s\n' "${found[@]}" | sort -u
}

scan_output_files() {
    print_info "Scanning for output/generated files..." >&2
    local found=()

    for pattern in "${OUTPUT_FILE_PATTERNS[@]}"; do
        while IFS= read -r -d '' file; do
            # Keep root-level repomix-output.xml
            if [[ "$file" != "$TARGET_DIR/repomix-output.xml" ]]; then
                found+=("$file")
            fi
        done < <(find "$TARGET_DIR" -name "$pattern" -print0 2>/dev/null)
    done

    [ ${#found[@]} -gt 0 ] && printf '%s\n' "${found[@]}" | sort -u
}

scan_build_artifacts() {
    print_info "Scanning for build artifacts..." >&2
    local found=()

    for artifact in "${BUILD_ARTIFACTS[@]}"; do
        local path="$TARGET_DIR/$artifact"
        if [ -d "$path" ]; then
            found+=("$path")
        fi
    done

    [ ${#found[@]} -gt 0 ] && printf '%s\n' "${found[@]}" | sort -u
}

scan_redundant_dirs() {
    print_info "Scanning for redundant directories..." >&2
    local found=()

    for dir_name in "${REDUNDANT_DIRS[@]}"; do
        local path="$TARGET_DIR/$dir_name"
        if [ -d "$path" ]; then
            # Check if it's in .gitignore
            if [ -f "$TARGET_DIR/.gitignore" ] && grep -q "^${dir_name}/\?$" "$TARGET_DIR/.gitignore" 2>/dev/null; then
                found+=("$path (in .gitignore)")
            else
                found+=("$path")
            fi
        fi
    done

    [ ${#found[@]} -gt 0 ] && printf '%s\n' "${found[@]}" | sort -u
}

################################################################################
# Confirmation and Preview
################################################################################

show_preview() {
    print_header "Repository Cleanup Preview"

    echo "Target Directory: $TARGET_DIR"
    echo "Current Size: $(get_size "$TARGET_DIR")"
    echo ""

    # Scan all categories
    local venvs=($(scan_venvs))
    local temp_files=($(scan_temp_files))
    local output_files=($(scan_output_files))
    local build_artifacts=($(scan_build_artifacts))
    local redundant_dirs=($(scan_redundant_dirs))

    local total_items=0

    # Python venvs
    if [ ${#venvs[@]} -gt 0 ]; then
        echo -e "${YELLOW}Python Virtual Environments (${#venvs[@]} found):${NC}"
        for venv in "${venvs[@]}"; do
            [ -n "$venv" ] && echo "  - $venv ($(get_size "$venv"))" && ((total_items++))
        done
        echo ""
    fi

    # Temporary files
    if [ ${#temp_files[@]} -gt 0 ]; then
        echo -e "${YELLOW}Temporary/Cache Files (${#temp_files[@]} found):${NC}"
        local count=0
        for file in "${temp_files[@]}"; do
            [ -n "$file" ] && ((count++)) && ((total_items++))
        done
        echo "  - $count files (.DS_Store, __pycache__, .swp, etc.)"
        echo ""
    fi

    # Output files
    if [ ${#output_files[@]} -gt 0 ]; then
        echo -e "${YELLOW}Output/Generated Files (${#output_files[@]} found):${NC}"
        for file in "${output_files[@]}"; do
            [ -n "$file" ] && echo "  - $file" && ((total_items++))
        done
        echo ""
    fi

    # Build artifacts
    if [ ${#build_artifacts[@]} -gt 0 ]; then
        echo -e "${YELLOW}Build Artifacts (${#build_artifacts[@]} found):${NC}"
        for artifact in "${build_artifacts[@]}"; do
            [ -n "$artifact" ] && echo "  - $artifact ($(get_size "$artifact"))" && ((total_items++))
        done
        echo ""
    fi

    # Redundant directories
    if [ ${#redundant_dirs[@]} -gt 0 ]; then
        echo -e "${YELLOW}Redundant Directories (${#redundant_dirs[@]} found):${NC}"
        for dir in "${redundant_dirs[@]}"; do
            [ -n "$dir" ] && echo "  - $dir" && ((total_items++))
        done
        echo ""
    fi

    if [ $total_items -eq 0 ]; then
        print_success "No items found to clean - repository is already clean!"
        exit 0
    fi

    echo -e "${YELLOW}Total items to remove: $total_items${NC}"
    echo ""

    # Store for cleanup functions
    export FOUND_VENVS="${venvs[*]}"
    export FOUND_TEMP_FILES="${temp_files[*]}"
    export FOUND_OUTPUT_FILES="${output_files[*]}"
    export FOUND_BUILD_ARTIFACTS="${build_artifacts[*]}"
    export FOUND_REDUNDANT_DIRS="${redundant_dirs[*]}"
}

confirm_cleanup() {
    read -p "Do you want to proceed with cleanup? (yes/no): " response

    if [[ ! "$response" =~ ^[Yy][Ee][Ss]$ ]]; then
        print_warning "Cleanup cancelled by user"
        exit 0
    fi

    echo ""
}

################################################################################
# Cleanup Functions
################################################################################

cleanup_venvs() {
    print_header "Step 1: Removing Python Virtual Environments"

    local venvs=($FOUND_VENVS)
    local removed=0

    if [ ${#venvs[@]} -eq 0 ] || [ -z "${venvs[0]}" ]; then
        print_info "No virtual environments to remove"
        return
    fi

    for venv in "${venvs[@]}"; do
        if [ -n "$venv" ] && [ -d "$venv" ]; then
            local size=$(get_size "$venv")
            print_info "Removing $(basename "$venv") ($size)..."
            rm -rf "$venv"
            print_success "Removed $venv"
            ((removed++))
        fi
    done

    print_success "Removed $removed virtual environment(s)"
}

cleanup_temp_files() {
    print_header "Step 2: Removing Temporary/Cache Files"

    local temp_files=($FOUND_TEMP_FILES)
    local removed=0

    if [ ${#temp_files[@]} -eq 0 ] || [ -z "${temp_files[0]}" ]; then
        print_info "No temporary files to remove"
        return
    fi

    for file in "${temp_files[@]}"; do
        if [ -n "$file" ] && [ -e "$file" ]; then
            rm -rf "$file" 2>/dev/null && ((removed++))
        fi
    done

    print_success "Removed $removed temporary file(s)"
}

cleanup_output_files() {
    print_header "Step 3: Removing Output/Generated Files"

    local output_files=($FOUND_OUTPUT_FILES)
    local removed=0

    if [ ${#output_files[@]} -eq 0 ] || [ -z "${output_files[0]}" ]; then
        print_info "No output files to remove"
        return
    fi

    for file in "${output_files[@]}"; do
        if [ -n "$file" ] && [ -f "$file" ]; then
            print_info "Removing $(basename "$file")..."
            rm -f "$file"
            print_success "Removed $file"
            ((removed++))
        fi
    done

    print_success "Removed $removed output file(s)"
}

cleanup_build_artifacts() {
    print_header "Step 4: Removing Build Artifacts"

    local build_artifacts=($FOUND_BUILD_ARTIFACTS)
    local removed=0

    if [ ${#build_artifacts[@]} -eq 0 ] || [ -z "${build_artifacts[0]}" ]; then
        print_info "No build artifacts to remove"
        return
    fi

    for artifact in "${build_artifacts[@]}"; do
        if [ -n "$artifact" ] && [ -d "$artifact" ]; then
            local size=$(get_size "$artifact")
            print_info "Removing $(basename "$artifact") ($size)..."
            rm -rf "$artifact"
            print_success "Removed $artifact"
            ((removed++))
        fi
    done

    print_success "Removed $removed build artifact(s)"
}

cleanup_redundant_dirs() {
    print_header "Step 5: Removing Redundant Directories"

    local redundant_dirs=($FOUND_REDUNDANT_DIRS)
    local removed=0

    if [ ${#redundant_dirs[@]} -eq 0 ] || [ -z "${redundant_dirs[0]}" ]; then
        print_info "No redundant directories to remove"
        return
    fi

    for dir in "${redundant_dirs[@]}"; do
        # Remove " (in .gitignore)" suffix if present
        dir="${dir% (in .gitignore)}"

        if [ -n "$dir" ] && [ -d "$dir" ]; then
            local size=$(get_size "$dir")
            print_info "Removing $(basename "$dir") ($size)..."
            rm -rf "$dir"
            print_success "Removed $dir"
            ((removed++))
        fi
    done

    print_success "Removed $removed redundant director(ies)"
}

################################################################################
# Summary
################################################################################

print_summary() {
    print_header "Cleanup Summary"

    local final_size=$(get_size "$TARGET_DIR")

    echo "Cleanup completed successfully!"
    echo ""
    echo "Target Directory: $TARGET_DIR"
    echo "Final Size: $final_size"
    echo ""
    echo "Cleaned up:"
    echo "  ✓ Python virtual environments"
    echo "  ✓ Temporary/cache files (.DS_Store, __pycache__, etc.)"
    echo "  ✓ Output/generated files (logs, repomix files, etc.)"
    echo "  ✓ Build artifacts (.jekyll-cache, dist/, etc.)"
    echo "  ✓ Redundant directories (drafts/, temp/, backup/, etc.)"
    echo ""

    print_success "Repository cleanup completed!"
}

recommend_gitignore() {
    print_header "Recommendations"

    if [ ! -f "$TARGET_DIR/.gitignore" ]; then
        print_warning "No .gitignore found - consider creating one"
        return
    fi

    echo "Consider adding these patterns to .gitignore if not already present:"
    echo ""
    echo "  # Python"
    echo "  venv/"
    echo "  .venv/"
    echo "  *.pyc"
    echo "  __pycache__/"
    echo ""
    echo "  # System files"
    echo "  .DS_Store"
    echo "  Thumbs.db"
    echo ""
    echo "  # Build artifacts"
    echo "  dist/"
    echo "  build/"
    echo "  *.log"
    echo ""
    echo "  # Temporary"
    echo "  temp/"
    echo "  tmp/"
    echo "  *.swp"
    echo ""
}

################################################################################
# Main Execution
################################################################################

main() {
    print_header "Universal Repository Cleanup Script"

    echo "Target: $TARGET_DIR"
    echo ""

    # Show preview and get confirmation
    show_preview
    confirm_cleanup

    # Execute cleanup tasks
    cleanup_venvs
    cleanup_temp_files
    cleanup_output_files
    cleanup_build_artifacts
    cleanup_redundant_dirs

    # Print summary
    print_summary

    # Print recommendations
    recommend_gitignore

    print_success "All cleanup tasks completed successfully!"
}

# Run main function
main "$@"

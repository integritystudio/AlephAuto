---
name: cleanup
description: Comprehensive development environment organization skill. Reorganizes test files, cleans up logs, restructures documentation, fixes broken links, and removes deprecated directories. Use when a codebase needs organization, cleanup, or when documentation structure is messy.
triggers:
  - keyword: cleanup
  - keyword: organize
  - keyword: reorganize
  - intent: "organize my codebase"
  - intent: "clean up my project"
  - intent: "fix documentation structure"
  - intent: "organize test files"
  - intent: "clean up logs"
tags:
  - organization
  - cleanup
  - documentation
  - maintenance
location: user
---

# Development Environment Cleanup & Organization Skill

This skill implements comprehensive development environment organization, including test file reorganization, log cleanup, documentation restructuring, and broken link detection/repair.

## What This Skill Does

1. ✅ Analyzes current project structure (tests, logs, documentation)
2. ✅ Creates organization plan with user approval
3. ✅ Reorganizes test files into logical structure
4. ✅ Archives old logs (keeps last 7 days active)
5. ✅ Restructures documentation into clear hierarchy
6. ✅ Detects and fixes broken internal links
7. ✅ Removes deprecated directories after verification
8. ✅ Provides verification and summary reports

## When to Use This Skill

Trigger this skill when:
- User asks to "organize", "cleanup", or "reorganize" their project
- Documentation is scattered across multiple directories
- Test files mix test suites with standalone scripts
- Logs directory has thousands of old files
- Internal documentation links are broken
- Project structure needs refactoring for maintainability

## Pattern: 5-Phase Organization Process

### Phase 1: Test Files Reorganization

**Goal**: Separate test suites from standalone test scripts.

**Pattern**:
```bash
# Create scripts subdirectory
mkdir -p test/scripts

# Move standalone scripts (test-*.js pattern)
mv test/test-*.js test/scripts/

# Keep test suites in root (*.test.js pattern)
# Test runners discover *.test.js in root automatically
```

**Key Insight**: Test suites (`.test.js`) should stay in `test/` root for test runner discovery. Standalone scripts go in `test/scripts/`.

**Example Structure**:
```
test/
├── scripts/              # Standalone test utilities
│   ├── test-connection.js
│   ├── test-webhook.js
│   └── test-single-job.js
├── api-routes.test.js    # Test suites (discovered by runners)
├── caching.test.js
└── websocket.test.js
```

### Phase 2: Logs Directory Cleanup

**Goal**: Archive old logs, keep only recent operational logs.

**Pattern**:
```bash
# Count files to archive
find logs -maxdepth 1 -name "*.json" -mtime +7 -type f | wc -l

# Archive old files (>7 days)
find logs -maxdepth 1 -name "*.json" -mtime +7 -type f -exec mv {} logs/archive/ \;

# Verify cleanup
du -sh logs/archive
ls -lh logs/ | head -15
```

**Key Insight**:
- Keep `logs/archive/` for historical data
- Keep only last 7 days of logs active
- Can achieve 99%+ reduction in clutter

**Metrics from Session**:
- Before: 6,035+ files
- After: 14 files (last 7 days)
- Archived: 24MB
- Reduction: 99.8%

### Phase 3: Documentation Restructuring

**Goal**: Create logical documentation hierarchy.

**Recommended Structure**:
```
docs/
├── README.md                    # Navigation index (ALWAYS create this!)
├── components/                  # Component-specific documentation
├── implementation-reports/      # Implementation summaries
│   ├── api-testing/
│   ├── deployment/
│   └── [feature-specific]/
├── progress/                    # Project progress tracking
│   ├── changelog/
│   ├── phases/
│   └── sessions/
└── setup/                       # Setup guides and scripts
```

**Pattern**:
```bash
# Create structure
mkdir -p docs/{components,implementation-reports/{api-testing,deployment,precision-fixes},progress/{phases,sessions,changelog},setup}

# Move root-level implementation docs
mv PRECISION_*.md docs/implementation-reports/precision-fixes/
mv API_*.md docs/implementation-reports/api-testing/
mv DEPLOYMENT_*.md PHASE3_*.md docs/implementation-reports/deployment/

# Move dev/ progress docs
mv dev/PHASE*.md docs/progress/phases/
mv dev/SESSION*.md docs/progress/sessions/
cp -r dev/changelog docs/progress/

# Move setup files
cp -r setup-files/* docs/setup/
```

**Key Insight**: Always create `docs/README.md` with navigation links. This becomes the entry point for all documentation.

**Example docs/README.md**:
```markdown
# Documentation Index

## Quick Links

### Getting Started
- [Setup Guide](./setup/SETUP.md)
- [Quickstart](./progress/QUICKSTART.md)

### Implementation Reports
- [API Testing](./implementation-reports/api-testing/)
- [Deployment](./implementation-reports/deployment/)

### Component Documentation
- [Component A](./components/COMPONENT_A.md)
- [Component B](./components/COMPONENT_B.md)

### Progress Tracking
- [Changelog](./progress/changelog/)
- [Phase Reports](./progress/phases/)
- [Session Summaries](./progress/sessions/)
```

### Phase 4: Broken Link Detection & Repair

**Goal**: Find and fix all broken internal documentation links.

**Detection Pattern**:
```bash
# Find old path references
grep -r "old-path/" --include="*.md" . | grep -v node_modules | wc -l

# Examples of patterns to detect:
# - setup-files/ → docs/setup/
# - dev/PHASE → docs/progress/phases/
# - dev/SESSION → docs/progress/sessions/
```

**Fix Pattern**:
```bash
# Fix all references in docs/ directory
find docs -name "*.md" -type f -exec sed -i '' 's|old-path/|docs/new-path/|g' {} \;

# Use relative paths for subdirectories
find docs -name "*.md" -type f -exec sed -i '' 's|docs/new-path/|../new-path/|g' {} \;

# Fix top-level docs to use local paths
sed -i '' 's|../new-path/|./new-path/|g' docs/README.md docs/progress/README.md
```

**Key Insight**: Use relative paths for documentation links:
- Subdirectory docs: `../setup/file.md`
- Top-level docs: `./setup/file.md`
- Preserve absolute paths for executables: `/full/path/script.sh`
- Preserve relative executable paths: `./docs/setup/script.sh`

**Verification Pattern**:
```bash
# Create verification script
check_file() {
    if [ -f "$1" ]; then
        echo "✅ $1"
    else
        echo "❌ $1 (NOT FOUND)"
    fi
}

# Test key links
check_file "docs/setup/SETUP.md"
check_file "docs/components/README.md"
check_file "docs/progress/QUICKSTART.md"

# Count remaining broken links
grep -r "old-path/" --include="*.md" . | \
    grep -v node_modules | \
    grep -v venv | \
    grep -v ".old" | \
    wc -l
```

**Success Metric**: 0 remaining broken links (excluding archived directories).

### Phase 5: Cleanup & Verification

**Goal**: Remove deprecated directories and verify organization.

**Pattern**:
```bash
# Verify old directory is no longer needed
du -sh old-directory/
diff -r old-directory/ new-directory/ | grep -E "^Only in|^Files.*differ"

# Remove deprecated directory
rm -rf old-directory/

# Verify removal
ls -la | grep old
```

**Key Insight**: Only remove old directories AFTER:
1. Verifying content was migrated
2. Checking for unique files
3. Confirming no active references

## Complete Workflow

### Step 1: Initial Analysis

```bash
# Analyze test structure
find test -name "*.js" | head -20

# Check logs size
du -sh logs/*
find logs -name "*.json" -mtime +7 | wc -l

# Check documentation
find . -maxdepth 2 -name "*.md" | grep -v node_modules
```

### Step 2: Create Organization Plan

**Template**:
```markdown
## Organization Plan

### 1. Test Files
- Create test/scripts/
- Move: [list files]
- Keep: [list files]

### 2. Logs
- Archive: X files (Y MB)
- Keep: Last 7 days

### 3. Documentation
- Create docs/ structure
- Move: [list categories]
- Create: docs/README.md

### 4. Links
- Expected broken links: ~N
- Pattern: old-path/ → new-path/

### 5. Cleanup
- Remove: old-directory/ after verification
```

### Step 3: Execute with TodoWrite Tracking

**Always use TodoWrite** to track progress:
```javascript
TodoWrite([
  {content: "Reorganize test files", status: "in_progress", activeForm: "Reorganizing test files"},
  {content: "Clean up logs directory", status: "pending", activeForm: "Cleaning up logs directory"},
  {content: "Restructure documentation", status: "pending", activeForm: "Restructuring documentation"},
  {content: "Fix broken links", status: "pending", activeForm: "Fixing broken links"},
  {content: "Remove deprecated directories", status: "pending", activeForm: "Removing deprecated directories"}
])
```

### Step 4: Verification & Summary

**Create Summary Report** showing:
- Files organized (count)
- Links fixed (count)
- Space cleaned (MB)
- Before/after metrics
- Verification checklist

## Best Practices

### 1. Always Get User Approval First

Before executing changes:
1. Analyze current state
2. Create detailed plan
3. Show impact (files moved, deleted, etc.)
4. Ask user: "Which would you like me to execute?"

### 2. Use TodoWrite Throughout

Track every phase as separate todo items. Mark completed immediately after finishing each task.

### 3. Preserve Important Paths

Don't change:
- Cron job absolute paths: `/full/path/to/script.sh`
- Executable commands: `./docs/setup/script.sh`
- Archive directories: `dev/changelog/`, `logs/archive/`

### 4. Create Navigation Documentation

Always create `docs/README.md` with:
- Directory structure diagram
- Quick links section
- Category descriptions
- Link to main project README

### 5. Verify Before Removing

Before `rm -rf old-directory/`:
1. `du -sh old-directory/` (check size)
2. `diff -r old-directory/ new-directory/` (check for unique files)
3. `grep -r "old-directory/" . --include="*.md"` (check for references)

## Common Patterns & Solutions

### Pattern: Mixed Test Files

**Problem**: Test suites and standalone scripts mixed together.

**Solution**:
```bash
mkdir -p test/scripts
mv test/test-*.js test/scripts/  # Standalone scripts
# Keep *.test.js in root for test runners
```

### Pattern: Thousands of Old Logs

**Problem**: Logs directory has 5,000+ files, slowing down operations.

**Solution**:
```bash
# Archive files older than 7 days
find logs -maxdepth 1 -name "*.json" -mtime +7 -exec mv {} logs/archive/ \;
```

**Expected Result**: 99%+ reduction in active log count.

### Pattern: Scattered Documentation

**Problem**: README files in root, dev/, setup-files/, etc.

**Solution**: Centralize into `docs/` with 4 main categories:
1. `components/` - Component-specific docs
2. `implementation-reports/` - Implementation summaries
3. `progress/` - Progress tracking
4. `setup/` - Setup guides

### Pattern: Broken Links After Move

**Problem**: Moving files breaks internal links.

**Solution**:
```bash
# Global find-and-replace
find docs -name "*.md" -exec sed -i '' 's|old-path/|new-path/|g' {} \;

# Convert to relative paths
find docs -name "*.md" -exec sed -i '' 's|docs/new-path/|../new-path/|g' {} \;
```

## Metrics & Success Criteria

### Test Organization
- ✅ Test suites in `test/` root
- ✅ Scripts in `test/scripts/`
- ✅ Clear separation

### Log Cleanup
- ✅ 95%+ reduction in active logs
- ✅ Last 7 days kept active
- ✅ Historical data archived

### Documentation
- ✅ Single `docs/` entry point
- ✅ Logical 4-category hierarchy
- ✅ Navigation README created
- ✅ 40+ files organized

### Broken Links
- ✅ 100% broken links fixed
- ✅ 0 remaining broken links (excluding archives)
- ✅ All navigation links verified

### Cleanup
- ✅ No duplicate directories
- ✅ Old directories removed after verification
- ✅ Clean workspace achieved

## Example Session Results

From actual cleanup session (2025-11-17):

**Phase 1: Test Files**
- Files moved: 5
- Structure created: `test/scripts/`
- Result: Clean separation

**Phase 2: Logs**
- Archived: 6,035 files (24MB)
- Kept: 14 files (last 7 days)
- Reduction: 99.8%

**Phase 3: Documentation**
- Files organized: 40+
- Structure: `docs/` with 4 categories
- Created: Navigation README

**Phase 4: Broken Links**
- Links checked: 136
- Broken links: 133
- Fixed: 133
- Success rate: 100%

**Phase 5: Cleanup**
- Removed: `setup-files.old/` (136K)
- Result: Clean workspace

**Overall Impact**:
- Files organized: 50+
- Links fixed: 133
- Space cleaned: 24MB+ archived
- Directories created: 10
- Old directories removed: 1

## Troubleshooting

### Issue: Test Runner Can't Find Tests

**Cause**: Moved `.test.js` files out of `test/` root.

**Fix**: Keep test suites in `test/` root, only move standalone scripts.

### Issue: Links Still Broken After Fix

**Cause**: Incorrect relative path depth.

**Fix**: Check directory depth and use correct `../` count:
- Same directory: `./file.md`
- Parent directory: `../file.md`
- Grandparent: `../../file.md`

### Issue: Scripts Can't Execute After Move

**Cause**: Paths in documentation changed to relative, broke executable paths.

**Fix**: Preserve executable paths:
```bash
# Don't change these patterns
./docs/setup/script.sh     # Keep as-is
/full/path/to/script.sh    # Keep as-is
```

## Additional Notes

1. **Archive vs. Delete**: Always archive old files rather than delete. Disk space is cheap, data recovery is expensive.

2. **Historical Directories**: Don't update links in `dev/changelog/` or `setup-files.old/` - these are historical records.

3. **Progressive Disclosure**: Show the user a high-level plan first, then execute phase by phase with progress updates.

4. **Verification is Critical**: Always verify file moves succeeded before removing old directories.

5. **Documentation is Key**: The `docs/README.md` navigation file is the most important deliverable.

## Summary

This skill provides a systematic approach to development environment organization:
1. Analyze → 2. Plan → 3. Execute → 4. Fix → 5. Verify

Use TodoWrite tracking throughout, get user approval before major changes, and always create comprehensive navigation documentation.

**Final Result**: Clean, maintainable, well-documented codebase with zero broken links.

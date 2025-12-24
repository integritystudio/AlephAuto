# Universal Repository Cleanup Script

**Location:** `~/code/jobs/sidequest/universal-repo-cleanup.sh`
**Created:** 2025-11-17
**Purpose:** Clean up common bloat from any repository

## Quick Start

```bash
# Clean current directory
~/code/jobs/sidequest/universal-repo-cleanup.sh

# Clean specific directory
~/code/jobs/sidequest/universal-repo-cleanup.sh /path/to/repo

# Clean a project
~/code/jobs/sidequest/universal-repo-cleanup.sh ~/projects/myapp
```

## What It Does

This script automatically detects and removes common bloat from repositories:

### 1. Python Virtual Environments
Removes directories matching common venv patterns:
- `venv/`, `.venv/`, `env/`, `.env/`
- `virtualenv/`, `*.venv/`
- Custom patterns (e.g., `personal_site/`)

### 2. Temporary/Cache Files
Removes system and editor temporary files:
- `.DS_Store` (macOS)
- `__pycache__/`, `*.pyc`, `*.pyo` (Python)
- `*.swp`, `*.swo`, `*~` (Vim/editor)
- `Thumbs.db`, `desktop.ini` (Windows)

### 3. Output/Generated Files
Removes generated output files:
- `repomix-output.xml` (nested, keeps root)
- `*.log`, `npm-debug.log*`
- `yarn-debug.log*`, `yarn-error.log*`

### 4. Build Artifacts
Removes common build directories:
- `.jekyll-cache`, `.sass-cache`, `.bundle` (Jekyll)
- `dist/`, `build/`, `out/`, `.output/` (Build outputs)
- `.next/`, `.nuxt/` (Framework caches)
- `node_modules/.cache/` (NPM cache)
- `target/`, `.gradle/` (Java/Gradle)

### 5. Redundant Directories
Removes common redundant directories:
- `drafts/`, `temp/`, `tmp/`
- `backup/`, `backups/`, `old/`
- `archive/`, `deprecated/`

## Features

✅ **Safe & Interactive**
- Preview what will be removed before deletion
- Shows sizes and counts
- Requires explicit "yes" confirmation

✅ **Intelligent Scanning**
- Skips `node_modules/` when looking for venvs
- Preserves root-level `repomix-output.xml`
- Detects `.gitignore` entries

✅ **Universal Compatibility**
- Works on any repository type
- Configurable patterns
- Language agnostic

✅ **Visual Feedback**
- Color-coded output (green/yellow/red/blue)
- Progress indicators (✓ ✗ ⚠ →)
- Size calculations for removed items

## Usage Examples

### Example 1: Personal Website
```bash
cd ~/projects/PersonalSite
~/code/jobs/sidequest/universal-repo-cleanup.sh
```

**Output:**
```
========================================
Repository Cleanup Preview
========================================

Target Directory: /Users/you/projects/PersonalSite
Current Size: 616M

Python Virtual Environments (2 found):
  - personal_site (40M)
  - utils/numpy (42M)

Temporary/Cache Files (3 found):
  - 3 files (.DS_Store, __pycache__, .swp, etc.)

Build Artifacts (2 found):
  - .jekyll-cache (5M)
  - dist (123K)

Total items to remove: 7

Do you want to proceed with cleanup? (yes/no):
```

### Example 2: React Project
```bash
~/code/jobs/sidequest/universal-repo-cleanup.sh ~/projects/my-react-app
```

Cleans:
- `.next/` cache
- `dist/` build output
- `.DS_Store` files
- `npm-debug.log` files

### Example 3: Python Project
```bash
~/code/jobs/sidequest/universal-repo-cleanup.sh ~/projects/django-app
```

Cleans:
- `venv/`, `.venv/` directories
- `__pycache__/` directories
- `*.pyc` files
- `*.log` files

## Customization

Edit the script to customize what gets cleaned:

```bash
# Add custom venv patterns
VENV_PATTERNS=(
    "venv"
    ".venv"
    "your_custom_venv_name"  # Add here
)

# Add custom build artifacts
BUILD_ARTIFACTS=(
    "dist"
    "build"
    "your_build_dir"  # Add here
)

# Add custom redundant directories
REDUNDANT_DIRS=(
    "drafts"
    "temp"
    "your_backup_dir"  # Add here
)
```

## Safety Features

### Preview Before Deletion
Always shows what will be removed with sizes before asking for confirmation

### No Accidental Deletions
- Requires explicit "yes" to proceed
- Exit codes on errors (`set -e`)
- Validates directory exists

### Preserves Important Files
- Skips `node_modules/` when scanning
- Keeps root-level `repomix-output.xml`
- Respects `.gitignore` patterns

### Error Handling
- Validates target directory exists
- Handles missing files gracefully
- Reports errors clearly

## Output Format

### Summary Report
```
========================================
Cleanup Summary
========================================

Cleanup completed successfully!

Target Directory: /Users/you/projects/repo
Final Size: 150M

Cleaned up:
  ✓ Python virtual environments
  ✓ Temporary/cache files (.DS_Store, __pycache__, etc.)
  ✓ Output/generated files (logs, repomix files, etc.)
  ✓ Build artifacts (.jekyll-cache, dist/, etc.)
  ✓ Redundant directories (drafts/, temp/, backup/, etc.)
```

### Recommendations
```
========================================
Recommendations
========================================

Consider adding these patterns to .gitignore if not already present:

  # Python
  venv/
  .venv/
  *.pyc
  __pycache__/

  # System files
  .DS_Store
  Thumbs.db

  # Build artifacts
  dist/
  build/
  *.log
```

## Common Use Cases

### 1. Before Committing
Clean up before committing to ensure no build artifacts or venvs are added:
```bash
~/code/jobs/sidequest/universal-repo-cleanup.sh
git status
```

### 2. After Cloning
Clean up a cloned repo that has committed bloat:
```bash
git clone https://github.com/user/repo
cd repo
~/code/jobs/sidequest/universal-repo-cleanup.sh
```

### 3. Periodic Maintenance
Run monthly to keep repos clean:
```bash
# Add to cron or run manually
~/code/jobs/sidequest/universal-repo-cleanup.sh ~/projects/myapp
```

### 4. Disk Space Recovery
Find and clean the biggest repos:
```bash
# Find large directories
du -sh ~/projects/* | sort -hr | head -10

# Clean the largest
~/code/jobs/sidequest/universal-repo-cleanup.sh ~/projects/largest-repo
```

## Integration with Git

### Pre-commit Hook
Add to `.git/hooks/pre-commit`:
```bash
#!/bin/bash
~/code/jobs/sidequest/universal-repo-cleanup.sh "$(git rev-parse --show-toplevel)"
```

### Alias
Add to `~/.bashrc` or `~/.zshrc`:
```bash
alias cleanup='~/code/jobs/sidequest/universal-repo-cleanup.sh'

# Usage:
# cd my-repo
# cleanup
```

## Comparison with Original Script

| Feature | Original (PersonalSite) | Universal |
|---------|------------------------|-----------|
| Target | Single repo | Any directory |
| Patterns | Jekyll-specific | Universal |
| Usage | `./utils/cleanup-repository.sh` | `script.sh [directory]` |
| Customization | Hardcoded | Configurable arrays |
| Scanning | Manual checks | Automatic detection |
| Portability | Project-specific | Portable |

## Troubleshooting

### "Directory does not exist"
```bash
# Check the path
ls -la /path/to/repo

# Use absolute path
~/code/jobs/sidequest/universal-repo-cleanup.sh /full/path/to/repo
```

### "No items found to clean"
Repository is already clean! This is normal if:
- Already ran the script
- Repo has good .gitignore
- No bloat present

### Script shows items but doesn't remove
Make sure you typed "yes" exactly (case-sensitive):
```
Do you want to proceed with cleanup? (yes/no): yes
```

### Want to skip confirmation (dangerous)
```bash
# Auto-confirm (use with caution!)
echo "yes" | ~/code/jobs/sidequest/universal-repo-cleanup.sh /path/to/repo
```

## Advanced Usage

### Dry Run (Preview Only)
The script always shows preview first - just answer "no" to confirmation:
```
Do you want to proceed with cleanup? (yes/no): no
```

### Clean Multiple Repos
```bash
#!/bin/bash
for repo in ~/projects/*; do
    if [ -d "$repo/.git" ]; then
        echo "Cleaning $repo..."
        echo "yes" | ~/code/jobs/sidequest/universal-repo-cleanup.sh "$repo"
    fi
done
```

### Selective Cleanup
Comment out functions in `main()` to skip categories:
```bash
main() {
    # ...
    cleanup_venvs
    cleanup_temp_files
    # cleanup_output_files      # Skip this
    # cleanup_build_artifacts   # Skip this
    cleanup_redundant_dirs
    # ...
}
```

## Performance

### Speed
- Small repos (<100MB): ~1-2 seconds
- Medium repos (500MB): ~5-10 seconds
- Large repos (1GB+): ~30-60 seconds

### Resource Usage
- Memory: Minimal (<10MB)
- CPU: Low (scanning files)
- Disk: Frees up space

## Best Practices

1. **Run before committing** - Clean before adding files to git
2. **Review preview** - Always check what will be removed
3. **Update .gitignore** - Add patterns to prevent reintroduction
4. **Backup first** - For unfamiliar repos, backup before running
5. **Test builds** - After cleanup, test that builds still work

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-11-17 | Initial universal version from PersonalSite cleanup script |

## Related Scripts

- **Original:** `/Users/alyshialedlie/code/PersonalSite/utils/cleanup-repository.sh`
  - PersonalSite-specific version
  - More detailed verification
  - Jekyll-focused

- **Universal:** `~/code/jobs/sidequest/universal-repo-cleanup.sh`
  - Works on any repo
  - Configurable patterns
  - Portable

## Support

For issues or improvements:
1. Review this documentation
2. Check script comments for customization
3. Edit pattern arrays for specific needs
4. Contribute improvements back

---

**Last Updated:** 2025-11-24
**Author:** Data Architecture Cleanup Process
**License:** Use freely for any repository cleanup

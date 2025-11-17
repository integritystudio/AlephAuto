# Gitignore Repomix Updater

Automatically adds `repomix-output.xml` to the `.gitignore` file in all git repositories found in a directory tree.

## Features

- Recursively scans directories to find all git repositories
- Checks if `repomix-output.xml` is already in `.gitignore`
- Adds the entry with a descriptive comment if not present
- Creates `.gitignore` if it doesn't exist
- Supports dry-run mode for safe testing
- Generates detailed JSON report of all changes

## Usage

### Basic Usage

```bash
node gitignore-repomix-updater.js
```

This will scan the default directory (`~/code`) and update all found repositories.

### Dry Run (Recommended First)

```bash
node gitignore-repomix-updater.js --dry-run
```

or

```bash
node gitignore-repomix-updater.js -d
```

This will show what changes would be made without actually modifying any files.

### Custom Base Directory

```bash
node gitignore-repomix-updater.js /path/to/your/projects
```

### Dry Run with Custom Directory

```bash
node gitignore-repomix-updater.js /path/to/your/projects --dry-run
```

## Output

The script provides:

1. Console output showing progress and actions taken
2. Summary statistics at the end
3. JSON report file: `gitignore-update-report-[timestamp].json`

### Example Output

```
Scanning for git repositories in: /Users/username/code
Dry run mode: NO

Found 15 git repositories

Processing: /Users/username/code/project1
  -> added: Entry added successfully

Processing: /Users/username/code/project2
  -> skipped: Entry already exists

...

=== SUMMARY ===
Total repositories found: 15
Added: 10
Skipped (already exists): 4
Would add (dry run): 0
Errors: 1

Results saved to: gitignore-update-report-1234567890.json
```

## What Gets Added

The script adds the following to each `.gitignore`:

```
# Repomix output files
repomix-output.xml
```

If the entry already exists (in any of these forms), the file is skipped:
- `repomix-output.xml`
- `/repomix-output.xml`
- `**/repomix-output.xml`

## Safety Features

- Checks for existing entries to avoid duplicates
- Dry-run mode for testing
- Skips directories it can't access (with warning)
- Preserves existing `.gitignore` content
- Handles missing `.gitignore` files gracefully

## Configuration Options

Edit the script to customize:

```javascript
const updater = new GitignoreRepomixUpdater({
  baseDir: '/your/custom/path',  // Base directory to scan
  dryRun: false,                  // Set to true for dry-run
  maxDepth: 10,                   // Maximum directory depth
  excludeDirs: [                  // Directories to skip
    'node_modules',
    '.git',
    'dist',
    // ... add more
  ]
});
```

## Programmatic Usage

You can also use it as a module:

```javascript
import { GitignoreRepomixUpdater } from './gitignore-repomix-updater.js';

const updater = new GitignoreRepomixUpdater({
  baseDir: '/path/to/projects',
  dryRun: true,
});

const results = await updater.processRepositories();
console.log(results.summary);
```

## Report Format

The JSON report includes:

- Timestamp
- Base directory scanned
- Dry run status
- Total repositories found
- Detailed results for each repository
- Summary statistics

Example:

```json
{
  "timestamp": "2025-01-15T10:30:00.000Z",
  "baseDir": "/Users/username/code",
  "dryRun": false,
  "gitignoreEntry": "repomix-output.xml",
  "totalRepositories": 15,
  "results": [
    {
      "repository": "/Users/username/code/project1",
      "path": "/Users/username/code/project1/.gitignore",
      "action": "added",
      "reason": "Entry added successfully"
    }
  ],
  "summary": {
    "added": 10,
    "skipped": 4,
    "would_add": 0,
    "error": 1
  }
}
```

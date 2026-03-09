# Gitignore Updater

Automatically adds `repomix-output.xml` to the `.gitignore` file in all git repositories found in a directory tree.

**Entry points:**
- Pipeline runner: `sidequest/pipeline-runners/gitignore-pipeline.ts`
- Worker: `sidequest/workers/gitignore-worker.ts`

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
doppler run -- node --strip-types sidequest/pipeline-runners/gitignore-pipeline.ts
```

This will scan the default directory (`~/code`) and update all found repositories.

### Dry Run (Recommended First)

```bash
doppler run -- DRY_RUN=true node --strip-types sidequest/pipeline-runners/gitignore-pipeline.ts
```

This will show what changes would be made without actually modifying any files.

### Custom Base Directory

```bash
doppler run -- CODE_BASE_DIR=/path/to/your/projects node --strip-types sidequest/pipeline-runners/gitignore-pipeline.ts
```

### Dry Run with Custom Directory

```bash
doppler run -- DRY_RUN=true CODE_BASE_DIR=/path/to/your/projects node --strip-types sidequest/pipeline-runners/gitignore-pipeline.ts
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

Configure via environment variables (Doppler):

| Variable | Default | Description |
|----------|---------|-------------|
| `CODE_BASE_DIR` | `~/code` | Base directory to scan |
| `DRY_RUN` | `false` | Preview changes without modifying files |

## Programmatic Usage

You can also use the worker directly:

```typescript
import { GitignoreWorker } from './sidequest/workers/gitignore-worker.ts';

const worker = new GitignoreWorker();
const jobId = await worker.createJob('gitignore-update', {
  baseDir: '/path/to/projects',
  dryRun: true,
});
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

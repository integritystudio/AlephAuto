# Git Hooks for AlephAuto

This directory contains Git hooks to maintain code quality and documentation freshness.

## Active Hooks

### post-commit

**Purpose**: Warn when pipeline documentation may be stale

**Behavior**:
- Triggers after every commit
- Checks if pipeline-related files were modified:
  - `sidequest/pipeline-runners/*.{js,ts}`
  - `sidequest/workers/*pipeline*.js`
  - `sidequest/workers/*worker*.js`
- If pipeline files changed but `docs/architecture/pipeline-data-flow.md` wasn't updated, displays a warning with:
  - List of changed pipeline files
  - Days since documentation was last updated
  - Reminder to review and update the documentation

**Example Output**:
```
⚠️  DOCUMENTATION STALENESS WARNING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Pipeline code changes detected in this commit:
  • sidequest/pipeline-runners/duplicate-detection-pipeline.ts
  • sidequest/workers/repomix-worker.js

Documentation file: docs/architecture/pipeline-data-flow.md
Last updated: 2025-11-24 (3 days ago)

Please review and update the pipeline documentation if needed:
  1. Check if new pipelines were added
  2. Verify data flow diagrams are accurate
  3. Update the 'Last Updated' date in the doc header
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Installation**:
The hook is already installed and executable. To disable it temporarily:
```bash
chmod -x .git/hooks/post-commit
```

To re-enable:
```bash
chmod +x .git/hooks/post-commit
```

## Future Hooks

Consider adding:
- `pre-commit`: TypeScript compilation checks, linting
- `pre-push`: Run test suite before pushing
- `commit-msg`: Enforce conventional commit format

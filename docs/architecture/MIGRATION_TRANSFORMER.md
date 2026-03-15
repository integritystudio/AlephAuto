# Migration Transformer - AST-Based Code Transformation

**Version:** 2.1.0 | **Last Updated:** 2026-03-14

**Location:** `sidequest/pipeline-core/git/migration-transformer.ts`

## Overview

Automated code transformation system that applies consolidation migration steps using Babel AST manipulation. Part of the duplicate detection workflow -- after duplicates are identified, this transforms affected files to use the consolidated code.

> **Note:** The standalone `PRCreator` was removed (DD-GW1). Git workflow operations now go through `BranchManager` via `SidequestServer`.

## Flow

```
ConsolidationSuggestion (with migration_steps)
  → MigrationTransformer.applyMigrationSteps()
    → git stash (safety backup)
    → For each affected file: Parse AST → Transform → Generate → Write
    → Return { filesModified, transformations, errors }
    → On error: rollback via git checkout + git clean
  → BranchManager handles commit/PR (via SidequestServer git workflow)
```

## Transformation Types

| Type | Pattern | Example |
|------|---------|---------|
| **Update Import** | `Update import from 'X' to 'Y'` | Change import source path |
| **Add Import** | `Add import 'X' from 'Y'` | Insert new import at top of file |
| **Replace Call** | `Replace calls to X with Y` | Rewrite function calls (supports dot notation) |
| **Remove Declaration** | `Remove duplicate function/class/var X` | Delete duplicate code |

### File Path Inference

The transformer determines which file to modify via:
1. Code example comment (preferred): `code_example: "// src/api/routes.ts\nimport ..."`
2. Transformation type fallback (apply to files importing/calling old code)
3. Suggestion context (`affected_files`, duplicate group locations)

## Safety Features

- **Stash/rollback:** `git stash` before transforms; `git checkout . && git clean -fd` on error
- **Atomic per-file:** All transforms for one file in a single AST pass; parse failure skips file
- **Error isolation:** Per-file and per-transform errors don't stop other files
- **Dry run:** `new MigrationTransformer({ dryRun: true })` logs without modifying files

## Usage

```javascript
import { MigrationTransformer } from './sidequest/pipeline-core/git/migration-transformer.ts';

const transformer = new MigrationTransformer();
const result = await transformer.applyMigrationSteps(suggestion, '/path/to/repo');
// result: { filesModified: string[], transformations: [...], errors: [...] }
```

## Limitations

- **Pattern-based:** Migration step descriptions must match specific string patterns
- **JS/TS only:** Uses Babel parser (with typescript, jsx, decorators-legacy plugins)
- **Simple refactorings:** Import updates, call replacements, declaration removal -- not complex control flow or type signature changes

## Testing

```bash
node --strip-types --test tests/unit/migration-transformer.test.ts
```

Covers: step parsing, AST transforms, stash/rollback, dry run, error isolation.

## Performance

~100ms per file (50ms parse, 10ms transform, 30ms generate, 5ms write).

## References

- `sidequest/pipeline-core/git/branch-manager.ts` -- centralized git workflow
- `sidequest/pipeline-core/models/types.ts` -- data models (CodeBlock, DuplicateGroup, ConsolidationSuggestion)
- [Pipeline Data Flow](./pipeline-data-flow.md) -- duplicate detection pipeline
- [Error Handling](./ERROR_HANDLING.md)

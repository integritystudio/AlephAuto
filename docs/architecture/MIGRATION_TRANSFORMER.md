# Migration Transformer - AST-Based Code Transformation

## Overview

The Migration Transformer is an automated code transformation system that applies consolidation migration steps to affected files using AST (Abstract Syntax Tree) manipulation. It's part of the duplicate detection PR creation workflow.

**Location:** `sidequest/pipeline-core/git/migration-transformer.js`

## Purpose

When duplicate code is consolidated, affected files need to be updated to:
1. Import from the new consolidated location
2. Update function/class calls to use the new names
3. Remove old duplicate code
4. Ensure code continues to work after consolidation

Manual migration is error-prone and time-consuming. The Migration Transformer automates this process using safe AST manipulation.

## Architecture

### High-Level Flow

```
ConsolidationSuggestion (with migration_steps)
           ↓
    MigrationTransformer
           ↓
    Parse Migration Steps
           ↓
    Create Backup (.migration-backups/)
           ↓
    For Each Affected File:
      - Parse to AST (Babel)
      - Apply Transformations
      - Generate New Code
      - Write to File
           ↓
    Return Results (filesModified, transformations, errors)
           ↓
    On Error: Rollback from Backup
```

### Integration with PR Creator

```javascript
// In pr-creator.js
class PRCreator {
  constructor(options = {}) {
    this.migrationTransformer = new MigrationTransformer({
      dryRun: this.dryRun
    });
  }

  async _applySuggestions(suggestions, repositoryPath) {
    for (const suggestion of suggestions) {
      // 1. Create consolidated file
      await fs.writeFile(targetPath, suggestion.proposed_implementation);

      // 2. Apply migration steps (NEW)
      if (suggestion.migration_steps.length > 0) {
        const migrationResult = await this.migrationTransformer.applyMigrationSteps(
          suggestion,
          repositoryPath
        );

        // Add migrated files to PR
        filesModified.push(...migrationResult.filesModified);
      }
    }
  }
}
```

## Transformation Types

### 1. Update Import

**Pattern:** `Update import from '<old-path>' to '<new-path>'`

**Example:**
```javascript
// Before
import { writeJsonFile } from './utils/json.js';

// Migration Step
"Update import from './utils/json.js' to '../shared/json-utils.js'"

// After
import { writeJsonFile } from '../shared/json-utils.js';
```

**AST Implementation:**
```javascript
traverse(ast, {
  ImportDeclaration(path) {
    if (path.node.source.value === oldPath) {
      path.node.source.value = newPath;
    }
  }
});
```

### 2. Add Import

**Pattern:** `Add import '<imported>' from '<source>'`

**Example:**
```javascript
// Before
const data = { foo: 'bar' };

// Migration Step
"Add import '{ writeJsonFile }' from '../shared/json-utils.js'"

// After
import { writeJsonFile } from '../shared/json-utils.js';
const data = { foo: 'bar' };
```

**AST Implementation:**
```javascript
const specifiers = [t.importSpecifier(t.identifier(name), t.identifier(name))];
const importDeclaration = t.importDeclaration(specifiers, t.stringLiteral(source));
ast.program.body.unshift(importDeclaration);
```

### 3. Replace Call

**Pattern:** `Replace calls to <oldName> with <newName>`

**Example:**
```javascript
// Before
const result = writeJsonFile('output.json', data);

// Migration Step
"Replace calls to writeJsonFile with jsonUtils.writeJsonFile"

// After
const result = jsonUtils.writeJsonFile('output.json', data);
```

**Supports dot notation:**
- `oldFunc` → `utils.oldFunc`
- `oldFunc` → `utils.sub.oldFunc`

**AST Implementation:**
```javascript
traverse(ast, {
  CallExpression(path) {
    if (t.isIdentifier(path.node.callee, { name: oldName })) {
      // Build member expression for dot notation
      const parts = newName.split('.');
      let memberExpr = t.identifier(parts[0]);
      for (let i = 1; i < parts.length; i++) {
        memberExpr = t.memberExpression(memberExpr, t.identifier(parts[i]));
      }
      path.node.callee = memberExpr;
    }
  }
});
```

### 4. Remove Declaration

**Pattern:** `Remove duplicate function/class/const/let/var <name>`

**Example:**
```javascript
// Before
function writeJsonFile(path, data) {
  // Old duplicate implementation
}

function otherFunction() {
  return true;
}

// Migration Step
"Remove duplicate function writeJsonFile"

// After
function otherFunction() {
  return true;
}
```

**AST Implementation:**
```javascript
traverse(ast, {
  FunctionDeclaration(path) {
    if (path.node.id && path.node.id.name === name) {
      path.remove();
    }
  },
  ClassDeclaration(path) { /* same */ },
  VariableDeclarator(path) { /* same */ }
});
```

## Migration Step Format

Migration steps are defined in `ConsolidationSuggestion.migration_steps`:

```javascript
{
  step_number: 1,
  description: "Update import from './utils/json.js' to '../shared/json-utils.js'",
  code_example: "// src/api/routes.js\nimport { writeJsonFile } from '../shared/json-utils.js';",
  automated: true,
  estimated_time: "5min"
}
```

### File Path Inference

The transformer needs to know which file to apply each step to. It uses:

1. **Code example comment** (preferred):
   ```javascript
   code_example: "// src/api/routes.js\nimport { ... } from '...';"
   ```
   Extracts `src/api/routes.js` from first line comment.

2. **Transformation type** (fallback):
   - `update-import`, `add-import` → Apply to all files importing old code
   - `remove-declaration` → Apply to files where duplicate exists
   - `replace-call` → Apply to all files calling old function

3. **Suggestion context**:
   - Use `suggestion.affected_files` if available
   - Use duplicate group member locations

## Safety Features

### 1. Backup System

Before any transformations:
```javascript
const backupPath = await this._createBackup(repositoryPath);
// backupPath = .migration-backups/backup-<timestamp>/
```

Each file is backed up before transformation. On error, automatic rollback:
```javascript
try {
  await transformer.applyMigrationSteps(suggestion, repoPath);
} catch (error) {
  await transformer.rollback(backupPath, repoPath);
  throw error;
}
```

### 2. Atomic Operations

All transformations for a single file are applied in one AST pass:
```
Parse → Transform → Generate → Write
```

If parsing fails, file is skipped (not modified).

### 3. Dry Run Mode

```javascript
const transformer = new MigrationTransformer({ dryRun: true });
await transformer.applyMigrationSteps(suggestion, repoPath);
// No files modified, only logs what would change
```

### 4. Error Isolation

Transformation errors are isolated:
- Per-file errors don't stop other files
- Per-transformation errors don't stop other transformations
- All errors logged to Sentry

```javascript
for (const file of affectedFiles) {
  try {
    await transformFile(file);
  } catch (error) {
    logger.error({ error, file });
    results.errors.push({ file, error: error.message });
    // Continue with next file
  }
}
```

## Return Value

```javascript
{
  filesModified: ['src/api/routes.js', 'src/utils/helper.js'],
  transformations: [
    {
      file: 'src/api/routes.js',
      modified: true,
      transformations: [
        { type: 'update-import', from: './old.js', to: './new.js' },
        { type: 'replace-call', from: 'oldFunc', to: 'utils.oldFunc' }
      ],
      originalLength: 1234,
      newLength: 1256
    },
    {
      file: 'src/utils/helper.js',
      modified: true,
      transformations: [
        { type: 'remove-declaration', name: 'duplicateFunc' }
      ]
    }
  ],
  errors: [
    { file: 'tests/legacy.test.js', error: 'Parse error: Unexpected token' }
  ],
  backupPath: '.migration-backups/backup-1732567890123'
}
```

## Dependencies

### Babel Ecosystem

```json
{
  "@babel/core": "^7.26.0",
  "@babel/generator": "^7.26.0",
  "@babel/parser": "^7.26.0",
  "@babel/traverse": "^7.26.0",
  "@babel/types": "^7.26.0"
}
```

**Why Babel?**
- Industry-standard AST manipulation
- Supports modern JavaScript (ES2024) and TypeScript
- Plugin ecosystem for JSX, decorators, etc.
- Reliable code generation with source maps

### Parser Plugins

```javascript
parse(source, {
  sourceType: 'module',
  plugins: [
    'typescript',
    'jsx',
    'decorators-legacy',
    'classProperties',
    'objectRestSpread',
    'asyncGenerators',
    'dynamicImport',
    'optionalChaining',
    'nullishCoalescingOperator'
  ]
});
```

## Usage

### Basic Usage

```javascript
import { MigrationTransformer } from './sidequest/pipeline-core/git/migration-transformer.js';

const transformer = new MigrationTransformer();

const suggestion = {
  suggestion_id: 'cs_001',
  migration_steps: [
    {
      step_number: 1,
      description: 'Update import from "./old.js" to "./new.js"',
      code_example: '// src/index.js',
      automated: true
    }
  ]
};

const result = await transformer.applyMigrationSteps(
  suggestion,
  '/path/to/repository'
);

console.log(`Modified ${result.filesModified.length} files`);
```

### With PR Creator

```javascript
import { PRCreator } from './sidequest/pipeline-core/git/pr-creator.js';

const prCreator = new PRCreator({
  baseBranch: 'main',
  dryRun: false
});

// PRCreator automatically uses MigrationTransformer
const prResults = await prCreator.createPRsForSuggestions(
  scanResult,
  repositoryPath
);
```

### Dry Run Testing

```javascript
const transformer = new MigrationTransformer({ dryRun: true });

const result = await transformer.applyMigrationSteps(suggestion, repoPath);

// No files modified, only logs
console.log('Would modify:', result.filesModified);
console.log('Transformations:', result.transformations);
```

## Testing

### Test File

`tests/unit/migration-transformer.test.js`

### Test Coverage

1. **Parsing migration steps**
   - Update import patterns
   - Replace call patterns
   - Add import patterns
   - Remove declaration patterns

2. **AST transformations**
   - Update import paths
   - Add new imports
   - Replace function calls (simple and namespaced)
   - Remove declarations (functions, classes, variables)
   - Multiple transformations in one file

3. **Safety features**
   - Backup creation
   - Rollback on error
   - Dry run mode

4. **Error handling**
   - Non-JavaScript files
   - Parse errors
   - Individual transformation errors

### Run Tests

```bash
npm test tests/unit/migration-transformer.test.js
```

## Limitations

### 1. Pattern-Based Parsing

Migration step descriptions must follow specific patterns:
- "Update import from 'X' to 'Y'"
- "Replace calls to X with Y"
- "Add import 'X' from 'Y'"
- "Remove duplicate function/class/var X"

**Workaround:** Standardize migration step generation in consolidation suggester.

### 2. JavaScript/TypeScript Only

Currently only supports JavaScript and TypeScript files.

**Future:** Add Python support using `ast` module, other languages as needed.

### 3. File Path Inference

Requires file path hints in `code_example`:
```javascript
code_example: "// src/api/routes.js\nimport ..."
```

**Workaround:** Infer from suggestion context (affected_files, duplicate locations).

### 4. Simple Refactorings

Handles common patterns but not complex refactorings:
- ✅ Import updates
- ✅ Simple function call replacements
- ✅ Declaration removal
- ❌ Complex control flow changes
- ❌ Type signature changes
- ❌ Multi-file refactorings requiring analysis

**Future:** Integration with jscodeshift for complex refactorings.

## Future Enhancements

### 1. Multi-Language Support

```javascript
class MigrationTransformer {
  constructor(options = {}) {
    this.transformers = {
      '.js': new JavaScriptTransformer(),
      '.ts': new TypeScriptTransformer(),
      '.py': new PythonTransformer(),
      '.go': new GoTransformer()
    };
  }
}
```

### 2. Type-Aware Transformations

Use TypeScript compiler API for type-aware refactoring:
```javascript
import ts from 'typescript';

const program = ts.createProgram([filePath], compilerOptions);
const checker = program.getTypeChecker();
// Use type information for safer transformations
```

### 3. Codemod Integration

Support jscodeshift for complex transformations:
```javascript
import jscodeshift from 'jscodeshift';

const transform = (file, api) => {
  const j = api.jscodeshift;
  return j(file.source)
    .find(j.CallExpression)
    .forEach(path => {
      // Complex transformation logic
    })
    .toSource();
};
```

### 4. Validation Mode

Verify transformations compile and pass tests:
```javascript
const result = await transformer.applyMigrationSteps(suggestion, repoPath);

// Run TypeScript compiler
await runTsc(repoPath);

// Run tests
await runTests(repoPath);

// If validation fails, rollback
if (!validationPassed) {
  await transformer.rollback(result.backupPath, repoPath);
}
```

### 5. Interactive Mode

Prompt for confirmation on ambiguous transformations:
```javascript
const transformer = new MigrationTransformer({ interactive: true });

// Prompts:
// "Found 3 files importing from './old.js'. Update all? (y/n)"
// "Found multiple functions named 'writeJson'. Remove all? (y/n/select)"
```

## Troubleshooting

### Parse Errors

**Symptom:** "Failed to parse file as JavaScript/TypeScript"

**Causes:**
- File is not JavaScript/TypeScript (e.g., JSON, Markdown)
- Syntax errors in source file
- Missing Babel plugins for syntax features

**Solution:**
1. Check file extension
2. Validate source file syntax
3. Add required Babel plugins to parser options

### No Transformations Applied

**Symptom:** `modified: false` in results

**Causes:**
- Migration step description doesn't match pattern
- File path not inferred correctly
- Import/function name doesn't exist in file

**Solution:**
1. Check migration step description format
2. Add file path hint in `code_example`
3. Verify import/function exists in file

### Rollback Failed

**Symptom:** "Rollback failed" error

**Causes:**
- Backup directory deleted
- Permission errors
- File conflicts

**Solution:**
1. Check `.migration-backups/` directory exists
2. Verify write permissions
3. Manually restore from backup if needed

### Dry Run Not Working

**Symptom:** Files modified in dry run mode

**Cause:** `dryRun: false` passed to constructor

**Solution:**
```javascript
// Ensure dryRun is enabled
const transformer = new MigrationTransformer({ dryRun: true });
```

## Performance

### Benchmarks

**Single file transformation:**
- Parse: ~50ms
- Transform: ~10ms
- Generate: ~30ms
- Write: ~5ms
- **Total: ~100ms per file**

**10 files:**
- Sequential: ~1000ms
- Parallel: ~300ms (3 concurrent)

### Optimization

1. **Parallel processing** (future):
   ```javascript
   const results = await Promise.all(
     files.map(file => transformFile(file))
   );
   ```

2. **AST caching** (future):
   ```javascript
   const astCache = new Map();
   if (!astCache.has(filePath)) {
     astCache.set(filePath, parse(source));
   }
   ```

3. **Incremental transformations**:
   Only transform files that need it (check if patterns exist before parsing)

## Related Documentation

- **PR Creator:** `sidequest/pipeline-core/git/pr-creator.js`
- **Consolidation Suggestions:** `sidequest/pipeline-core/models/consolidation_suggestion.py`
- **Duplicate Detection:** `docs/architecture/pipeline-data-flow.md`
- **Error Handling:** `docs/architecture/ERROR_HANDLING.md`

---

**Version:** 1.0.0
**Last Updated:** 2025-11-25
**Maintainer:** AlephAuto Team

# ast-grep Pattern Library for Code Consolidation

This directory contains a comprehensive collection of ast-grep rules for detecting code patterns that are candidates for consolidation across repositories.

## Directory Structure

```
.ast-grep/
├── sgconfig.yml                    # Master configuration
├── duplicate-error-handling.yml    # Legacy rule (moved to rules/)
├── fs-operations.yml              # Legacy rule (moved to rules/)
└── rules/
    ├── api/                       # API and HTTP patterns
    │   ├── auth-checks.yml
    │   ├── error-responses.yml
    │   ├── express-route-handlers.yml
    │   └── request-validation.yml
    ├── async/                     # Asynchronous patterns
    │   ├── await-patterns.yml
    │   └── promise-chains.yml
    ├── config/                    # Configuration patterns
    │   ├── config-objects.yml
    │   └── env-variables.yml
    ├── database/                  # Database operation patterns
    │   ├── connection-handling.yml
    │   ├── prisma-operations.yml
    │   └── query-builders.yml
    ├── logging/                   # Logging patterns
    │   ├── console-statements.yml
    │   └── logger-patterns.yml
    └── utilities/                 # Utility function patterns
        ├── array-map-filter.yml
        ├── object-manipulation.yml
        ├── string-manipulation.yml
        ├── type-checking.yml
        └── validation.yml
```

**Total Rules:** 18 active rules across 6 categories

## Rule Categories

### 1. Utilities (5 rules)

**Purpose:** Detect common utility operations that could be consolidated

- **array-map-filter.yml** - Array iteration methods (map, filter, reduce, forEach, find, findIndex)
- **object-manipulation.yml** - Object operations (keys, values, entries, assign, spread, JSON)
- **string-manipulation.yml** - String operations (trim, case, split, replace, slice, substring)
- **type-checking.yml** - Type checking patterns (typeof, instanceof, Array.isArray)
- **validation.yml** - Validation logic (null checks, error throws, early returns)

### 2. API Patterns (4 rules)

**Purpose:** Identify API-related patterns for standardization

- **express-route-handlers.yml** - Route handler patterns (GET, POST, PUT, DELETE, PATCH)
- **auth-checks.yml** - Authentication/authorization patterns (401/403 responses, token checks)
- **error-responses.yml** - API error response patterns (status codes, error objects)
- **request-validation.yml** - Request validation patterns (body, params, query validation)

### 3. Database (3 rules)

**Purpose:** Track database access patterns for repository pattern consolidation

- **prisma-operations.yml** - Prisma ORM patterns (findUnique, create, update, delete, etc.)
- **query-builders.yml** - Raw SQL query patterns (SELECT, INSERT, UPDATE, DELETE)
- **connection-handling.yml** - Connection management (connect, disconnect, pooling)

### 4. Configuration (2 rules)

**Purpose:** Find configuration access that should be centralized

- **env-variables.yml** - Direct process.env access (should use config module)
- **config-objects.yml** - Configuration object patterns

### 5. Async Patterns (2 rules)

**Purpose:** Detect asynchronous code patterns for consistency

- **await-patterns.yml** - Async/await with try-catch patterns
- **promise-chains.yml** - Promise chains (.then, .catch, Promise.all, etc.)

### 6. Logging (2 rules)

**Purpose:** Track logging patterns for standardization

- **console-statements.yml** - Console.log usage (should be replaced with structured logger)
- **logger-patterns.yml** - Structured logger usage patterns

## Usage

### Scan a Single Directory

```bash
# Scan with all rules
ast-grep scan sidequest/

# Scan with specific rule
ast-grep scan -r .ast-grep/rules/config/env-variables.yml sidequest/

# Scan multiple directories
ast-grep scan sidequest/ sidequest/output/condense/ directory-scan-reports/
```

### Scan by Category

```bash
# Scan for all utility patterns
ast-grep scan -r .ast-grep/rules/utilities/ sidequest/

# Scan for all API patterns
ast-grep scan -r .ast-grep/rules/api/ sidequest/

# Scan for all database patterns
ast-grep scan -r .ast-grep/rules/database/ sidequest/
```

### Output Formats

```bash
# JSON output (for programmatic processing)
ast-grep scan --json sidequest/

# Default pretty output
ast-grep scan sidequest/

# Count matches only
ast-grep scan sidequest/ | grep -c "pattern"
```

## Test Results (on sidequest/ directory)

| Rule Category | Matches Found | Notes |
|---------------|---------------|-------|
| Logger patterns | 3,405 | Very high usage of structured logging ✅ |
| Object manipulation | ~50+ | JSON.stringify, Object.entries common |
| Env variables | ~20+ | Some direct process.env access found |
| Async/await | ~15+ | Good try-catch error handling patterns |
| Array operations | TBD | Need to test |
| File system ops | ~20+ | Many fs.readFile, fs.writeFile patterns |

## Integration with Duplicate Detection Pipeline

### Phase 1: Pattern Discovery
1. Run all rules across target repositories
2. Collect matches with file locations and line numbers
3. Group by pattern type

### Phase 2: Similarity Analysis
1. Extract AST nodes for each match
2. Compare structural similarity
3. Calculate consolidation scores

### Phase 3: Recommendations
1. Generate consolidation suggestions
2. Prioritize by frequency and impact
3. Suggest abstraction tier (local util, shared package, MCP, agent)

## Adding New Rules

### Rule Template

```yaml
id: rule-name
language: javascript  # or typescript, python, etc.
rule:
  any:  # or 'all', 'pattern', 'not', etc.
    - pattern: $PATTERN1
    - pattern: $PATTERN2
message: Description of what was found
severity: info  # or warning, error
note: Additional context for consolidation analysis
```

### Best Practices

1. **Use descriptive IDs:** `category-specific-name` (e.g., `database-prisma-operations`)
2. **Provide context:** Include helpful notes about consolidation potential
3. **Test thoroughly:** Verify rule matches intended patterns without false positives
4. **Use appropriate severity:**
   - `info` - Pattern tracking for analysis
   - `warning` - Anti-pattern or should be refactored
   - `error` - Code that must be changed
5. **Document expected matches:** Add examples in rule comments

### Testing New Rules

```bash
# Test rule syntax
ast-grep test .ast-grep/rules/your-rule.yml

# Test against sample code
echo 'const x = process.env.FOO' | ast-grep -p 'process.env.$VAR'

# Scan specific directory
ast-grep scan -r .ast-grep/rules/your-rule.yml path/to/test/
```

## Pattern Syntax Reference

### Meta Variables

- `$VAR` - Matches a single AST node
- `$$$` - Matches zero or more nodes
- `$$$ARGS` - Named multi-node match
- `$_VAR` - Non-capturing (performance optimization)

### Matchers

```yaml
rule:
  pattern: $EXACT_MATCH         # Single pattern
  any: [$PAT1, $PAT2]          # Match any pattern (OR)
  all: [$PAT1, $PAT2]          # Match all patterns (AND)
  not: { pattern: $PAT }        # Negation
  inside: { pattern: $CONTEXT } # Must be inside context
```

### Advanced Patterns

```yaml
# Match repeated variables (detect duplicates)
pattern: $A == $A

# Match multi-line code blocks
pattern: |
  if ($COND) {
    $$$BODY
  }

# Match specific structures
pattern: |
  class $CLASS {
    $METHOD($$$ARGS) {
      $$$BODY
    }
  }
```

## Next Steps

1. **Expand rule library:**
   - React/Vue component patterns
   - Test framework patterns
   - Module import/export patterns

2. **Create test suite:**
   - Sample code for each pattern
   - Expected match counts
   - Automated rule validation

3. **Build aggregation tool:**
   - Collect all scan results
   - Deduplicate matches
   - Generate consolidated reports

4. **Integrate with pydantic:**
   - Define data models for matches
   - Structure results for analysis
   - Enable pipeline processing

## Resources

- [ast-grep Documentation](https://ast-grep.github.io/)
- [Pattern Syntax Guide](https://ast-grep.github.io/guide/pattern-syntax.html)
- [Rule Configuration](https://ast-grep.github.io/guide/rule-config.html)
- [Playground](https://ast-grep.github.io/playground.html)

---

**Created:** 2025-11-11
**Last Updated:** 2025-11-11
**Version:** 1.0.0

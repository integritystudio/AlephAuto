# Phase 1: ast-grep Research & Capabilities Analysis

**Date:** 2025-11-11
**Task:** Research and design: Analyze ast-grep capabilities for multi-language AST pattern matching
**Status:** ✅ Complete

## Executive Summary

ast-grep is a powerful, production-ready tool for structural code search and analysis that will serve as the foundation for our duplicate detection pipeline. It provides AST-based pattern matching across 31 programming languages with excellent performance (tens of thousands of files in seconds).

## Key Findings

### 1. Supported Languages (31 total)

| Category | Languages |
|----------|-----------|
| **Web/Frontend** | JavaScript, TypeScript, TSX, HTML, CSS, JSON |
| **Backend** | Python, Java, Go, Rust, C#, PHP, Ruby, Kotlin, Scala, Swift, Elixir, Lua |
| **Systems** | C, C++, Bash |
| **Specialized** | Solidity, Nix, Haskell, YAML |

**Impact for our project:**
- ✅ Covers all languages in our codebase (JavaScript/TypeScript, Python)
- ✅ Extensible via custom tree-sitter parsers
- ✅ Multi-language document support (e.g., HTML with embedded JS/CSS)

### 2. Installation Methods

```bash
# Homebrew (macOS)
brew install ast-grep

# NPM (cross-platform)
npm install --global @ast-grep/cli

# Pip (Python)
pip install ast-grep-cli

# Cargo (Rust)
cargo install ast-grep --locked
```

**Installed version:** 0.39.9
**Status:** ✅ Already installed and tested

### 3. Pattern Syntax

#### Meta Variables
- **Single node:** `$VAR`, `$FUNC`, `$METHOD` - matches exactly one AST node
- **Multiple nodes:** `$$$` or `$$$ARGS` - matches zero or more nodes
- **Reuse:** Same variable name matches identical nodes (e.g., `$A == $A` finds duplicates)
- **Non-capturing:** `$_VAR` - optimized for performance when reuse not needed

#### Examples Tested

```javascript
// Find all imports
import { $IMPORT } from '$PATH'

// Find file system operations
await fs.$METHOD($$$ARGS)

// Find event listeners
$VAR.on($EVENT, ($$$) => { $$$ })

// Find error handling patterns
try { $$$BODY } catch ($ERROR) { $$$HANDLER }

// Find logger usage
logger.$LEVEL({ $$$ }, $$$)
```

**All patterns tested successfully** ✅

### 4. Structural vs Semantic Matching Capabilities

#### Structural Matching (Strong ✅)

ast-grep excels at structural pattern matching:

- **✅ Exact structure matching:** Finds code with identical AST structure
- **✅ Wildcard matching:** Flexible matching with `$` and `$$$`
- **✅ Nested pattern matching:** Can match deeply nested expressions
- **✅ Multi-line code blocks:** Handles complex code structures
- **✅ Ignore whitespace/formatting:** Matches regardless of formatting

**Example:** Found 20+ instances of `await fs.$METHOD()` across different files, showing it can identify structural duplicates even with different arguments.

#### Semantic Matching (Limited ⚠️)

ast-grep has some semantic capabilities but is primarily structural:

- **⚠️ Variable renaming:** Cannot automatically detect that `foo(x)` and `bar(y)` are semantically identical if they have the same logic
- **⚠️ Code equivalence:** Cannot detect that `x + 1` and `1 + x` are equivalent
- **⚠️ Control flow analysis:** Doesn't understand program flow or data dependencies
- **✅ Meta-variable reuse:** Can detect duplicated expressions within same pattern (e.g., `$A == $A`)

**Conclusion:** ast-grep is excellent for finding **structural duplicates** but would need additional tooling for **semantic equivalence** detection.

### 5. Duplicate Detection Capabilities

#### What ast-grep CAN detect:

1. **Identical code patterns** across files
   - Found multiple try-catch blocks with similar structure
   - Identified 18+ fs operations following same pattern

2. **Common utilities/helpers**
   - Event listeners (`.on()` patterns)
   - Logger calls with consistent structure
   - File operations with repeated patterns

3. **Boilerplate code**
   - Import statements
   - Error handling blocks
   - Configuration patterns

#### What ast-grep CANNOT detect alone:

1. **Logic duplicates with different variable names**
   - Would need hash-based or semantic analysis

2. **Algorithmically equivalent but syntactically different code**
   - Requires data flow analysis

3. **Duplicates across different languages**
   - Would need abstraction layer

### 6. YAML Rule System

ast-grep supports YAML-based rule configuration for complex matching:

```yaml
id: duplicate-error-handling
language: javascript
rule:
  pattern: |
    try {
      $$$BODY
    } catch ($ERROR) {
      $$$HANDLER
    }
message: Found try-catch error handling pattern
note: This pattern is used for detecting similar error handling across files
```

**Advantages:**
- ✅ Reusable rule library
- ✅ Version controlled patterns
- ✅ Beautiful error reporting with file locations
- ✅ Can combine multiple matchers (all, any, not, etc.)
- ✅ Supports fix/rewrite suggestions

### 7. Performance Characteristics

- **Speed:** Written in Rust, processes tens of thousands of files in seconds
- **Parallelization:** Utilizes multiple CPU cores
- **Memory:** Efficient AST representation
- **Scalability:** Suitable for large codebases

**Tested:** Scanned entire sidequest/ directory instantly

### 8. Integration Capabilities

#### CLI Interface
```bash
ast-grep run -p 'pattern' --lang js    # Simple search
ast-grep scan -r rules/                # Scan with rules
ast-grep test                          # Test rules
```

#### Programmatic API
- JavaScript/TypeScript API available via `@ast-grep/napi`
- Python API available
- Can be embedded in Node.js applications

#### Output Formats
- Pretty terminal output with colors and context
- JSON output for programmatic processing
- Sarif format for IDE integration

## Recommendations for Duplicate Detection Pipeline

### 1. Use ast-grep for Structural Pattern Detection

ast-grep should be the **primary tool** for finding structural code duplicates:

✅ **Use for:**
- Identifying repeated code patterns (error handling, validation, API calls)
- Finding boilerplate that can be abstracted
- Detecting similar function/class structures
- Locating candidates for utility function extraction

### 2. Complement with Additional Tools

ast-grep's structural matching should be **augmented** with:

- **Hash-based duplicate detection** (for exact duplicates with different names)
- **Semantic analysis** (for algorithmically equivalent code)
- **Metrics** (cyclomatic complexity, code size for prioritization)

### 3. Build Rule Library

Create a **curated library** of YAML rules for common patterns:

```
rules/
  ├── utilities/
  │   ├── error-handling.yml
  │   ├── validation.yml
  │   └── api-calls.yml
  ├── frameworks/
  │   ├── react-patterns.yml
  │   └── express-patterns.yml
  └── custom/
      └── project-specific.yml
```

### 4. Two-Phase Detection Strategy

**Phase 1: Broad Pattern Matching**
- Use simple patterns to identify candidates
- Cast wide net across entire codebase
- Group by pattern type

**Phase 2: Similarity Analysis**
- Compare AST structure of candidates
- Calculate similarity scores
- Rank by consolidation potential

### 5. Integration Architecture

```
┌─────────────┐
│  Repository │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  ast-grep   │  ◄─── Pattern Library (YAML rules)
│   Scanner   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Pattern   │  ◄─── Grouping & deduplication
│  Aggregator │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Similarity  │  ◄─── AST comparison, hashing
│   Analyzer  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Pydantic    │  ◄─── Structured results
│   Models    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Report    │
│  Generator  │
└─────────────┘
```

## Limitations & Considerations

### Limitations

1. **Semantic understanding:** Doesn't understand code meaning, only structure
2. **Cross-language patterns:** Can't match same logic in different languages
3. **Partial matches:** Difficulty matching "similar but not identical" structures
4. **Context awareness:** No understanding of imports, dependencies, or runtime behavior

### Mitigation Strategies

1. **Use multiple rules:** Create variations of patterns to catch different styles
2. **Combine with other tools:** Use jscpd, simian, or custom similarity algorithms
3. **Manual review:** Include human verification for consolidation decisions
4. **Iterative refinement:** Improve rules based on false positives/negatives

## Next Steps

### Immediate Actions

1. ✅ **Complete Phase 1, Task 1** (this document)
2. 🔲 **Phase 1, Task 2:** Research pydantic for structuring results
3. 🔲 **Create initial pattern library** for common JavaScript/TypeScript patterns
4. 🔲 **Build AST comparison utility** for calculating pattern similarity

### Rule Library Priorities

Create rules for detecting:

1. **Utility functions:**
   - Data validation
   - Type checking
   - Array/object manipulation

2. **API patterns:**
   - HTTP request handlers
   - Authentication checks
   - Error responses

3. **Database operations:**
   - CRUD patterns
   - Query builders
   - Connection handling

4. **Configuration patterns:**
   - Environment variable access
   - Config object creation
   - Default value patterns

## Conclusion

ast-grep is **highly suitable** for our duplicate detection pipeline as the primary structural pattern matching engine. It provides:

- ✅ Excellent language coverage (31 languages)
- ✅ Fast, efficient processing (Rust-based)
- ✅ Flexible pattern syntax with meta-variables
- ✅ YAML rule system for maintainability
- ✅ Multiple integration options (CLI, API)

**Recommendation:** Proceed with ast-grep as the foundation for Phase 2 implementation, complemented by additional semantic analysis tools as needed.

---

**Research conducted by:** Claude Code
**Next task:** Phase 1, Task 2 - Evaluate pydantic for structuring duplicate detection results and metadata

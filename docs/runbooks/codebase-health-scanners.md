# Codebase Health Scanners

**Created:** 2025-11-18
**Session:** AnalyticsBot Dashboard Debugging & Root Directory Cleanup

Automated scanners for detecting common codebase health issues based on real-world debugging sessions.

---

## Overview

This scanner suite was created from a debugging session where we:

1. **Fixed infinite loading dashboard** - Identified missing timeouts on async operations
2. **Analyzed root directory clutter** - Found 46 files in root, reduced to 14

The scanners capture these patterns and can detect similar issues in any codebase.

---

## Scanners

### 1. Timeout Pattern Detector

**File:** `lib/scanners/timeout-pattern-detector.js`

Detects patterns that can cause infinite loading:

**Patterns Detected:**
- `Promise.race()` without timeout wrappers
- Loading states without `finally` blocks
- Async functions without error handling
- Missing timeout utility constants
- `setLoading(true)` without safety net timeout

**Example Issues Found:**
```typescript
// ❌ BAD: Promise.race without timeout
const { data } = await Promise.race([
  supabase.auth.getSession(),
  someOtherPromise()
]);

// ✅ GOOD: With timeout wrapper
import { withTimeout, TIMEOUT } from '../utils/timeout';
const { data } = await withTimeout(
  Promise.race([...]),
  TIMEOUT.NORMAL,
  'Session timeout'
);
```

**Usage:**
```javascript
import { TimeoutPatternDetector } from './lib/scanners/timeout-pattern-detector.js';

const detector = new TimeoutPatternDetector({ logger: console });
const findings = await detector.scan('/path/to/repo');

console.log(`Found ${findings.statistics.total_issues} issues`);
console.log(detector.generateReport(findings));
```

**Output:**
```json
{
  "promiseRaceWithoutTimeout": [...],
  "loadingWithoutFinally": [...],
  "asyncWithoutErrorHandling": [...],
  "missingTimeoutConstants": [...],
  "setLoadingWithoutReset": [...],
  "statistics": {
    "total_issues": 15,
    "affected_files": 8,
    "severity_breakdown": {
      "high": 5,
      "medium": 7,
      "low": 3
    }
  }
}
```

---

### 2. Root Directory Analyzer

**File:** `lib/scanners/root-directory-analyzer.js`

Analyzes project root directories for organization issues.

**Analysis:**
- Categorizes all root files by type
- Analyzes import dependencies (Python)
- Identifies files that can be moved
- Generates zero-breakage migration plan

**Example Output:**
```json
{
  "statistics": {
    "total_root_files": 46,
    "reduction_potential": 32,
    "final_root_files": 14,
    "reduction_percentage": 70
  },
  "recommendations": [
    {
      "id": "move_python_lib",
      "title": "Move Python Library Files to lib/",
      "files": [...],
      "target_directory": "lib",
      "requires_import_updates": true,
      "import_changes": [...]
    }
  ]
}
```

**Usage:**
```javascript
import { RootDirectoryAnalyzer } from './lib/scanners/root-directory-analyzer.js';

const analyzer = new RootDirectoryAnalyzer({ logger: console });
const analysis = await analyzer.analyze('/path/to/repo');

console.log(analyzer.generateReport(analysis));
```

**Categories Analyzed:**
- Python files
- Shell scripts
- JavaScript/TypeScript files
- Configuration files
- Data files
- Documentation
- Package manager files
- Deployment files

---

### 3. Codebase Health Scanner (CLI)

**File:** `lib/scanners/codebase-health-scanner.js`

Command-line tool that runs all scanners and generates comprehensive reports.

**Installation:**
```bash
cd ~/code/jobs
chmod +x lib/scanners/codebase-health-scanner.js
```

**Usage:**
```bash
# Run all scans
node lib/scanners/codebase-health-scanner.js ~/code/myproject --scan all

# Run specific scan
node lib/scanners/codebase-health-scanner.js ~/code/myproject --scan timeout

# Save to file
node lib/scanners/codebase-health-scanner.js ~/code/myproject --output report.md

# JSON output
node lib/scanners/codebase-health-scanner.js ~/code/myproject --json
```

**Options:**
- `--scan <type>` - Scan type: `timeout`, `root`, or `all` (default: `all`)
- `--output <file>` - Save report to file
- `--json` - Output JSON instead of markdown

**Example Output:**
```markdown
# Codebase Health Report

**Repository:** /Users/user/code/myproject
**Generated:** 2025-11-18T19:00:00.000Z

## Timeout Pattern Detection

### Promise.race() Without Timeout (5)

**1. src/api/client.ts:93**
- **Severity:** high
- **Message:** Promise.race() without timeout wrapper - may hang indefinitely
- **Recommendation:** Wrap with withTimeout() utility

## Root Directory Analysis

### Move Python Library Files to lib/ (5 files)

**Files:** auth_middleware.py, config.py, rate_limiter.py, ...
**Impact:** medium
**Requires Import Updates:** Yes

## Summary

- **Timeout Issues:** 15 issues in 8 files
  - High: 5
  - Medium: 7
  - Low: 3

- **Root Directory:** 46 files (70% reduction possible)
  - Can move: 32 files
  - Final count: 14 files
```

---

## Integration with AlephAuto

### Option 1: Add to Scan Orchestrator

```javascript
// In lib/scan-orchestrator.ts or lib/scan-orchestrator.js

import { TimeoutPatternDetector } from './scanners/timeout-pattern-detector.js';
import { RootDirectoryAnalyzer } from './scanners/root-directory-analyzer.js';

export class ScanOrchestrator {
  async runHealthScans(repoPath) {
    const results = {};

    // Run timeout detection
    const timeoutDetector = new TimeoutPatternDetector({ logger: this.logger });
    results.timeout = await timeoutDetector.scan(repoPath);

    // Run root analysis
    const rootAnalyzer = new RootDirectoryAnalyzer({ logger: this.logger });
    results.root = await rootAnalyzer.analyze(repoPath);

    return results;
  }
}
```

### Option 2: Standalone Script

Create `scripts/run-health-scan.js`:
```javascript
#!/usr/bin/env node
import { runHealthScan } from '../lib/scanners/codebase-health-scanner.js';

const repoPath = process.argv[2] || process.cwd();

const results = await runHealthScan(repoPath, {
  scanTimeout: true,
  scanRoot: true,
  logger: console
});

console.log(JSON.stringify(results, null, 2));
```

### Option 3: PM2 Ecosystem Integration

Add to `ecosystem.config.cjs`:
```javascript
module.exports = {
  apps: [
    // ... existing apps ...
    {
      name: 'health-scanner',
      script: './lib/scanners/codebase-health-scanner.js',
      args: '~/code/myproject --scan all --output ~/code/jobs/output/health-report.md',
      cron_restart: '0 0 * * *', // Daily at midnight
      autorestart: false
    }
  ]
};
```

---

## Requirements

### Dependencies

**Required:**
- `@ast-grep/cli` - For pattern detection
  ```bash
  npm install -g @ast-grep/cli
  ```

**Optional:**
- Node.js 18+ (for ESM support)
- Git (for `git mv` commands)

### Verify Installation

```bash
# Check ast-grep
sg --version

# Test timeout detector
node -e "import('./lib/scanners/timeout-pattern-detector.js').then(m => console.log('✓ Loaded'))"

# Test root analyzer
node -e "import('./lib/scanners/root-directory-analyzer.js').then(m => console.log('✓ Loaded'))"
```

---

## Real-World Examples

### Example 1: AnalyticsBot Dashboard Fix

**Problem:** Dashboard spinning forever without errors

**Scanner Output:**
```
[HIGH] src/api/client.ts:261
Promise.race() without timeout wrapper
Recommendation: Wrap getAnalyticsSummary() with withTimeout()
```

**Fix Applied:**
```typescript
// Before
async getAnalyticsSummary(request) {
  const projects = await this.listProjects(); // Could hang
  // ...
}

// After
import { withTimeout, TIMEOUT } from '../utils/timeout';

async getAnalyticsSummary(request) {
  return withTimeout(
    this._getAnalyticsSummaryInternal(request),
    TIMEOUT.SLOW,
    'Analytics summary timeout'
  );
}
```

**Result:** ✅ Dashboard loads within 10 seconds guaranteed

---

### Example 2: AnalyticsBot Root Cleanup

**Problem:** 46 files cluttering root directory

**Scanner Output:**
```
Move Python Library Files to lib/ (5 files)
  - auth_middleware.py
  - config.py
  - rate_limiter.py
  - sentry_config.py
  - metabase_integration.py

Import Changes Required:
  - mcp_server_http.py: from config → from lib.config
  - auth_middleware.py: from config → from lib.config
```

**Commands Generated:**
```bash
mkdir -p lib
git mv auth_middleware.py lib/
git mv config.py lib/
# Update 8 import statements
```

**Result:** ✅ 70% reduction (46 → 14 files)

---

## Configuration

### Timeout Detector Options

```javascript
const detector = new TimeoutPatternDetector({
  logger: console,
  astGrepBinary: 'sg' // Custom ast-grep binary path
});
```

### Root Analyzer Options

```javascript
const analyzer = new RootDirectoryAnalyzer({
  logger: console,
  maxRootFiles: 20, // Threshold for "too many files"
  thresholds: {
    pythonFiles: 3,
    shellScripts: 3,
    jsFiles: 3,
    configFiles: 5,
    dataFiles: 0
  }
});
```

---

## Extending the Scanners

### Add New Timeout Pattern

Edit `timeout-pattern-detector.js`:
```javascript
async findCustomPattern(repoPath) {
  const pattern = 'YOUR_PATTERN_HERE';
  const matches = await this.searchPattern(repoPath, pattern, {
    language: 'typescript'
  });

  return matches.map(match => ({
    ...match,
    severity: 'medium',
    category: 'custom_pattern',
    message: 'Your custom message',
    recommendation: 'How to fix'
  }));
}

// Add to scan() method
const customIssues = await this.findCustomPattern(repoPath);
findings.customPattern = customIssues;
```

### Add New Root Directory Category

Edit `root-directory-analyzer.js`:
```javascript
generateRecommendations(categorized, dependencies) {
  const recommendations = [];

  // Your custom recommendation
  const customFiles = categorized.python.filter(f => {
    return f.name.includes('custom_pattern');
  });

  if (customFiles.length > 0) {
    recommendations.push({
      id: 'move_custom',
      title: 'Move Custom Files',
      files: customFiles,
      target_directory: 'custom',
      impact: 'low'
    });
  }

  return recommendations;
}
```

---

## Troubleshooting

### "ast-grep (sg) not found"

Install ast-grep:
```bash
npm install -g @ast-grep/cli

# Verify
sg --version
```

### "Cannot find module"

Ensure you're using Node.js 18+ with ESM support:
```bash
node --version  # Should be v18.0.0 or higher
```

Use `.js` extensions in imports:
```javascript
// ✅ Good
import { TimeoutPatternDetector } from './timeout-pattern-detector.js';

// ❌ Bad
import { TimeoutPatternDetector } from './timeout-pattern-detector';
```

### Scanner returns empty results

1. Check if ast-grep can find patterns:
   ```bash
   cd /path/to/repo
   sg run --pattern 'Promise.race($$$)' --lang typescript
   ```

2. Check file extensions are included:
   ```javascript
   await this.searchPattern(repoPath, pattern, {
     language: 'typescript',
     extensions: ['.ts', '.tsx', '.js', '.jsx'] // Add this
   });
   ```

---

## Performance

**Typical Scan Times:**

| Repository Size | Timeout Scan | Root Analysis | Total |
|----------------|--------------|---------------|-------|
| Small (< 1k files) | 2-5s | 1s | 3-6s |
| Medium (1-10k files) | 10-30s | 2-5s | 12-35s |
| Large (> 10k files) | 30-60s | 5-10s | 35-70s |

**Optimization Tips:**
- Run scans in parallel when possible
- Use `--scan timeout` or `--scan root` for targeted scans
- Exclude `node_modules` and build directories in ast-grep config

---

## Future Enhancements

**Planned Features:**
- [ ] React hooks safety scanner
- [ ] Database query timeout detector
- [ ] API endpoint timeout analyzer
- [ ] Dependency cycle detector
- [ ] Code duplication finder

**Contributions Welcome:**
See `~/code/jobs/CONTRIBUTING.md` for guidelines.

---

## Related Documentation

- [AST-Grep Documentation](https://ast-grep.github.io/)
- [AlephAuto Scan Orchestrator](./scan-orchestrator.md)
- [AnalyticsBot Session Notes](../session-notes/2025-11-18-dashboard-debugging.md)

---

## Support

**Questions?** Open an issue in the AlephAuto repository.

**Bug Reports:** Include:
- Repository being scanned
- Scanner version
- Full error output
- `node --version` output

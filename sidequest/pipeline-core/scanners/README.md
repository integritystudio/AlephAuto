# Codebase Health Scanners

**Created from Session:** AnalyticsBot Debugging - Nov 18, 2025

Automated scanners derived from real debugging sessions. These tools detect the exact patterns that caused production issues.

---

## Quick Start

### 1. Install Dependencies

```bash
# Install ast-grep for pattern detection
npm install -g @ast-grep/cli

# Verify installation
sg --version
```

### 2. Run a Scan

**JavaScript/Node.js:**
```bash
cd ~/code/jobs

# Scan for timeout issues
node lib/scanners/codebase-health-scanner.js ~/code/myproject --scan timeout

# Scan for root directory issues
node lib/scanners/codebase-health-scanner.js ~/code/myproject --scan root

# Run all scans
node lib/scanners/codebase-health-scanner.js ~/code/myproject --scan all --output report.md
```

**Python (simpler, no ast-grep required):**
```bash
# Timeout detection only
python3 lib/scanners/timeout_detector.py ~/code/myproject

# Save to file
python3 lib/scanners/timeout_detector.py ~/code/myproject --output timeout-report.md
```

### 3. Review Results

Open the generated markdown report and prioritize fixes by severity:
- 🔴 **High:** Fix immediately (can cause production issues)
- 🟡 **Medium:** Fix soon (can cause user frustration)
- 🟢 **Low:** Nice to have (improves code quality)

---

## What These Scanners Do

### Timeout Pattern Detector

**Prevents:** Infinite loading spinners, hanging dashboards, frozen UIs

**Detects:**
1. `Promise.race()` without timeout wrappers
2. `setLoading(true)` without `finally` blocks
3. Async functions without error handling
4. Missing timeout utility constants
5. Loading states without safety net timeouts

**Real Bug Fixed:**
- **Problem:** AnalyticsBot dashboard spinning forever
- **Root Cause:** `getAnalyticsSummary()` called `listProjects()` which could hang indefinitely
- **Scanner Would Have Caught:** Promise.race() without timeout on line 469
- **Fix:** Added `withTimeout()` wrapper with 10-second max

### Root Directory Analyzer

**Prevents:** Messy codebases, hard-to-navigate projects, import confusion

**Analyzes:**
1. Number of files in root (flags if > 20)
2. File categorization (Python, JS, configs, data, etc.)
3. Import dependencies (Python)
4. Migration safety (detects import breakage)

**Real Cleanup Performed:**
- **Before:** 46 files in AnalyticsBot root
- **After:** 14 files in root (70% reduction)
- **Scanner Generated:** Zero-breakage migration plan with exact import changes needed

---

## Files Created

```
~/code/jobs/lib/scanners/
├── README.md (this file)
├── timeout-pattern-detector.js      # Main timeout scanner (Node.js)
├── root-directory-analyzer.js       # Root directory scanner (Node.js)
├── codebase-health-scanner.js       # CLI wrapper (runs all scanners)
└── timeout_detector.py              # Python version (simpler)

~/code/jobs/docs/
└── codebase-health-scanners.md      # Full documentation
```

---

## Usage Examples

### Example 1: Find Timeout Issues

```bash
node lib/scanners/codebase-health-scanner.js \
  ~/code/ISPublicSites/AnalyticsBot \
  --scan timeout \
  --output timeout-issues.md
```

**Output:**
```markdown
# Timeout Pattern Detection Report

## Statistics
- **Total Issues:** 15
- **Files Affected:** 8
- **Scan Duration:** 3.2s

### Severity Breakdown
- 🔴 **HIGH:** 5
- 🟡 **MEDIUM:** 7
- 🟢 **LOW:** 3

## Findings

### HIGH Severity (5)

**ui/src/api/client.ts:93**
- Category: promise_race_no_timeout
- Message: Promise.race() without timeout wrapper - may hang indefinitely
- Code: `const { data } = await Promise.race([sessionPromise, timeoutPromise]);`
- Recommendation: Wrap with withTimeout() utility
```

### Example 2: Analyze Root Directory

```bash
node lib/scanners/codebase-health-scanner.js \
  ~/code/ISPublicSites/AnalyticsBot \
  --scan root \
  --output root-cleanup.md
```

**Output:**
```markdown
# Root Directory Analysis

## Current State
- **Total Files:** 46
- **Reduction Possible:** 32 files (70%)
- **Final Count:** 14 files

## Recommendations

### 1. Move Python Library Files to lib/ (5 files)
**Target:** `lib/`
**Impact:** medium
**Requires Import Updates:** Yes

**Files:**
- auth_middleware.py
- config.py
- rate_limiter.py
- sentry_config.py
- metabase_integration.py

**Import Changes:**
- mcp_server_http.py: `from config` → `from lib.config`
- auth_middleware.py: `from config` → `from lib.config`

**Commands:**
```bash
mkdir -p lib
git mv auth_middleware.py lib/
git mv config.py lib/
# ... update imports ...
```
```

### Example 3: Python Simple Scan

```bash
python3 lib/scanners/timeout_detector.py ~/code/myproject
```

**Output:**
```
Scanning: /Users/user/code/myproject
Found 245 files to scan

# Timeout Pattern Detection Report

## Statistics
- **Total Findings:** 12
- **Files Affected:** 8

### Severity Breakdown
- 🔴 **HIGH:** 4
- 🟡 **MEDIUM:** 6
- 🟢 **LOW:** 2
```

---

## Integration Options

### Option 1: Manual CLI

Run manually when needed:
```bash
node lib/scanners/codebase-health-scanner.js ~/code/myproject
```

### Option 2: Pre-commit Hook

Add to `.git/hooks/pre-commit`:
```bash
#!/bin/bash
node ~/code/jobs/lib/scanners/codebase-health-scanner.js . --scan timeout --json > /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Timeout issues detected. Run scan for details."
  exit 1
fi
```

### Option 3: PM2 Scheduled Job

Add to `ecosystem.config.cjs`:
```javascript
{
  name: 'health-scan',
  script: './lib/scanners/codebase-health-scanner.js',
  args: '~/code/myproject --scan all --output output/health.md',
  cron_restart: '0 2 * * *', // Daily at 2am
  autorestart: false
}
```

### Option 4: GitHub Actions

Create `.github/workflows/health-scan.yml`:
```yaml
name: Codebase Health Scan
on:
  pull_request:
    branches: [main]

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install -g @ast-grep/cli
      - run: |
          node lib/scanners/codebase-health-scanner.js . \
            --scan timeout \
            --output health-report.md
      - uses: actions/upload-artifact@v3
        with:
          name: health-report
          path: health-report.md
```

---

## Common Issues & Solutions

### "ast-grep not found"

```bash
# Install globally
npm install -g @ast-grep/cli

# Or use local install
npm install @ast-grep/cli
npx sg --version
```

### "Cannot find module"

Ensure you're using Node.js 18+ with ESM:
```bash
node --version  # Should be v18.0.0+
```

### Scanner finds nothing

Check if patterns match your codebase:
```bash
# Test ast-grep manually
cd ~/code/myproject
sg run --pattern 'Promise.race($$$)' --lang typescript
```

### Python version doesn't find all issues

The Python version is simpler and uses regex. For comprehensive scanning, use the JavaScript version with ast-grep.

---

## Configuration

### Customize Thresholds

Edit scanner files to adjust sensitivity:

**Root Directory Analyzer:**
```javascript
// lib/scanners/root-directory-analyzer.js
this.maxRootFiles = 20;  // Change to your preference
this.thresholds = {
  pythonFiles: 3,        // Warn if > 3 Python files in root
  shellScripts: 3,
  jsFiles: 3,
  configFiles: 5,
  dataFiles: 0          // Never allow data files in root
};
```

**Timeout Pattern Detector:**
```javascript
// lib/scanners/timeout-pattern-detector.js
// Add custom patterns in scan() method
const customIssues = await this.findCustomPattern(repoPath);
```

---

## Real Results

### AnalyticsBot Dashboard (Nov 18, 2025)

**Problem:**
- Dashboard spinning forever
- No error messages
- Required browser restart

**Scan Results:**
```
🔴 HIGH: src/api/client.ts:261
Promise.race() in getAnalyticsSummary() without timeout

🔴 HIGH: src/api/client.ts:469
Promise.race() in listProjects() without timeout

🟡 MEDIUM: src/hooks/useDashboardData.ts:46
setLoading(true) without finally block
```

**Fixes Applied:**
1. Created `utils/timeout.ts` with `withTimeout()` utility
2. Wrapped `getAnalyticsSummary()` with 10s timeout
3. Added safety net timeout in `useDashboardData` hook
4. Replaced all `Promise.race()` calls with `withTimeout()`

**Result:**
- ✅ Dashboard loads within 10 seconds guaranteed
- ✅ Error message shown after 15 seconds if all else fails
- ✅ No more infinite spinners

---

## Next Steps

1. **Run your first scan:**
   ```bash
   node lib/scanners/codebase-health-scanner.js ~/code/myproject
   ```

2. **Review the generated report**

3. **Fix high severity issues first**

4. **Integrate into your workflow:**
   - Add to pre-commit hooks
   - Schedule via PM2
   - Add to CI/CD pipeline

5. **Customize for your needs:**
   - Add project-specific patterns
   - Adjust thresholds
   - Create custom categories

---

## Documentation

**Full Documentation:**
- [Detailed Guide](../../docs/codebase-health-scanners.md)

**Session Notes:**
- Based on AnalyticsBot debugging session
- Real production issues → Real automated detection
- Patterns extracted from actual fixes

**Support:**
- Questions? Check the full docs
- Issues? Create a ticket in AlephAuto repo
- Improvements? Contributions welcome!

---

**Created:** 2025-11-18
**Session:** AnalyticsBot Dashboard Debugging & Root Directory Cleanup
**Framework:** AlephAuto @ ~/code/jobs

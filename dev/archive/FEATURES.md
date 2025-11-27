# AlephAuto Features - Detailed Documentation

This document provides detailed explanations of all AlephAuto features, including technical implementation details, use cases, and advanced configuration options.

## Table of Contents

1. [Core Infrastructure (AlephAuto)](#core-infrastructure-alephauto)
2. [Repomix Automation](#repomix-automation)
3. [Documentation Enhancement Pipeline](#documentation-enhancement-pipeline)
4. [Git Activity Reporter](#git-activity-reporter)
5. [Gitignore Manager](#gitignore-manager)
6. [Codebase Health Scanners](#codebase-health-scanners)
7. [Job Management & Architecture](#job-management--architecture)

---

## Core Infrastructure (AlephAuto)

### Job Queue System

The AlephAuto job queue system provides a robust foundation for all pipeline operations.

**Features:**
- **Concurrent Processing**: Process multiple repositories simultaneously with configurable limits
- **Job Status Tracking**: Track jobs through lifecycle: `created` → `queued` → `running` → `completed/failed`
- **Priority Queue**: Jobs are processed in FIFO order within each priority level
- **Resource Management**: Automatic resource cleanup and memory management

**Technical Details:**
```javascript
// Job structure
{
  id: 'unique-job-id',
  type: 'repomix|doc-enhancement|git-activity',
  status: 'queued|running|completed|failed',
  data: { /* job-specific data */ },
  result: { /* job output */ },
  error: { /* error details if failed */ },
  createdAt: Date,
  startedAt: Date,
  completedAt: Date
}
```

**Configuration:**
- `MAX_CONCURRENT`: Maximum concurrent jobs (default: 3)
- `JOB_TIMEOUT`: Job timeout in milliseconds (default: 600000 - 10 minutes)
- `QUEUE_MAX_SIZE`: Maximum queue size (default: 1000)

### Event-Driven Monitoring

Real-time job status updates via EventEmitter pattern.

**Available Events:**
- `job:created` - Job added to queue
- `job:queued` - Job queued for processing
- `job:started` - Job execution began
- `job:progress` - Job progress update (if supported)
- `job:completed` - Job finished successfully
- `job:failed` - Job encountered an error

**Usage Example:**
```javascript
worker.on('job:created', (job) => {
  console.log(`New job: ${job.id}`);
});

worker.on('job:completed', (job) => {
  console.log(`Completed: ${job.id}`, job.result);
});

worker.on('job:failed', (job) => {
  console.error(`Failed: ${job.id}`, job.error);
  // Send notification, retry, etc.
});
```

### Sentry Integration

Comprehensive error tracking and performance monitoring.

**Error Tracking:**
- Automatic error capture with full stack traces
- Job context included in error reports
- Breadcrumb trail for debugging
- Error grouping by job type and error message

**Performance Monitoring:**
- Transaction tracking for each job
- Operation timing (start, end, duration)
- Resource usage metrics
- Slow job detection and alerting

**Configuration:**
```bash
SENTRY_DSN=https://your-sentry-dsn
SENTRY_ENVIRONMENT=production
SENTRY_RELEASE=1.0.0
SENTRY_TRACES_SAMPLE_RATE=0.1  # 10% of transactions
```

### Cron Scheduling

Automated execution at scheduled times using node-cron.

**Features:**
- Configurable cron expressions
- Timezone support
- Multiple independent schedules
- Immediate execution option (`RUN_ON_STARTUP=true`)

**Cron Expression Format:**
```
 ┌────────────── second (optional)
 │ ┌──────────── minute (0-59)
 │ │ ┌────────── hour (0-23)
 │ │ │ ┌──────── day of month (1-31)
 │ │ │ │ ┌────── month (1-12)
 │ │ │ │ │ ┌──── day of week (0-6, Sunday=0)
 │ │ │ │ │ │
 * * * * * *
```

**Common Patterns:**
- `0 2 * * *` - Daily at 2 AM
- `0 0 * * 0` - Weekly on Sunday at midnight
- `0 */6 * * *` - Every 6 hours
- `*/30 * * * *` - Every 30 minutes
- `0 9-17 * * 1-5` - Every hour from 9 AM to 5 PM on weekdays

### Safe Operations (Dry Run Mode)

Test changes before applying them with dry-run mode.

**Features:**
- Simulate all operations without modifying files
- Full logging of what would happen
- Validate configuration and inputs
- Test error handling

**Usage:**
```bash
# Documentation enhancement dry run
npm run docs:enhance:dry

# Gitignore manager dry run
node sidequest/gitignore-repomix-updater.js ~/code --dry-run

# Health scanner dry run
./lib/scanners/codebase-health-scanner.js ~/code/myproject --scan all --dry-run
```

### Structured Logging

JSON-formatted logs with multiple severity levels using Pino.

**Log Levels:**
- `trace` (10) - Very detailed diagnostic information
- `debug` (20) - Detailed debug information
- `info` (30) - Informational messages (default)
- `warn` (40) - Warning messages
- `error` (50) - Error messages
- `fatal` (60) - Fatal errors

**Log Format:**
```json
{
  "level": 30,
  "time": 1701234567890,
  "pid": 12345,
  "hostname": "myserver",
  "component": "repomix-worker",
  "jobId": "job-abc123",
  "msg": "Processing repository",
  "data": { "path": "/Users/user/code/project" }
}
```

**Configuration:**
```bash
LOG_LEVEL=info           # Minimum log level
LOG_PRETTY=true          # Pretty-print logs (development)
LOG_FILE=logs/app.log    # Log file path
```

---

## Repomix Automation

### Recursive Directory Scanning

Automatically discover and process all directories in `~/code`.

**Features:**
- Recursive traversal with configurable depth limits
- Smart directory filtering (skip hidden, node_modules, etc.)
- Directory structure preservation in output
- Statistical reporting (total dirs, processed, skipped)

**Technical Details:**
```javascript
// Scanner configuration
{
  baseDir: '~/code',
  maxDepth: 10,              // Maximum recursion depth
  excludeDirs: [             // Directories to skip
    'node_modules',
    '.git',
    'dist',
    'build',
    // ... more
  ],
  followSymlinks: false,     // Don't follow symlinks
  includeHidden: false       // Skip hidden directories
}
```

### .gitignore Respect

Automatically excludes files and directories listed in `.gitignore`.

**How It Works:**
1. Checks for `.gitignore` in each directory
2. Parses ignore patterns (supports all .gitignore syntax)
3. Applies patterns to file and directory scanning
4. Respects nested `.gitignore` files

**Supported Patterns:**
- `*.log` - Wildcard patterns
- `!important.log` - Negation patterns
- `/build/` - Directory-specific patterns
- `**/*.tmp` - Recursive patterns
- `# comments` - Comment lines (ignored)

**Additional Ignore Patterns:**
Beyond `.gitignore`, you can specify custom patterns:

```javascript
// In index.js
worker.additionalIgnorePatterns = [
  '**/output/',
  '**/*.tmp',
  '**/cache/'
];
```

### Parallel Job Processing

Process multiple repositories concurrently with configurable limits.

**Configuration:**
```bash
MAX_CONCURRENT=3  # Process 3 repos at a time
```

**Performance Characteristics:**
- **3 concurrent jobs**: ~15-20 repos/minute
- **5 concurrent jobs**: ~25-30 repos/minute
- **10 concurrent jobs**: ~40-50 repos/minute (high CPU)

**Resource Usage:**
- Memory: ~50MB per concurrent job
- CPU: ~20-30% per job
- Disk I/O: Moderate (reading source, writing output)

**Recommendations:**
- Development: 2-3 concurrent jobs
- Production (4-core): 5 concurrent jobs
- Production (8-core): 10 concurrent jobs

### Output Organization

Organized output in `sidequest/output/condense/` matching source structure.

**Example:**
```
Input:
~/code/
├── project-a/
├── project-b/
└── folder/
    └── project-c/

Output:
sidequest/output/condense/
├── project-a/
│   └── repomix-output.txt
├── project-b/
│   └── repomix-output.txt
└── folder/
    └── project-c/
        └── repomix-output.txt
```

**Output File Contents:**
- Full repository file tree
- Concatenated file contents
- Token counts and statistics
- File metadata (size, modified date)

### Job Queue Management

Track job status, history, and statistics.

**Job States:**
- `created` - Job object created
- `queued` - Waiting in queue
- `running` - Currently processing
- `completed` - Finished successfully
- `failed` - Encountered error

**Job History:**
All jobs are logged to:
- `logs/repomix-{path}-{timestamp}.json` (completed)
- `logs/repomix-{path}-{timestamp}.error.json` (failed)
- `logs/run-summary-{timestamp}.json` (summary)

**Statistics:**
```json
{
  "totalJobs": 50,
  "completed": 45,
  "failed": 5,
  "duration": 180000,  // milliseconds
  "averageJobTime": 3600,
  "successRate": "90.00%"
}
```

---

## Documentation Enhancement Pipeline

### Automatic README.md Scanning

Discovers all README files in target directories.

**Discovery Process:**
1. Recursive directory traversal
2. Case-insensitive README detection (`readme.md`, `README.MD`, etc.)
3. Exclusion of node_modules, .git, etc.
4. Statistical reporting

**Supported File Names:**
- `README.md`
- `readme.md`
- `README.MD`
- `Readme.md`
- `README` (no extension)

### Schema.org Structured Data Injection

Adds JSON-LD markup for improved SEO and rich search results.

**What is Schema.org?**
Schema.org is a structured data vocabulary that helps search engines understand your content and display rich results.

**JSON-LD Format:**
```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "My Project",
  "description": "Project description",
  "programmingLanguage": ["JavaScript", "TypeScript"],
  "codeRepository": "https://github.com/user/project",
  "applicationCategory": "DeveloperApplication"
}
</script>
```

**Injection Location:**
The schema is inserted **immediately after the first heading** (h1) in the README, before any other content.

### Smart Schema Type Detection

Automatically selects the most appropriate Schema.org type.

**Detection Algorithm:**

1. **Path Analysis**
   - Check directory and file names for keywords
   - Examples: `api/`, `docs/`, `test/`, `examples/`

2. **Content Analysis**
   - Scan README for keywords and patterns
   - Count occurrences of technical terms

3. **Context Analysis**
   - Detect programming languages (package.json, requirements.txt, etc.)
   - Check for git repository information
   - Analyze project structure

4. **Type Selection**
   - Score each schema type based on evidence
   - Select type with highest score
   - Fallback to `TechArticle` if unclear

**Available Schema Types:**

| Schema Type | Use Case | Detection Keywords |
|-------------|----------|-------------------|
| `SoftwareApplication` | Installable software, apps | install, download, run, CLI, GUI, application |
| `SoftwareSourceCode` | Code libraries, frameworks | import, require, library, package, npm, pip |
| `APIReference` | API documentation | endpoint, route, API, REST, GraphQL, request |
| `HowTo` | Tutorials, guides | tutorial, guide, step-by-step, walkthrough |
| `TechArticle` | Technical documentation | documentation, overview, architecture |

### SEO Impact Measurement

Quantifies the SEO improvements from schema injection.

**Measured Metrics:**

1. **Content Size**
   - Original size (bytes)
   - Enhanced size (bytes)
   - Size increase percentage

2. **Schema Properties**
   - Total properties added
   - Required properties present
   - Recommended properties present
   - Optional properties present

3. **SEO Improvements**
   - Structured name/title
   - Structured description
   - Programming language tags
   - Code repository link
   - License information
   - Author information
   - Version information

4. **Rich Results Eligibility**
   - Software app rich results
   - How-to rich results
   - Technical article rich results
   - API documentation rich results

**Impact Score Calculation:**
```
Impact Score = (
  (schema_properties * 10) +
  (seo_improvements * 15) +
  (rich_results_eligible * 25)
) / max_possible_score * 100
```

**Rating Scale:**
- **80-100**: Excellent - High SEO impact
- **60-79**: Good - Moderate SEO impact
- **40-59**: Fair - Some SEO impact
- **0-39**: Needs Improvement - Low SEO impact

### Rich Search Results Eligibility

Tracks which rich result types are eligible based on schema.

**Rich Result Types:**

1. **Software Application Rich Results**
   - Requirements: `@type: SoftwareApplication`, name, description
   - Displays: App name, rating, price, operating system
   - Benefits: Higher click-through rate, better visibility

2. **How-To Rich Results**
   - Requirements: `@type: HowTo`, name, steps
   - Displays: Step-by-step guide with images
   - Benefits: Featured snippets, high visibility

3. **API Reference Rich Results**
   - Requirements: `@type: APIReference`, name, description, endpoints
   - Displays: API endpoint list, request/response examples
   - Benefits: Developer-focused visibility

4. **Technical Article Rich Results**
   - Requirements: `@type: TechArticle`, headline, author, datePublished
   - Displays: Article title, author, publish date, thumbnail
   - Benefits: Article cards in search results

**Testing Rich Results:**
Use [Google's Rich Results Test](https://search.google.com/test/rich-results) to validate your schema markup.

### Dry Run Mode

Preview changes without modifying files.

**What Dry Run Does:**
1. Scans directories for README files
2. Analyzes content and generates schema
3. Calculates impact measurements
4. Logs all operations
5. **Does NOT modify any files**

**Usage:**
```bash
npm run docs:enhance:dry
```

**Output:**
- Console logs showing what would be changed
- Impact reports saved to `document-enhancement-impact-measurement/`
- No actual file modifications

---

## Git Activity Reporter

### AlephAuto Integration

Fully integrated with the AlephAuto job queue framework.

**Job Lifecycle:**
```
create job → queue → execute Python script → parse output → complete
```

**Event Tracking:**
```javascript
worker.on('job:created', (job) => {
  console.log(`Report job: ${job.data.reportType}`);
});

worker.on('job:completed', (job) => {
  console.log(`Total commits: ${job.result.stats.totalCommits}`);
  console.log(`Repositories: ${job.result.stats.totalRepositories}`);
  console.log(`Files generated: ${job.result.outputFiles.length}`);
});
```

### Automated Report Types

**Weekly Reports** (last 7 days):
```bash
npm run git:weekly
# or
node git-activity-pipeline.js --weekly
```

**Monthly Reports** (last 30 days):
```bash
npm run git:monthly
# or
node git-activity-pipeline.js --monthly
```

**Custom Date Ranges**:
```bash
node git-activity-pipeline.js --since 2025-07-07 --until 2025-11-16
```

### Visualizations (SVG Charts)

Generated visualizations include:

1. **Commit Timeline Chart**
   - Line chart of commits over time
   - Color-coded by project category
   - Shows trends and activity patterns

2. **Language Breakdown Chart**
   - Pie chart of programming languages
   - Based on file extensions in commits
   - Shows dominant languages

3. **Repository Activity Chart**
   - Bar chart of commits per repository
   - Sorted by activity level
   - Shows most active projects

4. **Author Contribution Chart**
   - Bar chart of commits per author
   - Shows team collaboration patterns
   - Useful for team reports

**Output Location:**
`~/code/PersonalSite/assets/images/git-activity-{year}/`

**SVG Format:**
- Scalable vector graphics
- Embeddable in HTML
- Customizable with CSS
- Accessible and responsive

### JSON Data Export

Structured data for further analysis and custom visualizations.

**JSON Structure:**
```json
{
  "metadata": {
    "reportType": "weekly",
    "sinceDate": "2025-11-20",
    "untilDate": "2025-11-27",
    "generatedAt": "2025-11-27T10:00:00Z"
  },
  "summary": {
    "totalCommits": 150,
    "totalRepositories": 25,
    "totalAuthors": 3,
    "dateRange": {
      "start": "2025-11-20",
      "end": "2025-11-27"
    }
  },
  "repositories": [
    {
      "name": "project-a",
      "path": "/Users/user/code/project-a",
      "commits": 45,
      "additions": 1234,
      "deletions": 567,
      "authors": ["John Doe"]
    }
  ],
  "languages": {
    "JavaScript": 1234,
    "TypeScript": 890,
    "Python": 456
  },
  "timeline": [
    {
      "date": "2025-11-20",
      "commits": 12,
      "additions": 234,
      "deletions": 89
    }
  ]
}
```

**Output Location:**
`/tmp/git_activity_{type}_{timestamp}.json`

### Configurable Date Ranges

Full flexibility in date range selection.

**Formats Supported:**
- ISO 8601: `2025-11-27`
- Relative: `--weekly`, `--monthly`
- Custom: `--since DATE --until DATE`

**Examples:**
```bash
# Last week
node git-activity-pipeline.js --weekly

# Last month
node git-activity-pipeline.js --monthly

# Specific date range
node git-activity-pipeline.js --since 2025-07-07 --until 2025-11-16

# Year-to-date
node git-activity-pipeline.js --since 2025-01-01 --until $(date +%Y-%m-%d)

# Previous quarter
node git-activity-pipeline.js --since 2025-07-01 --until 2025-09-30
```

### Cron Scheduling Support

Automated weekly/monthly report generation.

**Default Schedule:**
- Weekly reports: Sunday at 8 PM
- Cron expression: `0 20 * * 0`

**Custom Schedule:**
```bash
# Daily reports at 11 PM
GIT_CRON_SCHEDULE="0 23 * * *" npm run git:schedule

# Bi-weekly reports (every other Sunday)
GIT_CRON_SCHEDULE="0 20 * * 0/2" npm run git:schedule

# Monthly reports (1st of month at midnight)
GIT_CRON_SCHEDULE="0 0 1 * *" npm run git:schedule
```

### Project Categories

Organize repositories into categories for better reporting.

**Configuration:**
Edit `sidequest/collect_git_activity.py`:

```python
PROJECT_CATEGORIES = {
    'work': [
        '/Users/user/code/work-project-a',
        '/Users/user/code/work-project-b',
    ],
    'personal': [
        '/Users/user/code/personal-project',
    ],
    'open-source': [
        '/Users/user/code/oss-contribution',
    ]
}
```

**Benefits:**
- Separate work vs personal contributions
- Track open-source contributions
- Generate category-specific reports
- Better time tracking and analytics

---

## Gitignore Manager

### Batch .gitignore Updates

Update multiple `.gitignore` files across all repositories.

**Process:**
1. Scan for git repositories in target directory
2. Read existing `.gitignore` (if present)
3. Check if entry already exists
4. Add entry with comment if needed
5. Create `.gitignore` if missing
6. Generate detailed report

**Entry Format:**
```gitignore
# Automatically added by repomix automation
repomix-output.xml
```

### Duplicate Detection

Prevents adding duplicate entries to `.gitignore`.

**Detection Logic:**
1. Parse existing `.gitignore` line by line
2. Normalize whitespace
3. Ignore comments (lines starting with `#`)
4. Check for exact match
5. Check for pattern match (wildcards)
6. Skip if match found

**Examples:**
```gitignore
# These are considered duplicates:
repomix-output.xml
/repomix-output.xml
**/repomix-output.xml

# These are NOT duplicates:
repomix-output.xml
repomix-output.txt
```

### .gitignore Creation

Creates `.gitignore` if it doesn't exist.

**Initial Content:**
```gitignore
# .gitignore created by AlephAuto Gitignore Manager

# Repomix automation
repomix-output.xml
```

**Safety Features:**
- Only creates in git repositories (`.git` directory present)
- Sets appropriate file permissions (644)
- Adds descriptive header comment
- Logs creation in report

### Detailed JSON Reporting

Comprehensive report of all operations.

**Report Structure:**
```json
{
  "timestamp": "2025-11-27T10:00:00Z",
  "targetDirectory": "/Users/user/code",
  "dryRun": false,
  "summary": {
    "totalRepositories": 15,
    "added": 10,
    "skipped": 4,
    "created": 1,
    "errors": 0
  },
  "repositories": [
    {
      "path": "/Users/user/code/project-a",
      "action": "added",
      "gitignoreExists": true,
      "entryExists": false,
      "message": "Entry added successfully"
    },
    {
      "path": "/Users/user/code/project-b",
      "action": "skipped",
      "gitignoreExists": true,
      "entryExists": true,
      "message": "Entry already exists"
    }
  ],
  "errors": []
}
```

**Report Location:**
`sidequest/gitignore-update-report-{timestamp}.json`

---

## Codebase Health Scanners

### Timeout Pattern Detection

Find infinite loading bugs and missing error handling.

**Detected Patterns:**

1. **Promise.race() without timeout wrapper**
   ```javascript
   // BAD - No timeout
   const result = await Promise.race([fetchData(), otherPromise]);

   // GOOD - With timeout wrapper
   const result = await Promise.race([
     fetchData(),
     timeout(5000, 'Data fetch timeout')
   ]);
   ```

2. **setLoading(true) without finally block**
   ```javascript
   // BAD - Loading state might stick if error occurs
   setLoading(true);
   const data = await fetchData();
   setLoading(false);

   // GOOD - finally ensures loading state is reset
   setLoading(true);
   try {
     const data = await fetchData();
   } finally {
     setLoading(false);
   }
   ```

3. **Async functions without error handling**
   ```javascript
   // BAD - Unhandled promise rejection
   async function fetchUser(id) {
     const response = await fetch(`/api/users/${id}`);
     return response.json();
   }

   // GOOD - Proper error handling
   async function fetchUser(id) {
     try {
       const response = await fetch(`/api/users/${id}`);
       if (!response.ok) throw new Error('Fetch failed');
       return response.json();
     } catch (error) {
       console.error('Error fetching user:', error);
       throw error;
     }
   }
   ```

**Severity Levels:**
- **HIGH**: Missing timeout on Promise.race()
- **HIGH**: setLoading without finally
- **MEDIUM**: Async function without try-catch
- **LOW**: Missing error logging

### Root Directory Analysis

Identify clutter and generate migration plans.

**Analysis Process:**
1. Scan root directory for files
2. Categorize by type (Python, JS, configs, data, etc.)
3. Identify files that should be moved
4. Generate migration plan with exact commands
5. Update import statements in affected files

**File Categories:**

| Category | Extensions | Suggested Location |
|----------|-----------|-------------------|
| Python modules | `.py` | `src/`, `lib/` |
| JavaScript/TS | `.js`, `.ts` | `src/`, `lib/` |
| Configs | `.json`, `.yaml`, `.yml` | `config/` |
| Documentation | `.md`, `.txt` | `docs/` |
| Data files | `.csv`, `.json` | `data/` |
| Tests | `*.test.js`, `*.spec.py` | `tests/` |

**Migration Plan Example:**
```markdown
## Root Directory Analysis

### Files to Move

#### Python Modules (3 files)
- `utils.py` → `src/utils.py`
- `helpers.py` → `src/helpers.py`
- `config.py` → `config/config.py`

#### JavaScript Files (2 files)
- `index.js` → `src/index.js`
- `server.js` → `src/server.js`

### Migration Commands

```bash
# Create directories
mkdir -p src config

# Move Python files
mv utils.py src/
mv helpers.py src/
mv config.py config/

# Move JavaScript files
mv index.js src/
mv server.js src/
```

### Import Updates Required

#### In `main.py`:
```python
# Before
from utils import helper_function

# After
from src.utils import helper_function
```

### Zero-Breakage Guarantee

All import statements have been analyzed. The above updates ensure zero breakage after migration.
```

### AST-Grep Integration

Uses structural code analysis for accurate pattern detection.

**What is AST-Grep?**
AST-Grep is a structural search tool that uses Abstract Syntax Tree (AST) patterns to find code. Unlike regex, it understands code structure.

**Advantages:**
- **Accurate**: No false positives from comments or strings
- **Context-aware**: Understands scope and syntax
- **Language-specific**: Respects language semantics
- **Fast**: Optimized for large codebases

**Pattern Rules:**
Rules are defined in `.ast-grep/rules/*.yml`:

```yaml
id: promise-race-without-timeout
language: javascript
rule:
  pattern: await Promise.race($ARGS)
  not:
    any:
      - pattern: await Promise.race([$_, timeout($TIME)])
      - pattern: await withTimeout(Promise.race($ARGS))
severity: error
message: Promise.race() without timeout - can cause infinite loading
```

**18 Built-in Rules:**
1. Database operations (unhandled errors)
2. Express route handlers (missing error middleware)
3. Async patterns (timeout, finally blocks)
4. File operations (missing error handling)
5. Network requests (timeout, retries)
6. ... and 13 more

### Python Alternative Scanner

Regex-based scanner for environments without ast-grep.

**When to Use:**
- ast-grep not installed
- Quick one-off scans
- Environments without Node.js
- CI/CD with limited dependencies

**Limitations:**
- Less accurate than AST-Grep (may have false positives)
- Cannot understand code context
- Matches patterns in comments and strings
- No syntax validation

**Usage:**
```bash
python3 lib/scanners/timeout_detector.py ~/code/myproject
```

**Output:**
```
Scanning: /Users/user/code/myproject

Found 3 potential issues:

1. src/api.js:45
   Promise.race() without timeout wrapper
   Severity: HIGH

2. src/components/UserList.jsx:23
   setLoading(true) without finally block
   Severity: HIGH

3. src/utils/fetch.js:12
   Async function without error handling
   Severity: MEDIUM

Total issues: 3 (2 HIGH, 1 MEDIUM)
```

### CLI and Programmatic Usage

**CLI Usage:**
```bash
# Timeout scan
./lib/scanners/codebase-health-scanner.js ~/code/myproject --scan timeout

# Root directory analysis
./lib/scanners/codebase-health-scanner.js ~/code/myproject --scan root

# All scans with output file
./lib/scanners/codebase-health-scanner.js ~/code/myproject --scan all --output report.md

# JSON output
./lib/scanners/codebase-health-scanner.js ~/code/myproject --scan all --json
```

**Programmatic Usage:**
```javascript
import { CodebaseHealthScanner } from './lib/scanners/codebase-health-scanner.js';

const scanner = new CodebaseHealthScanner({
  projectPath: '~/code/myproject',
  scans: ['timeout', 'root'],
  outputFormat: 'json'
});

const results = await scanner.run();

console.log(`Found ${results.timeout.issues.length} timeout issues`);
console.log(`Found ${results.root.clutteredFiles.length} files to move`);
```

---

## Job Management & Architecture

### AlephAuto Framework

All pipelines are built on the **AlephAuto** job queue framework.

**Core Components:**

1. **SidequestServer** (Base Class)
   - Job queue management
   - Concurrency control
   - Event emission
   - Sentry integration
   - Located: `sidequest/server.js`

2. **Workers** (Extend SidequestServer)
   - RepomixWorker
   - SchemaEnhancementWorker
   - GitActivityWorker
   - Each worker implements job-specific logic

3. **Configuration** (`sidequest/config.js`)
   - Centralized environment variable management
   - Default values and validation
   - Used by all pipelines

4. **Logger** (`sidequest/logger.js`)
   - Structured JSON logging with Pino
   - Automatic Sentry error capture
   - Component-specific loggers

### Architecture Pattern

```
┌─────────────────────────────────────┐
│     SidequestServer (Base)          │
│                                     │
│  Methods:                           │
│  - createJob(data)                  │
│  - queueJob(job)                    │
│  - processQueue()                   │
│  - executeJob(job)                  │
│  - waitForCompletion()              │
│                                     │
│  Events:                            │
│  - job:created                      │
│  - job:queued                       │
│  - job:started                      │
│  - job:completed                    │
│  - job:failed                       │
└─────────────────────────────────────┘
              ▲
              │ extends
    ┌─────────┴──────────┬──────────────┬──────────────┐
    │                    │              │              │
┌───────────────┐  ┌─────────────────────┐  ┌────────────────┐
│ RepomixWorker │  │ SchemaEnhancement   │  │ GitActivity    │
│               │  │ Worker              │  │ Worker         │
│  executeJob() │  │  executeJob()       │  │  executeJob()  │
└───────────────┘  └─────────────────────┘  └────────────────┘
```

### Component Roles

**SidequestServer** - Base job execution engine
- Job lifecycle management
- Queue processing with concurrency limits
- Event emission for monitoring
- Error handling and retry logic
- Performance tracking

**RepomixWorker** - Repomix job executor
- Executes repomix CLI securely
- Manages output directory structure
- 10-minute timeout, 50MB buffer
- Command injection protection

**SchemaEnhancementWorker** - Documentation enhancement
- README file discovery
- Schema.org markup generation
- Impact measurement
- File modification with backups

**GitActivityWorker** - Git activity reports
- Executes Python git analysis script
- Parses JSON output
- Tracks SVG visualization files
- 5-minute timeout

**DirectoryScanner** - Directory traversal
- Recursive scanning with depth limits
- Configurable exclusion patterns
- Statistical reporting
- Symlink handling

### Configuration System

Centralized configuration via `sidequest/config.js`.

**Usage:**
```javascript
import { config } from './sidequest/config.js';

// ✅ Correct - Use centralized config
const maxConcurrent = config.maxConcurrent;
const sentryDsn = config.sentryDsn;

// ❌ Incorrect - Don't use process.env directly
const dsn = process.env.SENTRY_DSN;  // WRONG
```

**Available Config:**
```javascript
{
  // Paths
  codeBaseDir: '~/code',
  outputBaseDir: './sidequest/output',
  logDir: './logs',

  // Concurrency
  maxConcurrent: 3,

  // Timeouts
  jobTimeout: 600000,        // 10 minutes
  workerTimeout: 300000,     // 5 minutes

  // Sentry
  sentryDsn: 'https://...',
  sentryEnvironment: 'production',

  // Cron schedules
  cronSchedule: '0 2 * * *',
  docCronSchedule: '0 3 * * *',
  gitCronSchedule: '0 20 * * 0',

  // Feature flags
  runOnStartup: false,
  forceEnhancement: false,

  // Logging
  logLevel: 'info',
  logPretty: false
}
```

### Job Events

Standard lifecycle events for all workers.

**Event Flow:**
```
job:created
    ↓
job:queued
    ↓
job:started
    ↓
    ├─→ job:progress (optional, periodic updates)
    ↓
job:completed (success)
    or
job:failed (error)
```

**Event Data:**

```javascript
// job:created, job:queued
{
  id: 'job-abc123',
  type: 'repomix',
  status: 'created',
  data: { path: '/Users/user/code/project' }
}

// job:started
{
  id: 'job-abc123',
  status: 'running',
  startedAt: Date
}

// job:completed
{
  id: 'job-abc123',
  status: 'completed',
  completedAt: Date,
  result: {
    outputFile: 'path/to/output.txt',
    stats: { ... }
  }
}

// job:failed
{
  id: 'job-abc123',
  status: 'failed',
  completedAt: Date,
  error: {
    message: 'Error message',
    stack: 'Stack trace',
    code: 'ERROR_CODE'
  }
}
```

**Usage Example:**
```javascript
worker.on('job:created', (job) => {
  console.log(`Created: ${job.id}`);
});

worker.on('job:started', (job) => {
  console.log(`Started: ${job.id}`);
});

worker.on('job:progress', (job) => {
  console.log(`Progress: ${job.id} - ${job.progress}%`);
});

worker.on('job:completed', (job) => {
  console.log(`Completed: ${job.id}`);
  console.log(`Result:`, job.result);
});

worker.on('job:failed', (job) => {
  console.error(`Failed: ${job.id}`);
  console.error(`Error:`, job.error);

  // Send notification
  // Retry job
  // Log to external service
});
```

---

## Advanced Usage Examples

### Custom Pipeline Integration

Create your own pipeline using AlephAuto:

```javascript
import { SidequestServer } from './sidequest/server.js';
import { config } from './sidequest/config.js';

class CustomWorker extends SidequestServer {
  constructor(options = {}) {
    super(options);
  }

  async executeJob(job) {
    // Your custom job logic here
    const { inputPath, outputPath } = job.data;

    try {
      // Process input
      const result = await processInput(inputPath);

      // Write output
      await writeOutput(outputPath, result);

      return {
        success: true,
        outputPath,
        stats: {
          processedFiles: result.files.length,
          duration: result.duration
        }
      };
    } catch (error) {
      throw new Error(`Job failed: ${error.message}`);
    }
  }
}

// Usage
const worker = new CustomWorker({
  maxConcurrent: 5,
  logLevel: 'debug'
});

worker.on('job:completed', (job) => {
  console.log('Job done!', job.result);
});

// Create jobs
worker.createJob({
  inputPath: '/path/to/input',
  outputPath: '/path/to/output'
});

await worker.waitForCompletion();
```

### Multi-Pipeline Orchestration

Run multiple pipelines in sequence or parallel:

```javascript
import { RepomixWorker } from './sidequest/repomix-worker.js';
import { SchemaEnhancementWorker } from './sidequest/doc-enhancement/schema-enhancement-worker.js';
import { GitActivityWorker } from './sidequest/git-activity-worker.js';

// Parallel execution
async function runAllPipelines() {
  const repomix = new RepomixWorker();
  const docs = new SchemaEnhancementWorker();
  const git = new GitActivityWorker();

  // Start all pipelines
  await Promise.all([
    repomix.runScan(),
    docs.enhanceAllREADMEs(),
    git.createWeeklyReportJob()
  ]);
}

// Sequential execution
async function runSequentialPipelines() {
  // 1. Generate repomix outputs
  const repomix = new RepomixWorker();
  await repomix.runScan();

  // 2. Enhance documentation
  const docs = new SchemaEnhancementWorker();
  await docs.enhanceAllREADMEs();

  // 3. Generate git report
  const git = new GitActivityWorker();
  await git.createWeeklyReportJob();
}
```

### Custom Event Handling

Implement custom event handlers:

```javascript
import { RepomixWorker } from './sidequest/repomix-worker.js';
import { sendSlackNotification } from './notifications.js';

const worker = new RepomixWorker();

// Success notification
worker.on('job:completed', async (job) => {
  await sendSlackNotification({
    channel: '#notifications',
    message: `✅ Repomix job completed for ${job.data.path}`,
    details: job.result
  });
});

// Failure notification with retries
worker.on('job:failed', async (job) => {
  await sendSlackNotification({
    channel: '#alerts',
    message: `❌ Repomix job failed for ${job.data.path}`,
    error: job.error
  });

  // Retry logic
  if (job.retries < 3) {
    console.log(`Retrying job ${job.id} (attempt ${job.retries + 1})`);
    worker.createJob({
      ...job.data,
      retries: (job.retries || 0) + 1
    });
  }
});

// Progress tracking
worker.on('job:progress', (job) => {
  updateDashboard({
    jobId: job.id,
    progress: job.progress,
    status: 'processing'
  });
});
```

---

## Performance Optimization

### Concurrency Tuning

Optimize concurrent job processing:

```javascript
// Low-resource environment (2-core, 4GB RAM)
const worker = new RepomixWorker({
  maxConcurrent: 2,
  workerTimeout: 300000  // 5 minutes
});

// High-performance environment (8-core, 16GB RAM)
const worker = new RepomixWorker({
  maxConcurrent: 10,
  workerTimeout: 600000  // 10 minutes
});

// Adaptive concurrency based on system load
const os = require('os');
const cpuCount = os.cpus().length;
const freeMemory = os.freemem();

const worker = new RepomixWorker({
  maxConcurrent: Math.min(
    Math.floor(cpuCount * 0.75),  // 75% of CPU cores
    Math.floor(freeMemory / (100 * 1024 * 1024))  // 100MB per job
  )
});
```

### Memory Management

Prevent memory leaks and optimize usage:

```javascript
// Enable garbage collection
if (global.gc) {
  worker.on('job:completed', () => {
    global.gc();  // Force GC after each job
  });
}

// Monitor memory usage
worker.on('job:started', (job) => {
  const memBefore = process.memoryUsage();
  job._memBefore = memBefore;
});

worker.on('job:completed', (job) => {
  const memAfter = process.memoryUsage();
  const memDiff = memAfter.heapUsed - job._memBefore.heapUsed;

  console.log(`Job ${job.id} memory usage: ${memDiff / 1024 / 1024} MB`);

  if (memDiff > 100 * 1024 * 1024) {  // >100MB
    console.warn(`High memory usage detected for ${job.id}`);
  }
});

// Clear job history periodically
setInterval(() => {
  worker.clearCompletedJobs();
}, 3600000);  // Every hour
```

### Caching Strategies

Implement result caching:

```javascript
import { ScanResultCache } from './lib/caching/cached-scanner.js';

const cache = new ScanResultCache({
  ttl: 2592000,  // 30 days
  keyPrefix: 'scan:'
});

// Check cache before scanning
async function scanWithCache(repoPath) {
  const commitHash = await getCommitHash(repoPath);
  const cacheKey = `${repoPath}:${commitHash}`;

  // Try cache first
  const cached = await cache.get(cacheKey);
  if (cached) {
    console.log('Cache hit!');
    return cached;
  }

  // Cache miss - perform scan
  console.log('Cache miss - scanning...');
  const result = await performScan(repoPath);

  // Store in cache
  await cache.set(cacheKey, result);

  return result;
}
```

---

## Security Considerations

### Command Injection Prevention

All CLI executions use secure spawning:

```javascript
// ❌ UNSAFE - Command injection vulnerability
const output = await exec(`repomix ${userInput}`);

// ✅ SAFE - Spawn with arguments array
const output = await spawn('repomix', [userInput], {
  cwd: '/safe/directory',
  env: { PATH: '/usr/bin' }
});
```

### Path Traversal Protection

Validate and sanitize paths:

```javascript
import path from 'path';

function sanitizePath(inputPath, basePath) {
  const resolved = path.resolve(basePath, inputPath);

  // Ensure path is within basePath
  if (!resolved.startsWith(path.resolve(basePath))) {
    throw new Error('Path traversal detected');
  }

  return resolved;
}

// Usage
const safePath = sanitizePath(userInput, config.codeBaseDir);
```

### Environment Variable Security

Never commit secrets:

```bash
# ❌ WRONG - Secrets in .env
SENTRY_DSN=https://secret-key@sentry.io/123456
DATABASE_URL=postgres://user:password@host/db

# ✅ CORRECT - Use Doppler or environment
# .env only contains references
SENTRY_DSN=${SENTRY_DSN}
DATABASE_URL=${DATABASE_URL}
```

**Best Practices:**
1. Use Doppler for secret management
2. Never commit `.env` files
3. Use `.env.example` for documentation
4. Validate environment variables on startup
5. Fail fast if required secrets are missing

---

## Troubleshooting Guide

### Common Issues and Solutions

See main README for common troubleshooting. This section covers advanced scenarios.

**Issue: Jobs stuck in queue**
```javascript
// Diagnosis
console.log('Active jobs:', worker.activeJobs.length);
console.log('Queued jobs:', worker.queuedJobs.length);
console.log('Max concurrent:', worker.maxConcurrent);

// Solution: Increase concurrency or check for deadlocks
worker.maxConcurrent = 5;

// Or manually process queue
worker.processQueue();
```

**Issue: High memory usage**
```javascript
// Monitor memory
setInterval(() => {
  const mem = process.memoryUsage();
  console.log('Heap used:', mem.heapUsed / 1024 / 1024, 'MB');
  console.log('Active jobs:', worker.activeJobs.length);
}, 5000);

// Solution: Reduce concurrency, enable GC, clear history
worker.maxConcurrent = 2;
if (global.gc) global.gc();
worker.clearCompletedJobs();
```

**Issue: Sentry not capturing errors**
```javascript
// Test Sentry connection
import * as Sentry from '@sentry/node';

Sentry.captureException(new Error('Test error'));
await Sentry.flush(2000);

// Check DSN
console.log('Sentry DSN:', config.sentryDsn);

// Verify environment
console.log('Sentry environment:', config.sentryEnvironment);
```

---

## Additional Resources

- [AlephAuto Framework Documentation](../sidequest/README.md)
- [API Reference](../docs/API_REFERENCE.md)
- [Architecture Documentation](../docs/architecture/)
- [Testing Guide](TESTING.md)
- [Changelog](CHANGELOG.md)

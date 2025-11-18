# Duplicate Detection Pipeline Refactoring Plan
**Date**: 2025-11-18
**Component**: Duplicate Detection Pipeline
**Pattern**: AlephAuto Framework (SidequestServer Extension)

## Executive Summary

This refactoring will migrate the Duplicate Detection Pipeline from its current hybrid implementation (where it already extends SidequestServer but is embedded in the pipeline file) to follow the standard AlephAuto pattern where the worker class is separated into its own file in the `sidequest/` directory.

## Current State Analysis

### Architecture Overview
The current implementation (`pipelines/duplicate-detection-pipeline.js`) contains:
- **DuplicateDetectionWorker class** (lines 46-678) - Already extends SidequestServer
- **Main execution logic** (lines 683-771) - Handles cron scheduling and startup
- **Export statement** (line 773) - Exports the worker class

### Key Components
1. **Worker Class** (already exists):
   - Extends SidequestServer properly
   - Implements `runJobHandler(job)` method
   - Contains all duplicate detection logic
   - Handles retry logic with circuit breaker
   - Manages PR creation when enabled

2. **Dependencies**:
   - `lib/scan-orchestrator.js` - Core scanning logic
   - `lib/inter-project-scanner.js` - Cross-repository scanning
   - `lib/reports/report-coordinator.js` - Report generation
   - `lib/git/pr-creator.js` - Auto-PR creation
   - `lib/config/repository-config-loader.js` - Configuration management
   - `lib/errors/error-classifier.js` - Error classification for retries

3. **PM2 Configuration**:
   - Currently points to `pipelines/duplicate-detection-pipeline.js`
   - Runs as single fork mode instance
   - Uses cron schedule: "0 2 * * *" (2 AM daily)

## Identified Issues

### Critical
- **Architecture Inconsistency**: Worker class is embedded in pipeline file instead of separate module

### Major
- **Code Organization**: 773 lines in single file, mixing worker and pipeline concerns
- **Pattern Deviation**: Not following established pattern used by other workers

### Minor
- **Import Path**: Will need to update import path after refactoring
- **Testing Difficulty**: Harder to unit test worker in isolation

## Proposed Refactoring Plan

### Phase 1: Extract Worker Class

#### Step 1.1: Create New Worker File
**File**: `sidequest/duplicate-detection-worker.js`

**Content Structure**:
```javascript
// Move lines 1-35 (imports)
// Move lines 39 (MAX_ABSOLUTE_RETRIES constant)
// Move lines 46-678 (DuplicateDetectionWorker class)
// Add export statement
```

**Key Changes**:
- Remove main execution logic
- Keep only worker class and its dependencies
- Export the class as default or named export

#### Step 1.2: Update Import Paths
- Ensure all imports are relative to new location
- Update logger component name

### Phase 2: Refactor Pipeline File

#### Step 2.1: Simplify Pipeline File
**File**: `pipelines/duplicate-detection-pipeline.js`

**New Structure**:
```javascript
#!/usr/bin/env node

import { DuplicateDetectionWorker } from '../sidequest/duplicate-detection-worker.js';
import { createComponentLogger } from '../sidequest/logger.js';
import * as Sentry from '@sentry/node';
import cron from 'node-cron';
import { config } from '../sidequest/config.js';

const logger = createComponentLogger('DuplicateDetectionPipeline');

async function main() {
  // Configuration
  // Worker initialization
  // Event listeners
  // Cron scheduling
  // RUN_ON_STARTUP handling
}

// Check for direct execution
if (isDirectExecution) {
  await main();
}
```

#### Step 2.2: Add Event Listeners
Follow pattern from `gitignore-pipeline.js`:
- job:created
- job:started
- job:completed
- job:failed
- pipeline:status (custom events)

### Phase 3: Integration Updates

#### Step 3.1: Verify Existing Functionality
Ensure all features are preserved:
- [x] 7-stage scanning process
- [x] Auto-PR creation with ENABLE_PR_CREATION
- [x] Retry logic with circuit breaker
- [x] Inter-project and intra-project scanning
- [x] Repository configuration updates
- [x] High-impact duplicate notifications
- [x] Sentry integration
- [x] Redis caching
- [x] Metrics tracking

#### Step 3.2: PM2 Configuration
- No changes needed (still points to pipeline file)
- Worker instantiation happens inside pipeline

#### Step 3.3: Test Integration Points
- Verify cron scheduling works
- Test RUN_ON_STARTUP mode
- Confirm event emission
- Check Sentry error tracking

## Risk Assessment & Mitigation

### Risks
1. **Import Path Issues**: Could break if paths not updated correctly
   - **Mitigation**: Test all imports after moving

2. **Event Emission**: May lose events if not properly connected
   - **Mitigation**: Add comprehensive event listeners in pipeline

3. **Configuration Loading**: Timing issues with async initialization
   - **Mitigation**: Ensure proper await on initialization

4. **PM2 Ready Signal**: Must maintain process.send('ready')
   - **Mitigation**: Keep in pipeline file's main function

## Testing Strategy

### Unit Tests
1. Test worker class in isolation
2. Mock dependencies (scan-orchestrator, pr-creator, etc.)
3. Verify retry logic behavior
4. Test metric collection

### Integration Tests
1. Test full pipeline flow
2. Verify event emission
3. Test with RUN_ON_STARTUP=true
4. Test cron scheduling

### Manual Testing
1. Run with `doppler run -- node pipelines/duplicate-detection-pipeline.js`
2. Test with `RUN_ON_STARTUP=true`
3. Monitor PM2 logs
4. Check Sentry events

## Success Metrics

1. **Code Organization**: Worker separated into dedicated module
2. **Pattern Consistency**: Follows AlephAuto framework pattern
3. **Functionality**: All existing features preserved
4. **Performance**: No degradation in execution time
5. **Maintainability**: Easier to test and modify

## Implementation Steps

### Execution Order
1. Create worker file with extracted class
2. Update pipeline file to import and use worker
3. Test with RUN_ON_STARTUP mode
4. Test cron scheduling
5. Verify PM2 integration
6. Update documentation

### Rollback Plan
If issues arise:
1. Git revert the changes
2. Restart PM2 processes
3. Verify original functionality restored

## File Changes Summary

### New Files
- `/Users/alyshialedlie/code/jobs/sidequest/duplicate-detection-worker.js` (~640 lines)

### Modified Files
- `/Users/alyshialedlie/code/jobs/pipelines/duplicate-detection-pipeline.js` (~200 lines, reduced from 773)

### Unchanged Files
- `/Users/alyshialedlie/code/jobs/ecosystem.config.cjs` (no changes needed)
- All dependency files in `lib/` directory

## Pattern Comparison

### Current Pattern (Embedded)
```
pipelines/duplicate-detection-pipeline.js
  ├── DuplicateDetectionWorker class (extends SidequestServer)
  ├── main() function
  └── Direct execution check
```

### Target Pattern (Separated)
```
sidequest/duplicate-detection-worker.js
  └── DuplicateDetectionWorker class (extends SidequestServer)

pipelines/duplicate-detection-pipeline.js
  ├── Import DuplicateDetectionWorker
  ├── main() function
  └── Direct execution check
```

## Notes

- The worker class is already well-structured and extends SidequestServer properly
- The main refactoring is organizational - separating concerns
- No functional changes needed to the worker logic itself
- Pattern will match gitignore-worker.js implementation
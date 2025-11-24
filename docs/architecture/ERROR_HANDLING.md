# Error Handling Documentation

Comprehensive guide to error handling, retry logic, and error classification in the AlephAuto job queue system.

## Table of Contents

- [Overview](#overview)
- [Error Classification System](#error-classification-system)
- [Retry Logic](#retry-logic)
- [Circuit Breaker Pattern](#circuit-breaker-pattern)
- [Sentry Integration](#sentry-integration)
- [Error Handling Patterns](#error-handling-patterns)
- [Best Practices](#best-practices)
- [Monitoring and Alerts](#monitoring-and-alerts)

## Overview

The AlephAuto system implements a sophisticated error handling strategy with three main components:

1. **Error Classification** - Categorizes errors as retryable or non-retryable
2. **Retry Logic** - Implements exponential backoff with circuit breaker
3. **Sentry Integration** - Multi-level alerting and error tracking

### Key Features

- Automatic error classification based on error codes, HTTP status, and messages
- Intelligent retry with exponential backoff
- Circuit breaker to prevent infinite retry loops
- Error-specific retry delays (60s for rate limits, 10s for timeouts, etc.)
- Comprehensive Sentry alerting at 3 severity levels
- Real-time retry metrics dashboard

## Error Classification System

### Location

`lib/errors/error-classifier.js`

### Error Categories

```javascript
const ErrorCategory = {
  RETRYABLE: 'retryable',       // Transient failures (ETIMEDOUT, 5xx)
  NON_RETRYABLE: 'non-retryable' // Permanent failures (ENOENT, 4xx)
};
```

### Classification Methods

The classifier uses three detection methods in order:

1. **Error Codes** - Node.js/system error codes
2. **HTTP Status Codes** - REST API responses
3. **Error Message Patterns** - String matching for common errors

### Non-Retryable Error Codes

These errors indicate permanent failures and should NOT be retried:

```javascript
const NON_RETRYABLE_ERROR_CODES = [
  'ENOENT',              // File/directory not found
  'ENOTDIR',             // Not a directory
  'EISDIR',              // Is a directory
  'EACCES',              // Permission denied
  'EPERM',               // Operation not permitted
  'EINVAL',              // Invalid argument
  'EEXIST',              // File exists
  'ENOTFOUND',           // DNS resolution failed
  'ECONNREFUSED',        // Connection refused
  'ERR_MODULE_NOT_FOUND' // Module not found
];
```

**Why these are non-retryable:**
- ENOENT: File doesn't exist - retrying won't make it appear
- EACCES: Permission denied - requires manual intervention
- EINVAL: Bad input - same input will fail again
- ENOTFOUND: DNS failure - immediate retry unlikely to help

### Retryable Error Codes

These errors indicate transient failures and SHOULD be retried:

```javascript
const RETRYABLE_ERROR_CODES = [
  'ETIMEDOUT',    // Connection timeout
  'ECONNRESET',   // Connection reset by peer
  'EHOSTUNREACH', // Host unreachable
  'ENETUNREACH',  // Network unreachable
  'EPIPE',        // Broken pipe
  'EAGAIN',       // Resource temporarily unavailable
  'EBUSY'         // Resource busy
];
```

**Why these are retryable:**
- ETIMEDOUT: Network congestion - may work on retry
- ECONNRESET: Temporary connection issue
- EHOSTUNREACH: Routing issue - may resolve
- EBUSY: Resource locked - may become available

### HTTP Status Code Classification

```javascript
// 4xx Client Errors (NON-RETRYABLE, except 429)
400 Bad Request        → Non-retryable (bad input)
401 Unauthorized       → Non-retryable (needs auth)
403 Forbidden          → Non-retryable (no access)
404 Not Found          → Non-retryable (doesn't exist)
429 Too Many Requests  → RETRYABLE (rate limit, retry after 60s)

// 5xx Server Errors (RETRYABLE)
500 Internal Error     → Retryable (server issue, retry after 10s)
502 Bad Gateway        → Retryable (proxy issue, retry after 10s)
503 Service Unavailable → Retryable (temporary, retry after 10s)
504 Gateway Timeout    → Retryable (timeout, retry after 10s)
```

### Error-Specific Retry Delays

Different error types have different suggested delays:

```javascript
{
  'ETIMEDOUT': 5000,      // Network timeout - retry after 5s
  'ECONNRESET': 3000,     // Connection reset - retry after 3s
  'EBUSY': 2000,          // Resource busy - retry after 2s
  429: 60000,             // Rate limit - wait 60s
  5xx: 10000,             // Server error - wait 10s
  default: 5000           // Unknown - wait 5s
}
```

### Usage

```javascript
import { isRetryable, getErrorInfo, classifyError } from '../lib/errors/error-classifier.js';

// Check if error is retryable
if (!isRetryable(error)) {
  logger.warn('Error is non-retryable, skipping retry');
  return false;
}

// Get detailed error information
const errorInfo = getErrorInfo(error);
console.log(errorInfo);
// {
//   name: 'Error',
//   message: 'ETIMEDOUT',
//   code: 'ETIMEDOUT',
//   statusCode: undefined,
//   category: 'retryable',
//   reason: "Error code 'ETIMEDOUT' indicates transient failure",
//   suggestedDelay: 5000,
//   retryable: true
// }

// Use suggested delay
const delay = errorInfo.suggestedDelay || 5000;
setTimeout(() => retry(), delay);
```

## Retry Logic

### Overview

Located in `pipelines/duplicate-detection-pipeline.js` (lines 150-235), the retry logic implements exponential backoff with circuit breaker protection.

### Key Concepts

1. **Original Job ID Extraction** - Strips retry suffixes to track attempts correctly
2. **Retry Queue** - Tracks retry state by original job ID
3. **Exponential Backoff** - Increases delay with each retry
4. **Circuit Breaker** - Absolute maximum to prevent infinite loops

### Configuration

```javascript
// Maximum configured retries (from job options)
const maxRetries = job.options.maxRetries || 2;

// Circuit breaker: Absolute maximum (overrides configured max)
const MAX_ABSOLUTE_RETRIES = 5;

// Base delay for exponential backoff
const baseDelay = job.options.retryDelay || 5000; // 5 seconds
```

### Original Job ID Extraction

**Problem:** Nested retry suffixes created infinite loops
- `scan-123` → `scan-123-retry1` → `scan-123-retry1-retry1` → ...

**Solution:** Strip all retry suffixes to get original ID

```javascript
_getOriginalJobId(jobId) {
  // Remove all -retryN suffixes
  return jobId.replace(/-retry\d+/g, '');
}

// Examples:
// 'scan-123-retry1' → 'scan-123'
// 'scan-123-retry1-retry1' → 'scan-123'
// 'scan-456' → 'scan-456'
```

### Retry State Tracking

Retry state is tracked per **original job ID** (not retry job ID):

```javascript
this.retryQueue = new Map(); // Map<originalJobId, RetryInfo>

// RetryInfo structure:
{
  attempts: 0,           // Current retry attempt count
  lastAttempt: Date.now(), // Timestamp of last retry
  maxAttempts: 2,        // Maximum configured retries
  delay: 5000            // Base delay for exponential backoff
}
```

### Retry Flow

```javascript
async _handleRetry(job, error) {
  const originalJobId = this._getOriginalJobId(job.id);

  // 1. Classify error
  const errorInfo = getErrorInfo(error);
  if (!errorInfo.retryable) {
    logger.warn('Error is non-retryable - skipping retry');
    return false;
  }

  // 2. Get or create retry info
  if (!this.retryQueue.has(originalJobId)) {
    this.retryQueue.set(originalJobId, {
      attempts: 0,
      lastAttempt: Date.now(),
      maxAttempts: job.options.maxRetries || 2,
      delay: job.options.retryDelay || 5000
    });
  }

  const retryInfo = this.retryQueue.get(originalJobId);
  retryInfo.attempts++;

  // 3. Circuit breaker check
  if (retryInfo.attempts >= MAX_ABSOLUTE_RETRIES) {
    Sentry.captureMessage('Circuit breaker triggered', { level: 'error' });
    this.retryQueue.delete(originalJobId);
    return false;
  }

  // 4. Max attempts check
  if (retryInfo.attempts > retryInfo.maxAttempts) {
    Sentry.captureMessage('Maximum retries reached', { level: 'warning' });
    this.retryQueue.delete(originalJobId);
    return false;
  }

  // 5. Calculate delay with exponential backoff
  const baseRetryDelay = errorInfo.suggestedDelay || retryInfo.delay;
  const delay = baseRetryDelay * Math.pow(2, retryInfo.attempts - 1);

  // 6. Schedule retry with consistent job ID
  setTimeout(() => {
    const retryJobId = `${originalJobId}-retry${retryInfo.attempts}`;
    this.createJob(retryJobId, job.data, job.options);
  }, delay);

  return true;
}
```

### Exponential Backoff

Delay increases exponentially with each retry:

```
Attempt 1: baseDelay * 2^0 = 5s  * 1 = 5s
Attempt 2: baseDelay * 2^1 = 5s  * 2 = 10s
Attempt 3: baseDelay * 2^2 = 5s  * 4 = 20s
Attempt 4: baseDelay * 2^3 = 5s  * 8 = 40s
Attempt 5: baseDelay * 2^4 = 5s * 16 = 80s (circuit breaker triggers)
```

**Rate limit example** (60s base delay):
```
Attempt 1: 60s
Attempt 2: 120s (2 minutes)
Attempt 3: 240s (4 minutes)
```

### Retry Job ID Format

Retry jobs are created with consistent IDs:

```javascript
const retryJobId = `${originalJobId}-retry${attempts}`;

// Examples:
// Original: 'scan-abc123'
// Retry 1:  'scan-abc123-retry1'
// Retry 2:  'scan-abc123-retry2'
// Retry 3:  'scan-abc123-retry3'
```

This ensures:
- All retries tracked under same original ID
- Easy identification of retry attempts
- No nested suffixes

### Cleanup

Retry state is cleaned up when:
- Circuit breaker triggers (5 attempts)
- Max configured retries reached
- Job completes successfully

```javascript
// On success
this.retryQueue.delete(originalJobId);

// On final failure
this.retryQueue.delete(originalJobId);
```

## Circuit Breaker Pattern

### Purpose

Prevents infinite retry loops by enforcing an absolute maximum retry limit.

### How It Works

```javascript
const MAX_ABSOLUTE_RETRIES = 5; // Hardcoded safety limit

if (retryInfo.attempts >= MAX_ABSOLUTE_RETRIES) {
  // Circuit breaker triggered - stop all retries
  Sentry.captureMessage('Circuit breaker triggered', {
    level: 'error',
    tags: { component: 'retry-logic', jobId: originalJobId },
    extra: {
      attempts: retryInfo.attempts,
      maxAbsolute: MAX_ABSOLUTE_RETRIES,
      maxConfigured: retryInfo.maxAttempts,
      errorMessage: error.message,
      errorCode: error.code
    }
  });

  this.retryQueue.delete(originalJobId);
  return false;
}
```

### Hierarchy of Limits

1. **Circuit Breaker (5 attempts)** - ABSOLUTE maximum, cannot be overridden
2. **Configured Max (2 attempts)** - Default job retry limit
3. **Per-Job Override** - Can be set in job options

```javascript
// Circuit breaker always wins
if (attempts >= 5) {
  // STOP - circuit breaker
} else if (attempts > configuredMax) {
  // STOP - max retries
} else {
  // CONTINUE - schedule retry
}
```

### Why Circuit Breaker Is Needed

**Without circuit breaker:**
- Job configured with `maxRetries: 10`
- Non-retryable error (ENOENT) misclassified as retryable
- System retries 10 times, wasting resources
- Each retry takes 5s → 10s → 20s → ... (exponential backoff)
- Total wasted time: 5 + 10 + 20 + 40 + 80 + 160 + 320 + 640 + 1280 + 2560 = **5,115 seconds (85 minutes!)**

**With circuit breaker:**
- Same scenario
- Circuit breaker stops at 5 attempts
- Total time: 5 + 10 + 20 + 40 + 80 = **155 seconds (2.6 minutes)**
- Saves 83 minutes of wasted retries

### Real-World Example

```javascript
// Job creation with high retry limit
const job = worker.createJob('scan-123', {
  repositoryPath: '/tmp/repo'
}, {
  maxRetries: 100 // User sets unreasonably high limit
});

// Job fails with ENOENT (file not found)
// Without circuit breaker: 100 retries!
// With circuit breaker: Stops at 5 attempts
```

## Sentry Integration

### Alert Levels

The retry logic sends alerts to Sentry at three severity levels:

#### 1. Error Level - Circuit Breaker Triggered

**Trigger:** 5+ retry attempts (circuit breaker)

```javascript
Sentry.captureMessage('Circuit breaker triggered: Excessive retry attempts', {
  level: 'error',
  tags: {
    component: 'retry-logic',
    jobId: originalJobId,
    errorType: error.code
  },
  extra: {
    attempts: retryInfo.attempts,
    maxAbsolute: MAX_ABSOLUTE_RETRIES,
    maxConfigured: retryInfo.maxAttempts,
    errorMessage: error.message,
    errorCode: error.code,
    errorClassification: errorInfo
  }
});
```

**When to investigate:**
- Immediately - indicates systemic issue
- Job has failed 5 times, consuming significant resources
- May indicate misconfiguration or bug

#### 2. Warning Level - Maximum Retries Reached

**Trigger:** Configured max retries reached (default: 2)

```javascript
Sentry.captureMessage('Maximum configured retry attempts reached', {
  level: 'warning',
  tags: {
    component: 'retry-logic',
    jobId: originalJobId
  },
  extra: {
    attempts: retryInfo.attempts,
    maxConfigured: retryInfo.maxAttempts,
    errorClassification: errorInfo
  }
});
```

**When to investigate:**
- Review error classification
- Check if error should be retryable
- Consider increasing retry limit if appropriate

#### 3. Warning Level - Approaching Limit

**Trigger:** 3+ retry attempts (approaching circuit breaker)

```javascript
if (retryInfo.attempts >= 3) {
  Sentry.captureMessage('Warning: Approaching retry limit', {
    level: 'warning',
    tags: {
      component: 'retry-logic',
      jobId: originalJobId
    },
    extra: {
      attempts: retryInfo.attempts,
      maxAttempts: retryInfo.maxAttempts,
      maxAbsolute: MAX_ABSOLUTE_RETRIES,
      errorMessage: error.message
    }
  });
}
```

**When to investigate:**
- Proactive warning before circuit breaker
- Monitor for patterns (same error repeatedly)
- Consider if manual intervention needed

### Sentry Context

All Sentry alerts include:

```javascript
{
  level: 'error' | 'warning',
  tags: {
    component: 'retry-logic',      // Component identifier
    jobId: 'scan-abc123',          // Original job ID
    errorType: 'ETIMEDOUT'         // Error code (if available)
  },
  extra: {
    attempts: 3,                   // Current retry count
    maxConfigured: 2,              // Configured max
    maxAbsolute: 5,                // Circuit breaker limit
    errorMessage: 'Connection timeout',
    errorCode: 'ETIMEDOUT',
    errorClassification: {         // Full error classification
      category: 'retryable',
      reason: '...',
      suggestedDelay: 5000,
      retryable: true
    }
  }
}
```

## Error Handling Patterns

### Pattern 1: Try-Catch with Classification

```javascript
try {
  const result = await riskyOperation();
  return result;
} catch (error) {
  const errorInfo = getErrorInfo(error);

  logger.error({
    error,
    classification: errorInfo
  }, 'Operation failed');

  if (errorInfo.retryable) {
    return await this._handleRetry(job, error);
  } else {
    throw error; // Non-retryable - fail immediately
  }
}
```

### Pattern 2: Error-Specific Handling

```javascript
try {
  await fs.access(filePath);
} catch (error) {
  if (error.code === 'ENOENT') {
    // Non-retryable - file doesn't exist
    throw new Error(`File not found: ${filePath}`);
  } else if (error.code === 'EACCES') {
    // Non-retryable - permission denied
    throw new Error(`Permission denied: ${filePath}`);
  } else if (error.code === 'EBUSY') {
    // Retryable - file locked, retry after 2s
    await new Promise(resolve => setTimeout(resolve, 2000));
    return await fs.access(filePath); // Retry
  }
  throw error;
}
```

### Pattern 3: HTTP Request with Retry

```javascript
async function fetchWithRetry(url, maxRetries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url);

      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.statusCode = response.status;
        throw error;
      }

      return response;
    } catch (error) {
      lastError = error;
      const errorInfo = getErrorInfo(error);

      if (!errorInfo.retryable || attempt === maxRetries) {
        throw error;
      }

      // Use suggested delay
      const delay = errorInfo.suggestedDelay || 5000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
```

### Pattern 4: Graceful Degradation

```javascript
async function getDataWithFallback() {
  try {
    // Try primary data source
    return await fetchFromPrimarySource();
  } catch (error) {
    const errorInfo = getErrorInfo(error);

    logger.warn({ error, classification: errorInfo }, 'Primary source failed');

    if (!errorInfo.retryable) {
      // Non-retryable - use fallback immediately
      return await fetchFromFallbackSource();
    }

    // Retryable - try once more before fallback
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      return await fetchFromPrimarySource();
    } catch (retryError) {
      return await fetchFromFallbackSource();
    }
  }
}
```

## Best Practices

### 1. Always Classify Errors

**DON'T:**
```javascript
catch (error) {
  // Blindly retry everything
  setTimeout(() => retry(), 5000);
}
```

**DO:**
```javascript
catch (error) {
  const errorInfo = getErrorInfo(error);
  if (errorInfo.retryable) {
    const delay = errorInfo.suggestedDelay || 5000;
    setTimeout(() => retry(), delay);
  } else {
    logger.error('Non-retryable error, failing immediately');
    throw error;
  }
}
```

### 2. Use Suggested Delays

**DON'T:**
```javascript
// Fixed delay for all errors
setTimeout(() => retry(), 5000);
```

**DO:**
```javascript
const errorInfo = getErrorInfo(error);
const delay = errorInfo.suggestedDelay || 5000;
setTimeout(() => retry(), delay);
```

### 3. Log Error Classification

**DON'T:**
```javascript
catch (error) {
  logger.error('Error occurred');
}
```

**DO:**
```javascript
catch (error) {
  const errorInfo = getErrorInfo(error);
  logger.error({
    error,
    code: errorInfo.code,
    category: errorInfo.category,
    retryable: errorInfo.retryable,
    reason: errorInfo.reason
  }, 'Operation failed');
}
```

### 4. Respect Circuit Breaker

**DON'T:**
```javascript
// Unlimited retries
while (true) {
  try {
    return await operation();
  } catch (error) {
    await delay(5000);
  }
}
```

**DO:**
```javascript
const MAX_RETRIES = 3;
for (let i = 0; i < MAX_RETRIES; i++) {
  try {
    return await operation();
  } catch (error) {
    if (i === MAX_RETRIES - 1 || !isRetryable(error)) {
      throw error;
    }
    await delay(5000 * Math.pow(2, i));
  }
}
```

### 5. Include Error Context

**DON'T:**
```javascript
throw new Error('Failed');
```

**DO:**
```javascript
const error = new Error(`Failed to scan repository: ${repoPath}`);
error.code = 'SCAN_FAILED';
error.context = { repoPath, attemptCount };
throw error;
```

### 6. Clean Up Resources

**DON'T:**
```javascript
const file = await openFile(path);
const data = await processFile(file); // May throw
return data;
// File never closed!
```

**DO:**
```javascript
const file = await openFile(path);
try {
  const data = await processFile(file);
  return data;
} finally {
  await file.close();
}
```

## Monitoring and Alerts

### Dashboard Metrics

Access real-time retry metrics at `http://localhost:8080`:

- **Active Retries** - Current jobs being retried
- **Total Attempts** - Sum of all retry attempts
- **Nearing Limit** - Jobs with 3+ attempts (warning threshold)
- **Retry Distribution** - Breakdown by attempt count
- **Jobs Being Retried** - List with attempt counts and timestamps

### Sentry Queries

**Find circuit breaker triggers:**
```
level:error "Circuit breaker triggered"
```

**Find jobs approaching limit:**
```
level:warning "Approaching retry limit"
```

**Find specific error types:**
```
tags.errorType:ETIMEDOUT
```

**Find jobs by ID:**
```
tags.jobId:scan-abc123
```

### Log Analysis

```bash
# Find retry-related logs
grep "retry" logs/duplicate-detection/*.log

# Find circuit breaker triggers
grep "Circuit breaker" logs/duplicate-detection/*.log

# Find non-retryable errors
grep "non-retryable" logs/duplicate-detection/*.log
```

### Automated Cleanup

Error logs are automatically cleaned up:

```bash
# Cleanup logs older than 7 days (archive)
npm run logs:cleanup

# Dry run
npm run logs:cleanup:dry

# Verbose output
npm run logs:cleanup:verbose
```

Archived logs are compressed with gzip and deleted after 30 days.

## Additional Resources

- Error classifier source: `lib/errors/error-classifier.js`
- Retry logic: `pipelines/duplicate-detection-pipeline.js` (lines 150-235)
- Retry metrics: `pipelines/duplicate-detection-pipeline.js` (lines 539-585)
- Dashboard UI: `public/index.html` (retry section)
- Sentry setup: `sidequest/logger.js`

---

**Last Updated:** 2025-11-17
**Circuit Breaker Limit:** 5 attempts
**Default Max Retries:** 2 attempts
**Default Base Delay:** 5 seconds

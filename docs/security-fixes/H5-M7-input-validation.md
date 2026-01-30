# Security Fixes: H5 & M7 Input Validation

**Date:** 2026-01-29
**Files Modified:**
- `/Users/alyshialedlie/code/jobs/api/routes/jobs.js`
- `/Users/alyshialedlie/code/jobs/sidequest/core/constants.js`
- `/Users/alyshialedlie/code/jobs/tests/unit/input-validation.test.js` (new)

## Issues Fixed

### H5: Unvalidated User Input in Job IDs (High Priority)

**Problem:** Job IDs from URL parameters were used directly without validation, allowing:
- Path traversal attacks (`../etc/passwd`)
- Command injection attempts (`job;rm -rf /`)
- Script injection (`job<script>alert(1)</script>`)

**Solution:**
1. Added `VALIDATION.JOB_ID_PATTERN` constant: `/^[a-zA-Z0-9_-]{1,100}$/`
2. Created `validateJobId()` helper function
3. Applied validation to all routes using `:jobId` parameter:
   - `GET /api/jobs/:jobId` (line 260)
   - `POST /api/jobs/:jobId/cancel` (line 324)
   - `POST /api/jobs/:jobId/retry` (line 386)

**Security Impact:**
- Prevents directory traversal attacks
- Blocks command injection attempts
- Enforces maximum length (100 chars) to prevent buffer issues
- Only allows safe characters: alphanumeric, hyphens, underscores

### M7: Missing Input Sanitization (Medium Priority)

**Problem:** Query parameters (`limit`, `offset`) were used without sanitization, allowing:
- Memory exhaustion via huge limits (e.g., `limit=9999999`)
- NaN propagation from invalid inputs
- Negative offsets causing unexpected behavior

**Solution:**
1. Added `PAGINATION.MAX_LIMIT = 1000` constant
2. Created `sanitizePaginationParams()` helper function that:
   - Enforces minimum limit of 1
   - Enforces maximum limit of 1000
   - Prevents negative offsets
   - Handles NaN inputs gracefully
   - Uses proper NaN checking instead of falsy operators
3. Applied to `GET /api/jobs` endpoint (line 107)

**Security Impact:**
- Prevents memory exhaustion attacks
- Ensures predictable numeric behavior
- Protects against edge cases (0, negative, NaN, Infinity)

## Code Changes

### constants.js

```javascript
export const PAGINATION = {
  DEFAULT_LIMIT: 50,
  DEFAULT_ALL_LIMIT: 100,
  MAX_LIMIT: 1000,  // NEW: Prevent memory issues
};

export const VALIDATION = {  // NEW: Input validation patterns
  JOB_ID_PATTERN: /^[a-zA-Z0-9_-]{1,100}$/,
};
```

### jobs.js - New Helper Functions

```javascript
/**
 * Validate and sanitize job ID from URL parameter
 * Prevents path traversal and injection attacks
 */
function validateJobId(jobId) {
  if (!jobId) {
    return { valid: false, error: 'Job ID is required' };
  }

  if (!VALIDATION.JOB_ID_PATTERN.test(jobId)) {
    return {
      valid: false,
      error: 'Invalid job ID format. Must be alphanumeric with hyphens/underscores (max 100 chars)'
    };
  }

  return { valid: true, sanitized: jobId };
}

/**
 * Sanitize pagination parameters to prevent memory issues and NaN propagation
 */
function sanitizePaginationParams(limit, offset) {
  const limitStr = String(limit);
  const offsetStr = String(offset);

  const parsedLimit = parseInt(limitStr);
  const parsedOffset = parseInt(offsetStr);

  const limitNum = Math.min(
    Math.max(1, Number.isNaN(parsedLimit) ? PAGINATION.DEFAULT_LIMIT : parsedLimit),
    PAGINATION.MAX_LIMIT
  );

  const offsetNum = Math.max(0, Number.isNaN(parsedOffset) ? 0 : parsedOffset);

  return { limit: limitNum, offset: offsetNum };
}
```

### jobs.js - Route Changes

**GET /api/jobs**
```javascript
// Before:
const limitNum = parseInt(limit);
const offsetNum = parseInt(offset);

// After:
const { limit: limitNum, offset: offsetNum } = sanitizePaginationParams(limit, offset);
```

**GET /api/jobs/:jobId**
```javascript
// Added validation:
const validation = validateJobId(jobId);
if (!validation.valid) {
  return res.status(400).json({
    success: false,
    error: {
      message: validation.error,
      code: 'INVALID_JOB_ID'
    },
    timestamp: new Date().toISOString()
  });
}
const job = allJobs.find(j => j.id === validation.sanitized);
```

**POST /api/jobs/:jobId/cancel**
```javascript
// Added validation before processing:
const validation = validateJobId(jobId);
if (!validation.valid) {
  return res.status(400).json({
    success: false,
    error: {
      message: validation.error,
      code: 'INVALID_JOB_ID'
    },
    timestamp: new Date().toISOString()
  });
}
const sanitizedJobId = validation.sanitized;
// Use sanitizedJobId throughout the rest of the function
```

**POST /api/jobs/:jobId/retry**
```javascript
// Same validation pattern as cancel route
```

## Testing

Created comprehensive unit tests in `tests/unit/input-validation.test.js`:

**H5 Tests (6 test cases):**
- Valid job IDs (alphanumeric, hyphens, underscores)
- Path traversal attempts (`../etc/passwd`)
- Command injection (`job;rm -rf /`)
- Script injection (`job<script>alert(1)</script>`)
- Empty/null values
- Length limits (100 chars max)

**M7 Tests (9 test cases):**
- Valid pagination parameters
- Maximum limit enforcement (1000)
- Minimum limit enforcement (1)
- Negative offset prevention
- NaN input handling
- String to number conversion
- Float truncation
- Default values for missing inputs
- Huge offset handling

**All 15 tests pass.**

## Verification

```bash
# Run unit tests
node --test tests/unit/input-validation.test.js

# Run type checking
npm run typecheck

# Run integration tests
npm run test:integration
```

## Security Checklist

- [x] Job IDs validated against strict pattern
- [x] Path traversal attacks blocked
- [x] Command injection attacks blocked
- [x] Script injection attacks blocked
- [x] Maximum length enforced (100 chars)
- [x] Pagination limits enforced (max 1000)
- [x] Negative offsets prevented
- [x] NaN propagation prevented
- [x] Memory exhaustion attacks mitigated
- [x] All affected routes updated
- [x] Comprehensive tests added
- [x] Documentation updated

## Breaking Changes

None. All changes are backward compatible:
- Valid job IDs continue to work
- Invalid job IDs now return 400 Bad Request instead of potentially causing errors
- Pagination parameters are sanitized but maintain expected behavior
- Huge limit values are now capped at 1000 (previously unlimited)

## Performance Impact

Minimal:
- Regex validation is O(1) for bounded input (max 100 chars)
- Pagination sanitization adds 2-3 simple arithmetic operations
- No additional database queries or I/O operations

## Future Improvements

1. Consider adding rate limiting for failed validation attempts
2. Add logging for security events (blocked injection attempts)
3. Consider adding Zod schemas for route-level validation
4. Add API documentation for validation error responses

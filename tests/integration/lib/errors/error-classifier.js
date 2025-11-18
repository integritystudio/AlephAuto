/**
 * Error Classification System
 *
 * Categorizes errors as retryable or non-retryable to enable intelligent retry logic.
 *
 * Classification Methods (in order):
 * 1. Error Codes - Node.js/system error codes (ENOENT, ETIMEDOUT, etc.)
 * 2. HTTP Status Codes - REST API responses (4xx, 5xx)
 * 3. Error Message Patterns - String matching for common errors
 *
 * @module error-classifier
 */

/**
 * Error categories
 */
export const ErrorCategory = {
  RETRYABLE: 'retryable',
  NON_RETRYABLE: 'non-retryable'
};

/**
 * Non-retryable error codes
 *
 * These errors indicate permanent failures that won't be fixed by retrying:
 * - ENOENT: File/directory doesn't exist - retrying won't make it appear
 * - EACCES: Permission denied - requires manual fix
 * - EINVAL: Invalid argument - same input will fail again
 * - ENOTFOUND: DNS failure - immediate retry unlikely to help
 */
const NON_RETRYABLE_ERROR_CODES = [
  'ENOENT',              // File/directory not found
  'ENOTDIR',             // Not a directory
  'EISDIR',              // Is a directory
  'EACCES',              // Permission denied
  'EPERM',               // Operation not permitted
  'EINVAL',              // Invalid argument
  'EEXIST',              // File exists
  'ENOTFOUND',           // DNS resolution failed
  'ECONNREFUSED',        // Connection refused (server not running)
  'ERR_MODULE_NOT_FOUND' // Module not found
];

/**
 * Retryable error codes
 *
 * These errors indicate transient failures that may succeed on retry:
 * - ETIMEDOUT: Network congestion - may work on retry
 * - ECONNRESET: Temporary connection issue
 * - EHOSTUNREACH: Routing issue - may resolve
 */
const RETRYABLE_ERROR_CODES = [
  'ETIMEDOUT',    // Connection timeout
  'ECONNRESET',   // Connection reset by peer
  'EHOSTUNREACH', // Host unreachable
  'ENETUNREACH',  // Network unreachable
  'EPIPE',        // Broken pipe
  'EAGAIN',       // Resource temporarily unavailable
  'EBUSY'         // Resource busy
];

/**
 * HTTP status code ranges
 */
const HTTP_STATUS = {
  // 4xx - Client errors (non-retryable except specific cases)
  CLIENT_ERROR_MIN: 400,
  CLIENT_ERROR_MAX: 499,

  // 5xx - Server errors (retryable)
  SERVER_ERROR_MIN: 500,
  SERVER_ERROR_MAX: 599,

  // Specific retryable 4xx codes
  RETRYABLE_4XX: [
    408, // Request Timeout
    429, // Too Many Requests (rate limit)
  ]
};

/**
 * Error message patterns for non-retryable errors
 */
const NON_RETRYABLE_PATTERNS = [
  /invalid.*argument/i,
  /validation.*failed/i,
  /not found/i,
  /does not exist/i,
  /permission denied/i,
  /unauthorized/i,
  /forbidden/i,
  /bad request/i,
  /malformed/i
];

/**
 * Error message patterns for retryable errors
 */
const RETRYABLE_PATTERNS = [
  /timeout/i,
  /timed out/i,
  /connection.*reset/i,
  /temporarily unavailable/i,
  /service unavailable/i,
  /internal server error/i
];

/**
 * Classify an error as retryable or non-retryable
 *
 * @param {Error} error - The error to classify
 * @returns {{retryable: boolean, category: string, reason: string, delay?: number}}
 */
export function classifyError(error) {
  // 1. Check error code (Node.js/system errors)
  if (error.code) {
    if (NON_RETRYABLE_ERROR_CODES.includes(error.code)) {
      return {
        retryable: false,
        category: ErrorCategory.NON_RETRYABLE,
        reason: `Error code ${error.code} indicates a permanent failure`
      };
    }

    if (RETRYABLE_ERROR_CODES.includes(error.code)) {
      return {
        retryable: true,
        category: ErrorCategory.RETRYABLE,
        reason: `Error code ${error.code} indicates a transient failure`,
        delay: error.code === 'ETIMEDOUT' ? 10000 : 5000 // 10s for timeouts, 5s for others
      };
    }
  }

  // 2. Check HTTP status code
  if (error.status || error.statusCode) {
    const status = error.status || error.statusCode;

    // Specific retryable 4xx codes (rate limit, timeout)
    if (HTTP_STATUS.RETRYABLE_4XX.includes(status)) {
      return {
        retryable: true,
        category: ErrorCategory.RETRYABLE,
        reason: `HTTP ${status} is retryable`,
        delay: status === 429 ? 60000 : 30000 // 60s for rate limit, 30s for timeout
      };
    }

    // General 4xx errors are non-retryable (client errors)
    if (status >= HTTP_STATUS.CLIENT_ERROR_MIN && status <= HTTP_STATUS.CLIENT_ERROR_MAX) {
      return {
        retryable: false,
        category: ErrorCategory.NON_RETRYABLE,
        reason: `HTTP ${status} indicates a client error`
      };
    }

    // 5xx errors are retryable (server errors)
    if (status >= HTTP_STATUS.SERVER_ERROR_MIN && status <= HTTP_STATUS.SERVER_ERROR_MAX) {
      return {
        retryable: true,
        category: ErrorCategory.RETRYABLE,
        reason: `HTTP ${status} indicates a server error`,
        delay: 15000 // 15s for server errors
      };
    }
  }

  // 3. Check error message patterns
  const message = error.message || '';

  // Non-retryable patterns
  for (const pattern of NON_RETRYABLE_PATTERNS) {
    if (pattern.test(message)) {
      return {
        retryable: false,
        category: ErrorCategory.NON_RETRYABLE,
        reason: `Error message matches non-retryable pattern: ${pattern}`
      };
    }
  }

  // Retryable patterns
  for (const pattern of RETRYABLE_PATTERNS) {
    if (pattern.test(message)) {
      return {
        retryable: true,
        category: ErrorCategory.RETRYABLE,
        reason: `Error message matches retryable pattern: ${pattern}`,
        delay: 10000 // 10s default
      };
    }
  }

  // Default: treat unknown errors as non-retryable to be safe
  return {
    retryable: false,
    category: ErrorCategory.NON_RETRYABLE,
    reason: 'Unknown error type - treating as non-retryable for safety'
  };
}

/**
 * Check if an error is retryable
 *
 * @param {Error} error - The error to check
 * @returns {boolean} - True if error is retryable
 */
export function isRetryable(error) {
  return classifyError(error).retryable;
}

/**
 * Get recommended retry delay for an error
 *
 * @param {Error} error - The error
 * @returns {number} - Delay in milliseconds (default: 5000)
 */
export function getRetryDelay(error) {
  const classification = classifyError(error);
  return classification.delay || 5000;
}

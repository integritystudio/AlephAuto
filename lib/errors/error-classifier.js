/**
 * Error Classification System
 *
 * Classifies errors as retryable (transient) or non-retryable (permanent)
 * to prevent wasted retry attempts on errors that will never succeed.
 *
 * @module lib/errors/error-classifier
 */

// @ts-check
/** @typedef {import('./types').HTTPError} HTTPError */
/** @typedef {import('./types').ClassifiedError} ClassifiedError */

/**
 * Error categories
 */
export const ErrorCategory = {
  RETRYABLE: 'retryable',
  NON_RETRYABLE: 'non_retryable'
};

/**
 * Error types that should NOT be retried
 * These represent permanent failures that won't be fixed by retrying
 */
const NON_RETRYABLE_ERROR_CODES = new Set([
  // Filesystem errors
  'ENOENT',      // No such file or directory
  'ENOTDIR',     // Not a directory
  'EISDIR',      // Is a directory (when file expected)
  'EACCES',      // Permission denied
  'EPERM',       // Operation not permitted
  'EINVAL',      // Invalid argument
  'EEXIST',      // File already exists

  // Network errors - permanent
  'ENOTFOUND',   // DNS resolution failed
  'ECONNREFUSED',// Connection refused (server not listening)

  // Application errors
  'ERR_INVALID_ARG_TYPE',
  'ERR_INVALID_ARG_VALUE',
  'ERR_MODULE_NOT_FOUND',
  'ERR_REQUIRE_ESM',
  'ERR_UNKNOWN_FILE_EXTENSION',

  // HTTP errors - client errors (4xx)
  'ERR_HTTP_400', // Bad Request
  'ERR_HTTP_401', // Unauthorized
  'ERR_HTTP_403', // Forbidden
  'ERR_HTTP_404', // Not Found
  'ERR_HTTP_405', // Method Not Allowed
  'ERR_HTTP_409', // Conflict
  'ERR_HTTP_422', // Unprocessable Entity
]);

/**
 * Error types that SHOULD be retried
 * These represent transient failures that may succeed on retry
 */
const RETRYABLE_ERROR_CODES = new Set([
  // Network errors - transient
  'ETIMEDOUT',   // Connection timed out
  'ECONNRESET',  // Connection reset by peer
  'EHOSTUNREACH',// Host unreachable
  'ENETUNREACH', // Network unreachable
  'EPIPE',       // Broken pipe
  'EAGAIN',      // Resource temporarily unavailable
  'EBUSY',       // Resource busy

  // HTTP errors - server errors (5xx)
  'ERR_HTTP_500', // Internal Server Error
  'ERR_HTTP_502', // Bad Gateway
  'ERR_HTTP_503', // Service Unavailable
  'ERR_HTTP_504', // Gateway Timeout
]);

/**
 * Error messages that indicate non-retryable errors
 * (case-insensitive matching)
 */
const NON_RETRYABLE_MESSAGES = [
  'invalid repository path',
  'not a git repository',
  'permission denied',
  'access denied',
  'authentication failed',
  'invalid credentials',
  'malformed',
  'invalid format',
  'parse error',
  'syntax error',
  'validation error',
  'schema error',
];

/**
 * Error messages that indicate retryable errors
 */
const RETRYABLE_MESSAGES = [
  'timeout',
  'timed out',
  'connection reset',
  'service unavailable',
  'temporarily unavailable',
  'try again',
  'rate limit',
  'too many requests',
];

/**
 * Classify an error as retryable or non-retryable
 *
 * @param {Error} error - The error to classify
 * @returns {{category: string, reason: string, suggestedDelay: number}} Classification result with category, reason, and suggested retry delay
 */
export function classifyError(error) {
  if (!error) {
    return {
      category: ErrorCategory.NON_RETRYABLE,
      reason: 'No error provided',
      suggestedDelay: 0
    };
  }

  // Extract error properties
  const errorCode = error.code || error.errno;
  const errorMessage = error.message?.toLowerCase() || '';
  const httpError = /** @type {HTTPError} */ (error);
  const statusCode = httpError.statusCode || httpError.status;

  // Check error code against known sets
  if (errorCode) {
    if (NON_RETRYABLE_ERROR_CODES.has(errorCode)) {
      return {
        category: ErrorCategory.NON_RETRYABLE,
        reason: `Error code '${errorCode}' indicates permanent failure`,
        suggestedDelay: 0
      };
    }

    if (RETRYABLE_ERROR_CODES.has(errorCode)) {
      return {
        category: ErrorCategory.RETRYABLE,
        reason: `Error code '${errorCode}' indicates transient failure`,
        suggestedDelay: calculateRetryDelay(errorCode, statusCode)
      };
    }
  }

  // Check HTTP status codes
  if (statusCode) {
    if (statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
      // 4xx errors (except 429 Too Many Requests) are non-retryable
      return {
        category: ErrorCategory.NON_RETRYABLE,
        reason: `HTTP ${statusCode} indicates client error`,
        suggestedDelay: 0
      };
    }

    if (statusCode >= 500 || statusCode === 429) {
      // 5xx errors and 429 are retryable
      return {
        category: ErrorCategory.RETRYABLE,
        reason: `HTTP ${statusCode} indicates server error or rate limit`,
        suggestedDelay: statusCode === 429 ? 60000 : 10000 // 1min for rate limit, 10s otherwise
      };
    }
  }

  // Check error message patterns
  for (const pattern of NON_RETRYABLE_MESSAGES) {
    if (errorMessage.includes(pattern)) {
      return {
        category: ErrorCategory.NON_RETRYABLE,
        reason: `Error message contains '${pattern}'`,
        suggestedDelay: 0
      };
    }
  }

  for (const pattern of RETRYABLE_MESSAGES) {
    if (errorMessage.includes(pattern)) {
      return {
        category: ErrorCategory.RETRYABLE,
        reason: `Error message contains '${pattern}'`,
        suggestedDelay: pattern.includes('rate limit') ? 60000 : 5000
      };
    }
  }

  // Default to retryable for unknown errors (conservative approach)
  return {
    category: ErrorCategory.RETRYABLE,
    reason: 'Unknown error type - defaulting to retryable',
    suggestedDelay: 5000
  };
}

/**
 * Check if an error is retryable
 *
 * @param {Error} error - The error to check
 * @returns {boolean} True if the error should be retried
 */
export function isRetryable(error) {
  const classification = classifyError(error);
  return classification.category === ErrorCategory.RETRYABLE;
}

/**
 * Calculate suggested retry delay based on error type
 *
 * @param {string} errorCode - Error code
 * @param {number} statusCode - HTTP status code (if applicable)
 * @returns {number} Suggested delay in milliseconds
 * @private
 */
function calculateRetryDelay(errorCode, statusCode) {
  // Rate limiting
  if (statusCode === 429) {
    return 60000; // 1 minute
  }

  // Network timeouts
  if (errorCode === 'ETIMEDOUT') {
    return 10000; // 10 seconds
  }

  // Connection errors
  if (['ECONNRESET', 'ECONNREFUSED', 'EPIPE'].includes(errorCode)) {
    return 5000; // 5 seconds
  }

  // Server errors
  if (statusCode >= 500) {
    return 10000; // 10 seconds
  }

  // Default
  return 5000; // 5 seconds
}

/**
 * Get detailed error information
 *
 * @param {Error} error - The error to analyze
 * @returns {Object} Detailed error information
 */
export function getErrorInfo(error) {
  const classification = classifyError(error);

  return {
    name: error.name || 'Error',
    message: error.message || 'Unknown error',
    code: error.code || error.errno,
    statusCode: error.statusCode || error.status,
    category: classification.category,
    reason: classification.reason,
    suggestedDelay: classification.suggestedDelay,
    retryable: classification.category === ErrorCategory.RETRYABLE,
    stack: error.stack,
    cause: error.cause
  };
}

/**
 * Create a ScanError with classification
 *
 * @param {string} message - Error message
 * @param {Error} cause - Original error
 * @returns {Error} Classified error
 */
export function createScanError(message, cause) {
  const error = new Error(message);
  error.name = 'ScanError';
  error.cause = cause;

  // Preserve original error properties
  if (cause) {
    error.code = cause.code || cause.errno;
    error.statusCode = cause.statusCode || cause.status;
  }

  // Add classification
  const classification = classifyError(cause || error);
  error.retryable = classification.category === ErrorCategory.RETRYABLE;
  error.classification = classification;

  return error;
}

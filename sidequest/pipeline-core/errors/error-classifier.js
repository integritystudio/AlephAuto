/**
 * Error Classification System
 *
 * Classifies errors as retryable (transient) or non-retryable (permanent)
 * to prevent wasted retry attempts on errors that will never succeed.
 *
 * Architecture: Configuration-driven classification using lookup objects
 * instead of conditional chains to reduce cyclomatic complexity.
 *
 * Classification Priority:
 * 1. Error codes (Node.js/system errors) - highest priority
 * 2. HTTP status codes - medium priority
 * 3. Error message patterns - lowest priority
 * 4. Default fallback
 *
 * @module lib/errors/error-classifier
 */

// @ts-check
/** @typedef {import('./types').HTTPError} HTTPError */
/** @typedef {import('./types').ClassifiedError} ClassifiedError */
/** @typedef {import('./error-types').ExtendedError} ExtendedError */

/**
 * @typedef {Object} ErrorClassification
 * @property {string} category - 'retryable' or 'non_retryable'
 * @property {string} reason - Human-readable explanation
 * @property {number} suggestedDelay - Retry delay in milliseconds (0 for non-retryable)
 */

/**
 * @typedef {Object} ErrorCodeConfig
 * @property {boolean} retryable - Whether this error type is retryable
 * @property {string} description - Human-readable description
 * @property {number} delay - Suggested retry delay in milliseconds
 * @property {'filesystem' | 'network' | 'application' | 'http'} group - Error category group
 */

/**
 * Error categories
 */
export const ErrorCategory = {
  RETRYABLE: 'retryable',
  NON_RETRYABLE: 'non_retryable'
};

// =============================================================================
// ERROR CODE CONFIGURATION
// =============================================================================

/**
 * Centralized error code configuration.
 * Each error code maps to its classification properties.
 *
 * @type {Record<string, ErrorCodeConfig>}
 */
const ERROR_CODE_CONFIG = {
  // -------------------------------------------------------------------------
  // Filesystem errors (non-retryable)
  // -------------------------------------------------------------------------
  ENOENT: { retryable: false, description: 'No such file or directory', delay: 0, group: 'filesystem' },
  ENOTDIR: { retryable: false, description: 'Not a directory', delay: 0, group: 'filesystem' },
  EISDIR: { retryable: false, description: 'Is a directory (when file expected)', delay: 0, group: 'filesystem' },
  EACCES: { retryable: false, description: 'Permission denied', delay: 0, group: 'filesystem' },
  EPERM: { retryable: false, description: 'Operation not permitted', delay: 0, group: 'filesystem' },
  EINVAL: { retryable: false, description: 'Invalid argument', delay: 0, group: 'filesystem' },
  EEXIST: { retryable: false, description: 'File already exists', delay: 0, group: 'filesystem' },

  // -------------------------------------------------------------------------
  // Network errors - permanent (non-retryable)
  // -------------------------------------------------------------------------
  ENOTFOUND: { retryable: false, description: 'DNS resolution failed', delay: 0, group: 'network' },
  ECONNREFUSED: { retryable: false, description: 'Connection refused (server not listening)', delay: 0, group: 'network' },

  // -------------------------------------------------------------------------
  // Network errors - transient (retryable)
  // -------------------------------------------------------------------------
  ETIMEDOUT: { retryable: true, description: 'Connection timed out', delay: 10000, group: 'network' },
  ECONNRESET: { retryable: true, description: 'Connection reset by peer', delay: 5000, group: 'network' },
  EHOSTUNREACH: { retryable: true, description: 'Host unreachable', delay: 5000, group: 'network' },
  ENETUNREACH: { retryable: true, description: 'Network unreachable', delay: 5000, group: 'network' },
  EPIPE: { retryable: true, description: 'Broken pipe', delay: 5000, group: 'network' },
  EAGAIN: { retryable: true, description: 'Resource temporarily unavailable', delay: 5000, group: 'network' },
  EBUSY: { retryable: true, description: 'Resource busy', delay: 5000, group: 'network' },

  // -------------------------------------------------------------------------
  // Application errors (non-retryable)
  // -------------------------------------------------------------------------
  ERR_INVALID_ARG_TYPE: { retryable: false, description: 'Invalid argument type', delay: 0, group: 'application' },
  ERR_INVALID_ARG_VALUE: { retryable: false, description: 'Invalid argument value', delay: 0, group: 'application' },
  ERR_MODULE_NOT_FOUND: { retryable: false, description: 'Module not found', delay: 0, group: 'application' },
  ERR_REQUIRE_ESM: { retryable: false, description: 'Cannot require ESM module', delay: 0, group: 'application' },
  ERR_UNKNOWN_FILE_EXTENSION: { retryable: false, description: 'Unknown file extension', delay: 0, group: 'application' },

  // -------------------------------------------------------------------------
  // HTTP error codes (non-retryable client errors)
  // -------------------------------------------------------------------------
  ERR_HTTP_400: { retryable: false, description: 'Bad Request', delay: 0, group: 'http' },
  ERR_HTTP_401: { retryable: false, description: 'Unauthorized', delay: 0, group: 'http' },
  ERR_HTTP_403: { retryable: false, description: 'Forbidden', delay: 0, group: 'http' },
  ERR_HTTP_404: { retryable: false, description: 'Not Found', delay: 0, group: 'http' },
  ERR_HTTP_405: { retryable: false, description: 'Method Not Allowed', delay: 0, group: 'http' },
  ERR_HTTP_409: { retryable: false, description: 'Conflict', delay: 0, group: 'http' },
  ERR_HTTP_422: { retryable: false, description: 'Unprocessable Entity', delay: 0, group: 'http' },

  // -------------------------------------------------------------------------
  // HTTP error codes (retryable server errors)
  // -------------------------------------------------------------------------
  ERR_HTTP_500: { retryable: true, description: 'Internal Server Error', delay: 10000, group: 'http' },
  ERR_HTTP_502: { retryable: true, description: 'Bad Gateway', delay: 10000, group: 'http' },
  ERR_HTTP_503: { retryable: true, description: 'Service Unavailable', delay: 10000, group: 'http' },
  ERR_HTTP_504: { retryable: true, description: 'Gateway Timeout', delay: 10000, group: 'http' }
};

// =============================================================================
// HTTP STATUS CODE CONFIGURATION
// =============================================================================

/**
 * HTTP status code ranges and special cases
 */
const HTTP_STATUS_CONFIG = {
  /** Rate limit status code - retryable with long delay */
  RATE_LIMIT: 429,
  RATE_LIMIT_DELAY: 60000,

  /** Client error range (4xx) - non-retryable except 429 */
  CLIENT_ERROR_MIN: 400,
  CLIENT_ERROR_MAX: 499,

  /** Server error range (5xx) - retryable */
  SERVER_ERROR_MIN: 500,
  SERVER_ERROR_MAX: 599,
  SERVER_ERROR_DELAY: 10000
};

// =============================================================================
// MESSAGE PATTERN CONFIGURATION
// =============================================================================

/**
 * @typedef {Object} MessagePatternConfig
 * @property {string} pattern - Substring to match (case-insensitive)
 * @property {boolean} retryable - Whether this pattern indicates retryable error
 * @property {number} delay - Suggested retry delay in milliseconds
 */

/**
 * Error message patterns for classification.
 * Checked in order - first match wins.
 *
 * @type {MessagePatternConfig[]}
 */
const MESSAGE_PATTERNS = [
  // Non-retryable patterns (checked first for safety)
  { pattern: 'invalid repository path', retryable: false, delay: 0 },
  { pattern: 'not a git repository', retryable: false, delay: 0 },
  { pattern: 'permission denied', retryable: false, delay: 0 },
  { pattern: 'access denied', retryable: false, delay: 0 },
  { pattern: 'authentication failed', retryable: false, delay: 0 },
  { pattern: 'invalid credentials', retryable: false, delay: 0 },
  { pattern: 'malformed', retryable: false, delay: 0 },
  { pattern: 'invalid format', retryable: false, delay: 0 },
  { pattern: 'parse error', retryable: false, delay: 0 },
  { pattern: 'syntax error', retryable: false, delay: 0 },
  { pattern: 'validation error', retryable: false, delay: 0 },
  { pattern: 'schema error', retryable: false, delay: 0 },

  // Retryable patterns
  { pattern: 'rate limit', retryable: true, delay: 60000 },
  { pattern: 'too many requests', retryable: true, delay: 60000 },
  { pattern: 'timeout', retryable: true, delay: 5000 },
  { pattern: 'timed out', retryable: true, delay: 5000 },
  { pattern: 'connection reset', retryable: true, delay: 5000 },
  { pattern: 'service unavailable', retryable: true, delay: 5000 },
  { pattern: 'temporarily unavailable', retryable: true, delay: 5000 },
  { pattern: 'try again', retryable: true, delay: 5000 }
];

// =============================================================================
// DEFAULT CLASSIFICATION
// =============================================================================

/**
 * Default classification for unknown errors.
 * Conservative approach: treat unknown as retryable to avoid data loss.
 */
const DEFAULT_CLASSIFICATION = {
  category: ErrorCategory.RETRYABLE,
  reason: 'Unknown error type - defaulting to retryable',
  suggestedDelay: 5000
};

/**
 * Classification for null/undefined errors
 */
const NULL_ERROR_CLASSIFICATION = {
  category: ErrorCategory.NON_RETRYABLE,
  reason: 'No error provided',
  suggestedDelay: 0
};

// =============================================================================
// CLASSIFICATION FUNCTIONS
// =============================================================================

/**
 * Classify error by error code lookup.
 *
 * @param {string} errorCode - The error code to classify
 * @returns {ErrorClassification | null} Classification or null if not found
 * @private
 */
function classifyByErrorCode(errorCode) {
  const config = ERROR_CODE_CONFIG[errorCode];
  if (!config) return null;

  return {
    category: config.retryable ? ErrorCategory.RETRYABLE : ErrorCategory.NON_RETRYABLE,
    reason: `Error code '${errorCode}' indicates ${config.retryable ? 'transient' : 'permanent'} failure`,
    suggestedDelay: config.delay
  };
}

/**
 * Classify error by HTTP status code.
 *
 * @param {number} statusCode - The HTTP status code
 * @returns {ErrorClassification | null} Classification or null if not applicable
 * @private
 */
function classifyByHttpStatus(statusCode) {
  // Rate limit - special case, always retryable
  if (statusCode === HTTP_STATUS_CONFIG.RATE_LIMIT) {
    return {
      category: ErrorCategory.RETRYABLE,
      reason: `HTTP ${statusCode} indicates rate limit`,
      suggestedDelay: HTTP_STATUS_CONFIG.RATE_LIMIT_DELAY
    };
  }

  // Client errors (4xx except 429) - non-retryable
  if (statusCode >= HTTP_STATUS_CONFIG.CLIENT_ERROR_MIN &&
      statusCode <= HTTP_STATUS_CONFIG.CLIENT_ERROR_MAX) {
    return {
      category: ErrorCategory.NON_RETRYABLE,
      reason: `HTTP ${statusCode} indicates client error`,
      suggestedDelay: 0
    };
  }

  // Server errors (5xx) - retryable
  if (statusCode >= HTTP_STATUS_CONFIG.SERVER_ERROR_MIN &&
      statusCode <= HTTP_STATUS_CONFIG.SERVER_ERROR_MAX) {
    return {
      category: ErrorCategory.RETRYABLE,
      reason: `HTTP ${statusCode} indicates server error`,
      suggestedDelay: HTTP_STATUS_CONFIG.SERVER_ERROR_DELAY
    };
  }

  return null;
}

/**
 * Classify error by message pattern matching.
 *
 * @param {string} message - The error message (lowercase)
 * @returns {ErrorClassification | null} Classification or null if no pattern matches
 * @private
 */
function classifyByMessagePattern(message) {
  for (const config of MESSAGE_PATTERNS) {
    if (message.includes(config.pattern)) {
      return {
        category: config.retryable ? ErrorCategory.RETRYABLE : ErrorCategory.NON_RETRYABLE,
        reason: `Error message contains '${config.pattern}'`,
        suggestedDelay: config.delay
      };
    }
  }
  return null;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Classify an error as retryable or non-retryable.
 *
 * Uses a priority-based classification strategy:
 * 1. Error codes (highest priority) - direct lookup
 * 2. HTTP status codes - range-based classification
 * 3. Message patterns - substring matching
 * 4. Default (lowest priority) - conservative retryable
 *
 * @param {Error} error - The error to classify
 * @returns {ErrorClassification} Classification result
 */
export function classifyError(error) {
  // Handle null/undefined errors
  if (!error) {
    return NULL_ERROR_CLASSIFICATION;
  }

  // Extract error properties
  const extError = /** @type {ExtendedError} */ (error);
  const errorCode = extError.code || extError.errno;
  const httpError = /** @type {HTTPError} */ (error);
  const statusCode = httpError.statusCode || httpError.status;

  // Priority 1: Check error code
  if (errorCode) {
    const codeClassification = classifyByErrorCode(String(errorCode));
    if (codeClassification) return codeClassification;
  }

  // Priority 2: Check HTTP status code
  if (statusCode) {
    const httpClassification = classifyByHttpStatus(statusCode);
    if (httpClassification) return httpClassification;
  }

  // Priority 3: Check message patterns
  const errorMessage = error.message?.toLowerCase() || '';
  if (errorMessage) {
    const messageClassification = classifyByMessagePattern(errorMessage);
    if (messageClassification) return messageClassification;
  }

  // Priority 4: Default classification
  return DEFAULT_CLASSIFICATION;
}

/**
 * Check if an error is retryable.
 *
 * @param {Error} error - The error to check
 * @returns {boolean} True if the error should be retried
 */
export function isRetryable(error) {
  return classifyError(error).category === ErrorCategory.RETRYABLE;
}

/**
 * Get detailed error information including classification.
 *
 * @param {Error} error - The error to analyze
 * @returns {Object} Detailed error information
 */
export function getErrorInfo(error) {
  const classification = classifyError(error);
  const extError = /** @type {ExtendedError} */ (error);
  const httpError = /** @type {HTTPError} */ (error);

  return {
    name: error.name || 'Error',
    message: error.message || 'Unknown error',
    code: extError.code || extError.errno,
    statusCode: httpError.statusCode || httpError.status,
    category: classification.category,
    reason: classification.reason,
    suggestedDelay: classification.suggestedDelay,
    retryable: classification.category === ErrorCategory.RETRYABLE,
    stack: error.stack,
    cause: error.cause
  };
}

/**
 * Determine error category group for a given error.
 *
 * @param {Error} error - The error to categorize
 * @returns {'network' | 'file_system' | 'http' | 'database' | 'unknown'} Category group
 * @private
 */
function getErrorCategoryGroup(error) {
  const classification = classifyError(error);
  const reason = classification.reason.toLowerCase();

  if (reason.includes('network') || reason.includes('connection') || reason.includes('timeout')) {
    return 'network';
  }
  if (reason.includes('http')) {
    return 'http';
  }
  if (reason.includes('file') || reason.includes('directory') || reason.includes('permission')) {
    return 'file_system';
  }
  return 'unknown';
}

/**
 * Create a ScanError with classification.
 *
 * @param {string} message - Error message
 * @param {Error} cause - Original error
 * @returns {Error} Classified error
 */
export function createScanError(message, cause) {
  const error = new Error(message);
  error.name = 'ScanError';
  error.cause = cause;

  // Cast to typed error interfaces for property assignment
  const httpError = /** @type {HTTPError} */ (error);
  const classifiedError = /** @type {ClassifiedError} */ (error);

  // Preserve original error properties
  if (cause) {
    const extCause = /** @type {ExtendedError} */ (cause);
    const httpCause = /** @type {HTTPError} */ (cause);
    const extError = /** @type {ExtendedError} */ (error);
    extError.code = extCause.code || extCause.errno;
    httpError.statusCode = httpCause.statusCode || httpCause.status;
  }

  // Add classification
  const errorToClassify = cause || error;
  const classification = classifyError(errorToClassify);
  const categoryGroup = getErrorCategoryGroup(errorToClassify);

  classifiedError.retryable = classification.category === ErrorCategory.RETRYABLE;
  classifiedError.classification = {
    category: categoryGroup,
    retryable: classification.category === ErrorCategory.RETRYABLE,
    severity: classification.category === ErrorCategory.NON_RETRYABLE ? 'high' : 'medium'
  };

  return error;
}

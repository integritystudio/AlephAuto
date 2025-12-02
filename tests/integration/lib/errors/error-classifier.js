/**
 * Error Classification System (Test Integration Version)
 *
 * Categorizes errors as retryable or non-retryable to enable intelligent retry logic.
 *
 * Architecture: Configuration-driven classification using lookup objects
 * instead of conditional chains to reduce cyclomatic complexity.
 *
 * Classification Methods (in priority order):
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

// =============================================================================
// ERROR CODE CONFIGURATION
// =============================================================================

/**
 * @typedef {Object} ErrorCodeConfig
 * @property {boolean} retryable - Whether this error type is retryable
 * @property {number} delay - Suggested retry delay in milliseconds
 */

/**
 * Centralized error code configuration.
 * Each error code maps to its classification properties.
 *
 * @type {Record<string, ErrorCodeConfig>}
 */
const ERROR_CODE_CONFIG = {
  // Non-retryable filesystem errors
  ENOENT: { retryable: false, delay: 0 },
  ENOTDIR: { retryable: false, delay: 0 },
  EISDIR: { retryable: false, delay: 0 },
  EACCES: { retryable: false, delay: 0 },
  EPERM: { retryable: false, delay: 0 },
  EINVAL: { retryable: false, delay: 0 },
  EEXIST: { retryable: false, delay: 0 },

  // Non-retryable network errors
  ENOTFOUND: { retryable: false, delay: 0 },
  ECONNREFUSED: { retryable: false, delay: 0 },

  // Non-retryable application errors
  ERR_MODULE_NOT_FOUND: { retryable: false, delay: 0 },

  // Retryable network errors
  ETIMEDOUT: { retryable: true, delay: 10000 },
  ECONNRESET: { retryable: true, delay: 5000 },
  EHOSTUNREACH: { retryable: true, delay: 5000 },
  ENETUNREACH: { retryable: true, delay: 5000 },
  EPIPE: { retryable: true, delay: 5000 },
  EAGAIN: { retryable: true, delay: 5000 },
  EBUSY: { retryable: true, delay: 5000 }
};

// =============================================================================
// HTTP STATUS CODE CONFIGURATION
// =============================================================================

/**
 * HTTP status code configuration
 */
const HTTP_STATUS_CONFIG = {
  /** Retryable 4xx status codes */
  RETRYABLE_4XX: {
    408: 30000, // Request Timeout - 30s
    429: 60000  // Too Many Requests (rate limit) - 60s
  },

  /** Client error range (4xx) - non-retryable except specific codes */
  CLIENT_ERROR_MIN: 400,
  CLIENT_ERROR_MAX: 499,

  /** Server error range (5xx) - retryable */
  SERVER_ERROR_MIN: 500,
  SERVER_ERROR_MAX: 599,
  SERVER_ERROR_DELAY: 15000
};

// =============================================================================
// MESSAGE PATTERN CONFIGURATION
// =============================================================================

/**
 * @typedef {Object} MessagePatternConfig
 * @property {RegExp} pattern - Regex pattern to match
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
  { pattern: /invalid.*argument/i, retryable: false, delay: 0 },
  { pattern: /validation.*failed/i, retryable: false, delay: 0 },
  { pattern: /not found/i, retryable: false, delay: 0 },
  { pattern: /does not exist/i, retryable: false, delay: 0 },
  { pattern: /permission denied/i, retryable: false, delay: 0 },
  { pattern: /unauthorized/i, retryable: false, delay: 0 },
  { pattern: /forbidden/i, retryable: false, delay: 0 },
  { pattern: /bad request/i, retryable: false, delay: 0 },
  { pattern: /malformed/i, retryable: false, delay: 0 },

  // Retryable patterns
  { pattern: /timeout/i, retryable: true, delay: 10000 },
  { pattern: /timed out/i, retryable: true, delay: 10000 },
  { pattern: /connection.*reset/i, retryable: true, delay: 10000 },
  { pattern: /temporarily unavailable/i, retryable: true, delay: 10000 },
  { pattern: /service unavailable/i, retryable: true, delay: 10000 },
  { pattern: /internal server error/i, retryable: true, delay: 10000 }
];

// =============================================================================
// DEFAULT CLASSIFICATIONS
// =============================================================================

/**
 * Default classification for unknown errors (conservative: non-retryable)
 */
const DEFAULT_CLASSIFICATION = {
  retryable: false,
  category: ErrorCategory.NON_RETRYABLE,
  reason: 'Unknown error type - treating as non-retryable for safety'
};

// =============================================================================
// CLASSIFICATION FUNCTIONS
// =============================================================================

/**
 * Classify error by error code lookup.
 *
 * @param {string} errorCode - The error code to classify
 * @returns {{retryable: boolean, category: string, reason: string, delay?: number} | null}
 * @private
 */
function classifyByErrorCode(errorCode) {
  const config = ERROR_CODE_CONFIG[errorCode];
  if (!config) return null;

  const result = {
    retryable: config.retryable,
    category: config.retryable ? ErrorCategory.RETRYABLE : ErrorCategory.NON_RETRYABLE,
    reason: `Error code ${errorCode} indicates a ${config.retryable ? 'transient' : 'permanent'} failure`
  };

  if (config.retryable && config.delay > 0) {
    result.delay = config.delay;
  }

  return result;
}

/**
 * Classify error by HTTP status code.
 *
 * @param {number} status - The HTTP status code
 * @returns {{retryable: boolean, category: string, reason: string, delay?: number} | null}
 * @private
 */
function classifyByHttpStatus(status) {
  // Check specific retryable 4xx codes first
  if (HTTP_STATUS_CONFIG.RETRYABLE_4XX[status]) {
    return {
      retryable: true,
      category: ErrorCategory.RETRYABLE,
      reason: `HTTP ${status} is retryable`,
      delay: HTTP_STATUS_CONFIG.RETRYABLE_4XX[status]
    };
  }

  // General 4xx errors are non-retryable (client errors)
  if (status >= HTTP_STATUS_CONFIG.CLIENT_ERROR_MIN &&
      status <= HTTP_STATUS_CONFIG.CLIENT_ERROR_MAX) {
    return {
      retryable: false,
      category: ErrorCategory.NON_RETRYABLE,
      reason: `HTTP ${status} indicates a client error`
    };
  }

  // 5xx errors are retryable (server errors)
  if (status >= HTTP_STATUS_CONFIG.SERVER_ERROR_MIN &&
      status <= HTTP_STATUS_CONFIG.SERVER_ERROR_MAX) {
    return {
      retryable: true,
      category: ErrorCategory.RETRYABLE,
      reason: `HTTP ${status} indicates a server error`,
      delay: HTTP_STATUS_CONFIG.SERVER_ERROR_DELAY
    };
  }

  return null;
}

/**
 * Classify error by message pattern matching.
 *
 * @param {string} message - The error message
 * @returns {{retryable: boolean, category: string, reason: string, delay?: number} | null}
 * @private
 */
function classifyByMessagePattern(message) {
  for (const config of MESSAGE_PATTERNS) {
    if (config.pattern.test(message)) {
      const result = {
        retryable: config.retryable,
        category: config.retryable ? ErrorCategory.RETRYABLE : ErrorCategory.NON_RETRYABLE,
        reason: `Error message matches ${config.retryable ? 'retryable' : 'non-retryable'} pattern: ${config.pattern}`
      };

      if (config.retryable && config.delay > 0) {
        result.delay = config.delay;
      }

      return result;
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
 * 3. Message patterns - regex matching
 * 4. Default (lowest priority) - non-retryable for safety
 *
 * @param {Error} error - The error to classify
 * @returns {{retryable: boolean, category: string, reason: string, delay?: number}}
 */
export function classifyError(error) {
  // Priority 1: Check error code
  if (error.code) {
    const codeClassification = classifyByErrorCode(error.code);
    if (codeClassification) return codeClassification;
  }

  // Priority 2: Check HTTP status code
  const status = error.status || error.statusCode;
  if (status) {
    const httpClassification = classifyByHttpStatus(status);
    if (httpClassification) return httpClassification;
  }

  // Priority 3: Check error message patterns
  const message = error.message || '';
  if (message) {
    const messageClassification = classifyByMessagePattern(message);
    if (messageClassification) return messageClassification;
  }

  // Priority 4: Default classification
  return DEFAULT_CLASSIFICATION;
}

/**
 * Check if an error is retryable.
 *
 * @param {Error} error - The error to check
 * @returns {boolean} - True if error is retryable
 */
export function isRetryable(error) {
  return classifyError(error).retryable;
}

/**
 * Get recommended retry delay for an error.
 *
 * @param {Error} error - The error
 * @returns {number} - Delay in milliseconds (default: 5000)
 */
export function getRetryDelay(error) {
  const classification = classifyError(error);
  return classification.delay || 5000;
}

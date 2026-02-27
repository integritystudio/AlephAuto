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

import { RETRY } from '../../core/constants.ts';

/**
 * HTTP Error with status code
 */
export interface HTTPError extends Error {
  statusCode?: number;
  status?: number;
}

/**
 * Combined error type with all possible properties
 */
export interface ExtendedError extends Error {
  code?: string | number;
  errno?: number | string;
  syscall?: string;
  path?: string;
  stdout?: string;
  stderr?: string;
  statusCode?: number;
  status?: number;
  response?: {
    status?: number;
    statusText?: string;
    data?: unknown;
  };
}

/**
 * Classified Error with retry information
 */
export interface ClassifiedError extends Error {
  retryable?: boolean;
  classification?: {
    category: 'network' | 'file_system' | 'http' | 'database' | 'unknown';
    retryable: boolean;
    severity: 'low' | 'medium' | 'high';
  };
  statusCode?: number;
  status?: number;
}

export interface ErrorClassification {
  category: string;
  reason: string;
  suggestedDelay: number;
}

interface ErrorCodeConfig {
  retryable: boolean;
  description: string;
  delay: number;
  group: 'filesystem' | 'network' | 'application' | 'http';
}

interface MessagePatternConfig {
  pattern: string;
  retryable: boolean;
  delay: number;
}

/**
 * Error categories
 */
export const ErrorCategory = {
  RETRYABLE: 'retryable',
  NON_RETRYABLE: 'non_retryable'
} as const;

// =============================================================================
// ERROR CODE CONFIGURATION
// =============================================================================

/**
 * Centralized error code configuration.
 * Each error code maps to its classification properties.
 */
const ERROR_CODE_CONFIG: Record<string, ErrorCodeConfig> = {
  // Filesystem errors (non-retryable)
  ENOENT: { retryable: false, description: 'No such file or directory', delay: 0, group: 'filesystem' },
  ENOTDIR: { retryable: false, description: 'Not a directory', delay: 0, group: 'filesystem' },
  EISDIR: { retryable: false, description: 'Is a directory (when file expected)', delay: 0, group: 'filesystem' },
  EACCES: { retryable: false, description: 'Permission denied', delay: 0, group: 'filesystem' },
  EPERM: { retryable: false, description: 'Operation not permitted', delay: 0, group: 'filesystem' },
  EINVAL: { retryable: false, description: 'Invalid argument', delay: 0, group: 'filesystem' },
  EEXIST: { retryable: false, description: 'File already exists', delay: 0, group: 'filesystem' },

  // Network errors - permanent (non-retryable)
  ENOTFOUND: { retryable: false, description: 'DNS resolution failed', delay: 0, group: 'network' },
  ECONNREFUSED: { retryable: false, description: 'Connection refused (server not listening)', delay: 0, group: 'network' },

  // Network errors - transient (retryable)
  ETIMEDOUT: { retryable: true, description: 'Connection timed out', delay: RETRY.SERVER_ERROR_DELAY_MS, group: 'network' },
  ECONNRESET: { retryable: true, description: 'Connection reset by peer', delay: RETRY.NETWORK_ERROR_DELAY_MS, group: 'network' },
  EHOSTUNREACH: { retryable: true, description: 'Host unreachable', delay: RETRY.NETWORK_ERROR_DELAY_MS, group: 'network' },
  ENETUNREACH: { retryable: true, description: 'Network unreachable', delay: RETRY.NETWORK_ERROR_DELAY_MS, group: 'network' },
  EPIPE: { retryable: true, description: 'Broken pipe', delay: RETRY.NETWORK_ERROR_DELAY_MS, group: 'network' },
  EAGAIN: { retryable: true, description: 'Resource temporarily unavailable', delay: RETRY.NETWORK_ERROR_DELAY_MS, group: 'network' },
  EBUSY: { retryable: true, description: 'Resource busy', delay: RETRY.NETWORK_ERROR_DELAY_MS, group: 'network' },

  // Application errors (non-retryable)
  ERR_INVALID_ARG_TYPE: { retryable: false, description: 'Invalid argument type', delay: 0, group: 'application' },
  ERR_INVALID_ARG_VALUE: { retryable: false, description: 'Invalid argument value', delay: 0, group: 'application' },
  ERR_MODULE_NOT_FOUND: { retryable: false, description: 'Module not found', delay: 0, group: 'application' },
  ERR_REQUIRE_ESM: { retryable: false, description: 'Cannot require ESM module', delay: 0, group: 'application' },
  ERR_UNKNOWN_FILE_EXTENSION: { retryable: false, description: 'Unknown file extension', delay: 0, group: 'application' },

  // HTTP error codes (non-retryable client errors)
  ERR_HTTP_400: { retryable: false, description: 'Bad Request', delay: 0, group: 'http' },
  ERR_HTTP_401: { retryable: false, description: 'Unauthorized', delay: 0, group: 'http' },
  ERR_HTTP_403: { retryable: false, description: 'Forbidden', delay: 0, group: 'http' },
  ERR_HTTP_404: { retryable: false, description: 'Not Found', delay: 0, group: 'http' },
  ERR_HTTP_405: { retryable: false, description: 'Method Not Allowed', delay: 0, group: 'http' },
  ERR_HTTP_409: { retryable: false, description: 'Conflict', delay: 0, group: 'http' },
  ERR_HTTP_422: { retryable: false, description: 'Unprocessable Entity', delay: 0, group: 'http' },

  // HTTP error codes (retryable server errors)
  ERR_HTTP_500: { retryable: true, description: 'Internal Server Error', delay: RETRY.SERVER_ERROR_DELAY_MS, group: 'http' },
  ERR_HTTP_502: { retryable: true, description: 'Bad Gateway', delay: RETRY.SERVER_ERROR_DELAY_MS, group: 'http' },
  ERR_HTTP_503: { retryable: true, description: 'Service Unavailable', delay: RETRY.SERVER_ERROR_DELAY_MS, group: 'http' },
  ERR_HTTP_504: { retryable: true, description: 'Gateway Timeout', delay: RETRY.SERVER_ERROR_DELAY_MS, group: 'http' }
};

// =============================================================================
// HTTP STATUS CODE CONFIGURATION
// =============================================================================

const HTTP_STATUS_CONFIG = {
  RATE_LIMIT: 429,
  RATE_LIMIT_DELAY: RETRY.RATE_LIMIT_DELAY_MS,
  CLIENT_ERROR_MIN: 400,
  CLIENT_ERROR_MAX: 499,
  SERVER_ERROR_MIN: 500,
  SERVER_ERROR_MAX: 599,
  SERVER_ERROR_DELAY: RETRY.SERVER_ERROR_DELAY_MS
} as const;

// =============================================================================
// MESSAGE PATTERN CONFIGURATION
// =============================================================================

const MESSAGE_PATTERNS: MessagePatternConfig[] = [
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
  { pattern: 'rate limit', retryable: true, delay: RETRY.RATE_LIMIT_DELAY_MS },
  { pattern: 'too many requests', retryable: true, delay: RETRY.RATE_LIMIT_DELAY_MS },
  { pattern: 'timeout', retryable: true, delay: RETRY.NETWORK_ERROR_DELAY_MS },
  { pattern: 'timed out', retryable: true, delay: RETRY.NETWORK_ERROR_DELAY_MS },
  { pattern: 'connection reset', retryable: true, delay: RETRY.NETWORK_ERROR_DELAY_MS },
  { pattern: 'service unavailable', retryable: true, delay: RETRY.NETWORK_ERROR_DELAY_MS },
  { pattern: 'temporarily unavailable', retryable: true, delay: RETRY.NETWORK_ERROR_DELAY_MS },
  { pattern: 'try again', retryable: true, delay: RETRY.NETWORK_ERROR_DELAY_MS }
];

// =============================================================================
// DEFAULT CLASSIFICATION
// =============================================================================

const DEFAULT_CLASSIFICATION: ErrorClassification = {
  category: ErrorCategory.RETRYABLE,
  reason: 'Unknown error type - defaulting to retryable',
  suggestedDelay: RETRY.DEFAULT_DELAY_MS
};

const NULL_ERROR_CLASSIFICATION: ErrorClassification = {
  category: ErrorCategory.NON_RETRYABLE,
  reason: 'No error provided',
  suggestedDelay: 0
};

// =============================================================================
// CLASSIFICATION FUNCTIONS
// =============================================================================

/**
 * Classify by error code.
 *
 * @param {string} errorCode - The errorCode
 *
 * @returns {ErrorClassification | null} The ErrorClassification | null
 */
function classifyByErrorCode(errorCode: string): ErrorClassification | null {
  const config = ERROR_CODE_CONFIG[errorCode];
  if (!config) return null;

  return {
    category: config.retryable ? ErrorCategory.RETRYABLE : ErrorCategory.NON_RETRYABLE,
    reason: `Error code '${errorCode}' indicates ${config.retryable ? 'transient' : 'permanent'} failure`,
    suggestedDelay: config.delay
  };
}

/**
 * Classify by http status.
 *
 * @param {number} statusCode - The statusCode
 *
 * @returns {ErrorClassification | null} The ErrorClassification | null
 */
function classifyByHttpStatus(statusCode: number): ErrorClassification | null {
  if (statusCode === HTTP_STATUS_CONFIG.RATE_LIMIT) {
    return {
      category: ErrorCategory.RETRYABLE,
      reason: `HTTP ${statusCode} indicates rate limit`,
      suggestedDelay: HTTP_STATUS_CONFIG.RATE_LIMIT_DELAY
    };
  }

  if (statusCode >= HTTP_STATUS_CONFIG.CLIENT_ERROR_MIN &&
      statusCode <= HTTP_STATUS_CONFIG.CLIENT_ERROR_MAX) {
    return {
      category: ErrorCategory.NON_RETRYABLE,
      reason: `HTTP ${statusCode} indicates client error`,
      suggestedDelay: 0
    };
  }

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
 * Classify by message pattern.
 *
 * @param {string} message - The message
 *
 * @returns {ErrorClassification | null} The ErrorClassification | null
 */
function classifyByMessagePattern(message: string): ErrorClassification | null {
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
 * Classify error.
 *
 * @param {Error | null | undefined} error - The error
 *
 * @returns {ErrorClassification} The ErrorClassification
 */
export function classifyError(error: Error | null | undefined): ErrorClassification {
  if (!error) {
    return NULL_ERROR_CLASSIFICATION;
  }

  const extError = error as ExtendedError;
  const errorCode = extError.code ?? extError.errno;
  const httpError = error as HTTPError;
  const statusCode = httpError.statusCode ?? httpError.status;

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
  const errorMessage = error.message?.toLowerCase() ?? '';
  if (errorMessage) {
    const messageClassification = classifyByMessagePattern(errorMessage);
    if (messageClassification) return messageClassification;
  }

  // Priority 4: Default classification
  return DEFAULT_CLASSIFICATION;
}

/**
 * Check if http error.
 *
 * @param {Error} error - The error
 *
 * @returns {error is HTTPError} True if http error, False otherwise
 */
export function isHTTPError(error: Error): error is HTTPError {
  return 'statusCode' in error || 'status' in error;
}

/**
 * Check if classified error.
 *
 * @param {Error} error - The error
 *
 * @returns {error is ClassifiedError} True if classified error, False otherwise
 */
export function isClassifiedError(error: Error): error is ClassifiedError {
  return 'classification' in error && 'retryable' in error;
}

/**
 * Check if retryable.
 *
 * @param {Error} error - The error
 *
 * @returns {boolean} True if retryable, False otherwise
 */
export function isRetryable(error: Error): boolean {
  return classifyError(error).category === ErrorCategory.RETRYABLE;
}

export interface ErrorInfo {
  name: string;
  message: string;
  code: string | number | undefined;
  statusCode: number | undefined;
  category: string;
  reason: string;
  suggestedDelay: number;
  retryable: boolean;
  stack: string | undefined;
  cause: unknown;
}

/**
 * Get the error info.
 *
 * @param {Error} error - The error
 *
 * @returns {ErrorInfo} The error info
 */
export function getErrorInfo(error: Error): ErrorInfo {
  const classification = classifyError(error);
  const extError = error as ExtendedError;
  const httpError = error as HTTPError;

  return {
    name: error.name ?? 'Error',
    message: error.message ?? 'Unknown error',
    code: extError.code ?? extError.errno,
    statusCode: httpError.statusCode ?? httpError.status,
    category: classification.category,
    reason: classification.reason,
    suggestedDelay: classification.suggestedDelay,
    retryable: classification.category === ErrorCategory.RETRYABLE,
    stack: error.stack,
    cause: error.cause
  };
}

/**
 * Get the error category group.
 *
 * @param {Error} error - The error
 *
 * @returns {'network' | 'file_system' | 'http' | 'database' | 'unknown'} The error category group
 */
function getErrorCategoryGroup(error: Error): 'network' | 'file_system' | 'http' | 'database' | 'unknown' {
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
 * Create the scan error.
 *
 * @param {string} message - The message
 * @param {Error} cause - The cause
 *
 * @returns {Error} The created scan error
 */
export function createScanError(message: string, cause: Error): Error {
  const error = new Error(message);
  error.name = 'ScanError';
  error.cause = cause;

  const httpError = error as HTTPError;
  const classifiedError = error as ClassifiedError;

  // Preserve original error properties
  if (cause) {
    const extCause = cause as ExtendedError;
    const httpCause = cause as HTTPError;
    const extError = error as ExtendedError;
    extError.code = extCause.code ?? extCause.errno;
    httpError.statusCode = httpCause.statusCode ?? httpCause.status;
  }

  // Add classification
  const errorToClassify = cause ?? error;
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

/**
 * Error Helper Utilities
 *
 * Provides safe error message extraction and error object conversion
 * to prevent cascading TypeErrors when handling errors.
 *
 * @module lib/utils/error-helpers
 */

/**
 * Safely extracts an error message from any error type
 *
 * @param {Error|string|null|undefined|unknown} error - The error to extract message from
 * @param {string} fallback - Fallback message if error is null/undefined
 * @returns {string} The error message
 *
 * @example
 * safeErrorMessage(new Error('test')) // 'test'
 * safeErrorMessage('string error') // 'string error'
 * safeErrorMessage(null) // 'Unknown error'
 * safeErrorMessage(undefined, 'Custom fallback') // 'Custom fallback'
 */
export function safeErrorMessage(error, fallback = 'Unknown error') {
  // Handle null/undefined
  if (error == null) {
    return fallback;
  }

  // Handle Error objects (standard and custom)
  if (error instanceof Error) {
    return error.message || fallback;
  }

  // Handle error-like objects with message property
  if (typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message || fallback;
  }

  // Handle strings
  if (typeof error === 'string') {
    return error || fallback;
  }

  // Handle primitives and other objects
  try {
    const stringified = String(error);
    // Avoid unhelpful "[object Object]" messages
    if (stringified === '[object Object]') {
      return JSON.stringify(error);
    }
    return stringified;
  } catch {
    return fallback;
  }
}

/**
 * Safely extracts a stack trace from an error
 *
 * @param {Error|unknown} error - The error to extract stack from
 * @returns {string|undefined} The stack trace or undefined
 */
export function safeErrorStack(error) {
  if (error == null) {
    return undefined;
  }

  // Handle Error objects
  if (error instanceof Error && error.stack) {
    return error.stack;
  }

  // Handle error-like objects with stack property
  if (typeof error === 'object' && 'stack' in error && typeof error.stack === 'string') {
    return error.stack;
  }

  return undefined;
}

/**
 * Converts any error type to a structured error object
 *
 * @param {Error|string|null|undefined|unknown} error - The error to convert
 * @param {Object} [options={}] - Conversion options
 * @param {string} [options.fallbackMessage='Unknown error'] - Fallback message for null/undefined errors
 * @param {Object} [options.metadata={}] - Additional metadata to include
 * @returns {Object} Structured error object with message, stack, type, and metadata
 *
 * @example
 * toErrorObject(new Error('test'))
 * // { message: 'test', stack: '...', type: 'Error', isError: true }
 *
 * toErrorObject('string error', { metadata: { jobId: '123' } })
 * // { message: 'string error', type: 'string', isError: false, metadata: { jobId: '123' } }
 */
export function toErrorObject(error, options = {}) {
  const {
    fallbackMessage = 'Unknown error',
    metadata = {}
  } = options;

  const errorObj = {
    message: safeErrorMessage(error, fallbackMessage),
    stack: safeErrorStack(error),
    type: getErrorType(error),
    isError: error instanceof Error,
    metadata
  };

  // Include error name if available
  if (error instanceof Error && error.name) {
    errorObj.name = error.name;
  }

  // Include error code if available (for system errors, etc.)
  if (error && typeof error === 'object' && 'code' in error) {
    errorObj.code = error.code;
  }

  return errorObj;
}

/**
 * Gets the type of an error value
 *
 * @param {unknown} error - The error to get type of
 * @returns {string} The error type
 * @private
 */
function getErrorType(error) {
  if (error == null) {
    return error === null ? 'null' : 'undefined';
  }

  if (error instanceof Error) {
    return error.constructor.name || 'Error';
  }

  return typeof error;
}

/**
 * Checks if a value is an error-like object
 *
 * @param {unknown} value - The value to check
 * @returns {boolean} True if the value is error-like
 *
 * @example
 * isErrorLike(new Error('test')) // true
 * isErrorLike({ message: 'test', stack: '...' }) // true
 * isErrorLike('string error') // false
 * isErrorLike(null) // false
 */
export function isErrorLike(value) {
  if (value instanceof Error) {
    return true;
  }

  if (value && typeof value === 'object') {
    return 'message' in value || 'stack' in value;
  }

  return false;
}

/**
 * Safely serializes an error for logging or transmission
 *
 * @param {Error|unknown} error - The error to serialize
 * @param {boolean} includeStack - Whether to include stack trace (default: true)
 * @returns {Object} Serialized error object
 *
 * @example
 * serializeError(new Error('test'))
 * // { message: 'test', name: 'Error', stack: '...', type: 'Error' }
 */
export function serializeError(error, includeStack = true) {
  const serialized = {
    message: safeErrorMessage(error),
    type: getErrorType(error)
  };

  if (error instanceof Error) {
    serialized.name = error.name;
    if (includeStack && error.stack) {
      serialized.stack = error.stack;
    }
    if (error.cause) {
      serialized.cause = serializeError(error.cause, includeStack);
    }
  }

  // Include code for system errors
  if (error && typeof error === 'object' && 'code' in error) {
    serialized.code = error.code;
  }

  return serialized;
}

/**
 * Creates a formatted error message for display
 *
 * @param {Error|unknown} error - The error to format
 * @param {Object} [options={}] - Formatting options
 * @param {boolean} [options.includeType=false] - Include error type in message
 * @param {boolean} [options.includeCode=false] - Include error code if available
 * @returns {string} Formatted error message
 *
 * @example
 * formatErrorMessage(new Error('test'), { includeType: true })
 * // '[Error] test'
 *
 * formatErrorMessage({ code: 'ENOENT', message: 'File not found' }, { includeCode: true })
 * // '[ENOENT] File not found'
 */
export function formatErrorMessage(error, options = {}) {
  const {
    includeType = false,
    includeCode = false
  } = options;

  const message = safeErrorMessage(error);
  const parts = [];

  if (includeCode && error && typeof error === 'object' && 'code' in error) {
    parts.push(`[${error.code}]`);
  } else if (includeType) {
    parts.push(`[${getErrorType(error)}]`);
  }

  parts.push(message);

  return parts.join(' ');
}

/**
 * Combines multiple errors into a single error message
 *
 * @param {Array<Error|unknown>} errors - Array of errors to combine
 * @param {string} separator - Separator between error messages (default: '; ')
 * @returns {string} Combined error message
 *
 * @example
 * combineErrors([new Error('error 1'), new Error('error 2')])
 * // 'error 1; error 2'
 */
export function combineErrors(errors, separator = '; ') {
  if (!Array.isArray(errors) || errors.length === 0) {
    return 'Unknown error';
  }

  return errors
    .map(error => safeErrorMessage(error))
    .filter(msg => msg && msg !== 'Unknown error')
    .join(separator);
}

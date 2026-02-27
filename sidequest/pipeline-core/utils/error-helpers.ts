/**
 * Error Helper Utilities
 *
 * Provides safe error message extraction and error object conversion
 * to prevent cascading TypeErrors when handling errors.
 *
 * @module lib/utils/error-helpers
 */

interface ToErrorObjectOptions {
  fallbackMessage?: string;
  metadata?: Record<string, unknown>;
}

interface ErrorObject {
  message: string;
  stack: string | undefined;
  type: string;
  isError: boolean;
  metadata: Record<string, unknown>;
  name?: string;
  code?: unknown;
}

interface SerializedError {
  message: string;
  type: string;
  name?: string;
  stack?: string;
  cause?: SerializedError;
  code?: unknown;
}

interface FormatErrorOptions {
  includeType?: boolean;
  includeCode?: boolean;
}

/**
 * Safe error message.
 *
 * @param {unknown} error - The error
 * @param {*} [fallback='Unknown error'] - Fallback value
 *
 * @returns {string} The resulting string
 */
export function safeErrorMessage(error: unknown, fallback = 'Unknown error'): string {
  // Handle null/undefined
  if (error == null) {
    return fallback;
  }

  // Handle Error objects (standard and custom)
  if (error instanceof Error) {
    return error.message || fallback;
  }

  // Handle error-like objects with message property
  if (typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    return (error as { message: string }).message || fallback;
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
 * Safe error stack.
 *
 * @param {unknown} error - The error
 *
 * @returns {string | undefined} The resulting string
 */
export function safeErrorStack(error: unknown): string | undefined {
  if (error == null) {
    return undefined;
  }

  // Handle Error objects
  if (error instanceof Error && error.stack) {
    return error.stack;
  }

  // Handle error-like objects with stack property
  if (typeof error === 'object' && 'stack' in error && typeof (error as { stack: unknown }).stack === 'string') {
    return (error as { stack: string }).stack;
  }

  return undefined;
}

/**
 * To error object.
 *
 * @param {unknown} error - The error
 * @param {ToErrorObjectOptions} [options={}] - Options dictionary
 *
 * @returns {ErrorObject} The ErrorObject
 */
export function toErrorObject(error: unknown, options: ToErrorObjectOptions = {}): ErrorObject {
  const {
    fallbackMessage = 'Unknown error',
    metadata = {}
  } = options;

  const errorObj: ErrorObject = {
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
    errorObj.code = (error as { code: unknown }).code;
  }

  return errorObj;
}

/**
 * Get the error type.
 *
 * @param {unknown} error - The error
 *
 * @returns {string} The error type
 */
function getErrorType(error: unknown): string {
  if (error == null) {
    return error === null ? 'null' : 'undefined';
  }

  if (error instanceof Error) {
    return error.constructor.name || 'Error';
  }

  return typeof error;
}

/**
 * Check if error like.
 *
 * @param {unknown} value - The value
 *
 * @returns {boolean} True if error like, False otherwise
 */
export function isErrorLike(value: unknown): boolean {
  if (value instanceof Error) {
    return true;
  }

  if (value && typeof value === 'object') {
    return 'message' in value || 'stack' in value;
  }

  return false;
}

/**
 * Serialize error.
 *
 * @param {unknown} error - The error
 * @param {*} [includeStack=true] - The includeStack
 *
 * @returns {SerializedError} The SerializedError
 */
export function serializeError(error: unknown, includeStack = true): SerializedError {
  const serialized: SerializedError = {
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
    serialized.code = (error as { code: unknown }).code;
  }

  return serialized;
}

/**
 * Format error message.
 *
 * @param {unknown} error - The error
 * @param {FormatErrorOptions} [options={}] - Options dictionary
 *
 * @returns {string} The resulting string
 */
export function formatErrorMessage(error: unknown, options: FormatErrorOptions = {}): string {
  const {
    includeType = false,
    includeCode = false
  } = options;

  const message = safeErrorMessage(error);
  const parts: string[] = [];

  if (includeCode && error && typeof error === 'object' && 'code' in error) {
    parts.push(`[${(error as { code: unknown }).code}]`);
  } else if (includeType) {
    parts.push(`[${getErrorType(error)}]`);
  }

  parts.push(message);

  return parts.join(' ');
}

/**
 * Combine errors.
 *
 * @param {unknown[]} errors - The errors
 * @param {*} [separator='; '] - The separator
 *
 * @returns {string} The resulting string
 */
export function combineErrors(errors: unknown[], separator = '; '): string {
  if (!Array.isArray(errors) || errors.length === 0) {
    return 'Unknown error';
  }

  return errors
    .map(error => safeErrorMessage(error))
    .filter(msg => msg && msg !== 'Unknown error')
    .join(separator);
}

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
 * Safely extracts an error message from any error type
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
 * Safely extracts a stack trace from an error
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
 * Converts any error type to a structured error object
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
 * Gets the type of an error value
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
 * Checks if a value is an error-like object
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
 * Safely serializes an error for logging or transmission
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
 * Creates a formatted error message for display
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
 * Combines multiple errors into a single error message
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

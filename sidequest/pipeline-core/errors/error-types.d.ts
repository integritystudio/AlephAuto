/**
 * Extended Error type definitions
 *
 * TypeScript's built-in Error type doesn't include common properties
 * that are added by Node.js and other libraries.
 */

/**
 * Node.js system error with code and errno
 */
export interface NodeError extends Error {
  code?: string;
  errno?: number | string;
  syscall?: string;
  path?: string;
}

/**
 * Child process error with stdout/stderr
 */
export interface ProcessError extends Error {
  code?: number | string;
  stdout?: string;
  stderr?: string;
}

/**
 * HTTP error with status code
 */
export interface HTTPError extends Error {
  statusCode?: number;
  status?: number;
  response?: {
    status?: number;
    statusText?: string;
    data?: any;
  };
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
    data?: any;
  };
  cause?: Error;
}

/**
 * Extended Error Types for Error Classification System
 *
 * These types extend the standard Error class with additional properties
 * used for error classification and retry logic.
 */

/**
 * HTTP Error with status code
 */
export interface HTTPError extends Error {
  statusCode?: number;
  status?: number;
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

/**
 * Type guard to check if error has status code
 */
export function isHTTPError(error: Error): error is HTTPError;

/**
 * Type guard to check if error is classified
 */
export function isClassifiedError(error: Error): error is ClassifiedError;

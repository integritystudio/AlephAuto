/**
 * API Error Response Utilities
 *
 * Provides standardized error response format across all API routes.
 * Format: { success: false, error: { code, message }, timestamp }
 */

import { createComponentLogger } from '../../sidequest/utils/logger.js';

const logger = createComponentLogger('ApiError');

/**
 * Standard error codes
 */
export const ERROR_CODES = {
  // Client errors (4xx)
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INVALID_REQUEST: 'INVALID_REQUEST',
  INVALID_STATUS: 'INVALID_STATUS',
  INVALID_JOB_DATA: 'INVALID_JOB_DATA',

  // Server errors (5xx)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',

  // Worker/Pipeline errors
  WORKER_NOT_FOUND: 'WORKER_NOT_FOUND',
  CANCEL_FAILED: 'CANCEL_FAILED',
  MIGRATION_NOT_CONFIGURED: 'MIGRATION_NOT_CONFIGURED'
};

/**
 * API Error class with standardized JSON serialization
 */
export class ApiError extends Error {
  /**
   * @param {string} code - Error code (use ERROR_CODES constants)
   * @param {string} message - Human-readable error message
   * @param {number} status - HTTP status code (default: 400)
   * @param {object} details - Optional additional error details
   */
  constructor(code, message, status = 400, details = null) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
    this.name = 'ApiError';
  }

  /**
   * Convert to standardized JSON response format
   */
  toJSON() {
    const response = {
      success: false,
      error: {
        code: this.code,
        message: this.message
      },
      timestamp: new Date().toISOString()
    };

    // Include additional details if present
    if (this.details) {
      response.error.details = this.details;
    }

    return response;
  }
}

/**
 * Send standardized error response
 *
 * @param {object} res - Express response object
 * @param {string} code - Error code (use ERROR_CODES constants)
 * @param {string} message - Human-readable error message
 * @param {number} status - HTTP status code (default: 400)
 * @param {object} details - Optional additional error details
 * @returns {object} Express response
 */
export function sendError(res, code, message, status = 400, details = null) {
  const response = {
    success: false,
    error: {
      code,
      message
    },
    timestamp: new Date().toISOString()
  };

  // Include additional details if present
  if (details) {
    response.error.details = details;
  }

  logger.debug({ code, message, status, details }, 'Sending error response');

  return res.status(status).json(response);
}

/**
 * Send validation error response
 *
 * @param {object} res - Express response object
 * @param {string} message - Validation error message
 * @param {array} errors - Array of field-level validation errors
 * @returns {object} Express response
 */
export function sendValidationError(res, message, errors = []) {
  return sendError(res, ERROR_CODES.INVALID_REQUEST, message, 400, { errors });
}

/**
 * Send not found error response
 *
 * @param {object} res - Express response object
 * @param {string} resource - Resource type (e.g., 'Job', 'Repository')
 * @param {string} identifier - Resource identifier
 * @returns {object} Express response
 */
export function sendNotFoundError(res, resource, identifier) {
  return sendError(
    res,
    ERROR_CODES.NOT_FOUND,
    `${resource} '${identifier}' not found`,
    404
  );
}

/**
 * Send internal server error response
 *
 * @param {object} res - Express response object
 * @param {string} message - Error message
 * @returns {object} Express response
 */
export function sendInternalError(res, message = 'An internal error occurred') {
  return sendError(res, ERROR_CODES.INTERNAL_ERROR, message, 500);
}

/**
 * API Error Response Utilities
 *
 * Provides standardized error response format across all API routes.
 * Format: { success: false, error: { code, message }, timestamp }
 */

import type { Response } from 'express';
import { createComponentLogger } from '#sidequest/utils/logger.ts';

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
} as const;

/**
 * API Error class with standardized JSON serialization
 */
export class ApiError extends Error {
  code: string;
  status: number;
  details: object | null;

  constructor(code: string, message: string, status = 400, details: object | null = null) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
    this.name = 'ApiError';
  }

  toJSON() {
    const response: { success: false; error: { code: string; message: string; details?: object }; timestamp: string } = {
      success: false,
      error: {
        code: this.code,
        message: this.message
      },
      timestamp: new Date().toISOString()
    };

    if (this.details) {
      response.error.details = this.details;
    }

    return response;
  }
}

/**
 * Send standardized error response
 */
export function sendError(res: Response, code: string, message: string, status = 400, details: object | null = null) {
  const response: { success: false; error: { code: string; message: string; details?: object }; timestamp: string } = {
    success: false,
    error: {
      code,
      message
    },
    timestamp: new Date().toISOString()
  };

  if (details) {
    response.error.details = details;
  }

  logger.debug({ code, message, status, details }, 'Sending error response');

  return res.status(status).json(response);
}

/**
 * Send validation error response
 */
export function sendValidationError(res: Response, message: string, errors: unknown[] = []) {
  return sendError(res, ERROR_CODES.INVALID_REQUEST, message, 400, { errors });
}

/**
 * Send not found error response
 */
export function sendNotFoundError(res: Response, resource: string, identifier: string) {
  return sendError(
    res,
    ERROR_CODES.NOT_FOUND,
    `${resource} '${identifier}' not found`,
    404
  );
}

/**
 * Send internal server error response
 */
export function sendInternalError(res: Response, message = 'An internal error occurred') {
  return sendError(res, ERROR_CODES.INTERNAL_ERROR, message, 500);
}

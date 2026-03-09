/**
 * Error Handler Middleware
 *
 * Centralized error handling for API endpoints.
 */

import type { Request, Response, NextFunction } from 'express';
import { createComponentLogger } from '#sidequest/utils/logger.ts';
import { config } from '#sidequest/core/config.ts';
import * as Sentry from '@sentry/node';
import { HttpStatus } from '../../shared/constants/http-status.ts';

const logger = createComponentLogger('ErrorHandler');

interface ApiError extends Error {
  statusCode?: number;
  status?: number;
  code?: string;
}

const SENSITIVE_KEYS = new Set(['password', 'token', 'secret', 'apiKey', 'api_key', 'authorization', 'x-api-key', 'key', 'credential', 'credentials']);

/**
 * Redacts sensitive keys from request bodies before logging.
 *
 * @param body Request body.
 * @returns Sanitized body with sensitive fields masked.
 */
function sanitizeBody(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  return Object.fromEntries(
    Object.entries(body as Record<string, unknown>).map(([k, v]) =>
      SENSITIVE_KEYS.has(k.toLowerCase()) ? [k, '[REDACTED]'] : [k, v]
    )
  );
}

/**
 * Handles API errors and sends a standardized JSON response.
 *
 * @param err Error object raised by route handlers.
 * @param req Express request.
 * @param res Express response.
 * @param _next Express next callback (unused).
 */
export function errorHandler(err: ApiError, req: Request, res: Response, _next: NextFunction): void {
  // Log error
  logger.error({
    error: err,
    method: req.method,
    path: req.path,
    query: req.query,
    body: sanitizeBody(req.body)
  }, 'API error occurred');

  // Redact sensitive headers before sending to Sentry
  const safeHeaders: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    safeHeaders[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : value;
  }

  // Capture in Sentry
  Sentry.captureException(err, {
    tags: {
      component: 'api',
      method: req.method,
      path: req.path
    },
    contexts: {
      request: {
        method: req.method,
        url: req.url,
        query: req.query,
        headers: safeHeaders
      }
    }
  });

  // Determine status code
  const statusCode = err.statusCode || err.status || HttpStatus.INTERNAL_SERVER_ERROR;

  // Prepare standardized error response
  const errorResponse: {
    success: false;
    error: { code: string; message: string; stack?: string };
    timestamp: string;
  } = {
    success: false,
    error: {
      code: err.code || (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR ? 'INTERNAL_ERROR' : 'BAD_REQUEST'),
      message: err.message || 'An unexpected error occurred'
    },
    timestamp: new Date().toISOString()
  };

  // Include stack trace in development
  if (config.nodeEnv === 'development') {
    errorResponse.error.stack = err.stack;
  }

  // Send error response
  res.status(statusCode).json(errorResponse);
}

/**
 * Error Handler Middleware
 *
 * Centralized error handling for API endpoints.
 */

import type { Request, Response, NextFunction } from 'express';
import { createComponentLogger } from '#sidequest/utils/logger.ts';
import * as Sentry from '@sentry/node';

const logger = createComponentLogger('ErrorHandler');

interface ApiError extends Error {
  statusCode?: number;
  status?: number;
  code?: string;
}

/**
 * Error handler middleware
 */
/**
 * Error handler.
 *
 * @param {ApiError} err - The err
 * @param {Request} req - The request
 * @param {Response} res - The response
 * @param {NextFunction} _next - The  next
 */
export function errorHandler(err: ApiError, req: Request, res: Response, _next: NextFunction): void {
  // Log error
  logger.error({
    error: err,
    method: req.method,
    path: req.path,
    query: req.query,
    body: req.body
  }, 'API error occurred');

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
        headers: req.headers
      }
    }
  });

  // Determine status code
  const statusCode = err.statusCode || err.status || 500;

  // Prepare standardized error response
  const errorResponse: {
    success: false;
    error: { code: string; message: string; stack?: string };
    timestamp: string;
  } = {
    success: false,
    error: {
      code: err.code || (statusCode >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST'),
      message: err.message || 'An unexpected error occurred'
    },
    timestamp: new Date().toISOString()
  };

  // Include stack trace in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error.stack = err.stack;
  }

  // Send error response
  res.status(statusCode).json(errorResponse);
}

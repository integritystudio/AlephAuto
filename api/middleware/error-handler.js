/**
 * Error Handler Middleware
 *
 * Centralized error handling for API endpoints.
 */

import { createComponentLogger } from '../../sidequest/utils/logger.js';
import * as Sentry from '@sentry/node';

const logger = createComponentLogger('ErrorHandler');

/**
 * Error handler middleware
 */
export function errorHandler(err, req, res, next) {
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

  // Prepare error response
  const errorResponse = {
    error: err.name || 'Internal Server Error',
    message: err.message || 'An unexpected error occurred',
    timestamp: new Date().toISOString()
  };

  // Include stack trace in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
  }

  // Send error response
  res.status(statusCode).json(errorResponse);
}

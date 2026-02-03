/**
 * Request Validation Middleware
 *
 * Validates request bodies using Zod schemas and returns detailed error messages.
 */

import { ZodError } from 'zod';
import { createComponentLogger, logError } from '../../../sidequest/utils/logger.js';

const logger = createComponentLogger('ValidationMiddleware');

/**
 * Format Zod validation errors into user-friendly messages
 */
function formatZodErrors(error) {
  return error.errors.map(err => ({
    field: err.path.join('.'),
    message: err.message,
    code: err.code
  }));
}

/**
 * Create validation middleware for a Zod schema
 */
export function validateRequest(schema) {
  return (req, res, next) => {
    try {
      // Validate request body against schema
      const validated = schema.parse(req.body);

      // Replace request body with validated data (type-safe)
      req.body = validated;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = formatZodErrors(error);

        logger.warn({
          path: req.path,
          method: req.method,
          errors
        }, 'Request validation failed');

        // Return standardized validation error
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Request validation failed',
            details: { errors }
          },
          timestamp: new Date().toISOString()
        });
      }

      // Unknown error - pass to error handler
      logError(logger, error, 'Unknown validation error');
      next(error);
    }
  };
}

/**
 * Validate query parameters
 * Stores validated data in req.validatedQuery to avoid read-only req.query
 */
export function validateQuery(schema) {
  return (req, res, next) => {
    try {
      const validated = schema.parse(req.query);
      // Store in custom property since req.query is read-only
      req.validatedQuery = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = formatZodErrors(error);

        logger.warn({
          path: req.path,
          method: req.method,
          errors
        }, 'Query validation failed');

        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Query parameter validation failed',
            details: { errors }
          },
          timestamp: new Date().toISOString()
        });
      }

      next(error);
    }
  };
}

/**
 * Validate path parameters
 */
export function validateParams(schema) {
  return (req, res, next) => {
    try {
      const validated = schema.parse(req.params);
      req.params = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = formatZodErrors(error);

        logger.warn({
          path: req.path,
          method: req.method,
          errors
        }, 'Path parameter validation failed');

        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Path parameter validation failed',
            details: { errors }
          },
          timestamp: new Date().toISOString()
        });
      }

      next(error);
    }
  };
}

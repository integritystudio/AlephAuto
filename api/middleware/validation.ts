/**
 * Request Validation Middleware
 *
 * Validates request bodies using Zod schemas and returns detailed error messages.
 */

import type { Request, Response, NextFunction } from 'express';
import { type ZodSchema, ZodError } from 'zod';
import { createComponentLogger } from '#sidequest/utils/logger.ts';

const logger = createComponentLogger('ValidationMiddleware');

/**
 * Validation error detail
 */
interface ValidationErrorDetail {
  field: string;
  message: string;
  code: string;
}

/**
 * Format Zod validation errors into user-friendly messages
 */
/**
 * Format zod errors.
 *
 * @param {ZodError} error - The error
 *
 * @returns {ValidationErrorDetail[]} The ValidationErrorDetail[]
 */
function formatZodErrors(error: ZodError): ValidationErrorDetail[] {
  return error.errors.map(err => ({
    field: err.path.join('.'),
    message: err.message,
    code: err.code
  }));
}

/**
 * Create validation middleware for a Zod schema
 */
/**
 * Validate request.
 *
 * @param {ZodSchema} schema - The schema
 */
export function validateRequest(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
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

        // Return detailed validation error
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Request validation failed',
          timestamp: new Date().toISOString(),
          errors
        });
      }

      // Unknown error - pass to error handler
      logger.error({ error }, 'Unknown validation error');
      next(error);
    }
  };
}

/**
 * Validate query parameters
 * Stores validated data in req.validatedQuery to avoid read-only req.query
 */
/**
 * Validate query.
 *
 * @param {ZodSchema} schema - The schema
 */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse(req.query);
      // Store in custom property since req.query is read-only
      (req as Request & { validatedQuery: unknown }).validatedQuery = validated;
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
          error: 'Bad Request',
          message: 'Query parameter validation failed',
          timestamp: new Date().toISOString(),
          errors
        });
      }

      next(error);
    }
  };
}

/**
 * Validate path parameters
 */
/**
 * Validate params.
 *
 * @param {ZodSchema} schema - The schema
 */
export function validateParams(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
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
          error: 'Bad Request',
          message: 'Path parameter validation failed',
          timestamp: new Date().toISOString(),
          errors
        });
      }

      next(error);
    }
  };
}

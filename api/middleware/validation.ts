/**
 * Request Validation Middleware
 *
 * Validates request bodies using Zod schemas and returns detailed error messages.
 */

import type { Request, Response, NextFunction } from 'express';
import { type ZodSchema, ZodError } from 'zod';
import { createComponentLogger } from '#sidequest/utils/logger.ts';
import { sendValidationError } from '../utils/api-error.ts';

// Module augmentation for type-safe validated query access
declare global {
  namespace Express {
    interface Request {
      validatedQuery?: unknown;
    }
  }
}

const logger = createComponentLogger('ValidationMiddleware');

/**
 * Structured validation error detail.
 */
interface ValidationErrorDetail {
  field: string;
  message: string;
  code: string;
}

/**
 * Formats Zod errors into API-friendly detail entries.
 *
 * @param error Zod validation error.
 * @returns List of normalized validation errors.
 */
function formatZodErrors(error: ZodError): ValidationErrorDetail[] {
  return error.errors.map(err => ({
    field: err.path.join('.'),
    message: err.message,
    code: err.code
  }));
}

/**
 * Creates middleware that validates `req.body` against a schema.
 *
 * @param schema Zod schema for request body.
 * @returns Express middleware function.
 */
export function validateRequest(schema: ZodSchema): (req: Request, res: Response, next: NextFunction) => void {
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
        return sendValidationError(res, 'Request validation failed', errors);
      }

      // Unknown error - pass to error handler
      logger.error({ error }, 'Unknown validation error');
      next(error);
    }
  };
}

/**
 * Creates middleware that validates query parameters.
 *
 * @param schema Zod schema for query params.
 * @returns Express middleware function.
 */
export function validateQuery(schema: ZodSchema): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse(req.query);
      // Store in typed augmented property since req.query is read-only
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

        return sendValidationError(res, 'Query parameter validation failed', errors);
      }

      next(error);
    }
  };
}

/**
 * Creates middleware that validates route params.
 *
 * @param schema Zod schema for route params.
 * @returns Express middleware function.
 */
export function validateParams(schema: ZodSchema): (req: Request, res: Response, next: NextFunction) => void {
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

        return sendValidationError(res, 'Path parameter validation failed', errors);
      }

      next(error);
    }
  };
}

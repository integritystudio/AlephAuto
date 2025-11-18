/**
 * Request Validation Middleware
 *
 * Validates request bodies using Zod schemas and returns detailed error messages.
 */

// @ts-nocheck
import { ZodError } from 'zod';
import { createComponentLogger } from '../../sidequest/logger.js';
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
        }
        catch (error) {
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
 */
export function validateQuery(schema) {
    return (req, res, next) => {
        try {
            const validated = schema.parse(req.query);
            req.query = validated;
            next();
        }
        catch (error) {
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
export function validateParams(schema) {
    return (req, res, next) => {
        try {
            const validated = schema.parse(req.params);
            req.params = validated;
            next();
        }
        catch (error) {
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

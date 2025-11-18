/**
 * Type Definitions for Scan API Requests/Responses
 *
 * Provides TypeScript types and Zod validation schemas for all scan endpoints.
 */
import { z } from 'zod';
/**
 * Scan Options Schema
 */
export const ScanOptionsSchema = z.object({
    forceRefresh: z.boolean().optional(),
    includeTests: z.boolean().optional(),
    maxDepth: z.number().int().positive().optional(),
    cacheEnabled: z.boolean().optional()
}).strict();
/**
 * Start Scan Request Schema
 */
export const StartScanRequestSchema = z.object({
    repositoryPath: z.string()
        .min(1, 'repositoryPath must not be empty')
        .refine((path) => typeof path === 'string', { message: 'repositoryPath must be a string' }),
    options: ScanOptionsSchema.optional()
}).strict();
/**
 * Scan Response Schema
 */
export const ScanResponseSchema = z.object({
    scanId: z.string(),
    repositoryPath: z.string(),
    status: z.enum(['queued', 'running', 'completed', 'failed']),
    timestamp: z.string().datetime()
});
/**
 * Error Response Schema
 */
export const ErrorResponseSchema = z.object({
    error: z.string(),
    message: z.string(),
    timestamp: z.string().datetime(),
    status: z.number().optional()
});
/**
 * Validation Error Response (extends base error)
 */
export const ValidationErrorResponseSchema = ErrorResponseSchema.extend({
    errors: z.array(z.object({
        field: z.string(),
        message: z.string(),
        code: z.string()
    })).optional()
});
/**
 * Helper function to create validation error response
 */
export function createValidationError(field, message, code = 'VALIDATION_ERROR') {
    return {
        error: 'Bad Request',
        message: `Validation failed: ${message}`,
        timestamp: new Date().toISOString(),
        status: 400,
        errors: [{
                field,
                message,
                code
            }]
    };
}
/**
 * Helper function to create error response
 */
export function createErrorResponse(error, message, status = 500) {
    return {
        error,
        message,
        timestamp: new Date().toISOString(),
        status
    };
}

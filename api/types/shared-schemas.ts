/**
 * Shared API Response Schemas
 *
 * Common error response types used across scan and pipeline routes.
 * Extracted from scan-requests.ts and pipeline-requests.ts to eliminate duplication.
 */

import { z } from 'zod';

export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  timestamp: z.string().datetime(),
  status: z.number().optional()
}).strict();

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export const ValidationErrorDetailSchema = z.object({
  field: z.string(),
  message: z.string(),
  code: z.string()
}).strict();

export type ValidationErrorDetail = z.infer<typeof ValidationErrorDetailSchema>;

export const ValidationErrorResponseSchema = ErrorResponseSchema.extend({
  errors: z.array(ValidationErrorDetailSchema).optional()
}).strict();

export type ValidationErrorResponse = z.infer<typeof ValidationErrorResponseSchema>;

export function createErrorResponse(
  error: string,
  message: string,
  status: number = 500
): ErrorResponse {
  return {
    error,
    message,
    timestamp: new Date().toISOString(),
    status
  };
}

export function createValidationErrorResponse(
  message: string,
  errors?: ValidationErrorDetail[]
): ValidationErrorResponse {
  return {
    error: 'Bad Request',
    message,
    timestamp: new Date().toISOString(),
    status: 400,
    errors
  };
}

export function createValidationError(
  field: string,
  message: string,
  code: string = 'VALIDATION_ERROR'
): ValidationErrorResponse {
  return {
    error: 'Bad Request',
    message: `Validation failed: ${message}`,
    timestamp: new Date().toISOString(),
    status: 400,
    errors: [{ field, message, code }]
  };
}

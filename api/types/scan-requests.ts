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

export type ScanOptions = z.infer<typeof ScanOptionsSchema>;

/**
 * Start Scan Request Schema
 */
export const StartScanRequestSchema = z.object({
  repositoryPath: z.string()
    .min(1, 'repositoryPath must not be empty')
    .refine(
      (path) => typeof path === 'string',
      { message: 'repositoryPath must be a string' }
    ),
  options: ScanOptionsSchema.optional()
}).strict();

export type StartScanRequest = z.infer<typeof StartScanRequestSchema>;

/**
 * Scan Response Schema
 */
export const ScanResponseSchema = z.object({
  scanId: z.string(),
  repositoryPath: z.string(),
  status: z.enum(['queued', 'running', 'completed', 'failed']),
  timestamp: z.string().datetime()
});

export type ScanResponse = z.infer<typeof ScanResponseSchema>;

/**
 * Error Response Schema
 */
export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  timestamp: z.string().datetime(),
  status: z.number().optional()
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/**
 * Validation Error Details
 */
export interface ValidationErrorDetail {
  field: string;
  message: string;
  code: string;
}

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

export type ValidationErrorResponse = z.infer<typeof ValidationErrorResponseSchema>;

/**
 * Helper function to create validation error response
 */
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
    errors: [{
      field,
      message,
      code
    }]
  };
}

/**
 * Scan Results Schema
 */
export const ScanResultsSchema = z.object({
  scanId: z.string(),
  status: z.enum(['queued', 'running', 'completed', 'failed']),
  results: z.object({
    scanType: z.string().optional(),
    totalDuplicates: z.number().optional(),
    duplicates: z.number().optional(),
    crossRepoDuplicates: z.number().optional(),
    totalBlocks: z.number().optional(),
    scanDuration: z.number().optional(),
    suggestions: z.number().optional(),
    repositories: z.array(z.object({
      name: z.string(),
      path: z.string()
    })).optional(),
    reportPath: z.string().optional(),
    prResults: z.any().optional()
  }).optional(),
  error: z.object({
    message: z.string(),
    code: z.string().optional(),
    stack: z.string().optional()
  }).optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  timestamp: z.string().datetime()
});

export type ScanResults = z.infer<typeof ScanResultsSchema>;

/**
 * Helper function to create error response
 */
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

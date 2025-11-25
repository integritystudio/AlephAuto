/**
 * Type Definitions for Pipeline API Requests/Responses
 *
 * Provides TypeScript types and Zod validation schemas for pipeline endpoints.
 * All types are inferred from Zod schemas for single source of truth.
 *
 * @module api/types/pipeline-requests
 */
import { z } from 'zod';
/**
 * Job Status Enum
 * Represents the current state of a job in the pipeline
 */
export const JobStatusSchema = z.enum(['queued', 'running', 'completed', 'failed']);
/**
 * Tab Filter Enum
 * UI tab context for filtering jobs
 */
export const TabFilterSchema = z.enum(['recent', 'failed', 'all']);
/**
 * Job Query Parameters Schema
 * Validates query parameters for GET /api/pipelines/:id/jobs
 */
export const JobQueryParamsSchema = z.object({
    status: JobStatusSchema.optional(),
    limit: z.coerce.number().int().positive().max(100).default(10),
    offset: z.coerce.number().int().min(0).default(0),
    tab: TabFilterSchema.optional()
}).strict();
/**
 * Job Result Schema
 * Represents the result of a completed or failed job
 */
export const JobResultSchema = z.object({
    output: z.string().optional(),
    error: z.string().optional(),
    stats: z.record(z.union([z.string(), z.number(), z.boolean()])).optional()
}).strict();
/**
 * Job Details Schema
 * Complete information about a single job
 */
export const JobDetailsSchema = z.object({
    id: z.string(),
    pipelineId: z.string(),
    status: JobStatusSchema,
    startTime: z.string().datetime(),
    endTime: z.string().datetime().optional(),
    duration: z.number().int().nonnegative().optional(), // milliseconds
    parameters: z.record(z.unknown()).optional(),
    result: JobResultSchema.optional()
}).strict();
/**
 * Jobs List Response Schema
 * Response format for GET /api/pipelines/:id/jobs
 */
export const JobsListResponseSchema = z.object({
    pipelineId: z.string(),
    jobs: z.array(JobDetailsSchema),
    total: z.number().int().nonnegative(),
    hasMore: z.boolean(),
    timestamp: z.string().datetime()
}).strict();
/**
 * Pipeline Status Enum
 * Current operational status of a pipeline
 */
export const PipelineStatusSchema = z.enum(['idle', 'running', 'error', 'completed']);
/**
 * Pipeline Details Schema
 * Metadata for panel header display
 */
export const PipelineDetailsSchema = z.object({
    id: z.string(),
    name: z.string(),
    status: PipelineStatusSchema,
    lastRun: z.string().datetime().nullable(),
    nextRun: z.string().datetime().nullable(),
    activeJobs: z.number().int().nonnegative(),
    completedJobs: z.number().int().nonnegative(),
    failedJobs: z.number().int().nonnegative()
}).strict();
/**
 * Manual Trigger Request Schema
 * Request body for POST /api/pipelines/:id/trigger
 */
export const ManualTriggerRequestSchema = z.object({
    parameters: z.record(z.unknown()).optional()
}).strict();
/**
 * Manual Trigger Response Schema
 * Response format for POST /api/pipelines/:id/trigger
 */
export const ManualTriggerResponseSchema = z.object({
    jobId: z.string(),
    pipelineId: z.string(),
    status: JobStatusSchema,
    timestamp: z.string().datetime()
}).strict();
/**
 * Error Response Schema
 * Standard error response format
 */
export const ErrorResponseSchema = z.object({
    error: z.string(),
    message: z.string(),
    timestamp: z.string().datetime(),
    status: z.number().optional()
}).strict();
/**
 * Validation Error Detail Schema
 * Individual validation error information
 */
export const ValidationErrorDetailSchema = z.object({
    field: z.string(),
    message: z.string(),
    code: z.string()
}).strict();
/**
 * Validation Error Response Schema
 * Extended error response with validation details
 */
export const ValidationErrorResponseSchema = ErrorResponseSchema.extend({
    errors: z.array(ValidationErrorDetailSchema).optional()
}).strict();
/**
 * Helper function to create a standardized error response
 */
export function createErrorResponse(error, message, status) {
    return {
        error,
        message,
        timestamp: new Date().toISOString(),
        status
    };
}
/**
 * Helper function to create a validation error response
 */
export function createValidationErrorResponse(message, errors) {
    return {
        error: 'Bad Request',
        message,
        timestamp: new Date().toISOString(),
        status: 400,
        errors
    };
}
/**
 * Pipeline Documentation Request Schema
 * Path parameters for GET /api/pipelines/:pipelineId/docs
 */
export const PipelineDocsParamsSchema = z.object({
    pipelineId: z.string().min(1)
}).strict();
/**
 * Pipeline Documentation Response Schema
 * Markdown documentation for a specific pipeline
 */
export const PipelineDocsResponseSchema = z.object({
    pipelineId: z.string(),
    name: z.string(),
    markdown: z.string(),
    timestamp: z.string().datetime()
}).strict();
/**
 * Pipeline HTML Report Request Schema
 * Path parameters for GET /api/pipelines/:pipelineId/html
 */
export const PipelineHtmlParamsSchema = z.object({
    pipelineId: z.string().min(1)
}).strict();

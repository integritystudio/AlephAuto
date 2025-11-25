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
export declare const JobStatusSchema: z.ZodEnum<["queued", "running", "completed", "failed"]>;
export type JobStatus = z.infer<typeof JobStatusSchema>;
/**
 * Tab Filter Enum
 * UI tab context for filtering jobs
 */
export declare const TabFilterSchema: z.ZodEnum<["recent", "failed", "all"]>;
export type TabFilter = z.infer<typeof TabFilterSchema>;
/**
 * Job Query Parameters Schema
 * Validates query parameters for GET /api/pipelines/:id/jobs
 */
export declare const JobQueryParamsSchema: z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<["queued", "running", "completed", "failed"]>>;
    limit: z.ZodDefault<z.ZodNumber>;
    offset: z.ZodDefault<z.ZodNumber>;
    tab: z.ZodOptional<z.ZodEnum<["recent", "failed", "all"]>>;
}, "strict", z.ZodTypeAny, {
    offset?: number;
    status?: "failed" | "completed" | "running" | "queued";
    limit?: number;
    tab?: "all" | "failed" | "recent";
}, {
    offset?: number;
    status?: "failed" | "completed" | "running" | "queued";
    limit?: number;
    tab?: "all" | "failed" | "recent";
}>;
export type JobQueryParams = z.infer<typeof JobQueryParamsSchema>;
/**
 * Job Result Schema
 * Represents the result of a completed or failed job
 */
export declare const JobResultSchema: z.ZodObject<{
    output: z.ZodOptional<z.ZodString>;
    error: z.ZodOptional<z.ZodString>;
    stats: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>>;
}, "strict", z.ZodTypeAny, {
    error?: string;
    output?: string;
    stats?: Record<string, string | number | boolean>;
}, {
    error?: string;
    output?: string;
    stats?: Record<string, string | number | boolean>;
}>;
export type JobResult = z.infer<typeof JobResultSchema>;
/**
 * Job Details Schema
 * Complete information about a single job
 */
export declare const JobDetailsSchema: z.ZodObject<{
    id: z.ZodString;
    pipelineId: z.ZodString;
    status: z.ZodEnum<["queued", "running", "completed", "failed"]>;
    startTime: z.ZodString;
    endTime: z.ZodOptional<z.ZodString>;
    duration: z.ZodOptional<z.ZodNumber>;
    parameters: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    result: z.ZodOptional<z.ZodObject<{
        output: z.ZodOptional<z.ZodString>;
        error: z.ZodOptional<z.ZodString>;
        stats: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>>;
    }, "strict", z.ZodTypeAny, {
        error?: string;
        output?: string;
        stats?: Record<string, string | number | boolean>;
    }, {
        error?: string;
        output?: string;
        stats?: Record<string, string | number | boolean>;
    }>>;
}, "strict", z.ZodTypeAny, {
    endTime?: string;
    startTime?: string;
    id?: string;
    status?: "failed" | "completed" | "running" | "queued";
    duration?: number;
    pipelineId?: string;
    parameters?: Record<string, unknown>;
    result?: {
        error?: string;
        output?: string;
        stats?: Record<string, string | number | boolean>;
    };
}, {
    endTime?: string;
    startTime?: string;
    id?: string;
    status?: "failed" | "completed" | "running" | "queued";
    duration?: number;
    pipelineId?: string;
    parameters?: Record<string, unknown>;
    result?: {
        error?: string;
        output?: string;
        stats?: Record<string, string | number | boolean>;
    };
}>;
export type JobDetails = z.infer<typeof JobDetailsSchema>;
/**
 * Jobs List Response Schema
 * Response format for GET /api/pipelines/:id/jobs
 */
export declare const JobsListResponseSchema: z.ZodObject<{
    pipelineId: z.ZodString;
    jobs: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        pipelineId: z.ZodString;
        status: z.ZodEnum<["queued", "running", "completed", "failed"]>;
        startTime: z.ZodString;
        endTime: z.ZodOptional<z.ZodString>;
        duration: z.ZodOptional<z.ZodNumber>;
        parameters: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        result: z.ZodOptional<z.ZodObject<{
            output: z.ZodOptional<z.ZodString>;
            error: z.ZodOptional<z.ZodString>;
            stats: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>>;
        }, "strict", z.ZodTypeAny, {
            error?: string;
            output?: string;
            stats?: Record<string, string | number | boolean>;
        }, {
            error?: string;
            output?: string;
            stats?: Record<string, string | number | boolean>;
        }>>;
    }, "strict", z.ZodTypeAny, {
        endTime?: string;
        startTime?: string;
        id?: string;
        status?: "failed" | "completed" | "running" | "queued";
        duration?: number;
        pipelineId?: string;
        parameters?: Record<string, unknown>;
        result?: {
            error?: string;
            output?: string;
            stats?: Record<string, string | number | boolean>;
        };
    }, {
        endTime?: string;
        startTime?: string;
        id?: string;
        status?: "failed" | "completed" | "running" | "queued";
        duration?: number;
        pipelineId?: string;
        parameters?: Record<string, unknown>;
        result?: {
            error?: string;
            output?: string;
            stats?: Record<string, string | number | boolean>;
        };
    }>, "many">;
    total: z.ZodNumber;
    hasMore: z.ZodBoolean;
    timestamp: z.ZodString;
}, "strict", z.ZodTypeAny, {
    total?: number;
    timestamp?: string;
    pipelineId?: string;
    jobs?: {
        endTime?: string;
        startTime?: string;
        id?: string;
        status?: "failed" | "completed" | "running" | "queued";
        duration?: number;
        pipelineId?: string;
        parameters?: Record<string, unknown>;
        result?: {
            error?: string;
            output?: string;
            stats?: Record<string, string | number | boolean>;
        };
    }[];
    hasMore?: boolean;
}, {
    total?: number;
    timestamp?: string;
    pipelineId?: string;
    jobs?: {
        endTime?: string;
        startTime?: string;
        id?: string;
        status?: "failed" | "completed" | "running" | "queued";
        duration?: number;
        pipelineId?: string;
        parameters?: Record<string, unknown>;
        result?: {
            error?: string;
            output?: string;
            stats?: Record<string, string | number | boolean>;
        };
    }[];
    hasMore?: boolean;
}>;
export type JobsListResponse = z.infer<typeof JobsListResponseSchema>;
/**
 * Pipeline Status Enum
 * Current operational status of a pipeline
 */
export declare const PipelineStatusSchema: z.ZodEnum<["idle", "running", "error", "completed"]>;
export type PipelineStatus = z.infer<typeof PipelineStatusSchema>;
/**
 * Pipeline Details Schema
 * Metadata for panel header display
 */
export declare const PipelineDetailsSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    status: z.ZodEnum<["idle", "running", "error", "completed"]>;
    lastRun: z.ZodNullable<z.ZodString>;
    nextRun: z.ZodNullable<z.ZodString>;
    activeJobs: z.ZodNumber;
    completedJobs: z.ZodNumber;
    failedJobs: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    name?: string;
    id?: string;
    status?: "error" | "completed" | "idle" | "running";
    lastRun?: string;
    nextRun?: string;
    activeJobs?: number;
    completedJobs?: number;
    failedJobs?: number;
}, {
    name?: string;
    id?: string;
    status?: "error" | "completed" | "idle" | "running";
    lastRun?: string;
    nextRun?: string;
    activeJobs?: number;
    completedJobs?: number;
    failedJobs?: number;
}>;
export type PipelineDetails = z.infer<typeof PipelineDetailsSchema>;
/**
 * Manual Trigger Request Schema
 * Request body for POST /api/pipelines/:id/trigger
 */
export declare const ManualTriggerRequestSchema: z.ZodObject<{
    parameters: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strict", z.ZodTypeAny, {
    parameters?: Record<string, unknown>;
}, {
    parameters?: Record<string, unknown>;
}>;
export type ManualTriggerRequest = z.infer<typeof ManualTriggerRequestSchema>;
/**
 * Manual Trigger Response Schema
 * Response format for POST /api/pipelines/:id/trigger
 */
export declare const ManualTriggerResponseSchema: z.ZodObject<{
    jobId: z.ZodString;
    pipelineId: z.ZodString;
    status: z.ZodEnum<["queued", "running", "completed", "failed"]>;
    timestamp: z.ZodString;
}, "strict", z.ZodTypeAny, {
    timestamp?: string;
    status?: "failed" | "completed" | "running" | "queued";
    pipelineId?: string;
    jobId?: string;
}, {
    timestamp?: string;
    status?: "failed" | "completed" | "running" | "queued";
    pipelineId?: string;
    jobId?: string;
}>;
export type ManualTriggerResponse = z.infer<typeof ManualTriggerResponseSchema>;
/**
 * Error Response Schema
 * Standard error response format
 */
export declare const ErrorResponseSchema: z.ZodObject<{
    error: z.ZodString;
    message: z.ZodString;
    timestamp: z.ZodString;
    status: z.ZodOptional<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    error?: string;
    message?: string;
    timestamp?: string;
    status?: number;
}, {
    error?: string;
    message?: string;
    timestamp?: string;
    status?: number;
}>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
/**
 * Validation Error Detail Schema
 * Individual validation error information
 */
export declare const ValidationErrorDetailSchema: z.ZodObject<{
    field: z.ZodString;
    message: z.ZodString;
    code: z.ZodString;
}, "strict", z.ZodTypeAny, {
    code?: string;
    message?: string;
    field?: string;
}, {
    code?: string;
    message?: string;
    field?: string;
}>;
export type ValidationErrorDetail = z.infer<typeof ValidationErrorDetailSchema>;
/**
 * Validation Error Response Schema
 * Extended error response with validation details
 */
export declare const ValidationErrorResponseSchema: z.ZodObject<{
    error: z.ZodString;
    message: z.ZodString;
    timestamp: z.ZodString;
    status: z.ZodOptional<z.ZodNumber>;
} & {
    errors: z.ZodOptional<z.ZodArray<z.ZodObject<{
        field: z.ZodString;
        message: z.ZodString;
        code: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        code?: string;
        message?: string;
        field?: string;
    }, {
        code?: string;
        message?: string;
        field?: string;
    }>, "many">>;
}, "strict", z.ZodTypeAny, {
    error?: string;
    message?: string;
    timestamp?: string;
    status?: number;
    errors?: {
        code?: string;
        message?: string;
        field?: string;
    }[];
}, {
    error?: string;
    message?: string;
    timestamp?: string;
    status?: number;
    errors?: {
        code?: string;
        message?: string;
        field?: string;
    }[];
}>;
export type ValidationErrorResponse = z.infer<typeof ValidationErrorResponseSchema>;
/**
 * Helper function to create a standardized error response
 */
export declare function createErrorResponse(error: string, message: string, status?: number): ErrorResponse;
/**
 * Helper function to create a validation error response
 */
export declare function createValidationErrorResponse(message: string, errors?: ValidationErrorDetail[]): ValidationErrorResponse;
/**
 * Pipeline Documentation Request Schema
 * Path parameters for GET /api/pipelines/:pipelineId/docs
 */
export declare const PipelineDocsParamsSchema: z.ZodObject<{
    pipelineId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    pipelineId?: string;
}, {
    pipelineId?: string;
}>;
export type PipelineDocsParams = z.infer<typeof PipelineDocsParamsSchema>;
/**
 * Pipeline Documentation Response Schema
 * Markdown documentation for a specific pipeline
 */
export declare const PipelineDocsResponseSchema: z.ZodObject<{
    pipelineId: z.ZodString;
    name: z.ZodString;
    markdown: z.ZodString;
    timestamp: z.ZodString;
}, "strict", z.ZodTypeAny, {
    name?: string;
    timestamp?: string;
    pipelineId?: string;
    markdown?: string;
}, {
    name?: string;
    timestamp?: string;
    pipelineId?: string;
    markdown?: string;
}>;
export type PipelineDocsResponse = z.infer<typeof PipelineDocsResponseSchema>;

/**
 * Type Definitions for Report API Requests/Responses
 *
 * Provides TypeScript types and Zod validation schemas for report endpoints.
 */

import { z } from 'zod';

const DECIMAL_RADIX = 10;
const REPORT_QUERY_DEFAULT_LIMIT = 20;
const REPORT_QUERY_MAX_LIMIT = 100;
const REPORT_FORMAT_VALUES = ['html', 'markdown', 'json'] as const;
const REPORT_TYPE_VALUES = ['summary', 'full'] as const;

/**
 * Report Query Schema (GET /api/reports)
 */
export const ReportQuerySchema = z.object({
  limit: z.string()
    .optional()
    .transform((val) => (val ? parseInt(val, DECIMAL_RADIX) : REPORT_QUERY_DEFAULT_LIMIT))
    .pipe(z.number().int().positive().max(REPORT_QUERY_MAX_LIMIT)),
  format: z.enum(REPORT_FORMAT_VALUES).optional(),
  type: z.enum(REPORT_TYPE_VALUES).optional()
}).strict();

export type ReportQuery = z.infer<typeof ReportQuerySchema>;

/**
 * Report Response Schema
 */
export const ReportResponseSchema = z.object({
  name: z.string(),
  url: z.string(),
  size: z.number(),
  created: z.date(),
  modified: z.date(),
  format: z.enum(REPORT_FORMAT_VALUES),
  type: z.enum(REPORT_TYPE_VALUES)
});

export type ReportResponse = z.infer<typeof ReportResponseSchema>;

/**
 * Reports List Response Schema
 */
export const ReportsListResponseSchema = z.object({
  total: z.number(),
  reports: z.array(ReportResponseSchema),
  timestamp: z.string().datetime()
});

export type ReportsListResponse = z.infer<typeof ReportsListResponseSchema>;

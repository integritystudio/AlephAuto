/**
 * Type Definitions for Report API Requests/Responses
 *
 * Provides TypeScript types and Zod validation schemas for report endpoints.
 */

import { z } from 'zod';

/**
 * Report Query Schema (GET /api/reports)
 */
export const ReportQuerySchema = z.object({
  limit: z.string()
    .optional()
    .transform(val => val ? parseInt(val, 10) : 20)
    .pipe(z.number().int().positive().max(100)),
  format: z.enum(['html', 'markdown', 'json']).optional(),
  type: z.enum(['summary', 'full']).optional()
}).strict();

/**
 * Report Response Schema
 */
export const ReportResponseSchema = z.object({
  name: z.string(),
  url: z.string(),
  size: z.number(),
  created: z.date(),
  modified: z.date(),
  format: z.enum(['html', 'markdown', 'json']),
  type: z.enum(['summary', 'full'])
});

/**
 * Reports List Response Schema
 */
export const ReportsListResponseSchema = z.object({
  total: z.number(),
  reports: z.array(ReportResponseSchema),
  timestamp: z.string().datetime()
});

/**
 * Type Definitions for Repository API Requests/Responses
 *
 * Provides TypeScript types and Zod validation schemas for repository endpoints.
 */

import { z } from 'zod';

/**
 * Repository Query Schema (GET /api/repositories)
 */
export const RepositoryQuerySchema = z.object({
  enabled: z.enum(['true', 'false']).optional(),
  priority: z.string().optional(),
  tag: z.string().optional()
}).strict();

export type RepositoryQuery = z.infer<typeof RepositoryQuerySchema>;

/**
 * Repository Group Query Schema (GET /api/repositories/groups)
 */
export const RepositoryGroupQuerySchema = z.object({
  enabled: z.enum(['true', 'false']).optional()
}).strict();

export type RepositoryGroupQuery = z.infer<typeof RepositoryGroupQuerySchema>;

/**
 * Repository Response Schema
 */
export const RepositoryResponseSchema = z.object({
  name: z.string(),
  path: z.string(),
  priority: z.string(),
  scan_frequency: z.string().optional(),
  enabled: z.boolean(),
  last_scanned: z.date().optional(),
  tags: z.array(z.string()),
  scan_history: z.array(z.any())
});

export type RepositoryResponse = z.infer<typeof RepositoryResponseSchema>;

/**
 * Repositories List Response Schema
 */
export const RepositoriesListResponseSchema = z.object({
  total: z.number(),
  repositories: z.array(RepositoryResponseSchema),
  timestamp: z.string().datetime()
});

export type RepositoriesListResponse = z.infer<typeof RepositoriesListResponseSchema>;

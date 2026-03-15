/**
 * Zod schemas for pipeline input validation.
 *
 * Ports Pydantic validation from extract_blocks.py (PatternMatchInput,
 * RepositoryInfoInput, PipelineInput).
 */

import { z } from 'zod';
import { VALIDATION_LIMITS } from '../pipeline-constants.ts';

export const PatternMatchInputSchema = z.object({
  file_path: z
    .string()
    .max(VALIDATION_LIMITS.FILE_PATH_MAX)
    .refine((v) => !v.includes('..'), {
      message: 'Path traversal detected: ".." not allowed in file_path',
    })
    .refine((v) => !v.startsWith('/'), {
      message: 'Absolute paths not allowed in file_path',
    }),
  rule_id: z.string().max(VALIDATION_LIMITS.RULE_ID_MAX),
  matched_text: z.string().max(VALIDATION_LIMITS.MATCHED_TEXT_MAX),
  line_start: z.number().int().min(1).max(VALIDATION_LIMITS.LINE_NUMBER_MAX),
  line_end: z.number().int().min(1).max(VALIDATION_LIMITS.LINE_NUMBER_MAX),
  column_start: z.number().int().min(0).max(VALIDATION_LIMITS.COLUMN_MAX).optional(),
  column_end: z.number().int().min(0).max(VALIDATION_LIMITS.COLUMN_MAX).optional(),
  severity: z.string().max(VALIDATION_LIMITS.SEVERITY_MAX).optional(),
  confidence: z.number().min(0).max(1).optional(),
}).refine((data) => data.line_end >= data.line_start, {
  message: 'line_end must be >= line_start',
  path: ['line_end'],
});

export const RepositoryInfoInputSchema = z.object({
  path: z.string().max(VALIDATION_LIMITS.REPO_PATH_MAX),
  name: z.string().max(VALIDATION_LIMITS.REPO_NAME_MAX).optional(),
  git_remote: z.string().max(VALIDATION_LIMITS.GIT_REMOTE_MAX).optional(),
  git_branch: z.string().max(VALIDATION_LIMITS.GIT_BRANCH_MAX).optional(),
  git_commit: z.string().max(VALIDATION_LIMITS.GIT_COMMIT_MAX).optional(),
});

export const PipelineInputSchema = z.object({
  repository_info: RepositoryInfoInputSchema,
  pattern_matches: z.array(PatternMatchInputSchema).max(VALIDATION_LIMITS.PATTERN_MATCHES_MAX),
  total_repo_lines: z.number().int().min(0).optional(),
}).passthrough();

export type PatternMatchInput = z.infer<typeof PatternMatchInputSchema>;
export type RepositoryInfoInput = z.infer<typeof RepositoryInfoInputSchema>;
export type PipelineInput = z.infer<typeof PipelineInputSchema>;

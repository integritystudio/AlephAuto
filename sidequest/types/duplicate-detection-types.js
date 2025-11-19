/**
 * Type Definitions for Duplicate Detection Worker
 *
 * Comprehensive TypeScript types for the duplicate detection pipeline,
 * including job data, scan results, metrics, and configuration.
 *
 * @module sidequest/types/duplicate-detection-types
 */
import { z } from 'zod';
// ============================================================================
// Scan Types & Enums
// ============================================================================
/**
 * Scan Type Enum
 */
export const ScanTypeSchema = z.enum(['inter-project', 'intra-project']);
/**
 * Scan Frequency Enum
 */
export const ScanFrequencySchema = z.enum(['daily', 'weekly', 'monthly', 'on-demand']);
/**
 * Priority Level Enum
 */
export const PriorityLevelSchema = z.enum(['critical', 'high', 'medium', 'low']);
// ============================================================================
// Job Data Types
// ============================================================================
/**
 * Duplicate Detection Job Data Schema
 */
export const DuplicateDetectionJobDataSchema = z.object({
    type: z.literal('duplicate-detection'),
    scanType: ScanTypeSchema,
    repositories: z.array(z.object({
        name: z.string(),
        path: z.string(),
        enabled: z.boolean(),
        priority: PriorityLevelSchema,
        scanFrequency: ScanFrequencySchema
    })),
    groupName: z.string().optional()
}).strict();
// ============================================================================
// Type Guards
// ============================================================================
/**
 * Type guard for IntraProjectScanResult
 */
export function isIntraProjectScanResult(result) {
    return result.scan_type === 'intra-project';
}
/**
 * Type guard for InterProjectScanResult
 */
export function isInterProjectScanResult(result) {
    return result.scan_type === 'inter-project';
}
/**
 * Type guard for IntraProjectJobResult
 */
export function isIntraProjectJobResult(result) {
    return result.scanType === 'intra-project';
}
/**
 * Type guard for InterProjectJobResult
 */
export function isInterProjectJobResult(result) {
    return result.scanType === 'inter-project';
}

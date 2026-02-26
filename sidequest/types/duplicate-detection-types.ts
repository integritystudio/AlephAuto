/**
 * Type Definitions for Duplicate Detection Worker
 *
 * Comprehensive TypeScript types for the duplicate detection pipeline,
 * including job data, scan results, metrics, and configuration.
 *
 * @module sidequest/types/duplicate-detection-types
 */

import { z } from 'zod';
import type { SidequestServerOptions } from '../core/server.ts';

// ============================================================================
// Scan Types & Enums
// ============================================================================

/**
 * Scan Type Enum
 */
export const ScanTypeSchema = z.enum(['inter-project', 'intra-project']);
export type ScanType = z.infer<typeof ScanTypeSchema>;

/**
 * Scan Frequency Enum
 */
export const ScanFrequencySchema = z.enum(['daily', 'weekly', 'monthly', 'on-demand']);
export type ScanFrequency = z.infer<typeof ScanFrequencySchema>;

/**
 * Priority Level Enum
 */
export const PriorityLevelSchema = z.enum(['critical', 'high', 'medium', 'low']);
export type PriorityLevel = z.infer<typeof PriorityLevelSchema>;

// ============================================================================
// Repository Configuration Types
// ============================================================================

/**
 * Repository Configuration
 */
export interface RepositoryConfig {
  name: string;
  path: string;
  enabled: boolean;
  priority: PriorityLevel;
  scanFrequency: ScanFrequency;
  lastScanned?: string; // ISO timestamp
  scanHistory?: ScanHistoryEntry[];
}

/**
 * Scan History Entry
 */
export interface ScanHistoryEntry {
  timestamp: string; // ISO timestamp
  status: 'success' | 'failure';
  duration: number; // seconds
  duplicatesFound: number;
}

/**
 * Repository Group Configuration
 */
export interface RepositoryGroupConfig {
  name: string;
  description?: string;
  enabled: boolean;
  scanType: 'inter-project';
  repositories: string[]; // Repository names
}

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

export type DuplicateDetectionJobData = z.infer<typeof DuplicateDetectionJobDataSchema>;

// ============================================================================
// Scan Result Types
// ============================================================================

/**
 * Scan Metadata
 */
export interface ScanMetadata {
  scan_started: string; // ISO timestamp
  scan_completed: string; // ISO timestamp
  duration_seconds: number;
  total_files_scanned: number;
  scan_type: ScanType;
}

/**
 * Scan Metrics
 */
export interface ScanMetrics {
  total_duplicate_groups?: number;
  total_cross_repository_groups?: number;
  total_suggestions: number;
  high_impact_duplicates: number;
}

/**
 * Duplicate Group
 */
export interface DuplicateGroup {
  group_id: string;
  instances: Array<{
    file_path: string;
    start_line: number;
    end_line: number;
    repository?: string;
  }>;
  impact_score: number;
  similarity_score: number;
  suggestion?: string;
}

/**
 * Scan Result (Intra-Project)
 */
export interface IntraProjectScanResult {
  scan_type: 'intra-project';
  scan_metadata: ScanMetadata;
  metrics: ScanMetrics;
  duplicate_groups: DuplicateGroup[];
  suggestions?: string[];
}

/**
 * Scan Result (Inter-Project)
 */
export interface InterProjectScanResult {
  scan_type: 'inter-project';
  scan_metadata: ScanMetadata;
  metrics: ScanMetrics;
  cross_repository_duplicates: DuplicateGroup[];
  suggestions?: string[];
}

/**
 * Union type for all scan results
 */
export type ScanResult = IntraProjectScanResult | InterProjectScanResult;

// ============================================================================
// PR Creation Types
// ============================================================================

/**
 * PR Creation Result
 */
export interface PRCreationResult {
  prsCreated: number;
  prUrls: string[];
  errors: Array<{
    repository?: string;
    error: string;
  }>;
}

// ============================================================================
// Job Result Types
// ============================================================================

/**
 * Intra-Project Job Result
 */
export interface IntraProjectJobResult {
  scanType: 'intra-project';
  repository: string;
  duplicates: number;
  suggestions: number;
  duration: number; // seconds
  prResults?: {
    prsCreated: number;
    prUrls: string[];
    errors: number;
  } | null;
}

/**
 * Inter-Project Job Result
 */
export interface InterProjectJobResult {
  scanType: 'inter-project';
  repositories: number;
  crossRepoDuplicates: number;
  suggestions: number;
  duration: number; // seconds
}

/**
 * Union type for all job results
 */
export type JobResult = IntraProjectJobResult | InterProjectJobResult;

// ============================================================================
// Metrics Types
// ============================================================================

/**
 * Worker Scan Metrics
 */
export interface WorkerScanMetrics {
  totalScans: number;
  successfulScans: number;
  failedScans: number;
  totalDuplicatesFound: number;
  totalSuggestionsGenerated: number;
  highImpactDuplicates: number;
  prsCreated: number;
  prCreationErrors: number;
}

/**
 * Retry Information
 */
export interface RetryInfo {
  attempts: number;
  lastAttempt: number; // timestamp
  maxAttempts: number;
  delay: number; // milliseconds
}

/**
 * Retry Metrics
 */
export interface RetryMetrics {
  activeRetries: number;
  totalRetryAttempts: number;
  jobsBeingRetried: Array<{
    jobId: string;
    attempts: number;
    maxAttempts: number;
    lastAttempt: string; // ISO timestamp
  }>;
  retryDistribution: {
    attempt1: number;
    attempt2: number;
    attempt3Plus: number;
    nearingLimit: number; // 3+ attempts
  };
}

/**
 * Complete Scan Metrics (includes queue and retry metrics)
 */
export interface CompleteScanMetrics extends WorkerScanMetrics {
  queueStats: {
    queued: number;
    active: number;
    completed: number;
    failed: number;
  };
  retryMetrics: RetryMetrics;
}

// ============================================================================
// Worker Options Types
// ============================================================================

/**
 * Duplicate Detection Worker Options
 * maxConcurrentScans maps to SidequestServerOptions.maxConcurrent in the constructor.
 */
export interface DuplicateDetectionWorkerOptions extends SidequestServerOptions {
  maxConcurrentScans?: number;
  configPath?: string;
  enablePRCreation?: boolean;
  baseBranch?: string;
  branchPrefix?: string;
  dryRun?: boolean;
  maxSuggestionsPerPR?: number;
}

// ============================================================================
// Event Payload Types
// ============================================================================

/**
 * Initialized Event Payload
 */
export interface InitializedEventPayload {
  totalRepositories: number;
  enabledRepositories: number;
  groups: number;
  byPriority: Record<PriorityLevel, number>;
  byFrequency: Record<ScanFrequency, number>;
}

/**
 * Pipeline Status Event Payload
 */
export type PipelineStatusEventPayload =
  | { status: 'initialized'; stats: InitializedEventPayload }
  | { status: 'scanning'; jobId: string; scanType: ScanType; repositories: number }
  | { status: 'failed'; jobId: string; error: string }
  | { status: 'completed'; jobId: string; result: JobResult };

/**
 * Scan Completed Event Payload
 */
export interface ScanCompletedEventPayload {
  jobId: string;
  scanType: ScanType;
  metrics: {
    duplicates: number;
    suggestions: number;
    duration: number;
  };
}

/**
 * PR Created Event Payload
 */
export interface PRCreatedEventPayload {
  repository: string;
  prsCreated: number;
  prUrls: string[];
}

/**
 * PR Failed Event Payload
 */
export interface PRFailedEventPayload {
  repository: string;
  error: string;
}

/**
 * High Impact Detected Event Payload
 */
export interface HighImpactDetectedEventPayload {
  count: number;
  threshold: number;
  topImpactScore: number;
}

/**
 * Retry Event Payloads
 */
export interface RetryScheduledEventPayload {
  jobId: string;
  attempt: number;
  delay: number;
}

export interface RetryWarningEventPayload {
  jobId: string;
  attempts: number;
  maxAttempts: number;
}

export interface RetryCircuitBreakerEventPayload {
  jobId: string;
  attempts: number;
  maxAbsolute: number;
}

export interface MetricsUpdatedEventPayload {
  metrics: CompleteScanMetrics;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Scan Configuration
 */
export interface ScanConfig {
  enabled: boolean;
  retryAttempts: number;
  retryDelay: number; // milliseconds
  maxConcurrentScans: number;
}

/**
 * Notification Settings
 */
export interface NotificationSettings {
  enabled: boolean;
  onHighImpactDuplicates: boolean;
  highImpactThreshold: number;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for IntraProjectScanResult
 */
export function isIntraProjectScanResult(result: ScanResult): result is IntraProjectScanResult {
  return result.scan_type === 'intra-project';
}

/**
 * Type guard for InterProjectScanResult
 */
export function isInterProjectScanResult(result: ScanResult): result is InterProjectScanResult {
  return result.scan_type === 'inter-project';
}

/**
 * Type guard for IntraProjectJobResult
 */
export function isIntraProjectJobResult(result: JobResult): result is IntraProjectJobResult {
  return result.scanType === 'intra-project';
}

/**
 * Type guard for InterProjectJobResult
 */
export function isInterProjectJobResult(result: JobResult): result is InterProjectJobResult {
  return result.scanType === 'inter-project';
}

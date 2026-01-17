import { EventEmitter } from 'events';

/**
 * Job status type
 */
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';

/**
 * Git workflow metadata for a job
 */
export interface JobGitMetadata {
  branchName: string | null;
  originalBranch: string | null;
  commitSha: string | null;
  prUrl: string | null;
  changedFiles: string[];
}

/**
 * Job error information
 */
export interface JobError {
  message: string;
  stack?: string;
  code?: string;
}

/**
 * Job structure
 */
export interface Job {
  id: string;
  status: JobStatus;
  data: Record<string, any>;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  error: JobError | null;
  result: any;
  git: JobGitMetadata;
}

/**
 * Job statistics returned by getStats()
 */
export interface JobStats {
  total: number;
  queued: number;
  active: number;
  completed: number;
  failed: number;
}

/**
 * Constructor options for SidequestServer
 */
export interface SidequestServerOptions {
  maxConcurrent?: number;
  logDir?: string;
  autoStart?: boolean;
  gitWorkflowEnabled?: boolean;
  gitBranchPrefix?: string;
  gitBaseBranch?: string;
  gitDryRun?: boolean;
  jobType?: string;
  sentryDsn?: string;
}

/**
 * SidequestServer - Base class for job queue workers
 *
 * Manages job execution with Sentry logging and optional Git workflow.
 * Workers extend this class to implement specific job handlers.
 */
export class SidequestServer extends EventEmitter {
  /** Map of job IDs to job objects */
  jobs: Map<string, Job>;

  /** Array of completed jobs */
  jobHistory: Job[];

  /** Maximum concurrent jobs */
  maxConcurrent: number;

  /** Number of currently active jobs */
  activeJobs: number;

  /** Queue of job IDs waiting to be processed */
  queue: string[];

  /** Log directory path */
  logDir: string;

  /** Whether the server is running */
  isRunning: boolean;

  /** Whether Git workflow is enabled */
  gitWorkflowEnabled: boolean;

  /** Prefix for Git branches */
  gitBranchPrefix: string;

  /** Base Git branch */
  gitBaseBranch: string;

  /** Whether Git operations are in dry-run mode */
  gitDryRun: boolean;

  /** Job type identifier */
  jobType: string;

  constructor(options?: SidequestServerOptions);

  /**
   * Create a new job
   * @param jobId - Unique job identifier
   * @param jobData - Job data/parameters
   * @returns The created job
   */
  createJob(jobId: string, jobData: Record<string, any>): Job;

  /**
   * Process the job queue
   */
  processQueue(): Promise<void>;

  /**
   * Execute a specific job
   * @param jobId - Job ID to execute
   */
  executeJob(jobId: string): Promise<void>;

  /**
   * Job handler - override in subclasses
   * Subclasses can override with their own job type signature
   * @param job - Job to process
   * @returns Job result
   */
  runJobHandler(job: unknown): Promise<unknown>;

  /**
   * Start processing jobs
   */
  start(): void;

  /**
   * Stop processing jobs
   */
  stop(): void;

  /**
   * Log job completion
   * @param job - Completed job
   */
  logJobCompletion(job: Job): Promise<void>;

  /**
   * Log job failure
   * @param job - Failed job
   * @param error - Error that caused the failure
   */
  logJobFailure(job: Job, error: Error): Promise<void>;

  /**
   * Get a job by ID
   * @param jobId - Job ID
   * @returns Job or undefined
   */
  getJob(jobId: string): Job | undefined;

  /**
   * Get all jobs
   * @returns Array of all jobs
   */
  getAllJobs(): Job[];

  /**
   * Get job statistics
   * @returns Job statistics
   */
  getStats(): JobStats;

  /**
   * Cancel a job
   * @param jobId - Job ID to cancel
   * @returns Cancellation result
   */
  cancelJob(jobId: string): { success: boolean; message: string; job?: Job };

  /**
   * Pause a job
   * @param jobId - Job ID to pause
   * @returns Pause result
   */
  pauseJob(jobId: string): { success: boolean; message: string; job?: Job };

  /**
   * Resume a paused job
   * @param jobId - Job ID to resume
   * @returns Resume result
   */
  resumeJob(jobId: string): { success: boolean; message: string; job?: Job };

  // ============================================
  // Optional methods that may exist on subclasses
  // These are checked at runtime with typeof
  // ============================================

  /**
   * Pause the worker (optional - implemented by some workers)
   */
  pause?(): void | Promise<void>;

  /**
   * Resume the worker (optional - implemented by some workers)
   */
  resume?(): void | Promise<void>;

  /**
   * Set paused state (optional - implemented by some workers)
   * @param paused - Whether to pause
   */
  setPaused?(paused: boolean): void;

  /**
   * Schedule a scan (optional - implemented by DuplicateDetectionWorker)
   * @param scanType - Type of scan
   * @param repositories - Repositories to scan
   * @param groupName - Optional group name
   */
  scheduleScan?(scanType: string, repositories: unknown[], groupName?: string | null): void;

  /**
   * Schedule a job (optional - implemented by some workers)
   * @param options - Job options
   */
  scheduleJob?(options: Record<string, unknown>): Job | Promise<Job>;

  /**
   * Add a job (optional - implemented by some workers)
   * @param options - Job options
   */
  addJob?(options: Record<string, unknown>): Job | Promise<Job>;

  /**
   * Generate commit message for Git workflow (optional - implemented by some workers)
   * @protected
   * @param job - Job with result data (subclasses may use their own Job type)
   */
  protected _generateCommitMessage?(job: unknown): Promise<{ title: string; body: string }>;

  /**
   * Generate PR context for Git workflow (optional - implemented by some workers)
   * @protected
   * @param job - Job with result data (subclasses may use their own Job type)
   */
  protected _generatePRContext?(job: unknown): Promise<{ title: string; body: string }>;

  // Event emitter methods inherited from EventEmitter
  on(event: 'job:created', listener: (job: Job) => void): this;
  on(event: 'job:started', listener: (job: Job) => void): this;
  on(event: 'job:completed', listener: (job: Job) => void): this;
  on(event: 'job:failed', listener: (job: Job, error: Error) => void): this;
  on(event: 'job:cancelled', listener: (job: Job) => void): this;
  on(event: 'job:paused', listener: (job: Job) => void): this;
  on(event: 'job:resumed', listener: (job: Job) => void): this;
  on(event: string, listener: (...args: unknown[]) => void): this;

  emit(event: 'job:created', job: Job): boolean;
  emit(event: 'job:started', job: Job): boolean;
  emit(event: 'job:completed', job: Job): boolean;
  emit(event: 'job:failed', job: Job, error: Error): boolean;
  emit(event: 'job:cancelled', job: Job): boolean;
  emit(event: 'job:paused', job: Job): boolean;
  emit(event: 'job:resumed', job: Job): boolean;
  emit(event: string, ...args: unknown[]): boolean;
}

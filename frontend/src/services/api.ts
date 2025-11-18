/**
 * API Service
 * HTTP client for AlephAuto backend API
 *
 * Following AnalyticsBot patterns:
 * - Standard API response types
 * - Error handling
 * - Type-safe responses
 */

import axios, { AxiosError } from 'axios';
import type {
  HealthCheckResponse,
  SystemStatusResponse,
  PipelinesResponse,
  PipelineResponse,
  JobsResponse,
  JobResponse,
  JobLogsResponse,
  TriggerScanRequest,
  TriggerScanResponse,
  RetryMetricsResponse,
  GetJobsParams,
  ApiErrorResponse
} from '../types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

/**
 * Create axios instance with default config
 */
const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Handle API errors
 * @param error Axios error
 * @returns Formatted error response
 */
const handleError = (error: AxiosError): ApiErrorResponse => {
  if (error.response) {
    // Server responded with error status
    const data = error.response.data as any;
    return {
      success: false,
      error: {
        message: data?.error?.message || data?.message || 'An error occurred',
        code: data?.error?.code || `HTTP_${error.response.status}`,
        details: data?.error?.details || data,
      },
      timestamp: new Date().toISOString(),
    };
  } else if (error.request) {
    // Request made but no response
    return {
      success: false,
      error: {
        message: 'No response from server',
        code: 'NETWORK_ERROR',
        details: { originalError: error.message },
      },
      timestamp: new Date().toISOString(),
    };
  } else {
    // Error setting up request
    return {
      success: false,
      error: {
        message: error.message || 'Request failed',
        code: 'REQUEST_ERROR',
      },
      timestamp: new Date().toISOString(),
    };
  }
};

/**
 * API Service
 *
 * Centralized API client for all backend communication.
 */
export const apiService = {
  /**
   * Health Check
   * @returns Health check response
   */
  async getHealth(): Promise<HealthCheckResponse> {
    try {
      const response = await api.get<HealthCheckResponse>('/health');
      return response.data;
    } catch (error) {
      throw handleError(error as AxiosError);
    }
  },

  /**
   * Get System Status
   * @returns System status with job queue metrics
   */
  async getSystemStatus(): Promise<SystemStatusResponse> {
    try {
      const response = await api.get<SystemStatusResponse>('/status');
      return response.data;
    } catch (error) {
      throw handleError(error as AxiosError);
    }
  },

  /**
   * Get All Pipelines
   * @returns Array of pipelines
   */
  async getPipelines(): Promise<PipelinesResponse> {
    try {
      const response = await api.get<PipelinesResponse>('/pipelines');
      return response.data;
    } catch (error) {
      throw handleError(error as AxiosError);
    }
  },

  /**
   * Get Pipeline Status
   * @param pipelineId Pipeline ID
   * @returns Pipeline details
   */
  async getPipelineStatus(pipelineId: string): Promise<PipelineResponse> {
    try {
      const response = await api.get<PipelineResponse>(`/pipelines/${pipelineId}`);
      return response.data;
    } catch (error) {
      throw handleError(error as AxiosError);
    }
  },

  /**
   * Get Jobs
   * @param params Query parameters
   * @returns Paginated jobs list
   */
  async getJobs(params?: GetJobsParams): Promise<JobsResponse> {
    try {
      const response = await api.get<JobsResponse>('/jobs', { params });
      return response.data;
    } catch (error) {
      throw handleError(error as AxiosError);
    }
  },

  /**
   * Get Active Jobs
   * @returns Active jobs list
   */
  async getActiveJobs(): Promise<JobsResponse> {
    return this.getJobs({ status: 'running' as any });
  },

  /**
   * Get Queued Jobs
   * @returns Queued jobs list
   */
  async getQueuedJobs(): Promise<JobsResponse> {
    return this.getJobs({ status: 'queued' as any });
  },

  /**
   * Get Job Details
   * @param jobId Job ID
   * @returns Job details
   */
  async getJobDetails(jobId: string): Promise<JobResponse> {
    try {
      const response = await api.get<JobResponse>(`/jobs/${jobId}`);
      return response.data;
    } catch (error) {
      throw handleError(error as AxiosError);
    }
  },

  /**
   * Get Job Logs
   * @param jobId Job ID
   * @returns Job logs
   */
  async getJobLogs(jobId: string): Promise<JobLogsResponse> {
    try {
      const response = await api.get<JobLogsResponse>(`/jobs/${jobId}/logs`);
      return response.data;
    } catch (error) {
      throw handleError(error as AxiosError);
    }
  },

  /**
   * Cancel Job
   * @param jobId Job ID
   * @returns Response
   */
  async cancelJob(jobId: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await api.post(`/jobs/${jobId}/cancel`);
      return response.data;
    } catch (error) {
      throw handleError(error as AxiosError);
    }
  },

  /**
   * Retry Job
   * @param jobId Job ID
   * @returns Response
   */
  async retryJob(jobId: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await api.post(`/jobs/${jobId}/retry`);
      return response.data;
    } catch (error) {
      throw handleError(error as AxiosError);
    }
  },

  /**
   * Trigger Scan
   * @param request Scan request
   * @returns Scan response with job ID
   */
  async triggerScan(request: TriggerScanRequest): Promise<TriggerScanResponse> {
    try {
      const response = await api.post<TriggerScanResponse>('/scan', request);
      return response.data;
    } catch (error) {
      throw handleError(error as AxiosError);
    }
  },

  /**
   * Get Scan Results
   * @param scanId Scan ID
   * @returns Scan results
   */
  async getScanResults(scanId: string): Promise<any> {
    try {
      const response = await api.get(`/scan/${scanId}`);
      return response.data;
    } catch (error) {
      throw handleError(error as AxiosError);
    }
  },

  /**
   * Get Retry Metrics
   * @returns Retry metrics with circuit breaker status
   */
  async getRetryMetrics(): Promise<RetryMetricsResponse> {
    try {
      const response = await api.get<RetryMetricsResponse>('/metrics/retry');
      return response.data;
    } catch (error) {
      throw handleError(error as AxiosError);
    }
  },
};

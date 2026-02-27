/**
 * JobItem component
 * Displays a single job with status, progress, and actions
 *
 * Following AnalyticsBot patterns:
 * - Helper functions before component
 * - Clean props interface
 * - Card component wrapper
 * - Badge components for status
 * - Accessibility (ARIA, keyboard navigation)
 * - Conditional rendering
 */

import React, { useState } from 'react';
import type { Job } from '../../types';
import { Card, JobStatusBadge, Button } from '../ui';
import './JobItem.css';

interface JobItemProps {
  /** Job data */
  job: Job;
  /** Cancel job click handler */
  onCancel?: (jobId: string) => void;
  /** View logs click handler */
  onViewLogs?: (jobId: string) => void;
  /** Retry job click handler */
  onRetry?: (jobId: string) => void;
}

/**
 * Format elapsed time from start date
 * @param startDate ISO 8601 start date string
 * @returns Human-readable elapsed time
 */
/**
 * Format elapsed.
 *
 * @param {string} startDate - The startDate
 *
 * @returns {string} The resulting string
 */
const formatElapsed = (startDate: string): string => {
  const now = new Date();
  const start = new Date(startDate);
  const seconds = Math.floor((now.getTime() - start.getTime()) / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
};

/**
 * Format duration in milliseconds
 * @param ms Duration in milliseconds
 * @returns Human-readable duration
 */
/**
 * Format duration.
 *
 * @param {number} ms - The ms
 *
 * @returns {string} The resulting string
 */
const formatDuration = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);

  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
};

/**
 * Truncate string to max length
 * @param str String to truncate
 * @param maxLength Maximum length
 * @returns Truncated string
 */
/**
 * Truncate.
 *
 * @param {string} str - The str
 * @param {number} maxLength - The maxLength
 *
 * @returns {string} The resulting string
 */
const truncate = (str: string, maxLength: number): string => {
  if (str.length <= maxLength) return str;
  return `${str.substring(0, maxLength)}...`;
};

/**
 * JobItem Component
 *
 * Displays job status with expandable details and action buttons.
 *
 * @example
 * ```tsx
 * <JobItem
 *   job={job}
 *   onCancel={handleCancel}
 *   onViewLogs={handleViewLogs}
 *   onRetry={handleRetry}
 * />
 * ```
 */
export const JobItem: React.FC<JobItemProps> = ({
  job,
  onCancel,
  onViewLogs,
  onRetry
}) => {
  const [expanded, setExpanded] = useState(false);

  /**
   * Handle toggle.
   */
  const handleToggle = () => {
    setExpanded(!expanded);
  };

  /**
   * Handle key press.
   *
   * @param {React.KeyboardEvent} e - The e
   */
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleToggle();
    }
  };

  /**
   * Handle cancel click.
   *
   * @param {React.MouseEvent} e - The e
   */
  const handleCancelClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onCancel) {
      onCancel(job.id);
    }
  };

  /**
   * Handle view logs click.
   *
   * @param {React.MouseEvent} e - The e
   */
  const handleViewLogsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onViewLogs) {
      onViewLogs(job.id);
    }
  };

  /**
   * Handle retry click.
   *
   * @param {React.MouseEvent} e - The e
   */
  const handleRetryClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRetry) {
      onRetry(job.id);
    }
  };

  return (
    <Card className="job-item" padding="sm">
      <div
        className="job-header"
        onClick={handleToggle}
        onKeyPress={handleKeyPress}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
      >
        <div className="job-header-content">
          <div className="job-info">
            <span className="job-id" title={job.id}>
              {truncate(job.id, 12)}
            </span>
            {job.startedAt && (
              <span className="job-elapsed">
                ({formatElapsed(job.startedAt)})
              </span>
            )}
          </div>
          {job.pipelineName && (
            <span className="job-pipeline">{job.pipelineName}</span>
          )}
        </div>

        <div className="job-header-actions">
          <JobStatusBadge status={job.status} />
          {expanded ? (
            <span className="expand-icon" aria-hidden="true">▲</span>
          ) : (
            <span className="expand-icon" aria-hidden="true">▼</span>
          )}
        </div>
      </div>

      {/* Progress Bar (if running) */}
      {job.status === 'running' && job.progress !== undefined && (
        <div className="job-progress">
          <div className="progress-header">
            <span className="progress-label">Progress</span>
            <span className="progress-percentage">{job.progress}%</span>
          </div>
          <div className="progress-bar-container">
            <div
              className="progress-bar-fill"
              style={{ width: `${job.progress}%` }}
              role="progressbar"
              aria-valuenow={job.progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Job progress: ${job.progress}%`}
            />
          </div>
          {job.currentOperation && (
            <div className="progress-operation">
              {job.currentOperation}
            </div>
          )}
        </div>
      )}

      {/* Expanded Details */}
      {expanded && (
        <div className="job-details">
          {/* Timing */}
          <div className="details-section">
            <div className="detail-item">
              <span className="detail-label">Created:</span>
              <span className="detail-value">{new Date(job.createdAt).toLocaleString()}</span>
            </div>
            {job.startedAt && (
              <div className="detail-item">
                <span className="detail-label">Started:</span>
                <span className="detail-value">{new Date(job.startedAt).toLocaleString()}</span>
              </div>
            )}
            {job.completedAt && (
              <div className="detail-item">
                <span className="detail-label">Completed:</span>
                <span className="detail-value">{new Date(job.completedAt).toLocaleString()}</span>
              </div>
            )}
            {job.duration && (
              <div className="detail-item">
                <span className="detail-label">Duration:</span>
                <span className="detail-value">{formatDuration(job.duration)}</span>
              </div>
            )}
          </div>

          {/* Retry Information */}
          {(job.retryCount !== undefined || job.maxRetries !== undefined) && (
            <div className="details-section">
              <div className="detail-item">
                <span className="detail-label">Retries:</span>
                <span className="detail-value">
                  {job.retryCount ?? 0} / {job.maxRetries ?? 2}
                </span>
              </div>
            </div>
          )}

          {/* Results */}
          {job.results && (
            <div className="details-section">
              <h4 className="details-section-title">Results</h4>
              <div className="results-grid">
                {job.results.filesProcessed !== undefined && (
                  <div className="result-item">
                    <span className="result-value">{job.results.filesProcessed}</span>
                    <span className="result-label">Files Processed</span>
                  </div>
                )}
                {job.results.itemsCreated !== undefined && (
                  <div className="result-item">
                    <span className="result-value">{job.results.itemsCreated}</span>
                    <span className="result-label">Created</span>
                  </div>
                )}
                {job.results.itemsUpdated !== undefined && (
                  <div className="result-item">
                    <span className="result-value">{job.results.itemsUpdated}</span>
                    <span className="result-label">Updated</span>
                  </div>
                )}
                {/* Test Refactor specific results */}
                {job.results.testFiles !== undefined && (
                  <div className="result-item">
                    <span className="result-value">{job.results.testFiles}</span>
                    <span className="result-label">Test Files Analyzed</span>
                  </div>
                )}
                {job.results.generatedFiles && job.results.generatedFiles.length > 0 && (
                  <div className="result-item">
                    <span className="result-value">{job.results.generatedFiles.length}</span>
                    <span className="result-label">Files Generated</span>
                  </div>
                )}
              </div>
              {job.results.summary && (
                <p className="results-summary">{job.results.summary}</p>
              )}

              {/* Test Refactor Generated Files */}
              {job.results.generatedFiles && job.results.generatedFiles.length > 0 && (
                <div className="generated-files-section">
                  <h5 className="subsection-title">Generated Files</h5>
                  <ul className="generated-files-list">
                    {job.results.generatedFiles.map((file, index) => (
                      <li key={index} className="generated-file">{file}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Test Refactor Recommendations */}
              {job.results.recommendations && job.results.recommendations.length > 0 && (
                <div className="recommendations-section">
                  <h5 className="subsection-title">Recommendations</h5>
                  <ul className="recommendations-list">
                    {job.results.recommendations.map((rec, index) => (
                      <li key={index} className="recommendation">{rec}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Test Refactor Pattern Analysis */}
              {job.results.analysis?.patterns && (
                <div className="patterns-section">
                  <h5 className="subsection-title">Pattern Analysis</h5>
                  <div className="patterns-grid">
                    {job.results.analysis.patterns.renderWaitFor > 0 && (
                      <div className="pattern-item">
                        <span className="pattern-value">{job.results.analysis.patterns.renderWaitFor}</span>
                        <span className="pattern-label">Render + WaitFor</span>
                      </div>
                    )}
                    {job.results.analysis.patterns.linkValidation > 0 && (
                      <div className="pattern-item">
                        <span className="pattern-value">{job.results.analysis.patterns.linkValidation}</span>
                        <span className="pattern-label">Link Validations</span>
                      </div>
                    )}
                    {job.results.analysis.patterns.semanticChecks > 0 && (
                      <div className="pattern-item">
                        <span className="pattern-value">{job.results.analysis.patterns.semanticChecks}</span>
                        <span className="pattern-label">Semantic Checks</span>
                      </div>
                    )}
                    {job.results.analysis.patterns.formInteractions > 0 && (
                      <div className="pattern-item">
                        <span className="pattern-value">{job.results.analysis.patterns.formInteractions}</span>
                        <span className="pattern-label">Form Interactions</span>
                      </div>
                    )}
                    {job.results.analysis.patterns.hardcodedStrings.length > 0 && (
                      <div className="pattern-item">
                        <span className="pattern-value">{job.results.analysis.patterns.hardcodedStrings.length}</span>
                        <span className="pattern-label">Hardcoded Strings</span>
                      </div>
                    )}
                    {job.results.analysis.patterns.duplicateAssertions.length > 0 && (
                      <div className="pattern-item">
                        <span className="pattern-value">{job.results.analysis.patterns.duplicateAssertions.length}</span>
                        <span className="pattern-label">Duplicate Assertions</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error Display */}
          {job.error && (
            <div className="error-section" role="alert">
              <h4 className="error-title">Error</h4>
              <div className="error-message">
                <span className="error-icon" aria-hidden="true">⚠️</span>
                <span className="error-text">{job.error}</span>
              </div>
              {job.errorType && (
                <div className="error-type">Type: {job.errorType}</div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="job-actions">
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<span>📄</span>}
              onClick={handleViewLogsClick}
            >
              View Logs
            </Button>
            {job.status === 'running' && onCancel && (
              <Button
                variant="danger"
                size="sm"
                leftIcon={<span>✕</span>}
                onClick={handleCancelClick}
              >
                Cancel
              </Button>
            )}
            {job.status === 'failed' && onRetry && (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<span>↻</span>}
                onClick={handleRetryClick}
              >
                Retry
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
};

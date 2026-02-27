/**
 * PipelineCard component
 * Displays a single pipeline with its status, progress, and metrics
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
import type { Pipeline } from '../../types';
import { Card, PipelineStatusBadge, Button } from '../ui';
import './PipelineCard.css';

interface PipelineCardProps {
  /** Pipeline data */
  pipeline: Pipeline;
  /** View details click handler */
  onView?: (pipelineId: string) => void;
  /** Retry click handler */
  onRetry?: (pipelineId: string) => void;
}

/**
 * Format ISO date to human-readable string
 * @param isoDate ISO 8601 date string
 * @returns Formatted date string
 */
/**
 * Format date.
 *
 * @param {string} isoDate - The isoDate
 *
 * @returns {string} The resulting string
 */
const formatDate = (isoDate: string): string => {
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

/**
 * Format duration in milliseconds to human-readable string
 * @param ms Duration in milliseconds
 * @returns Formatted duration string
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
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
};

/**
 * Format success rate as percentage
 * @param rate Success rate (0-1)
 * @returns Formatted percentage string
 */
/**
 * Format success rate.
 *
 * @param {number} rate - The rate
 *
 * @returns {string} The resulting string
 */
const formatSuccessRate = (rate: number): string => {
  return `${(rate * 100).toFixed(1)}%`;
};

/**
 * PipelineCard Component
 *
 * Displays pipeline status with expandable details, progress tracking,
 * and action buttons.
 *
 * @example
 * ```tsx
 * <PipelineCard
 *   pipeline={pipeline}
 *   onView={handleView}
 *   onRetry={handleRetry}
 * />
 * ```
 */
export const PipelineCard: React.FC<PipelineCardProps> = ({
  pipeline,
  onView,
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
   * Handle view click.
   *
   * @param {React.MouseEvent} e - The e
   */
  const handleViewClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onView) {
      onView(pipeline.id);
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
      onRetry(pipeline.id);
    }
  };

  return (
    <Card
      className="pipeline-card"
      hoverable
      padding="md"
    >
      {/* Header */}
      <div
        className="pipeline-header"
        onClick={handleToggle}
        onKeyPress={handleKeyPress}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
      >
        <div className="pipeline-header-content">
          <span className="pipeline-icon" aria-hidden="true">
            {pipeline.icon}
          </span>
          <div className="pipeline-info">
            <h3 className="pipeline-name">{pipeline.name}</h3>
            {pipeline.description && (
              <p className="pipeline-description">{pipeline.description}</p>
            )}
          </div>
        </div>

        <div className="pipeline-header-actions">
          <PipelineStatusBadge status={pipeline.status} />
          <span className="expand-icon" aria-hidden="true">
            {expanded ? '▲' : '▼'}
          </span>
        </div>
      </div>

      {/* Progress Bar (if running) */}
      {pipeline.status === 'running' && pipeline.progress !== undefined && (
        <div className="pipeline-progress">
          <div className="progress-header">
            <span className="progress-label">Progress</span>
            <span className="progress-percentage">{pipeline.progress}%</span>
          </div>
          <div className="progress-bar-container">
            <div
              className="progress-bar-fill"
              style={{ width: `${pipeline.progress}%` }}
              role="progressbar"
              aria-valuenow={pipeline.progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Pipeline progress: ${pipeline.progress}%`}
            />
          </div>
          {pipeline.currentJob && (
            <div className="progress-job">
              <span className="progress-job-label">Current Job:</span>
              <span className="progress-job-id">{pipeline.currentJob}</span>
            </div>
          )}
        </div>
      )}

      {/* Expanded Details */}
      {expanded && (
        <div className="pipeline-details">
          {/* Timing Information */}
          <div className="details-section">
            <h4 className="details-section-title">Schedule</h4>
            <div className="details-grid">
              {pipeline.nextRun && (
                <div className="detail-item">
                  <span className="detail-label">Next Run:</span>
                  <span className="detail-value">{formatDate(pipeline.nextRun)}</span>
                </div>
              )}
              {pipeline.cronSchedule && (
                <div className="detail-item">
                  <span className="detail-label">Schedule:</span>
                  <span className="detail-value detail-value-mono">{pipeline.cronSchedule}</span>
                </div>
              )}
              {pipeline.lastRunAt && (
                <div className="detail-item">
                  <span className="detail-label">Last Run:</span>
                  <span className="detail-value">{formatDate(pipeline.lastRunAt)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Metrics */}
          {(pipeline.totalJobs !== undefined || pipeline.successRate !== undefined) && (
            <div className="details-section">
              <h4 className="details-section-title">Metrics</h4>
              <div className="metrics-grid">
                {pipeline.totalJobs !== undefined && (
                  <div className="metric-item">
                    <span className="metric-value">{pipeline.totalJobs.toLocaleString()}</span>
                    <span className="metric-label">Total Jobs</span>
                  </div>
                )}
                {pipeline.successRate !== undefined && (
                  <div className="metric-item">
                    <span className="metric-value">{formatSuccessRate(pipeline.successRate)}</span>
                    <span className="metric-label">Success Rate</span>
                  </div>
                )}
                {pipeline.avgExecutionTime !== undefined && (
                  <div className="metric-item">
                    <span className="metric-value">{formatDuration(pipeline.avgExecutionTime)}</span>
                    <span className="metric-label">Avg Duration</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error Display */}
          {pipeline.lastError && (
            <div className="details-section error-section">
              <h4 className="details-section-title">Last Error</h4>
              <div className="error-message" role="alert">
                <span className="error-icon" aria-hidden="true">⚠️</span>
                <span className="error-text">{pipeline.lastError}</span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="details-actions">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleViewClick}
            >
              View Details
            </Button>
            {pipeline.status === 'failed' && onRetry && (
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

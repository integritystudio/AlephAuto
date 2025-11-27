/**
 * Layout component
 * Main dashboard layout with responsive grid
 *
 * Following AnalyticsBot patterns:
 * - Clean component structure
 * - Responsive design
 * - Semantic HTML
 */

import React from 'react';
import type { Pipeline, Job, ActivityItem, SystemStatus } from '../../types';
import { Header } from '../Header';
import { PipelineCard } from '../PipelineCard';
import { JobItem } from '../JobItem';
import { ActivityFeed } from '../ActivityFeed';
import { LoadingOverlay, ErrorMessage } from '../ui';
import './Layout.css';

interface LayoutProps {
  /** System status data */
  systemStatus: SystemStatus;
  /** Array of pipelines */
  pipelines: Pipeline[];
  /** Array of active jobs */
  activeJobs: Job[];
  /** Array of queued jobs */
  queuedJobs: Job[];
  /** Array of activity items */
  activities: ActivityItem[];
  /** Loading state */
  isLoading: boolean;
  /** Error message */
  error: string | null;
  /** Retry handler for errors */
  onRetry?: () => void;
  /** Settings click handler */
  onSettingsClick?: () => void;
  /** Pipeline view handler */
  onPipelineView?: (pipelineId: string) => void;
  /** Pipeline retry handler */
  onPipelineRetry?: (pipelineId: string) => void;
  /** Job cancel handler */
  onJobCancel?: (jobId: string) => void;
  /** Job view logs handler */
  onJobViewLogs?: (jobId: string) => void;
  /** Job retry handler */
  onJobRetry?: (jobId: string) => void;
  /** Activity clear handler */
  onActivityClear?: () => void;
  /** Activity item click handler */
  onActivityItemClick?: (activityId: string) => void;
}

/**
 * Layout Component
 *
 * Main dashboard layout with header and three-column responsive grid.
 * Layout adapts from 3 columns (desktop) → 2 columns (tablet) → 1 column (mobile).
 *
 * @example
 * ```tsx
 * <Layout
 *   systemStatus={systemStatus}
 *   pipelines={pipelines}
 *   activeJobs={activeJobs}
 *   queuedJobs={queuedJobs}
 *   activities={activities}
 *   onSettingsClick={handleSettings}
 * />
 * ```
 */
export const Layout: React.FC<LayoutProps> = ({
  systemStatus,
  pipelines,
  activeJobs,
  queuedJobs,
  activities,
  isLoading,
  error,
  onRetry,
  onSettingsClick,
  onPipelineView,
  onPipelineRetry,
  onJobCancel,
  onJobViewLogs,
  onJobRetry,
  onActivityClear,
  onActivityItemClick
}) => {
  return (
    <div className="dashboard-layout">
      {/* Loading Overlay */}
      <LoadingOverlay show={isLoading} message="Loading dashboard data..." />

      {/* Header */}
      <Header
        systemStatus={systemStatus}
        onSettingsClick={onSettingsClick}
      />

      {/* Main Content */}
      <main className="dashboard-main">
        {/* Error Display */}
        {error && !isLoading && (
          <ErrorMessage
            message={error}
            details="Try starting the backend server with: npm run dashboard"
            onRetry={onRetry}
          />
        )}
        <div className="dashboard-grid">
          {/* Left Column: Pipeline Status */}
          <section className="dashboard-section pipelines-section" aria-labelledby="pipelines-heading">
            <h2 id="pipelines-heading" className="section-title">
              <span className="title-icon" aria-hidden="true">⚙️</span>
              Pipeline Status
            </h2>
            <div className="section-content">
              {pipelines.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-icon" aria-hidden="true">📋</span>
                  <p className="empty-message">No pipelines configured</p>
                </div>
              ) : (
                <div className="pipeline-list">
                  {pipelines.map((pipeline) => (
                    <PipelineCard
                      key={pipeline.id}
                      pipeline={pipeline}
                      onView={onPipelineView}
                      onRetry={onPipelineRetry}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Center Column: Job Queue */}
          <section className="dashboard-section jobs-section" aria-labelledby="jobs-heading">
            <h2 id="jobs-heading" className="section-title">
              <span className="title-icon" aria-hidden="true">📋</span>
              Job Queue
            </h2>
            <div className="section-content">
              {/* Capacity Indicator */}
              <div className="capacity-widget">
                <div className="capacity-header">
                  <span className="capacity-label">Capacity</span>
                  <span className="capacity-value">
                    {systemStatus.activeJobs} / {systemStatus.totalCapacity}
                  </span>
                </div>
                <div className="capacity-bar-container">
                  <div
                    className={`capacity-bar-fill ${
                      systemStatus.activeJobs / systemStatus.totalCapacity > 0.8
                        ? 'capacity-high'
                        : ''
                    }`}
                    style={{
                      width: `${(systemStatus.activeJobs / systemStatus.totalCapacity) * 100}%`
                    }}
                    role="progressbar"
                    aria-valuenow={systemStatus.activeJobs}
                    aria-valuemin={0}
                    aria-valuemax={systemStatus.totalCapacity}
                    aria-label="Job queue capacity"
                  />
                </div>
                <p className="capacity-info">
                  {queuedJobs.length} jobs queued
                </p>
              </div>

              {/* Active Jobs */}
              {activeJobs.length > 0 && (
                <div className="jobs-group">
                  <h3 className="jobs-group-title">Active</h3>
                  <div className="jobs-list">
                    {activeJobs.map((job) => (
                      <JobItem
                        key={job.id}
                        job={job}
                        onCancel={onJobCancel}
                        onViewLogs={onJobViewLogs}
                        onRetry={onJobRetry}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Queued Jobs */}
              {queuedJobs.length > 0 && (
                <div className="jobs-group">
                  <h3 className="jobs-group-title">
                    Queued ({queuedJobs.length})
                  </h3>
                  <div className="jobs-list jobs-list-compact">
                    {queuedJobs.slice(0, 5).map((job, index) => (
                      <div key={job.id} className="queued-job-item">
                        <span className="queued-job-position">#{index + 1}</span>
                        <span className="queued-job-id" title={job.id}>
                          {job.id.substring(0, 12)}...
                        </span>
                        <span className="queued-job-pipeline">{job.pipelineName}</span>
                      </div>
                    ))}
                    {queuedJobs.length > 5 && (
                      <div className="queued-job-more">
                        +{queuedJobs.length - 5} more
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Empty State */}
              {activeJobs.length === 0 && queuedJobs.length === 0 && (
                <div className="empty-state">
                  <span className="empty-icon" aria-hidden="true">✓</span>
                  <p className="empty-message">No active or queued jobs</p>
                </div>
              )}
            </div>
          </section>

          {/* Right Column: Activity Feed */}
          <section className="dashboard-section activity-section" aria-labelledby="activity-heading">
            <ActivityFeed
              activities={activities}
              onClear={onActivityClear}
              onItemClick={onActivityItemClick}
            />
          </section>
        </div>
      </main>
    </div>
  );
};

/**
 * ActivityFeed component
 * Displays recent activity events in a scrollable feed
 *
 * Following AnalyticsBot patterns:
 * - Helper functions before component
 * - Clean props interface
 * - Card component wrapper
 * - Accessibility (ARIA, semantic HTML)
 * - Conditional rendering
 */

import React from 'react';
import type { ActivityItem, ActivityType } from '../../types';
import './ActivityFeed.css';

interface ActivityFeedProps {
  /** Array of activity items */
  activities: ActivityItem[];
  /** Maximum items to display */
  maxItems?: number;
  /** Show clear button */
  showClear?: boolean;
  /** Clear all handler */
  onClear?: () => void;
  /** Activity item click handler */
  onItemClick?: (activityId: string) => void;
}

/**
 * Format relative time from ISO date string
 * @param isoDate ISO 8601 date string
 * @returns Human-readable relative time
 */
/**
 * Format relative time.
 *
 * @param {string} isoDate - The isoDate
 *
 * @returns {string} The resulting string
 */
const formatRelativeTime = (isoDate: string): string => {
  const now = new Date();
  const date = new Date(isoDate);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

/**
 * Get icon for activity type
 * @param type Activity type
 * @returns Icon string
 */
/**
 * Get the activity icon.
 *
 * @param {ActivityType} type - The type
 *
 * @returns {string} The activity icon
 */
const getActivityIcon = (type: ActivityType): string => {
  const icons: Record<ActivityType, string> = {
    started: '▶️',
    completed: '✅',
    failed: '❌',
    queued: '⏱️',
    progress: '🔄',
    retry: '↻',
    cancelled: '⊘'
  };
  return icons[type] || '•';
};

/**
 * Get CSS class for activity type
 * @param type Activity type
 * @returns CSS class name
 */
/**
 * Get the activity class.
 *
 * @param {ActivityType} type - The type
 *
 * @returns {string} The activity class
 */
const getActivityClass = (type: ActivityType): string => {
  const classes: Record<ActivityType, string> = {
    started: 'activity-started',
    completed: 'activity-completed',
    failed: 'activity-failed',
    queued: 'activity-queued',
    progress: 'activity-progress',
    retry: 'activity-retry',
    cancelled: 'activity-cancelled'
  };
  return classes[type] || 'activity-default';
};

/**
 * ActivityFeed Component
 *
 * Displays a scrollable feed of recent activity events with timestamps
 * and optional actions.
 *
 * @example
 * ```tsx
 * <ActivityFeed
 *   activities={activities}
 *   maxItems={50}
 *   onClear={handleClear}
 *   onItemClick={handleItemClick}
 * />
 * ```
 */
export const ActivityFeed: React.FC<ActivityFeedProps> = ({
  activities,
  maxItems = 50,
  showClear = true,
  onClear,
  onItemClick
}) => {
  const displayedActivities = activities.slice(0, maxItems);

  /**
   * Handle item click.
   *
   * @param {string} activityId - The activityId
   */
  const handleItemClick = (activityId: string) => {
    if (onItemClick) {
      onItemClick(activityId);
    }
  };

  /**
   * Handle item key press.
   *
   * @param {React.KeyboardEvent} e - The e
   * @param {string} activityId - The activityId
   */
  const handleItemKeyPress = (e: React.KeyboardEvent, activityId: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleItemClick(activityId);
    }
  };

  /**
   * Handle clear click.
   */
  const handleClearClick = () => {
    if (onClear) {
      onClear();
    }
  };

  return (
    <div className="activity-feed">
      {/* Header */}
      <div className="activity-feed-header">
        <h2 className="activity-feed-title">
          <span className="title-icon" aria-hidden="true">⚡</span>
          Recent Activity
        </h2>
        {showClear && activities.length > 0 && (
          <button
            className="clear-button"
            onClick={handleClearClick}
            aria-label="Clear activity feed"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Activity List */}
      <div className="activity-list" role="feed" aria-label="Activity feed">
        {displayedActivities.length === 0 ? (
          <div className="activity-empty">
            <span className="empty-icon" aria-hidden="true">📭</span>
            <p className="empty-message">No recent activity</p>
          </div>
        ) : (
          displayedActivities.map((activity) => (
            <div
              key={activity.id}
              className={`activity-item ${getActivityClass(activity.type)}`}
              onClick={() => handleItemClick(activity.id)}
              onKeyPress={(e) => handleItemKeyPress(e, activity.id)}
              role="article"
              tabIndex={onItemClick ? 0 : undefined}
              aria-label={`${activity.type} activity: ${activity.message}`}
            >
              {/* Icon and Timeline */}
              <div className="activity-timeline">
                <span className="activity-icon" aria-hidden="true">
                  {getActivityIcon(activity.type)}
                </span>
                <div className="timeline-line" aria-hidden="true" />
              </div>

              {/* Content */}
              <div className="activity-content">
                <div className="activity-header">
                  <span className="activity-pipeline">{activity.pipelineName}</span>
                  <span className="activity-time">
                    {formatRelativeTime(activity.timestamp)}
                  </span>
                </div>
                <p className="activity-message">{activity.message}</p>

                {/* Details */}
                {activity.details && Object.keys(activity.details).length > 0 && (
                  <div className="activity-details">
                    {Object.entries(activity.details).map(([key, value]) => (
                      <span key={key} className="detail-tag">
                        {key}: {String(value)}
                      </span>
                    ))}
                  </div>
                )}

                {/* Actions */}
                {activity.actionable && activity.actionable.length > 0 && (
                  <div className="activity-actions">
                    {activity.actionable.map((action, index) => (
                      <button
                        key={index}
                        className={`action-button action-${action.variant || 'secondary'}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          action.action();
                        }}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {activities.length > maxItems && (
        <div className="activity-feed-footer">
          <p className="footer-message">
            Showing {maxItems} of {activities.length} activities
          </p>
        </div>
      )}
    </div>
  );
};

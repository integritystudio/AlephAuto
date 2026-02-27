/**
 * Header component
 * Top navigation bar with system status and health indicators
 *
 * Following AnalyticsBot patterns:
 * - Helper functions before component
 * - Clean props interface
 * - Accessibility (ARIA labels)
 * - Conditional rendering
 */

import React from 'react';
import type { SystemStatus } from '../../types';
import { SystemHealthBadge, CountBadge } from '../ui';
import './Header.css';

interface HeaderProps {
  /** System status data */
  systemStatus: SystemStatus;
  /** Show settings button */
  showSettings?: boolean;
  /** Settings click handler */
  onSettingsClick?: () => void;
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
 * Calculate capacity utilization percentage
 * @param active Number of active jobs
 * @param total Total capacity
 * @returns Utilization percentage (0-100)
 */
/**
 * Calculate utilization.
 *
 * @param {number} active - Whether active
 * @param {number} total - The total
 *
 * @returns {number} The calculated utilization
 */
const calculateUtilization = (active: number, total: number): number => {
  if (total === 0) return 0;
  return Math.round((active / total) * 100);
};

/**
 * Header Component
 *
 * Displays system status, job queue metrics, and navigation.
 *
 * @example
 * ```tsx
 * <Header
 *   systemStatus={systemStatus}
 *   onSettingsClick={handleSettings}
 * />
 * ```
 */
export const Header: React.FC<HeaderProps> = ({
  systemStatus,
  showSettings = true,
  onSettingsClick
}) => {
  const utilization = calculateUtilization(
    systemStatus.activeJobs,
    systemStatus.totalCapacity
  );

  /**
   * Handle settings click.
   */
  const handleSettingsClick = () => {
    if (onSettingsClick) {
      onSettingsClick();
    }
  };

  /**
   * Handle settings key press.
   *
   * @param {React.KeyboardEvent} e - The e
   */
  const handleSettingsKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSettingsClick();
    }
  };

  return (
    <header className="dashboard-header">
      <div className="header-content">
        {/* Logo and Title */}
        <div className="header-brand">
          <span className="brand-icon" aria-hidden="true">⚙</span>
          <h1 className="brand-title">AlephAuto Dashboard</h1>
        </div>

        {/* System Status */}
        <div className="header-status">
          {/* Health Badge */}
          <div className="status-item">
            <SystemHealthBadge health={systemStatus.health} />
          </div>

          {/* Job Queue Metrics */}
          <div className="status-item">
            <CountBadge
              count={systemStatus.activeJobs}
              label="active"
            />
          </div>

          <div className="status-item">
            <CountBadge
              count={systemStatus.queuedJobs}
              label="queued"
            />
          </div>

          {/* Capacity Indicator */}
          <div className="status-item capacity-indicator">
            <span className="capacity-label">Capacity:</span>
            <span className="capacity-value">
              {systemStatus.activeJobs} / {systemStatus.totalCapacity}
            </span>
            <span
              className={`capacity-bar ${utilization > 80 ? 'capacity-high' : ''}`}
              style={{ width: `${utilization}%` }}
              role="progressbar"
              aria-valuenow={utilization}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="System capacity"
            />
          </div>

          {/* Last Update */}
          <div className="status-item last-update">
            <span className="update-icon" aria-hidden="true">🕐</span>
            <span className="update-text">
              Updated {formatRelativeTime(systemStatus.lastUpdate)}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="header-actions">
          {showSettings && (
            <button
              className="action-button"
              onClick={handleSettingsClick}
              onKeyPress={handleSettingsKeyPress}
              aria-label="Settings"
              title="Settings"
            >
              <span aria-hidden="true">⚙️</span>
            </button>
          )}
        </div>
      </div>

      {/* WebSocket Connection Warning */}
      {!systemStatus.websocketConnected && (
        <div className="connection-warning" role="alert">
          <span className="warning-icon" aria-hidden="true">⚠️</span>
          <div className="warning-content">
            <p className="warning-title">WebSocket Disconnected</p>
            <p className="warning-message">
              Using polling fallback (5s intervals)
            </p>
          </div>
        </div>
      )}

      {/* Circuit Breaker Warning */}
      {systemStatus.circuitBreakerOpen && (
        <div className="circuit-breaker-warning" role="alert">
          <span className="warning-icon" aria-hidden="true">🔴</span>
          <div className="warning-content">
            <p className="warning-title">Circuit Breaker Open</p>
            <p className="warning-message">
              Retry queue has {systemStatus.retryQueueSize} jobs awaiting retry
            </p>
          </div>
        </div>
      )}
    </header>
  );
};

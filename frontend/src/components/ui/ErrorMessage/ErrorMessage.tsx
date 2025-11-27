/**
 * ErrorMessage component
 * Displays error messages with retry functionality
 *
 * Following AnalyticsBot patterns:
 * - Clean component structure
 * - Accessible error display
 * - Optional retry action
 */

import React from 'react';
import { Button } from '../Button';
import './ErrorMessage.css';

export interface ErrorMessageProps {
  /** Error message to display */
  message: string;
  /** Optional retry handler */
  onRetry?: () => void;
  /** Optional additional details */
  details?: string;
}

/**
 * ErrorMessage Component
 *
 * Displays error messages with an optional retry button.
 * Provides clear feedback when operations fail.
 *
 * @example
 * ```tsx
 * <ErrorMessage
 *   message="Failed to connect to API"
 *   details="Please ensure the backend server is running"
 *   onRetry={handleRetry}
 * />
 * ```
 */
export const ErrorMessage: React.FC<ErrorMessageProps> = ({
  message,
  onRetry,
  details
}) => {
  return (
    <div className="error-message-container" role="alert" aria-live="assertive">
      <div className="error-icon" aria-hidden="true">
        ⚠️
      </div>
      <div className="error-content">
        <h3 className="error-title">Error</h3>
        <p className="error-message">{message}</p>
        {details && (
          <p className="error-details">{details}</p>
        )}
        {onRetry && (
          <div className="error-actions">
            <Button
              variant="primary"
              size="sm"
              onClick={onRetry}
              leftIcon={<span>↻</span>}
            >
              Retry
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

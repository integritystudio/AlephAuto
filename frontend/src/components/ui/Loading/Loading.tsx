import React from 'react';

export type SpinnerSize = 'sm' | 'md' | 'lg';

export interface SpinnerProps {
  /** Size of the spinner */
  size?: SpinnerSize;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Spinner Component
 *
 * A loading spinner indicator.
 *
 * @example
 * ```tsx
 * <Spinner />
 * <Spinner size="lg" />
 * ```
 */
export const Spinner: React.FC<SpinnerProps> = ({
  size = 'md',
  className = ''
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  return (
    <div
      className={`${sizeClasses[size]} ${className}`}
      role="status"
      aria-label="Loading"
    >
      <svg
        className="animate-spin text-blue-600"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    </div>
  );
};

export interface LoadingOverlayProps {
  /** Show loading overlay */
  show: boolean;
  /** Message to display */
  message?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Loading Overlay Component
 *
 * A full-screen loading overlay with spinner and optional message.
 *
 * @example
 * ```tsx
 * <LoadingOverlay show={isLoading} message="Loading data..." />
 * ```
 */
export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  show,
  message,
  className = ''
}) => {
  if (!show) return null;

  return (
    <div
      className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 ${className}`}
      role="alert"
      aria-live="assertive"
      aria-busy="true"
    >
      <div className="bg-white rounded-lg p-6 shadow-xl flex flex-col items-center gap-4">
        <Spinner size="lg" />
        {message && (
          <p className="text-gray-700 text-center">{message}</p>
        )}
      </div>
    </div>
  );
};

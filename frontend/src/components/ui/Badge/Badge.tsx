import React from 'react';
import { PipelineStatus, JobStatus, SystemHealth } from '../../../types';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';
export type BadgeSize = 'sm' | 'md' | 'lg';

export interface BadgeProps {
  /** Badge content */
  children: React.ReactNode;
  /** Visual variant */
  variant?: BadgeVariant;
  /** Size */
  size?: BadgeSize;
  /** Additional CSS classes */
  className?: string;
  /** Icon to show before text */
  icon?: React.ReactNode;
}

/**
 * Badge Component
 *
 * A label component for displaying status, counts, or tags.
 *
 * @example
 * ```tsx
 * <Badge variant="success">Active</Badge>
 * <Badge variant="error" icon="✗">Failed</Badge>
 * <Badge size="sm">New</Badge>
 * ```
 */
export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'md',
  className = '',
  icon
}) => {
  const variantClasses = {
    default: 'bg-gray-100 text-gray-800',
    success: 'bg-green-100 text-green-800',
    warning: 'bg-yellow-100 text-yellow-800',
    error: 'bg-red-100 text-red-800',
    info: 'bg-blue-100 text-blue-800'
  };

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
    lg: 'px-3 py-1.5 text-base'
  };

  const classes = [
    'inline-flex items-center gap-1 font-medium rounded-full',
    variantClasses[variant],
    sizeClasses[size],
    className
  ].filter(Boolean).join(' ');

  return (
    <span className={classes}>
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
};

export interface PipelineStatusBadgeProps {
  /** Pipeline status */
  status: PipelineStatus;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Pipeline Status Badge
 *
 * Displays pipeline status with appropriate styling and icon.
 *
 * @example
 * ```tsx
 * <PipelineStatusBadge status={PipelineStatus.RUNNING} />
 * <PipelineStatusBadge status={PipelineStatus.FAILED} />
 * ```
 */
export const PipelineStatusBadge: React.FC<PipelineStatusBadgeProps> = ({
  status,
  className = ''
}) => {
  const config = {
    [PipelineStatus.RUNNING]: {
      variant: 'info' as BadgeVariant,
      icon: '▶',
      label: 'Running'
    },
    [PipelineStatus.IDLE]: {
      variant: 'default' as BadgeVariant,
      icon: '─',
      label: 'Idle'
    },
    [PipelineStatus.QUEUED]: {
      variant: 'warning' as BadgeVariant,
      icon: '↷',
      label: 'Queued'
    },
    [PipelineStatus.FAILED]: {
      variant: 'error' as BadgeVariant,
      icon: '✗',
      label: 'Failed'
    }
  };

  const { variant, icon, label } = config[status];

  return (
    <Badge variant={variant} icon={icon} className={className}>
      {label}
    </Badge>
  );
};

export interface JobStatusBadgeProps {
  /** Job status */
  status: JobStatus;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Job Status Badge
 *
 * Displays job status with appropriate styling and icon.
 *
 * @example
 * ```tsx
 * <JobStatusBadge status={JobStatus.RUNNING} />
 * <JobStatusBadge status={JobStatus.COMPLETED} />
 * ```
 */
export const JobStatusBadge: React.FC<JobStatusBadgeProps> = ({
  status,
  className = ''
}) => {
  const config = {
    [JobStatus.QUEUED]: {
      variant: 'default' as BadgeVariant,
      icon: '⏱',
      label: 'Queued'
    },
    [JobStatus.RUNNING]: {
      variant: 'info' as BadgeVariant,
      icon: '▶',
      label: 'Running'
    },
    [JobStatus.COMPLETED]: {
      variant: 'success' as BadgeVariant,
      icon: '✓',
      label: 'Completed'
    },
    [JobStatus.FAILED]: {
      variant: 'error' as BadgeVariant,
      icon: '✗',
      label: 'Failed'
    },
    [JobStatus.CANCELLED]: {
      variant: 'default' as BadgeVariant,
      icon: '⊘',
      label: 'Cancelled'
    }
  };

  const { variant, icon, label} = config[status];

  return (
    <Badge variant={variant} icon={icon} className={className}>
      {label}
    </Badge>
  );
};

export interface SystemHealthBadgeProps {
  /** System health status */
  health: SystemHealth;
  /** Additional CSS classes */
  className?: string;
}

/**
 * System Health Badge
 *
 * Displays system health with appropriate styling.
 *
 * @example
 * ```tsx
 * <SystemHealthBadge health={SystemHealth.HEALTHY} />
 * <SystemHealthBadge health={SystemHealth.ERROR} />
 * ```
 */
export const SystemHealthBadge: React.FC<SystemHealthBadgeProps> = ({
  health,
  className = ''
}) => {
  const config = {
    [SystemHealth.HEALTHY]: {
      variant: 'success' as BadgeVariant,
      icon: '●',
      label: 'Healthy'
    },
    [SystemHealth.DEGRADED]: {
      variant: 'warning' as BadgeVariant,
      icon: '●',
      label: 'Degraded'
    },
    [SystemHealth.ERROR]: {
      variant: 'error' as BadgeVariant,
      icon: '●',
      label: 'Error'
    }
  };

  const { variant, icon, label } = config[health];

  return (
    <Badge variant={variant} icon={icon} className={className}>
      {label}
    </Badge>
  );
};

export interface CountBadgeProps {
  /** Count to display */
  count: number;
  /** Label for the count */
  label?: string;
  /** Maximum count to display (shows + after) */
  max?: number;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Count Badge
 *
 * Displays a numeric count, useful for showing totals.
 *
 * @example
 * ```tsx
 * <CountBadge count={5} label="active" />
 * <CountBadge count={120} max={99} /> // Shows "99+"
 * ```
 */
export const CountBadge: React.FC<CountBadgeProps> = ({
  count,
  label,
  max,
  className = ''
}) => {
  const displayCount = max && count > max ? `${max}+` : count;

  return (
    <Badge variant="default" className={className}>
      {displayCount}
      {label && ` ${label}`}
    </Badge>
  );
};

/**
 * UI Component Library
 *
 * Consolidated, reusable UI components for the AlephAuto Dashboard.
 * All components follow consistent patterns with TypeScript types and accessibility.
 */

// Button
export { Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';

// Card
export { Card, CardHeader, CardFooter } from './Card';
export type { CardProps, CardHeaderProps, CardFooterProps } from './Card';

// Badge
export {
  Badge,
  PipelineStatusBadge,
  JobStatusBadge,
  SystemHealthBadge,
  CountBadge
} from './Badge';
export type {
  BadgeProps,
  BadgeVariant,
  BadgeSize,
  PipelineStatusBadgeProps,
  JobStatusBadgeProps,
  SystemHealthBadgeProps,
  CountBadgeProps
} from './Badge';

// Loading
export { Spinner, LoadingOverlay } from './Loading';
export type { SpinnerProps, LoadingOverlayProps, SpinnerSize } from './Loading';

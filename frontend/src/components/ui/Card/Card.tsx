import React from 'react';

export interface CardProps {
  /** Card content */
  children: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Click handler for interactive cards */
  onClick?: () => void;
  /** Show hover state */
  hoverable?: boolean;
  /** Padding size */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Header content */
  header?: React.ReactNode;
  /** Footer content */
  footer?: React.ReactNode;
  /** ARIA role */
  role?: string;
  /** Tab index for keyboard navigation */
  tabIndex?: number;
  /** Keyboard event handler */
  onKeyPress?: (e: React.KeyboardEvent) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

/**
 * Card Component
 *
 * A flexible container component for grouping related content.
 * Supports headers, footers, various padding levels, and interactive states.
 *
 * @example
 * ```tsx
 * // Basic card
 * <Card>
 *   <h3>Card Title</h3>
 *   <p>Card content goes here</p>
 * </Card>
 *
 * // Card with header and footer
 * <Card
 *   header={<h3>Pipeline Name</h3>}
 *   footer={<Button>View Details</Button>}
 * >
 *   <p>Pipeline description</p>
 * </Card>
 *
 * // Clickable card
 * <Card
 *   hoverable
 *   onClick={handleCardClick}
 *   role="button"
 *   tabIndex={0}
 * >
 *   <p>Click me!</p>
 * </Card>
 * ```
 */
export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  onClick,
  hoverable = false,
  padding = 'md',
  header,
  footer,
  role,
  tabIndex,
  onKeyPress,
  onKeyDown
}) => {
  const paddingClasses = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6'
  };

  const classes = [
    'bg-white border border-gray-200 rounded-lg',
    hoverable && 'transition-shadow hover:shadow-md',
    onClick && 'cursor-pointer',
    className
  ].filter(Boolean).join(' ');

  const bodyClasses = [
    paddingClasses[padding]
  ].filter(Boolean).join(' ');

  /**
   * Handle key down.
   *
   * @param {React.KeyboardEvent} e - The e
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (onKeyDown) {
      onKeyDown(e);
    }
    if (onKeyPress) {
      onKeyPress(e);
    }
    if (!onKeyDown && !onKeyPress && onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      className={classes}
      onClick={onClick}
      role={role}
      tabIndex={tabIndex}
      onKeyDown={handleKeyDown}
      onKeyPress={onKeyPress}
    >
      {header && (
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 rounded-t-lg">
          {header}
        </div>
      )}
      <div className={bodyClasses}>{children}</div>
      {footer && (
        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 rounded-b-lg">
          {footer}
        </div>
      )}
    </div>
  );
};

export interface CardHeaderProps {
  /** Header content */
  children: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Action buttons/elements */
  action?: React.ReactNode;
}

/**
 * CardHeader Component
 *
 * Standardized header for cards with optional action buttons.
 *
 * @example
 * ```tsx
 * <Card>
 *   <CardHeader action={<Button size="sm">Edit</Button>}>
 *     <h3>Card Title</h3>
 *   </CardHeader>
 *   <p>Card content</p>
 * </Card>
 * ```
 */
export const CardHeader: React.FC<CardHeaderProps> = ({
  children,
  className = '',
  action
}) => {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <div className="flex-1">{children}</div>
      {action && <div className="ml-4">{action}</div>}
    </div>
  );
};

export interface CardFooterProps {
  /** Footer content */
  children: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Content alignment */
  align?: 'left' | 'center' | 'right' | 'space-between';
}

/**
 * CardFooter Component
 *
 * Standardized footer for cards with alignment options.
 *
 * @example
 * ```tsx
 * <Card>
 *   <p>Card content</p>
 *   <CardFooter align="right">
 *     <Button variant="secondary">Cancel</Button>
 *     <Button variant="primary">Save</Button>
 *   </CardFooter>
 * </Card>
 * ```
 */
export const CardFooter: React.FC<CardFooterProps> = ({
  children,
  className = '',
  align = 'left'
}) => {
  const alignClasses = {
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end',
    'space-between': 'justify-between'
  };

  return (
    <div className={`flex items-center gap-2 ${alignClasses[align]} ${className}`}>
      {children}
    </div>
  );
};

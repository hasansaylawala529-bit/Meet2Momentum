import React from 'react';

/**
 * Standard Button component supporting multiple variants, sizes, and states.
 */
export default function Button({
  children,
  variant = 'primary', // 'primary' | 'secondary' | 'danger' | 'ghost' | 'dark'
  size = 'md', // 'sm' | 'md' | 'lg'
  icon,
  loading = false,
  disabled = false,
  onClick,
  className = '',
  type = 'button',
  title,
  style = {},
  ...rest
}) {
  const variantClass = variant === 'secondary'
    ? 'saas-btn-secondary'
    : variant === 'danger'
    ? 'saas-btn-danger'
    : variant === 'ghost'
    ? 'saas-btn-ghost'
    : variant === 'dark'
    ? 'saas-btn-dark'
    : 'saas-btn-primary';

  const sizeClass = size === 'sm' ? 'saas-btn-sm' : size === 'lg' ? 'saas-btn-lg' : '';

  return (
    <button
      type={type}
      className={`saas-btn ${variantClass} ${sizeClass} ${className}`.trim()}
      disabled={disabled || loading}
      onClick={onClick}
      title={title}
      style={style}
      {...rest}
    >
      {loading ? (
        <span className="btn-spinner" aria-hidden="true" />
      ) : (
        icon && <span className="btn-icon" aria-hidden="true">{icon}</span>
      )}
      {children && <span>{children}</span>}
    </button>
  );
}

import React from 'react';

/**
 * Standard EmptyState placeholder card with icon, title, description, and action button.
 */
export default function EmptyState({
  title = 'No Items Found',
  description = 'There are no items recorded in this section yet.',
  icon,
  action,
  theme = 'teal',
}) {
  const getThemeColors = () => {
    switch (theme) {
      case 'lavender':
        return { bg: 'var(--bg-pale-lavender)', color: 'var(--color-lavender)' };
      case 'green':
        return { bg: 'var(--bg-pale-mint)', color: 'var(--color-green)' };
      case 'amber':
        return { bg: 'var(--bg-pale-amber)', color: 'var(--color-amber)' };
      case 'blue':
        return { bg: 'var(--bg-pale-blue)', color: 'var(--color-blue)' };
      case 'teal':
      default:
        return { bg: 'var(--bg-pale-teal)', color: 'var(--color-teal)' };
    }
  };

  const { bg, color } = getThemeColors();

  return (
    <div className="saas-empty-state">
      <div className="empty-state-icon-box" style={{ backgroundColor: bg, color }}>
        {icon || (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        )}
      </div>
      <h4 className="empty-state-title">{title}</h4>
      <p className="empty-state-desc">{description}</p>
      {action && <div style={{ marginTop: '0.9rem' }}>{action}</div>}
    </div>
  );
}

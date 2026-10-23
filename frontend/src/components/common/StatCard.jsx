import React from 'react';

/**
 * Metric KPI StatCard component matching the design system token themes.
 */
export default function StatCard({
  label,
  value,
  footer,
  icon,
  theme = 'blue', // 'teal' | 'lavender' | 'green' | 'blue' | 'amber' | 'red'
  onClick,
  title,
  className = '',
}) {
  const getThemeVars = () => {
    switch (theme) {
      case 'teal':
        return { color: 'var(--color-teal)', bg: 'var(--bg-pale-teal)', themeClass: 'theme-teal' };
      case 'lavender':
        return { color: 'var(--color-lavender)', bg: 'var(--bg-pale-lavender)', themeClass: 'theme-lavender' };
      case 'green':
        return { color: 'var(--color-green)', bg: 'var(--bg-pale-mint)', themeClass: 'theme-green' };
      case 'amber':
        return { color: 'var(--color-amber)', bg: 'var(--bg-pale-amber)', themeClass: 'theme-amber' };
      case 'red':
        return { color: 'var(--color-red)', bg: 'var(--bg-pale-red)', themeClass: 'theme-red' };
      case 'blue':
      default:
        return { color: 'var(--color-blue)', bg: 'var(--bg-pale-blue)', themeClass: 'theme-blue' };
    }
  };

  const { color, bg, themeClass } = getThemeVars();

  return (
    <div
      className={`metric-card ${themeClass} ${className}`.trim()}
      style={onClick ? { cursor: 'pointer' } : {}}
      onClick={onClick}
      title={title}
    >
      <div className="metric-header">
        <span className="metric-label" style={{ color }}>{label}</span>
        {icon && (
          <div className="metric-icon-box" style={{ backgroundColor: bg, color }}>
            {icon}
          </div>
        )}
      </div>
      <div className="metric-value">{value}</div>
      {footer && <div className="metric-footer">{footer}</div>}
    </div>
  );
}

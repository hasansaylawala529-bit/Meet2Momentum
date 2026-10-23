import React from 'react';

/**
 * Skeleton placeholder loader for loading states.
 */
export default function Skeleton({
  type = 'text', // 'text' | 'rect' | 'circle' | 'card'
  width,
  height,
  count = 1,
  className = '',
  style = {},
}) {
  const items = Array.from({ length: count });

  const getStyle = () => {
    const base = { ...style };
    if (width) base.width = width;
    if (height) base.height = height;
    return base;
  };

  return (
    <div className="skeleton-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
      {items.map((_, idx) => (
        <div
          key={idx}
          className={`skeleton skeleton-${type} ${className}`.trim()}
          style={{
            backgroundColor: 'var(--slate-200)',
            borderRadius: type === 'circle' ? '50%' : 'var(--radius-sm)',
            height: height || (type === 'circle' ? '40px' : type === 'rect' ? '120px' : '16px'),
            width: width || (type === 'circle' ? '40px' : '100%'),
            animation: 'skeleton-pulse 1.5s ease-in-out infinite',
            ...getStyle(),
          }}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

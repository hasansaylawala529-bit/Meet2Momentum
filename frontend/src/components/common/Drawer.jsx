import React, { useEffect } from 'react';

/**
 * Slide-out Drawer component for side panels and mobile navigation.
 */
export default function Drawer({
  isOpen,
  onClose,
  title,
  children,
  placement = 'right',
  width = '360px',
  footer,
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen && onClose) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isLeft = placement === 'left';

  return (
    <div
      className="sidebar-backdrop"
      style={{ display: 'block', zIndex: 1100 }}
      onClick={onClose}
      aria-hidden="true"
    >
      <div
        className="app-drawer"
        style={{
          position: 'fixed',
          top: 0,
          bottom: 0,
          left: isLeft ? 0 : 'auto',
          right: isLeft ? 'auto' : 0,
          width,
          maxWidth: '90vw',
          backgroundColor: 'var(--bg-card)',
          borderLeft: isLeft ? 'none' : '1px solid var(--border-color)',
          borderRight: isLeft ? '1px solid var(--border-color)' : 'none',
          boxShadow: 'var(--shadow-hover)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 1101,
          animation: isLeft ? 'slideInLeft 0.2s ease' : 'slideInRight 0.2s ease',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '1.15rem 1.25rem',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h3 style={{ fontSize: '0.98rem', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
            {title}
          </h3>
          <button
            type="button"
            className="history-modal-close"
            onClick={onClose}
            aria-label="Close drawer"
          >
            &times;
          </button>
        </div>

        <div style={{ padding: '1.25rem', flex: 1, overflowY: 'auto' }}>
          {children}
        </div>

        {footer && (
          <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--slate-50)' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

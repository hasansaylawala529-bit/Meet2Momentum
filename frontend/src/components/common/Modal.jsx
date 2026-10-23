import React, { useEffect } from 'react';

/**
 * Accessible Modal dialog component with backdrop, escape key support, and header.
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  icon,
  children,
  footer,
  maxWidth = '640px',
  className = '',
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

  return (
    <div className="history-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className={`history-modal-dialog ${className}`.trim()}
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="history-modal-header">
          <div className="history-modal-title">
            {icon && <span style={{ display: 'inline-flex', alignItems: 'center' }}>{icon}</span>}
            <span>{title}</span>
          </div>
          <button
            type="button"
            className="history-modal-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            &times;
          </button>
        </div>

        <div className="history-modal-body">
          {children}
        </div>

        {footer && (
          <div className="modal-footer" style={{ padding: '0.9rem 1.25rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

import React from 'react';

/**
 * Global Toast notice banner for success and error alerts.
 */
export default function Toast({ notice, onDismiss }) {
  if (!notice || !notice.message) return null;

  const isSuccess = notice.type === 'success';

  return (
    <div className={`global-notice-bar ${notice.type}`} role="status">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
        {isSuccess ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        )}
        <span>{notice.message}</span>
      </div>
      {onDismiss && (
        <button
          type="button"
          className="notice-dismiss-btn"
          onClick={onDismiss}
          title="Dismiss message"
          aria-label="Dismiss alert"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}

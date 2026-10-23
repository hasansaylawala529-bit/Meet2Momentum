import React from 'react';

const WORKSPACE_METADATA = {
  overview: {
    title: 'Meeting Overview',
    subtitle: 'Summary of meetings, confirmed outcomes, and execution status',
    iconBg: 'var(--bg-pale-blue)',
    iconColor: 'var(--color-blue)',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
      </svg>
    )
  },
  meetings: {
    title: 'Meetings',
    subtitle: 'Record meeting transcripts, notes, and uploaded discussions',
    iconBg: 'var(--bg-pale-teal)',
    iconColor: 'var(--color-teal)',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    )
  },
  decisions: {
    title: 'Decisions',
    subtitle: 'Track agreed decisions with supporting context from meetings',
    iconBg: 'var(--bg-pale-lavender)',
    iconColor: 'var(--color-lavender)',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 14 14" />
      </svg>
    )
  },
  actions: {
    title: 'Action Items',
    subtitle: 'Manage confirmed commitments, proposed actions, and task assignments',
    iconBg: 'var(--bg-pale-mint)',
    iconColor: 'var(--color-green)',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    )
  },
  followups: {
    title: 'Follow-ups',
    subtitle: 'Monitor unresolved questions, pending approvals, and upcoming deadlines',
    iconBg: 'var(--bg-pale-amber)',
    iconColor: 'var(--color-amber)',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    )
  }
};

export default function Header({ activeTab, isConnected, isChecking, onOpenSidebar, onNewMeetingClick }) {
  const meta = WORKSPACE_METADATA[activeTab] || WORKSPACE_METADATA.overview;

  return (
    <header className="main-header">
      <div className="header-left">
        {/* Mobile menu toggle */}
        <button
          type="button"
          className="mobile-menu-btn"
          onClick={onOpenSidebar}
          aria-label="Open navigation menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <div 
          className="header-icon-box"
          style={{ backgroundColor: meta.iconBg, color: meta.iconColor }}
          aria-hidden="true"
        >
          {meta.icon}
        </div>

        <div className="header-titles">
          <h1 className="header-title">{meta.title}</h1>
          <p className="header-subtitle">{meta.subtitle}</p>
        </div>
      </div>

      <div className="header-right">
        {/* Offline alert only if disconnected */}
        {!isConnected && !isChecking && (
          <div className="connection-alert-pill" title="Server currently unreachable">
            <span className="alert-dot" />
            <span>Connection issue</span>
          </div>
        )}

        {activeTab !== 'meetings' && (
          <button
            type="button"
            className="saas-btn saas-btn-primary saas-btn-sm"
            onClick={onNewMeetingClick}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Add Meeting</span>
          </button>
        )}
      </div>
    </header>
  );
}

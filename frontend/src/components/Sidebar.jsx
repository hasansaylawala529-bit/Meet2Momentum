import React from 'react';

export default function Sidebar({
  activeTab,
  onSelectTab,
  meetingCount = 0,
  decisionCount = 0,
  actionCount = 0,
  followupCount = 0,
  isOpen,
  onClose,
}) {
  const navItems = [
    {
      id: 'overview',
      label: 'Overview',
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
    {
      id: 'meetings',
      label: 'Meetings',
      count: meetingCount > 0 ? meetingCount : null,
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
    {
      id: 'decisions',
      label: 'Decisions',
      count: decisionCount > 0 ? decisionCount : null,
      iconColor: 'var(--color-lavender)',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 14 14" />
        </svg>
      )
    },
    {
      id: 'actions',
      label: 'Action Items',
      count: actionCount > 0 ? actionCount : null,
      iconColor: 'var(--color-green)',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 11 12 14 22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      )
    },
    {
      id: 'followups',
      label: 'Follow-ups',
      count: followupCount > 0 ? followupCount : null,
      iconColor: 'var(--color-amber)',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      )
    }
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div 
          className="sidebar-backdrop" 
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside className={`app-sidebar ${isOpen ? 'open' : ''}`}>
        {/* Brand Header */}
        <div className="sidebar-brand-wrapper">
          <div className="sidebar-brand">
            <div className="sidebar-logo-mark" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
            </div>
            <div className="sidebar-brand-text">
              <span className="sidebar-brand-title">Meet2Momentum</span>
              <span className="sidebar-brand-tag">Meeting to Execution</span>
            </div>
          </div>
          {onClose && (
            <button 
              type="button" 
              className="sidebar-close-btn" 
              onClick={onClose}
              aria-label="Close navigation"
            >
              &times;
            </button>
          )}
        </div>

        {/* Navigation Section */}
        <div className="sidebar-nav-container">
          <div className="sidebar-nav-group-label">WORKSPACE</div>
          <nav className="sidebar-nav" aria-label="Product Navigation">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    onSelectTab(item.id);
                    if (onClose) onClose();
                  }}
                >
                  <span 
                    className="sidebar-item-icon" 
                    style={{ color: isActive ? 'var(--color-blue)' : item.iconColor }}
                  >
                    {item.icon}
                  </span>
                  <span className="sidebar-item-label">{item.label}</span>
                  {item.count !== null && item.count !== undefined && (
                    <span className="sidebar-count-badge">
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Product Footer */}
        <div className="sidebar-footer-card">
          <div className="sidebar-footer-heading">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <span style={{ fontWeight: 600 }}>Workflow Principle</span>
          </div>
          <p className="sidebar-footer-desc">
            Convert conversations into confirmed commitments, approved tasks, and trackable outcomes.
          </p>
        </div>
      </aside>
    </>
  );
}

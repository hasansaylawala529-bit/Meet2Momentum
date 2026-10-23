import React from 'react';

/**
 * Grouped Navigation Sidebar:
 * - Review (Review queue, Action Items)
 * - Meetings (Meetings, Decisions)
 * - Execution (Export, Tracking)
 * - Action-only badges (e.g. pending review, overdue)
 * - Collapses to icons rail (64px)
 * - One-line footer: "AI proposes. Humans approve."
 */
export default function Sidebar({
  activeTab,
  onSelectTab,
  pendingReviewCount = 0,
  exportCount = 0,
  overdueCount = 0,
  isOpen,
  onClose,
  isCollapsed = false,
  onToggleCollapse,
}) {
  const navGroups = [
    {
      title: 'Review',
      items: [
        {
          id: 'overview',
          label: 'Review queue',
          badge: pendingReviewCount > 0 ? pendingReviewCount : null,
          badgeType: 'amber',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
            </svg>
          ),
        },
        {
          id: 'actions',
          label: 'Action Items',
          badge: pendingReviewCount > 0 ? pendingReviewCount : null,
          badgeType: 'amber',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 11 12 14 22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          ),
        },
      ],
    },
    {
      title: 'Meetings',
      items: [
        {
          id: 'meetings',
          label: 'Meetings',
          badge: null,
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          ),
        },
        {
          id: 'decisions',
          label: 'Decisions',
          badge: null,
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 14 14" />
            </svg>
          ),
        },
      ],
    },
    {
      title: 'Execution',
      items: [
        {
          id: 'export',
          label: 'Export',
          badge: exportCount > 0 ? exportCount : null,
          badgeType: 'ready',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          ),
        },
        {
          id: 'tracking',
          label: 'Tracking',
          badge: overdueCount > 0 ? overdueCount : null,
          badgeType: 'urgent',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          ),
        },
      ],
    },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div className="sidebar-backdrop" onClick={onClose} aria-hidden="true" />
      )}

      <aside className={`app-sidebar ${isCollapsed ? 'collapsed' : ''} ${isOpen ? 'open' : ''}`}>
        {/* Brand Header */}
        <div className="sidebar-brand-wrapper">
          <div className="sidebar-brand">
            <div className="sidebar-logo-mark" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <div className="sidebar-brand-text">
              <span className="sidebar-brand-title">Meet2Momentum</span>
              <span className="sidebar-brand-tag">Meeting to Execution</span>
            </div>
          </div>

          {/* Desktop Collapse Toggle */}
          {onToggleCollapse && (
            <button
              type="button"
              className="sidebar-collapse-toggle"
              onClick={onToggleCollapse}
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar to icons'}
              aria-label="Toggle sidebar collapse"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="11 17 6 12 11 7" />
                <polyline points="18 17 13 12 18 7" />
              </svg>
            </button>
          )}

          {/* Mobile Close Button */}
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

        {/* Grouped Nav Items */}
        <div className="sidebar-nav-container">
          {navGroups.map((group) => (
            <div key={group.title} className="sidebar-nav-group">
              <div className="sidebar-group-title">{group.title}</div>
              <div className="sidebar-group-divider" />
              {group.items.map((item) => {
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
                    title={isCollapsed ? `${item.label}${item.badge ? ` (${item.badge})` : ''}` : undefined}
                  >
                    <span className="sidebar-item-icon">
                      {item.icon}
                    </span>
                    <span className="sidebar-item-label">{item.label}</span>
                    {item.badge !== null && item.badge !== undefined && (
                      <span className={`sidebar-action-badge ${item.badgeType || ''}`}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Collapsed Bottom Expand Button */}
        {onToggleCollapse && (
          <button
            type="button"
            className="sidebar-bottom-expand-btn"
            onClick={onToggleCollapse}
            title="Expand sidebar"
            aria-label="Expand sidebar"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="13 17 18 12 13 7" />
              <polyline points="6 17 11 12 6 7" />
            </svg>
          </button>
        )}

        {/* One-Line Footer */}
        <div className="sidebar-footer-oneline" title="Meet2Momentum Principle">
          AI proposes. Humans approve.
        </div>
      </aside>
    </>
  );
}

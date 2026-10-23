import React from 'react';

export default function Navigation({ activeTab, onSelectTab, meetingCount }) {
  const tabs = [
    { id: 'meetings', label: 'Meetings Workspace', badge: meetingCount > 0 ? meetingCount : null, active: true },
    { id: 'overview', label: 'Architecture & Rules', badge: 'Blueprint', active: true },
    { id: 'actions', label: 'Action Items', badge: 'Phase 2', active: false },
    { id: 'decisions', label: 'Decisions', badge: 'Phase 2', active: false },
  ];

  return (
    <nav className="app-nav" aria-label="Main Navigation">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`nav-tab ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onSelectTab(tab.id)}
        >
          <span>{tab.label}</span>
          {tab.badge && <span className="tab-badge">{tab.badge}</span>}
        </button>
      ))}
    </nav>
  );
}

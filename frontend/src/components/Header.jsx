import React, { useRef, useEffect } from 'react';

/**
 * Redesigned Top Bar:
 * - Global search (with '/' keyboard shortcut)
 * - Single "+ Add Meeting" primary button
 * - Backend connection status dot (green, amber, red)
 * - Dark-mode toggle button swapping token variables
 */
export default function Header({
  isConnected = false,
  isChecking = false,
  onOpenSidebar,
  onNewMeetingClick,
  globalSearchText = '',
  onGlobalSearchChange,
  theme = 'light',
  onToggleTheme,
}) {
  const searchInputRef = useRef(null);

  // Keyboard shortcut: Press '/' to focus global search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (
        e.key === '/' &&
        document.activeElement.tagName !== 'INPUT' &&
        document.activeElement.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <header className="main-header">
      {/* Left: Mobile Menu Toggle & Global Search */}
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

        {/* Global Search Bar */}
        <div className="header-global-search">
          <span className="search-icon-prefix">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            ref={searchInputRef}
            type="text"
            className="header-search-input"
            placeholder="Search meetings, actions, decisions..."
            value={globalSearchText}
            onChange={(e) => onGlobalSearchChange && onGlobalSearchChange(e.target.value)}
            aria-label="Global workspace search"
          />
          <span className="search-shortcut-tag" title="Press / to search">/</span>
        </div>
      </div>

      {/* Right: Connection Dot, Theme Toggle & Single Add Meeting Button */}
      <div className="header-right">
        {/* Backend Connection Status Dot */}
        <div
          className="connection-status-pill"
          title={
            isConnected
              ? 'Backend API Connected (FastAPI @ http://127.0.0.1:8000)'
              : isChecking
              ? 'Verifying backend health...'
              : 'Backend server disconnected. Ensure FastAPI is running.'
          }
        >
          <span
            className={`connection-dot ${
              isConnected ? 'connected' : isChecking ? 'checking' : 'disconnected'
            }`}
          />
          <span>{isConnected ? 'Connected' : isChecking ? 'Checking' : 'Offline'}</span>
        </div>

        {/* Dark-Mode Toggle Button */}
        {onToggleTheme && (
          <button
            type="button"
            className="theme-toggle-btn"
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle theme mode"
          >
            {theme === 'dark' ? (
              /* Sun Icon */
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              /* Moon Icon */
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
        )}

        {/* Single Primary "Add Meeting" Button */}
        <button
          type="button"
          className="saas-btn saas-btn-primary saas-btn-sm"
          onClick={onNewMeetingClick}
          title="Add a new meeting transcript"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>Add Meeting</span>
        </button>
      </div>
    </header>
  );
}

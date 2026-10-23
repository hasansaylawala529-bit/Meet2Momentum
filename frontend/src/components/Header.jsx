import React from 'react';

export default function Header({ isConnected, isChecking }) {
  return (
    <header className="app-header">
      <div className="header-brand">
        <div className="brand-badge" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div className="brand-titles">
          <h1>Meet2Momentum</h1>
          <p className="brand-tagline">From spoken commitments to verified, approved, trackable execution.</p>
        </div>
      </div>

      <div className="header-status">
        <div 
          className={`health-pill ${isConnected ? 'connected' : isChecking ? '' : 'disconnected'}`}
          title={isConnected ? 'Backend API connected' : 'Backend API disconnected'}
        >
          <span className="health-dot" />
          <span>{isChecking ? 'Checking API...' : isConnected ? 'API Connected' : 'API Offline'}</span>
        </div>
      </div>
    </header>
  );
}

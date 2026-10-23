import React from 'react';

export default function MeetingHistory({ meetings, isLoading, error, onRefresh }) {
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title-group">
          <h2>Meeting History</h2>
          <p>Persisted SQLite records ({meetings.length})</p>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onRefresh}
          disabled={isLoading}
          title="Refresh history from SQLite database"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }}>
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
          </svg>
          Refresh
        </button>
      </div>

      <div className="card-body">
        {error && (
          <div className="alert alert-error" role="alert">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <div>{error}</div>
          </div>
        )}

        {isLoading && meetings.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1.2s linear infinite' }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
            </div>
            <div className="empty-state-title">Connecting to SQLite...</div>
            <div className="empty-state-text">Loading stored meeting records from backend.</div>
          </div>
        ) : meetings.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
            </div>
            <div className="empty-state-title">No Saved Meetings Yet</div>
            <div className="empty-state-text">
              Upload a .txt transcript or paste meeting notes on the left to create your first persistent record.
            </div>
          </div>
        ) : (
          <div className="history-list">
            {meetings.map((m) => (
              <div key={m.meeting_id} className="history-item">
                <div className="history-item-header">
                  <div className="history-item-title">{m.title}</div>
                  {m.meeting_date && (
                    <span className="history-item-date">
                      📅 {m.meeting_date}
                    </span>
                  )}
                </div>
                <p className="history-item-preview">
                  {m.transcript}
                </p>
                <div className="history-item-footer">
                  <span className="history-item-id">{m.meeting_id}</span>
                  <span>{new Date(m.created_at).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

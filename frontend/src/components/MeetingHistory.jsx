import React from 'react';

export default function MeetingHistory({
  meetings,
  isLoading,
  error,
  onRefresh,
  onProcessMeeting,
  processingMeetingId,
  processedMeetingStats = {},
  extractionErrors = {},
}) {
  return (
    <div className="panel-card" style={{ borderTop: '3px solid var(--color-teal)' }}>
      <div className="panel-card-header">
        <div className="panel-header-icon" style={{ backgroundColor: 'var(--bg-pale-teal)', color: 'var(--color-teal)' }} aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
            <line x1="8" y1="21" x2="16" y2="21"/>
            <line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <h2 className="panel-title">Saved Meetings</h2>
            <span className="count-pill">{meetings.length}</span>
          </div>
          <p className="panel-subtitle">Meeting records ready for AI outcome extraction and human review</p>
        </div>

        <button
          type="button"
          className="saas-btn saas-btn-secondary saas-btn-sm"
          onClick={onRefresh}
          disabled={isLoading || !!processingMeetingId}
          title="Refresh meeting list"
        >
          <svg 
            width="14" 
            height="14" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            className={isLoading ? 'spin-animation' : ''}
          >
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
          </svg>
          <span>Refresh</span>
        </button>
      </div>

      <div className="panel-card-body">
        {/* Error Alert */}
        {error && (
          <div className="saas-alert saas-alert-error" role="alert">
            <div className="alert-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div className="alert-content">
              <strong>Could not load meetings:</strong> {error}
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && meetings.length === 0 ? (
          <div className="saas-empty-state">
            <div className="empty-state-icon-box" style={{ backgroundColor: 'var(--bg-pale-teal)', color: 'var(--color-teal)' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="spin-animation">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
            </div>
            <h3 className="empty-state-title">Loading meetings...</h3>
            <p className="empty-state-desc">Fetching recorded meetings from your workspace.</p>
          </div>
        ) : meetings.length === 0 ? (
          /* Empty State */
          <div className="saas-empty-state">
            <div className="empty-state-icon-box" style={{ backgroundColor: 'var(--bg-pale-teal)', color: 'var(--color-teal)' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="12" y1="18" x2="12" y2="12"/>
                <line x1="9" y1="15" x2="15" y2="15"/>
              </svg>
            </div>
            <h3 className="empty-state-title">No Meetings Added Yet</h3>
            <p className="empty-state-desc">
              Paste your meeting notes or upload a .txt file on the left to add your first meeting.
            </p>
          </div>
        ) : (
          /* Meeting Cards List */
          <div className="meeting-cards-stream">
            {meetings.map((m) => {
              const isProcessing = processingMeetingId === m.meeting_id;
              const stats = processedMeetingStats[m.meeting_id];
              const cardError = extractionErrors[m.meeting_id];

              return (
                <div key={m.meeting_id} className="meeting-record-card">
                  <div className="record-card-top">
                    <div className="record-title-area">
                      <h4 className="record-title">{m.title}</h4>
                      <span className="record-id-badge">{m.meeting_id}</span>
                    </div>
                    {m.meeting_date && (
                      <span className="record-date-badge">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                          <line x1="16" y1="2" x2="16" y2="6"/>
                          <line x1="8" y1="2" x2="8" y2="6"/>
                          <line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                        {m.meeting_date}
                      </span>
                    )}
                  </div>

                  <p className="record-transcript-snippet">
                    {m.transcript}
                  </p>

                  {/* Card-level Extraction Error Alert */}
                  {cardError && (
                    <div className="card-error-alert" role="alert">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="8" x2="12" y2="12"/>
                        <line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                      <span><strong>Processing issue:</strong> {cardError}</span>
                    </div>
                  )}

                  {/* Extraction Stats Summary Pill */}
                  {stats && !cardError && (
                    <div className="extraction-summary-pill">
                      <span className="summary-dot green" />
                      <span className="summary-text">
                        <strong>AI Processed:</strong> {stats.decisions} {stats.decisions === 1 ? 'decision' : 'decisions'}, {stats.commitments} {stats.commitments === 1 ? 'commitment' : 'commitments'}
                        {stats.suggestions > 0 ? `, ${stats.suggestions} suggestions` : ''}
                        {stats.unresolved > 0 ? `, ${stats.unresolved} open questions` : ''}
                      </span>
                    </div>
                  )}

                  <div className="record-card-bottom">
                    <span className="record-meta-time">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                      </svg>
                      Added {new Date(m.created_at).toLocaleDateString()}
                    </span>

                    <div className="record-actions-cluster">
                      <button
                        type="button"
                        className={`saas-btn saas-btn-sm ${stats ? 'saas-btn-secondary' : 'saas-btn-primary'}`}
                        onClick={() => onProcessMeeting && onProcessMeeting(m)}
                        disabled={isProcessing || (!!processingMeetingId && !isProcessing)}
                        title="Extract decisions, commitments, suggestions, and questions with Gemini AI"
                      >
                        {isProcessing ? (
                          <>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="spin-animation">
                              <line x1="12" y1="2" x2="12" y2="6"/>
                              <line x1="12" y1="18" x2="12" y2="22"/>
                              <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/>
                              <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
                              <line x1="2" y1="12" x2="6" y2="12"/>
                              <line x1="18" y1="12" x2="22" y2="12"/>
                              <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/>
                              <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
                            </svg>
                            <span>Processing AI...</span>
                          </>
                        ) : (
                          <>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                            </svg>
                            <span>{stats ? 'Re-extract Outcomes' : 'Process with AI'}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

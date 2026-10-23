import React from 'react';

/**
 * FollowUps Page: Items requiring owner clarification, deadline assignment, or unresolved questions.
 */
export default function FollowUps({
  followUpsList = [],
  meetingMap = new Map(),
  onNavigate,
}) {
  return (
    <div className="feature-workspace-container">
      <div className="panel-card" style={{ borderTop: '3px solid var(--color-amber)' }}>
        <div className="panel-card-header">
          <div className="panel-header-icon" style={{ backgroundColor: 'var(--bg-pale-amber)', color: 'var(--color-amber)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h2 className="panel-title">Follow-up Tracking</h2>
              <span className="count-pill">{followUpsList.length}</span>
            </div>
            <p className="panel-subtitle">Items requiring owner clarification, deadline assignment, or unresolved questions</p>
          </div>
        </div>

        <div className="panel-card-body">
          {followUpsList.length === 0 ? (
            <div className="saas-empty-state">
              <div className="empty-state-icon-box" style={{ backgroundColor: 'var(--bg-pale-amber)', color: 'var(--color-amber)' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h3 className="empty-state-title">No Pending Follow-ups</h3>
              <p className="empty-state-desc">
                All extracted commitments have assigned owners and deadlines. Any open questions or ambiguous items will appear here.
              </p>
              {onNavigate && (
                <button
                  type="button"
                  className="saas-btn saas-btn-primary saas-btn-sm"
                  style={{ marginTop: '1rem' }}
                  onClick={() => onNavigate('meetings')}
                >
                  Go to Meetings Workspace
                </button>
              )}
            </div>
          ) : (
            <div className="outcomes-stream">
              {followUpsList.map((item) => {
                const meeting = meetingMap.get(item.meeting_id);
                return (
                  <div key={item.task_id} className="outcome-card card-unresolved">
                    <div className="outcome-card-header">
                      <div className="outcome-card-title-group">
                        <h3 className="outcome-title">{item.title}</h3>
                        <div className="outcome-meeting-ref">
                          <span>From: <strong>{meeting ? meeting.title : item.meeting_id}</strong></span>
                        </div>
                      </div>
                      <div className="outcome-meta-badges">
                        <span className="badge-category unresolved">
                          {item.category === 'unresolved_question' ? '❓ Unresolved Question' : '⚠ Clarification Needed'}
                        </span>
                      </div>
                    </div>

                    <div className="clarification-banner">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <div>
                        <strong>Action Needed:</strong> {item.clarification_note || 'Confirm owner and target completion date with the team.'}
                      </div>
                    </div>

                    {item.source_text && (
                      <div className="evidence-quote-box">
                        <div className="evidence-header">
                          <span>Transcript Context</span>
                        </div>
                        <blockquote className="evidence-quote-text">
                          "{item.source_text}"
                        </blockquote>
                      </div>
                    )}

                    <div className="outcome-card-footer">
                      <span>Added {new Date(item.created_at).toLocaleDateString()}</span>
                      <span>Task ID: {item.task_id}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

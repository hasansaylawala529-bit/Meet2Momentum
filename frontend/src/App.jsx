import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import TranscriptWorkspace from './components/TranscriptWorkspace';
import MeetingHistory from './components/MeetingHistory';
import { checkBackendHealth, fetchMeetings } from './services/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [isConnected, setIsConnected] = useState(false);
  const [isCheckingHealth, setIsCheckingHealth] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const [meetings, setMeetings] = useState([]);
  const [isLoadingMeetings, setIsLoadingMeetings] = useState(false);
  const [meetingsError, setMeetingsError] = useState('');

  // Backend sync
  const loadMeetingsData = useCallback(async () => {
    setIsLoadingMeetings(true);
    setMeetingsError('');
    try {
      const data = await fetchMeetings();
      setMeetings(data);
      setIsConnected(true);
    } catch (err) {
      setMeetingsError(err.message || 'Unable to load meeting records.');
      setIsConnected(false);
    } finally {
      setIsLoadingMeetings(false);
      setIsCheckingHealth(false);
    }
  }, []);

  useEffect(() => {
    checkBackendHealth()
      .then(() => {
        setIsConnected(true);
        loadMeetingsData();
      })
      .catch(() => {
        setIsConnected(false);
        setIsCheckingHealth(false);
      });
  }, [loadMeetingsData]);

  const handleMeetingSaved = (newMeeting) => {
    setMeetings((prev) => [newMeeting, ...prev]);
  };

  return (
    <div className="saas-app-layout">
      {/* Colorful Light Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        meetingCount={meetings.length}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main Viewport */}
      <div className="saas-main-viewport">
        <Header
          activeTab={activeTab}
          isConnected={isConnected}
          isChecking={isCheckingHealth}
          onOpenSidebar={() => setIsSidebarOpen(true)}
          onNewMeetingClick={() => setActiveTab('meetings')}
        />

        <main className="saas-page-content">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="overview-container">
              {/* Product Hero Banner */}
              <div className="overview-hero-card">
                <div className="hero-content">
                  <h2 className="hero-title">Meeting-to-Execution Workspace</h2>
                  <p className="hero-desc">
                    Capture meeting discussions, identify confirmed decisions, and turn commitments into trackable action items with human approval.
                  </p>
                </div>
                <div className="hero-action-box">
                  <button
                    type="button"
                    className="saas-btn saas-btn-primary"
                    onClick={() => setActiveTab('meetings')}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <span>Add Meeting Transcript</span>
                  </button>
                </div>
              </div>

              {/* Meaningful Colored Metric Cards */}
              <div className="metrics-grid">
                <div className="metric-card theme-teal">
                  <div className="metric-header">
                    <span className="metric-label" style={{ color: 'var(--color-teal)' }}>TOTAL MEETINGS</span>
                    <div className="metric-icon-box" style={{ backgroundColor: 'var(--bg-pale-teal)', color: 'var(--color-teal)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    </div>
                  </div>
                  <div className="metric-value">{meetings.length}</div>
                  <div className="metric-footer">Recorded in workspace</div>
                </div>

                <div className="metric-card theme-lavender">
                  <div className="metric-header">
                    <span className="metric-label" style={{ color: 'var(--color-lavender)' }}>DECISIONS</span>
                    <div className="metric-icon-box" style={{ backgroundColor: 'var(--bg-pale-lavender)', color: 'var(--color-lavender)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 14 14" />
                      </svg>
                    </div>
                  </div>
                  <div className="metric-value">0</div>
                  <div className="metric-footer">Awaiting meeting processing</div>
                </div>

                <div className="metric-card theme-green">
                  <div className="metric-header">
                    <span className="metric-label" style={{ color: 'var(--color-green)' }}>CONFIRMED COMMITMENTS</span>
                    <div className="metric-icon-box" style={{ backgroundColor: 'var(--bg-pale-mint)', color: 'var(--color-green)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 11 12 14 22 4" />
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                      </svg>
                    </div>
                  </div>
                  <div className="metric-value">0</div>
                  <div className="metric-footer">Awaiting meeting processing</div>
                </div>

                <div className="metric-card theme-amber">
                  <div className="metric-header">
                    <span className="metric-label" style={{ color: 'var(--color-amber)' }}>PENDING FOLLOW-UPS</span>
                    <div className="metric-icon-box" style={{ backgroundColor: 'var(--bg-pale-amber)', color: 'var(--color-amber)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                      </svg>
                    </div>
                  </div>
                  <div className="metric-value">0</div>
                  <div className="metric-footer">No overdue or open questions</div>
                </div>
              </div>

              {/* Recent Meetings Table */}
              <div className="panel-card" style={{ marginBottom: '1.5rem', borderTop: '3px solid var(--color-teal)' }}>
                <div className="panel-card-header">
                  <div className="panel-header-icon" style={{ backgroundColor: 'var(--bg-pale-teal)', color: 'var(--color-teal)' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 className="panel-title">Recent Meetings</h3>
                    <p className="panel-subtitle">Latest transcripts and notes added to the workspace</p>
                  </div>
                  {meetings.length > 0 && (
                    <button
                      type="button"
                      className="saas-btn saas-btn-secondary saas-btn-sm"
                      onClick={() => setActiveTab('meetings')}
                    >
                      View All Meetings &rarr;
                    </button>
                  )}
                </div>

                <div className="panel-card-body">
                  {meetings.length === 0 ? (
                    <div className="saas-empty-state">
                      <div className="empty-state-icon-box" style={{ backgroundColor: 'var(--bg-pale-teal)', color: 'var(--color-teal)' }}>
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                          <line x1="8" y1="21" x2="16" y2="21" />
                          <line x1="12" y1="17" x2="12" y2="21" />
                        </svg>
                      </div>
                      <h4 className="empty-state-title">No Meetings Added Yet</h4>
                      <p className="empty-state-desc">
                        Add your first meeting transcript or notes to view records and begin tracking outcomes.
                      </p>
                      <button
                        type="button"
                        className="saas-btn saas-btn-primary saas-btn-sm"
                        style={{ marginTop: '0.85rem' }}
                        onClick={() => setActiveTab('meetings')}
                      >
                        Add Meeting Transcript
                      </button>
                    </div>
                  ) : (
                    <div className="recent-meetings-table-wrapper">
                      <table className="saas-table">
                        <thead>
                          <tr>
                            <th>Meeting Title</th>
                            <th>Reference</th>
                            <th>Meeting Date</th>
                            <th>Status</th>
                            <th>Date Added</th>
                          </tr>
                        </thead>
                        <tbody>
                          {meetings.slice(0, 5).map((m) => (
                            <tr key={m.meeting_id}>
                              <td style={{ fontWeight: 600, color: 'var(--text-main)' }}>{m.title}</td>
                              <td><code className="id-code-pill">{m.meeting_id}</code></td>
                              <td>{m.meeting_date || '—'}</td>
                              <td><span className="status-badge-recorded">Recorded</span></td>
                              <td>{new Date(m.created_at).toLocaleDateString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Workflow Banner with Meaningful Color Accents */}
              <div className="overview-workflow-banner">
                <div className="workflow-banner-title">How Meet2Momentum Works</div>
                <div className="workflow-steps-row">
                  <div className="workflow-step-item">
                    <div className="step-circle circle-teal">1</div>
                    <div className="step-label">Add Transcript</div>
                    <div className="step-sublabel">Paste notes or upload .txt</div>
                  </div>
                  <div className="workflow-step-divider">&rarr;</div>
                  <div className="workflow-step-item">
                    <div className="step-circle circle-lavender">2</div>
                    <div className="step-label">Extract Outcomes</div>
                    <div className="step-sublabel">Decisions & commitments</div>
                  </div>
                  <div className="workflow-step-divider">&rarr;</div>
                  <div className="workflow-step-item">
                    <div className="step-circle circle-blue">3</div>
                    <div className="step-label">Review & Approve</div>
                    <div className="step-sublabel">Confirm owners & dates</div>
                  </div>
                  <div className="workflow-step-divider">&rarr;</div>
                  <div className="workflow-step-item">
                    <div className="step-circle circle-amber">4</div>
                    <div className="step-label">Track Follow-ups</div>
                    <div className="step-sublabel">Monitor execution</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MEETINGS */}
          {activeTab === 'meetings' && (
            <div className="meetings-workspace-grid">
              <TranscriptWorkspace onMeetingSaved={handleMeetingSaved} />
              <MeetingHistory
                meetings={meetings}
                isLoading={isLoadingMeetings}
                error={meetingsError}
                onRefresh={loadMeetingsData}
              />
            </div>
          )}

          {/* TAB 3: DECISIONS */}
          {activeTab === 'decisions' && (
            <div className="feature-workspace-container">
              <div className="panel-card" style={{ borderTop: '3px solid var(--color-lavender)' }}>
                <div className="panel-card-header">
                  <div className="panel-header-icon" style={{ backgroundColor: 'var(--bg-pale-lavender)', color: 'var(--color-lavender)' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 14 14" />
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <h2 className="panel-title">Decisions Log</h2>
                    <p className="panel-subtitle">Agreed decisions supported by verbatim evidence from meeting transcripts</p>
                  </div>
                </div>
                <div className="panel-card-body">
                  <div className="saas-empty-state">
                    <div className="empty-state-icon-box" style={{ backgroundColor: 'var(--bg-pale-lavender)', color: 'var(--color-lavender)' }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    </div>
                    <h3 className="empty-state-title">No Decisions Recorded Yet</h3>
                    <p className="empty-state-desc">
                      Confirmed decisions will be extracted from meeting transcripts and linked to the exact sentences where they were agreed.
                    </p>
                    <button
                      type="button"
                      className="saas-btn saas-btn-primary saas-btn-sm"
                      style={{ marginTop: '1rem' }}
                      onClick={() => setActiveTab('meetings')}
                    >
                      Go to Meetings Workspace
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: ACTION ITEMS */}
          {activeTab === 'actions' && (
            <div className="feature-workspace-container">
              <div className="panel-card" style={{ borderTop: '3px solid var(--color-green)' }}>
                <div className="panel-card-header">
                  <div className="panel-header-icon" style={{ backgroundColor: 'var(--bg-pale-mint)', color: 'var(--color-green)' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 11 12 14 22 4" />
                      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <h2 className="panel-title">Action Items & Commitments</h2>
                    <p className="panel-subtitle">Categorized tasks with assigned owners, deadlines, and approval controls</p>
                  </div>
                </div>
                <div className="panel-card-body">
                  {/* Category Guide Cards with Meaningful Colors */}
                  <div className="categories-guide-grid">
                    <div className="category-guide-card guide-commitment">
                      <span className="category-dot green" />
                      <div>
                        <strong>Confirmed Commitments</strong>
                        <p>Tasks explicitly agreed upon during the discussion</p>
                      </div>
                    </div>
                    <div className="category-guide-card guide-suggestion">
                      <span className="category-dot peach" />
                      <div>
                        <strong>Suggestions & Ideas</strong>
                        <p>Proposed actions that require team agreement</p>
                      </div>
                    </div>
                    <div className="category-guide-card guide-unresolved">
                      <span className="category-dot amber" />
                      <div>
                        <strong>Unresolved Questions</strong>
                        <p>Open questions needing owner or deadline clarification</p>
                      </div>
                    </div>
                  </div>

                  <div className="saas-empty-state">
                    <div className="empty-state-icon-box" style={{ backgroundColor: 'var(--bg-pale-mint)', color: 'var(--color-green)' }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 11 12 14 22 4" />
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                      </svg>
                    </div>
                    <h3 className="empty-state-title">No Action Items Extracted Yet</h3>
                    <p className="empty-state-desc">
                      Add a meeting transcript to extract tasks, assign owners, verify deadlines, and approve execution.
                    </p>
                    <button
                      type="button"
                      className="saas-btn saas-btn-primary saas-btn-sm"
                      style={{ marginTop: '1rem' }}
                      onClick={() => setActiveTab('meetings')}
                    >
                      Add Meeting Transcript
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: FOLLOW-UPS */}
          {activeTab === 'followups' && (
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
                    <h2 className="panel-title">Follow-up Tracking</h2>
                    <p className="panel-subtitle">Monitor pending questions, unassigned tasks, and upcoming due dates</p>
                  </div>
                </div>
                <div className="panel-card-body">
                  <div className="saas-empty-state">
                    <div className="empty-state-icon-box" style={{ backgroundColor: 'var(--bg-pale-amber)', color: 'var(--color-amber)' }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 14 14" />
                      </svg>
                    </div>
                    <h3 className="empty-state-title">No Pending Follow-ups</h3>
                    <p className="empty-state-desc">
                      Items requiring clarification, missing owners, or upcoming deadlines will appear here to ensure accountability.
                    </p>
                    <button
                      type="button"
                      className="saas-btn saas-btn-primary saas-btn-sm"
                      style={{ marginTop: '1rem' }}
                      onClick={() => setActiveTab('meetings')}
                    >
                      Go to Meetings Workspace
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

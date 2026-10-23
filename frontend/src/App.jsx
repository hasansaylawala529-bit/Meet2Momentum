import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import TranscriptWorkspace from './components/TranscriptWorkspace';
import MeetingHistory from './components/MeetingHistory';
import {
  checkBackendHealth,
  fetchMeetings,
  fetchDecisions,
  fetchActionItems,
  extractMeetingOutcomes,
} from './services/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [isConnected, setIsConnected] = useState(false);
  const [isCheckingHealth, setIsCheckingHealth] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Core Data States
  const [meetings, setMeetings] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [actionItems, setActionItems] = useState([]);

  // Loading States
  const [isLoadingMeetings, setIsLoadingMeetings] = useState(false);
  const [isLoadingOutcomes, setIsLoadingOutcomes] = useState(false);
  const [meetingsError, setMeetingsError] = useState('');

  // Processing & Feedback States
  const [processingMeetingId, setProcessingMeetingId] = useState(null);
  const [extractionErrors, setExtractionErrors] = useState({});
  const [globalNotice, setGlobalNotice] = useState(null);
  const [activeActionCategory, setActiveActionCategory] = useState('all');

  // Fast meeting lookup map
  const meetingMap = useMemo(() => {
    return new Map(meetings.map((m) => [m.meeting_id, m]));
  }, [meetings]);

  // Aggregate extraction stats per meeting
  const processedMeetingStats = useMemo(() => {
    const stats = {};
    for (const d of decisions) {
      if (!stats[d.meeting_id]) {
        stats[d.meeting_id] = { decisions: 0, commitments: 0, suggestions: 0, unresolved: 0 };
      }
      stats[d.meeting_id].decisions += 1;
    }
    for (const a of actionItems) {
      if (!stats[a.meeting_id]) {
        stats[a.meeting_id] = { decisions: 0, commitments: 0, suggestions: 0, unresolved: 0 };
      }
      if (a.category === 'commitment') stats[a.meeting_id].commitments += 1;
      else if (a.category === 'suggestion') stats[a.meeting_id].suggestions += 1;
      else if (a.category === 'unresolved_question') stats[a.meeting_id].unresolved += 1;
    }
    return stats;
  }, [decisions, actionItems]);

  // Backend sync functions
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

  const loadOutcomesData = useCallback(async () => {
    setIsLoadingOutcomes(true);
    try {
      const [decisionsData, actionsData] = await Promise.all([
        fetchDecisions(),
        fetchActionItems(),
      ]);
      setDecisions(decisionsData);
      setActionItems(actionsData);
    } catch (err) {
      console.error('Failed to load meeting outcomes:', err);
    } finally {
      setIsLoadingOutcomes(false);
    }
  }, []);

  useEffect(() => {
    checkBackendHealth()
      .then(() => {
        setIsConnected(true);
        loadMeetingsData();
        loadOutcomesData();
      })
      .catch(() => {
        setIsConnected(false);
        setIsCheckingHealth(false);
      });
  }, [loadMeetingsData, loadOutcomesData]);

  const handleMeetingSaved = (newMeeting) => {
    setMeetings((prev) => [newMeeting, ...prev]);
  };

  // AI Meeting Intelligence Extraction Handler
  const handleProcessMeeting = async (meeting) => {
    setProcessingMeetingId(meeting.meeting_id);
    setExtractionErrors((prev) => {
      const copy = { ...prev };
      delete copy[meeting.meeting_id];
      return copy;
    });
    setGlobalNotice(null);

    try {
      const result = await extractMeetingOutcomes(meeting.meeting_id);
      // Reload outcomes and meetings from backend SQLite database
      await Promise.all([loadMeetingsData(), loadOutcomesData()]);

      setGlobalNotice({
        type: 'success',
        message: `Extracted ${result.total_decisions} decisions and ${result.total_action_items} action items (${result.commitments_count} confirmed commitments) from "${meeting.title}". AI proposes. Humans approve.`,
      });
    } catch (err) {
      const msg = err.message || 'AI extraction failed.';
      setExtractionErrors((prev) => ({
        ...prev,
        [meeting.meeting_id]: msg,
      }));
      setGlobalNotice({
        type: 'error',
        message: `Extraction failed for "${meeting.title}": ${msg}`,
      });
    } finally {
      setProcessingMeetingId(null);
    }
  };

  // Filtered Action Items
  const filteredActionItems = useMemo(() => {
    if (activeActionCategory === 'all') return actionItems;
    return actionItems.filter((i) => i.category === activeActionCategory);
  }, [actionItems, activeActionCategory]);

  // Derived counts for overview metrics
  const confirmedCommitmentsCount = useMemo(() => {
    return actionItems.filter((i) => i.category === 'commitment').length;
  }, [actionItems]);

  const followUpsList = useMemo(() => {
    return actionItems.filter(
      (i) => i.category === 'unresolved_question' || i.clarification_required
    );
  }, [actionItems]);

  return (
    <div className="saas-app-layout">
      {/* Colorful Light Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        meetingCount={meetings.length}
        decisionCount={decisions.length}
        actionCount={actionItems.length}
        followupCount={followUpsList.length}
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
          {/* Global Notification Banner */}
          {globalNotice && (
            <div className={`global-notice-bar ${globalNotice.type}`} role="status">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                {globalNotice.type === 'success' ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                )}
                <span>{globalNotice.message}</span>
              </div>
              <button
                type="button"
                className="notice-dismiss-btn"
                onClick={() => setGlobalNotice(null)}
                title="Dismiss message"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )}

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
                  <div className="metric-value">{decisions.length}</div>
                  <div className="metric-footer">{decisions.length > 0 ? 'Extracted from transcripts' : 'Awaiting meeting processing'}</div>
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
                  <div className="metric-value">{confirmedCommitmentsCount}</div>
                  <div className="metric-footer">{confirmedCommitmentsCount > 0 ? 'Explicit agreements tracked' : 'Awaiting meeting processing'}</div>
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
                  <div className="metric-value">{followUpsList.length}</div>
                  <div className="metric-footer">{followUpsList.length > 0 ? 'Requires owner or date confirmation' : 'No unresolved items'}</div>
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
                            <th>AI Outcomes</th>
                            <th>Date Added</th>
                          </tr>
                        </thead>
                        <tbody>
                          {meetings.slice(0, 5).map((m) => {
                            const stats = processedMeetingStats[m.meeting_id];
                            return (
                              <tr key={m.meeting_id}>
                                <td style={{ fontWeight: 600, color: 'var(--text-main)' }}>{m.title}</td>
                                <td><code className="id-code-pill">{m.meeting_id}</code></td>
                                <td>{m.meeting_date || '—'}</td>
                                <td>
                                  {stats ? (
                                    <span className="badge-category commitment" style={{ textTransform: 'none' }}>
                                      ✓ {stats.decisions} dec, {stats.commitments} com
                                    </span>
                                  ) : (
                                    <span className="status-badge-recorded">Ready to extract</span>
                                  )}
                                </td>
                                <td>{new Date(m.created_at).toLocaleDateString()}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Workflow Banner */}
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
                    <div className="step-sublabel">Gemini AI grounded extraction</div>
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
                onProcessMeeting={handleProcessMeeting}
                processingMeetingId={processingMeetingId}
                processedMeetingStats={processedMeetingStats}
                extractionErrors={extractionErrors}
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <h2 className="panel-title">Decisions Log</h2>
                      <span className="count-pill">{decisions.length}</span>
                    </div>
                    <p className="panel-subtitle">Agreed decisions supported by verbatim evidence from meeting transcripts</p>
                  </div>
                </div>

                <div className="panel-card-body">
                  {decisions.length === 0 ? (
                    <div className="saas-empty-state">
                      <div className="empty-state-icon-box" style={{ backgroundColor: 'var(--bg-pale-lavender)', color: 'var(--color-lavender)' }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                      </div>
                      <h3 className="empty-state-title">No Decisions Extracted Yet</h3>
                      <p className="empty-state-desc">
                        Select a saved meeting in the Meetings Workspace and click "Process with AI" to extract confirmed decisions with exact transcript citations.
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
                  ) : (
                    <div className="outcomes-stream">
                      {decisions.map((dec) => {
                        const meeting = meetingMap.get(dec.meeting_id);
                        return (
                          <div key={dec.decision_id} className="outcome-card card-decision">
                            <div className="outcome-card-header">
                              <div className="outcome-card-title-group">
                                <h3 className="outcome-title">{dec.title}</h3>
                                <div className="outcome-meeting-ref">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                  </svg>
                                  <span>From: <strong>{meeting ? meeting.title : dec.meeting_id}</strong></span>
                                  {meeting?.meeting_date && <span>• {meeting.meeting_date}</span>}
                                </div>
                              </div>
                              <div className="outcome-meta-badges">
                                {dec.evidence_verified ? (
                                  <span className="evidence-badge verified" title="Evidence matched verbatim in original transcript">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    <span>Grounded in Transcript</span>
                                  </span>
                                ) : (
                                  <span className="evidence-badge unverified" title="Evidence excerpt could not be directly verified">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <circle cx="12" cy="12" r="10" />
                                      <line x1="12" y1="8" x2="12" y2="12" />
                                    </svg>
                                    <span>Evidence Unverified</span>
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Rationale if present */}
                            {dec.rationale && (
                              <div className="outcome-rationale-box">
                                <strong>Supporting Rationale:</strong> {dec.rationale}
                              </div>
                            )}

                            {/* Quoted Verbatim Evidence Excerpt */}
                            {dec.source_text && (
                              <div className="evidence-quote-box">
                                <div className="evidence-header">
                                  <span>Transcript Evidence</span>
                                  <span>DEC ID: {dec.decision_id}</span>
                                </div>
                                <blockquote className="evidence-quote-text">
                                  "{dec.source_text}"
                                </blockquote>
                              </div>
                            )}

                            <div className="outcome-card-footer">
                              <span>Recorded {new Date(dec.created_at).toLocaleDateString()}</span>
                              <span>Decision ID: {dec.decision_id}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <h2 className="panel-title">Action Items & Commitments</h2>
                      <span className="count-pill">{actionItems.length}</span>
                    </div>
                    <p className="panel-subtitle">Categorized outcomes: confirmed commitments, suggestions, and unresolved questions</p>
                  </div>
                </div>

                <div className="panel-card-body">
                  {/* Category Guide Cards */}
                  <div className="categories-guide-grid">
                    <div className="category-guide-card guide-commitment">
                      <span className="category-dot green" />
                      <div>
                        <strong>Confirmed Commitments</strong>
                        <p>Explicit undertakings and agreed responsibilities</p>
                      </div>
                    </div>
                    <div className="category-guide-card guide-suggestion">
                      <span className="category-dot peach" />
                      <div>
                        <strong>Suggestions & Ideas</strong>
                        <p>Exploratory proposals requiring team agreement</p>
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

                  {/* Filter Toolbar */}
                  <div className="filter-toolbar">
                    <div className="filter-pills-cluster">
                      <button
                        type="button"
                        className={`filter-pill ${activeActionCategory === 'all' ? 'active' : ''}`}
                        onClick={() => setActiveActionCategory('all')}
                      >
                        All Items ({actionItems.length})
                      </button>
                      <button
                        type="button"
                        className={`filter-pill ${activeActionCategory === 'commitment' ? 'active theme-green' : ''}`}
                        onClick={() => setActiveActionCategory('commitment')}
                      >
                        Commitments ({actionItems.filter((i) => i.category === 'commitment').length})
                      </button>
                      <button
                        type="button"
                        className={`filter-pill ${activeActionCategory === 'suggestion' ? 'active theme-peach' : ''}`}
                        onClick={() => setActiveActionCategory('suggestion')}
                      >
                        Suggestions ({actionItems.filter((i) => i.category === 'suggestion').length})
                      </button>
                      <button
                        type="button"
                        className={`filter-pill ${activeActionCategory === 'unresolved_question' ? 'active theme-amber' : ''}`}
                        onClick={() => setActiveActionCategory('unresolved_question')}
                      >
                        Unresolved Questions ({actionItems.filter((i) => i.category === 'unresolved_question').length})
                      </button>
                    </div>

                    <div style={{ fontSize: '0.775rem', color: 'var(--text-secondary)' }}>
                      Core Principle: <em>AI proposes. Humans approve.</em>
                    </div>
                  </div>

                  {filteredActionItems.length === 0 ? (
                    <div className="saas-empty-state">
                      <div className="empty-state-icon-box" style={{ backgroundColor: 'var(--bg-pale-mint)', color: 'var(--color-green)' }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 11 12 14 22 4" />
                          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                        </svg>
                      </div>
                      <h3 className="empty-state-title">No Items Match This Category</h3>
                      <p className="empty-state-desc">
                        {actionItems.length === 0
                          ? 'Add a meeting transcript and click "Process with AI" to extract categorized action items.'
                          : 'No action items currently fit the selected filter.'}
                      </p>
                      {actionItems.length === 0 && (
                        <button
                          type="button"
                          className="saas-btn saas-btn-primary saas-btn-sm"
                          style={{ marginTop: '1rem' }}
                          onClick={() => setActiveTab('meetings')}
                        >
                          Add Meeting Transcript
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="outcomes-stream">
                      {filteredActionItems.map((item) => {
                        const meeting = meetingMap.get(item.meeting_id);
                        const cardThemeClass =
                          item.category === 'commitment'
                            ? 'card-commitment'
                            : item.category === 'suggestion'
                            ? 'card-suggestion'
                            : 'card-unresolved';

                        return (
                          <div key={item.task_id} className={`outcome-card ${cardThemeClass}`}>
                            <div className="outcome-card-header">
                              <div className="outcome-card-title-group">
                                <h3 className="outcome-title">{item.title}</h3>
                                <div className="outcome-meeting-ref">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                  </svg>
                                  <span>From: <strong>{meeting ? meeting.title : item.meeting_id}</strong></span>
                                  {meeting?.meeting_date && <span>• {meeting.meeting_date}</span>}
                                </div>
                              </div>

                              <div className="outcome-meta-badges">
                                {item.category === 'commitment' && (
                                  <span className="badge-category commitment">✓ Confirmed Commitment</span>
                                )}
                                {item.category === 'suggestion' && (
                                  <span className="badge-category suggestion">💡 Suggestion</span>
                                )}
                                {item.category === 'unresolved_question' && (
                                  <span className="badge-category unresolved">❓ Unresolved Question</span>
                                )}
                                <span className="badge-approval" title="Awaiting human review in Phase 4">
                                  ⏳ Pending Approval
                                </span>
                              </div>
                            </div>

                            {/* Optional detailed description if distinct from title */}
                            {item.description && item.description.trim() !== item.title.trim() && (
                              <p className="outcome-desc-text">{item.description}</p>
                            )}

                            {/* Attributes: Owner and Deadline */}
                            <div className="outcome-attributes-row">
                              {item.owner ? (
                                <span className="attribute-tag" title="Assigned owner from conversation">
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                    <circle cx="12" cy="7" r="4" />
                                  </svg>
                                  <span>Owner: <strong>{item.owner}</strong></span>
                                </span>
                              ) : (
                                <span className="attribute-tag missing" title="Owner is not explicitly specified in the transcript">
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="12" y1="8" x2="12" y2="12" />
                                    <line x1="12" y1="16" x2="12.01" y2="16" />
                                  </svg>
                                  <span>Owner needed</span>
                                </span>
                              )}

                              {item.due_date ? (
                                <span className="attribute-tag" title="Extracted timeframe or deadline">
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                    <line x1="16" y1="2" x2="16" y2="6" />
                                    <line x1="8" y1="2" x2="8" y2="6" />
                                    <line x1="3" y1="10" x2="21" y2="10" />
                                  </svg>
                                  <span>Deadline: <strong>{item.due_date}</strong></span>
                                </span>
                              ) : (
                                <span className="attribute-tag missing" title="Deadline is not explicitly specified in the transcript">
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="12" y1="8" x2="12" y2="12" />
                                    <line x1="12" y1="16" x2="12.01" y2="16" />
                                  </svg>
                                  <span>Deadline needed</span>
                                </span>
                              )}
                            </div>

                            {/* Clarification Warning Banner */}
                            {item.clarification_required && (
                              <div className="clarification-banner">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="12" cy="12" r="10" />
                                  <line x1="12" y1="8" x2="12" y2="12" />
                                  <line x1="12" y1="16" x2="12.01" y2="16" />
                                </svg>
                                <div>
                                  <strong>Clarification Needed:</strong> {item.clarification_note || 'Missing assigned owner or explicit deadline requires human confirmation.'}
                                </div>
                              </div>
                            )}

                            {/* Transcript Evidence Quote Box */}
                            {item.source_text && (
                              <div className="evidence-quote-box">
                                <div className="evidence-header">
                                  <span>Transcript Evidence</span>
                                  {item.evidence_verified ? (
                                    <span className="evidence-badge verified">
                                      ✓ Grounded in Transcript
                                    </span>
                                  ) : (
                                    <span className="evidence-badge unverified">
                                      ⚠ Evidence Unverified
                                    </span>
                                  )}
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
                      <button
                        type="button"
                        className="saas-btn saas-btn-primary saas-btn-sm"
                        style={{ marginTop: '1rem' }}
                        onClick={() => setActiveTab('meetings')}
                      >
                        Go to Meetings Workspace
                      </button>
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
          )}
        </main>
      </div>
    </div>
  );
}

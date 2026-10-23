import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Button, StatusChip, Modal, EmptyState } from '../components/common';
import { createMeeting } from '../services/api';

const SAMPLES = [
  {
    title: 'Product Sprint Planning',
    date: '2026-10-23',
    transcript: `Project meeting: October 23

Riya will complete the login page by October 25.
Aman will finish API integration by October 27.
We should consider adding dark mode next week.
We still need to decide who will test the application.
Riya will complete the login page by October 25.`,
  },
  {
    title: 'Architecture & Database Review',
    date: '2026-10-24',
    transcript: `Product Architecture Review: October 24

Vikram agreed to benchmark database query response times by Monday.
Neha proposed exploring Redis for caching if query times exceed 100ms.
Question remaining: Do we need multi-tenant database support for Phase 1?
Decision confirmed: Single database with strict foreign keys.`,
  },
  {
    title: 'Sprint Alignment & Pipeline Review',
    date: '2026-10-25',
    transcript: `Sprint Alignment Meeting: October 25
Discussion on Q4 deliverables and pipeline tasks:

Riya agreed to configure the authentication service for staging by Wednesday 5pm.
Aman stated he will configure the authentication service for staging by Wednesday 5pm.
Vikram confirmed he will configure the authentication service for staging by Friday.
Riya agreed to configure the authentication service for staging by Wednesday 5pm.
Follow up with the infrastructure team next week.
Someone needs to update the staging SSL certificates.`,
  },
];

/**
 * Meetings Workspace:
 * - Searchable Table (title, date, outcome counts, status, last extracted) with muted ID
 * - Split-Pane Detail View (transcript left, outcomes right) with quote highlighting & auto-scroll
 * - Re-extraction confirmation dialog
 * - Upload, direct paste, and demo presets working smoothly
 */
export default function Meetings({
  meetings = [],
  decisions = [],
  actionItems = [],
  isLoadingMeetings = false,
  meetingsError = '',
  processingMeetingId = null,
  extractionErrors = {},
  processedMeetingStats = {},
  onMeetingSaved,
  onProcessMeeting,
  onRefreshMeetings,
  onNavigate,
}) {
  // Navigation / View state
  const [selectedMeetingId, setSelectedMeetingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Detail View Split-Pane State
  const [selectedOutcomeId, setSelectedOutcomeId] = useState(null);
  const [selectedOutcomeQuote, setSelectedOutcomeQuote] = useState('');
  const [detailOutcomeFilter, setDetailOutcomeFilter] = useState('all');
  const transcriptScrollRef = useRef(null);
  const highlightRef = useRef(null);

  // Ingestion Modal State
  const [isAddMeetingOpen, setIsAddMeetingOpen] = useState(false);
  const [addTitle, setAddTitle] = useState('');
  const [addDate, setAddDate] = useState('');
  const [addTranscript, setAddTranscript] = useState('');
  const [fileName, setFileName] = useState('');
  const [isSavingMeeting, setIsSavingMeeting] = useState(false);
  const [validationError, setValidationError] = useState('');

  // Re-extract Confirmation Dialog State
  const [confirmReextractMeeting, setConfirmReextractMeeting] = useState(null);

  // Find currently active meeting object
  const activeMeeting = useMemo(() => {
    if (!selectedMeetingId) return null;
    return meetings.find((m) => m.meeting_id === selectedMeetingId) || null;
  }, [selectedMeetingId, meetings]);

  // Filtered meetings list for table
  const filteredMeetings = useMemo(() => {
    if (!searchQuery.trim()) return meetings;
    const query = searchQuery.toLowerCase().trim();
    return meetings.filter(
      (m) =>
        (m.title && m.title.toLowerCase().includes(query)) ||
        (m.meeting_date && m.meeting_date.toLowerCase().includes(query)) ||
        (m.meeting_id && m.meeting_id.toLowerCase().includes(query))
    );
  }, [meetings, searchQuery]);

  // Extracted outcomes for active meeting
  const activeMeetingOutcomes = useMemo(() => {
    if (!activeMeeting) return [];
    const meetingDecisions = decisions
      .filter((d) => d.meeting_id === activeMeeting.meeting_id)
      .map((d) => ({
        id: d.decision_id,
        type: 'decision',
        categoryLabel: 'Decision',
        title: d.title,
        detail: d.rationale,
        source_text: d.source_text,
        verified: d.evidence_verified,
        created_at: d.created_at,
      }));

    const meetingActions = actionItems
      .filter((a) => a.meeting_id === activeMeeting.meeting_id)
      .map((a) => ({
        id: a.task_id,
        type: a.category || 'action',
        categoryLabel:
          a.category === 'commitment'
            ? 'Commitment'
            : a.category === 'suggestion'
            ? 'Suggestion'
            : a.category === 'unresolved_question'
            ? 'Open Question'
            : 'Action Item',
        title: a.title,
        detail: a.description,
        owner: a.owner,
        due_date: a.due_date,
        approval_status: a.approval_status,
        source_text: a.source_text,
        verified: a.evidence_verified,
        created_at: a.created_at,
      }));

    return [...meetingDecisions, ...meetingActions];
  }, [activeMeeting, decisions, actionItems]);

  // Filtered outcomes in detail pane
  const filteredDetailOutcomes = useMemo(() => {
    if (detailOutcomeFilter === 'all') return activeMeetingOutcomes;
    if (detailOutcomeFilter === 'decisions')
      return activeMeetingOutcomes.filter((o) => o.type === 'decision');
    if (detailOutcomeFilter === 'commitments')
      return activeMeetingOutcomes.filter((o) => o.type === 'commitment');
    if (detailOutcomeFilter === 'suggestions')
      return activeMeetingOutcomes.filter((o) => o.type === 'suggestion');
    if (detailOutcomeFilter === 'questions')
      return activeMeetingOutcomes.filter((o) => o.type === 'unresolved_question');
    return activeMeetingOutcomes;
  }, [activeMeetingOutcomes, detailOutcomeFilter]);

  // Highlight and auto-scroll when outcome is selected
  const handleSelectOutcome = (outcome) => {
    setSelectedOutcomeId(outcome.id);
    setSelectedOutcomeQuote(outcome.source_text || '');
  };

  useEffect(() => {
    if (highlightRef.current && transcriptScrollRef.current) {
      highlightRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [selectedOutcomeId, selectedOutcomeQuote]);

  // Ingestion Handlers
  const handleSelectSamplePreset = (sample) => {
    setAddTitle(sample.title);
    setAddDate(sample.date);
    setAddTranscript(sample.transcript);
    setFileName('');
    setValidationError('');
  };

  const handleFileUpload = (e) => {
    setValidationError('');
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.txt')) {
      setValidationError('Please select a plain text (.txt) file.');
      e.target.value = '';
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setValidationError('File size exceeds the 2MB limit.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      if (!text || !text.trim()) {
        setValidationError(`The uploaded file "${file.name}" is empty.`);
        return;
      }
      setAddTranscript(text);
      setFileName(file.name);
      if (!addTitle) {
        setAddTitle(file.name.replace(/\.txt$/i, '').replace(/[_-]/g, ' '));
      }
    };
    reader.onerror = () => {
      setValidationError('Unable to read selected file.');
    };
    reader.readAsText(file);
  };

  const handleSaveNewMeeting = async (e) => {
    e?.preventDefault();
    if (!addTitle.trim()) {
      setValidationError('Please enter a meeting title.');
      return;
    }
    if (!addTranscript.trim()) {
      setValidationError('Please enter or upload transcript text.');
      return;
    }

    setIsSavingMeeting(true);
    setValidationError('');
    try {
      const saved = await createMeeting({
        title: addTitle.trim(),
        transcript: addTranscript.trim(),
        meetingDate: addDate ? addDate.trim() : null,
      });

      if (onMeetingSaved) onMeetingSaved(saved);
      setIsAddMeetingOpen(false);
      setAddTitle('');
      setAddDate('');
      setAddTranscript('');
      setFileName('');
      // Select the newly created meeting
      setSelectedMeetingId(saved.meeting_id);
    } catch (err) {
      setValidationError(err.message || 'Failed to save meeting.');
    } finally {
      setIsSavingMeeting(false);
    }
  };

  // Re-extract Handlers
  const handleTriggerExtract = (meeting, e) => {
    e?.stopPropagation();
    const stats = processedMeetingStats[meeting.meeting_id];
    const hasOutcomes = stats && (stats.decisions > 0 || stats.commitments > 0);

    if (hasOutcomes) {
      setConfirmReextractMeeting(meeting);
    } else {
      if (onProcessMeeting) onProcessMeeting(meeting);
    }
  };

  const handleConfirmReextract = async () => {
    const meeting = confirmReextractMeeting;
    setConfirmReextractMeeting(null);
    if (meeting && onProcessMeeting) {
      await onProcessMeeting(meeting);
    }
  };

  // Render Transcript with Highlight
  const renderHighlightedTranscript = (transcriptText, quote) => {
    if (!transcriptText) return 'No transcript text available.';
    if (!quote || !quote.trim()) return transcriptText;

    const trimmedQuote = quote.trim();
    const index = transcriptText.indexOf(trimmedQuote);
    if (index === -1) {
      return transcriptText;
    }

    const before = transcriptText.slice(0, index);
    const match = transcriptText.slice(index, index + trimmedQuote.length);
    const after = transcriptText.slice(index + trimmedQuote.length);

    return (
      <>
        {before}
        <mark
          ref={highlightRef}
          className="transcript-evidence-mark"
          id="highlighted-evidence-quote"
        >
          {match}
        </mark>
        {after}
      </>
    );
  };

  return (
    <div className="meetings-page-container">
      {/* ============================================================== */}
      {/* VIEW MODE 1: SPLIT-PANE DETAIL VIEW                           */}
      {/* ============================================================== */}
      {activeMeeting ? (
        <div className="meeting-detail-container">
          {/* Detail Nav Bar */}
          <div className="meeting-detail-nav-bar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setSelectedMeetingId(null);
                  setSelectedOutcomeId(null);
                  setSelectedOutcomeQuote('');
                }}
              >
                &larr; Back to meetings
              </Button>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <h2 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0, color: 'var(--text-main)' }}>
                    {activeMeeting.title}
                  </h2>
                  <span className="meeting-id-muted">#{activeMeeting.meeting_id}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginTop: '0.15rem' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    {activeMeeting.meeting_date ? `Date: ${activeMeeting.meeting_date}` : 'No date specified'}
                  </span>
                  <span>•</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    Added {new Date(activeMeeting.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Button
                size="sm"
                variant={activeMeetingOutcomes.length > 0 ? 'secondary' : 'primary'}
                onClick={(e) => handleTriggerExtract(activeMeeting, e)}
                disabled={processingMeetingId === activeMeeting.meeting_id}
                loading={processingMeetingId === activeMeeting.meeting_id}
              >
                {processingMeetingId === activeMeeting.meeting_id
                  ? 'Extracting with AI...'
                  : activeMeetingOutcomes.length > 0
                  ? 'Re-extract Outcomes'
                  : 'Process with AI'}
              </Button>
            </div>
          </div>

          {/* Split Pane: Transcript Left | Extracted Outcomes Right */}
          <div className="split-pane-grid">
            {/* LEFT PANE: Transcript */}
            <div className="transcript-pane-card">
              <div className="pane-header-bar">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <h3 className="pane-title">Transcript Text</h3>
                  <span className="count-pill">
                    {activeMeeting.transcript ? activeMeeting.transcript.length : 0} chars
                  </span>
                </div>
                {selectedOutcomeQuote && (
                  <span style={{ fontSize: '11px', color: 'var(--accent-blue)', fontWeight: 500 }}>
                    Evidence quote highlighted
                  </span>
                )}
              </div>

              <div className="transcript-content-scroll" ref={transcriptScrollRef}>
                {renderHighlightedTranscript(activeMeeting.transcript, selectedOutcomeQuote)}
              </div>
            </div>

            {/* RIGHT PANE: Extracted Outcomes */}
            <div className="outcomes-pane-card">
              <div className="pane-header-bar">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <h3 className="pane-title">Extracted Outcomes</h3>
                  <span className="count-pill">{filteredDetailOutcomes.length}</span>
                </div>

                {/* Outcome Category Filters */}
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <button
                    type="button"
                    className={`filter-pill-btn ${detailOutcomeFilter === 'all' ? 'active' : ''}`}
                    style={{ fontSize: '11px', padding: '0.2rem 0.5rem' }}
                    onClick={() => setDetailOutcomeFilter('all')}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className={`filter-pill-btn ${detailOutcomeFilter === 'decisions' ? 'active' : ''}`}
                    style={{ fontSize: '11px', padding: '0.2rem 0.5rem' }}
                    onClick={() => setDetailOutcomeFilter('decisions')}
                  >
                    Decisions
                  </button>
                  <button
                    type="button"
                    className={`filter-pill-btn ${detailOutcomeFilter === 'commitments' ? 'active' : ''}`}
                    style={{ fontSize: '11px', padding: '0.2rem 0.5rem' }}
                    onClick={() => setDetailOutcomeFilter('commitments')}
                  >
                    Commitments
                  </button>
                </div>
              </div>

              <div className="outcomes-list-scroll">
                {activeMeetingOutcomes.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--text-muted)' }}>
                    <p style={{ fontWeight: 600, fontSize: 'var(--font-size-13)', color: 'var(--text-main)', margin: '0 0 0.35rem 0' }}>
                      No outcomes extracted yet
                    </p>
                    <p style={{ fontSize: 'var(--font-size-12)', margin: '0 0 1rem 0' }}>
                      Click "Process with AI" to extract decisions and commitments from this transcript.
                    </p>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={(e) => handleTriggerExtract(activeMeeting, e)}
                      loading={processingMeetingId === activeMeeting.meeting_id}
                    >
                      Process with AI
                    </Button>
                  </div>
                ) : filteredDetailOutcomes.length === 0 ? (
                  <p className="compact-empty-line">No outcomes match the selected category filter.</p>
                ) : (
                  filteredDetailOutcomes.map((outcome) => {
                    const isSelected = selectedOutcomeId === outcome.id;

                    return (
                      <div
                        key={outcome.id}
                        className={`outcome-interactive-card ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleSelectOutcome(outcome)}
                        title="Click to scroll & highlight evidence in transcript"
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                          <span
                            className={`badge-category ${outcome.type}`}
                            style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}
                          >
                            {outcome.categoryLabel}
                          </span>
                          {outcome.owner && (
                            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-main)' }}>
                              👤 {outcome.owner}
                            </span>
                          )}
                          {outcome.due_date && (
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                              📅 {outcome.due_date}
                            </span>
                          )}
                        </div>

                        <div style={{ fontWeight: 600, fontSize: 'var(--font-size-13)', color: 'var(--text-main)', marginBottom: '0.2rem' }}>
                          {outcome.title}
                        </div>

                        {outcome.detail && outcome.detail !== outcome.title && (
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                            {outcome.detail}
                          </div>
                        )}

                        {outcome.source_text && (
                          <div className="outcome-interactive-quote">
                            "{outcome.source_text}"
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ============================================================== */
        /* VIEW MODE 2: SEARCHABLE MEETINGS TABLE                         */
        /* ============================================================== */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {/* Header & Search Toolbar */}
          <div className="meetings-header-toolbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0, color: 'var(--text-main)' }}>
                Meetings
              </h2>
              <span className="count-pill">{meetings.length}</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flex: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {/* Search Bar */}
              <div className="meetings-search-box">
                <input
                  type="text"
                  className="activity-search-input"
                  placeholder="Search meetings by title, date..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ width: '100%', maxWidth: '280px' }}
                />
              </div>

              {/* Refresh Button */}
              {onRefreshMeetings && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={onRefreshMeetings}
                  disabled={isLoadingMeetings}
                  title="Refresh meetings from server"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className={isLoadingMeetings ? 'spin-animation' : ''}>
                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                  </svg>
                  <span>Refresh</span>
                </Button>
              )}

              {/* Primary Add Meeting Button */}
              <Button
                size="sm"
                variant="primary"
                onClick={() => setIsAddMeetingOpen(true)}
              >
                <span>+ Add Meeting</span>
              </Button>
            </div>
          </div>

          {/* Table Card */}
          <div className="meetings-table-card">
            {isLoadingMeetings && meetings.length === 0 ? (
              <p className="compact-empty-line">Loading saved meetings...</p>
            ) : filteredMeetings.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--text-muted)' }}>
                <p style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)', margin: '0 0 0.35rem 0' }}>
                  {searchQuery ? 'No meetings match your search' : 'No meetings added yet'}
                </p>
                <p style={{ fontSize: '0.8rem', margin: '0 0 1rem 0' }}>
                  {searchQuery ? 'Try clearing your search query.' : 'Add your first transcript to start extracting outcomes.'}
                </p>
                {!searchQuery && (
                  <Button size="sm" variant="primary" onClick={() => setIsAddMeetingOpen(true)}>
                    + Add Meeting Transcript
                  </Button>
                )}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="clean-meetings-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Meeting Date</th>
                      <th>Outcome Counts</th>
                      <th>Status</th>
                      <th>Last Extracted / Added</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMeetings.map((m) => {
                      const stats = processedMeetingStats[m.meeting_id];
                      const isProcessing = processingMeetingId === m.meeting_id;
                      const hasExtracted = stats && (stats.decisions > 0 || stats.commitments > 0);

                      return (
                        <tr
                          key={m.meeting_id}
                          className="clickable"
                          onClick={() => setSelectedMeetingId(m.meeting_id)}
                          title={`Click to view transcript & outcomes • ID: ${m.meeting_id}`}
                        >
                          {/* Title with muted ID on hover */}
                          <td>
                            <div className="meeting-title-group">
                              <span className="meeting-title-text">{m.title}</span>
                              <span className="meeting-id-muted">#{m.meeting_id}</span>
                            </div>
                          </td>

                          {/* Date */}
                          <td>
                            <span style={{ fontSize: 'var(--font-size-12)', color: m.meeting_date ? 'var(--text-main)' : 'var(--text-muted)' }}>
                              {m.meeting_date || 'Add date'}
                            </span>
                          </td>

                          {/* Outcome Counts */}
                          <td>
                            {stats ? (
                              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                <span className="count-pill" style={{ color: 'var(--status-green)' }}>
                                  {stats.decisions} dec
                                </span>
                                <span className="count-pill" style={{ color: 'var(--accent-blue)' }}>
                                  {stats.commitments} comm
                                </span>
                                {stats.suggestions > 0 && (
                                  <span className="count-pill">{stats.suggestions} sugg</span>
                                )}
                              </div>
                            ) : (
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                0 outcomes
                              </span>
                            )}
                          </td>

                          {/* Status */}
                          <td>
                            <StatusChip
                              type="approval"
                              status={hasExtracted ? 'approved' : 'pending'}
                              label={hasExtracted ? 'Extracted' : 'Ready'}
                            />
                          </td>

                          {/* Timestamp */}
                          <td>
                            <span style={{ fontSize: 'var(--font-size-12)', color: 'var(--text-secondary)' }}>
                              {new Date(m.created_at).toLocaleDateString()}
                            </span>
                          </td>

                          {/* Actions */}
                          <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => setSelectedMeetingId(m.meeting_id)}
                                title="Open split pane detail view"
                              >
                                View
                              </Button>

                              <Button
                                size="sm"
                                variant={hasExtracted ? 'secondary' : 'primary'}
                                onClick={(e) => handleTriggerExtract(m, e)}
                                disabled={isProcessing}
                                loading={isProcessing}
                                title={hasExtracted ? 'Re-extract outcomes with AI' : 'Process with AI'}
                              >
                                {isProcessing
                                  ? '...'
                                  : hasExtracted
                                  ? 'Re-extract'
                                  : 'Extract'}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* ADD MEETING MODAL (PRESETS, UPLOAD, PASTE)                     */}
      {/* ============================================================== */}
      <Modal
        isOpen={isAddMeetingOpen}
        onClose={() => setIsAddMeetingOpen(false)}
        title="Add Meeting Transcript"
        maxWidth="640px"
        footer={
          <>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setIsAddMeetingOpen(false)}
              disabled={isSavingMeeting}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={handleSaveNewMeeting}
              loading={isSavingMeeting}
            >
              Save Meeting
            </Button>
          </>
        }
      >
        <form onSubmit={handleSaveNewMeeting} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {/* Preset Buttons */}
          <div>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Demo Presets (click to load)
            </span>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
              {SAMPLES.map((sample) => (
                <button
                  key={sample.title}
                  type="button"
                  className="filter-pill-btn"
                  style={{ fontSize: '11px', padding: '0.25rem 0.55rem' }}
                  onClick={() => handleSelectSamplePreset(sample)}
                >
                  ⚡ {sample.title}
                </button>
              ))}
            </div>
          </div>

          {/* Title & Date Inputs */}
          <div className="form-row-two-col" style={{ margin: 0 }}>
            <div>
              <label className="saas-label">
                Meeting Title <span className="label-required">*</span>
              </label>
              <input
                type="text"
                className="saas-input"
                placeholder="e.g. Q4 Sprint Planning"
                value={addTitle}
                onChange={(e) => setAddTitle(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="saas-label">
                Date <span className="label-optional">(optional)</span>
              </label>
              <input
                type="date"
                className="saas-input"
                value={addDate}
                onChange={(e) => setAddDate(e.target.value)}
              />
            </div>
          </div>

          {/* File Upload Selector */}
          <div>
            <label className="saas-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Upload Transcript (.txt)</span>
              {fileName && (
                <span style={{ fontSize: '11px', color: 'var(--accent-blue)', fontWeight: 500 }}>
                  Loaded: {fileName}
                </span>
              )}
            </label>
            <input
              type="file"
              accept=".txt"
              onChange={handleFileUpload}
              className="saas-input"
              style={{ padding: '0.35rem' }}
            />
          </div>

          {/* Transcript Textarea */}
          <div>
            <label className="saas-label">
              Transcript Text <span className="label-required">*</span>
            </label>
            <textarea
              className="saas-textarea"
              placeholder="Paste raw meeting notes or conversation transcript here..."
              value={addTranscript}
              onChange={(e) => setAddTranscript(e.target.value)}
              rows={6}
              style={{ minHeight: '130px', fontSize: 'var(--font-size-12)' }}
              required
            />
          </div>

          {validationError && (
            <div style={{ color: 'var(--status-red)', fontSize: 'var(--font-size-12)' }}>
              {validationError}
            </div>
          )}
        </form>
      </Modal>

      {/* ============================================================== */}
      {/* CONFIRM RE-EXTRACT DIALOG                                      */}
      {/* ============================================================== */}
      <Modal
        isOpen={Boolean(confirmReextractMeeting)}
        onClose={() => setConfirmReextractMeeting(null)}
        title="Confirm Re-extraction"
        maxWidth="460px"
        footer={
          <>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setConfirmReextractMeeting(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={handleConfirmReextract}
            >
              Proceed with Re-extract
            </Button>
          </>
        }
      >
        <div style={{ fontSize: 'var(--font-size-13)', color: 'var(--text-main)', lineHeight: 1.5 }}>
          <p style={{ margin: '0 0 0.5rem 0' }}>
            Are you sure you want to re-extract outcomes for{' '}
            <strong>"{confirmReextractMeeting?.title}"</strong>?
          </p>
          <div style={{ padding: '0.65rem 0.85rem', backgroundColor: 'var(--status-amber-bg)', border: '1px solid var(--status-amber-border)', borderRadius: 'var(--radius-sm)', color: 'var(--status-amber)' }}>
            ⚠️ <strong>Warning:</strong> Re-extracting will re-run AI outcome extraction and replace existing decisions and action items for this meeting. Any previous manual edits or approvals will be overwritten.
          </div>
        </div>
      </Modal>
    </div>
  );
}

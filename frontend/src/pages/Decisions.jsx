import React, { useState, useMemo } from 'react';
import { Button, StatusChip, Drawer, EmptyState } from '../components/common';

/**
 * Decisions Page:
 * - Compact data table (decision, truncated rationale, meeting, date)
 * - Verbatim transcript evidence via inline expandable rows AND a side drawer
 * - Decision ID shown ONCE, muted
 * - Jargon and redundant explainer headers removed
 */
export default function Decisions({
  decisions = [],
  meetingMap = new Map(),
  onNavigate,
}) {
  // Filtering & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [verificationFilter, setVerificationFilter] = useState('all');

  // Inline Row Expansion (Set of decision IDs)
  const [expandedIds, setExpandedIds] = useState(new Set());

  // Drawer Inspection State (decision object or null)
  const [drawerDecision, setDrawerDecision] = useState(null);

  // Filtered decisions list
  const filteredDecisions = useMemo(() => {
    return decisions.filter((dec) => {
      // Verification status filter
      if (verificationFilter === 'verified' && !dec.evidence_verified) return false;
      if (verificationFilter === 'unverified' && dec.evidence_verified) return false;

      // Text search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const meeting = meetingMap.get(dec.meeting_id);
        const titleMatch = dec.title && dec.title.toLowerCase().includes(q);
        const rationaleMatch = dec.rationale && dec.rationale.toLowerCase().includes(q);
        const meetingMatch = meeting && meeting.title && meeting.title.toLowerCase().includes(q);
        const idMatch = dec.decision_id && dec.decision_id.toLowerCase().includes(q);
        if (!titleMatch && !rationaleMatch && !meetingMatch && !idMatch) return false;
      }
      return true;
    });
  }, [decisions, verificationFilter, searchQuery, meetingMap]);

  // Toggle inline expansion for a single row
  const handleToggleExpand = (id, e) => {
    e?.stopPropagation();
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="decisions-page-container">
      {/* Toolbar */}
      <div className="decisions-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0, color: 'var(--text-main)' }}>
            Decisions
          </h2>
          <span className="count-pill">{filteredDecisions.length}</span>
        </div>

        <div className="decisions-filters-group">
          {/* Search Input */}
          <input
            type="text"
            className="activity-search-input"
            placeholder="Search decisions by title, rationale..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', maxWidth: '280px' }}
          />

          {/* Verification Dropdown */}
          <select
            className="activity-select-filter"
            value={verificationFilter}
            onChange={(e) => setVerificationFilter(e.target.value)}
          >
            <option value="all">All decisions</option>
            <option value="verified">Grounded in transcript</option>
            <option value="unverified">Unverified</option>
          </select>

          {(searchQuery || verificationFilter !== 'all') && (
            <button
              type="button"
              className="clean-text-link"
              style={{ fontSize: '11px', color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0.35rem' }}
              onClick={() => {
                setSearchQuery('');
                setVerificationFilter('all');
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Compact Table */}
      <div className="decisions-table-card">
        {filteredDecisions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3.5rem 1.5rem', color: 'var(--text-muted)' }}>
            <p style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)', margin: '0 0 0.35rem 0' }}>
              {searchQuery ? 'No decisions match your search' : 'No decisions recorded yet'}
            </p>
            <p style={{ fontSize: '0.8rem', margin: '0 0 1rem 0' }}>
              {searchQuery
                ? 'Try clearing your search filters.'
                : 'Process a meeting transcript in the Meetings Workspace to extract confirmed decisions.'}
            </p>
            {!searchQuery && onNavigate && (
              <Button size="sm" variant="primary" onClick={() => onNavigate('meetings')}>
                Go to Meetings Workspace
              </Button>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="clean-decisions-table">
              <thead>
                <tr>
                  <th style={{ width: '32px' }}></th>
                  <th>Decision</th>
                  <th>Rationale</th>
                  <th>Meeting</th>
                  <th>Date</th>
                  <th>Evidence</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDecisions.map((dec) => {
                  const meeting = meetingMap.get(dec.meeting_id);
                  const isExpanded = expandedIds.has(dec.decision_id);

                  return (
                    <React.Fragment key={dec.decision_id}>
                      <tr
                        style={{ cursor: 'pointer' }}
                        onClick={() => handleToggleExpand(dec.decision_id)}
                      >
                        {/* Expand Toggle Chevron */}
                        <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                          <span style={{ display: 'inline-block', transition: 'transform 0.15s ease', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>
                            ▶
                          </span>
                        </td>

                        {/* Decision Title & Once-Muted ID */}
                        <td>
                          <div className="decision-title-text">
                            {dec.title}
                          </div>
                          <span className="decision-id-muted">
                            #{dec.decision_id}
                          </span>
                        </td>

                        {/* Rationale Truncated */}
                        <td>
                          <div
                            className="decision-rationale-truncated"
                            title={dec.rationale || 'No supporting rationale'}
                          >
                            {dec.rationale || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                          </div>
                        </td>

                        {/* Source Meeting */}
                        <td>
                          <span style={{ fontSize: 'var(--font-size-12)', color: 'var(--text-main)', fontWeight: 500 }}>
                            {meeting ? meeting.title : dec.meeting_id}
                          </span>
                        </td>

                        {/* Created Date */}
                        <td>
                          <span style={{ fontSize: 'var(--font-size-12)', color: 'var(--text-secondary)' }}>
                            {new Date(dec.created_at).toLocaleDateString()}
                          </span>
                        </td>

                        {/* Evidence Status */}
                        <td>
                          {dec.evidence_verified ? (
                            <StatusChip
                              type="approval"
                              status="approved"
                              label="Grounded"
                            />
                          ) : (
                            <StatusChip
                              type="approval"
                              status="pending"
                              label="Unverified"
                            />
                          )}
                        </td>

                        {/* Actions */}
                        <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setDrawerDecision(dec)}
                            title="Inspect full verbatim evidence quote in drawer"
                          >
                            Inspect
                          </Button>
                        </td>
                      </tr>

                      {/* Inline Expanded Row */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={7} style={{ padding: '0.4rem 1rem 0.75rem 2rem', backgroundColor: 'var(--slate-50)' }}>
                            <div className="decision-expanded-box">
                              {dec.rationale && (
                                <p style={{ margin: '0 0 0.5rem 0', fontSize: 'var(--font-size-13)', color: 'var(--text-main)' }}>
                                  <strong>Supporting Rationale:</strong> {dec.rationale}
                                </p>
                              )}

                              {dec.source_text ? (
                                <div>
                                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    Verbatim Transcript Evidence Quote:
                                  </span>
                                  <blockquote className="evidence-quote-callout" style={{ marginTop: '0.25rem' }}>
                                    "{dec.source_text}"
                                  </blockquote>
                                </div>
                              ) : (
                                <span style={{ fontSize: 'var(--font-size-12)', color: 'var(--text-muted)' }}>
                                  No direct transcript citation attached.
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* EVIDENCE INSPECTION DRAWER */}
      <Drawer
        isOpen={Boolean(drawerDecision)}
        onClose={() => setDrawerDecision(null)}
        title="Decision Details & Evidence"
        width="480px"
      >
        {drawerDecision && (
          <div className="decision-drawer-content">
            {/* Header info */}
            <div>
              <span className="decision-id-muted" style={{ marginBottom: '0.35rem' }}>
                #{drawerDecision.decision_id}
              </span>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-main)', margin: '0.2rem 0 0.5rem 0' }}>
                {drawerDecision.title}
              </h3>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {drawerDecision.evidence_verified ? (
                  <StatusChip type="approval" status="approved" label="Grounded in Transcript" />
                ) : (
                  <StatusChip type="approval" status="pending" label="Evidence Unverified" />
                )}
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Recorded {new Date(drawerDecision.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Rationale */}
            <div>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Supporting Rationale
              </span>
              <p style={{ margin: '0.35rem 0 0 0', color: 'var(--text-main)', lineHeight: 1.5 }}>
                {drawerDecision.rationale || 'No supporting rationale recorded for this decision.'}
              </p>
            </div>

            {/* Verbatim Transcript Quote */}
            <div>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Verbatim Evidence Quote
              </span>
              {drawerDecision.source_text ? (
                <blockquote className="evidence-quote-callout" style={{ marginTop: '0.35rem' }}>
                  "{drawerDecision.source_text}"
                </blockquote>
              ) : (
                <p style={{ margin: '0.35rem 0 0 0', color: 'var(--text-muted)', fontSize: 'var(--font-size-12)' }}>
                  No verbatim quote available.
                </p>
              )}
            </div>

            {/* Source Meeting */}
            <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Source Meeting
              </span>
              <p style={{ margin: '0.25rem 0 0.5rem 0', fontWeight: 500, color: 'var(--text-main)' }}>
                {meetingMap.get(drawerDecision.meeting_id)?.title || drawerDecision.meeting_id}
              </p>
              {onNavigate && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setDrawerDecision(null);
                    onNavigate('meetings');
                  }}
                >
                  View in Meetings Workspace &rarr;
                </Button>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
